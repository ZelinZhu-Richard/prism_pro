import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./store";
import type { Compiler } from "./compiler";
import { AppError, writeZip } from "./files";
import {
  LIBRARY_SELECTION_LIMIT,
  LIBRARY_EXPORT_PROJECTS,
  LIBRARY_EXPORT_BYTES,
  LIBRARY_EXPORT_ENTRIES,
  type LibraryAction,
  type LibraryState,
  type LibraryTarget,
  type LibraryPreview,
  type ProjectTag,
  type LibraryDownload,
} from "../shared/library";
type Row = Record<string, any>;
const digest = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      ),
    )
    .digest("hex");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new AppError(400, "Invalid library request.");
  return v as Row;
}
function requestId(v: unknown) {
  if (typeof v !== "string" || !uuid.test(v))
    throw new AppError(400, "Use a new library request ID.");
  return v.toLowerCase();
}
function tagName(v: unknown) {
  if (
    typeof v !== "string" ||
    Buffer.from(v).toString("utf8") !== v ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(v)
  )
    throw new AppError(400, "Enter a valid tag name on one line.");
  const n = v.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!n || n.length > 120)
    throw new AppError(400, "Enter a tag name from 1 to 120 characters.");
  return n;
}
function color(v: unknown) {
  if (typeof v !== "string" || !/^#[\da-f]{6}$/i.test(v))
    throw new AppError(400, "Use a six-digit HEX tag color, such as #6087b9.");
  return v.toLowerCase();
}
export class Library {
  private downloads = new Map<
    string,
    { bytes: Buffer; expires: number; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    readonly store: Store,
    readonly compiler: Compiler,
    readonly now: () => number = Date.now,
  ) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS project_library(project TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,archivedAt TEXT);
CREATE TABLE IF NOT EXISTS project_tags(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,color TEXT NOT NULL,revision INTEGER NOT NULL,deletedAt TEXT);
CREATE TABLE IF NOT EXISTS project_tag_links(project TEXT NOT NULL,tag TEXT NOT NULL,PRIMARY KEY(project,tag));
CREATE INDEX IF NOT EXISTS project_tag_lookup ON project_tag_links(tag,project);
CREATE TABLE IF NOT EXISTS library_ops(id TEXT PRIMARY KEY,kind TEXT NOT NULL,signature TEXT NOT NULL,created TEXT NOT NULL);`);
  }
  state(): LibraryState {
    const tags = this.store.db
      .prepare(
        "SELECT id,name,color,revision,deletedAt FROM project_tags ORDER BY name_key,id",
      )
      .all() as unknown as ProjectTag[];
    const links = new Map<string, string[]>();
    for (const l of this.store.db
      .prepare("SELECT project,tag FROM project_tag_links ORDER BY tag")
      .all() as Row[])
      links.set(l.project, [...(links.get(l.project) ?? []), l.tag]);
    const rows = this.store.db
      .prepare(
        "SELECT p.id,p.deletedAt,coalesce(l.revision,0) revision,l.archivedAt FROM projects p LEFT JOIN project_library l ON l.project=p.id ORDER BY p.id",
      )
      .all() as Row[];
    return {
      tags,
      projects: rows.map(
        (r) => ({ ...r, tags: links.get(r.id) ?? [] }) as LibraryTarget,
      ),
    };
  }
  private tag(id: unknown): ProjectTag {
    if (typeof id !== "string") throw new AppError(400, "Choose a tag.");
    const row = this.store.db
      .prepare(
        "SELECT id,name,color,revision,deletedAt FROM project_tags WHERE id=?",
      )
      .get(id) as unknown as ProjectTag | undefined;
    if (!row) throw new AppError(404, "Tag not found. Refresh the library.");
    return row;
  }
  private replay(id: string, kind: string, signature: string) {
    const old = this.store.db
      .prepare("SELECT * FROM library_ops WHERE id=?")
      .get(id) as Row | undefined;
    if (!old) return false;
    if (old.kind !== kind || old.signature !== signature)
      throw new AppError(409, "This request ID was used for another action.");
    return true;
  }
  private recorded(id: string, kind: string, signature: string) {
    this.store.db
      .prepare(
        "INSERT INTO library_ops(id,kind,signature,created) VALUES(?,?,?,?)",
      )
      .run(id, kind, signature, new Date().toISOString());
  }
  private result(id: string, replayed = false) {
    return { state: this.state(), operationId: id, replayed };
  }
  changeTag(input: unknown) {
    const r = object(input),
      id = requestId(r.id);
    if (!["create", "update", "trash", "restore"].includes(r.action))
      throw new AppError(400, "Choose a supported tag action.");
    const signature = digest(r);
    if (this.replay(id, "tag", signature)) return this.result(id, true);
    return this.store.transaction(() => {
      const old = r.action === "create" ? undefined : this.tag(r.tag);
      if (
        old &&
        (!Number.isSafeInteger(r.expectedRevision) ||
          old.revision !== r.expectedRevision)
      )
        throw new AppError(
          409,
          "The tag changed. Refresh the library before saving your retained draft.",
        );
      const n =
        r.action === "create" || r.action === "update"
          ? tagName(r.name)
          : old!.name;
      const c =
        r.action === "create" || r.action === "update"
          ? color(r.color)
          : old!.color;
      const active =
        r.action === "create" ||
        r.action === "restore" ||
        (r.action === "update" && !old!.deletedAt);
      if (
        active &&
        this.store.db
          .prepare(
            "SELECT id FROM project_tags WHERE name_key=? AND deletedAt IS NULL AND id<>?",
          )
          .get(n.toLocaleLowerCase("en-US"), old?.id ?? "")
      )
        throw new AppError(
          409,
          "An active tag already has this name. Choose a different name.",
        );
      const counts = this.store.db
        .prepare(
          "SELECT count(*) total,sum(deletedAt IS NULL) active FROM project_tags",
        )
        .get() as Row;
      if (r.action === "create" && counts.total >= 500)
        throw new AppError(413, "The retained tag limit is 500.");
      if (active && (!old || old.deletedAt) && counts.active >= 100)
        throw new AppError(
          413,
          "The active tag limit is 100. Move an unused tag to Removed tags first.",
        );
      if (r.action === "restore" && old?.deletedAt) {
        const full = this.store.db
          .prepare(
            `SELECT l.project FROM project_tag_links l JOIN project_tags t ON t.id=l.tag WHERE t.deletedAt IS NULL AND l.project IN (SELECT project FROM project_tag_links WHERE tag=?) GROUP BY l.project HAVING count(*)>=32 LIMIT 1`,
          )
          .get(old.id);
        if (full)
          throw new AppError(
            413,
            "A linked project already has 32 active tags. Remove one before restoring this tag.",
          );
      }
      if (r.action === "create")
        this.store.db
          .prepare(
            "INSERT INTO project_tags(id,name,name_key,color,revision,deletedAt) VALUES(?,?,?,?,0,NULL)",
          )
          .run(randomUUID(), n, n.toLocaleLowerCase("en-US"), c);
      else
        this.store.db
          .prepare(
            "UPDATE project_tags SET name=?,name_key=?,color=?,revision=revision+1,deletedAt=? WHERE id=?",
          )
          .run(
            n,
            n.toLocaleLowerCase("en-US"),
            c,
            r.action === "trash"
              ? (old!.deletedAt ?? new Date().toISOString())
              : r.action === "restore"
                ? null
                : old!.deletedAt,
            old!.id,
          );
      this.recorded(id, "tag", signature);
      return this.result(id);
    });
  }
  private assertTrashable(id: string) {
    const name = this.store.requireProject(id, true).name;
    try {
      this.store.unlocked(id);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409)
        throw new AppError(
          409,
          `“${name}” is busy with an AI request or file operation. No projects were moved. Finish or stop its work, then refresh this preview.`,
        );
      throw error;
    }
    if (
      this.store
        .runs(id)
        .some((r) =>
          ["generating", "typing", "paused", "preview"].includes(r.status),
        )
    )
      throw new AppError(
        409,
        `“${name}” has an active AI request. No projects were moved. Finish or stop it, then refresh this preview.`,
      );
    if (
      this.compiler
        .list(id)
        .some((j) => ["queued", "running"].includes(j.status))
    )
      throw new AppError(
        409,
        `“${name}” has a running compilation. No projects were moved. Finish or cancel it, then refresh this preview.`,
      );
  }
  preview(input: unknown): LibraryPreview {
    const r = object(input),
      action = r.action as LibraryAction;
    if (
      ![
        "archive",
        "unarchive",
        "trash",
        "restore",
        "tag-add",
        "tag-remove",
        "export",
      ].includes(action)
    )
      throw new AppError(400, "Choose a supported project action.");
    if (
      !Array.isArray(r.projects) ||
      !r.projects.length ||
      r.projects.length > LIBRARY_SELECTION_LIMIT ||
      r.projects.some(
        (v: unknown) => typeof v !== "string" || !uuid.test(v as string),
      ) ||
      new Set(r.projects).size !== r.projects.length
    )
      throw new AppError(
        400,
        `Choose 1–${LIBRARY_SELECTION_LIMIT} distinct projects.`,
      );
    if (action === "export" && r.projects.length > LIBRARY_EXPORT_PROJECTS)
      throw new AppError(
        413,
        `Download at most ${LIBRARY_EXPORT_PROJECTS} projects together.`,
      );
    const state = this.state(),
      byId = new Map(state.projects.map((p) => [p.id, p]));
    let tags: ProjectTag[] | undefined;
    if (action.startsWith("tag-")) {
      if (
        !Array.isArray(r.tags) ||
        !r.tags.length ||
        r.tags.length > 32 ||
        new Set(r.tags).size !== r.tags.length
      )
        throw new AppError(400, "Choose 1–32 distinct tags.");
      tags = [...r.tags].sort().map((id) => this.tag(id));
      if (tags.some((t) => t.deletedAt))
        throw new AppError(409, "Restore a removed tag before using it.");
    }
    let changes = 0,
      bytes = 0,
      entries = 0;
    const targets = [...r.projects].sort().map((id: string) => {
      const row = this.store.requireProject(id, true),
        p = byId.get(id)!;
      if (action === "restore" ? !row.deletedAt : !!row.deletedAt)
        throw new AppError(
          409,
          "A selected project moved to or from Trash. Refresh the library and review the selection.",
        );
      if (action === "trash") this.assertTrashable(id);
      const affected = tags?.filter((t) =>
        action === "tag-add" ? !p.tags.includes(t.id) : p.tags.includes(t.id),
      );
      if (action === "tag-add") {
        const count = p.tags.filter((id) =>
          state.tags.some((t) => t.id === id && !t.deletedAt),
        ).length;
        if (count + affected!.length > 32)
          throw new AppError(413, "A project can have up to 32 active tags.");
      }
      if (
        tags
          ? !!affected!.length
          : action === "archive"
            ? !p.archivedAt
            : action === "unarchive"
              ? !!p.archivedAt
              : true
      )
        changes++;
      if (action === "export") {
        const count = this.store.db
          .prepare(
            "SELECT count(*) entries,coalesce(sum(length(content)),0) bytes FROM files WHERE project=? AND deleted=0",
          )
          .get(id) as Row;
        bytes += count.bytes;
        entries += count.entries;
      }
      return {
        ...p,
        name: row.name,
        ...(action === "export" ? { generation: row.generation } : {}),
      } as LibraryTarget;
    });
    if (!changes)
      throw new AppError(
        400,
        "The selected projects already have this tag or archive state.",
      );
    if (bytes > LIBRARY_EXPORT_BYTES || entries > LIBRARY_EXPORT_ENTRIES)
      throw new AppError(
        413,
        "This download exceeds 100 MiB or 10,000 source entries. Select fewer projects.",
      );
    const payload = {
      action,
      targets,
      ...(tags ? { tags } : {}),
      changes,
      bytes,
      entries,
    };
    return { ...payload, hash: digest(payload) };
  }
  private checked(input: unknown) {
    const p = object(input);
    if (
      !Array.isArray(p.targets) ||
      typeof p.hash !== "string" ||
      !/^[a-f\d]{64}$/.test(p.hash)
    )
      throw new AppError(400, "Review a project action first.");
    const current = this.preview({
      action: p.action,
      projects: p.targets.map((v: any) => v?.id),
      tags: p.tags?.map((t: any) => t?.id),
    });
    if (current.hash !== p.hash)
      throw new AppError(
        409,
        "The selection, tag or project metadata changed. Refresh this preview before applying it.",
      );
    return current;
  }
  apply(input: unknown) {
    const r = object(input),
      id = requestId(r.id),
      signature = digest(object(r.preview));
    if (this.replay(id, "projects", signature)) return this.result(id, true);
    return this.store.transaction(() => {
      const p = this.checked(r.preview);
      if (p.action === "export")
        throw new AppError(400, "Use Download ZIP for a source export.");
      const now = new Date().toISOString();
      for (const t of p.targets) {
        if (
          (p.action === "archive" && t.archivedAt) ||
          (p.action === "unarchive" && !t.archivedAt)
        )
          continue;
        if (p.tags) {
          const affected = p.tags.filter((tag) =>
            p.action === "tag-add"
              ? !t.tags.includes(tag.id)
              : t.tags.includes(tag.id),
          );
          if (!affected.length) continue;
          for (const tag of affected) {
            if (p.action === "tag-add")
              this.store.db
                .prepare(
                  "INSERT INTO project_tag_links(project,tag) VALUES(?,?)",
                )
                .run(t.id, tag.id);
            else
              this.store.db
                .prepare(
                  "DELETE FROM project_tag_links WHERE project=? AND tag=?",
                )
                .run(t.id, tag.id);
          }
        }
        const archivedAt =
          p.action === "archive"
            ? now
            : p.action === "unarchive"
              ? null
              : t.archivedAt;
        this.store.db
          .prepare(
            "INSERT INTO project_library(project,revision,archivedAt) VALUES(?,1,?) ON CONFLICT(project) DO UPDATE SET revision=revision+1,archivedAt=excluded.archivedAt",
          )
          .run(t.id, archivedAt);
        if (p.action === "trash" || p.action === "restore") {
          this.store.db
            .prepare("UPDATE projects SET deletedAt=? WHERE id=?")
            .run(p.action === "trash" ? now : null, t.id);
          if (p.action === "restore") this.store.materialize(t.id);
        }
      }
      this.recorded(id, "projects", signature);
      return this.result(id);
    });
  }
  export(input: unknown) {
    const p = this.checked(input);
    if (p.action !== "export")
      throw new AppError(400, "Review a source download first.");
    const files = p.targets.map((t) => {
      // ID suffix keeps equal/Unicode project names collision-free without trusting names as paths.
      const label =
        Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            t.name
              .normalize("NFC")
              .replace(/[^\p{L}\p{N} _.-]/gu, "_")
              .replace(/^[. ]+|[. ]+$/g, ""),
          ),
          (p) => p.segment,
        )
          .slice(0, 60)
          .join("") || "project";
      return {
        path: `${label}--${t.id}.zip`,
        data: writeZip(this.store.exportFiles(t.id)),
      };
    });
    return writeZip(files);
  }
  private removeDownload(id: string) {
    const item = this.downloads.get(id);
    if (item) clearTimeout(item.timer);
    this.downloads.delete(id);
  }
  prepareDownload(input: unknown): LibraryDownload {
    const bytes = Buffer.from(this.export(input)),
      id = randomUUID(),
      expires = this.now() + 15 * 60 * 1000;
    if (bytes.length > 200 * 1024 * 1024)
      throw new AppError(
        413,
        "The prepared ZIP is too large. Select fewer projects.",
      );
    for (const [key, item] of this.downloads)
      if (item.expires <= this.now()) this.removeDownload(key);
    // Derived downloads are session memory, bounded independently of source/history.
    while (
      this.downloads.size >= 4 ||
      [...this.downloads.values()].reduce(
        (n, item) => n + item.bytes.length,
        0,
      ) +
        bytes.length >
        200 * 1024 * 1024
    )
      this.removeDownload(this.downloads.keys().next().value!);
    const timer = setTimeout(() => this.removeDownload(id), 15 * 60 * 1000);
    timer.unref();
    this.downloads.set(id, { bytes, expires, timer });
    return {
      id,
      url: `/api/library/exports/${id}`,
      bytes: bytes.length,
      projects: (input as LibraryPreview).targets.length,
      expiresAt: new Date(expires).toISOString(),
    };
  }
  download(id: string): Buffer {
    const item = this.downloads.get(id);
    if (!item || item.expires <= this.now()) {
      this.removeDownload(id);
      throw new AppError(
        410,
        "This prepared ZIP expired or Leaf restarted. Return to the download review and choose Prepare ZIP again.",
      );
    }
    return item.bytes;
  }
  dispose() {
    for (const id of this.downloads.keys()) this.removeDownload(id);
  }
}
