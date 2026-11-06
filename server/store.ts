import { DatabaseSync } from "node:sqlite";
import { isUtf8 } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type {
  Project,
  Conversation,
  Engine,
  FileInfo,
  AiRun,
  Proposal,
  TextFile,
} from "../shared/types";
import {
  AppError,
  safePath,
  within,
  kindOf,
  findRoots,
  validateTree,
  type ImportedFile,
} from "./files";
import { rebaseComments } from "./comments";
import { recordTracked } from "./tracking";
import {
  captureReview,
  reviewHistoryEnabled,
  type ReviewReference,
} from "./review-history";
import { FileMoves, recoverFileTree } from "./file-moves";
import { FileBatches } from "./file-batches";
import { LinkedFileBatches } from "./linked-file-batches";
import { LinkedFileMoves } from "./linked-file-moves";
import {
  DiskFiles,
  DiskConflict,
  rowMark,
  sameDisk,
  DISK_RECOVERY_BYTES,
  type DiskEntry,
  type DiskMark,
} from "./disk-files";
import { discoveredKind, type CapturedDiskFile } from "./disk-discovery";
import { decodeSource, validateSourceInput } from "./source-encoding";
import {
  ProjectDirectories,
  type DirectoryIdentity,
} from "./project-directories";
import {
  HistoryLabels,
  labelName,
  labelVersion,
  migrateHistoryLabels,
  seedVersionLabels,
} from "./history-labels";

type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  disk: DiskFiles;
  directories: ProjectDirectories;
  linkedBatches: LinkedFileBatches;
  linkedMoves: LinkedFileMoves;
  private diskIssues = new Map<string, string>();
  private recoveringDisk = false;
  locks = new Map<string, string>();
  projectLocks = new Map<string, string>();
  historyTimers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; started: number }
  >();
  constructor(public root: string) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, "prism.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,engine TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(project TEXT NOT NULL,path TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,content BLOB NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(project,path));
      CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,project TEXT,path TEXT,revision INTEGER,content BLOB,created TEXT);
      CREATE TABLE IF NOT EXISTS history_blobs(hash TEXT PRIMARY KEY,content BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,project TEXT,name TEXT,payload TEXT,created TEXT);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,project TEXT,payload TEXT);
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,project TEXT,payload TEXT);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,project TEXT,payload TEXT);
      CREATE TABLE IF NOT EXISTS chat_drafts(project TEXT NOT NULL,conversation TEXT NOT NULL,text TEXT NOT NULL,revision INTEGER NOT NULL,updated TEXT NOT NULL,request TEXT NOT NULL,PRIMARY KEY(project,conversation));
      CREATE INDEX IF NOT EXISTS runs_activity ON runs(project,json_extract(payload,'$.status'));
      CREATE INDEX IF NOT EXISTS runs_conversation ON runs(project,json_extract(payload,'$.conversationId'));
      CREATE TABLE IF NOT EXISTS project_copies(request TEXT PRIMARY KEY,source TEXT NOT NULL,project TEXT NOT NULL,name TEXT NOT NULL,generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS disk_imports(request TEXT PRIMARY KEY,project TEXT NOT NULL,signature TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comment_threads(id TEXT PRIMARY KEY,project TEXT NOT NULL,path TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,resolved INTEGER NOT NULL,deleted INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS comments_scope ON comment_threads(project,path,deleted,resolved);
      CREATE TABLE IF NOT EXISTS comment_messages(id TEXT PRIMARY KEY,thread TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,deleted INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS comments_messages ON comment_messages(thread);
      CREATE TABLE IF NOT EXISTS tracking_projects(project TEXT PRIMARY KEY,enabled INTEGER NOT NULL,revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tracking_files(project TEXT NOT NULL,path TEXT NOT NULL,base TEXT NOT NULL,count INTEGER NOT NULL,limited INTEGER NOT NULL,PRIMARY KEY(project,path));
      CREATE TABLE IF NOT EXISTS tracking_ops(id TEXT PRIMARY KEY,project TEXT NOT NULL,path TEXT NOT NULL,action TEXT NOT NULL,signature TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,undone INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS tracking_operations ON tracking_ops(project,undone);
      CREATE TABLE IF NOT EXISTS history_restores(id TEXT PRIMARY KEY,project TEXT NOT NULL,version TEXT NOT NULL,path TEXT,signature TEXT NOT NULL,backup TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS file_moves(id TEXT PRIMARY KEY,project TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS file_tree_commits(id TEXT PRIMARY KEY,project TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS file_batches(id TEXT PRIMARY KEY,project TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS file_disk_state(project TEXT NOT NULL,path TEXT NOT NULL,kind TEXT NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,pending INTEGER NOT NULL,PRIMARY KEY(project,path));
    `);
    this.directories = new ProjectDirectories(this.db, root);
    this.disk = new DiskFiles(
      this.db,
      (id) => this.projectDir(id),
      (id, name) => this.directories.assertWritable(id, name),
    );
    this.linkedBatches = new LinkedFileBatches(this);
    this.linkedMoves = new LinkedFileMoves(this);
    // Additive migration keeps existing projects and their revision history intact.
    const columns = this.db
      .prepare("PRAGMA table_info(projects)")
      .all() as Row[];
    if (!columns.some((column) => column.name === "deletedAt"))
      this.db.exec(
        "ALTER TABLE projects ADD COLUMN deletedAt TEXT DEFAULT NULL",
      );
    if (!columns.some((column) => column.name === "lastOpenedAt"))
      this.db.exec("ALTER TABLE projects ADD COLUMN lastOpenedAt TEXT DEFAULT NULL");
    const historyColumns = this.db
      .prepare("PRAGMA table_info(checkpoints)")
      .all() as Row[];
    if (!historyColumns.some((c) => c.name === "automatic"))
      this.db.exec(
        "ALTER TABLE checkpoints ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0",
      );
    migrateHistoryLabels(this.db);
    // Existing disk bytes win over an ambiguous legacy/incomplete write. Keep
    // the app version in history; replay only an explicit, still-matching intent.
    for (const row of this.db
      .prepare("SELECT id FROM projects WHERE deletedAt IS NULL")
      .all() as Row[]) {
      try {
        this.reconcileDisk(row.id);
      } catch (e) {
        if (!(e instanceof DiskConflict)) throw e;
        this.diskIssues.set(row.id, e.message);
      }
      if (!this.checkpoints(row.id).length)
        this.checkpoint(row.id, "Initial version", true);
      else this.automaticCheckpoint(row.id, "Recovered saved files");
    }
    for (const row of this.db
      .prepare("SELECT id,payload FROM runs")
      .all() as Row[]) {
      const run = JSON.parse(row.payload);
      if (!run.conversationId) {
        const c = this.createConversation(
          run.projectId,
          run.prompt || "Earlier conversation",
          true,
        );
        run.conversationId = c.id;
        this.saveRun(run);
      }
      if (["generating", "typing", "paused", "preview"].includes(run.status)) {
        run.status = "interrupted";
        this.saveRun(run);
      }
    }
  }
  close() {
    for (const [id, pending] of this.historyTimers) {
      clearTimeout(pending.timer);
      this.automaticCheckpoint(id);
    }
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  projectDir(id: string) {
    this.requireProject(id);
    return this.directories.directory(id);
  }
  assertManagedTree(id: string) {
    this.requireProject(id);
    this.directories.assertManagedTree(id);
  }
  requireProject(id: string, includeTrashed = false): Row {
    const row = this.db.prepare("SELECT * FROM projects WHERE id=?").get(id) as
      Row | undefined;
    if (!row) throw new AppError(404, "Project not found.");
    if (row.deletedAt && !includeTrashed)
      throw new AppError(
        409,
        "This project is in Trash. Restore it from the home page first.",
      );
    return row;
  }
  list(trashed = false) {
    return (
      this.db
        .prepare(
          trashed
            ? "SELECT * FROM projects WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC"
            : "SELECT * FROM projects WHERE deletedAt IS NULL ORDER BY updated DESC",
        )
        .all() as Row[]
    ).map((r) => this.project(r.id, trashed));
  }
  project(id: string, includeTrashed = false): Project {
    const r = this.requireProject(id, includeTrashed);
    const storage = this.directories.describe(id);
    const recovery = storage
      ? this.diskIssues.get(id) ??
        (this.linkedBatches.hasPending(id) || this.linkedMoves.hasPending(id)
          ? "An interrupted file operation needs recovery."
          : undefined)
      : undefined;
    return {
      ...r,
      files: this.fileList(id),
      ...(storage ? { storage: { ...storage, recovery } } : {}),
    } as Project;
  }
  recordOpened(id: string) {
    this.requireProject(id);
    this.db.prepare("UPDATE projects SET lastOpenedAt=? WHERE id=?")
      .run(new Date().toISOString(), id);
    return this.project(id);
  }
  trashProject(id: string, restore = false): Project {
    const current = this.requireProject(id, true);
    // Repeated requests are harmless and retain the original deletion date.
    if (restore ? !current.deletedAt : !!current.deletedAt)
      return this.project(id, true);
    if (!restore) {
      if (this.directories.binding(id)) this.assertSourceOwner(id);
      else this.unlocked(id);
      if (
        this.runs(id).some((run) =>
          ["generating", "typing", "paused", "preview"].includes(run.status),
        )
      )
        throw new AppError(
          409,
          "Finish or stop the active AI request before moving this project to Trash.",
        );
    }
    this.transaction(() => {
      this.db
        .prepare("UPDATE projects SET deletedAt=? WHERE id=?")
        .run(restore ? null : new Date().toISOString(), id);
      if (restore && !this.directories.binding(id)) this.materialize(id);
    });
    if (restore && this.directories.binding(id))
      this.reconcileLinkedDirectory(id);
    return this.project(id, true);
  }
  reconcileLinkedDirectory(id: string) {
    try {
      this.reconcileDisk(id);
    } catch (e) {
      if (!(e instanceof DiskConflict)) throw e;
      this.diskIssues.set(id, e.message);
    }
  }
  fileList(id: string): FileInfo[] {
    return (
      this.db
        .prepare(
          "SELECT path,revision,kind,length(content) AS size,deleted FROM files WHERE project=? ORDER BY path",
        )
        .all(id) as Row[]
    ).map((r) => ({ ...r, deleted: !!r.deleted }) as FileInfo);
  }
  file(id: string, name: string, includeDeleted = false): Row {
    this.requireProject(id);
    this.assertDiskAvailable(id);
    safePath(name);
    const row = this.db
      .prepare("SELECT * FROM files WHERE project=? AND path=?")
      .get(id, name) as Row | undefined;
    if (!row || (row.deleted && !includeDeleted))
      throw new AppError(404, "File not found.");
    return { ...row, content: Buffer.from(row.content) };
  }
  readText(id: string, name: string): TextFile {
    const r = this.file(id, name);
    if (r.kind !== "text")
      throw new AppError(400, "This file is not editable text.");
    return {
      path: name,
      revision: r.revision,
      content: decodeSource(name, r.content),
    };
  }
  exportFiles(id: string): ImportedFile[] {
    this.requireProject(id);
    return (
      this.db
        .prepare(
          "SELECT * FROM files WHERE project=? AND deleted=0 ORDER BY path",
        )
        .all(id) as Row[]
    ).map((r) => ({
      path: r.path,
      data: Buffer.from(r.content),
      directory: r.kind === "directory",
    }));
  }
  create(name: string, files: ImportedFile[] = []) {
    validateTree(files);
    const roots = findRoots(files);
    return this.createManagedProject((id) => {
      this.db
        .prepare(
          "INSERT INTO projects(id,name,root,engine,generation,updated) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id,
          name.trim().slice(0, 120) || "Untitled project",
          roots[0] ?? "",
          "pdflatex",
          0,
          new Date().toISOString(),
        );
      for (const file of files)
        this.insert(
          id,
          file.path,
          file.data,
          file.directory ? "directory" : kindOf(file.path, file.data),
          0,
        );
    }, "Project created");
  }
  /** Internal adoption boundary; API/UI opening still requires a reviewed inventory. */
  createLinked(
    name: string,
    directory: DirectoryIdentity,
    files: ImportedFile[],
    entry?: string,
  ) {
    this.directories.validateNew(directory);
    validateTree(files);
    const roots = findRoots(files),
      root = entry ?? roots[0] ?? "";
    if (
      root &&
      (!root.endsWith(".tex") ||
        !files.some((f) => f.path === root && !f.directory))
    )
      throw new AppError(400, "Choose an existing .tex main document.");
    return this.createManagedProject((id) => {
      this.db
        .prepare(
          "INSERT INTO projects(id,name,root,engine,generation,updated) VALUES(?,?,?,?,0,?)",
        )
        .run(
          id,
          name.trim().slice(0, 120) || path.basename(directory.path),
          root,
          "pdflatex",
          new Date().toISOString(),
        );
      this.directories.bind(id, directory);
      for (const file of files)
        this.db.prepare("INSERT INTO files VALUES(?,?,0,?,?,0)").run(
          id,
          file.path,
          file.directory
            ? "directory"
            : file.data.length <= 2 * 1024 * 1024 && isUtf8(file.data)
              ? kindOf(file.path, file.data)
              : "binary",
          file.data,
        );
    }, "Local folder opened");
  }
  /** Explicit identity-bound relocation only; caller must reconcile before opening source. */
  relocateDirectory(
    id: string,
    generation: number,
    directory: DirectoryIdentity,
  ) {
    this.assertSourceOwner(id);
    return this.transaction(() => {
      if (this.requireProject(id).generation !== generation)
        throw new AppError(
          409,
          "The project changed. Review the local folder again.",
        );
      this.directories.relocate(id, directory);
      return this.project(id);
    });
  }
  createManagedProject(initialize: (id: string) => void, label: string) {
    const id = randomUUID(),
      parent = path.join(this.root, "projects"),
      destination = path.join(parent, id);
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
      throw new AppError(400, "Symlinked project storage is not allowed.");
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    // Reserve only a new directory; cleanup must never remove an existing project.
    fs.mkdirSync(destination, { mode: 0o700 });
    try {
      return this.transaction(() => {
        initialize(id);
        const linked = !!this.directories.binding(id);
        for (const file of this.fileList(id)) {
          const row = this.db
            .prepare("SELECT * FROM files WHERE project=? AND path=?")
            .get(id, file.path) as Row;
          if (linked) {
            const actual = this.disk.inspect(id, file.path);
            if (!sameDisk(actual, rowMark(row as any)))
              throw new DiskConflict(file.path, "changed after the local folder review");
            this.disk.acknowledge(id, file.path, actual, row.revision);
          } else {
            // Copies/templates may insert blobs directly. Reserve a creation intent.
            this.disk.prepare(id, file.path, undefined, row as any);
          }
        }
        if (linked) this.directories.directory(id);
        else this.materialize(id);
        this.checkpoint(id, label, true);
        return this.project(id);
      });
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
  }
  copy(sourceId: string, input: any): Project {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (
      !name ||
      name.length > 120 ||
      /[\u0000-\u001f\u007f]/u.test(name) ||
      Buffer.from(name).toString("utf8") !== name
    )
      throw new AppError(
        400,
        "Enter a project name of 1–120 characters without control characters.",
      );
    if (!Number.isSafeInteger(input?.generation) || input.generation < 0)
      throw new AppError(
        400,
        "Refresh the copy preview to capture a valid source revision.",
      );
    if (
      typeof input?.requestId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
        input.requestId,
      )
    )
      throw new AppError(400, "A valid copy request ID is required.");
    const previous = this.db
      .prepare("SELECT * FROM project_copies WHERE request=?")
      .get(input.requestId) as Row | undefined;
    if (previous) {
      if (
        previous.source !== sourceId ||
        previous.name !== name ||
        previous.generation !== input.generation
      )
        throw new AppError(
          409,
          "This request ID belongs to another copy. Start a new copy request.",
        );
      return this.project(previous.project);
    }
    return this.createManagedProject((id) => {
      this.unlocked(sourceId);
      if (
        this.runs(sourceId).some((run) =>
          ["generating", "typing", "paused", "preview"].includes(run.status),
        )
      )
        throw new AppError(
          409,
          "Finish or stop the active AI request before copying this project.",
        );
      const original = this.requireProject(sourceId);
      if (original.generation !== input.generation)
        throw new AppError(
          409,
          "The original project changed. Refresh the copy preview before creating a copy.",
        );
      const active = this.fileList(sourceId).filter((file) => !file.deleted);
      validateTree(
        active.map((file) => ({
          path: file.path,
          data: Buffer.alloc(0),
          directory: file.kind === "directory",
        })),
      );
      const root = active.some(
        (file) => file.kind === "text" && file.path === original.root,
      )
        ? original.root
        : "";
      this.db
        .prepare(
          "INSERT INTO projects(id,name,root,engine,generation,updated) VALUES(?,?,?,?,0,?)",
        )
        .run(id, name, root, original.engine, new Date().toISOString());
      // SQLite copies the canonical BLOBs directly, preserving assets and legacy encodings.
      this.db
        .prepare(
          "INSERT INTO files(project,path,revision,kind,content,deleted) SELECT ?,path,0,kind,content,0 FROM files WHERE project=? AND deleted=0",
        )
        .run(id, sourceId);
      this.db
        .prepare("INSERT INTO project_copies VALUES(?,?,?,?,?)")
        .run(input.requestId, sourceId, id, name, input.generation);
    }, "Project copied");
  }
  insert(
    id: string,
    name: string,
    content: Buffer,
    kind: string,
    revision: number,
    reviewAction = false,
  ) {
    safePath(name);
    const previous = this.db
      .prepare(
        "SELECT kind,content,deleted,revision FROM files WHERE project=? AND path=?",
      )
      .get(id, name) as Row | undefined;
    if (!this.recoveringDisk)
      this.disk.prepare(id, name, previous as any, { kind, content, revision });
    if (previous?.kind === "text" && kind === "text")
      rebaseComments(
        this.db,
        id,
        name,
        Buffer.from(previous.content).toString("utf8"),
        content.toString("utf8"),
      );
    if (!reviewAction && previous?.kind === "text" && kind === "text")
      recordTracked(
        this.db,
        id,
        name,
        Buffer.from(previous.content).toString("utf8"),
        content.toString("utf8"),
      );
    this.db
      .prepare(
        "INSERT INTO files VALUES(?,?,?,?,?,0) ON CONFLICT(project,path) DO UPDATE SET revision=excluded.revision,kind=excluded.kind,content=excluded.content,deleted=0",
      )
      .run(id, name, revision, kind, content);
  }
  touch(id: string) {
    this.db
      .prepare(
        "UPDATE projects SET generation=generation+1,updated=? WHERE id=?",
      )
      .run(new Date().toISOString(), id);
    this.scheduleHistory(id);
  }
  nextFileRevision(id: string, name: string, minimum = 0) {
    const version = this.db
      .prepare(
        "SELECT MAX(revision) AS revision FROM versions WHERE project=? AND path=?",
      )
      .get(id, name) as Row;
    return Math.max(
      minimum,
      version.revision === null ? 0 : Number(version.revision) + 1,
    );
  }
  unlocked(id: string, name?: string, runId?: string) {
    this.assertSourceOwner(id, name, runId);
    this.assertDiskAvailable(id);
    for (const f of this.fileList(id).filter(
      (f) => !name || f.path === name || f.path.startsWith(name + "/"),
    )) {
      const row = this.db
        .prepare("SELECT * FROM files WHERE project=? AND path=?")
        .get(id, f.path) as Row;
      this.disk.prepare(id, f.path, row as any);
    }
  }
  /** Source ownership check without changing disk receipts; recovery must inspect conflicts. */
  assertSourceOwner(id: string, name?: string, runId?: string) {
    this.requireProject(id);
    const projectOwner = this.projectLocks.get(id);
    if (projectOwner && projectOwner !== runId)
      throw new AppError(
        409,
        "This project is reserved by an active AI run. You can read files; stop the run before editing.",
      );
    for (const [key, owner] of this.locks) {
      if (
        key.startsWith(id + "/") &&
        (!name ||
          key === id + "/" + name ||
          key.startsWith(id + "/" + name + "/")) &&
        owner !== runId
      )
        throw new AppError(
          409,
          "This file is reserved by an active typing run. Stop it first.",
        );
    }
  }
  save(
    id: string,
    name: string,
    content: string,
    revision: number,
    runId?: string,
    updateMetadata?: (revision: number) => void,
  ) {
    if (Buffer.byteLength(content) > 2 * 1024 * 1024)
      throw new AppError(413, "Editable text is limited to 2 MB per file.");
    validateSourceInput(content);
    this.assertSourceOwner(id, name, runId);
    const old = this.file(id, name);
    if (old.kind !== "text")
      throw new AppError(400, "This file is not editable text.");
    decodeSource(name, old.content);
    if (old.revision !== revision)
      throw new AppError(
        409,
        "The file changed elsewhere. Reload before saving.",
      );
    if (content !== Buffer.from(old.content).toString("utf8"))
      this.directories.assertWritable(id, name);
    this.unlocked(id, name, runId);
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
        )
        .run(id, name, revision, old.content, new Date().toISOString());
      this.insert(id, name, Buffer.from(content), "text", revision + 1);
      this.touch(id);
      updateMetadata?.(revision + 1);
    });
    this.materializeFile(id, name);
    return this.readText(id, name);
  }
  add(id: string, name: string, data: Buffer, directory = false) {
    this.requireProject(id);
    safePath(name);
    this.unlocked(id, name);
    if (
      this.db
        .prepare("SELECT 1 FROM files WHERE project=? AND path=?")
        .get(id, name)
    )
      throw new AppError(
        409,
        "A file with this name already exists, possibly in Trash.",
      );
    // Reject file/directory prefix collisions before filesystem writes.
    validateTree([
      ...this.fileList(id).map((f) => ({
        path: f.path,
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
      { path: name, data, directory },
    ]);
    const entries = this.fileList(id).filter((f) => !f.deleted);
    if (
      entries.some(
        (f) =>
          (name.startsWith(f.path + "/") && f.kind !== "directory") ||
          (!directory && f.path.startsWith(name + "/")),
      )
    )
      throw new AppError(
        409,
        "This name conflicts with an existing directory or file.",
      );
    this.transaction(() => {
      this.insert(
        id,
        name,
        data,
        directory ? "directory" : kindOf(name, data),
        this.nextFileRevision(id, name),
      );
      this.touch(id);
    });
    this.materializeFile(id, name);
    return this.project(id);
  }
  update(
    id: string,
    update: { name?: string; root?: string; engine?: Engine },
  ) {
    const old = this.requireProject(id);
    this.unlocked(id);
    if (update.root) {
      const f = this.file(id, update.root);
      if (f.kind !== "text" || !update.root.endsWith(".tex"))
        throw new AppError(400, "Choose a .tex root document.");
    }
    if (
      update.engine &&
      !["pdflatex", "latex", "xelatex", "lualatex"].includes(update.engine)
    )
      throw new AppError(400, "Unknown TeX engine.");
    this.db
      .prepare(
        "UPDATE projects SET name=?,root=?,engine=?,generation=generation+1,updated=? WHERE id=?",
      )
      .run(
        update.name?.trim().slice(0, 120) || old.name,
        update.root ?? old.root,
        update.engine ?? old.engine,
        new Date().toISOString(),
        id,
      );
    this.scheduleHistory(id);
    return this.project(id);
  }
  rename(id: string, from: string, to: string) {
    return new FileMoves(this).rename(id, from, to);
  }
  trash(id: string, name: string, restore = false) {
    if (this.directories.binding(id)) {
      const generation = this.requireProject(id).generation;
      return new FileBatches(this).state(id, restore ? "restore" : "trash", {
        generation,
        paths: [name],
        requestId: randomUUID(),
      }).project;
    }
    this.unlocked(id, name);
    safePath(name);
    const rows = this.fileList(id).filter(
      (f) => f.path === name || f.path.startsWith(name + "/"),
    );
    if (!rows.length) throw new AppError(404, "File not found.");
    if (restore)
      validateTree(
        this.fileList(id)
          .filter((f) => !f.deleted || rows.some((r) => r.path === f.path))
          .map((f) => ({
            path: f.path,
            data: Buffer.alloc(0),
            directory: f.kind === "directory",
          })),
      );
    this.transaction(() => {
      for (const f of rows)
        this.db
          .prepare(
            "UPDATE files SET deleted=?,revision=revision+1 WHERE project=? AND path=?",
          )
          .run(restore ? 0 : 1, id, f.path);
      this.touch(id);
    });
    this.materialize(id);
    return this.project(id);
  }
  materializeFile(id: string, name: string) {
    this.disk.write(id, name, this.file(id, name, true) as any);
  }
  assertDiskAvailable(id: string) {
    if (this.directories.binding(id)) {
      this.directories.directory(id);
      this.linkedBatches.assertReady(id);
      this.linkedMoves.assertReady(id);
    }
    const issue = this.diskIssues.get(id);
    if (issue) throw new AppError(409, issue);
  }
  /** Reconcile indexed files only; unindexed files and imported scripts stay untouched. */
  adoptDiscovered(
    id: string,
    input: {
      requestId: string;
      signature: string;
      generation: number;
      entries: CapturedDiskFile[];
    },
  ) {
    return this.transaction(() => {
      this.requireProject(id);
      const previous = this.db
        .prepare("SELECT project,signature FROM disk_imports WHERE request=?")
        .get(input.requestId) as Row | undefined;
      const paths = input.entries.map((e) => e.path);
      if (previous) {
        if (previous.project !== id || previous.signature !== input.signature)
          throw new AppError(
            409,
            "This disk import identifier belongs to another request.",
          );
        return { project: this.project(id), imported: paths, replayed: true };
      }
      this.assertSourceOwner(id);
      this.assertDiskAvailable(id);
      if (this.requireProject(id).generation !== input.generation)
        throw new AppError(
          409,
          "Project source changed. Refresh the disk review.",
        );
      let total = 0;
      for (const entry of input.entries) {
        safePath(entry.path);
        if (
          this.db
            .prepare("SELECT 1 FROM files WHERE project=? AND path=?")
            .get(id, entry.path)
        )
          throw new AppError(
            409,
            "A chosen disk path is already indexed. Refresh the review.",
          );
        if (this.disk.receipt(id, entry.path)?.pending)
          throw new AppError(
            409,
            "A chosen disk path has an unfinished save. Recover it before importing.",
          );
        if (
          !["file", "directory"].includes(entry.actual.kind) ||
          !sameDisk(this.disk.inspect(id, entry.path), entry.actual)
        )
          throw new AppError(
            409,
            "A chosen disk file changed. Refresh the review; physical files are kept.",
          );
        total += entry.actual.bytes?.length ?? 0;
        if (total > DISK_RECOVERY_BYTES)
          throw new AppError(413, "Disk import exceeds 128 MiB.");
        if (
          entry.actual.kind === "file" &&
          (!entry.actual.bytes ||
            rowMark({
              kind: "binary",
              content: entry.actual.bytes,
              revision: 0,
            }).hash !== entry.actual.hash)
        )
          throw new AppError(
            409,
            "Captured disk bytes do not match this review.",
          );
      }
      validateTree([
        ...this.fileList(id)
          .filter((f) => !f.deleted)
          .map((f) => ({
            path: f.path,
            data: Buffer.alloc(0),
            directory: f.kind === "directory",
          })),
        ...input.entries.map((e) => ({
          path: e.path,
          data: Buffer.alloc(0),
          directory: e.actual.kind === "directory",
        })),
      ]);
      this.checkpoint(
        id,
        "Before importing disk files",
        true,
        captureReview(this.db, id),
      );
      this.recoveringDisk = true;
      try {
        for (const entry of input.entries) {
          // Adopt inspected bytes; never materialize or rewrite these physical files.
          this.insert(
            id,
            entry.path,
            entry.actual.bytes ?? Buffer.alloc(0),
            discoveredKind(entry.path, entry.actual),
            0,
          );
          this.disk.acknowledge(id, entry.path, entry.actual, 0);
        }
      } finally {
        this.recoveringDisk = false;
      }
      this.touch(id);
      this.checkpoint(
        id,
        "Imported disk files",
        true,
        captureReview(this.db, id),
      );
      this.db
        .prepare("INSERT INTO disk_imports VALUES(?,?,?,?)")
        .run(input.requestId, id, input.signature, new Date().toISOString());
      return { project: this.project(id), imported: paths, replayed: false };
    });
  }
  reconcileDisk(
    id: string,
    only?: string,
    adoptDisk = false,
    reviewed?: { generation: number; revision: number; disk: DiskMark },
  ) {
    this.requireProject(id);
    const assertReviewed = () => {
      if (
        reviewed &&
        (!only || this.requireProject(id).generation !== reviewed.generation)
      )
        throw new AppError(
          409,
          "The file changed again. Refresh the comparison; your edited text is kept.",
        );
    };
    assertReviewed();
    const linked = !!this.directories.binding(id);
    if (only) {
      safePath(only);
      if (linked) {
        this.linkedBatches.assertReady(id);
        this.linkedMoves.assertReady(id);
      }
    } else {
      if (linked) {
        this.linkedBatches.recover(id);
        this.linkedMoves.recover(id);
      }
      this.diskIssues.delete(id);
    }
    const root = this.projectDir(id);
    if (!linked) recoverFileTree(this.db, path.dirname(root));
    const entries = this.fileList(id);
    if (entries.length > 10000)
      throw new DiskConflict(
        "Project",
        "exceeds the 10,000 indexed-file reconciliation limit",
      );
    const plan: {
      path: string;
      old: Row;
      actual: DiskEntry;
      action: "ack" | "replay" | "adopt" | "delete";
    }[] = [];
    let bytes = 0;
    for (const f of entries) {
      if (only && f.path !== only) continue;
      const row = this.db
        .prepare("SELECT * FROM files WHERE project=? AND path=?")
        .get(id, f.path) as Row;
      const desired = rowMark(row as any),
        actual = this.disk.inspect(id, f.path),
        base = this.disk.receipt(id, f.path);
      if (
        reviewed &&
        (row.revision !== reviewed.revision || !sameDisk(actual, reviewed.disk))
      )
        throw new AppError(
          409,
          "The file changed again. Refresh the comparison; your edited text is kept.",
        );
      const action = sameDisk(actual, desired)
        ? "ack"
        : !adoptDisk &&
            base?.pending &&
            sameDisk(actual, base) &&
            actual.kind !== "directory"
          ? "replay"
          : actual.kind === "missing"
            ? "delete"
            : "adopt";
      if (action === "adopt") {
        bytes += actual.bytes?.length ?? 0;
        if (bytes > DISK_RECOVERY_BYTES)
          throw new DiskConflict(
            "Project",
            "has more than 128 MiB of changed disk content to recover in one pass",
          );
      } else delete actual.bytes;
      plan.push({
        path: f.path,
        old: { ...row, content: undefined, hash: desired.hash },
        actual,
        action,
      });
    }
    const changes = plan.filter(
      (p) => p.action === "adopt" || p.action === "delete",
    );
    const next = plan.flatMap((p) => {
      const active =
        p.action === "adopt" || (p.action !== "delete" && !p.old.deleted);
      return active
        ? [
            {
              path: p.path,
              data: Buffer.alloc(0),
              directory:
                p.action === "adopt"
                  ? p.actual.kind === "directory"
                  : p.old.kind === "directory",
            },
          ]
        : [];
    });
    if (only)
      next.push(
        ...entries
          .filter((f) => f.path !== only && !f.deleted)
          .map((f) => ({
            path: f.path,
            data: Buffer.alloc(0),
            directory: f.kind === "directory",
          })),
      );
    try {
      validateTree(next);
    } catch (e) {
      if (e instanceof AppError)
        throw new DiskConflict(
          "Project",
          `has an inconsistent recovered tree (${e.message})`,
        );
      throw e;
    }
    this.recoveringDisk = true;
    try {
      this.transaction(() => {
        assertReviewed();
        // Recheck before the first database change; no partial adoption if a
        // non-cooperating disk writer changes a captured recovery version.
        for (const p of plan) {
          const current = this.db
            .prepare("SELECT * FROM files WHERE project=? AND path=?")
            .get(id, p.path) as Row;
          if (
            current.revision !== p.old.revision ||
            current.deleted !== p.old.deleted ||
            current.kind !== p.old.kind ||
            rowMark(current as any).hash !== p.old.hash
          )
            throw new DiskConflict(
              p.path,
              "database source changed during recovery",
            );
          if (
            (reviewed || p.action !== "ack") &&
            !sameDisk(this.disk.inspect(id, p.path), p.actual)
          )
            throw new DiskConflict(
              p.path,
              "disk source changed during recovery",
            );
        }
        const backup = changes.length
          ? this.checkpoint(
              id,
              "Before recovering disk changes",
              true,
              captureReview(this.db, id),
            )
          : undefined;
        for (const p of plan) {
          if (p.action === "replay") {
            this.materializeFile(id, p.path);
            continue;
          }
          if (p.action === "ack") {
            this.disk.acknowledge(id, p.path, p.actual, p.old.revision);
            continue;
          }
          const current = this.db
            .prepare("SELECT * FROM files WHERE project=? AND path=?")
            .get(id, p.path) as Row;
          this.db
            .prepare(
              "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
            )
            .run(
              id,
              p.path,
              current.revision,
              current.content,
              new Date().toISOString(),
            );
          const revision = current.revision + 1;
          if (p.action === "delete") {
            this.db
              .prepare(
                "UPDATE files SET deleted=1,revision=? WHERE project=? AND path=?",
              )
              .run(revision, id, p.path);
          } else {
            const content = p.actual.bytes ?? Buffer.alloc(0);
            const kind =
              p.actual.kind === "directory"
                ? "directory"
                : content.length <= 2 * 1024 * 1024 &&
                    kindOf(p.path, content) === "text" &&
                    Buffer.from(content.toString("utf8")).equals(content)
                  ? "text"
                  : "binary";
            this.insert(id, p.path, content, kind, revision);
          }
          this.disk.acknowledge(id, p.path, p.actual, revision);
        }
        if (changes.length) {
          this.db
            .prepare(
              "UPDATE projects SET generation=generation+1,updated=? WHERE id=?",
            )
            .run(new Date().toISOString(), id);
          const recovered = this.checkpoint(
            id,
            "Recovered disk changes",
            true,
            captureReview(this.db, id),
          );
          this.setSetting("disk-recovery:" + id, {
            created: new Date().toISOString(),
            backup: backup!.id,
            recovered: recovered.id,
            paths: changes.map((p) => ({
              path: p.path,
              change: p.action,
              restored: !!p.old.deleted,
            })),
          });
        }
      });
    } finally {
      this.recoveringDisk = false;
    }
  }
  materialize(id: string) {
    const root = this.projectDir(id);
    if (!this.directories.binding(id)) {
      recoverFileTree(this.db, path.dirname(root));
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    }
    for (const file of this.fileList(id).sort(
      (a, b) =>
        Number(b.deleted) - Number(a.deleted) ||
        (a.deleted
          ? b.path.length - a.path.length
          : a.path.length - b.path.length),
    ))
      this.materializeFile(id, file.path);
  }
  scheduleHistory(id: string) {
    const pending = this.historyTimers.get(id),
      started = pending?.started ?? Date.now();
    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(
      () => {
        if (this.projectLocks.has(id)) {
          this.historyTimers.delete(id);
          this.scheduleHistory(id);
          return;
        }
        this.automaticCheckpoint(id);
      },
      Math.max(0, Math.min(10000, 60000 - (Date.now() - started))),
    );
    timer.unref();
    this.historyTimers.set(id, { timer, started });
  }
  scheduleReviewHistory(id: string) {
    if (reviewHistoryEnabled(this.db, id)) this.scheduleHistory(id);
  }
  automaticCheckpoint(id: string, name = "Automatic save") {
    const pending = this.historyTimers.get(id);
    if (pending) clearTimeout(pending.timer);
    this.historyTimers.delete(id);
    const project = this.requireProject(id, true);
    const review = reviewHistoryEnabled(this.db, id)
      ? captureReview(this.db, id)
      : { reviewOmitted: "Review state was not included in this version." };
    const last = this.db
      .prepare(
        "SELECT payload FROM checkpoints WHERE project=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(id) as Row | undefined;
    if (
      last &&
      JSON.parse(last.payload).project.generation === project.generation &&
      JSON.parse(last.payload).reviewHash === review.reviewHash &&
      JSON.parse(last.payload).reviewOmitted === review.reviewOmitted
    )
      return null;
    return this.checkpoint(id, name, true, review);
  }
  checkpoint(
    id: string,
    name: string,
    automatic = false,
    captured?: ReviewReference,
  ) {
    this.requireProject(id, true);
    const title = automatic
      ? name.slice(0, 120).replace(/[\uD800-\uDBFF]$/u, "") || "Checkpoint"
      : labelName(name);
    this.db.exec("SAVEPOINT checkpoint_create");
    try {
      const cid = randomUUID(),
        created = new Date().toISOString();
      const review =
        captured ??
        (reviewHistoryEnabled(this.db, id)
          ? captureReview(this.db, id)
          : {
              reviewOmitted: "Review state was not included in this version.",
            });
      const files = (
        this.db.prepare("SELECT * FROM files WHERE project=?").all(id) as Row[]
      ).map((f) => {
        const content = Buffer.from(f.content),
          hash = createHash("sha256").update(content).digest("hex");
        this.db
          .prepare("INSERT OR IGNORE INTO history_blobs VALUES(?,?)")
          .run(hash, content);
        return { ...f, content: undefined, contentHash: hash };
      });
      this.db
        .prepare(
          "INSERT INTO checkpoints(id,project,name,payload,created,automatic) VALUES(?,?,?,?,?,?)",
        )
        .run(
          cid,
          id,
          title,
          JSON.stringify({
            files,
            project: this.requireProject(id, true),
            ...review,
          }),
          created,
          automatic ? 1 : 0,
        );
      seedVersionLabels(this.db, cid, title, automatic ? 1 : 0, created);
      this.db.exec("RELEASE checkpoint_create");
      return { id: cid, name: title, created };
    } catch (e) {
      this.db.exec("ROLLBACK TO checkpoint_create; RELEASE checkpoint_create");
      throw e;
    }
  }
  checkpoints(id: string) {
    return this.db
      .prepare(
        "SELECT c.id,c.name,c.created,c.automatic,s.labels,s.revision labelRevision,CASE WHEN json_extract(c.payload,'$.reviewHash') IS NOT NULL THEN 1 ELSE 0 END AS reviewAvailable,json_extract(c.payload,'$.reviewOmitted') reviewOmitted FROM checkpoints c LEFT JOIN history_label_state s ON s.checkpoint=c.id WHERE c.project=? ORDER BY c.rowid DESC",
      )
      .all(id)
      .map(labelVersion);
  }
  snapshot(
    id: string,
    cid?: string,
  ): { project: Row; files: Row[] } & ReviewReference {
    this.requireProject(id);
    if (!cid)
      return {
        project: this.requireProject(id),
        files: this.db
          .prepare("SELECT * FROM files WHERE project=? ORDER BY path")
          .all(id) as Row[],
      };
    const row = this.db
      .prepare("SELECT payload FROM checkpoints WHERE id=? AND project=?")
      .get(cid, id) as Row | undefined;
    if (!row) throw new AppError(404, "Project version not found.");
    return JSON.parse(row.payload) as {
      project: Row;
      files: Row[];
    } & ReviewReference;
  }
  snapshotBytes(file: Row) {
    if (file.contentHash) {
      const row = this.db
        .prepare("SELECT content FROM history_blobs WHERE hash=?")
        .get(file.contentHash) as Row | undefined;
      if (!row) throw new AppError(409, "This history snapshot is incomplete.");
      const bytes = Buffer.from(row.content);
      if (createHash("sha256").update(bytes).digest("hex") !== file.contentHash)
        throw new AppError(409, "This history snapshot is incomplete.");
      return bytes;
    }
    return typeof file.content === "string"
      ? Buffer.from(file.content, "base64")
      : Buffer.from(file.content);
  }
  compareHistory(id: string, cid: string, target?: string) {
    const before = this.snapshot(id, cid),
      after = this.snapshot(id, target);
    const a = new Map(before.files.map((f) => [f.path, f])),
      b = new Map(after.files.map((f) => [f.path, f]));
    const files = [...new Set([...a.keys(), ...b.keys()])]
      .sort()
      .flatMap((name) => {
        const old = a.get(name),
          current = b.get(name),
          was = old && !old.deleted,
          now = current && !current.deleted;
        if (
          (!was && !now) ||
          (old?.kind === "directory" && current?.kind === "directory")
        )
          return [];
        const equal =
          was &&
          now &&
          old.kind === current.kind &&
          this.snapshotBytes(old).equals(this.snapshotBytes(current));
        return [
          {
            path: name,
            kind: current?.kind || old?.kind,
            change: !was
              ? "added"
              : !now
                ? "deleted"
                : equal
                  ? "unchanged"
                  : "modified",
            currentRevision:
              (
                this.db
                  .prepare(
                    "SELECT revision FROM files WHERE project=? AND path=?",
                  )
                  .get(id, name) as Row | undefined
              )?.revision ?? null,
            restorable: !!was && old.kind !== "directory",
          },
        ];
      });
    return {
      files,
      currentGeneration: this.requireProject(id).generation,
      settingsChanged:
        before.project.root !== after.project.root ||
        before.project.engine !== after.project.engine,
    };
  }
  historyFile(id: string, cid: string, name: string, target?: string) {
    safePath(name);
    const before = this.snapshot(id, cid).files.find(
        (f) => f.path === name && !f.deleted,
      ),
      after = this.snapshot(id, target).files.find(
        (f) => f.path === name && !f.deleted,
      );
    if (!before && !after)
      throw new AppError(404, "File not present in either version.");
    const beforeBytes =
        before?.kind === "text" ? this.snapshotBytes(before) : undefined,
      afterBytes =
        after?.kind === "text" ? this.snapshotBytes(after) : undefined,
      beforeText =
        before?.kind === "text" && beforeBytes && isUtf8(beforeBytes),
      afterText = after?.kind === "text" && afterBytes && isUtf8(afterBytes),
      kind =
        (before?.kind === "text" && !beforeText) ||
        (after?.kind === "text" && !afterText)
          ? "binary"
          : before?.kind || after?.kind;
    return {
      path: name,
      kind,
      before: beforeText ? beforeBytes!.toString("utf8") : null,
      after: afterText ? afterBytes!.toString("utf8") : null,
    };
  }
  exportCheckpoint(id: string, cid: string): ImportedFile[] {
    return this.snapshot(id, cid)
      .files.filter((f) => !f.deleted)
      .map((f) => ({
        path: f.path,
        data: this.snapshotBytes(f),
        directory: f.kind === "directory",
      }));
  }
  labelCheckpoint(id: string, cid: string, name: string) {
    return new HistoryLabels(this).legacyAdd(id, cid, name);
  }
  restoreCheckpointFile(
    id: string,
    cid: string,
    name: string,
    expectedRevision: unknown,
    recover?: (backupId: string) => void,
  ) {
    this.unlocked(id);
    safePath(name);
    const file = this.snapshot(id, cid).files.find(
      (f) => f.path === name && !f.deleted && f.kind !== "directory",
    );
    if (!file)
      throw new AppError(404, "Choose an existing file in this version.");
    const current = this.db
      .prepare("SELECT * FROM files WHERE project=? AND path=?")
      .get(id, name) as Row | undefined;
    if ((current?.revision ?? null) !== expectedRevision)
      throw new AppError(
        409,
        "This file changed after comparison. Refresh the history comparison before restoring.",
      );
    const content = this.snapshotBytes(file);
    validateTree([
      ...this.exportFiles(id).filter((f) => f.path !== name),
      { path: name, data: content },
    ]);
    const backup = this.checkpoint(
      id,
      "Before restoring " + name,
      true,
      captureReview(this.db, id),
    );
    this.transaction(() => {
      if (current)
        this.db
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
      this.insert(id, name, content, file.kind, (current?.revision ?? -1) + 1);
      recover?.(backup.id);
      this.touch(id);
    });
    this.materialize(id);
    this.automaticCheckpoint(id, "Restored " + name);
    return this.project(id);
  }
  restoreCheckpoint(
    id: string,
    cid: string,
    recover?: (backupId: string) => void,
  ) {
    this.unlocked(id);
    const row = this.db
      .prepare("SELECT name,payload FROM checkpoints WHERE id=? AND project=?")
      .get(cid, id) as Row | undefined;
    if (!row) throw new AppError(404, "Checkpoint not found.");
    const backup = this.checkpoint(
      id,
      "Before restoring " + new HistoryLabels(this).get(id, cid).name,
      true,
      captureReview(this.db, id),
    );
    const snapshot = JSON.parse(row.payload),
      existing = this.fileList(id);
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE files SET deleted=1,revision=revision+1 WHERE project=?",
        )
        .run(id);
      for (const f of snapshot.files) {
        const rev =
          (existing.find((x) => x.path === f.path)?.revision ?? -1) + 1;
        const content = this.snapshotBytes(f);
        this.insert(id, f.path, Buffer.from(content), f.kind, rev);
        if (f.deleted)
          this.db
            .prepare("UPDATE files SET deleted=1 WHERE project=? AND path=?")
            .run(id, f.path);
      }
      this.db
        .prepare("UPDATE projects SET root=?,engine=? WHERE id=?")
        .run(snapshot.project.root, snapshot.project.engine, id);
      recover?.(backup.id);
      this.touch(id);
    });
    this.materialize(id);
    return this.project(id);
  }
  createConversation(
    projectId: string,
    title = "New conversation",
    includeTrashed = false,
  ): Conversation {
    this.requireProject(projectId, includeTrashed);
    const now = new Date().toISOString(),
      c = {
        id: randomUUID(),
        projectId,
        title: title.slice(0, 100),
        created: now,
        updated: now,
      };
    this.db
      .prepare("INSERT INTO conversations VALUES(?,?,?)")
      .run(c.id, projectId, JSON.stringify(c));
    return c;
  }
  conversation(
    id: string,
    projectId: string,
  ): Conversation & { sessions?: Record<string, string> } {
    const row = this.db
      .prepare("SELECT payload FROM conversations WHERE id=? AND project=?")
      .get(id, projectId) as Row | undefined;
    if (!row)
      throw new AppError(404, "Conversation not found in this project.");
    return JSON.parse(row.payload);
  }
  conversations(projectId: string): Conversation[] {
    this.requireProject(projectId);
    return (
      this.db
        .prepare(
          "SELECT payload FROM conversations WHERE project=? ORDER BY rowid DESC",
        )
        .all(projectId) as Row[]
    )
      .map((r) => {
        const c = JSON.parse(r.payload);
        delete c.sessions;
        return c;
      })
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }
  activeConversation(projectId: string): string | null {
    const saved = this.setting("chat.active:" + projectId, undefined),
      all = this.conversations(projectId);
    if (saved === null) return null;
    return (
      all.find((c) => c.id === saved && !c.archivedAt)?.id ??
      all.find((c) => !c.archivedAt)?.id ??
      null
    );
  }
  selectConversation(projectId: string, id: string | null) {
    this.requireProject(projectId);
    if (id !== null && this.conversation(id, projectId).archivedAt)
      throw new AppError(
        409,
        "Restore this archived conversation before continuing it.",
      );
    this.setSetting("chat.active:" + projectId, id);
  }
  updateConversation(c: Conversation & { sessions?: Record<string, string> }) {
    c.updated = new Date().toISOString();
    this.db
      .prepare("UPDATE conversations SET payload=? WHERE id=? AND project=?")
      .run(JSON.stringify(c), c.id, c.projectId);
  }
  saveRun(run: AiRun & Record<string, any>) {
    this.db
      .prepare(
        "INSERT INTO runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(run.id, run.projectId, JSON.stringify(run));
  }
  run(id: string): AiRun & Record<string, any> {
    const row = this.db
      .prepare("SELECT payload FROM runs WHERE id=?")
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, "AI run not found.");
    return JSON.parse(row.payload);
  }
  runs(project: string): AiRun[] {
    return (
      this.db
        .prepare("SELECT payload FROM runs WHERE project=? ORDER BY rowid")
        .all(project) as Row[]
    ).map((r) => {
      const x = JSON.parse(r.payload);
      delete x.before;
      return x;
    });
  }
  saveProposal(p: Proposal) {
    this.db
      .prepare(
        "INSERT INTO proposals VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(p.id, p.projectId, JSON.stringify(p));
  }
  proposal(id: string): Proposal {
    const r = this.db
      .prepare("SELECT payload FROM proposals WHERE id=?")
      .get(id) as Row | undefined;
    if (!r) throw new AppError(404, "Proposal not found.");
    return JSON.parse(r.payload);
  }
  proposals(id: string): Proposal[] {
    return (
      this.db
        .prepare("SELECT payload FROM proposals WHERE project=?")
        .all(id) as Row[]
    ).map((r) => JSON.parse(r.payload));
  }
  applyProposal(pid: string, undo = false) {
    const p = this.proposal(pid);
    this.unlocked(p.projectId);
    if (p.status !== (undo ? "applied" : "pending"))
      throw new AppError(
        409,
        "This proposal is no longer available for this action.",
      );
    for (const f of p.files) {
      const current = this.readText(p.projectId, f.path);
      if (
        current.revision !==
          (undo ? p.appliedRevisions?.[f.path] : f.baseRevision) ||
        current.content !== (undo ? f.after : f.before)
      )
        throw new AppError(
          409,
          "A proposed file has changed. Generate a fresh proposal.",
        );
    }
    const revisions: Record<string, number> = {};
    this.transaction(() => {
      for (const f of p.files) {
        const current = this.readText(p.projectId, f.path);
        this.db
          .prepare(
            "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
          )
          .run(
            p.projectId,
            f.path,
            current.revision,
            Buffer.from(current.content),
            new Date().toISOString(),
          );
        this.insert(
          p.projectId,
          f.path,
          Buffer.from(undo ? f.before : f.after),
          "text",
          current.revision + 1,
        );
        revisions[f.path] = current.revision + 1;
      }
      this.touch(p.projectId);
      p.status = undo ? "undone" : "applied";
      p.appliedRevisions = revisions;
      this.saveProposal(p);
    });
    for (const f of p.files) this.materializeFile(p.projectId, f.path);
    return p;
  }
  setting(key: string, fallback: any) {
    const r = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key) as Row | undefined;
    return r ? JSON.parse(r.value) : fallback;
  }
  setSetting(key: string, value: any) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
}
