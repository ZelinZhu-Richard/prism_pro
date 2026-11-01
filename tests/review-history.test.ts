import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Comments } from "../server/comments";
import { Tracking } from "../server/tracking";
import { HistoryRecovery } from "../server/history-recovery";
import { FileMoves } from "../server/file-moves";
import { captureReview, readReview } from "../server/review-history";
import { createApp } from "../server/app";
function setup(t: any) {
  const root = path.resolve(
    "data/verification/review-history-test-" + randomUUID(),
  );
  let store = new Store(root);
  const p = store.create("Synthetic review history", [
    { path: "main.tex", data: Buffer.from("Original target.\n") },
    { path: "notes.tex", data: Buffer.from("Other evidence.\n") },
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    p,
    root,
    get store() {
      return store;
    },
    get comments() {
      return new Comments(store);
    },
    get tracking() {
      return new Tracking(store);
    },
    get recovery() {
      return new HistoryRecovery(store);
    },
    restart() {
      store.close();
      store = new Store(root);
    },
  };
}
type Setup = ReturnType<typeof setup>;
function comment(s: Setup, body = "Original review", name = "main.tex") {
  const f = s.store.readText(s.p.id, name);
  return s.comments.create(s.p.id, {
    id: randomUUID(),
    path: name,
    revision: f.revision,
    from: 0,
    to: Math.min(8, f.content.length),
    body,
  });
}
function edit(s: Setup, text: string, name = "main.tex") {
  const f = s.store.readText(s.p.id, name);
  return s.store.save(s.p.id, name, text, f.revision);
}
function mode(s: Setup, enabled: boolean) {
  s.tracking.mode(s.p.id, {
    enabled,
    revision: s.tracking.status(s.p.id).revision,
  });
}
function plan(s: Setup, version: string, path?: string, includeReview = true) {
  const comparison = s.store.compareHistory(s.p.id, version),
    reviews = s.recovery.comparison(s.p.id, version),
    expectedRevision = path
      ? (s.store.fileList(s.p.id).find((f) => f.path === path)?.revision ??
        null)
      : undefined;
  const input = {
    path,
    includeReview,
    expectedGeneration: comparison.currentGeneration,
    expectedRevision,
    expectedReviewToken: reviews.currentToken,
  };
  const p = s.recovery.plan(s.p.id, version, input);
  return {
    p,
    input: {
      ...input,
      includeReview: p.includeReview,
      token: p.token,
      id: randomUUID(),
    },
  };
}
test("comment-only changes form automatic review snapshots without source revisions", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const s = setup(t),
    before = s.store.project(s.p.id),
    initial = s.store.checkpoints(s.p.id).length;
  const thread = comment(s);
  assert.equal(s.store.checkpoints(s.p.id).length, initial);
  t.mock.timers.tick(10001);
  assert.equal(s.store.checkpoints(s.p.id).length, initial + 1);
  const snapshot = s.store.snapshot(
      s.p.id,
      (s.store.checkpoints(s.p.id)[0] as any).id,
    ),
    review = readReview(s.store.db, snapshot)!;
  assert.equal(review.threads[0].id, thread.id);
  assert.equal(review.messages[0].body, "Original review");
  assert.equal(s.store.project(s.p.id).generation, before.generation);
  assert.equal(s.store.readText(s.p.id, "main.tex").revision, 0);
  const first = captureReview(s.store.db, s.p.id),
    second = captureReview(s.store.db, s.p.id);
  assert.equal(first.reviewHash, second.reviewHash);
  assert.equal(s.store.automaticCheckpoint(s.p.id), null);
});
test("history setting controls future snapshots and survives restart", (t) => {
  const s = setup(t);
  s.recovery.configure(s.p.id, { enabled: false, expected: true });
  comment(s);
  const version = s.store.checkpoint(s.p.id, "Source only");
  assert.equal(s.store.snapshot(s.p.id, version.id).reviewHash, undefined);
  const blobs = (
    s.store.db.prepare("SELECT count(*) n FROM history_blobs").get() as any
  ).n;
  s.recovery.comparison(s.p.id, version.id);
  plan(s, version.id);
  assert.equal(
    (s.store.db.prepare("SELECT count(*) n FROM history_blobs").get() as any).n,
    blobs,
    "Read-only comparison must not persist unreferenced review snapshots while capture is off",
  );
  s.store.automaticCheckpoint(s.p.id);
  assert.equal(s.store.automaticCheckpoint(s.p.id), null);
  s.restart();
  assert.equal(s.recovery.settings(s.p.id).enabled, false);
  s.recovery.configure(s.p.id, { enabled: true, expected: false });
  const included = s.store.checkpoint(s.p.id, "With review");
  assert.ok(readReview(s.store.db, s.store.snapshot(s.p.id, included.id)));
});
test("saved review inspection returns archived wording and bounded summaries without changing current review", (t) => {
  const s = setup(t),
    thread = comment(s);
  mode(s, true);
  edit(s, "Tracked target.\n");
  const version = s.store.checkpoint(s.p.id, "Archived review"),
    current = s.comments.get(s.p.id, thread.id);
  s.comments.change(s.p.id, thread.id, {
    revision: current.revision,
    action: "edit",
    id: thread.id,
    body: "Current wording",
  });
  const before = s.store.project(s.p.id).generation,
    view = s.recovery.archived(s.p.id, version.id, { path: "main.tex" });
  assert.equal(view.available, true);
  assert.equal(view.total, 1);
  assert.ok(view.tracked!.hunks.length);
  assert.equal(view.threads[0].excerpt, "Original review");
  assert.equal(
    s.recovery.archivedThread(s.p.id, version.id, thread.id).messages[0].body,
    "Original review",
  );
  assert.equal(
    s.comments.get(s.p.id, thread.id).replies[0].body,
    "Current wording",
  );
  assert.equal(s.store.project(s.p.id).generation, before);
  assert.throws(
    () => s.recovery.archived(s.p.id, version.id, { path: "../outside" }),
    /paths|path/i,
  );
  assert.throws(
    () => s.recovery.archivedThread(s.p.id, version.id, randomUUID()),
    /not found/,
  );
});
test("archived review pages bound summaries and preserve unique thread identities", (t) => {
  const s = setup(t);
  for (let i = 0; i < 28; i++) comment(s, "Paged review " + i);
  const v = s.store.checkpoint(s.p.id, "Paged discussion"),
    a = s.recovery.archived(s.p.id, v.id, {}),
    b = s.recovery.archived(s.p.id, v.id, { offset: a.nextOffset });
  assert.equal(a.total, 28);
  assert.equal(a.threads.length, 25);
  assert.equal(b.threads.length, 3);
  assert.equal(new Set([...a.threads, ...b.threads].map((t) => t.id)).size, 28);
  assert.ok(a.threads.every((t) => t.excerpt.length <= 240));
  assert.equal(b.nextOffset, undefined);
});
test("a source-only file restore leaves a concurrent unrelated file edit intact", (t) => {
  const s = setup(t),
    version = s.store.checkpoint(s.p.id, "Original");
  edit(s, "Current target\n");
  const prepared = plan(s, version.id, "main.tex", false);
  edit(s, "Concurrent notes\n", "notes.tex");
  s.recovery.apply(s.p.id, version.id, prepared.input);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Original target.\n",
  );
  assert.equal(
    s.store.readText(s.p.id, "notes.tex").content,
    "Concurrent notes\n",
  );
});
test("administrative restore revisions do not appear as content differences", (t) => {
  const s = setup(t),
    thread = comment(s),
    version = s.store.checkpoint(s.p.id, "Original review");
  s.comments.change(s.p.id, thread.id, {
    revision: thread.revision,
    action: "edit",
    id: thread.id,
    body: "Changed wording",
  });
  const prepared = plan(s, version.id);
  s.recovery.apply(s.p.id, version.id, prepared.input);
  assert.equal(s.recovery.comparison(s.p.id, version.id).changed, false);
  assert.deepEqual(s.recovery.comparison(s.p.id, version.id).changedPaths, []);
  assert.ok(s.comments.get(s.p.id, thread.id).revision > thread.revision);
});
test("whole-project restore recovers comments and pending changes, preserves current mode and chats", (t) => {
  const s = setup(t),
    thread = comment(s);
  mode(s, true);
  edit(s, "Reviewed target.\n");
  const pending = s.tracking.file(s.p.id, "main.tex").hunks,
    version = s.store.checkpoint(s.p.id, "Review milestone");
  let current = s.comments.get(s.p.id, thread.id);
  s.comments.change(s.p.id, thread.id, {
    revision: current.revision,
    action: "edit",
    id: thread.id,
    body: "Later wording",
  });
  current = s.comments.get(s.p.id, thread.id);
  const newerId = randomUUID();
  s.comments.change(s.p.id, thread.id, {
    revision: current.revision,
    action: "reply",
    id: newerId,
    body: "Newer reply",
  });
  const future = comment(s, "Newer thread");
  mode(s, false);
  edit(s, "Latest current source.\n");
  const conversation = s.store.createConversation(s.p.id, "Keep this chat");
  const { p, input } = plan(s, version.id);
  assert.equal(p.includeReview, true);
  const result = s.recovery.apply(s.p.id, version.id, input);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Reviewed target.\n",
  );
  assert.deepEqual(s.tracking.file(s.p.id, "main.tex").hunks, pending);
  assert.equal(s.tracking.status(s.p.id).enabled, false);
  current = s.comments.get(s.p.id, thread.id);
  assert.equal(
    current.replies.find((m) => m.id === thread.id)!.body,
    "Original review",
  );
  assert.equal(current.replies.find((m) => m.id === newerId)!.deleted, true);
  assert.equal(s.comments.get(s.p.id, future.id).deleted, true);
  assert.ok(
    s.store.conversations(s.p.id).some((c) => c.id === conversation.id),
  );
  assert.ok(readReview(s.store.db, s.store.snapshot(s.p.id, result.backupId)));
  const back = plan(s, result.backupId);
  s.recovery.apply(s.p.id, result.backupId, back.input);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Latest current source.\n",
  );
  assert.equal(s.comments.get(s.p.id, future.id).deleted, false);
  assert.equal(
    s.comments.get(s.p.id, thread.id).replies.find((m) => m.id === newerId)!
      .deleted,
    false,
  );
});
test("single-file restore preserves unrelated source and review state", (t) => {
  const s = setup(t),
    target = comment(s),
    other = comment(s, "Other review", "notes.tex");
  mode(s, true);
  edit(s, "Tracked target.\n");
  edit(s, "Tracked notes.\n", "notes.tex");
  const version = s.store.checkpoint(s.p.id, "Both files"),
    otherPending = s.tracking.file(s.p.id, "notes.tex").hunks;
  edit(s, "Current target.\n");
  const untouched = s.comments.get(s.p.id, other.id);
  const { input } = plan(s, version.id, "main.tex");
  s.recovery.apply(s.p.id, version.id, input);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Tracked target.\n",
  );
  assert.equal(
    s.store.readText(s.p.id, "notes.tex").content,
    "Tracked notes.\n",
  );
  assert.deepEqual(s.comments.get(s.p.id, other.id), untouched);
  assert.deepEqual(s.tracking.file(s.p.id, "notes.tex").hunks, otherPending);
  assert.equal(s.comments.get(s.p.id, target.id).path, "main.tex");
});
test("restoring an old path copies moved discussion without stealing or duplicating it", (t) => {
  const s = setup(t),
    thread = comment(s);
  s.comments.change(s.p.id, thread.id, {
    revision: thread.revision,
    action: "reply",
    id: "00000000-0000-4000-8000-000000000001",
    body: "Second captured reply",
  });
  const version = s.store.checkpoint(s.p.id, "Before rename"),
    moves = new FileMoves(s.store);
  moves.renameResult(s.p.id, "main.tex", "renamed.tex", {
    generation: s.store.project(s.p.id).generation,
    requestId: randomUUID(),
  });
  const moved = s.comments.get(s.p.id, thread.id),
    first = plan(s, version.id, "main.tex");
  assert.equal(first.p.copiedThreads, 1);
  s.recovery.apply(s.p.id, version.id, first.input);
  assert.deepEqual(s.comments.get(s.p.id, thread.id), moved);
  assert.equal(
    s.store.readText(s.p.id, "renamed.tex").content,
    "Original target.\n",
  );
  const copies = s.comments.list(s.p.id, { path: "main.tex" }).items;
  assert.equal(copies.length, 1);
  assert.notEqual(copies[0].id, thread.id);
  const copy = s.comments.get(s.p.id, copies[0].id);
  s.comments.change(s.p.id, copy.id, {
    revision: copy.revision,
    action: "reply",
    id: randomUUID(),
    body: "Later copied discussion",
  });
  const second = plan(s, version.id, "main.tex");
  s.recovery.apply(s.p.id, version.id, second.input);
  const restored = s.comments.get(s.p.id, copy.id);
  assert.equal(s.comments.list(s.p.id, { path: "main.tex" }).total, 1);
  assert.deepEqual(
    restored.replies.filter((m) => !m.deleted).map((m) => m.body),
    ["Original review", "Second captured reply"],
  );
  assert.equal(restored.replies.length, 3);
  assert.deepEqual(s.comments.get(s.p.id, thread.id), moved);
});
test("legacy source-only versions preserve current discussion and explicitly disable saved-review restore", (t) => {
  const s = setup(t),
    initial = s.store.checkpoints(s.p.id)[0] as any,
    row = s.store.db
      .prepare("SELECT payload FROM checkpoints WHERE id=?")
      .get(initial.id) as any,
    payload = JSON.parse(row.payload);
  delete payload.reviewHash;
  delete payload.reviewOmitted;
  s.store.db
    .prepare("UPDATE checkpoints SET payload=? WHERE id=?")
    .run(JSON.stringify(payload), initial.id);
  const thread = comment(s);
  edit(s, "Different source.\n");
  const { p, input } = plan(s, initial.id);
  assert.equal(p.reviewAvailable, false);
  assert.equal(p.includeReview, false);
  assert.match(p.reviewReason!, /predates/);
  s.recovery.apply(s.p.id, initial.id, input);
  assert.equal(s.comments.get(s.p.id, thread.id).deleted, false);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Original target.\n",
  );
});
test("stale review or source never overwrites newer work", (t) => {
  const s = setup(t),
    thread = comment(s),
    version = s.store.checkpoint(s.p.id, "Saved");
  edit(s, "Current source.\n");
  let prepared = plan(s, version.id);
  const current = s.comments.get(s.p.id, thread.id);
  s.comments.change(s.p.id, thread.id, {
    revision: current.revision,
    action: "edit",
    id: thread.id,
    body: "Concurrent saved review",
  });
  assert.throws(
    () => s.recovery.apply(s.p.id, version.id, prepared.input),
    /changed/,
  );
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Current source.\n",
  );
  prepared = plan(s, version.id);
  edit(s, "Newest source.\n");
  assert.throws(
    () => s.recovery.apply(s.p.id, version.id, prepared.input),
    /changed/,
  );
  assert.equal(
    s.comments.get(s.p.id, thread.id).replies[0].body,
    "Concurrent saved review",
  );
});
test("restore retries are idempotent across restart and never repeat over later edits", (t) => {
  const s = setup(t),
    version = s.store.checkpoint(s.p.id, "Saved");
  edit(s, "Current\n");
  const { input } = plan(s, version.id);
  const result = s.recovery.apply(s.p.id, version.id, input),
    generation = s.store.project(s.p.id).generation;
  s.restart();
  assert.equal(
    s.recovery.apply(s.p.id, version.id, input).backupId,
    result.backupId,
  );
  assert.equal(s.store.project(s.p.id).generation, generation);
  edit(s, "Later edits survive\n");
  s.recovery.apply(s.p.id, version.id, input);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Later edits survive\n",
  );
  assert.throws(
    () =>
      s.recovery.apply(s.p.id, version.id, { ...input, includeReview: false }),
    /already used/,
  );
});
test("source-only restore preserves current review, and pre-restore backup includes review even when automatic capture is off", (t) => {
  const s = setup(t),
    thread = comment(s),
    version = s.store.checkpoint(s.p.id, "With review");
  s.recovery.configure(s.p.id, { enabled: false, expected: true });
  let current = s.comments.get(s.p.id, thread.id);
  s.comments.change(s.p.id, thread.id, {
    revision: current.revision,
    action: "edit",
    id: thread.id,
    body: "Current review",
  });
  edit(s, "Different source\n");
  const { input } = plan(s, version.id, undefined, false),
    result = s.recovery.apply(s.p.id, version.id, input);
  assert.equal(
    s.comments.get(s.p.id, thread.id).replies[0].body,
    "Current review",
  );
  assert.ok(readReview(s.store.db, s.store.snapshot(s.p.id, result.backupId)));
  assert.equal(s.recovery.settings(s.p.id).enabled, false);
});
test("corrupt source or review snapshots fail safely with source-only recovery for metadata", (t) => {
  const s = setup(t),
    thread = comment(s),
    version = s.store.checkpoint(s.p.id, "Saved"),
    snap = s.store.snapshot(s.p.id, version.id);
  edit(s, "Current source\n");
  s.store.db
    .prepare("UPDATE history_blobs SET content=? WHERE hash=?")
    .run(Buffer.from("corrupt"), snap.reviewHash!);
  const p = plan(s, version.id);
  assert.equal(p.p.includeReview, false);
  assert.match(p.p.reviewReason!, /incomplete/);
  assert.equal(s.comments.get(s.p.id, thread.id).deleted, false);
  const source = snap.files.find((f) => f.path === "main.tex")!;
  s.store.db
    .prepare("UPDATE history_blobs SET content=? WHERE hash=?")
    .run(Buffer.from("corrupt source"), source.contentHash);
  assert.throws(
    () => s.recovery.apply(s.p.id, version.id, p.input),
    /incomplete/,
  );
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Current source\n",
  );
});
test("oversized review history is explicitly omitted while current data and source remain", (t) => {
  const s = setup(t);
  s.store.transaction(() => {
    for (let n = 0; n < 1700; n++) {
      const id = randomUUID();
      s.store.db
        .prepare("INSERT INTO comment_threads VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          s.p.id,
          n < 850 ? "main.tex" : "notes.tex",
          0,
          JSON.stringify({
            anchor: { from: 0, to: 1, quote: "O", status: "attached" },
          }),
          "2026-11-01",
          "2026-11-01",
          0,
          0,
        );
      s.store.db
        .prepare("INSERT INTO comment_messages VALUES(?,?,?,?,?,0)")
        .run(id, id, "x".repeat(10000), "2026-11-01", "2026-11-01");
    }
  });
  const version = s.store.checkpoint(s.p.id, "Bounded review"),
    snapshot = s.store.snapshot(s.p.id, version.id);
  assert.equal(snapshot.reviewHash, undefined);
  assert.match(snapshot.reviewOmitted!, /16 MB/);
  assert.equal(s.comments.list(s.p.id, {}).total, 1700);
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Original target.\n",
  );
  assert.equal(plan(s, version.id).p.includeReview, false);
});
test("HTTP restore requires a preview, validates origins and rejects active AI mutations", async (t) => {
  const root = path.resolve(
      "data/verification/review-history-http-" + randomUUID(),
    ),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("HTTP history", [
      { path: "main.tex", data: Buffer.from("Original") },
    ]),
    v = (env.store.checkpoints(p.id)[0] as any).id,
    base = `/api/projects/${p.id}/checkpoints/${v}`,
    headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      "x-prism-request": "1",
    };
  let r = await env.app.inject({
    method: "POST",
    url: base + "/restore",
    headers,
    payload: {},
  });
  assert.equal(r.statusCode, 400);
  const comparison = await env.app.inject({
    method: "GET",
    url: base + "/compare",
    headers,
  });
  const c = comparison.json(),
    request = {
      includeReview: true,
      expectedGeneration: c.currentGeneration,
      expectedReviewToken: c.reviews.currentToken,
    };
  r = await env.app.inject({
    method: "POST",
    url: base + "/restore-preview",
    headers: { ...headers, origin: "https://evil.example" },
    payload: request,
  });
  assert.equal(r.statusCode, 403);
  env.store.projectLocks.set(p.id, "synthetic-ai");
  r = await env.app.inject({
    method: "POST",
    url: base + "/restore-preview",
    headers,
    payload: request,
  });
  assert.equal(r.statusCode, 200);
  const preview = r.json();
  r = await env.app.inject({
    method: "POST",
    url: base + "/restore",
    headers,
    payload: {
      ...request,
      includeReview: preview.includeReview,
      token: preview.token,
      id: randomUUID(),
    },
  });
  assert.equal(r.statusCode, 409);
  env.store.projectLocks.delete(p.id);
});
