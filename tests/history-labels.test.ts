import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { HistoryLabels } from "../server/history-labels";
import { HistoryRecovery } from "../server/history-recovery";
import { Comments } from "../server/comments";
import { Tracking } from "../server/tracking";
import { createApp } from "../server/app";
import { labelMatches } from "../shared/history-labels";
function setup(t: any) {
  const root = path.resolve(
    "data/verification/history-labels-test-" + randomUUID(),
  );
  let store = new Store(root);
  const p = store.create("Synthetic labels", [
    { path: "main.tex", data: Buffer.from("Original target.\n") },
    { path: "notes.tex", data: Buffer.from("Supporting evidence.\n") },
  ]);
  const initial = store.checkpoints(p.id)[0].id;
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    p,
    initial,
    root,
    get store() {
      return store;
    },
    get labels() {
      return new HistoryLabels(store);
    },
    restart() {
      store.close();
      store = new Store(root);
    },
  };
}
function mutate(
  s: ReturnType<typeof setup>,
  checkpoint: string,
  action: string,
  name?: string,
  labelId?: string,
) {
  return s.labels.change(s.p.id, checkpoint, {
    id: randomUUID(),
    action,
    name,
    labelId,
    expectedRevision: s.labels.get(s.p.id, checkpoint).labelRevision,
  }).version;
}
function sourceEvidence(s: ReturnType<typeof setup>) {
  return {
    project: s.store.project(s.p.id),
    files: s.store.exportFiles(s.p.id),
    checkpoints: s.store.db
      .prepare("SELECT * FROM checkpoints WHERE project=? ORDER BY rowid")
      .all(s.p.id),
    versions: s.store.db
      .prepare("SELECT * FROM versions WHERE project=? ORDER BY id")
      .all(s.p.id),
    review: s.store.db
      .prepare("SELECT * FROM tracking_files WHERE project=? ORDER BY path")
      .all(s.p.id),
    comments: s.store.db
      .prepare("SELECT * FROM comment_threads WHERE project=? ORDER BY id")
      .all(s.p.id),
    blobs: s.store.db
      .prepare("SELECT * FROM history_blobs ORDER BY hash")
      .all(),
  };
}
test("legacy named/automatic checkpoints migrate once without changing stored snapshots or resurrecting removals", (t) => {
  const s = setup(t),
    named = s.store.checkpoint(s.p.id, "Legacy milestone"),
    before = sourceEvidence(s);
  s.store.db.exec("DROP TABLE history_label_state");
  s.restart();
  assert.deepEqual(sourceEvidence(s), before);
  assert.deepEqual(s.labels.get(s.p.id, s.initial).labels, []);
  const legacy = s.labels.get(s.p.id, named.id);
  assert.equal(legacy.labels?.[0].name, "Legacy milestone");
  const id = legacy.labels![0].id;
  mutate(s, named.id, "remove", undefined, id);
  s.restart();
  assert.ok(s.labels.get(s.p.id, named.id).labels![0].deletedAt);
  assert.equal(s.labels.get(s.p.id, named.id).labels![0].id, id);
  assert.deepEqual(sourceEvidence(s), before);
});
test("multiple labels, rename and recoverable removal leave source, review, generation and history exact", (t) => {
  const s = setup(t),
    comments = new Comments(s.store);
  comments.create(s.p.id, {
    id: randomUUID(),
    path: "main.tex",
    revision: 0,
    from: 0,
    to: 8,
    body: "Synthetic review metadata.",
  });
  new Tracking(s.store).mode(s.p.id, { enabled: true, revision: 0 });
  s.store.save(s.p.id, "main.tex", "Revised target.\n", 0);
  s.store.automaticCheckpoint(s.p.id);
  const before = sourceEvidence(s);
  let v = mutate(s, s.initial, "add", "First milestone");
  const first = v.labels![0].id;
  v = mutate(s, s.initial, "add", "第二轮 · Café");
  const second = v.labels![1].id;
  assert.equal(v.labels!.length, 2);
  assert.equal(v.name, "First milestone");
  v = mutate(s, s.initial, "rename", "Submission ready", first);
  assert.equal(v.name, "Submission ready");
  v = mutate(s, s.initial, "remove", undefined, first);
  assert.equal(v.name, "第二轮 · Café");
  assert.ok(v.labels!.find((l) => l.id === first)?.deletedAt);
  v = mutate(s, s.initial, "restore", undefined, first);
  assert.equal(v.name, "Submission ready");
  assert.equal(v.labels![1].id, second);
  assert.deepEqual(sourceEvidence(s), before);
  s.restart();
  assert.deepEqual(s.labels.get(s.p.id, s.initial), v);
  assert.deepEqual(sourceEvidence(s), before);
});
test("label-only operations do not schedule grouped source or review checkpoints", (t) => {
  const s = setup(t),
    count = s.store.checkpoints(s.p.id).length;
  mutate(s, s.initial, "add", "Milestone");
  assert.equal(s.store.historyTimers.size, 0);
  assert.equal(s.store.automaticCheckpoint(s.p.id), null);
  assert.equal(s.store.checkpoints(s.p.id).length, count);
});
test("canonical duplicate names are rejected per version, while other versions may reuse names", (t) => {
  const s = setup(t);
  const v = mutate(s, s.initial, "add", "Café  Draft");
  assert.throws(
    () => mutate(s, s.initial, "add", "  CAFE\u0301 draft "),
    /already has/,
  );
  const other = s.store.checkpoint(s.p.id, "Other");
  mutate(s, other.id, "add", "Café Draft");
  mutate(s, s.initial, "remove", undefined, v.labels![0].id);
  const newer = mutate(s, s.initial, "add", "Café Draft");
  assert.throws(
    () => mutate(s, s.initial, "restore", undefined, v.labels![0].id),
    /already has/,
  );
  assert.equal(newer.labels!.filter((l) => !l.deletedAt).length, 1);
});
test("a replayed label action survives restart and never overwrites later metadata", (t) => {
  const s = setup(t),
    request = {
      id: randomUUID(),
      action: "add",
      name: "Original label",
      expectedRevision: 0,
    };
  const result = s.labels.change(s.p.id, s.initial, request);
  mutate(s, s.initial, "rename", "Later label", result.version.labels![0].id);
  s.restart();
  const before = s.labels.get(s.p.id, s.initial),
    replay = s.labels.change(s.p.id, s.initial, request);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.version, before);
  assert.equal(replay.version.labels![0].name, "Later label");
  assert.throws(
    () => s.labels.change(s.p.id, s.initial, { ...request, name: "Different" }),
    /identifier/,
  );
  const other = s.store.create("Other");
  assert.throws(
    () =>
      s.labels.change(other.id, s.store.checkpoints(other.id)[0].id, request),
    /identifier/,
  );
});
test("stale revisions and labels belonging to another version are rejected without a partial update", (t) => {
  const s = setup(t),
    stale = {
      id: randomUUID(),
      action: "add",
      name: "Stale draft",
      expectedRevision: 0,
    };
  mutate(s, s.initial, "add", "Current label");
  assert.throws(
    () => s.labels.change(s.p.id, s.initial, stale),
    /Labels changed/,
  );
  const other = s.store.checkpoint(s.p.id, "Other");
  const before = s.labels.get(s.p.id, s.initial);
  assert.throws(
    () =>
      mutate(
        s,
        s.initial,
        "remove",
        undefined,
        s.labels.get(s.p.id, other.id).labels![0].id,
      ),
    /not found/,
  );
  assert.deepEqual(s.labels.get(s.p.id, s.initial), before);
});
test("name, identifier, action and revision validation bounds malformed requests", (t) => {
  const s = setup(t),
    base = {
      id: randomUUID(),
      action: "add",
      name: "Valid",
      expectedRevision: 0,
    };
  for (const patch of [
    { name: "" },
    { name: "x".repeat(121) },
    { name: "bad\nname" },
    { name: "bad\u0000name" },
    { name: 42 },
    { id: "bad" },
    { expectedRevision: -1 },
    { expectedRevision: 0.5 },
    { action: "delete" },
    { labelId: randomUUID() },
    { action: "remove", labelId: "bad" },
    { action: "remove", labelId: randomUUID(), name: "ignored" },
  ])
    assert.throws(
      () => s.labels.change(s.p.id, s.initial, { ...base, ...patch }),
      /label|Label|Invalid|action|Choose/,
    );
  const expanded = "\u0344".repeat(120);
  assert.throws(
    () => s.labels.change(s.p.id, s.initial, { ...base, name: expanded }),
    /120/,
  );
});
test("metadata reads stay available during AI ownership and mutations enforce project/path scope", (t) => {
  const s = setup(t);
  s.store.projectLocks.set(s.p.id, "synthetic-run");
  assert.equal(s.labels.get(s.p.id, s.initial).labelRevision, 0);
  assert.throws(
    () => mutate(s, s.initial, "add", "Blocked"),
    /active AI|active typing/,
  );
  s.store.projectLocks.clear();
  s.store.locks.set(s.p.id + "/notes.tex", "synthetic-run");
  assert.throws(
    () => mutate(s, s.initial, "add", "Blocked"),
    /active AI|active typing/,
  );
  s.store.locks.clear();
  const other = s.store.create("Other");
  assert.throws(() => s.labels.get(other.id, s.initial), /not found/);
  s.store.trashProject(s.p.id);
  assert.throws(() => s.labels.get(s.p.id, s.initial), /Trash/);
});
test("label and operation writes roll back together on a persistence failure", (t) => {
  const s = setup(t),
    before = s.labels.get(s.p.id, s.initial);
  s.store.db.exec(
    "CREATE TRIGGER fail_label_journal BEFORE INSERT ON history_label_ops BEGIN SELECT RAISE(ABORT,'synthetic journal failure'); END;",
  );
  assert.throws(
    () => mutate(s, s.initial, "add", "Must roll back"),
    /synthetic journal failure/,
  );
  assert.deepEqual(s.labels.get(s.p.id, s.initial), before);
  assert.equal(
    s.store.db.prepare("SELECT count(*) n FROM history_label_ops").get()!.n,
    0,
  );
});
test("checkpoint creation rolls back its snapshot when initial label persistence fails", (t) => {
  const s = setup(t),
    before = sourceEvidence(s);
  s.store.db.exec(
    "CREATE TRIGGER fail_label_seed BEFORE INSERT ON history_label_state BEGIN SELECT RAISE(ABORT,'synthetic seed failure'); END;",
  );
  assert.throws(
    () => s.store.checkpoint(s.p.id, "Must roll back"),
    /synthetic seed/,
  );
  assert.deepEqual(sourceEvidence(s), before);
});
test("active and retained label bounds explain recovery without discarding existing labels", (t) => {
  const s = setup(t);
  for (let i = 0; i < 100; i++) mutate(s, s.initial, "add", "Label " + i);
  assert.throws(() => mutate(s, s.initial, "add", "Overflow"), /100 active/);
  let v = s.labels.get(s.p.id, s.initial);
  mutate(s, s.initial, "remove", undefined, v.labels![0].id);
  mutate(s, s.initial, "add", "Replacement");
  assert.throws(
    () => mutate(s, s.initial, "restore", undefined, v.labels![0].id),
    /100 active/,
  );
  const now = new Date().toISOString(),
    removed = Array.from({ length: 500 }, (_, i) => ({
      id: randomUUID(),
      name: "Removed " + i,
      created: now,
      updated: now,
      deletedAt: now,
    }));
  s.store.db
    .prepare("UPDATE history_label_state SET labels=? WHERE checkpoint=?")
    .run(JSON.stringify(removed), s.initial);
  assert.throws(() => mutate(s, s.initial, "add", "Overflow"), /500 labels/);
  v = mutate(s, s.initial, "restore", undefined, removed[0].id);
  assert.equal(v.labels!.length, 500);
  assert.equal(v.labels!.filter((l) => !l.deletedAt).length, 1);
});
test("legacy single-label requests add safely and never replace other labels or duplicate retries", (t) => {
  const s = setup(t);
  s.store.labelCheckpoint(s.p.id, s.initial, "First");
  s.store.labelCheckpoint(s.p.id, s.initial, "Second");
  s.store.labelCheckpoint(s.p.id, s.initial, "second");
  const v = s.labels.get(s.p.id, s.initial);
  assert.deepEqual(
    v.labels!.map((l) => l.name),
    ["First", "Second"],
  );
  assert.equal(v.labelRevision, 2);
});
test("label names shown by restore plans follow the version while immutable tokens survive metadata changes", (t) => {
  const s = setup(t),
    recovery = new HistoryRecovery(s.store);
  s.store.save(s.p.id, "main.tex", "Current source.\n", 0);
  const input = {
    includeReview: true,
    expectedGeneration: s.store.project(s.p.id).generation,
    expectedReviewToken: recovery.comparison(s.p.id, s.initial).currentToken,
  };
  const oldPlan = recovery.plan(s.p.id, s.initial, input);
  mutate(s, s.initial, "add", "Submission");
  const latest = recovery.plan(s.p.id, s.initial, input);
  assert.equal(latest.versionName, "Submission");
  assert.equal(latest.token, oldPlan.token);
  recovery.apply(s.p.id, s.initial, {
    id: randomUUID(),
    token: oldPlan.token,
    includeReview: true,
    expectedGeneration: oldPlan.currentGeneration,
    expectedReviewToken: input.expectedReviewToken,
  });
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    "Original target.\n",
  );
  assert.equal(s.labels.get(s.p.id, s.initial).name, "Submission");
  assert.ok(
    s.store
      .checkpoints(s.p.id)
      .some((v) => v.name === "Before restoring Submission"),
  );
});
test("project copies start with fresh history and no source-project labels", (t) => {
  const s = setup(t);
  mutate(s, s.initial, "add", "Private milestone");
  const copy = s.store.copy(s.p.id, {
    name: "Independent copy",
    generation: s.store.project(s.p.id).generation,
    requestId: randomUUID(),
  });
  const versions = s.store.checkpoints(copy.id);
  assert.equal(versions.length, 1);
  assert.deepEqual(versions[0].labels, []);
  assert.deepEqual(s.store.exportFiles(copy.id), s.store.exportFiles(s.p.id));
});
test("label search handles accents, case and non-Latin names without treating removed names as active", () => {
  assert.equal(labelMatches("Café · 第二轮", "cafe"), true);
  assert.equal(labelMatches("Café · 第二轮", "第二轮"), true);
  assert.equal(labelMatches("Ready for REVIEW", "review"), true);
  assert.equal(labelMatches("Other", "review"), false);
});
test("label APIs enforce origin/header, scoped versions, idempotency and sanitized metadata-only responses", async (t) => {
  const root = path.resolve(
      "data/verification/history-labels-api-" + randomUUID(),
    ),
    { app, store } = await createApp(root, {
      seed: false,
      dist: "/nonexistent",
    });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("API"),
    cid = store.checkpoints(p.id)[0].id,
    url = `/api/projects/${p.id}/checkpoints/${cid}/labels`,
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    payload = {
      id: randomUUID(),
      action: "add",
      name: "Synthetic milestone",
      expectedRevision: 0,
    };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { ...headers, origin: "https://untrusted.example" },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { host: "127.0.0.1:4317" },
        payload,
      })
    ).statusCode,
    403,
  );
  const added = await app.inject({ method: "POST", url, headers, payload });
  assert.equal(added.statusCode, 200);
  assert.equal(added.json().version.labels[0].name, "Synthetic milestone");
  assert.equal(
    (await app.inject({ method: "POST", url, headers, payload })).json()
      .replayed,
    true,
  );
  const read = await app.inject({ method: "GET", url, headers });
  assert.equal(read.statusCode, 200);
  assert.ok(!("payload" in read.json()));
  assert.ok(!("files" in read.json()));
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: url.replace(cid, randomUUID()),
        headers,
      })
    ).statusCode,
    404,
  );
});
