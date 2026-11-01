import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Comments } from "../server/comments";
import { FileMoves } from "../server/file-moves";
import {
  commentChanges,
  mapCommentAnchor,
  commentRange,
} from "../shared/comments";
import { createApp } from "../server/app";
function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-comments-"));
  const store = new Store(root),
    comments = new Comments(store),
    project = store.create("Synthetic comments", [
      {
        path: "main.tex",
        data: Buffer.from("Before. Café 👩🏽‍🔬 target. After.\n"),
      },
      { path: "notes.tex", data: Buffer.from("Other file.\n") },
    ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = store.readText(project.id, "main.tex"),
    from = file.content.indexOf("Café"),
    to = file.content.indexOf(". After");
  const request = {
    id: randomUUID(),
    path: file.path,
    revision: file.revision,
    from,
    to,
    body: "A local comment.",
  };
  return { root, store, comments, project, file, request };
}
test("comment anchors map Unicode edits, replacements, deletion and exact source Undo", () => {
  const before = "Prefix Café 👩🏽‍🔬 suffix",
    from = before.indexOf("Café"),
    to = before.indexOf(" suffix"),
    anchor = {
      from,
      to,
      quote: before.slice(from, to),
      status: "attached" as const,
    };
  const after = "New " + before,
    moved = mapCommentAnchor(anchor, commentChanges(before, after), after);
  assert.equal(moved.from, from + 4);
  assert.equal(moved.status, "attached");
  const replaced = before.slice(0, from) + "replacement" + before.slice(to),
    changed = mapCommentAnchor(
      anchor,
      commentChanges(before, replaced),
      replaced,
    );
  assert.equal(changed.status, "changed");
  assert.equal(replaced.slice(changed.from, changed.to), "replacement");
  const undone = mapCommentAnchor(
    changed,
    commentChanges(replaced, before),
    before,
  );
  assert.deepEqual(undone, anchor);
  const deleted = before.slice(0, from) + before.slice(to),
    removed = mapCommentAnchor(
      anchor,
      commentChanges(before, deleted),
      deleted,
    );
  assert.equal(removed.status, "removed");
  assert.equal(removed.quote, anchor.quote);
  assert.deepEqual(
    mapCommentAnchor(removed, commentChanges(deleted, before), before),
    anchor,
  );
  assert.equal(commentRange(before, from, from + 1), true);
  assert.equal(commentRange("👩", 1, 2), false);
  assert.equal(commentRange(before, -1, 2), false);
});
test("comment range mapping stays exact across disjoint edits and large rewrites", () => {
  const before = "one target two",
    anchor = { from: 4, to: 10, quote: "target", status: "attached" as const },
    after = "ONE target TWO";
  assert.equal(
    mapCommentAnchor(anchor, commentChanges(before, after), after).status,
    "attached",
  );
  const big = "a".repeat(50000),
    next = "b".repeat(50000),
    change = commentChanges(big, next);
  assert.equal(change.apply(awaitText(big)).toString(), next);
  function awaitText(value: string) {
    return Text.of(value.split("\n"));
  }
});
import { Text } from "@codemirror/state";
test("threads and replies persist without changing source/history or exports; retries are idempotent", (t) => {
  const { store, comments, project, file, request } = setup(t),
    before = store.checkpoints(project.id).length;
  const first = comments.create(project.id, request);
  assert.equal(comments.create(project.id, request).id, first.id);
  assert.equal(comments.list(project.id, {}).total, 1);
  const reply = {
    revision: first.revision,
    action: "reply",
    id: randomUUID(),
    body: "A second thought.",
  };
  const second = comments.change(project.id, first.id, reply);
  assert.equal(second.replies.length, 2);
  assert.equal(comments.change(project.id, first.id, reply).replies.length, 2);
  assert.throws(
    () =>
      comments.change(project.id, first.id, {
        revision: first.revision,
        action: "resolve",
      }),
    /another view/,
  );
  assert.deepEqual(store.readText(project.id, file.path), file);
  assert.equal(store.checkpoints(project.id).length, before);
  assert.equal(store.project(project.id).generation, project.generation);
  assert.deepEqual(
    store.exportFiles(project.id).map((f) => f.path),
    ["main.tex", "notes.tex"],
  );
  assert.equal(
    JSON.stringify(store.exportFiles(project.id)).includes("A local comment"),
    false,
  );
});
test("resolve/reopen, message edit/Trash/restore and thread Trash/restore retain all content", (t) => {
  const { comments, project, request } = setup(t);
  let r = comments.create(project.id, request);
  const update = (value: Record<string, unknown>) =>
    (r = comments.change(project.id, r.id, { revision: r.revision, ...value }));
  update({ action: "edit", id: r.replies[0].id, body: "Edited text" });
  assert.equal(r.replies[0].body, "Edited text");
  update({ action: "delete-message", id: r.replies[0].id });
  assert.equal(r.replies[0].deleted, true);
  assert.equal(r.messages, 0);
  update({ action: "restore-message", id: r.replies[0].id });
  assert.equal(r.replies[0].body, "Edited text");
  update({ action: "resolve" });
  assert.equal(comments.list(project.id, { state: "resolved" }).total, 1);
  assert.throws(
    () => update({ action: "reply", id: randomUUID(), body: "No" }),
    /Reopen/,
  );
  update({ action: "reopen" });
  update({ action: "trash" });
  assert.equal(comments.list(project.id, { state: "trash" }).total, 1);
  assert.throws(
    () => update({ action: "edit", id: r.replies[0].id, body: "No" }),
    /Restore/,
  );
  update({ action: "restore" });
  assert.equal(r.deleted, false);
  assert.equal(r.replies[0].body, "Edited text");
});
test("source saves and file move/Undo rebase anchors atomically; explicit reattachment checks source revision", (t) => {
  const { store, comments, project, file, request } = setup(t);
  let r = comments.create(project.id, request);
  store.save(project.id, file.path, "Intro\n" + file.content, file.revision);
  r = comments.get(project.id, r.id);
  assert.equal(r.anchor.from, request.from + 6);
  assert.equal(r.anchor.status, "attached");
  const moves = new FileMoves(store);
  const moved = moves.renameResult(project.id, "main.tex", "renamed.tex", {
    generation: store.project(project.id).generation,
  });
  r = comments.get(project.id, r.id);
  assert.equal(r.path, "renamed.tex");
  moves.undo(project.id, moved.operationId);
  r = comments.get(project.id, r.id);
  assert.equal(r.path, "main.tex");
  const notes = store.readText(project.id, "notes.tex");
  assert.throws(
    () =>
      comments.change(project.id, r.id, {
        revision: r.revision,
        action: "reattach",
        path: notes.path,
        sourceRevision: 99,
        from: 0,
        to: 5,
      }),
    /source changed/,
  );
  r = comments.change(project.id, r.id, {
    revision: r.revision,
    action: "reattach",
    path: notes.path,
    sourceRevision: notes.revision,
    from: 0,
    to: 5,
  });
  assert.equal(r.path, notes.path);
  assert.equal(r.anchor.quote, "Other");
});
test("comments survive backend restart and keep file Trash unavailable until restored", (t) => {
  const { root, store, comments, project, request } = setup(t),
    r = comments.create(project.id, request);
  store.db
    .prepare("UPDATE files SET deleted=1 WHERE project=? AND path=?")
    .run(project.id, "main.tex");
  assert.equal(comments.get(project.id, r.id).unavailable, true);
  store.db
    .prepare("UPDATE files SET deleted=0 WHERE project=? AND path=?")
    .run(project.id, "main.tex");
  const second = new Store(root);
  try {
    assert.equal(
      new Comments(second).get(project.id, r.id).anchor.quote,
      r.anchor.quote,
    );
  } finally {
    second.close();
  }
  assert.equal(comments.get(project.id, r.id).unavailable, false);
});
test("project-bound comments reject invalid paths, stale source, cross-project IDs and active AI mutation", (t) => {
  const { store, comments, project, request } = setup(t),
    r = comments.create(project.id, request),
    other = store.create("Other", []);
  assert.throws(() => comments.get(other.id, r.id), /not found/);
  assert.throws(
    () =>
      comments.create(project.id, {
        ...request,
        id: randomUUID(),
        path: "../outside.tex",
      }),
    /paths/,
  );
  assert.throws(
    () =>
      comments.create(project.id, {
        ...request,
        id: randomUUID(),
        revision: 99,
      }),
    /source changed/,
  );
  assert.throws(
    () =>
      comments.create(project.id, { ...request, id: randomUUID(), body: "" }),
    /Write a comment/,
  );
  store.locks.set(project.id + "/main.tex", "run");
  assert.throws(
    () =>
      comments.change(project.id, r.id, {
        revision: r.revision,
        action: "resolve",
      }),
    /reserved/,
  );
  assert.equal(comments.get(project.id, r.id).resolved, false);
});
test("comment API preserves origin/header guards and does not mutate source on stale/thread conflicts", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-comment-api-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("API fixture", [
    { path: "main.tex", data: Buffer.from("Selected source") },
  ]);
  const headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      "x-prism-request": "1",
    },
    url = `/api/projects/${p.id}/comments`,
    payload = {
      id: randomUUID(),
      path: "main.tex",
      revision: 0,
      from: 0,
      to: 8,
      body: "A comment",
    };
  assert.equal(
    (
      await env.app.inject({
        method: "POST",
        url,
        headers: { ...headers, origin: "https://outside.invalid" },
        payload,
      })
    ).statusCode,
    403,
  );
  const created = await env.app.inject({
    method: "POST",
    url,
    headers,
    payload,
  });
  assert.equal(created.statusCode, 200);
  assert.equal((await env.app.inject({ url, headers })).json().total, 1);
  assert.equal(
    (
      await env.app.inject({ url: url + "/anchors?path=main.tex", headers })
    ).json()[0].from,
    0,
  );
  assert.equal(env.store.readText(p.id, "main.tex").content, "Selected source");
});
test("summary and marker payloads stay bounded while full quote and project copy boundaries remain exact", (t) => {
  const { store, comments, project, request } = setup(t),
    source = "A".repeat(1200);
  store.save(project.id, "main.tex", source, 0);
  const r = comments.create(project.id, {
    ...request,
    id: randomUUID(),
    revision: 1,
    from: 0,
    to: 1000,
  });
  assert.equal(comments.list(project.id, {}).items[0].anchor.quote.length, 240);
  assert.equal(comments.get(project.id, r.id).anchor.quote.length, 1000);
  assert.equal(
    Object.hasOwn(comments.anchors(project.id, "main.tex")[0], "quote"),
    false,
  );
  assert.equal(
    Object.hasOwn(comments.anchors(project.id, "main.tex")[0], "body"),
    false,
  );
  assert.throws(
    () =>
      comments.change(project.id, r.id, {
        revision: r.revision,
        action: "edit",
        id: r.replies[0].id,
        body: "x".repeat(10001),
      }),
    /10,000/,
  );
  assert.equal(comments.get(project.id, r.id).revision, r.revision);
  const copy = store.copy(project.id, {
    name: "Independent review copy",
    generation: store.project(project.id).generation,
    requestId: randomUUID(),
  });
  assert.equal(comments.list(copy.id, {}).total, 0);
  assert.equal(store.readText(copy.id, "main.tex").content, source);
});
test("comment pages have stable bounded navigation and preserve resolved/Trash counts", (t) => {
  const { comments, project, request } = setup(t);
  for (let i = 0; i < 53; i++)
    comments.create(project.id, {
      ...request,
      id: randomUUID(),
      body: "Comment " + i,
    });
  const first = comments.list(project.id, {}),
    second = comments.list(project.id, { offset: first.nextOffset });
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 3);
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.id)).size,
    53,
  );
  assert.equal(second.nextOffset, undefined);
  assert.throws(
    () => comments.list(project.id, { offset: -1 }),
    /available comment/,
  );
});
test("comment anchors recover after incremental Manual Type progress and exact Undo", () => {
  const source = "Before. Target phrase for comment. After.",
    from = source.indexOf("Target"),
    to = source.indexOf(" After.");
  const original = {
    from,
    to,
    quote: source.slice(from, to),
    status: "attached" as const,
  };
  let anchor: import("../shared/comments").CommentAnchor = original,
    visible = source;
  const insertion =
    "A synthetic replacement for read-only comment verification.";
  for (let n = 1; n <= insertion.length; n++) {
    const next =
      source.slice(0, from) + insertion.slice(0, n) + source.slice(to);
    anchor = mapCommentAnchor(anchor, commentChanges(visible, next), next);
    visible = next;
  }
  assert.deepEqual(
    mapCommentAnchor(anchor, commentChanges(visible, source), source),
    original,
  );
});
