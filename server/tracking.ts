import type { DatabaseSync } from "node:sqlite";
import type { Store } from "./store";
import { createHash } from "node:crypto";
import { AppError, safePath } from "./files";
import {
  trackedDiff,
  reviewText,
  untrackedBase,
  type TrackingStatus,
  type TrackingFile,
  type TrackingResult,
} from "../shared/tracking";
type Row = Record<string, any>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new AppError(400, "Invalid review request.");
  return v as Row;
}
export function trackingState(db: DatabaseSync, project: string) {
  return (
    (db
      .prepare("SELECT enabled,revision FROM tracking_projects WHERE project=?")
      .get(project) as Row | undefined) ?? { enabled: 0, revision: 0 }
  );
}
function bump(db: DatabaseSync, project: string) {
  db.prepare(
    "INSERT INTO tracking_projects VALUES(?,0,1) ON CONFLICT(project) DO UPDATE SET revision=revision+1",
  ).run(project);
}
function write(
  db: DatabaseSync,
  project: string,
  path: string,
  base: string,
  current: string,
) {
  const diff = trackedDiff(base, current);
  if (!diff.hunks.length)
    db.prepare("DELETE FROM tracking_files WHERE project=? AND path=?").run(
      project,
      path,
    );
  else
    db.prepare(
      "INSERT INTO tracking_files VALUES(?,?,?,?,?) ON CONFLICT(project,path) DO UPDATE SET base=excluded.base,count=excluded.count,limited=excluded.limited",
    ).run(project, path, base, diff.hunks.length, Number(diff.limited));
  bump(db, project);
}
export function recordTracked(
  db: DatabaseSync,
  project: string,
  path: string,
  previous: string,
  next: string,
) {
  if (previous === next) return;
  const row = db
    .prepare("SELECT base FROM tracking_files WHERE project=? AND path=?")
    .get(project, path) as Row | undefined;
  const state = trackingState(db, project);
  if (!state.enabled && !row) return;
  const base = state.enabled
    ? (row?.base ?? previous)
    : untrackedBase(row!.base, previous, next);
  write(db, project, path, base, next);
}
export function moveTracking(
  db: DatabaseSync,
  project: string,
  from: string,
  to: string,
) {
  if (
    db
      .prepare("SELECT 1 FROM tracking_files WHERE project=? AND path=?")
      .get(project, from)
  ) {
    db.prepare(
      "UPDATE tracking_files SET path=? WHERE project=? AND path=?",
    ).run(to, project, from);
    bump(db, project);
  }
}
export class Tracking {
  constructor(readonly store: Store) {}
  status(project: string): TrackingStatus {
    this.store.requireProject(project);
    const state = trackingState(this.store.db, project);
    const files = (
      this.store.db
        .prepare(
          "SELECT t.path,t.count,t.limited,CASE WHEN f.deleted=0 AND f.kind='text' THEN 0 ELSE 1 END AS unavailable FROM tracking_files t LEFT JOIN files f ON f.project=t.project AND f.path=t.path WHERE t.project=? ORDER BY t.path",
        )
        .all(project) as Row[]
    ).map((r) => ({
      ...r,
      limited: !!r.limited,
      unavailable: !!r.unavailable,
    }));
    const last = this.store.db
      .prepare(
        "SELECT id,path,action FROM tracking_ops WHERE project=? AND undone=0 ORDER BY rowid DESC LIMIT 1",
      )
      .get(project) as Row | undefined;
    return {
      enabled: !!state.enabled,
      revision: state.revision,
      files: files as TrackingStatus["files"],
      undo: last as TrackingStatus["undo"],
    };
  }
  file(project: string, path: string): TrackingFile {
    safePath(path);
    const file = this.store.readText(project, path),
      state = trackingState(this.store.db, project);
    const row = this.store.db
      .prepare("SELECT base FROM tracking_files WHERE project=? AND path=?")
      .get(project, path) as Row | undefined;
    const diff = trackedDiff(row?.base ?? file.content, file.content);
    return {
      path,
      sourceRevision: file.revision,
      reviewRevision: state.revision,
      ...diff,
      token: createHash("sha256").update(JSON.stringify(diff)).digest("hex"),
    };
  }
  mode(project: string, value: unknown) {
    const request = object(value);
    this.store.unlocked(project);
    if (
      typeof request.enabled !== "boolean" ||
      !Number.isInteger(request.revision)
    )
      throw new AppError(400, "Choose Editing or Reviewing.");
    const current = trackingState(this.store.db, project);
    if (current.revision !== request.revision)
      throw new AppError(
        409,
        "Review state changed. Refresh before changing mode.",
      );
    this.store.db
      .prepare(
        "INSERT INTO tracking_projects VALUES(?,?,1) ON CONFLICT(project) DO UPDATE SET enabled=excluded.enabled,revision=revision+1",
      )
      .run(project, Number(request.enabled));
    return this.status(project);
  }
  apply(project: string, value: unknown): TrackingResult {
    const r = object(value);
    this.store.unlocked(project);
    if (
      typeof r.id !== "string" ||
      !uuid.test(r.id) ||
      typeof r.path !== "string" ||
      !["accept", "reject"].includes(r.action) ||
      !Array.isArray(r.ids) ||
      !r.ids.length ||
      r.ids.length > 1000 ||
      r.ids.some((i: unknown) => !Number.isInteger(i) || Number(i) < 0) ||
      new Set(r.ids).size !== r.ids.length
    )
      throw new AppError(400, "Choose tracked changes to accept or reject.");
    safePath(r.path);
    const signature = JSON.stringify({
      path: r.path,
      action: r.action,
      ids: [...r.ids].sort((a, b) => a - b),
      sourceRevision: r.sourceRevision,
      reviewRevision: r.reviewRevision,
      token: r.token,
    });
    const prior = this.store.db
      .prepare("SELECT * FROM tracking_ops WHERE id=?")
      .get(r.id) as Row | undefined;
    if (prior) {
      if (
        prior.project !== project ||
        prior.signature !== signature ||
        prior.undone
      )
        throw new AppError(
          409,
          "This review request was already used. Refresh before trying again.",
        );
      return {
        id: prior.id,
        path: prior.path,
        action: prior.action,
        file: this.store.readText(project, prior.path),
      };
    }
    const file = this.store.readText(project, r.path),
      review = this.file(project, r.path);
    if (
      review.sourceRevision !== r.sourceRevision ||
      review.reviewRevision !== r.reviewRevision ||
      review.token !== r.token
    )
      throw new AppError(
        409,
        "Source or tracked changes changed. Your review was not applied; refresh and choose again.",
      );
    const selected = review.hunks.filter((h) => r.ids.includes(h.id));
    if (selected.length !== r.ids.length)
      throw new AppError(409, "Those changes are no longer pending.");
    const row = this.store.db
      .prepare("SELECT base FROM tracking_files WHERE project=? AND path=?")
      .get(project, r.path) as Row;
    const base = row.base as string,
      next =
        r.action === "reject"
          ? reviewText(file.content, selected, false)
          : file.content;
    const nextBase =
      r.action === "accept" ? reviewText(base, selected, true) : base;
    if (Buffer.byteLength(next) > 2 * 1024 * 1024)
      throw new AppError(
        413,
        "The restored source exceeds the 2 MB editable-file limit. Review a smaller selection.",
      );
    if (r.action === "reject")
      this.store.automaticCheckpoint(
        project,
        "Before rejecting tracked changes",
      );
    this.store.transaction(() => {
      if (next !== file.content) {
        this.store.db
          .prepare(
            "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
          )
          .run(
            project,
            r.path,
            file.revision,
            Buffer.from(file.content),
            new Date().toISOString(),
          );
        this.store.insert(
          project,
          r.path,
          Buffer.from(next),
          "text",
          file.revision + 1,
          true,
        );
        this.store.touch(project);
      }
      write(this.store.db, project, r.path, nextBase, next);
      this.store.db
        .prepare("INSERT INTO tracking_ops VALUES(?,?,?,?,?,?,?,0)")
        .run(
          r.id,
          project,
          r.path,
          r.action,
          signature,
          JSON.stringify({
            before: file.content,
            after: next,
            base,
            nextBase,
            revision: file.revision + (next !== file.content ? 1 : 0),
          }),
          new Date().toISOString(),
        );
    });
    if (next !== file.content) this.store.materializeFile(project, r.path);
    return {
      id: r.id,
      path: r.path,
      action: r.action,
      file: this.store.readText(project, r.path),
    };
  }
  undo(project: string, id: string): TrackingResult {
    this.store.unlocked(project);
    const row = this.store.db
      .prepare("SELECT * FROM tracking_ops WHERE id=? AND project=?")
      .get(id, project) as Row | undefined;
    if (!row) throw new AppError(404, "Review operation not found.");
    const p = JSON.parse(row.payload),
      file = this.store.readText(project, row.path);
    if (row.undone) return { id, path: row.path, action: "undo", file };
    const current = this.store.db
      .prepare("SELECT base FROM tracking_files WHERE project=? AND path=?")
      .get(project, row.path) as Row | undefined;
    if (
      file.revision !== p.revision ||
      file.content !== p.after ||
      (current?.base ?? file.content) !== p.nextBase
    )
      throw new AppError(
        409,
        "This file or its review changed. Undo was not applied; use History to inspect earlier source.",
      );
    if (file.content !== p.before)
      this.store.automaticCheckpoint(
        project,
        "Before undoing tracked-change review",
      );
    this.store.transaction(() => {
      if (file.content !== p.before) {
        this.store.db
          .prepare(
            "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
          )
          .run(
            project,
            row.path,
            file.revision,
            Buffer.from(file.content),
            new Date().toISOString(),
          );
        this.store.insert(
          project,
          row.path,
          Buffer.from(p.before),
          "text",
          file.revision + 1,
          true,
        );
        this.store.touch(project);
      }
      write(this.store.db, project, row.path, p.base, p.before);
      this.store.db
        .prepare("UPDATE tracking_ops SET undone=1 WHERE id=?")
        .run(id);
    });
    if (file.content !== p.before)
      this.store.materializeFile(project, row.path);
    return {
      id,
      path: row.path,
      action: "undo",
      file: this.store.readText(project, row.path),
    };
  }
}
