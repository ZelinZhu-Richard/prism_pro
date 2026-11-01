import { createHash } from "node:crypto";
import type { Store } from "./store";
import { AppError, safePath } from "./files";
import {
  currentReview,
  readReview,
  restoreReview,
  reviewCounts,
  liveReviewToken,
  reviewHistoryEnabled,
  type ReviewSnapshot,
} from "./review-history";
import type {
  HistoryReviews,
  HistoryRestorePlan,
  HistoryRestoreResult,
  ArchivedReview,
  ArchivedThread,
} from "../shared/history-recovery";
import { trackedDiff } from "../shared/tracking";
type Row = Record<string, any>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Choose a history restore action.");
  return value as Row;
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function reviewPathHashes(review: ReviewSnapshot | undefined) {
  const paths = new Map<string, Row[]>(),
    threads = new Map<string, string>();
  const add = (path: string, row: Row) => {
    let rows = paths.get(path);
    if (!rows) {
      rows = [];
      paths.set(path, rows);
    }
    rows.push(row);
  };
  for (const t of review?.threads ?? []) {
    threads.set(t.id, t.path);
    add(t.path, {
      id: t.id,
      path: t.path,
      created: t.created,
      resolved: t.resolved,
      deleted: t.deleted,
      anchor: JSON.parse(t.payload).anchor,
    });
  }
  for (const m of review?.messages ?? []) {
    const path = threads.get(m.thread);
    if (path)
      add(path, {
        id: m.id,
        thread: m.thread,
        body: m.body,
        created: m.created,
        deleted: m.deleted,
      });
  }
  for (const f of review?.tracked ?? []) add(f.path, f);
  return new Map([...paths].map(([path, rows]) => [path, hash(rows)]));
}
export class HistoryRecovery {
  constructor(readonly store: Store) {}
  settings(project: string) {
    this.store.requireProject(project);
    return { enabled: reviewHistoryEnabled(this.store.db, project) };
  }
  configure(project: string, value: unknown) {
    const r = object(value);
    this.store.unlocked(project);
    if (typeof r.enabled !== "boolean" || typeof r.expected !== "boolean")
      throw new AppError(
        400,
        "Choose whether automatic history includes review state.",
      );
    const current = this.settings(project);
    if (current.enabled !== r.expected && current.enabled !== r.enabled)
      throw new AppError(
        409,
        "The history setting changed. Refresh before changing it.",
      );
    if (current.enabled !== r.enabled) {
      this.store.setSetting("historyReviews:" + project, r.enabled);
      this.store.scheduleHistory(project);
    }
    return this.settings(project);
  }
  archived(project: string, version: string, value: unknown): ArchivedReview {
    const r = object(value),
      path = r.path === undefined ? undefined : safePath(r.path),
      offset = Number(r.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
      throw new AppError(400, "Choose a valid saved-review page.");
    const snapshot = this.store.snapshot(project, version);
    let review: ReviewSnapshot | undefined,
      reason = snapshot.reviewOmitted;
    try {
      review = readReview(this.store.db, snapshot);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    if (!review)
      return {
        available: false,
        reason: reason ?? "This version predates review history.",
        paths: [],
        total: 0,
        threads: [],
      };
    const threads = review.threads.filter(
        (t) => path === undefined || t.path === path,
      ),
      page = threads.slice(offset, offset + 25),
      messages = new Map<string, Row[]>();
    for (const m of review.messages) {
      let list = messages.get(m.thread);
      if (!list) {
        list = [];
        messages.set(m.thread, list);
      }
      list.push(m);
    }
    const pending =
        path === undefined
          ? undefined
          : review.tracked.find((f) => f.path === path),
      file = pending
        ? snapshot.files.find((f) => f.path === path && f.kind === "text")
        : undefined;
    return {
      available: true,
      paths: [
        ...new Set([
          ...review.threads.map((t) => t.path),
          ...review.tracked.map((f) => f.path),
        ]),
      ].sort(),
      total: threads.length,
      nextOffset:
        offset + page.length < threads.length
          ? offset + page.length
          : undefined,
      threads: page.map((t) => ({
        id: t.id,
        path: t.path,
        resolved: !!t.resolved,
        deleted: !!t.deleted,
        excerpt: (
          messages.get(t.id)?.find((m) => !m.deleted)?.body ??
          "All messages were in Trash."
        ).slice(0, 240),
        messages: messages.get(t.id)?.length ?? 0,
      })),
      tracked:
        pending && file
          ? {
              path: pending.path,
              ...trackedDiff(
                pending.base,
                this.store.snapshotBytes(file).toString("utf8"),
              ),
              deleted: !!file.deleted,
            }
          : undefined,
    };
  }
  archivedThread(project: string, version: string, id: string): ArchivedThread {
    const snapshot = this.store.snapshot(project, version),
      review = readReview(this.store.db, snapshot),
      thread = review?.threads.find((t) => t.id === id);
    if (!thread || !review)
      throw new AppError(
        404,
        "Saved comment thread not found in this version.",
      );
    const anchor = JSON.parse(thread.payload).anchor;
    return {
      id: thread.id,
      path: thread.path,
      resolved: !!thread.resolved,
      deleted: !!thread.deleted,
      quote: anchor.quote,
      anchorStatus: anchor.status,
      messages: review.messages
        .filter((m) => m.thread === id)
        .map((m) => ({
          id: m.id,
          body: m.body,
          created: m.created,
          deleted: !!m.deleted,
        })),
    };
  }
  comparison(
    project: string,
    version: string,
    target?: string,
  ): HistoryReviews {
    const before = this.store.snapshot(project, version),
      after = target
        ? this.store.snapshot(project, target)
        : currentReview(this.store.db, project),
      current = currentReview(this.store.db, project);
    let a: ReviewSnapshot | undefined,
      b: ReviewSnapshot | undefined,
      reason: string | undefined;
    try {
      a = readReview(this.store.db, before);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    try {
      b = target ? readReview(this.store.db, after) : current.snapshot;
    } catch (e) {
      reason ??= e instanceof Error ? e.message : String(e);
    }
    const oldPaths = reviewPathHashes(a),
      newPaths = reviewPathHashes(b),
      changedPaths =
        a && b
          ? [...new Set([...oldPaths.keys(), ...newPaths.keys()])]
              .filter((path) => oldPaths.get(path) !== newPaths.get(path))
              .sort()
          : [];
    return {
      beforeAvailable: !!a,
      afterAvailable: !!b,
      changed: a && b ? changedPaths.length > 0 : null,
      before: reviewCounts(a),
      after: reviewCounts(b),
      changedPaths,
      currentToken: current.reviewHash
        ? liveReviewToken(this.store.db, project)
        : undefined,
      reason:
        reason ??
        before.reviewOmitted ??
        (!before.reviewHash
          ? "This version predates review history."
          : undefined),
    };
  }
  plan(project: string, version: string, value: unknown): HistoryRestorePlan {
    const r = object(value),
      path = r.path === undefined ? undefined : safePath(r.path),
      snapshot = this.store.snapshot(project, version),
      current = this.store.project(project);
    if (typeof r.includeReview !== "boolean")
      throw new AppError(
        400,
        "Choose source-only or source with saved review state.",
      );
    const file =
      path === undefined
        ? undefined
        : snapshot.files.find(
            (f) => f.path === path && !f.deleted && f.kind !== "directory",
          );
    if (path !== undefined && !file)
      throw new AppError(404, "Choose a restorable file in this version.");
    const row =
        path === undefined
          ? undefined
          : (this.store.db
              .prepare("SELECT revision FROM files WHERE project=? AND path=?")
              .get(project, path) as Row | undefined),
      currentRevision = row?.revision ?? null;
    if (
      path === undefined
        ? r.expectedGeneration !== current.generation
        : r.expectedRevision !== currentRevision
    )
      throw new AppError(
        409,
        "The source changed after comparison. Refresh history before preparing a restore.",
      );
    const currentRef = currentReview(this.store.db, project);
    let saved: ReviewSnapshot | undefined, reviewReason: string | undefined;
    try {
      saved = readReview(this.store.db, snapshot);
    } catch (e) {
      reviewReason = e instanceof Error ? e.message : String(e);
    }
    const reviewAvailable = !!saved && !!currentRef.reviewHash;
    if (!reviewAvailable)
      reviewReason ??=
        snapshot.reviewOmitted ??
        currentRef.reviewOmitted ??
        "This version predates review history.";
    const includeReview = r.includeReview && reviewAvailable,
      currentToken = includeReview
        ? liveReviewToken(this.store.db, project)
        : undefined;
    if (includeReview && r.expectedReviewToken !== currentToken)
      throw new AppError(
        409,
        "Comments or tracked changes changed after comparison. Refresh history before preparing a restore.",
      );
    const checkpoint = this.store.db
      .prepare("SELECT name,payload FROM checkpoints WHERE id=? AND project=?")
      .get(version, project) as Row;
    const token = hash([
      project,
      version,
      path ?? null,
      includeReview,
      path === undefined ? current.generation : currentRevision,
      hash(checkpoint.payload),
      currentToken,
    ]);
    const live = currentRef.snapshot,
      copiedThreads =
        path === undefined || !saved
          ? 0
          : saved.threads
              .filter((t) => t.path === path)
              .filter((t) => {
                const existing = this.store.db
                  .prepare(
                    "SELECT path FROM comment_threads WHERE id=? AND project=?",
                  )
                  .get(t.id, project) as Row | undefined;
                return existing && existing.path !== path;
              }).length;
    return {
      versionId: version,
      versionName: checkpoint.name,
      path,
      token,
      sourceFiles:
        path === undefined
          ? snapshot.files.filter((f) => !f.deleted && f.kind !== "directory")
              .length
          : 1,
      includeReview,
      reviewAvailable,
      reviewReason,
      savedReview: reviewCounts(saved, path),
      currentReview: reviewCounts(live, path),
      copiedThreads,
      currentRevision,
      currentGeneration: current.generation,
      root: snapshot.project.root,
      engine: snapshot.project.engine,
    };
  }
  apply(
    project: string,
    version: string,
    value: unknown,
  ): HistoryRestoreResult {
    const r = object(value);
    this.store.unlocked(project);
    if (
      typeof r.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        r.id,
      ) ||
      typeof r.token !== "string"
    )
      throw new AppError(400, "Review a restore preview before confirming.");
    const signature = hash([version, r.path ?? null, r.includeReview, r.token]),
      prior = this.store.db
        .prepare("SELECT * FROM history_restores WHERE id=?")
        .get(r.id) as Row | undefined;
    if (prior) {
      if (prior.project !== project || prior.signature !== signature)
        throw new AppError(
          409,
          "This restore request was already used. Prepare a new restore.",
        );
      this.store.materialize(project);
      return {
        project: this.store.project(project),
        operationId: r.id,
        backupId: prior.backup,
      };
    }
    const plan = this.plan(project, version, r);
    if (plan.token !== r.token || plan.includeReview !== r.includeReview)
      throw new AppError(
        409,
        "The source or review changed. Your restore was not applied; refresh history and review again.",
      );
    const snapshot = this.store.snapshot(project, version),
      saved = plan.includeReview
        ? readReview(this.store.db, snapshot)
        : undefined;
    let backupId = "";
    const recover = (backup: string) => {
      backupId = backup;
      if (saved) restoreReview(this.store.db, project, saved, plan.path);
      this.store.db
        .prepare("INSERT INTO history_restores VALUES(?,?,?,?,?,?,?)")
        .run(
          r.id,
          project,
          version,
          plan.path ?? null,
          signature,
          backup,
          new Date().toISOString(),
        );
    };
    const restored =
      plan.path === undefined
        ? this.store.restoreCheckpoint(project, version, recover)
        : this.store.restoreCheckpointFile(
            project,
            version,
            plan.path,
            plan.currentRevision,
            recover,
          );
    this.store.automaticCheckpoint(
      project,
      plan.path ? "Restored " + plan.path : "Restored project version",
    );
    return { project: restored, operationId: r.id, backupId };
  }
}
