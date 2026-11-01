import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { moveComments, rebaseComments } from "./comments";
import type { Store } from "./store";
import { AppError, safePath, validateTree, within } from "./files";
import { planReferenceUpdates, type ReferenceChange } from "./latex-references";
import {
  coversPath,
  movedPath,
  projectFolders,
  selectionRoots,
  type FileMove,
  type MovePreview,
  type MoveResult,
  type SavedMove,
} from "../shared/file-moves";
type Entry = {
  from: string;
  to: string;
  revision: number;
  nextRevision: number;
  kind: string;
  hash: string;
  beforeHash?: string;
};
type Payload = {
  moves: FileMove[];
  entries: Entry[];
  rootBefore: string;
  rootAfter: string;
  createdDirectories: { path: string; revision: number }[];
  request: string;
  references?: (ReferenceChange & { appliedRevision: number })[];
};
type Journal = { id: string; stage: string; backup: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const canonical = (name: string) => name.normalize("NFC").toLowerCase();
function exists(name: string) {
  try {
    return fs.lstatSync(name);
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
function plainDirectory(name: string) {
  const info = exists(name);
  if (!info?.isDirectory() || info.isSymbolicLink())
    throw new AppError(
      409,
      "Project storage changed on disk. Reopen Prism before moving files.",
    );
}
// Called before Store reconciles files: SQLite's commit marker decides which tree won.
export function recoverFileTree(db: DatabaseSync, parent: string) {
  const journalFile = path.join(parent, "file-tree-operation.json");
  if (!exists(journalFile)) return;
  plainDirectory(parent);
  if (exists(journalFile)?.isSymbolicLink())
    throw new AppError(409, "Invalid file recovery journal.");
  let journal: Journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
  } catch {
    throw new AppError(
      409,
      "The file recovery journal could not be read. Preserve this project directory for recovery.",
    );
  }
  if (
    !uuid.test(journal.id) ||
    journal.stage !== "file-stage-" + journal.id ||
    journal.backup !== "file-backup-" + journal.id
  )
    throw new AppError(409, "Invalid file recovery journal paths.");
  const current = path.join(parent, "files"),
    stage = path.join(parent, journal.stage),
    backup = path.join(parent, journal.backup);
  for (const name of [current, stage, backup])
    if (exists(name)) plainDirectory(name);
  const committed = !!db
    .prepare("SELECT 1 FROM file_tree_commits WHERE id=?")
    .get(journal.id);
  if (committed) {
    if (!exists(current)) {
      if (!exists(stage))
        throw new AppError(
          409,
          "Moved files require recovery. Keep the project directory intact.",
        );
      fs.renameSync(stage, current);
    }
  } else if (exists(backup)) {
    if (exists(current)) {
      if (exists(stage))
        throw new AppError(
          409,
          "Ambiguous file recovery state. Keep the project directory intact.",
        );
      fs.renameSync(current, stage);
    }
    fs.renameSync(backup, current);
  }
  if (!exists(current))
    throw new AppError(
      409,
      "The project file tree is missing. Keep its recovery directories intact.",
    );
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(backup, { recursive: true, force: true });
  fs.unlinkSync(journalFile);
}

export function commitFileTree(
  store: Store,
  id: string,
  prepare: (stage: string) => void,
  mutate: () => void,
) {
  const source = store.projectDir(id),
    parent = path.dirname(source);
  plainDirectory(path.dirname(parent));
  plainDirectory(parent);
  plainDirectory(source);
  recoverFileTree(store.db, parent);
  const transactionId = randomUUID(),
    journal: Journal = {
      id: transactionId,
      stage: "file-stage-" + transactionId,
      backup: "file-backup-" + transactionId,
    };
  const stage = path.join(parent, journal.stage),
    backup = path.join(parent, journal.backup),
    journalFile = path.join(parent, "file-tree-operation.json");
  if (exists(stage) || exists(backup))
    throw new AppError(
      409,
      "File operation storage is occupied. Retry the move.",
    );
  fs.writeFileSync(journalFile, JSON.stringify(journal), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    // Preserve unindexed disk files too; never follow their symlinks or run scripts.
    fs.cpSync(source, stage, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
    prepare(stage);
    store.transaction(() => {
      mutate();
      fs.renameSync(source, backup);
      fs.renameSync(stage, source);
      store.db
        .prepare("INSERT INTO file_tree_commits(id,project) VALUES(?,?)")
        .run(transactionId, id);
    });
  } catch (e) {
    recoverFileTree(store.db, parent);
    throw e;
  }
  // A retained backup/journal is recoverable on startup if cleanup is interrupted.
  try {
    recoverFileTree(store.db, parent);
  } catch {
    /* SQLite and the new tree are committed. */
  }
}

export class FileMoves {
  constructor(public store: Store) {}
  private roots(id: string, input: unknown) {
    const project = this.store.project(id);
    if (!Array.isArray(input) || !input.length || input.length > 200)
      throw new AppError(400, "Select between 1 and 200 items.");
    const roots = selectionRoots(input.map(safePath));
    for (const name of roots)
      if (!project.files.some((f) => !f.deleted && coversPath(name, f.path)))
        throw new AppError(
          404,
          "A selected item no longer exists. Refresh the file list.",
        );
    return roots;
  }
  preview(
    id: string,
    input: { paths?: unknown; destination?: unknown },
    withReferences = true,
  ): MovePreview {
    const roots = this.roots(id, input.paths),
      project = this.store.project(id);
    if (typeof input.destination !== "string")
      throw new AppError(400, "Choose a destination folder.");
    const destination = input.destination ? safePath(input.destination) : "";
    if (destination && !projectFolders(project.files).includes(destination))
      throw new AppError(404, "The destination folder no longer exists.");
    const preview = this.plan(
      id,
      roots.map((from) => ({
        from,
        to: [destination, from.split("/").at(-1)!].filter(Boolean).join("/"),
      })),
    );
    return withReferences
      ? { ...preview, references: this.references(id, preview).review }
      : preview;
  }
  previewRename(id: string, from: string, to: string): MovePreview {
    const preview = this.plan(id, [{ from, to }]);
    return { ...preview, references: this.references(id, preview).review };
  }
  private references(id: string, preview: MovePreview) {
    const files = this.store
      .fileList(id)
      .filter((f) => !f.deleted && f.kind !== "directory");
    const sources = files.filter(
      (f) => f.kind === "text" && /\.(tex|sty|cls)$/i.test(f.path),
    );
    const unavailable = (message: string) => ({
      review: {
        token: "",
        files: [],
        warnings: [],
        scannedFiles: 0,
        unavailable: message,
      },
      changes: [] as ReferenceChange[],
    });
    if (sources.reduce((sum, f) => sum + f.size, 0) > 32 * 1024 * 1024)
      return unavailable(
        "The TeX source exceeds the 32 MB reference-review limit. Move without updates or split the operation.",
      );
    const text = sources.map((f) => {
      const bytes = this.store.file(id, f.path).content as Buffer;
      return {
        path: f.path,
        revision: f.revision,
        content: bytes.toString("utf8"),
        bytes,
      };
    });
    if (text.some((f) => !Buffer.from(f.content).equals(f.bytes)))
      return unavailable(
        "Some TeX source is not valid UTF-8. Move without updates and adjust references manually.",
      );
    return planReferenceUpdates(
      id,
      preview.generation,
      preview.moves,
      text,
      files.map((f) => f.path),
    );
  }
  private approvedReferences(
    id: string,
    preview: MovePreview,
    input: { updateReferences?: unknown; referenceToken?: unknown },
  ) {
    if (
      input.updateReferences !== undefined &&
      typeof input.updateReferences !== "boolean"
    )
      throw new AppError(400, "Choose whether to update references.");
    if (!input.updateReferences) return [];
    const plan = this.references(id, preview);
    if (plan.review.unavailable)
      throw new AppError(409, plan.review.unavailable);
    if (input.referenceToken !== plan.review.token)
      throw new AppError(
        409,
        "The reference proposal changed. Refresh and review the diff before applying.",
      );
    return plan.changes;
  }
  private plan(id: string, supplied: FileMove[]): MovePreview {
    this.store.unlocked(id);
    const project = this.store.project(id),
      moves = supplied.filter((m) => m.from !== m.to);
    if (!moves.length)
      throw new AppError(400, "These items are already in that location.");
    for (const m of moves) {
      safePath(m.from);
      safePath(m.to);
      if (!project.files.some((f) => !f.deleted && coversPath(m.from, f.path)))
        throw new AppError(404, "A selected item no longer exists.");
      if (
        m.to
          .normalize("NFC")
          .toLowerCase()
          .startsWith(m.from.normalize("NFC").toLowerCase() + "/")
      )
        throw new AppError(400, "A folder cannot be moved inside itself.");
      if (
        moves.some(
          (other) =>
            other !== m &&
            (coversPath(other.from, m.from) || coversPath(other.from, m.to)),
        )
      )
        throw new AppError(409, "Move overlapping folders separately.");
      const occupied = project.files.some(
        (f) =>
          !moves.some((move) => !f.deleted && coversPath(move.from, f.path)) &&
          (canonical(f.path) === canonical(m.to) ||
            (!f.deleted &&
              canonical(f.path).startsWith(canonical(m.to) + "/"))),
      );
      if (occupied)
        throw new AppError(
          409,
          "A destination already exists, possibly in Trash. Choose another folder or name.",
        );
      const parts = m.to.split("/");
      parts.pop();
      while (parts.length) {
        const parent = parts.join("/");
        if (
          projectFolders(project.files).some(
            (folder) =>
              canonical(folder) === canonical(parent) &&
              folder !== parent &&
              !moves.some((move) => coversPath(move.from, folder)),
          )
        )
          throw new AppError(
            409,
            "Use the destination folder's existing spelling, or rename the folder itself.",
          );
        parts.pop();
      }
    }
    const active = project.files.filter((f) => !f.deleted),
      affected = active.filter((f) =>
        moves.some((m) => coversPath(m.from, f.path)),
      );
    validateTree(
      project.files.map((f) => ({
        path: !f.deleted ? movedPath(f.path, moves) : f.path,
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
    );
    for (const f of affected) {
      const target = movedPath(f.path, moves);
      for (const ancestor of project.files.filter(
        (other) => other.deleted && other.kind === "directory",
      ))
        if (coversPath(ancestor.path, target))
          throw new AppError(
            409,
            "Restore the destination folder from Trash first.",
          );
    }
    return {
      generation: project.generation,
      moves,
      rootBefore: project.root,
      rootAfter: affected.some((f) => f.path === project.root)
        ? movedPath(project.root, moves)
        : project.root,
      entries: affected.map((f) => ({
        from: f.path,
        to: movedPath(f.path, moves),
        revision: f.revision,
        kind: f.kind,
        size: f.size,
      })),
    };
  }
  private row(
    id: string,
    operation: string,
  ): { id: string; status: string; created: string; payload: Payload } {
    const row = this.store.db
      .prepare("SELECT * FROM file_moves WHERE project=? AND id=?")
      .get(id, operation) as any;
    if (!row) throw new AppError(404, "Move not found.");
    return { ...row, payload: JSON.parse(row.payload) as Payload };
  }
  private sameRequest(payload: Payload, request: string) {
    if (payload.request === request) return true;
    const current = JSON.parse(request),
      old = JSON.parse(payload.request);
    if (
      payload.references === undefined &&
      old.updateReferences === undefined &&
      current.updateReferences === false
    ) {
      delete current.updateReferences;
      delete current.referenceToken;
      return JSON.stringify(current) === payload.request;
    }
    return false;
  }
  list(id: string): SavedMove[] {
    this.store.requireProject(id);
    const files = new Map(this.store.fileList(id).map((f) => [f.path, f]));
    return (
      this.store.db
        .prepare(
          "SELECT * FROM file_moves WHERE project=? ORDER BY rowid DESC LIMIT 20",
        )
        .all(id) as any[]
    ).map((row) => {
      const payload = JSON.parse(row.payload) as Payload;
      return {
        id: row.id,
        moves: payload.moves,
        created: row.created,
        status: row.status,
        undoable:
          row.status === "applied" &&
          [...files.values()].filter(
            (f) =>
              !f.deleted && payload.moves.some((m) => coversPath(m.to, f.path)),
          ).length === payload.entries.length &&
          payload.entries.every((entry) => {
            const current = files.get(entry.to);
            return (
              !!current &&
              !current.deleted &&
              current.revision === entry.nextRevision
            );
          }) &&
          (payload.references ?? []).every(
            (ref) =>
              files.get(ref.to)?.revision === ref.appliedRevision &&
              !files.get(ref.to)?.deleted,
          ),
      };
    });
  }
  apply(
    id: string,
    input: {
      paths?: unknown;
      destination?: unknown;
      generation?: unknown;
      requestId?: unknown;
      updateReferences?: unknown;
      referenceToken?: unknown;
    },
  ): MoveResult {
    this.store.unlocked(id);
    if (
      input.updateReferences !== undefined &&
      typeof input.updateReferences !== "boolean"
    )
      throw new AppError(400, "Choose whether to update references.");
    if (typeof input.requestId !== "string" || !uuid.test(input.requestId))
      throw new AppError(400, "Invalid move request identifier.");
    const request = JSON.stringify({
      paths: Array.isArray(input.paths)
        ? selectionRoots(input.paths.map(safePath))
        : input.paths,
      destination: input.destination,
      updateReferences: input.updateReferences ?? false,
      referenceToken: input.updateReferences ? input.referenceToken : undefined,
    });
    const saved = this.store.db
      .prepare("SELECT id FROM file_moves WHERE id=?")
      .get(input.requestId) as any;
    if (saved) {
      const row = this.row(id, input.requestId);
      if (!this.sameRequest(row.payload, request) || row.status !== "applied")
        throw new AppError(
          409,
          "This move request was already used. Refresh its preview.",
        );
      return {
        project: this.store.project(id),
        operationId: row.id,
        moves: row.payload.moves,
        replayed: true,
        changedFiles: (row.payload.references ?? []).map((ref) => ref.to),
      };
    }
    const preview = this.preview(id, input, false);
    if (
      !Number.isInteger(input.generation) ||
      preview.generation !== input.generation
    )
      throw new AppError(
        409,
        "The project changed. Refresh the move preview before applying.",
      );
    const references = this.approvedReferences(id, preview, input);
    return this.commitMove(id, preview, input.requestId, request, references);
  }
  rename(
    id: string,
    from: string,
    to: string,
    options: {
      generation?: unknown;
      requestId?: unknown;
      updateReferences?: unknown;
      referenceToken?: unknown;
    } = {},
  ) {
    return this.renameResult(id, from, to, options).project;
  }
  renameResult(
    id: string,
    from: string,
    to: string,
    options: {
      generation?: unknown;
      requestId?: unknown;
      updateReferences?: unknown;
      referenceToken?: unknown;
    } = {},
  ): MoveResult {
    this.store.unlocked(id);
    if (
      options.updateReferences !== undefined &&
      typeof options.updateReferences !== "boolean"
    )
      throw new AppError(400, "Choose whether to update references.");
    const requestId = options.requestId ?? randomUUID(),
      request = JSON.stringify({
        rename: true,
        from,
        to,
        updateReferences: options.updateReferences ?? false,
        referenceToken: options.updateReferences
          ? options.referenceToken
          : undefined,
      });
    if (typeof requestId !== "string" || !uuid.test(requestId))
      throw new AppError(400, "Invalid rename request identifier.");
    const existing = this.store.db
      .prepare("SELECT id FROM file_moves WHERE id=?")
      .get(requestId);
    if (existing) {
      const row = this.row(id, requestId);
      if (!this.sameRequest(row.payload, request) || row.status !== "applied")
        throw new AppError(
          409,
          "This rename request was already used. Refresh the file list.",
        );
      return {
        project: this.store.project(id),
        operationId: requestId,
        moves: row.payload.moves,
        replayed: true,
        changedFiles: (row.payload.references ?? []).map((ref) => ref.to),
      };
    }
    const preview = this.plan(id, [{ from, to }]);
    if (
      options.generation !== undefined &&
      (!Number.isInteger(options.generation) ||
        options.generation !== preview.generation)
    )
      throw new AppError(
        409,
        "The project changed. Refresh the file list before renaming.",
      );
    return this.commitMove(
      id,
      preview,
      requestId,
      request,
      this.approvedReferences(id, preview, options),
    );
  }
  private commitMove(
    id: string,
    preview: MovePreview,
    operationId: string,
    request: string,
    referenceChanges: ReferenceChange[] = [],
  ): MoveResult {
    const entries: Entry[] = preview.entries.map((entry) => {
      const current = this.store.file(id, entry.from);
      const change = referenceChanges.find((ref) => ref.from === entry.from);
      return {
        ...entry,
        nextRevision: this.store.nextFileRevision(
          id,
          entry.to,
          entry.revision + 1,
        ),
        hash: change ? hash(Buffer.from(change.after)) : hash(current.content),
        beforeHash: change ? hash(current.content) : undefined,
      };
    });
    const all = this.store.fileList(id),
      after = all
        .filter((f) => !f.deleted)
        .map((f) => movedPath(f.path, preview.moves));
    const createdDirectories = projectFolders(all)
      .filter(
        (folder) =>
          !all.some((f) => f.path === folder) &&
          !preview.moves.some((m) => coversPath(m.from, folder)) &&
          !after.some((name) => coversPath(folder, name)),
      )
      .map((folder) => ({
        path: folder,
        revision: this.store.nextFileRevision(id, folder),
      }));
    const payload: Payload = {
      moves: preview.moves,
      entries,
      rootBefore: preview.rootBefore,
      rootAfter: preview.rootAfter,
      createdDirectories,
      request,
      references: referenceChanges.map((ref) => ({
        ...ref,
        appliedRevision:
          entries.find((entry) => entry.from === ref.from)?.nextRevision ??
          this.store.nextFileRevision(id, ref.from, ref.revision + 1),
      })),
    };
    this.store.automaticCheckpoint(id);
    this.commitTree(
      id,
      preview.moves,
      () => {
        for (const entry of entries)
          this.relocateRow(id, entry.from, entry.to, entry.nextRevision);
        for (const ref of payload.references ?? [])
          this.writeReference(
            id,
            ref.to,
            ref.after,
            ref.appliedRevision,
            !entries.some((entry) => entry.to === ref.to),
          );
        for (const folder of createdDirectories)
          this.store.insert(
            id,
            folder.path,
            Buffer.alloc(0),
            "directory",
            folder.revision,
          );
        this.store.db
          .prepare(
            "UPDATE projects SET root=?,generation=generation+1,updated=? WHERE id=?",
          )
          .run(preview.rootAfter, new Date().toISOString(), id);
        this.store.db
          .prepare(
            "INSERT INTO file_moves(id,project,payload,status,created) VALUES(?,?,?,?,?)",
          )
          .run(
            operationId,
            id,
            JSON.stringify(payload),
            "applied",
            new Date().toISOString(),
          );
        this.store.checkpoint(
          id,
          "Moved " +
            preview.moves.length +
            " item" +
            (preview.moves.length === 1 ? "" : "s"),
          true,
        );
      },
      referenceChanges,
    );
    return {
      project: this.store.project(id),
      operationId,
      moves: preview.moves,
      changedFiles: referenceChanges.map((ref) => ref.to),
    };
  }
  undo(id: string, operationId: string): MoveResult {
    this.store.unlocked(id);
    const row = this.row(id, operationId),
      payload: Payload = row.payload;
    const reverse = payload.moves.map((m) => ({ from: m.to, to: m.from })),
      references = payload.references ?? [];
    if (row.status === "undone")
      return {
        project: this.store.project(id),
        operationId,
        moves: reverse,
        replayed: true,
        changedFiles: references.map((ref) => ref.from),
        undone: true,
      };
    for (const entry of payload.entries) {
      const current = this.store.file(id, entry.to);
      if (
        current.revision !== entry.nextRevision ||
        hash(current.content) !== entry.hash
      )
        throw new AppError(
          409,
          "A moved item changed. Undo would overwrite newer edits; restore from History instead.",
        );
    }
    for (const ref of references) {
      const current = this.store.file(id, ref.to);
      if (
        current.revision !== ref.appliedRevision ||
        !current.content.equals(Buffer.from(ref.after))
      )
        throw new AppError(
          409,
          "A reference file changed. Undo would overwrite newer edits; restore from History instead.",
        );
    }
    const preview = this.plan(id, reverse);
    if (
      preview.entries.length !== payload.entries.length ||
      preview.entries.some(
        (entry) =>
          !payload.entries.some((original) => original.to === entry.from),
      )
    )
      throw new AppError(
        409,
        "The moved folder contains new items. Move them separately before undoing, or restore from History.",
      );
    this.store.automaticCheckpoint(id);
    this.commitTree(
      id,
      reverse,
      () => {
        const restored = new Map<
          string,
          {
            revision: number;
            previousRevision: number;
            hash: string;
            kind: string;
          }
        >();
        for (const entry of payload.entries) {
          const revision = this.store.nextFileRevision(
            id,
            entry.from,
            entry.nextRevision + 1,
          );
          this.relocateRow(id, entry.to, entry.from, revision);
          restored.set(entry.from, {
            revision,
            previousRevision: entry.revision,
            hash: entry.beforeHash ?? entry.hash,
            kind: entry.kind,
          });
        }
        for (const ref of references) {
          const moved = restored.get(ref.from),
            revision =
              moved?.revision ??
              this.store.nextFileRevision(
                id,
                ref.from,
                ref.appliedRevision + 1,
              );
          this.writeReference(id, ref.from, ref.before, revision, !moved);
          if (!moved)
            restored.set(ref.from, {
              revision,
              previousRevision: ref.revision,
              hash: hash(Buffer.from(ref.before)),
              kind: "text",
            });
        }
        // Only an exact structural Undo carries trusted revision lineage forward.
        for (const earlier of this.store.db
          .prepare(
            "SELECT id,payload FROM file_moves WHERE project=? AND status='applied' AND rowid < (SELECT rowid FROM file_moves WHERE id=?)",
          )
          .all(id, operationId) as any[]) {
          const previous = JSON.parse(earlier.payload) as Payload;
          let changed = false;
          for (const older of previous.entries) {
            const item = restored.get(older.to);
            if (
              item &&
              older.nextRevision === item.previousRevision &&
              older.hash === item.hash &&
              older.kind === item.kind
            ) {
              older.nextRevision = item.revision;
              changed = true;
            }
          }
          for (const ref of previous.references ?? []) {
            const item = restored.get(ref.to);
            if (
              item &&
              ref.appliedRevision === item.previousRevision &&
              hash(Buffer.from(ref.after)) === item.hash
            ) {
              ref.appliedRevision = item.revision;
              changed = true;
            }
          }
          for (const folder of previous.createdDirectories) {
            const item = restored.get(folder.path);
            if (
              item?.kind === "directory" &&
              folder.revision === item.previousRevision
            ) {
              folder.revision = item.revision;
              changed = true;
            }
          }
          if (changed)
            this.store.db
              .prepare("UPDATE file_moves SET payload=? WHERE id=?")
              .run(JSON.stringify(previous), earlier.id);
        }
        for (const folder of payload.createdDirectories) {
          const current = this.store.db
            .prepare(
              "SELECT revision,deleted,kind FROM files WHERE project=? AND path=?",
            )
            .get(id, folder.path) as any;
          if (
            current?.kind === "directory" &&
            current.revision === folder.revision &&
            !current.deleted
          )
            this.store.db
              .prepare("DELETE FROM files WHERE project=? AND path=?")
              .run(id, folder.path);
        }
        this.store.db
          .prepare(
            "UPDATE projects SET root=?,generation=generation+1,updated=? WHERE id=?",
          )
          .run(preview.rootAfter, new Date().toISOString(), id);
        this.store.db
          .prepare("UPDATE file_moves SET status='undone' WHERE id=?")
          .run(operationId);
        this.store.checkpoint(
          id,
          references.length
            ? "Undid file move and reference updates"
            : "Undid file move",
          true,
        );
      },
      references.map((ref) => ({
        ...ref,
        from: ref.to,
        to: ref.from,
        before: ref.after,
        after: ref.before,
      })),
    );
    return {
      project: this.store.project(id),
      operationId,
      moves: reverse,
      changedFiles: references.map((ref) => ref.from),
      undone: true,
    };
  }
  private writeReference(
    id: string,
    name: string,
    text: string,
    revision: number,
    record: boolean,
  ) {
    const current = this.store.file(id, name);
    if (record)
      this.store.db
        .prepare(
          "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          name,
          current.revision,
          current.content,
          new Date().toISOString(),
        );
    rebaseComments(
      this.store.db,
      id,
      name,
      current.content.toString("utf8"),
      text,
    );
    this.store.db
      .prepare(
        "UPDATE files SET content=?,revision=? WHERE project=? AND path=?",
      )
      .run(Buffer.from(text), revision, id, name);
  }
  private relocateRow(id: string, from: string, to: string, revision: number) {
    const current = this.store.file(id, from);
    this.store.db
      .prepare(
        "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        from,
        current.revision,
        current.content,
        new Date().toISOString(),
      );
    this.store.db
      .prepare("UPDATE files SET path=?,revision=? WHERE project=? AND path=?")
      .run(to, revision, id, from);
    moveComments(this.store.db, id, from, to);
  }
  private commitTree(
    id: string,
    moves: FileMove[],
    mutate: () => void,
    references: ReferenceChange[] = [],
  ) {
    const source = this.store.projectDir(id),
      parent = path.dirname(source);
    plainDirectory(path.dirname(parent));
    plainDirectory(parent);
    plainDirectory(source);
    recoverFileTree(this.store.db, parent);
    for (const move of moves) {
      const from = within(source, move.from),
        to = within(source, move.to),
        original = exists(from),
        destination = exists(to);
      if (
        destination &&
        !(
          canonical(move.from) === canonical(move.to) &&
          original?.ino === destination.ino &&
          original.dev === destination.dev
        )
      )
        throw new AppError(
          409,
          "The destination already exists on disk. Preserve that item and choose another location.",
        );
      for (const f of this.store
        .fileList(id)
        .filter((f) => !f.deleted && coversPath(move.from, f.path))) {
        const file = within(source, f.path);
        if (f.kind === "directory") plainDirectory(file);
        else if (
          !exists(file)?.isFile() ||
          hash(fs.readFileSync(file)) !==
            hash(this.store.file(id, f.path).content)
        )
          throw new AppError(
            409,
            "A selected file changed outside Prism. Preserve that file and reopen the project before moving it.",
          );
      }
    }
    for (const ref of references) {
      const file = within(source, ref.from);
      if (
        !exists(file)?.isFile() ||
        !fs.readFileSync(file).equals(Buffer.from(ref.before))
      )
        throw new AppError(
          409,
          "A reference file changed on disk. Preserve it and reopen the project before moving files.",
        );
    }
    commitFileTree(
      this.store,
      id,
      (stage) => {
        for (const move of moves) {
          const from = within(stage, move.from),
            to = within(stage, move.to);
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.renameSync(from, to);
        }
        for (const ref of references)
          fs.writeFileSync(within(stage, ref.to), ref.after, {
            encoding: "utf8",
          });
      },
      mutate,
    );
  }
}
