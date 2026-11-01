import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { Chats } from "../server/chats";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys } from "../server/providers";
import { createApp } from "../server/app";
import type { AiRun } from "../shared/types";
import { chatStatus, mergeTurns } from "../shared/chats";
function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-chats-")),
    store = new Store(root),
    p = store.create("Synthetic chats", [
      { path: "main.tex", data: Buffer.from("Original source") },
    ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { store, p, chats: new Chats(store) };
}
function run(store: Store, p: string, c: string, i: number): AiRun {
  const value: AiRun & Record<string, unknown> = {
    id: `run-${i}`,
    projectId: p,
    conversationId: c,
    provider: "openai",
    model: "fixture",
    mode: "review",
    scope: "document",
    path: "main.tex",
    status: "completed",
    created: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    from: 0,
    to: 0,
    prompt: `Prompt ${i}`,
    text: `Reply ${i}`,
    contextFiles: ["main.tex"],
    before: "PRIVATE SOURCE SNAPSHOT",
  };
  store.saveRun(value);
  return value;
}
test("conversation pages preserve chronological turns with stable project-bound cursors and no duplicates", (t) => {
  const { store, p, chats } = setup(t),
    c = store.createConversation(p.id, "A"),
    other = store.createConversation(p.id, "B");
  for (let i = 0; i < 45; i++) run(store, p.id, c.id, i);
  run(store, p.id, other.id, 100);
  const page = chats.turns(p.id, c.id);
  assert.equal(page.total, 45);
  assert.deepEqual(
    page.turns.map((r) => r.id),
    Array.from({ length: 20 }, (_, i) => `run-${25 + i}`),
  );
  assert.equal((page.turns[0] as any).before, undefined);
  const previous = chats.turns(p.id, c.id, page.nextBefore),
    oldest = chats.turns(p.id, c.id, previous.nextBefore);
  assert.equal(oldest.turns.length, 5);
  assert.equal(oldest.nextBefore, undefined);
  assert.equal(
    new Set(
      [...oldest.turns, ...previous.turns, ...page.turns].map((r) => r.id),
    ).size,
    45,
  );
  assert.throws(
    () => chats.turns(p.id, c.id, "run-100"),
    /no longer available/,
  );
});
test("chat library refreshes keep long saved replies and proposal contents out while preserving active preview recovery", (t) => {
  const { store, p, chats } = setup(t),
    c = store.createConversation(p.id, "A");
  const done = run(store, p.id, c.id, 1),
    preview = run(store, p.id, c.id, 2);
  store.saveRun({
    ...done,
    text: "x".repeat(20000),
    visible: "WHOLE SOURCE",
    lastRevision: 3,
  });
  store.saveRun({
    ...preview,
    status: "preview",
    insertion: "unapplied draft",
  });
  store.saveProposal({
    id: "proposal",
    projectId: p.id,
    runId: done.id,
    status: "pending",
    summary: "Synthetic change",
    files: [
      {
        path: "main.tex",
        baseRevision: 0,
        before: "OLD CONTENT",
        after: "NEW CONTENT",
      },
    ],
  });
  const state = chats.state(p.id);
  assert.equal(state.conversations[0].turns, 2);
  assert.equal(state.runs[0].text, "");
  assert.equal(state.runs[0].visible, "");
  assert.equal(state.runs[0].lastRevision, 3);
  assert.equal(state.runs[1].insertion, "unapplied draft");
  assert.ok(!JSON.stringify(state).includes("PRIVATE SOURCE SNAPSHOT"));
  assert.ok(!JSON.stringify(state).includes("OLD CONTENT"));
  assert.ok(!JSON.stringify(state).includes("NEW CONTENT"));
  assert.equal(state.proposals[0].files[0].path, "main.tex");
});
test("rename and recoverable archive preserve sessions, replies, source and history with stale change rejection", (t) => {
  const { store, p, chats } = setup(t),
    c = store.createConversation(p.id, "A"),
    internal = store.conversation(c.id, p.id),
    before = store.project(p.id),
    history = store.checkpoints(p.id);
  internal.sessions = { codex: "private-native-session" };
  store.updateConversation(internal);
  run(store, p.id, c.id, 1);
  store.selectConversation(p.id, c.id);
  const renamed = chats.edit(p.id, c.id, {
    revision: 0,
    title: "  Unicode 研究 👩🏽‍🔬  ",
  });
  assert.equal(renamed.title, "Unicode 研究 👩🏽‍🔬");
  assert.equal((renamed as any).sessions, undefined);
  assert.throws(
    () => chats.edit(p.id, c.id, { revision: 0, title: "Stale" }),
    /changed/,
  );
  const archived = chats.edit(p.id, c.id, { revision: 1, archived: true });
  assert.ok(archived.archivedAt);
  assert.equal(store.activeConversation(p.id), null);
  assert.throws(() => chats.select(p.id, { id: c.id }), /Restore/);
  assert.equal(chats.turns(p.id, c.id).total, 1);
  chats.edit(p.id, c.id, { revision: 2, archived: false });
  chats.select(p.id, { id: c.id });
  assert.equal(store.activeConversation(p.id), c.id);
  assert.equal(
    store.conversation(c.id, p.id).sessions?.codex,
    "private-native-session",
  );
  assert.deepEqual(store.project(p.id), before);
  assert.deepEqual(store.checkpoints(p.id), history);
});
test("conversation edits and selections validate keys, revisions, titles, project identity and active AI locks", (t) => {
  const { store, p, chats } = setup(t),
    c = store.createConversation(p.id, "A"),
    other = store.create("Other", [
      { path: "main.tex", data: Buffer.from("other") },
    ]);
  for (const body of [
    { title: "Missing revision" },
    { revision: 0, title: "" },
    { revision: 0, title: "x".repeat(101) },
    { revision: 0, title: "bad\nline" },
    { revision: 0, archived: "yes" },
    { revision: 0, sessions: {} },
  ])
    assert.throws(() => chats.edit(p.id, c.id, body));
  assert.throws(
    () => chats.edit(other.id, c.id, { revision: 0, title: "No" }),
    /not found/,
  );
  assert.throws(() => chats.turns(other.id, c.id), /not found/);
  assert.throws(() => chats.select(other.id, { id: c.id }), /not found/);
  assert.throws(() => chats.select(p.id, { id: 2 }));
  store.locks.set(p.id + "/main.tex", "active");
  assert.throws(
    () => chats.edit(p.id, c.id, { revision: 0, archived: true }),
    /reserved/,
  );
  assert.equal(store.conversation(c.id, p.id).archivedAt, undefined);
});
test("active selection, explicit new chat, renamed archives and native sessions survive restart", (t) => {
  const { store, p, chats } = setup(t),
    a = store.createConversation(p.id, "A"),
    b = store.createConversation(p.id, "B");
  store.selectConversation(p.id, a.id);
  chats.edit(p.id, b.id, { revision: 0, archived: true });
  store.close();
  const reopened = new Store(store.root);
  store.db = reopened.db;
  assert.equal(store.activeConversation(p.id), a.id);
  assert.ok(store.conversation(b.id, p.id).archivedAt);
  store.selectConversation(p.id, null);
  store.close();
  const again = new Store(store.root);
  store.db = again.db;
  assert.equal(store.activeConversation(p.id), null);
});
test("archived conversations cannot resume a paid or native request", async (t) => {
  const { store, p, chats } = setup(t),
    c = store.createConversation(p.id, "A");
  chats.edit(p.id, c.id, { revision: 0, archived: true });
  let calls = 0;
  const ai = new AI(store, new Compiler(store), new Keys(), async () => {
    calls++;
    return { text: "", calls: [], usage: {} };
  });
  await assert.rejects(
    ai.run(
      {
        projectId: p.id,
        conversationId: c.id,
        path: "main.tex",
        revision: 0,
        from: 0,
        to: 0,
        mode: "review",
        provider: "openai",
        model: "fixture",
        prompt: "Continue",
      },
      () => {},
    ),
    /Restore/,
  );
  assert.equal(calls, 0);
  assert.equal(store.runs(p.id).length, 0);
});
test("live chat status distinguishes response generation from replacement review and local typing", (t) => {
  const { store, p } = setup(t),
    c = store.createConversation(p.id, "A"),
    r = run(store, p.id, c.id, 1);
  assert.equal(
    chatStatus(r, {
      generating: true,
      draft: true,
      typing: false,
      paused: false,
    }),
    "Replacement ready",
  );
  assert.equal(
    chatStatus(r, {
      generating: false,
      draft: false,
      typing: true,
      paused: true,
    }),
    "Typing paused",
  );
  assert.equal(chatStatus({ ...r, status: "failed" }), "Failed");
  const merged = mergeTurns(
    [r],
    { ...r, status: "generating" },
    "live text",
    true,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "live text");
  assert.equal(mergeTurns([r], null, "", false)[0].text, r.text);
});
test("chat API keeps compatibility and validates origins, private sessions and lazy proposal ownership", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-chat-api-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("Synthetic API", [
      { path: "main.tex", data: Buffer.from("source") },
    ]),
    c = env.store.createConversation(p.id, "A");
  run(env.store, p.id, c.id, 1);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    base = `/api/projects/${p.id}`;
  const full = (await env.app.inject({ url: base + "/chats", headers })).json(),
    summary = (
      await env.app.inject({ url: base + "/chats?summary=1", headers })
    ).json();
  assert.equal(full.runs[0].text, "Reply 1");
  assert.equal(summary.runs[0].text, "");
  assert.equal(
    (
      await env.app.inject({
        url: base + `/conversations/${c.id}/turns`,
        headers,
      })
    ).json().turns[0].text,
    "Reply 1",
  );
  assert.equal(
    (
      await env.app.inject({
        method: "PATCH",
        url: base + `/conversations/${c.id}`,
        headers: { ...headers, origin: "https://outside.invalid" },
        payload: { revision: 0, title: "No" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await env.app.inject({
        method: "PUT",
        url: base + "/active-conversation",
        headers,
        payload: { id: null },
      })
    ).json().id,
    null,
  );
  assert.equal(
    (await env.app.inject({ url: base + "/proposals/missing", headers }))
      .statusCode,
    404,
  );
});
test("saved failures and final stream events retain safe outcomes and omit source snapshots", async (t) => {
  const { store, p } = setup(t),
    keys = new Keys();
  keys.set("openai", "fixture-key");
  const events: any[] = [],
    ai = new AI(store, new Compiler(store), keys, async (input) => {
      input.onText("A partial reply.");
      throw new Error("private vendor detail");
    });
  const id = await ai.run(
      {
        projectId: p.id,
        path: "main.tex",
        revision: 0,
        from: 0,
        to: 0,
        mode: "review",
        provider: "openai",
        model: "gpt-6-luna",
        prompt: "Synthetic failure",
      },
      (event) => events.push(event),
    ),
    saved = store.run(id),
    done = events.find((event) => event.type === "done");
  assert.equal(saved.status, "failed");
  assert.equal(saved.text, "A partial reply.");
  assert.match(saved.error!, /provider connection failed/);
  assert.equal(done.run.status, "failed");
  assert.equal(done.run.error, saved.error);
  assert.equal(done.run.before, undefined);
  assert.ok(!JSON.stringify(done).includes("private vendor detail"));
  assert.equal(store.activeConversation(p.id), saved.conversationId);
  assert.equal(store.readText(p.id, "main.tex").content, "Original source");
});
test("archiving the active conversation starts an explicit blank chat even when other conversations exist", (t) => {
  const { store, p, chats } = setup(t),
    active = store.createConversation(p.id, "Active");
  store.createConversation(p.id, "Another conversation");
  store.selectConversation(p.id, active.id);
  chats.edit(p.id, active.id, { revision: 0, archived: true });
  assert.equal(chats.state(p.id).activeConversationId, null);
  assert.equal(store.setting("chat.active:" + p.id, undefined), null);
});
