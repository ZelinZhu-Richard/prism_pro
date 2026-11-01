import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { AI } from "../server/ai";
import { Compiler } from "../server/compiler";
import { Keys } from "../server/providers";
import type { AiRequest } from "../shared/types";
function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-history-"));
  const store = new Store(root),
    keys = new Keys(),
    compiler = new Compiler(store);
  keys.set("openai", "fixture");
  const p = store.create("Synthetic", [
    { path: "main.tex", data: Buffer.from("abc ORIGINAL xyz") },
    { path: "other.tex", data: Buffer.from("other") },
    { path: "image.png", data: Buffer.from([1, 2, 3]) },
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request: AiRequest = {
    projectId: p.id,
    path: "main.tex",
    revision: 0,
    from: 4,
    to: 12,
    prompt: "Remember the code word: amber.",
    mode: "review",
    scope: "document",
    provider: "openai",
    model: "gpt-6-luna",
    explicitModel: true,
  };
  return { store, keys, compiler, request, p };
}
test("automatic history saves the baseline, batches edits, deduplicates assets and restores exact source", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { store, p } = setup(t),
    initial = store.checkpoints(p.id)[0] as any;
  assert.equal(initial.automatic, 1);
  store.save(p.id, "main.tex", "change one", 0);
  t.mock.timers.tick(5000);
  store.save(p.id, "main.tex", "change two", 1);
  assert.equal(store.checkpoints(p.id).length, 1);
  t.mock.timers.tick(10001);
  assert.equal(store.checkpoints(p.id).length, 2);
  assert.equal(
    (store.db.prepare("SELECT count(*) n FROM history_blobs").get() as any).n,
    5, // Four source blobs plus the deduplicated empty review snapshot.
  );
  assert.equal(store.automaticCheckpoint(p.id), null);
  store.restoreCheckpoint(p.id, initial.id);
  assert.equal(store.readText(p.id, "main.tex").content, "abc ORIGINAL xyz");
  assert.deepEqual(
    Buffer.from(store.file(p.id, "image.png").content),
    Buffer.from([1, 2, 3]),
  );
});
test("continuous edits still save history within a minute and shutdown flushes pending changes", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { store, p } = setup(t);
  for (let i = 0; i < 12; i++) {
    store.save(p.id, "main.tex", "edit " + i, i);
    t.mock.timers.tick(5000);
  }
  assert.ok(store.checkpoints(p.id).length >= 2);
  store.save(p.id, "main.tex", "last visible edit", 12);
  assert.ok(store.historyTimers.size);
  store.close();
  const restarted = new Store(store.root);
  assert.equal(restarted.checkpoints(p.id)[0].name, "Automatic save");
  assert.equal(
    restarted.readText(p.id, "main.tex").content,
    "last visible edit",
  );
  // setup cleanup owns the original Store; return the live connection to it.
  store.db = restarted.db;
});
test("chat follow-ups replay saved turns, survive restart and reject cross-project IDs", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  let messages: any[] = [];
  const ai = new AI(store, compiler, keys, async (input) => {
    messages = input.messages;
    input.onText("Amber remembered.");
    return { text: "Amber remembered.", calls: [], usage: {} };
  });
  const first = await ai.run(request, () => {}),
    conversationId = store.run(first).conversationId;
  await ai.run(
    { ...request, prompt: "What code word did I give you?", conversationId },
    () => {},
  );
  assert.equal(messages.length, 3);
  assert.match(messages[0].content, /amber/);
  assert.match(messages[1].content, /Amber remembered/);
  assert.equal(store.conversations(request.projectId).length, 1);
  const other = store.create("Other", [
    { path: "main.tex", data: Buffer.from("other") },
  ]);
  assert.throws(
    () =>
      ai.context({
        ...request,
        projectId: other.id,
        conversationId,
        from: 0,
        to: 0,
      }),
    /Conversation not found/,
  );
  const reopened = new Store(store.root);
  assert.equal(
    reopened.conversation(conversationId!, request.projectId).id,
    conversationId,
  );
  reopened.close();
});
test("Document mode never replays broader project turns or a different document", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  let messages: any[] = [];
  const ai = new AI(store, compiler, keys, async (input) => {
    messages = input.messages;
    return { text: "reply", calls: [], usage: {} };
  });
  const first = await ai.run(
      { ...request, scope: "project", prompt: "PROJECT_SECRET" },
      () => {},
    ),
    conversationId = store.run(first).conversationId;
  await ai.run(
    {
      ...request,
      conversationId,
      path: "other.tex",
      from: 0,
      to: 0,
      prompt: "OTHER_DOCUMENT_SECRET",
    },
    () => {},
  );
  await ai.run(
    { ...request, conversationId, prompt: "Current file only" },
    () => {},
  );
  assert.equal(messages.length, 1);
  assert.doesNotMatch(
    JSON.stringify(messages),
    /PROJECT_SECRET|OTHER_DOCUMENT_SECRET/,
  );
});
test("Manual Type preview has no source/history effects until explicit approval; edited draft and one-step Undo are exact", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  const ai = new AI(store, compiler, keys, async () => ({
    text: "Prepared.",
    usage: {},
    calls: [
      {
        id: "typing",
        name: "type_text",
        arguments: JSON.stringify({ text: "Original draft", replace: "" }),
      },
    ],
  }));
  const id = await ai.run(
    { ...request, mode: "manual", previewFirst: true },
    () => {},
  );
  assert.equal(store.run(id).status, "preview");
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc ORIGINAL xyz",
  );
  assert.equal(store.checkpoints(request.projectId).length, 1);
  assert.throws(() => ai.progress(id, "Original", 0), /no longer active/);
  const approved = "Edited é 👩🏽‍🔬 replacement";
  assert.equal(ai.approve(id, approved).text, approved);
  ai.progress(id, approved, 0);
  ai.finish(id);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc " + approved + " xyz",
  );
  assert.equal(store.checkpoints(request.projectId).length, 2);
  assert.equal(ai.undo(id).content, "abc ORIGINAL xyz");
  assert.throws(() => ai.approve(id, "again"), /no longer active/);
});
test("discarding a replacement does not add a source version or checkpoint", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  const ai = new AI(store, compiler, keys, async () => ({
    text: "Draft",
    usage: {},
    calls: [
      {
        id: "typing",
        name: "type_text",
        arguments: '{"text":"replacement","replace":""}',
      },
    ],
  }));
  const id = await ai.run(
    { ...request, mode: "manual", previewFirst: true },
    () => {},
  );
  ai.stop(id);
  ai.finish(id);
  assert.equal(store.checkpoints(request.projectId).length, 1);
  assert.equal(store.readText(request.projectId, "main.tex").revision, 0);
  assert.equal(store.projectLocks.size, 0);
});

test("draft compilation uses a virtual replacement, remains outside build listings, and never saves source", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  const ai = new AI(store, compiler, keys, async () => ({
    text: "Prepared",
    usage: {},
    calls: [
      {
        id: "t",
        name: "type_text",
        arguments: '{"text":"draft","replace":""}',
      },
    ],
  }));
  const id = await ai.run(
    { ...request, mode: "manual", previewFirst: true },
    () => {},
  );
  let snapshot: any;
  t.mock.method(
    compiler,
    "start",
    (projectId: string, _clean: boolean, draft: any) => {
      assert.equal(projectId, request.projectId);
      snapshot = draft;
      return { id: "draft-build", projectId, preview: true } as any;
    },
  );
  ai.compileDraft(id, "Edited draft");
  assert.equal(snapshot.content, "abc Edited draft xyz");
  assert.equal(snapshot.path, "main.tex");
  assert.equal(snapshot.runId, id);
  compiler.jobs.set("draft-build", {
    id: "draft-build",
    projectId: request.projectId,
    preview: true,
    status: "succeeded",
    pdf: true,
  } as any);
  assert.equal(compiler.list(request.projectId).length, 0);
  assert.equal(compiler.latestPdf(request.projectId), null);
  assert.equal(store.readText(request.projectId, "main.tex").revision, 0);
  assert.equal(store.checkpoints(request.projectId).length, 1);
  ai.stop(id);
  ai.finish(id);
});
test("revision suggestions use separate draft context without polluting user prompts", async (t) => {
  const { keys, compiler, store, request } = setup(t);
  const ai = new AI(store, compiler, keys, async () => ({
    text: "reply",
    calls: [],
    usage: {},
  }));
  const c = ai.context({
    ...request,
    proposedReplacement: "Pending replacement",
    prompt: "Make it concise",
  });
  assert.match(c.context, /<unapplied-proposed-edit>\nPending replacement/);
  assert.match(c.context, /User request: Make it concise/);
  assert.throws(
    () => ai.context({ ...request, proposedReplacement: "x".repeat(80001) }),
    /context size/,
  );
});

test("shutdown interrupts generation, releases locks and leaves saved conversations recoverable", async (t) => {
  const { store, keys, compiler, request } = setup(t);
  const ai = new AI(store, compiler, keys, async ({ signal }) => {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Stopped", "AbortError")),
        { once: true },
      ),
    );
    return { text: "", usage: {}, calls: [] };
  });
  let id = "";
  const pending = ai.run(request, (e) => {
    if (e.type === "run") id = e.run.id;
  });
  ai.shutdown();
  await pending;
  assert.equal(store.run(id).status, "interrupted");
  assert.equal(store.projectLocks.size, 0);
  assert.equal(ai.leases.size, 0);
  store.save(request.projectId, "other.tex", "Editing works after shutdown", 0);
});
