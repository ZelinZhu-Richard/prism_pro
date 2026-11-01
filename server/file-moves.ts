import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Store } from "./store";
import { AppError, safePath, validateTree, within } from "./files";
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
};
type Payload = {
  moves: FileMove[];
  entries: Entry[];
  rootBefore: string;
  rootAfter: string;
  createdDirectories: { path: string; revision: number }[];
  request: string;
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
  ): MovePreview {
    const roots = this.roots(id, input.paths),
      project = this.store.project(id);
    if (typeof input.destination !== "string")
      throw new AppError(400, "Choose a destination folder.");
    const destination = input.destination ? safePath(input.destination) : "";
    if (destination && !projectFolders(project.files).includes(destination))
      throw new AppError(404, "The destination folder no longer exists.");
    return this.plan(
      id,
      roots.map((from) => ({
        from,
        to: [destination, from.split("/").at(-1)!].filter(Boolean).join("/"),
      })),
    );
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
  private row(id: string, operation: string) {
    const row = this.store.db
      .prepare("SELECT * FROM file_moves WHERE project=? AND id=?")
      .get(id, operation) as any;
    if (!row) throw new AppError(404, "Move not found.");
    return { ...row, payload: JSON.parse(row.payload) as Payload };
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
          }),
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
    },
  ): MoveResult {
    this.store.unlocked(id);
    if (typeof input.requestId !== "string" || !uuid.test(input.requestId))
      throw new AppError(400, "Invalid move request identifier.");
    const request = JSON.stringify({
      paths: Array.isArray(input.paths)
        ? selectionRoots(input.paths.map(safePath))
        : input.paths,
      destination: input.destination,
    });
    const saved = this.store.db
      .prepare("SELECT id FROM file_moves WHERE id=?")
      .get(input.requestId) as any;
    if (saved) {
      const row = this.row(id, input.requestId);
      if (row.payload.request !== request || row.status !== "applied")
        throw new AppError(
          409,
          "This move request was already used. Refresh its preview.",
        );
      return {
        project: this.store.project(id),
        operationId: row.id,
        moves: row.payload.moves,
        replayed: true,
      };
    }
    const preview = this.preview(id, input);
    if (
      !Number.isInteger(input.generation) ||
      preview.generation !== input.generation
    )
      throw new AppError(
        409,
        "The project changed. Refresh the move preview before applying.",
      );
    return this.commitMove(id, preview, input.requestId, request);
  }
  rename(
    id: string,
    from: string,
    to: string,
    options: { generation?: unknown; requestId?: unknown } = {},
  ) {
    return this.renameResult(id, from, to, options).project;
  }
  renameResult(
    id: string,
    from: string,
    to: string,
    options: { generation?: unknown; requestId?: unknown } = {},
  ): MoveResult {
    this.store.unlocked(id);
    const requestId = options.requestId ?? randomUUID(),
      request = JSON.stringify({ rename: true, from, to });
    if (typeof requestId !== "string" || !uuid.test(requestId))
      throw new AppError(400, "Invalid rename request identifier.");
    const existing = this.store.db
      .prepare("SELECT id FROM file_moves WHERE id=?")
      .get(requestId);
    if (existing) {
      const row = this.row(id, requestId);
      if (row.payload.request !== request || row.status !== "applied")
        throw new AppError(
          409,
          "This rename request was already used. Refresh the file list.",
        );
      return {
        project: this.store.project(id),
        operationId: requestId,
        moves: row.payload.moves,
        replayed: true,
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
    return this.commitMove(id, preview, requestId, request);
  }
  private commitMove(
    id: string,
    preview: MovePreview,
    operationId: string,
    request: string,
  ): MoveResult {
    const entries: Entry[] = preview.entries.map((entry) => {
      const current = this.store.file(id, entry.from);
      return {
        ...entry,
        nextRevision: this.store.nextFileRevision(
          id,
          entry.to,
          entry.revision + 1,
        ),
        hash: hash(current.content),
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
    };
    this.store.automaticCheckpoint(id);
    this.commitTree(id, preview.moves, () => {
      for (const entry of entries)
        this.relocateRow(id, entry.from, entry.to, entry.nextRevision);
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
    });
    return {
      project: this.store.project(id),
      operationId,
      moves: preview.moves,
    };
  }
  undo(id: string, operationId: string): MoveResult {
    this.store.unlocked(id);
    const row = this.row(id, operationId),
      payload: Payload = row.payload;
    const reverse = payload.moves.map((m) => ({ from: m.to, to: m.from }));
    if (row.status === "undone")
      return {
        project: this.store.project(id),
        operationId,
        moves: reverse,
        replayed: true,
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
    this.commitTree(id, reverse, () => {
      const restored = new Map<string, number>();
      for (const entry of payload.entries) {
        const revision = this.store.nextFileRevision(
          id,
          entry.from,
          entry.nextRevision + 1,
        );
        this.relocateRow(id, entry.to, entry.from, revision);
        restored.set(entry.from, revision);
      }
      // An exact Undo can restore an earlier move's files with newer revision numbers.
      // Carry that trusted lineage forward; arbitrary edits still invalidate the earlier Undo.
      for (const earlier of this.store.db
        .prepare(
          "SELECT id,payload FROM file_moves WHERE project=? AND status='applied' AND rowid < (SELECT rowid FROM file_moves WHERE id=?)",
        )
        .all(id, operationId) as any[]) {
        const previous = JSON.parse(earlier.payload) as Payload;
        let changed = false;
        for (const entry of payload.entries) {
          for (const older of previous.entries)
            if (
              older.to === entry.from &&
              older.nextRevision === entry.revision &&
              older.hash === entry.hash &&
              older.kind === entry.kind
            ) {
              older.nextRevision = restored.get(entry.from)!;
              changed = true;
            }
          for (const folder of previous.createdDirectories)
            if (
              entry.kind === "directory" &&
              folder.path === entry.from &&
              folder.revision === entry.revision
            ) {
              folder.revision = restored.get(entry.from)!;
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
      this.store.checkpoint(id, "Undid file move", true);
    });
    return { project: this.store.project(id), operationId, moves: reverse };
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
  }
  private commitTree(id: string, moves: FileMove[], mutate: () => void) {
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
      for (const move of moves) {
        const from = within(stage, move.from),
          to = within(stage, move.to);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
      }
      this.store.transaction(() => {
        mutate();
        fs.renameSync(source, backup);
        fs.renameSync(stage, source);
        this.store.db
          .prepare("INSERT INTO file_tree_commits(id,project) VALUES(?,?)")
          .run(transactionId, id);
      });
    } catch (e) {
      recoverFileTree(this.store.db, parent);
      throw e;
    }
    // A retained backup/journal is recoverable on startup if cleanup is interrupted.
    try {
      recoverFileTree(this.store.db, parent);
    } catch {
      /* SQLite and the new tree are committed. */
    }
  }
}
