import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { Store } from "./store";
import { AppError, safePath } from "./files";
import {
  commentChanges,
  captureCommentAnchor,
  mapCommentAnchor,
  commentRange,
  type CommentAnchor,
  type CommentInfo,
  type CommentThread,
  type CommentPage,
  type CommentState,
  type CommentMark,
} from "../shared/comments";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;
function input(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Invalid comment request.");
  return value;
}
function text(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 10000 ||
    /\x00/.test(value)
  )
    throw new AppError(400, "Write a comment from 1 to 10,000 characters.");
  return value;
}
function identifier(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new AppError(400, "Invalid comment request identifier.");
  return value;
}
export function rebaseComments(
  db: DatabaseSync,
  project: string,
  path: string,
  before: string,
  after: string,
) {
  if (before === after) return;
  const rows = db
    .prepare(
      "SELECT id,payload FROM comment_threads WHERE project=? AND path=?",
    )
    .all(project, path) as Row[];
  if (!rows.length) return;
  const changes = commentChanges(before, after);
  for (const row of rows) {
    const payload = JSON.parse(row.payload),
      anchor = mapCommentAnchor(payload.anchor, changes, after);
    if (JSON.stringify(anchor) === JSON.stringify(payload.anchor)) continue;
    payload.anchor = anchor;
    db.prepare(
      "UPDATE comment_threads SET payload=?,revision=revision+1 WHERE id=?",
    ).run(JSON.stringify(payload), row.id);
  }
}
export function moveComments(
  db: DatabaseSync,
  project: string,
  from: string,
  to: string,
) {
  db.prepare(
    "UPDATE comment_threads SET path=?,revision=revision+1 WHERE project=? AND path=?",
  ).run(to, project, from);
}
export class Comments {
  constructor(private store: Store) {}
  private row(project: string, id: string) {
    this.store.requireProject(project);
    const row = this.store.db
      .prepare(
        "SELECT t.*,f.revision sourceRevision,f.deleted fileDeleted,f.kind fileKind FROM comment_threads t LEFT JOIN files f ON f.project=t.project AND f.path=t.path WHERE t.id=? AND t.project=?",
      )
      .get(identifier(id), project) as Row | undefined;
    if (!row)
      throw new AppError(404, "Comment thread not found in this project.");
    return row;
  }
  private info(row: Row, full = false): CommentInfo {
    const first = this.store.db
      .prepare(
        "SELECT body FROM comment_messages WHERE thread=? AND deleted=0 ORDER BY rowid LIMIT 1",
      )
      .get(row.id) as Row | undefined;
    const count = this.store.db
      .prepare(
        "SELECT count(*) n FROM comment_messages WHERE thread=? AND deleted=0",
      )
      .get(row.id) as Row;
    return {
      id: row.id,
      projectId: row.project,
      path: row.path,
      revision: row.revision,
      created: row.created,
      updated: row.updated,
      resolved: !!row.resolved,
      deleted: !!row.deleted,
      anchor: {
        ...JSON.parse(row.payload).anchor,
        quote: full
          ? JSON.parse(row.payload).anchor.quote
          : JSON.parse(row.payload).anchor.quote.slice(0, 240),
      },
      sourceRevision: row.sourceRevision ?? null,
      unavailable: !!row.fileDeleted || row.fileKind !== "text",
      excerpt: (first?.body ?? "All messages are in Trash.").slice(0, 240),
      messages: count.n,
    };
  }
  get(project: string, id: string): CommentThread {
    const row = this.row(project, id);
    const replies = (
      this.store.db
        .prepare(
          "SELECT id,body,created,updated,deleted FROM comment_messages WHERE thread=? ORDER BY rowid",
        )
        .all(id) as Row[]
    ).map((r) => ({ ...r, deleted: !!r.deleted }));
    return { ...this.info(row, true), replies } as CommentThread;
  }
  list(project: string, query: unknown): CommentPage {
    this.store.requireProject(project);
    const q = input(query),
      state = (q.state ?? "open") as CommentState,
      path = q.path === undefined ? null : safePath(q.path),
      offset = Number(q.offset ?? 0);
    if (
      !["open", "resolved", "trash"].includes(state) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10000
    )
      throw new AppError(400, "Choose an available comment view and page.");
    const where =
        "project=? AND deleted=?" +
        (state === "trash" ? "" : " AND resolved=?") +
        (path ? " AND path=?" : ""),
      params: (string | number)[] = [project, Number(state === "trash")];
    if (state !== "trash") params.push(Number(state === "resolved"));
    if (path) params.push(path);
    const total = (
      this.store.db
        .prepare(`SELECT count(*) n FROM comment_threads WHERE ${where}`)
        .get(...params) as Row
    ).n;
    const rows = this.store.db
      .prepare(
        `SELECT id FROM comment_threads WHERE ${where} ORDER BY updated DESC,id DESC LIMIT 50 OFFSET ?`,
      )
      .all(...params, offset) as Row[];
    return {
      items: rows.map((r) => this.info(this.row(project, r.id))),
      total,
      nextOffset:
        offset + rows.length < total ? offset + rows.length : undefined,
    };
  }
  anchors(project: string, path: unknown): CommentMark[] {
    this.store.requireProject(project);
    const name = safePath(path);
    const rows = this.store.db
      .prepare(
        `SELECT t.id,t.revision,t.payload,f.revision sourceRevision,f.deleted fileDeleted,f.kind fileKind
      FROM comment_threads t LEFT JOIN files f ON f.project=t.project AND f.path=t.path
      WHERE t.project=? AND t.path=? AND t.deleted=0 AND t.resolved=0 ORDER BY t.created,t.id`,
      )
      .all(project, name) as Row[];
    return rows.map((r) => {
      const a = JSON.parse(r.payload).anchor;
      return {
        id: r.id,
        revision: r.revision,
        from: a.from,
        to: a.to,
        status: a.status,
        sourceRevision: r.sourceRevision ?? null,
        unavailable: !!r.fileDeleted || r.fileKind !== "text",
      };
    });
  }
  create(project: string, value: unknown) {
    this.store.requireProject(project);
    const b = input(value),
      id = identifier(b.id),
      path = safePath(b.path),
      body = text(b.body);
    const signature = createHash("sha256")
      .update(JSON.stringify([path, b.revision, b.from, b.to, body]))
      .digest("hex");
    const existing = this.store.db
      .prepare("SELECT project,payload FROM comment_threads WHERE id=?")
      .get(id) as Row | undefined;
    if (existing) {
      if (
        existing.project === project &&
        JSON.parse(existing.payload).signature === signature
      )
        return this.get(project, id);
      throw new AppError(
        409,
        "That comment request was already used. Refresh the thread before retrying.",
      );
    }
    this.store.unlocked(project);
    const file = this.store.readText(project, path);
    if (file.revision !== b.revision)
      throw new AppError(
        409,
        "The source changed. Your comment is still a draft; select the passage again.",
      );
    if (!commentRange(file.content, b.from, b.to))
      throw new AppError(
        400,
        "Select a passage of up to 10,000 source characters.",
      );
    if (
      (
        this.store.db
          .prepare("SELECT count(*) n FROM comment_threads WHERE project=?")
          .get(project) as Row
      ).n >= 10000 ||
      (
        this.store.db
          .prepare(
            "SELECT count(*) n FROM comment_threads WHERE project=? AND path=?",
          )
          .get(project, path) as Row
      ).n >= 1000
    )
      throw new AppError(
        413,
        "This project or file has reached its comment limit. Existing threads remain available.",
      );
    const now = new Date().toISOString(),
      anchor: CommentAnchor = captureCommentAnchor(file.content, b.from, b.to);
    this.store.transaction(() => {
      this.store.db
        .prepare("INSERT INTO comment_threads VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          project,
          path,
          0,
          JSON.stringify({ anchor, signature }),
          now,
          now,
          0,
          0,
        );
      this.store.db
        .prepare("INSERT INTO comment_messages VALUES(?,?,?,?,?,0)")
        .run(id, id, body, now, now);
    });
    this.store.scheduleReviewHistory(project);
    return this.get(project, id);
  }
  change(project: string, id: string, value: unknown) {
    const b = input(value),
      row = this.row(project, id),
      action = b.action;
    this.store.unlocked(project);
    // A retried reply is recovered before the version check; no duplicate message.
    if (action === "reply") {
      const key = identifier(b.id),
        existing = this.store.db
          .prepare("SELECT thread,body FROM comment_messages WHERE id=?")
          .get(key) as Row | undefined;
      if (existing) {
        if (existing.thread === id && existing.body === text(b.body))
          return this.get(project, id);
        throw new AppError(
          409,
          "That reply request was already used. Refresh before retrying.",
        );
      }
    }
    if (row.revision !== b.revision)
      throw new AppError(
        409,
        "This thread changed in another view. Refresh it; your draft is kept.",
      );
    if (row.deleted && action !== "restore")
      throw new AppError(
        409,
        "Restore this thread from Trash before changing it.",
      );
    const now = new Date().toISOString();
    this.store.transaction(() => {
      if (action === "reply") {
        if (row.resolved)
          throw new AppError(409, "Reopen the thread before replying.");
        if (
          (
            this.store.db
              .prepare("SELECT count(*) n FROM comment_messages WHERE thread=?")
              .get(id) as Row
          ).n >= 500
        )
          throw new AppError(
            413,
            "This thread has reached its 500-message limit.",
          );
        this.store.db
          .prepare("INSERT INTO comment_messages VALUES(?,?,?,?,?,0)")
          .run(identifier(b.id), id, text(b.body), now, now);
      } else if (
        ["edit", "delete-message", "restore-message"].includes(action)
      ) {
        const key = identifier(b.id),
          message = this.store.db
            .prepare("SELECT * FROM comment_messages WHERE id=? AND thread=?")
            .get(key, id) as Row | undefined;
        if (!message) throw new AppError(404, "Comment message not found.");
        if (action === "edit") {
          if (message.deleted)
            throw new AppError(409, "Restore the message before editing it.");
          this.store.db
            .prepare("UPDATE comment_messages SET body=?,updated=? WHERE id=?")
            .run(text(b.body), now, key);
        } else
          this.store.db
            .prepare(
              "UPDATE comment_messages SET deleted=?,updated=? WHERE id=?",
            )
            .run(Number(action === "delete-message"), now, key);
      } else if (["resolve", "reopen", "trash", "restore"].includes(action)) {
        const column = ["resolve", "reopen"].includes(action)
          ? "resolved"
          : "deleted";
        this.store.db
          .prepare(`UPDATE comment_threads SET ${column}=? WHERE id=?`)
          .run(Number(["resolve", "trash"].includes(action)), id);
      } else if (action === "reattach") {
        const file = this.store.readText(project, safePath(b.path));
        if (file.revision !== b.sourceRevision)
          throw new AppError(
            409,
            "The selected source changed. Select the passage again.",
          );
        if (!commentRange(file.content, b.from, b.to))
          throw new AppError(
            400,
            "Select a passage of up to 10,000 source characters.",
          );
        if (
          row.path !== file.path &&
          (
            this.store.db
              .prepare(
                "SELECT count(*) n FROM comment_threads WHERE project=? AND path=?",
              )
              .get(project, file.path) as Row
          ).n >= 1000
        )
          throw new AppError(
            413,
            "The destination file has reached its comment limit.",
          );
        const payload = JSON.parse(row.payload);
        payload.anchor = captureCommentAnchor(file.content, b.from, b.to);
        this.store.db
          .prepare("UPDATE comment_threads SET path=?,payload=? WHERE id=?")
          .run(file.path, JSON.stringify(payload), id);
      } else throw new AppError(400, "Choose an available comment action.");
      this.store.db
        .prepare(
          "UPDATE comment_threads SET revision=revision+1,updated=? WHERE id=?",
        )
        .run(now, id);
    });
    this.store.scheduleReviewHistory(project);
    return this.get(project, id);
  }
}
