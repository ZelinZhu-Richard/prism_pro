import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { AppError, safePath } from "./files";
import { trackedDiff } from "../shared/tracking";
type Row = Record<string, any>;
export interface ReviewSnapshot {
  version: 1;
  threads: Row[];
  messages: Row[];
  tracked: { path: string; base: string }[];
}
export interface ReviewReference {
  reviewHash?: string;
  reviewOmitted?: string;
}
const LIMIT = 16 * 1024 * 1024,
  uuid = /^[0-9a-f-]{36}$/i;
function copyId(project: string, path: string, id: string) {
  const h = createHash("sha256")
    .update(JSON.stringify([project, path, id]))
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function reviewHistoryEnabled(db: DatabaseSync, project: string) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key=?")
    .get("historyReviews:" + project) as Row | undefined;
  return row ? JSON.parse(row.value) === true : true;
}
export function currentReview(
  db: DatabaseSync,
  project: string,
): ReviewReference & { snapshot?: ReviewSnapshot; data?: Buffer } {
  const snapshot: ReviewSnapshot = {
    version: 1,
    threads: [],
    messages: [],
    tracked: [],
  };
  let bytes = 100;
  const add = (items: Row[], row: Row) => {
    bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes > LIMIT) throw new Error("limit");
    items.push(row);
  };
  try {
    for (const row of db
      .prepare(
        "SELECT id,path,revision,payload,created,updated,resolved,deleted FROM comment_threads WHERE project=? ORDER BY id",
      )
      .iterate(project) as Iterable<Row>) {
      if (snapshot.threads.length >= 10000) throw new Error("limit");
      add(snapshot.threads, row);
    }
    for (const row of db
      .prepare(
        "SELECT m.id,m.thread,m.body,m.created,m.updated,m.deleted FROM comment_messages m JOIN comment_threads t ON t.id=m.thread WHERE t.project=? ORDER BY m.rowid",
      )
      .iterate(project) as Iterable<Row>) {
      if (snapshot.messages.length >= 50000) throw new Error("limit");
      add(snapshot.messages, row);
    }
    for (const row of db
      .prepare(
        "SELECT path,base FROM tracking_files WHERE project=? ORDER BY path",
      )
      .iterate(project) as Iterable<Row>) {
      if (snapshot.tracked.length >= 10000) throw new Error("limit");
      add(snapshot.tracked, row);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "limit")
      return {
        reviewOmitted:
          "Review state exceeds the 16 MB or record-count history limit. Source is saved; review data remains in the current project.",
      };
    throw error;
  }
  const data = Buffer.from(JSON.stringify(snapshot)),
    reviewHash = createHash("sha256").update(data).digest("hex");
  return { reviewHash, snapshot, data };
}
export function captureReview(
  db: DatabaseSync,
  project: string,
): ReviewReference {
  const value = currentReview(db, project);
  if (value.reviewHash && value.data)
    db.prepare("INSERT OR IGNORE INTO history_blobs VALUES(?,?)").run(
      value.reviewHash,
      value.data,
    );
  return { reviewHash: value.reviewHash, reviewOmitted: value.reviewOmitted };
}
export function readReview(
  db: DatabaseSync,
  ref: ReviewReference,
): ReviewSnapshot | undefined {
  if (!ref.reviewHash) return undefined;
  const row = db
    .prepare("SELECT content FROM history_blobs WHERE hash=?")
    .get(ref.reviewHash) as Row | undefined;
  if (!row || Buffer.byteLength(row.content) > LIMIT)
    throw new AppError(
      409,
      "This version's review snapshot is missing or exceeds its limit. Restore source only, or choose another version.",
    );
  const bytes = Buffer.from(row.content);
  if (createHash("sha256").update(bytes).digest("hex") !== ref.reviewHash)
    throw new AppError(
      409,
      "This version's review snapshot is incomplete. Restore source only, or choose another version.",
    );
  let s: ReviewSnapshot;
  try {
    s = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AppError(
      409,
      "This version's review snapshot is unreadable. Restore source only, or choose another version.",
    );
  }
  const valid = () => {
    if (
      s.version !== 1 ||
      !Array.isArray(s.threads) ||
      !Array.isArray(s.messages) ||
      !Array.isArray(s.tracked) ||
      s.threads.length > 10000 ||
      s.messages.length > 50000 ||
      s.tracked.length > 10000
    )
      return false;
    const ids = new Set<string>(),
      messages = new Set<string>(),
      paths = new Set<string>();
    for (const t of s.threads) {
      if (
        typeof t.id !== "string" ||
        !uuid.test(t.id) ||
        ids.has(t.id) ||
        !Number.isSafeInteger(t.revision) ||
        t.revision < 0 ||
        typeof t.payload !== "string" ||
        typeof t.created !== "string" ||
        typeof t.updated !== "string" ||
        ![0, 1].includes(t.resolved) ||
        ![0, 1].includes(t.deleted)
      )
        return false;
      safePath(t.path);
      ids.add(t.id);
      const a = JSON.parse(t.payload).anchor;
      if (
        !a ||
        !Number.isInteger(a.from) ||
        !Number.isInteger(a.to) ||
        a.from < 0 ||
        a.to < a.from ||
        typeof a.quote !== "string" ||
        a.quote.length > 10000 ||
        !["attached", "changed", "removed"].includes(a.status)
      )
        return false;
    }
    for (const m of s.messages) {
      if (
        typeof m.id !== "string" ||
        !uuid.test(m.id) ||
        messages.has(m.id) ||
        !ids.has(m.thread) ||
        typeof m.body !== "string" ||
        m.body.length > 10000 ||
        typeof m.created !== "string" ||
        typeof m.updated !== "string" ||
        ![0, 1].includes(m.deleted)
      )
        return false;
      messages.add(m.id);
    }
    for (const f of s.tracked) {
      safePath(f.path);
      if (paths.has(f.path) || typeof f.base !== "string") return false;
      paths.add(f.path);
    }
    return true;
  };
  try {
    if (valid()) return s;
  } catch {
    /* Malformed metadata never reaches restore writes. */
  }
  throw new AppError(
    409,
    "This version's review snapshot is invalid. Restore source only, or choose another version.",
  );
}
// Streaming hash binds live review state without allocating an unbounded project JSON.
export function liveReviewToken(db: DatabaseSync, project: string) {
  const h = createHash("sha256");
  for (const query of [
    "SELECT * FROM comment_threads WHERE project=? ORDER BY id",
    "SELECT m.* FROM comment_messages m JOIN comment_threads t ON t.id=m.thread WHERE t.project=? ORDER BY m.id",
    "SELECT * FROM tracking_files WHERE project=? ORDER BY path",
    "SELECT * FROM tracking_projects WHERE project=?",
  ])
    for (const row of db.prepare(query).iterate(project))
      h.update(JSON.stringify(row)).update("\n");
  return h.digest("hex");
}
export function reviewCounts(
  snapshot: ReviewSnapshot | undefined,
  path?: string,
) {
  const threads =
      snapshot?.threads.filter((t) => path === undefined || t.path === path) ??
      [],
    ids = new Set(threads.map((t) => t.id));
  return {
    threads: threads.length,
    messages: snapshot?.messages.filter((m) => ids.has(m.thread)).length ?? 0,
    trackedFiles:
      snapshot?.tracked.filter((t) => path === undefined || t.path === path)
        .length ?? 0,
  };
}
export function restoreReview(
  db: DatabaseSync,
  project: string,
  snapshot: ReviewSnapshot,
  path?: string,
) {
  const threads = snapshot.threads.filter(
      (t) => path === undefined || t.path === path,
    ),
    ids = new Set(threads.map((t) => t.id)),
    now = new Date().toISOString();
  const messagesByThread = new Map<string, Row[]>();
  for (const message of snapshot.messages) {
    let items = messagesByThread.get(message.thread);
    if (!items) {
      items = [];
      messagesByThread.set(message.thread, items);
    }
    items.push(message);
  }
  const current = db
    .prepare(
      "SELECT id,path FROM comment_threads WHERE project=?" +
        (path === undefined ? "" : " AND path=?"),
    )
    .all(...(path === undefined ? [project] : [project, path])) as Row[];
  // Newer discussion remains recoverable in comment Trash and in the pre-restore backup.
  for (const t of current)
    if (!ids.has(t.id))
      db.prepare(
        "UPDATE comment_threads SET deleted=1,revision=revision+1,updated=? WHERE id=?",
      ).run(now, t.id);
  for (const t of threads) {
    const existing = db
      .prepare("SELECT project,path,revision FROM comment_threads WHERE id=?")
      .get(t.id) as Row | undefined;
    if (existing && existing.project !== project)
      throw new AppError(409, "A restored comment identifier is unavailable.");
    // Single-file restore must not steal discussion from a file that was moved elsewhere.
    const clone = path !== undefined && existing && existing.path !== path,
      id = clone ? copyId(project, path, t.id) : t.id;
    const destination = db
      .prepare("SELECT project,path,revision FROM comment_threads WHERE id=?")
      .get(id) as Row | undefined;
    if (
      destination &&
      (destination.project !== project ||
        (clone && destination.path !== t.path))
    )
      throw new AppError(409, "A restored comment identifier is unavailable.");
    if (!destination) {
      const total = (
          db
            .prepare("SELECT count(*) n FROM comment_threads WHERE project=?")
            .get(project) as Row
        ).n,
        inFile = (
          db
            .prepare(
              "SELECT count(*) n FROM comment_threads WHERE project=? AND path=?",
            )
            .get(project, t.path) as Row
        ).n;
      if (total >= 10000 || inFile >= 1000)
        throw new AppError(
          413,
          "Restoring copied comments would exceed the comment limit. Restore source only to keep current discussion.",
        );
    }
    db.prepare(
      "INSERT INTO comment_threads VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,revision=excluded.revision,payload=excluded.payload,created=excluded.created,updated=excluded.updated,resolved=excluded.resolved,deleted=excluded.deleted",
    ).run(
      id,
      project,
      t.path,
      Math.max(destination?.revision ?? -1, t.revision) + 1,
      t.payload,
      t.created,
      now,
      t.resolved,
      t.deleted,
    );
    const wanted = messagesByThread.get(t.id) ?? [],
      messageIds = new Set(
        wanted.map((m) => (clone ? copyId(project, id, m.id) : m.id)),
      );
    for (const m of db
      .prepare("SELECT id FROM comment_messages WHERE thread=?")
      .all(id) as Row[])
      if (!messageIds.has(m.id))
        db.prepare(
          "UPDATE comment_messages SET deleted=1,updated=? WHERE id=?",
        ).run(now, m.id);
    for (const m of wanted) {
      const mid = clone ? copyId(project, id, m.id) : m.id,
        old = db
          .prepare("SELECT thread FROM comment_messages WHERE id=?")
          .get(mid) as Row | undefined;
      if (old && old.thread !== id)
        throw new AppError(
          409,
          "A restored message identifier is unavailable.",
        );
      db.prepare(
        "INSERT INTO comment_messages VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,created=excluded.created,updated=excluded.updated,deleted=excluded.deleted",
      ).run(mid, id, m.body, m.created, now, m.deleted);
    }
  }
  db.prepare(
    "DELETE FROM tracking_files WHERE project=?" +
      (path === undefined ? "" : " AND path=?"),
  ).run(...(path === undefined ? [project] : [project, path]));
  for (const f of snapshot.tracked.filter(
    (f) => path === undefined || f.path === path,
  )) {
    const file = db
      .prepare("SELECT content,kind FROM files WHERE project=? AND path=?")
      .get(project, f.path) as Row | undefined;
    if (!file || file.kind !== "text")
      throw new AppError(409, "A tracked file is missing from this version.");
    const diff = trackedDiff(
      f.base,
      Buffer.from(file.content).toString("utf8"),
    );
    if (diff.hunks.length)
      db.prepare("INSERT INTO tracking_files VALUES(?,?,?,?,?)").run(
        project,
        f.path,
        f.base,
        diff.hunks.length,
        Number(diff.limited),
      );
  }
  // Editing/Reviewing is a current preference, not a historical document mutation.
  db.prepare(
    "INSERT INTO tracking_projects VALUES(?,0,1) ON CONFLICT(project) DO UPDATE SET revision=revision+1",
  ).run(project);
}
