import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./store";
import type { Compiler } from "./compiler";
import { AppError, safePath, validateTree, type ImportedFile } from "./files";
import { templateStarters } from "./template-starters";
import {
  TEMPLATE_BYTES,
  TEMPLATE_ENTRIES,
  TEMPLATE_TEXT_PREVIEW,
  type TemplateInfo,
  type TemplateDetail,
  type TemplateCapture,
  type TemplateFile,
  type TemplateSource,
} from "../shared/templates";
import type { Engine } from "../shared/types";
type Row = Record<string, any>;
interface Manifest {
  schema: 1;
  root: string;
  engine: Engine;
  files: TemplateFile[];
}
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new AppError(400, "Invalid template request.");
  return v as Row;
}
function text(v: unknown, max: number, empty = false) {
  if (
    typeof v !== "string" ||
    Buffer.from(v).toString("utf8") !== v ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(v)
  )
    throw new AppError(
      400,
      "Enter valid template text without control characters.",
    );
  const clean = v.normalize("NFC").trim();
  if ((!empty && !clean) || clean.length > max)
    throw new AppError(
      400,
      `Enter ${empty ? "up to" : "1–"}${max} characters.`,
    );
  return clean;
}
function name(v: unknown) {
  const clean = text(v, 120);
  if (/[\r\n\t]/.test(clean))
    throw new AppError(400, "Template and project names must be one line.");
  return clean.replace(/\s+/gu, " ");
}
const key = (n: string) => n.normalize("NFC").toLocaleLowerCase("en-US");
function engine(v: unknown): Engine {
  if (!["pdflatex", "latex", "xelatex", "lualatex"].includes(v as string))
    throw new AppError(400, "Choose pdfLaTeX, LaTeX, XeLaTeX or LuaLaTeX.");
  return v as Engine;
}
function roots(files: TemplateFile[]) {
  return files
    .filter((f) => f.kind === "text" && f.path.endsWith(".tex"))
    .map((f) => f.path);
}
function chosenRoot(value: unknown, files: TemplateFile[]) {
  if (value === "") {
    if (roots(files).length)
      throw new AppError(400, "Choose a main .tex document.");
    return "";
  }
  const p = safePath(value);
  if (!roots(files).includes(p))
    throw new AppError(400, "Choose a .tex file included in this template.");
  return p;
}
export class Templates {
  constructor(
    readonly store: Store,
    readonly compiler: Compiler,
  ) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,description TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,deletedAt TEXT);
CREATE TABLE IF NOT EXISTS template_ops(id TEXT PRIMARY KEY,kind TEXT NOT NULL,signature TEXT NOT NULL,template TEXT NOT NULL,project TEXT,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS templates_names ON templates(deletedAt,name_key);`);
  }
  private manifest(row: Row): Manifest {
    let m: Manifest;
    try {
      m = JSON.parse(row.payload);
    } catch {
      throw new AppError(
        409,
        "Template metadata is unavailable. Restore a data backup.",
      );
    }
    if (
      !m ||
      m.schema !== 1 ||
      !Array.isArray(m.files) ||
      m.files.length > TEMPLATE_ENTRIES ||
      hash(JSON.stringify(m)) !== row.hash
    )
      throw new AppError(409, "Template snapshot changed or is invalid.");
    let bytes = 0;
    for (const f of m.files) {
      if (!f || typeof f !== "object")
        throw new AppError(409, "Template file metadata is invalid.");
      safePath(f.path);
      if (
        !["text", "binary", "directory"].includes(f.kind) ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0 ||
        (f.kind === "directory" && f.size !== 0) ||
        !/^[0-9a-f]{64}$/.test(f.hash)
      )
        throw new AppError(409, "Template file metadata is invalid.");
      bytes += f.size;
    }
    if (bytes > TEMPLATE_BYTES)
      throw new AppError(413, "Template exceeds 100 MiB.");
    validateTree(
      m.files.map((f) => ({
        path: f.path,
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
    );
    engine(m.engine);
    if (m.root && !roots(m.files).includes(m.root))
      throw new AppError(
        409,
        "The saved main document is not in this template.",
      );
    return m;
  }
  private builtin(id: string) {
    const s = templateStarters.find((s) => s.id === id);
    if (!s) return undefined;
    const m: Manifest = {
      schema: 1,
      root: s.root,
      engine: s.engine,
      files: s.files
        .map((f) => ({
          path: f.path,
          kind: f.directory
            ? "directory"
            : /\.(tex|bib|md|sty|cls|txt)$/i.test(f.path)
              ? "text"
              : "binary",
          size: f.data.length,
          hash: hash(f.data),
        }))
        .sort((a, b) => a.path.localeCompare(b.path, "en")),
    };
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      builtin: true,
      revision: 1,
      created: "2026-11-01T00:00:00.000Z",
      updated: "2026-11-01T00:00:00.000Z",
      deletedAt: null,
      manifest: m,
      hash: hash(JSON.stringify(m)),
    };
  }
  private row(id: string): Row {
    const builtin = this.builtin(id);
    if (builtin) return builtin;
    const row = this.store.db
      .prepare("SELECT * FROM templates WHERE id=?")
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, "Template not found.");
    return {
      ...row,
      builtin: false,
      category: "Personal",
      manifest: this.manifest(row),
    };
  }
  private detail(row: Row): TemplateDetail {
    const m = row.manifest as Manifest;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      builtin: row.builtin,
      revision: row.revision,
      created: row.created,
      updated: row.updated,
      deletedAt: row.deletedAt ?? null,
      root: m.root,
      engine: m.engine,
      hash: row.hash,
      files: m.files.filter((f) => f.kind !== "directory").length,
      bytes: m.files.reduce((n, f) => n + f.size, 0),
      entries: m.files,
      roots: roots(m.files),
    };
  }
  list(removed = false): TemplateInfo[] {
    const rows = this.store.db
      .prepare(
        `SELECT t.id,t.name,t.description,t.hash,t.revision,t.created,t.updated,t.deletedAt,json_extract(t.payload,'$.root') root,json_extract(t.payload,'$.engine') engine,(SELECT count(*) FROM json_each(t.payload,'$.files') WHERE json_extract(value,'$.kind')<>'directory') files,(SELECT coalesce(sum(json_extract(value,'$.size')),0) FROM json_each(t.payload,'$.files')) bytes FROM templates t WHERE t.deletedAt IS ${removed ? "NOT NULL" : "NULL"} ORDER BY t.updated DESC,t.id`,
      )
      .all() as Row[];
    const builtins = removed
      ? []
      : templateStarters.map((s) => {
          const { entries, roots, ...info } = this.get(s.id);
          return info;
        });
    return [
      ...builtins,
      ...rows.map(
        (r) => ({ ...r, builtin: false, category: "Personal" }) as TemplateInfo,
      ),
    ];
  }
  get(id: string) {
    return this.detail(this.row(id));
  }
  private load(id: string): ImportedFile[] {
    const row = this.row(id),
      m = row.manifest as Manifest;
    if (row.deletedAt)
      throw new AppError(
        409,
        "This template is in Trash. Restore it before using or downloading it.",
      );
    const s = templateStarters.find((s) => s.id === id);
    if (s) return s.files.map((f) => ({ ...f, data: Buffer.from(f.data) }));
    return m.files.map((f) => {
      const b = this.store.db
        .prepare("SELECT content FROM history_blobs WHERE hash=?")
        .get(f.hash) as Row | undefined;
      if (
        !b ||
        b.content.byteLength !== f.size ||
        hash(Buffer.from(b.content)) !== f.hash
      )
        throw new AppError(
          409,
          "A template source blob is missing or changed. Restore a data backup.",
        );
      return {
        path: f.path,
        data: Buffer.from(b.content),
        directory: f.kind === "directory",
      };
    });
  }
  export(id: string) {
    return this.load(id);
  }
  file(id: string, path: string): TemplateSource {
    path = safePath(path);
    const detail = this.get(id),
      entry = detail.entries.find((f) => f.path === path);
    if (!entry) throw new AppError(404, "File not found in this template.");
    if (detail.deletedAt)
      throw new AppError(
        409,
        "Restore this template before inspecting source.",
      );
    if (entry.kind !== "text" || entry.size > TEMPLATE_TEXT_PREVIEW)
      return {
        path,
        kind: entry.kind,
        size: entry.size,
        reason:
          entry.kind === "directory"
            ? "Empty folder."
            : entry.kind === "binary"
              ? "Binary asset. Download the source ZIP to inspect it."
              : "Source preview is limited to 512 KiB. Download the ZIP for the complete file.",
      };
    const builtin = templateStarters
        .find((s) => s.id === id)
        ?.files.find((f) => f.path === path),
      blob =
        builtin?.data ??
        (
          this.store.db
            .prepare("SELECT content FROM history_blobs WHERE hash=?")
            .get(entry.hash) as Row | undefined
        )?.content;
    if (
      !blob ||
      blob.byteLength !== entry.size ||
      hash(Buffer.from(blob)) !== entry.hash
    )
      throw new AppError(
        409,
        "A template source blob is missing or changed. Restore a data backup.",
      );
    const content = Buffer.from(blob).toString("utf8");
    if (Buffer.from(content).equals(Buffer.from(blob)))
      return { path, kind: "text", size: entry.size, content };
    return {
      path,
      kind: "binary",
      size: entry.size,
      reason:
        "This file uses a non-UTF-8 encoding. Source bytes will be preserved in the new project.",
    };
  }
  private capture(project: string) {
    const p = this.store.project(project),
      bounds = this.store.db
        .prepare(
          "SELECT count(*) n,coalesce(sum(length(content)),0) bytes FROM files WHERE project=? AND deleted=0",
        )
        .get(project) as Row;
    if (bounds.n > TEMPLATE_ENTRIES || bounds.bytes > TEMPLATE_BYTES)
      throw new AppError(
        413,
        "Templates support at most 5,000 entries and 100 MiB.",
      );
    const rows = this.store.db
      .prepare(
        "SELECT path,kind,content FROM files WHERE project=? AND deleted=0 ORDER BY path",
      )
      .all(project) as Row[];
    if (!rows.some((f) => f.kind !== "directory"))
      throw new AppError(400, "Add an active file before saving a template.");
    const files: TemplateFile[] = rows.map((r) => ({
      path: safePath(r.path),
      kind: r.kind,
      size: r.content.byteLength,
      hash: hash(Buffer.from(r.content)),
    }));
    validateTree(
      files.map((f) => ({
        path: f.path,
        data: Buffer.alloc(0),
        directory: f.kind === "directory",
      })),
    );
    const m: Manifest = {
      schema: 1,
      root: roots(files).includes(p.root) ? p.root : "",
      engine: p.engine,
      files,
    };
    return {
      p,
      rows,
      m,
      hash: hash(JSON.stringify(m)),
      bytes: Number(bounds.bytes),
    };
  }
  preview(project: string): TemplateCapture {
    return this.store.transaction(() => {
      const c = this.capture(project);
      return {
        projectId: project,
        projectName: c.p.name,
        generation: c.p.generation,
        hash: c.hash,
        root: c.m.root,
        engine: c.m.engine,
        entries: c.m.files,
        bytes: c.bytes,
        roots: roots(c.m.files),
      };
    });
  }
  private prior(id: unknown, kind: string, signature: string) {
    if (typeof id !== "string" || !uuid.test(id))
      throw new AppError(400, "A valid template action ID is required.");
    const row = this.store.db
      .prepare("SELECT * FROM template_ops WHERE id=?")
      .get(id) as Row | undefined;
    if (row && (row.kind !== kind || row.signature !== signature))
      throw new AppError(
        409,
        "This action ID was already used for another request.",
      );
    return row;
  }
  private journal(
    id: string,
    kind: string,
    signature: string,
    template: string,
    project: string | null = null,
  ) {
    this.store.db
      .prepare("INSERT INTO template_ops VALUES(?,?,?,?,?,?)")
      .run(id, kind, signature, template, project, new Date().toISOString());
  }
  private availableName(n: string, except = "") {
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM templates WHERE name_key=? AND deletedAt IS NULL AND id<>?",
        )
        .get(key(n), except)
    )
      throw new AppError(
        409,
        "A personal template already uses that name. Open My templates or choose another name.",
      );
  }
  save(project: string, value: unknown) {
    const r = object(value),
      n = name(r.name),
      description = text(r.description ?? "", 2000, true);
    if (
      !Number.isSafeInteger(r.expectedGeneration) ||
      typeof r.hash !== "string"
    )
      throw new AppError(400, "Refresh the source snapshot before saving.");
    const signature = hash(
      JSON.stringify([project, n, description, r.expectedGeneration, r.hash]),
    );
    return this.store.transaction(() => {
      const prior = this.prior(r.id, "capture", signature);
      if (prior)
        return {
          template: this.get(prior.template),
          operationId: r.id,
          replayed: true,
        };
      this.store.unlocked(project);
      if (
        this.store.db
          .prepare(
            "SELECT 1 FROM runs WHERE project=? AND json_extract(payload,'$.status') IN ('generating','typing','paused','preview') LIMIT 1",
          )
          .get(project)
      )
        throw new AppError(
          409,
          "Finish or stop the active AI request before saving a template.",
        );
      const c = this.capture(project);
      if (c.p.generation !== r.expectedGeneration || c.hash !== r.hash)
        throw new AppError(
          409,
          "The project changed after the snapshot preview. Refresh the snapshot, review it, and save again.",
        );
      this.availableName(n);
      const counts = this.store.db
        .prepare(
          "SELECT count(*) total,count(CASE WHEN deletedAt IS NULL THEN 1 END) active FROM templates",
        )
        .get() as Row;
      if (counts.total >= 500 || counts.active >= 100)
        throw new AppError(
          413,
          "The local library supports 100 active and 500 retained personal templates. Reuse an existing template or restore one from Trash.",
        );
      const id = randomUUID(),
        now = new Date().toISOString();
      for (let i = 0; i < c.rows.length; i++)
        this.store.db
          .prepare("INSERT OR IGNORE INTO history_blobs VALUES(?,?)")
          .run(c.m.files[i].hash, c.rows[i].content);
      this.store.db
        .prepare("INSERT INTO templates VALUES(?,?,?,?,?,?,0,?,?,NULL)")
        .run(id, n, key(n), description, JSON.stringify(c.m), c.hash, now, now);
      this.journal(r.id, "capture", signature, id);
      return { template: this.get(id), operationId: r.id, replayed: false };
    });
  }
  change(id: string, value: unknown) {
    const r = object(value);
    if (
      !["rename", "trash", "restore"].includes(r.action) ||
      !Number.isSafeInteger(r.expectedRevision) ||
      r.expectedRevision < 0
    )
      throw new AppError(400, "Choose a template action and current revision.");
    return this.store.transaction(() => {
      const row = this.row(id);
      if (row.builtin)
        throw new AppError(
          403,
          "Built-in starters are read-only. Create a project to customize one.",
        );
      const n = r.action === "rename" ? name(r.name) : row.name,
        description =
          r.action === "rename"
            ? r.description === undefined
              ? row.description
              : text(r.description, 2000, true)
            : row.description,
        signature = hash(
          JSON.stringify([
            id,
            r.action,
            r.expectedRevision,
            r.action === "rename" ? n : null,
            r.action === "rename" && r.description !== undefined
              ? description
              : null,
          ]),
        );
      const prior = this.prior(r.id, "metadata", signature);
      if (prior)
        return { template: this.get(id), operationId: r.id, replayed: true };
      if (row.revision !== r.expectedRevision)
        throw new AppError(
          409,
          "Template details changed in another view. Refresh templates before submitting again.",
        );
      if (
        (r.action === "trash" && row.deletedAt) ||
        (r.action === "restore" && !row.deletedAt)
      )
        throw new AppError(
          409,
          "The template state changed. Refresh templates.",
        );
      const deletedAt =
        r.action === "trash"
          ? new Date().toISOString()
          : r.action === "restore"
            ? null
            : row.deletedAt;
      if (!deletedAt) this.availableName(n, id);
      if (
        r.action === "restore" &&
        (
          this.store.db
            .prepare("SELECT count(*) n FROM templates WHERE deletedAt IS NULL")
            .get() as Row
        ).n >= 100
      )
        throw new AppError(
          413,
          "The library has 100 active personal templates. Move one to Trash first.",
        );
      this.store.db
        .prepare(
          "UPDATE templates SET name=?,name_key=?,description=?,revision=revision+1,updated=?,deletedAt=? WHERE id=?",
        )
        .run(n, key(n), description, new Date().toISOString(), deletedAt, id);
      this.journal(r.id, "metadata", signature, id);
      return { template: this.get(id), operationId: r.id, replayed: false };
    });
  }
  create(id: string, value: unknown) {
    const r = object(value),
      n = name(r.name),
      signature = hash(
        JSON.stringify([id, n, r.expectedRevision, r.hash, r.root, r.engine]),
      );
    const prior = this.prior(r.id, "project", signature);
    if (prior)
      return {
        project: this.store.project(prior.project, true),
        operationId: r.id,
        replayed: true,
      };
    let created;
    try {
      created = this.store.createManagedProject((project) => {
        const row = this.row(id),
          m = row.manifest as Manifest;
        if (row.deletedAt)
          throw new AppError(
            409,
            "Restore this template from Trash before creating a project.",
          );
        if (row.revision !== r.expectedRevision || row.hash !== r.hash)
          throw new AppError(
            409,
            "The template changed. Refresh templates and review it before creating a project.",
          );
        const root = chosenRoot(r.root, m.files),
          selectedEngine = engine(r.engine),
          files = this.load(id),
          byPath = new Map(files.map((f) => [f.path, f.data]));
        this.store.db
          .prepare(
            "INSERT INTO projects(id,name,root,engine,generation,updated) VALUES(?,?,?,?,0,?)",
          )
          .run(project, n, root, selectedEngine, new Date().toISOString());
        for (let i = 0; i < m.files.length; i++) {
          const f = m.files[i],
            content = byPath.get(f.path)!;
          this.store.insert(project, f.path, content, f.kind, 0);
        }
        this.journal(r.id, "project", signature, id, project);
      }, "Created from template");
    } catch (e) {
      const replay = this.prior(r.id, "project", signature);
      if (replay)
        return {
          project: this.store.project(replay.project, true),
          operationId: r.id,
          replayed: true,
        };
      throw e;
    }
    return { project: created, operationId: r.id, replayed: false };
  }
  compile(id: string, value: unknown) {
    if (id === "builtin-blank")
      throw new AppError(
        400,
        "The blank starter has no page content. Create a project and add text before compiling.",
      );
    const r = object(value),
      detail = this.get(id);
    if (detail.deletedAt)
      throw new AppError(
        409,
        "Restore the template before compiling its preview.",
      );
    if (detail.hash !== r.hash || detail.revision !== r.expectedRevision)
      throw new AppError(
        409,
        "The template changed. Refresh it before compiling.",
      );
    const root = chosenRoot(r.root, detail.entries);
    if (!root)
      throw new AppError(400, "Add a .tex main document before compiling.");
    const running = [...this.compiler.jobs.values()].filter(
      (j) =>
        j.preview &&
        j.projectId.startsWith("template:") &&
        ["queued", "running"].includes(j.status),
    );
    if (running.length >= 2)
      throw new AppError(
        429,
        "Two template previews are compiling. Stop one or wait for it to finish.",
      );
    return this.compiler.startSnapshot(
      {
        projectId: "template:" + id,
        generation: detail.revision,
        root,
        engine: engine(r.engine),
      },
      this.load(id),
      false,
      true,
    );
  }
}
