import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Project,
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

type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  locks = new Map<string, string>();
  constructor(public root: string) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, "prism.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,engine TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(project TEXT NOT NULL,path TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,content BLOB NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(project,path));
      CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,project TEXT,path TEXT,revision INTEGER,content BLOB,created TEXT);
      CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,project TEXT,name TEXT,payload TEXT,created TEXT);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,project TEXT,payload TEXT);
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,project TEXT,payload TEXT);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
    `);
    // Additive migration keeps existing projects and their revision history intact.
    const columns = this.db
      .prepare("PRAGMA table_info(projects)")
      .all() as Row[];
    if (!columns.some((column) => column.name === "deletedAt"))
      this.db.exec(
        "ALTER TABLE projects ADD COLUMN deletedAt TEXT DEFAULT NULL",
      );
    // Reconcile materialized files after a crash; SQLite is the durable revision authority.
    for (const row of this.db
      .prepare("SELECT id FROM projects WHERE deletedAt IS NULL")
      .all() as Row[])
      this.materialize(row.id);
    for (const row of this.db
      .prepare("SELECT id,payload FROM runs")
      .all() as Row[]) {
      const run = JSON.parse(row.payload);
      if (["generating", "typing", "paused"].includes(run.status)) {
        run.status = "interrupted";
        this.saveRun(run);
      }
    }
  }
  close() {
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
    return path.join(this.root, "projects", id, "files");
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
    return { ...r, files: this.fileList(id) } as Project;
  }
  trashProject(id: string, restore = false): Project {
    const current = this.requireProject(id, true);
    // Repeated requests are harmless and retain the original deletion date.
    if (restore ? !current.deletedAt : !!current.deletedAt)
      return this.project(id, true);
    if (!restore) {
      this.unlocked(id);
      if (
        this.runs(id).some((run) =>
          ["generating", "typing", "paused"].includes(run.status),
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
      if (restore) this.materialize(id);
    });
    return this.project(id, true);
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
      content: r.content.toString("utf8"),
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
    const id = randomUUID(),
      now = new Date().toISOString();
    const roots = findRoots(files);
    this.transaction(() => {
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
          now,
        );
      for (const file of files)
        this.insert(
          id,
          file.path,
          file.data,
          file.directory ? "directory" : kindOf(file.path, file.data),
          0,
        );
    });
    this.materialize(id);
    return this.project(id);
  }
  insert(
    id: string,
    name: string,
    content: Buffer,
    kind: string,
    revision: number,
  ) {
    safePath(name);
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
  }
  unlocked(id: string, name?: string, runId?: string) {
    this.requireProject(id);
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
  ) {
    if (Buffer.byteLength(content) > 2 * 1024 * 1024)
      throw new AppError(413, "Editable text is limited to 2 MB per file.");
    this.unlocked(id, name, runId);
    const old = this.file(id, name);
    if (old.kind !== "text")
      throw new AppError(400, "This file is not editable text.");
    if (old.revision !== revision)
      throw new AppError(
        409,
        "The file changed elsewhere. Reload before saving.",
      );
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
        )
        .run(id, name, revision, old.content, new Date().toISOString());
      this.insert(id, name, Buffer.from(content), "text", revision + 1);
      this.touch(id);
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
        0,
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
      !["pdflatex", "xelatex", "lualatex"].includes(update.engine)
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
    return this.project(id);
  }
  rename(id: string, from: string, to: string) {
    safePath(from);
    safePath(to);
    this.unlocked(id);
    const files = this.fileList(id).filter(
      (f) => f.path === from || f.path.startsWith(from + "/"),
    );
    if (!files.length) throw new AppError(404, "File not found.");
    if (to.startsWith(from + "/"))
      throw new AppError(400, "A folder cannot be moved inside itself.");
    const others = this.fileList(id).filter(
      (f) => !files.some((x) => x.path === f.path),
    );
    validateTree([
      ...others.map((f) => ({
        path: f.path,
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
      ...files.map((f) => ({
        path: to + f.path.slice(from.length),
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
    ]);
    for (const f of files) {
      const destination = to + f.path.slice(from.length);
      if (
        others.some(
          (o) =>
            o.path === destination ||
            (destination.startsWith(o.path + "/") && o.kind !== "directory") ||
            (f.kind !== "directory" && o.path.startsWith(destination + "/")),
        )
      )
        throw new AppError(409, "Destination already exists.");
    }
    this.transaction(() => {
      for (const f of files)
        this.db
          .prepare(
            "UPDATE files SET path=?,revision=revision+1 WHERE project=? AND path=?",
          )
          .run(to + f.path.slice(from.length), id, f.path);
      const p = this.requireProject(id);
      if (p.root === from || p.root.startsWith(from + "/"))
        this.db
          .prepare("UPDATE projects SET root=? WHERE id=?")
          .run(to + p.root.slice(from.length), id);
      this.touch(id);
    });
    fs.rmSync(within(this.projectDir(id), from), {
      recursive: true,
      force: true,
    });
    this.materialize(id);
    return this.project(id);
  }
  trash(id: string, name: string, restore = false) {
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
    if (!restore)
      fs.rmSync(within(this.projectDir(id), name), {
        recursive: true,
        force: true,
      });
    this.materialize(id);
    return this.project(id);
  }
  materializeFile(id: string, name: string) {
    const f = this.file(id, name, true),
      dest = within(this.projectDir(id), name);
    if (f.deleted) {
      fs.rmSync(dest, { recursive: true, force: true });
      return;
    }
    if (f.kind === "directory") {
      fs.mkdirSync(dest, { recursive: true });
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + "." + randomUUID() + ".prism-tmp";
    fs.writeFileSync(tmp, f.content, { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, dest);
  }
  materialize(id: string) {
    const root = this.projectDir(id);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const file of this.fileList(id).sort(
      (a, b) =>
        Number(b.deleted) - Number(a.deleted) ||
        (a.deleted
          ? b.path.length - a.path.length
          : a.path.length - b.path.length),
    ))
      this.materializeFile(id, file.path);
  }
  checkpoint(id: string, name: string) {
    this.requireProject(id);
    const cid = randomUUID(),
      created = new Date().toISOString();
    const files = (
      this.db.prepare("SELECT * FROM files WHERE project=?").all(id) as Row[]
    ).map((f) => ({
      ...f,
      content: Buffer.from(f.content).toString("base64"),
    }));
    this.db
      .prepare("INSERT INTO checkpoints VALUES(?,?,?,?,?)")
      .run(
        cid,
        id,
        name.slice(0, 120) || "Checkpoint",
        JSON.stringify({ files, project: this.requireProject(id) }),
        created,
      );
    return { id: cid, name, created };
  }
  checkpoints(id: string) {
    return this.db
      .prepare(
        "SELECT id,name,created FROM checkpoints WHERE project=? ORDER BY created DESC",
      )
      .all(id);
  }
  restoreCheckpoint(id: string, cid: string) {
    this.unlocked(id);
    const row = this.db
      .prepare("SELECT payload FROM checkpoints WHERE id=? AND project=?")
      .get(cid, id) as Row | undefined;
    if (!row) throw new AppError(404, "Checkpoint not found.");
    this.checkpoint(id, "Before checkpoint restore");
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
        this.insert(id, f.path, Buffer.from(f.content, "base64"), f.kind, rev);
        if (f.deleted)
          this.db
            .prepare("UPDATE files SET deleted=1 WHERE project=? AND path=?")
            .run(id, f.path);
      }
      this.db
        .prepare("UPDATE projects SET root=?,engine=? WHERE id=?")
        .run(snapshot.project.root, snapshot.project.engine, id);
      this.touch(id);
    });
    this.materialize(id);
    return this.project(id);
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
