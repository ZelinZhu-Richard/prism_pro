import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Tracking } from "../server/tracking";
import { Comments } from "../server/comments";
import { FileMoves } from "../server/file-moves";
import {
  trackedDiff,
  reviewText,
  untrackedBase,
  selectedTracked,
  sourceLineCursor,
} from "../shared/tracking";
import { createApp } from "../server/app";
import type { EditorReview } from "../shared/editor-review";

test("editor review combines project status and file-bound marks without changing source or history", async (t) => {
  const root = path.resolve(
    "data/verification/editor-review-test-" + randomUUID(),
  );
  const { app, store } = await createApp(root, { seed: false });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = "sections/with spaces.tex";
  const original = "A selected passage.\n";
  const project = store.create("Review read", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}Synthetic\\end{document}",
      ),
    },
    { path: file, data: Buffer.from(original) },
  ]);
  const base = `/api/projects/${project.id}`;
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const query = `?path=${encodeURIComponent(file)}`;
  const endpoint = base + "/editor-review";
  async function get<T>(route: string) {
    const response = await app.inject({ url: route, headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<T>();
  }

  const tracking = new Tracking(store);
  tracking.mode(project.id, { enabled: true, revision: 0 });
  new Comments(store).create(project.id, {
    id: randomUUID(),
    path: file,
    revision: 0,
    from: 2,
    to: 10,
    body: "Private local review fixture.",
  });
  const first = await get<EditorReview>(endpoint + query);
  assert.equal(first.file?.sourceRevision, 0);
  assert.equal(first.marks[0].sourceRevision, 0);
  const saved = store.save(project.id, file, "New " + original, 0);
  const history = store.checkpoints(project.id);
  const updated = await get<EditorReview>(endpoint + query);
  assert.deepEqual(updated, {
    status: await get(base + "/tracking"),
    file: await get(base + "/tracking/file" + query),
    marks: await get(base + "/comments/anchors" + query),
  });
  assert.equal(updated.file?.sourceRevision, saved.revision);
  assert.equal(updated.file?.hunks.length, 1);
  assert.equal(updated.marks[0].sourceRevision, saved.revision);
  assert.equal(updated.marks[0].from, 6);
  assert.deepEqual(await get(endpoint), { status: updated.status, marks: [] });
  assert.deepEqual(
    (await get<EditorReview>(endpoint + "?path=main.tex")).marks,
    [],
  );
  assert.deepEqual(store.readText(project.id, file), saved);
  assert.deepEqual(store.checkpoints(project.id), history);

  store.trash(project.id, file);
  const removed = await get<EditorReview>(endpoint + query);
  assert.equal(removed.file, undefined);
  assert.match(removed.fileError ?? "", /file not found/i);
  assert.equal(removed.status.enabled, true);
  assert.equal(removed.marks[0].unavailable, true);
  assert.equal(
    (await app.inject({ url: endpoint + "?path=../escape.tex", headers }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: endpoint + query,
        headers: { ...headers, origin: "https://example.invalid" },
      })
    ).statusCode,
    403,
  );
});

function setup(t: any) {
  const root = path.resolve("data/verification/tracking-tests-" + randomUUID());
  let store = new Store(root),
    tracking = new Tracking(store);
  const p = store.create("Synthetic review", [
    {
      path: "main.tex",
      data: Buffer.from("First target.\nSecond original.\nLast line.\n"),
    },
    { path: "notes.tex", data: Buffer.from("Supporting note.\n") },
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    p,
    get store() {
      return store;
    },
    get tracking() {
      return tracking;
    },
    restart() {
      store.close();
      store = new Store(root);
      tracking = new Tracking(store);
    },
    root,
  };
}
function edit(s: ReturnType<typeof setup>, text: string, name = "main.tex") {
  const f = s.store.readText(s.p.id, name);
  return s.store.save(s.p.id, name, text, f.revision);
}
function mode(s: ReturnType<typeof setup>, enabled = true) {
  return s.tracking.mode(s.p.id, {
    enabled,
    revision: s.tracking.status(s.p.id).revision,
  });
}
function apply(s: ReturnType<typeof setup>, action = "accept", ids?: number[]) {
  const f = s.tracking.file(s.p.id, "main.tex");
  const req = {
    id: randomUUID(),
    path: "main.tex",
    action,
    ids: ids ?? f.hunks.map((h) => h.id),
    sourceRevision: f.sourceRevision,
    reviewRevision: f.reviewRevision,
    token: f.token,
  };
  return { result: s.tracking.apply(s.p.id, req), req };
}
test("tracked grapheme changes reconstruct both texts and selected accept/reject exactly", () => {
  for (const [a, b] of [
    ["Café 👩🏽‍🔬 test.\nEnd.", "Café 👨‍🔬 tests.\nEnd!"],
    ["before\n", ""],
    ["", "新增 text 👩🏽‍🔬"],
    ["aaaa target aaaa", "aaaa renewed aaaa"],
  ]) {
    const { hunks } = trackedDiff(a, b);
    assert.equal(reviewText(a, hunks, true), b);
    assert.equal(reviewText(b, hunks, false), a);
    const edges = (text: string) =>
      new Set([
        0,
        text.length,
        ...Array.from(
          new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text),
          (x) => x.index,
        ),
      ]);
    for (const h of hunks) {
      assert.ok(edges(a).has(h.oldFrom) && edges(a).has(h.oldTo));
      assert.ok(edges(b).has(h.from) && edges(b).has(h.to));
    }
    for (const h of hunks) {
      const accepted = reviewText(a, [h], true),
        remaining = trackedDiff(accepted, b).hunks;
      assert.equal(reviewText(accepted, remaining, true), b);
      assert.equal(reviewText(b, remaining, false), accepted);
    }
  }
  const deletion = trackedDiff("a removed z", "a  z").hunks[0];
  assert.ok(selectedTracked(deletion, 0, 4));
  assert.ok(!selectedTracked(deletion, 2, 2));
});
test("bounded large rewrites preserve exact text without Unicode splits", () => {
  const a = "prefix " + "a".repeat(120000) + " 👩🏽‍🔬 suffix",
    b = "prefix " + "b".repeat(120000) + " 👩🏽‍🔬 suffix";
  const d = trackedDiff(a, b);
  assert.ok(d.limited);
  assert.equal(d.hunks.length, 1);
  assert.equal(reviewText(b, d.hunks, false), a);
  const x = "x".repeat(300000) + "Café end",
    y = "x".repeat(300000) + "Café end";
  assert.equal(reviewText(y, trackedDiff(x, y).hunks, false), x);
});
test("long-prefix line numbers stay accurate for a thousand tail changes and fallback", (t) => {
  const prefix = "unchanged prefix\n".repeat(110000),
    tail = Array.from(
      { length: 1000 },
      (_, i) => `tail ${i} value old unchanged gap\n`,
    ),
    source = prefix + tail.join("");
  assert.ok(Buffer.byteLength(source) < 2 * 1024 * 1024);
  const lineAt = sourceLineCursor(source),
    start = performance.now();
  let offset = prefix.length;
  for (let i = 0; i < tail.length; i++) {
    assert.equal(lineAt(offset + 8), 110001 + i);
    offset += tail[i].length;
  }
  assert.equal(lineAt(prefix.length), 110001); // one rewind, as in grouped fallback
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 2000, `Line scan exceeded generous bound: ${elapsed} ms`);
  const after = prefix + tail.map((x) => x.replace("old", "NEW")).join(""),
    diff = trackedDiff(source, after);
  for (const h of diff.hunks)
    assert.equal(h.line, after.slice(0, h.from).split("\n").length);
  assert.equal(reviewText(after, diff.hunks, false), source);
  t.diagnostic(
    JSON.stringify({
      bytes: Buffer.byteLength(source),
      tailPositions: 1000,
      lineScanMs: Math.round(elapsed * 100) / 100,
      diffHunks: diff.hunks.length,
      groupedFallback: diff.limited,
    }),
  );
});
test("review plans bind the exact hunk layout and incremental typing Undo clears net changes", (t) => {
  const s = setup(t),
    original = s.store.readText(s.p.id, "main.tex").content;
  mode(s);
  const lock = s.p.id + "/main.tex";
  s.store.locks.set(lock, "synthetic-run");
  let content = "";
  for (const segment of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment("Café 👩🏽‍🔬 draft")) {
    content += segment.segment;
    const f = s.store.readText(s.p.id, "main.tex");
    s.store.save(
      s.p.id,
      "main.tex",
      original + content,
      f.revision,
      "synthetic-run",
    );
  }
  const f = s.tracking.file(s.p.id, "main.tex");
  assert.equal(reviewText(original, f.hunks, true), original + content);
  s.store.locks.delete(lock);
  assert.throws(
    () =>
      s.tracking.apply(s.p.id, {
        id: randomUUID(),
        path: "main.tex",
        action: "reject",
        ids: [0],
        sourceRevision: f.sourceRevision,
        reviewRevision: f.reviewRevision,
        token: "wrong-plan",
      }),
    /changed/,
  );
  edit(s, original);
  assert.equal(s.tracking.status(s.p.id).files.length, 0);
});
test("tracking off accepts disjoint new edits and retains edits touching pending passages", () => {
  const base = "first old\nsecond original\nend",
    current = "first NEW\nsecond original\nend";
  const next = current.replace("original", "updated");
  assert.equal(
    untrackedBase(base, current, next),
    base.replace("original", "updated"),
  );
  assert.equal(
    untrackedBase(base, current, current.replace("NEW", "NEWER")),
    base,
  );
  assert.equal(untrackedBase(base, current, base), base);
});
test("neighboring edits form coherent passages without merging separate lines", () => {
  const d = trackedDiff(
    "Target phrase for comment.",
    "Revised passage with Café and evidence.",
  );
  assert.equal(d.hunks.length, 1);
  assert.equal(
    reviewText("Target phrase for comment.", d.hunks, true),
    "Revised passage with Café and evidence.",
  );
  assert.equal(
    trackedDiff("old\nsecond old", "NEW\nsecond NEW").hunks.length,
    2,
  );
});
test("opt-in tracking persists and excludes metadata from source/history/copies", (t) => {
  const s = setup(t);
  edit(s, "Untracked original.\n");
  assert.equal(s.tracking.status(s.p.id).files.length, 0);
  const generation = s.store.project(s.p.id).generation,
    history = s.store.checkpoints(s.p.id).length;
  mode(s);
  assert.equal(s.store.project(s.p.id).generation, generation);
  assert.equal(s.store.checkpoints(s.p.id).length, history);
  edit(s, "Tracked current.\n");
  assert.ok(s.tracking.file(s.p.id, "main.tex").hunks.length);
  const before = s.tracking.file(s.p.id, "main.tex");
  s.restart();
  assert.equal(s.tracking.status(s.p.id).enabled, true);
  assert.deepEqual(s.tracking.file(s.p.id, "main.tex"), before);
  assert.equal(
    s.store
      .exportFiles(s.p.id)
      .find((f) => f.path === "main.tex")!
      .data.toString(),
    "Tracked current.\n",
  );
  const p = s.store.project(s.p.id),
    copy = s.store.copy(s.p.id, {
      name: "Review copy",
      generation: p.generation,
      requestId: randomUUID(),
    });
  assert.equal(s.tracking.status(copy.id).enabled, false);
  assert.equal(s.tracking.status(copy.id).files.length, 0);
  assert.equal(
    s.store.readText(copy.id, "main.tex").content,
    "Tracked current.\n",
  );
});
test("selected Accept leaves current source untouched and exact Undo restores pending state", (t) => {
  const s = setup(t);
  mode(s);
  edit(s, "First NEW.\nSecond original.\nLast CHANGED.\n");
  const file = s.store.readText(s.p.id, "main.tex"),
    pending = s.tracking.file(s.p.id, "main.tex"),
    generation = s.store.project(s.p.id).generation;
  const { result, req } = apply(s, "accept", [pending.hunks[0].id]);
  assert.deepEqual(s.store.readText(s.p.id, "main.tex"), file);
  assert.equal(s.store.project(s.p.id).generation, generation);
  assert.ok(
    s.tracking.file(s.p.id, "main.tex").hunks.length < pending.hunks.length,
  );
  assert.equal(s.tracking.apply(s.p.id, req).id, result.id);
  s.restart();
  s.tracking.undo(s.p.id, result.id);
  assert.deepEqual(s.tracking.file(s.p.id, "main.tex").hunks, pending.hunks);
  assert.deepEqual(s.store.readText(s.p.id, "main.tex"), file);
});
test("Reject/Undo updates source, revisions and comment anchors atomically", (t) => {
  const s = setup(t),
    original = s.store.readText(s.p.id, "main.tex").content;
  const c = new Comments(s.store);
  const thread = c.create(s.p.id, {
    id: randomUUID(),
    path: "main.tex",
    revision: 0,
    from: 6,
    to: 12,
    body: "Review target",
  });
  mode(s);
  edit(s, original.replace("target", "renewed"));
  const current = s.store.readText(s.p.id, "main.tex"),
    pending = s.tracking.file(s.p.id, "main.tex").hunks;
  const { result } = apply(s, "reject");
  assert.equal(result.file.content, original);
  assert.equal(s.tracking.status(s.p.id).files.length, 0);
  assert.equal(c.get(s.p.id, thread.id).anchor.status, "attached");
  s.tracking.undo(s.p.id, result.id);
  assert.equal(s.store.readText(s.p.id, "main.tex").content, current.content);
  assert.deepEqual(s.tracking.file(s.p.id, "main.tex").hunks, pending);
  assert.equal(
    s.tracking.undo(s.p.id, result.id).file.content,
    current.content,
  );
  assert.equal(
    fs.readFileSync(
      path.join(s.root, "projects", s.p.id, "files/main.tex"),
      "utf8",
    ),
    current.content,
  );
});
test("stale source/review, duplicate request collisions and later edits never overwrite", (t) => {
  const s = setup(t);
  mode(s);
  edit(s, "New draft");
  const a = apply(s, "accept");
  assert.throws(
    () => s.tracking.apply(s.p.id, { ...a.req, action: "reject" }),
    /already used/,
  );
  edit(s, "Later source");
  assert.throws(() => s.tracking.undo(s.p.id, a.result.id), /changed/);
  assert.throws(
    () => s.tracking.apply(s.p.id, { ...a.req, id: randomUUID() }),
    /changed/,
  );
  assert.equal(s.store.readText(s.p.id, "main.tex").content, "Later source");
  assert.throws(
    () => s.tracking.mode(s.p.id, { enabled: false, revision: 0 }),
    /changed/,
  );
});
test("off/on retains pending edits and ordinary source Undo removes net changes", (t) => {
  const s = setup(t),
    original = s.store.readText(s.p.id, "main.tex").content;
  mode(s);
  edit(s, original.replace("target", "NEW"));
  mode(s, false);
  const accepted = "Second updated.";
  edit(
    s,
    s.store
      .readText(s.p.id, "main.tex")
      .content.replace("Second original.", accepted),
  );
  apply(s, "reject");
  assert.equal(
    s.store.readText(s.p.id, "main.tex").content,
    original.replace("Second original.", accepted),
  );
  mode(s);
  const before = s.store.readText(s.p.id, "main.tex").content;
  edit(s, before + "An insertion.");
  edit(s, before);
  assert.equal(s.tracking.status(s.p.id).files.length, 0);
});
test("file moves and Undo preserve review; Trash retains pending source context", (t) => {
  const s = setup(t);
  mode(s);
  edit(s, "Pending moved source.\n");
  const before = s.tracking.file(s.p.id, "main.tex").hunks;
  const moves = new FileMoves(s.store),
    p = s.store.project(s.p.id),
    result = moves.renameResult(s.p.id, "main.tex", "renamed.tex", {
      generation: p.generation,
      requestId: randomUUID(),
    });
  assert.deepEqual(s.tracking.file(s.p.id, "renamed.tex").hunks, before);
  moves.undo(s.p.id, result.operationId);
  assert.deepEqual(s.tracking.file(s.p.id, "main.tex").hunks, before);
  s.store.trash(s.p.id, "main.tex");
  assert.equal(s.tracking.status(s.p.id).files[0].unavailable, true);
  s.store.trash(s.p.id, "main.tex", true);
  assert.equal(s.tracking.status(s.p.id).files[0].unavailable, false);
});
test("HTTP tracking validates origins/project paths and enforces active AI locks", async (t) => {
  const root = path.resolve("data/verification/tracking-http-" + randomUUID()),
    app = await createApp(root, { seed: false });
  t.after(async () => {
    await app.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = app.store.create("HTTP review", [
    { path: "main.tex", data: Buffer.from("Old") },
  ]);
  const headers = {
    host: "127.0.0.1:4317",
    origin: "http://127.0.0.1:4317",
    "x-prism-request": "1",
  };
  let r = await app.app.inject({
    method: "PUT",
    url: `/api/projects/${p.id}/tracking`,
    headers: { ...headers, origin: "https://evil.example" },
    payload: { enabled: true, revision: 0 },
  });
  assert.equal(r.statusCode, 403);
  r = await app.app.inject({
    method: "PUT",
    url: `/api/projects/${p.id}/tracking`,
    headers,
    payload: { enabled: true, revision: 0 },
  });
  assert.equal(r.statusCode, 200);
  app.store.save(p.id, "main.tex", "New", 0);
  app.store.projectLocks.set(p.id, "synthetic-ai");
  r = await app.app.inject({
    method: "GET",
    url: `/api/projects/${p.id}/tracking/file?path=main.tex`,
    headers,
  });
  assert.equal(r.statusCode, 200);
  const f = r.json();
  r = await app.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/tracking/review`,
    headers,
    payload: {
      id: randomUUID(),
      path: "main.tex",
      action: "reject",
      ids: f.hunks.map((h: any) => h.id),
      sourceRevision: f.sourceRevision,
      reviewRevision: f.reviewRevision,
      token: f.token,
    },
  });
  assert.equal(r.statusCode, 409);
  r = await app.app.inject({
    method: "GET",
    url: `/api/projects/${p.id}/tracking/file?path=../outside`,
    headers,
  });
  assert.equal(r.statusCode, 400);
  app.store.projectLocks.delete(p.id);
});
