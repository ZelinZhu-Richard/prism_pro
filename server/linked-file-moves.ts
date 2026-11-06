import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DiskConflict,
  rowMark,
  sameDisk,
  type DiskMark,
  type DiskRow,
} from "./disk-files";
import { AppError, within } from "./files";
import type { Store } from "./store";
import type { ReferenceChange } from "./latex-references";
import {
  coversPath,
  projectFolders,
  type MovePreview,
} from "../shared/file-moves";

export type MoveParent = { path: string; identity: string };
type Move = {
  from: string;
  to: string;
  identity: string;
  temporary?: string;
  parent?: MoveParent;
  sourceParent?: MoveParent;
};
type Check = {
  from: string;
  to: string;
  before: DiskMark;
  after: DiskMark;
  reference: boolean;
};
type Plan = { version: 1; generation: number; moves: Move[]; checks: Check[] };
const spelling = (name: string) => name.normalize("NFC");
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const identity = (entry?: fs.BigIntStats) =>
  entry ? [entry.dev, entry.ino, entry.birthtimeNs].join(":") : undefined;

export class LinkedFileMoves {
  constructor(private store: Store) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS linked_file_moves(project TEXT PRIMARY KEY,payload TEXT NOT NULL)",
    );
  }

  private pending(id: string) {
    return this.store.db
      .prepare("SELECT payload FROM linked_file_moves WHERE project=?")
      .get(id) as { payload: string } | undefined;
  }

  hasPending(id: string) {
    return !!this.pending(id);
  }

  assertReady(id: string) {
    if (this.hasPending(id))
      throw new DiskConflict("Project", "a local folder move needs recovery");
  }

  private target(id: string, name: string) {
    return within(this.store.projectDir(id), name);
  }

  private stat(id: string, name: string) {
    try {
      return fs.lstatSync(this.target(id, name), {
        bigint: true,
        throwIfNoEntry: false,
      });
    } catch (error: any) {
      if (error.code === "ENOTDIR") return undefined;
      if (error instanceof DiskConflict) throw error;
      throw new DiskConflict(
        name,
        "the local move path cannot be inspected safely",
      );
    }
  }

  /** On case-insensitive volumes both spellings can resolve to the same entry. */
  private usesSpelling(id: string, name: string) {
    const target = this.target(id, name),
      basename = spelling(path.basename(target));
    const entries = fs.opendirSync(path.dirname(target));
    try {
      for (let i = 0; i < 10000; i++) {
        const entry = entries.readSync();
        if (!entry) return false;
        if (spelling(entry.name) === basename) return true;
      }
    } finally {
      entries.closeSync();
    }
    throw new DiskConflict(
      name,
      "too many sibling entries to verify the requested spelling",
    );
  }

  private destinationParent(id: string, name: string, indexed?: Set<string>) {
    let parent = path.posix.dirname(name);
    while (parent !== ".") {
      const entry = this.stat(id, parent);
      if (entry?.isDirectory())
        return { path: parent, identity: identity(entry)! };
      if (entry)
        throw new DiskConflict(
          parent,
          "the move needs a directory at this path",
        );
      if (indexed?.has(parent))
        throw new DiskConflict(
          parent,
          "the indexed move destination is missing",
        );
      parent = path.posix.dirname(parent);
    }
  }

  private assertMoveParent(id: string, parent?: MoveParent) {
    if (parent && identity(this.stat(id, parent.path)) !== parent.identity)
      throw new DiskConflict(
        parent.path,
        "the move destination folder was removed or replaced",
      );
  }

  private captureMoves(id: string, preview: MovePreview): Move[] {
    const indexedFolders = new Set(projectFolders(this.store.fileList(id)));
    return preview.moves.map(({ from, to }) => {
      const original = this.stat(id, from),
        destination = this.stat(id, to);
      if (!original?.isDirectory() && !original?.isFile())
        throw new DiskConflict(from, "the move source is unavailable");
      const tag = identity(original)!;
      const sameName =
        spelling(from).toLowerCase() === spelling(to).toLowerCase();
      if (
        sameName &&
        (path.posix.dirname(from) !== path.posix.dirname(to) ||
          spelling(from) === spelling(to))
      )
        throw new DiskConflict(
          to,
          "choose a distinct name in the folder's existing spelling",
        );
      if (
        destination &&
        (!sameName ||
          identity(destination) !== tag ||
          this.usesSpelling(id, to))
      )
        throw new DiskConflict(to, "the move destination is occupied");
      return {
        from,
        to,
        identity: tag,
        parent: this.destinationParent(id, to, indexedFolders),
        sourceParent: this.destinationParent(id, from, indexedFolders),
      };
    });
  }

  private token(id: string, preview: MovePreview, moves: Move[]) {
    return digest(JSON.stringify([id, preview.generation, moves]));
  }

  review(id: string, preview: MovePreview) {
    return this.token(id, preview, this.captureMoves(id, preview));
  }

  commit(
    id: string,
    preview: MovePreview,
    references: ReferenceChange[],
    mutate: (sourceParents: MoveParent[]) => void,
    review: { diskToken?: unknown; restoreParents?: MoveParent[] },
  ) {
    this.store.transaction(() => {
      this.store.assertDiskAvailable(id);
      if (this.store.requireProject(id).generation !== preview.generation)
        throw new DiskConflict("Project", "changed after the move review");
      for (const parent of review.restoreParents ?? [])
        this.assertMoveParent(id, parent);
      const captured = this.captureMoves(id, preview);
      if (
        review.diskToken !== undefined &&
        review.diskToken !== this.token(id, preview, captured)
      )
        throw new DiskConflict(
          "Project",
          "the move paths changed since review; refresh the preview",
        );
      const refs = new Map(references.map((ref) => [ref.from, ref]));
      const checks = new Map<string, Check>();
      for (const entry of [...preview.entries, ...references]) {
        const row = this.store.file(id, entry.from) as unknown as DiskRow,
          ref = refs.get(entry.from),
          before = rowMark(row);
        if (
          row.revision !== entry.revision ||
          (ref && before.hash !== digest(ref.before))
        )
          throw new DiskConflict(
            entry.from,
            "the reviewed move revision changed",
          );
        if (!sameDisk(this.store.disk.inspect(id, entry.from), before))
          throw new DiskConflict(entry.from);
        checks.set(entry.from, {
          from: entry.from,
          to: entry.to,
          before,
          after: ref ? { kind: "file", hash: digest(ref.after) } : before,
          reference: !!ref,
        });
        if (ref) this.store.directories.assertWritable(id, ref.from);
      }
      const moves = captured.map((move) => {
        const { from, to } = move;
        const temporary =
          spelling(from).toLowerCase() === spelling(to).toLowerCase()
            ? path.posix.join(
                path.posix.dirname(from),
                "leaf-move." + randomUUID() + ".prism-tmp",
              )
            : undefined;
        if (temporary && this.stat(id, temporary))
          throw new DiskConflict(from, "temporary move storage is occupied");
        this.store.directories.assertWritable(id, from);
        this.store.directories.assertWritable(id, to);
        return { ...move, temporary };
      });
      this.store.automaticCheckpoint(id);
      mutate(
        moves.flatMap(({ sourceParent }) =>
          sourceParent ? [sourceParent] : [],
        ),
      );
      const plan: Plan = {
        version: 1,
        generation: this.store.requireProject(id).generation,
        moves,
        checks: [...checks.values()],
      };
      this.store.db
        .prepare("INSERT INTO linked_file_moves VALUES(?,?)")
        .run(id, JSON.stringify(plan));
    });
    this.recover(id);
  }

  recover(id: string) {
    if (!this.pending(id)) return;
    this.store.transaction(() => {
      const pending = this.pending(id);
      if (!pending) return;
      try {
        this.replay(id, pending.payload);
      } catch (error: any) {
        if (error instanceof DiskConflict) throw error;
        if (
          error instanceof SyntaxError ||
          error instanceof TypeError ||
          error instanceof AppError ||
          typeof error.code === "string"
        )
          throw new DiskConflict(
            "Project",
            "the local move could not be recovered safely",
          );
        throw error;
      }
    });
  }

  private location(id: string, move: Move, changed?: Check) {
    const from = this.stat(id, move.from),
      to = this.stat(id, move.to),
      temporary = move.temporary ? this.stat(id, move.temporary) : undefined;
    if (temporary && identity(temporary) === move.identity && !from && !to)
      return move.temporary!;
    if (!temporary) {
      if (from && to && move.temporary && identity(from) === identity(to)) {
        if (
          identity(from) === move.identity &&
          this.usesSpelling(id, move.from)
        )
          return move.from;
        if (
          this.usesSpelling(id, move.to) &&
          (identity(to) === move.identity ||
            (changed &&
              sameDisk(this.store.disk.inspect(id, move.to), changed.after)))
        )
          return move.to;
      } else {
        if (from && !to && identity(from) === move.identity) return move.from;
        if (
          !from &&
          to &&
          (identity(to) === move.identity ||
            (changed &&
              sameDisk(this.store.disk.inspect(id, move.to), changed.after)))
        )
          return move.to;
      }
    }
    throw new DiskConflict(
      move.to,
      "the move source or destination changed during recovery",
    );
  }

  private replay(id: string, payload: string) {
    const plan = JSON.parse(payload) as Plan;
    if (
      plan?.version !== 1 ||
      !Array.isArray(plan.moves) ||
      !Array.isArray(plan.checks) ||
      plan.generation !== this.store.requireProject(id).generation
    )
      throw new DiskConflict("Project", "local move metadata changed");
    const changedRoots = new Map(
      plan.checks
        .filter((check) => check.reference)
        .map((check) => [check.from, check]),
    );
    const locations = plan.moves.map((move) => {
      this.assertMoveParent(id, move.parent);
      this.assertMoveParent(id, move.sourceParent);
      return {
        move,
        name: this.location(id, move, changedRoots.get(move.from)),
      };
    });
    const find = this.store.db.prepare(
      "SELECT kind,content,deleted,revision FROM files WHERE project=? AND path=?",
    );
    for (const check of plan.checks) {
      const row = find.get(id, check.to) as unknown as DiskRow | undefined;
      if (!row || !sameDisk(rowMark(row), check.after))
        throw new DiskConflict(check.to, "the committed move revision changed");
      const current = locations.find(({ move }) =>
        coversPath(move.from, check.from),
      );
      const name = current
        ? current.name + check.from.slice(current.move.from.length)
        : check.from;
      const actual = this.store.disk.inspect(id, name);
      if (
        !sameDisk(actual, check.before) &&
        !(name === check.to && sameDisk(actual, check.after))
      )
        throw new DiskConflict(name, "changed during local move recovery");
    }
    for (const { move, name } of locations) {
      if (name === move.to) continue;
      if (name === move.from && move.temporary)
        this.rename(id, name, move.temporary, move.identity, move.parent);
      this.rename(
        id,
        move.temporary ?? name,
        move.to,
        move.identity,
        move.parent,
      );
    }
    for (const check of plan.checks) {
      const row = find.get(id, check.to) as unknown as DiskRow;
      if (check.reference)
        this.store.disk.write(id, check.to, row, check.before);
      else this.store.disk.acknowledge(id, check.to, check.after, row.revision);
      if (!sameDisk(this.store.disk.inspect(id, check.to), check.after))
        throw new DiskConflict(check.to, "changed during local move recovery");
    }
    const clear = this.store.db.prepare(
      "DELETE FROM file_disk_state WHERE project=? AND path=?",
    );
    for (const check of plan.checks)
      if (check.from !== check.to) clear.run(id, check.from);
    this.store.db
      .prepare("DELETE FROM linked_file_moves WHERE project=?")
      .run(id);
  }

  private rename(
    id: string,
    from: string,
    to: string,
    tag: string,
    parent?: MoveParent,
  ) {
    const existing = this.destinationParent(id, to);
    this.store.directories.assertWritable(id, from);
    this.store.directories.assertWritable(id, to);
    this.assertMoveParent(id, parent);
    const relativeParent = path.posix.dirname(to);
    if (relativeParent !== "." && existing?.path !== relativeParent)
      fs.mkdirSync(path.dirname(this.target(id, to)), { recursive: true });
    this.assertMoveParent(id, parent);
    if (identity(this.stat(id, from)) !== tag || this.stat(id, to))
      throw new DiskConflict(
        to,
        "the local move paths changed before renaming",
      );
    fs.renameSync(this.target(id, from), this.target(id, to));
  }
}
