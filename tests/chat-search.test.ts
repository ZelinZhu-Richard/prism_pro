import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store";
import { ChatSearch } from "../server/chat-search";
import { ChatDrafts } from "../server/chat-drafts";
import { Chats } from "../server/chats";
import { createApp } from "../server/app";
import type { AiRun } from "../shared/types";
function setup(t: any, timeout = 2000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-chat-search-")),
    store = new Store(root),
    project = store.create("Synthetic search", [
      { path: "main.tex", data: Buffer.from("Source stays unchanged.\n") },
    ]),
    conversation = store.createConversation(project.id, "Saved methods"),
    search = new ChatSearch(store, timeout);
  t.after(async () => {
    await search.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, store, project, conversation, search };
}
function seed(
  store: Store,
  project: string,
  conversation: string,
  i: number,
  prompt = `Prompt ${i}`,
  text = `Reply ${i}`,
) {
  const run: AiRun & Record<string, unknown> = {
    id: `search-${i}`,
    projectId: project,
    conversationId: conversation,
    provider: "openai",
    model: "synthetic",
    mode: "review",
    scope: "document",
    path: "main.tex",
    status: "completed",
    created: new Date(1700000000000 + i * 1000).toISOString(),
    from: 0,
    to: 0,
    contextFiles: ["main.tex"],
    prompt,
    text,
    before: "Hidden source secret",
    insertion: "Hidden insertion secret",
  };
  store.saveRun(run);
  return run;
}
test("chat search finds literal saved prompts/replies and titles without exposing snapshots, drafts or native sessions", async (t) => {
  const { store, project: p, conversation: c, search } = setup(t);
  const internal = store.conversation(c.id, p.id);
  internal.sessions = { codex: "Hidden native secret" };
  store.updateConversation(internal);
  new ChatDrafts(store).save(p.id, c.id, {
    text: "Hidden unsent draft secret",
    revision: 0,
    requestId: "search-privacy-check",
  });
  seed(
    store,
    p.id,
    c.id,
    1,
    "A [literal].* \\cite{Test} needle",
    "reply needle",
  );
  seed(store, p.id, c.id, 2, "unrelated", "An older NEEDLE answer");
  for (const q of [
    "[literal].*",
    "\\cite{test}",
    "NEEDLE",
    ".*",
    "Saved methods",
  ]) {
    const result = await search.search(p.id, { q });
    assert.ok(result.hits.length > 0, q);
    assert.ok(!JSON.stringify(result).includes("Hidden"));
  }
  const result = await search.search(p.id, { q: "needle" });
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.hits.map((h) => h.field),
    ["reply", "prompt"],
  );
  assert.equal(result.hits[0].snippet.match, "NEEDLE");
  assert.equal((await search.search(p.id, { q: "Hidden" })).total, 0);
  assert.equal((await search.search(p.id, { q: "%" })).total, 0);
});
test("search snippets preserve Unicode, original case and bounded surrounding text", async (t) => {
  const { store, project: p, conversation: c, search } = setup(t);
  seed(
    store,
    p.id,
    c.id,
    1,
    "x".repeat(300) + "👩🏽‍🔬 研究 İSTANBUL café ΣΟΣ " + "y".repeat(300),
  );
  for (const [q, match] of [
    ["研究", "研究"],
    ["👩🏽‍🔬", "👩🏽‍🔬"],
    ["i̇stanbul", "İSTANBUL"],
    ["CAFÉ", "café"],
    ["σος", "ΣΟΣ"],
  ]) {
    const hit = (await search.search(p.id, { q })).hits[0];
    assert.equal(hit.snippet.match, match);
    assert.ok(hit.snippet.before.startsWith("…"));
    assert.ok(hit.snippet.after.endsWith("…"));
    assert.ok(
      hit.snippet.before.length < 160 && hit.snippet.after.length < 240,
    );
    assert.equal(
      Buffer.from(JSON.stringify(hit)).toString(),
      JSON.stringify(hit),
    );
  }
  assert.equal((await search.search(p.id, { q: "cafe" })).total, 0);
});
test("search pages exclude newly inserted turns, have no duplicate hits and bind cursors to project/query/archive", async (t) => {
  const { store, project: p, conversation: c, search } = setup(t);
  for (let i = 0; i < 51; i++) seed(store, p.id, c.id, i, "shared needle");
  const first = await search.search(p.id, { q: "needle" });
  assert.equal(first.hits.length, 20);
  assert.equal(first.total, 51);
  seed(store, p.id, c.id, 100, "shared needle after search");
  const second = await search.search(p.id, {
    q: "NEEDLE",
    cursor: first.nextCursor,
  });
  const third = await search.search(p.id, {
    q: "needle",
    cursor: second.nextCursor,
  });
  assert.equal(second.total, 51);
  assert.equal(third.hits.length, 11);
  assert.equal(third.nextCursor, undefined);
  const all = [...first.hits, ...second.hits, ...third.hits];
  assert.equal(new Set(all.map((h) => h.runId)).size, 51);
  const other = store.create("Other", []);
  for (const input of [
    { q: "different", cursor: first.nextCursor },
    { q: "needle", archived: "1", cursor: first.nextCursor },
  ])
    await assert.rejects(search.search(p.id, input), /cursor/);
  await assert.rejects(
    search.search(other.id, { q: "needle", cursor: first.nextCursor }),
    /cursor/,
  );
  assert.equal((await search.search(other.id, { q: "needle" })).total, 0);
});
test("title hits page into message hits and archives stay explicit and read-only", async (t) => {
  const { store, project: p, conversation: c, search } = setup(t);
  for (let i = 0; i < 22; i++) store.createConversation(p.id, `needle ${i}`);
  seed(store, p.id, c.id, 1, "needle prompt");
  const archived = store.createConversation(p.id, "Archived needle"),
    chats = new Chats(store);
  seed(store, p.id, archived.id, 2, "needle archived");
  chats.edit(p.id, archived.id, { revision: 0, archived: true });
  const original = JSON.stringify({
    p: store.project(p.id),
    history: store.checkpoints(p.id),
    runs: store.runs(p.id),
    conversations: store.conversations(p.id),
    active: store.activeConversation(p.id),
  });
  const a = await search.search(p.id, { q: "needle" }),
    b = await search.search(p.id, { q: "needle", cursor: a.nextCursor });
  assert.equal(a.total, 23);
  assert.equal(b.hits.length, 3);
  assert.equal(b.hits.at(-1)?.runId, "search-1");
  const archivedHits = await search.search(p.id, {
    q: "needle",
    archived: "1",
  });
  assert.equal(archivedHits.total, 2);
  assert.ok(archivedHits.hits.every((h) => h.conversation.archivedAt));
  assert.equal(
    JSON.stringify({
      p: store.project(p.id),
      history: store.checkpoints(p.id),
      runs: store.runs(p.id),
      conversations: store.conversations(p.id),
      active: store.activeConversation(p.id),
    }),
    original,
  );
});
test("chat search validates queries/cursors, stops with timeout and shuts workers down", async (t) => {
  const { project: p, search } = setup(t, 1);
  for (const q of ["", " ", "a".repeat(201), "bad\nquery", "\ud800", 5])
    await assert.rejects(search.search(p.id, { q }), /1–200/);
  await assert.rejects(
    search.search(p.id, { q: "valid", archived: "yes" }),
    /archive/,
  );
  for (const cursor of [
    "garbage",
    "x".repeat(601),
    Buffer.from('{"scope":1}').toString("base64url"),
  ])
    await assert.rejects(search.search(p.id, { q: "valid", cursor }), /cursor/);
  const one = search.search(p.id, { q: "query" }),
    two = search.search(p.id, { q: "query" });
  await assert.rejects(
    search.search(p.id, { q: "query" }),
    /Two chat searches/,
  );
  const settled = await Promise.allSettled([one, two]);
  assert.ok(
    settled.every(
      (r) => r.status === "rejected" && /two seconds/.test(r.reason.message),
    ),
  );
  await search.close();
  await assert.rejects(search.search(p.id, { q: "query" }), /shutting down/);
});
test("turn match navigation reaches old turns and both directions without duplicates or wrong-scope cursors", (t) => {
  const { store, project: p, conversation: c } = setup(t),
    chats = new Chats(store);
  for (let i = 0; i < 65; i++) seed(store, p.id, c.id, i);
  const page = chats.turns(p.id, c.id, undefined, { around: "search-3" });
  assert.equal(page.turns[0].id, "search-3");
  assert.equal(page.turns.length, 20);
  const earlier = chats.turns(p.id, c.id, page.nextBefore),
    newer = chats.turns(p.id, c.id, undefined, { after: page.nextAfter });
  assert.deepEqual(
    earlier.turns.map((r) => r.id),
    ["search-0", "search-1", "search-2"],
  );
  assert.equal(newer.turns[0].id, "search-23");
  const back = chats.turns(p.id, c.id, undefined, { after: earlier.nextAfter });
  assert.deepEqual(back.turns, page.turns);
  const last = chats.turns(p.id, c.id, undefined, { around: "search-64" });
  assert.equal(last.nextAfter, undefined);
  const other = store.createConversation(p.id, "Other");
  seed(store, p.id, other.id, 100);
  assert.throws(
    () => chats.turns(p.id, c.id, undefined, { around: "search-100" }),
    /no longer available/,
  );
  assert.throws(
    () => chats.turns(p.id, c.id, "search-3", { after: "search-3" }),
    /one conversation cursor/,
  );
  assert.throws(
    () => chats.turns(p.id, c.id, undefined, { around: [] }),
    /Invalid/,
  );
  assert.ok(!JSON.stringify(page).includes("Hidden source"));
});
test("search and around endpoints validate origin/project, persist across restart and never generate", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-search-api-"));
  let app = await createApp(root, { seed: false });
  t.after(async () => {
    await app.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = app.store.create("API fixture", []),
    c = app.store.createConversation(p.id, "API saved chat");
  seed(app.store, p.id, c.id, 1, "preserved needle");
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const url = `/api/projects/${p.id}/chat-search?q=needle`;
  const a = await app.app.inject({ url, headers });
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().hits[0].runId, "search-1");
  const badOrigin = await app.app.inject({
    url,
    headers: { ...headers, origin: "https://other.invalid" },
  });
  assert.equal(badOrigin.statusCode, 403);
  assert.equal(
    (
      await app.app.inject({
        url: `/api/projects/no-project/chat-search?q=needle`,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.app.inject({
        url: `/api/projects/${p.id}/conversations/${c.id}/turns?around=search-1`,
        headers,
      })
    ).json().turns[0].id,
    "search-1",
  );
  await app.app.close();
  app = await createApp(root, { seed: false });
  assert.deepEqual((await app.app.inject({ url, headers })).json(), a.json());
  assert.equal(app.store.runs(p.id).length, 1);
  assert.equal(app.store.conversations(p.id).length, 1);
});

test("a 10,000-turn saved history searches without loading source snapshots into the response", async (t) => {
  const { store, project: p, conversation: c, search } = setup(t);
  store.transaction(() => {
    for (let i = 0; i < 10000; i++)
      seed(
        store,
        p.id,
        c.id,
        i,
        "Historical prompt " + i,
        "Synthetic explanatory text. ".repeat(40) + " needle " + i,
      );
  });
  const result = await search.search(p.id, { q: "needle" });
  assert.equal(result.total, 10000);
  assert.equal(result.hits.length, 20);
  assert.equal(result.hits[0].runId, "search-9999");
  assert.ok(JSON.stringify(result).length < 16000);
});
