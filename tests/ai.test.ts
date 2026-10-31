import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys, type ProviderInput } from "../server/providers";
import type { AiRequest } from "../shared/types";
function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-ai-"));
  const store = new Store(dir),
    compiler = new Compiler(store),
    keys = new Keys();
  keys.set("openai", "fixture-key");
  const project = store.create("Synthetic fixture", [
    { path: "main.tex", data: Buffer.from("abc ORIGINAL xyz") },
    { path: "other.tex", data: Buffer.from("other") },
  ]);
  const request: AiRequest = {
    projectId: project.id,
    path: "main.tex",
    provider: "openai",
    model: "gpt-6-luna",
    mode: "manual",
    prompt: "replace selection",
    from: 4,
    to: 12,
    revision: 0,
    explicitModel: true,
  };
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { store, compiler, keys, request };
}
for (const provider of ["gemini", "qwen"] as const) {
  test(`${provider} runs both modes and preserves tool-call metadata through Review Edits`, async (t) => {
    const { store, compiler, keys, request } = setup(t);
    keys.set(provider, "fixture-key");
    const signature = { google: { thought_signature: "opaque-signature" } };
    let count = 0;
    const ai = new AI(store, compiler, keys, async (input) => {
      count++;
      assert.equal(input.provider, provider);
      if (count === 1)
        return {
          text: "",
          usage: {},
          calls: [
            {
              id: "read",
              name: "read_file",
              arguments: '{"path":"other.tex"}',
              extraContent: signature,
            },
          ],
          extraContent: signature,
        };
      if (count === 2) {
        assert.deepEqual(input.messages[1].calls?.[0].extraContent, signature);
        assert.deepEqual(input.messages[1].extraContent, signature);
        assert.equal(input.messages[2].callId, "read");
      } else assert.equal(input.tools, undefined);
      input.onText("A fragment α");
      return { text: "A fragment α", usage: {}, calls: [] };
    });
    await ai.run(
      {
        ...request,
        provider,
        model:
          provider === "gemini" ? "gemini-3.5-flash-lite" : "qwen3.8-flash",
        mode: "review",
      },
      () => {},
    );
    assert.equal(count, 2);
    await ai.run(
      {
        ...request,
        provider,
        model:
          provider === "gemini" ? "gemini-3.5-flash-lite" : "qwen3.8-flash",
        mode: "manual",
      },
      () => {},
    );
    assert.equal(count, 3);
    for (const timer of ai.leases.values()) clearTimeout(timer);
  });
}
test("Manual Type uses one generation, locks file and compilation, saves partials, and exact Undo", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let calls = 0,
    id = "";
  const ai = new AI(store, compiler, keys, async (input) => {
    calls++;
    assert.equal(input.maxOutput, 4096);
    assert.equal(input.tools, undefined);
    input.onText("e");
    input.onText("\u0301🙂 complete");
    ai.progress(id, "e\u0301", 0);
    return { text: "e\u0301🙂 complete", calls: [], usage: {} };
  });
  await ai.run(request, (event) => {
    if (event.type === "run") {
      id = event.run.id;
      assert.throws(
        () => store.save(request.projectId, "main.tex", "competing", 0),
        /reserved/,
      );
      assert.throws(() => compiler.start(request.projectId), /reserved/);
    }
  });
  assert.equal(calls, 1);
  assert.equal(store.run(id).lastRevision, 1);
  assert.equal(store.run(id).visible, "e\u0301");
  ai.progress(id, "e\u0301🙂 complete", 1);
  ai.finish(id);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc e\u0301🙂 complete xyz",
  );
  const result = ai.undo(id);
  assert.equal(result.content, "abc ORIGINAL xyz");
  assert.deepEqual(result.selection, { from: 4, to: 12 });
  assert.equal(store.locks.size, 0);
});
test("Stop/network error retains partial text, releases lock and supports undo", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let id = "";
  const ai = new AI(store, compiler, keys, async (input) => {
    input.onText("partial");
    ai.progress(id, "part", 0);
    throw new Error("network");
  });
  await ai.run(request, (e) => {
    if (e.type === "run") id = e.run.id;
  });
  assert.equal(store.run(id).status, "failed");
  ai.finish(id);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc part xyz",
  );
  assert.equal(ai.undo(id).content, "abc ORIGINAL xyz");
});
test("stale typing progress and Undo never overwrite competing changes", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let id = "";
  const ai = new AI(store, compiler, keys, async () => ({
    text: "x",
    calls: [],
    usage: {},
  }));
  await ai.run(request, (e) => {
    if (e.type === "run") id = e.run.id;
  });
  ai.progress(id, "x", 0);
  assert.throws(() => ai.progress(id, "xy", 0), /changed/);
  ai.stop(id);
  ai.finish(id);
  store.save(request.projectId, "main.tex", "user change", 1);
  assert.throws(() => ai.undo(id), /changed/);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "user change",
  );
});
test("restart retains partial text and marks the run interrupted without requesting generation", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let id = "";
  const ai = new AI(store, compiler, keys, async () => ({
    text: "partial",
    calls: [],
    usage: {},
  }));
  await ai.run(request, (e) => {
    if (e.type === "run") id = e.run.id;
  });
  ai.progress(id, "par", 0);
  ai.release(id);
  const restarted = new Store(store.root);
  assert.equal(restarted.run(id).status, "interrupted");
  assert.equal(
    restarted.readText(request.projectId, "main.tex").content,
    "abc par xyz",
  );
  assert.equal(restarted.locks.size, 0);
  restarted.close();
});
test("Review Edits reads another file and proposes a revision-bound multi-file patch", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let calls = 0;
  const ai = new AI(store, compiler, keys, async (input: ProviderInput) => {
    calls++;
    if (calls === 1)
      return {
        text: "",
        usage: {},
        calls: [
          { id: "read", name: "read_file", arguments: '{"path":"other.tex"}' },
        ],
      };
    assert.match(JSON.stringify(input.messages), /other/);
    input.onText("Ready for review.");
    return {
      text: "Ready for review.",
      usage: {},
      calls: [
        {
          id: "proposal",
          name: "propose_edits",
          arguments: JSON.stringify({
            summary: "Revise two files",
            files: [
              { path: "main.tex", content: "new main" },
              { path: "other.tex", content: "new other" },
            ],
          }),
        },
      ],
    };
  });
  await ai.run({ ...request, mode: "review" }, () => {});
  const proposal = store.proposals(request.projectId)[0];
  assert.equal(proposal.files.length, 2);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc ORIGINAL xyz",
  );
  store.applyProposal(proposal.id);
  assert.equal(
    store.readText(request.projectId, "other.tex").content,
    "new other",
  );
  store.applyProposal(proposal.id, true);
  assert.equal(store.readText(request.projectId, "other.tex").content, "other");
});
test("unverified automatic routing fails before making any paid request", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let calls = 0;
  const ai = new AI(store, compiler, keys, async () => {
    calls++;
    return { text: "", calls: [], usage: {} };
  });
  assert.equal(ai.quote(request).model, null);
  await assert.rejects(
    ai.run({ ...request, explicitModel: false }, () => {}),
    /unverified/,
  );
  assert.equal(calls, 0);
});

test("abandoned typing lease cancels the run and releases the file", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { store, compiler, keys, request } = setup(t);
  let id = "";
  const ai = new AI(store, compiler, keys, async () => ({
    text: "buffered",
    calls: [],
    usage: {},
  }));
  await ai.run(request, (event) => {
    if (event.type === "run") id = event.run.id;
  });
  ai.progress(id, "buf", 0);
  t.mock.timers.tick(45001);
  assert.equal(store.run(id).status, "interrupted");
  assert.equal(store.locks.size, 0);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc buf xyz",
  );
});
