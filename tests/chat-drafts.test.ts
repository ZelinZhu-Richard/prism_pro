import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { ChatDrafts } from "../server/chat-drafts";
import {
  DraftController,
  type DraftView,
  type DraftPorts,
} from "../src/chat-drafts";
import { createApp } from "../server/app";
import { AI } from "../server/ai";
import { Compiler } from "../server/compiler";
import { Keys } from "../server/providers";
import type { AiRequest } from "../shared/types";
import type { ChatDraft, DraftKey } from "../shared/chat-drafts";
function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-draft-")),
    store = new Store(root),
    drafts = new ChatDrafts(store),
    project = store.create("Synthetic drafts", [
      { path: "main.tex", data: Buffer.from("Original source.\n") },
    ]),
    conversation = store.createConversation(project.id, "Existing chat");
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    store,
    drafts,
    project,
    conversation,
    key: { projectId: project.id, conversationId: conversation.id } as DraftKey,
  };
}
function write(text: string, revision = 0, requestId = randomUUID()) {
  return { text, revision, requestId };
}
function ui(
  t: any,
  f: ReturnType<typeof fixture>,
  overrides: Partial<DraftPorts> = {},
) {
  const result = {
    view: { text: "", status: "loading" } as DraftView,
    writes: 0,
  };
  const controller = new DraftController(
    {
      load: async (k) => f.drafts.read(k.projectId, k.conversationId),
      save: async (k, v) => {
        result.writes++;
        try {
          return f.drafts.save(k.projectId, k.conversationId, v);
        } catch (e) {
          throw Object.assign(new Error((e as Error).message), {
            status: (e as { statusCode?: number }).statusCode,
          });
        }
      },
      notify: (v) => {
        result.view = v;
      },
      requestId: randomUUID,
      ...overrides,
    },
    100000,
  );
  t.after(() => controller.dispose());
  return { controller, result };
}
test("drafts persist exact per-project/conversation/New-chat Unicode without source, history or session mutation", (t) => {
  const f = fixture(t),
    before = f.store.project(f.project.id),
    history = f.store.checkpoints(f.project.id),
    chats = f.store.conversations(f.project.id),
    text = "  Unsent α👩🏽‍💻e\u0301\n\\cite{example}  ";
  assert.deepEqual(f.drafts.read(f.project.id, null), {
    projectId: f.project.id,
    conversationId: null,
    text: "",
    revision: 0,
    updated: null,
  });
  const a = f.drafts.save(f.project.id, f.conversation.id, write(text)),
    n = f.drafts.save(f.project.id, null, write("New-chat draft"));
  assert.equal(a.revision, 1);
  assert.equal(n.text, "New-chat draft");
  const other = f.store.create("Other", [
    { path: "main.tex", data: Buffer.from("Other source") },
  ]);
  f.drafts.save(other.id, null, write("Other project's draft"));
  const restarted = new Store(f.root);
  try {
    const drafts = new ChatDrafts(restarted);
    assert.equal(drafts.read(f.project.id, f.conversation.id).text, text);
    assert.equal(drafts.read(f.project.id, null).text, n.text);
    assert.equal(drafts.read(other.id, null).text, "Other project's draft");
  } finally {
    restarted.close();
  }
  assert.deepEqual(f.store.project(f.project.id), before);
  assert.deepEqual(f.store.checkpoints(f.project.id), history);
  assert.deepEqual(f.store.conversations(f.project.id), chats);
  assert.equal(f.store.runs(f.project.id).length, 0);
  assert.ok(
    !f.store
      .exportFiles(f.project.id)
      .some((file) => file.data.includes(Buffer.from(text))),
  );
});
test("draft writes use revision checks and exact idempotent retries; empty clears retain monotonic revisions", (t) => {
  const f = fixture(t),
    request = write("Saved once"),
    first = f.drafts.save(f.project.id, null, request);
  assert.deepEqual(f.drafts.save(f.project.id, null, request), first);
  assert.throws(
    () =>
      f.drafts.save(f.project.id, null, {
        ...request,
        text: "different retry",
      }),
    /different text/,
  );
  assert.throws(
    () => f.drafts.save(f.project.id, null, write("stale", 0)),
    /another window/,
  );
  const cleared = f.drafts.save(f.project.id, null, write("", 1));
  assert.equal(cleared.revision, 2);
  assert.equal(cleared.text, "");
  assert.throws(
    () => f.drafts.save(f.project.id, null, request),
    /another window/,
  );
  assert.equal(
    f.drafts.save(f.project.id, null, write("third", 2)).revision,
    3,
  );
});
test("draft validation scopes conversations and rejects malformed or oversized writes without mutating source", (t) => {
  const f = fixture(t),
    p = f.store.create("Other", [{ path: "main.tex", data: Buffer.from("x") }]),
    c = f.store.createConversation(p.id);
  assert.throws(
    () => f.drafts.read(f.project.id, c.id),
    /not found in this project/,
  );
  for (const id of [undefined, {}, [], "", 2, "x".repeat(81)])
    assert.throws(() => f.drafts.read(f.project.id, id));
  for (const value of [
    null,
    [],
    {},
    write("x".repeat(16001)),
    write("\ud800"),
    { ...write("x"), revision: -1 },
    { ...write("x"), revision: 1.5 },
    { ...write("x"), requestId: "bad" },
    { ...write("x"), extra: "ignored?" },
  ])
    assert.throws(() => f.drafts.save(f.project.id, null, value));
  assert.equal(f.drafts.read(f.project.id, null).revision, 0);
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "Original source.\n",
  );
});
test("drafts survive archive/restore and project Trash while a project copy starts without drafts", (t) => {
  const f = fixture(t);
  f.drafts.save(f.project.id, f.conversation.id, write("Kept for restore"));
  const c = f.store.conversation(f.conversation.id, f.project.id);
  c.archivedAt = new Date().toISOString();
  f.store.updateConversation(c);
  assert.equal(f.drafts.read(f.project.id, c.id).text, "Kept for restore");
  const copied = f.store.copy(f.project.id, {
    name: "Draft-free copy",
    generation: f.store.project(f.project.id).generation,
    requestId: randomUUID(),
  });
  assert.equal(f.drafts.read(copied.id, null).text, "");
  assert.equal(f.store.conversations(copied.id).length, 0);
  f.store.trashProject(f.project.id);
  assert.throws(
    () => f.drafts.read(f.project.id, c.id),
    /not found|Trash|trashed/i,
  );
  f.store.trashProject(f.project.id, true);
  assert.equal(f.drafts.read(f.project.id, c.id).text, "Kept for restore");
});
test("draft metadata stays editable during an AI source lock and never changes source generation", (t) => {
  const f = fixture(t),
    generation = f.store.project(f.project.id).generation;
  f.store.projectLocks.set(f.project.id, "other-run");
  f.drafts.save(
    f.project.id,
    f.conversation.id,
    write("An unsent future prompt"),
  );
  assert.equal(f.store.project(f.project.id).generation, generation);
  assert.equal(f.store.projectLocks.get(f.project.id), "other-run");
  f.store.projectLocks.clear();
});
test("draft controller restores and separates saved chat and New conversation, including a fresh controller", async (t) => {
  const f = fixture(t),
    a = ui(t, f),
    key = { projectId: f.project.id, conversationId: null };
  await a.controller.open(f.key);
  a.controller.edit("Existing draft α");
  await a.controller.flush();
  await a.controller.open(key);
  a.controller.edit("New draft 中文");
  await a.controller.flush();
  await a.controller.open(f.key);
  assert.equal(a.result.view.text, "Existing draft α");
  assert.equal(a.result.view.status, "saved");
  const fresh = ui(t, f);
  await fresh.controller.open(key);
  assert.equal(fresh.result.view.text, "New draft 中文");
  assert.equal(fresh.controller.unsaved(), false);
});
test("edits during a pending draft save serialize and persist the newest text exactly", async (t) => {
  const f = fixture(t);
  let release!: () => void;
  let saves = 0;
  const a = ui(t, f, {
    save: async (k, v) => {
      if (++saves === 1)
        await new Promise<void>((r) => {
          release = r;
        });
      return f.drafts.save(k.projectId, k.conversationId, v);
    },
  });
  await a.controller.open(f.key);
  a.controller.edit("first");
  const saving = a.controller.flush();
  await Promise.resolve();
  a.controller.edit("newest 👩🏽‍💻");
  release();
  await saving;
  assert.equal(saves, 2);
  assert.equal(
    f.drafts.read(f.key.projectId, f.key.conversationId).text,
    "newest 👩🏽‍💻",
  );
  assert.equal(a.result.view.status, "saved");
});
test("late reads and saves never put another conversation's text in the active composer", async (t) => {
  const f = fixture(t),
    other = { projectId: f.project.id, conversationId: null };
  let release!: (r: ChatDraft) => void;
  const a = ui(t, f, {
    load: (k) =>
      k.conversationId
        ? new Promise<ChatDraft>((r) => {
            release = r;
          })
        : Promise.resolve(f.drafts.read(k.projectId, k.conversationId)),
  });
  const loading = a.controller.open(f.key);
  await Promise.resolve();
  await a.controller.open(other);
  a.controller.edit("Active new chat");
  release({
    ...f.drafts.read(f.key.projectId, f.key.conversationId),
    text: "Late old chat",
  });
  await loading;
  assert.equal(a.result.view.text, "Active new chat");
  assert.deepEqual(a.result.view.key, other);
});
test("lost successful saves retry the same identifier and reconcile a newer local edit without duplicating versions", async (t) => {
  const f = fixture(t);
  let lose = true;
  const ids: string[] = [];
  const a = ui(t, f, {
    save: async (k, v) => {
      ids.push(v.requestId);
      const r = f.drafts.save(k.projectId, k.conversationId, v);
      if (lose) {
        lose = false;
        throw new Error("Lost success");
      }
      return r;
    },
  });
  await a.controller.open(f.key);
  a.controller.edit("First persisted");
  await assert.rejects(a.controller.flush(), /Lost success/);
  assert.equal(a.result.view.text, "First persisted");
  a.controller.edit("New text after error");
  await a.controller.flush();
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
  assert.equal(
    f.drafts.read(f.key.projectId, f.key.conversationId).revision,
    2,
  );
  assert.equal(a.result.view.text, "New text after error");
  assert.equal(a.controller.unsaved(), false);
});
test("competing windows keep local text until an explicit saved/local choice, with repeat conflict protection", async (t) => {
  const f = fixture(t),
    a = ui(t, f),
    b = ui(t, f);
  await a.controller.open(f.key);
  await b.controller.open(f.key);
  a.controller.edit("Window A");
  await a.controller.flush();
  b.controller.edit("Window B");
  await assert.rejects(b.controller.flush(), /another window/);
  assert.equal(b.result.view.status, "conflict");
  assert.equal(b.result.view.text, "Window B");
  assert.equal(b.result.view.remote?.text, "Window A");
  await b.controller.resolve("saved");
  assert.equal(b.result.view.text, "Window A");
  assert.equal(b.result.view.status, "saved");
  b.controller.edit("Window B explicit");
  a.controller.edit("Window A newer");
  await a.controller.flush();
  await assert.rejects(b.controller.flush());
  a.controller.edit("Window A newest");
  await a.controller.flush();
  await assert.rejects(b.controller.resolve("local"));
  assert.equal(b.result.view.text, "Window B explicit");
  assert.equal(b.result.view.remote?.text, "Window A newest");
  await b.controller.resolve("local");
  assert.equal(
    f.drafts.read(f.key.projectId, f.key.conversationId).text,
    "Window B explicit",
  );
});
test("focus refresh adopts a clean remote draft but preserves dirty local text and exposes conflict", async (t) => {
  const f = fixture(t),
    a = ui(t, f);
  await a.controller.open(f.key);
  f.drafts.save(f.key.projectId, f.key.conversationId, write("Remote"));
  await a.controller.refresh();
  assert.equal(a.result.view.text, "Remote");
  a.controller.edit("Local");
  f.drafts.save(f.key.projectId, f.key.conversationId, write("Remote new", 1));
  await a.controller.refresh();
  assert.equal(a.result.view.text, "Local");
  assert.equal(a.result.view.remote?.text, "Remote new");
});
test("initial loading and wrong-scope responses retain local edits and never silently replace them", async (t) => {
  const f = fixture(t);
  let fail = true;
  const a = ui(t, f, {
    load: async (k) => {
      if (fail) throw new Error("Offline");
      return {
        ...f.drafts.read(k.projectId, k.conversationId),
        text: "Remote draft",
        revision: 1,
      };
    },
  });
  await assert.rejects(a.controller.open(f.key), /Offline/);
  assert.equal(a.result.view.status, "error");
  a.controller.edit("Local during recovery");
  fail = false;
  await assert.rejects(a.controller.flush(), /another window/);
  assert.equal(a.result.view.text, "Local during recovery");
  assert.equal(a.result.view.remote?.text, "Remote draft");
  const wrong = ui(t, f, {
    load: async (k) => ({
      ...f.drafts.read(k.projectId, k.conversationId),
      projectId: "wrong",
    }),
  });
  await assert.rejects(wrong.controller.open(f.key), /did not match/);
  assert.equal(wrong.result.view.text, "");
});
test("accepted-run acknowledgment clears only the submitted draft and keeps later local text", async (t) => {
  const f = fixture(t),
    a = ui(t, f);
  await a.controller.open(f.key);
  a.controller.edit("Submitted");
  const saved = await a.controller.flush();
  assert.ok(saved);
  a.controller.acknowledge(f.key, "Submitted", saved.revision + 1);
  assert.equal(a.result.view.text, "");
  assert.equal(a.controller.unsaved(), false);
  a.controller.edit("Later local draft");
  a.controller.acknowledge(f.key, "Submitted", saved.revision + 2);
  assert.equal(a.result.view.text, "Later local draft");
  assert.equal(a.controller.unsaved(), true);
});
function assistant(f: ReturnType<typeof fixture>) {
  const keys = new Keys();
  keys.set("openai", "synthetic");
  let calls = 0;
  const ai = new AI(f.store, new Compiler(f.store), keys, async () => {
    calls++;
    return { text: "Synthetic reply", calls: [], usage: {} };
  });
  const request: AiRequest = {
    projectId: f.project.id,
    conversationId: f.conversation.id,
    provider: "openai",
    model: "fixture",
    mode: "review",
    path: "main.tex",
    revision: 0,
    from: 0,
    to: 0,
    prompt: "Saved submitted prompt",
  };
  return { ai, request, calls: () => calls };
}
test("accepting an AI run consumes the exact submitted draft atomically and reuses the saved conversation", async (t) => {
  const f = fixture(t),
    a = assistant(f),
    draft = f.drafts.save(
      f.project.id,
      f.conversation.id,
      write(a.request.prompt),
    ),
    other = f.drafts.save(
      f.project.id,
      null,
      write("Unrelated new-chat draft"),
    );
  const id = await a.ai.run(
      { ...a.request, draftRevision: draft.revision },
      () => {},
    ),
    run = f.store.run(id);
  assert.equal(run.conversationId, f.conversation.id);
  assert.equal(run.prompt, a.request.prompt);
  assert.equal(run.consumedDraftRevision, draft.revision + 1);
  assert.equal(f.drafts.read(f.project.id, f.conversation.id).text, "");
  assert.deepEqual(f.drafts.read(f.project.id, null), other);
  assert.equal(f.store.conversations(f.project.id).length, 1);
  assert.equal(a.calls(), 1);
  await assert.rejects(
    a.ai.run({ ...a.request, draftRevision: draft.revision }, () => {}),
    /changed in another window/,
  );
  assert.equal(a.calls(), 1);
  assert.equal(f.store.runs(f.project.id).length, 1);
});
test("new-chat submission consumes only the New conversation slot and does not create chats while drafting", async (t) => {
  const f = fixture(t),
    a = assistant(f),
    draft = f.drafts.save(f.project.id, null, write(a.request.prompt)),
    count = f.store.conversations(f.project.id).length;
  assert.equal(f.store.conversations(f.project.id).length, count);
  const id = await a.ai.run(
    { ...a.request, conversationId: undefined, draftRevision: draft.revision },
    () => {},
  );
  assert.notEqual(f.store.run(id).conversationId, f.conversation.id);
  assert.equal(f.drafts.read(f.project.id, null).text, "");
  assert.equal(f.store.conversations(f.project.id).length, count + 1);
});
test("failed or stale AI preflight keeps the prompt and makes no provider call or conversation", async (t) => {
  const f = fixture(t),
    a = assistant(f),
    draft = f.drafts.save(f.project.id, null, write(a.request.prompt)),
    count = f.store.conversations(f.project.id).length;
  f.drafts.save(
    f.project.id,
    null,
    write("Newer unsent prompt", draft.revision),
  );
  await assert.rejects(
    a.ai.run(
      {
        ...a.request,
        conversationId: undefined,
        draftRevision: draft.revision,
      },
      () => {},
    ),
    /changed in another window/,
  );
  assert.equal(f.drafts.read(f.project.id, null).text, "Newer unsent prompt");
  assert.equal(a.calls(), 0);
  assert.equal(f.store.conversations(f.project.id).length, count);
  assert.equal(f.store.runs(f.project.id).length, 0);
  await assert.rejects(
    a.ai.run({ ...a.request, draftRevision: -1 }, () => {}),
    /draft revision/,
  );
});
test("run-persistence failure rolls back draft consumption, fresh conversation and selection before any provider call", async (t) => {
  const f = fixture(t),
    a = assistant(f),
    draft = f.drafts.save(f.project.id, null, write(a.request.prompt)),
    conversations = f.store.conversations(f.project.id),
    active = f.store.activeConversation(f.project.id);
  f.store.saveRun = () => {
    throw new Error("Injected run persistence failure");
  };
  await assert.rejects(
    a.ai.run(
      {
        ...a.request,
        conversationId: undefined,
        draftRevision: draft.revision,
      },
      () => {},
    ),
    /persistence failure/,
  );
  assert.deepEqual(f.drafts.read(f.project.id, null), draft);
  assert.deepEqual(f.store.conversations(f.project.id), conversations);
  assert.equal(f.store.activeConversation(f.project.id), active);
  assert.equal(f.store.projectLocks.size, 0);
  assert.equal(a.calls(), 0);
});
test("legacy AI clients without a draft revision do not consume an unrelated unsent draft", async (t) => {
  const f = fixture(t),
    a = assistant(f),
    draft = f.drafts.save(
      f.project.id,
      f.conversation.id,
      write("A future unsent request"),
    );
  await a.ai.run(a.request, () => {});
  assert.deepEqual(f.drafts.read(f.project.id, f.conversation.id), draft);
});
test("draft HTTP endpoints enforce local origins and return versioned exact local text", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-draft-http-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("HTTP draft", [
      { path: "main.tex", data: Buffer.from("source") },
    ]),
    headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      "x-prism-request": "1",
    },
    url = `/api/projects/${p.id}/chat-draft?conversation=`;
  assert.equal(
    (await env.app.inject({ method: "GET", url, headers })).json().revision,
    0,
  );
  const payload = write("HTTP α\n  whitespace  "),
    ok = await env.app.inject({ method: "PUT", url, headers, payload });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().text, payload.text);
  const denied = await env.app.inject({
    method: "PUT",
    url,
    headers: { ...headers, origin: "https://example.com" },
    payload: write("denied", 1),
  });
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(
    (await env.app.inject({ method: "PUT", url, headers, payload })).json(),
    ok.json(),
  );
  assert.equal(env.store.runs(p.id).length, 0);
  assert.equal(env.store.readText(p.id, "main.tex").content, "source");
});

test("conflict comparison stays available during a pending choice and after a newer remote conflict", async (t) => {
  const f = fixture(t);
  let release!: () => void;
  let pause = false;
  const observations: DraftView[] = [];
  const a = ui(t, f, {
    save: async (k, v) => {
      if (pause)
        await new Promise<void>((r) => {
          release = r;
        });
      try {
        return f.drafts.save(k.projectId, k.conversationId, v);
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), { status: 409 });
      }
    },
    notify: (v) => observations.push(v),
  });
  await a.controller.open(f.key);
  a.controller.edit("Local choice");
  f.drafts.save(f.key.projectId, f.key.conversationId, write("Remote one"));
  await assert.rejects(a.controller.flush());
  pause = true;
  const choice = a.controller.resolve("local");
  await Promise.resolve();
  assert.ok(
    observations.at(-1)?.remote,
    "comparison must remain mounted while saving",
  );
  f.drafts.save(f.key.projectId, f.key.conversationId, write("Remote two", 1));
  release();
  await assert.rejects(choice);
  assert.equal(observations.at(-1)?.remote?.text, "Remote two");
  assert.equal(observations.at(-1)?.text, "Local choice");
});
test("a lost successful conflict choice retries the same write without another saved revision", async (t) => {
  const f = fixture(t);
  let lose = false;
  const ids: string[] = [];
  const a = ui(t, f, {
    save: async (k, v) => {
      ids.push(v.requestId);
      let r: ChatDraft;
      try {
        r = f.drafts.save(k.projectId, k.conversationId, v);
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), { status: 409 });
      }
      if (lose) {
        lose = false;
        throw new Error("Lost chosen save");
      }
      return r;
    },
  });
  await a.controller.open(f.key);
  a.controller.edit("Local chosen");
  f.drafts.save(f.key.projectId, f.key.conversationId, write("Remote", 0));
  await assert.rejects(a.controller.flush());
  lose = true;
  await assert.rejects(a.controller.resolve("local"), /Lost chosen save/);
  assert.ok(a.result.view.remote);
  const revision = f.drafts.read(
    f.key.projectId,
    f.key.conversationId,
  ).revision;
  await a.controller.resolve("local");
  assert.equal(ids.at(-1), ids.at(-2));
  assert.equal(
    f.drafts.read(f.key.projectId, f.key.conversationId).revision,
    revision,
  );
  assert.equal(a.result.view.status, "saved");
});
