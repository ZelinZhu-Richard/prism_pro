import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys, type ProviderInput } from "../server/providers";
import type { AiEvent, AiRequest } from "../shared/types";
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
    scope: "project",
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
const insertion = (text: string, replace: string | null = "") => ({
  text: "",
  usage: {},
  calls: [
    {
      id: "type",
      name: "type_text",
      arguments: JSON.stringify({ text, replace }),
    },
  ],
});
test("inspection-limit notices persist across restart and remain in the same conversation", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let calls = 0;
  const events: AiEvent[] = [];
  const ai = new AI(store, compiler, keys, async (input) => {
    if (++calls === 1) input.onText("Inspecting the fixture.");
    return {
      text: "",
      usage: {},
      calls: [{ id: `list-${calls}`, name: "list_files", arguments: "{}" }],
    };
  });
  const id = await ai.run({ ...request, mode: "review" }, (event) =>
    events.push(event),
  );
  assert.equal(calls, 8);
  const original = store.run(id),
    conversation = original.conversationId;
  assert.match(
    original.text,
    /Inspecting the fixture\.\nReached the project inspection limit/,
  );
  assert.equal(
    events
      .filter(
        (event): event is Extract<AiEvent, { type: "text" }> =>
          event.type === "text",
      )
      .map((event) => event.text)
      .join(""),
    original.text,
  );
  store.close();
  const restarted = new Store(store.root);
  // The shared setup owns cleanup; give it the live connection after restart.
  store.db = restarted.db;
  assert.equal(restarted.run(id).text, original.text);
  const next = new AI(
    restarted,
    new Compiler(restarted),
    keys,
    async (input) => {
      assert.ok(
        input.messages.some((message) =>
          message.content.includes("Reached the project inspection limit"),
        ),
      );
      input.onText("A narrower follow-up.");
      return { text: "A narrower follow-up.", usage: {}, calls: [] };
    },
  );
  const followup = await next.run(
    {
      ...request,
      mode: "review",
      conversationId: conversation,
      prompt: "Continue with the main file only.",
    },
    () => {},
  );
  assert.equal(restarted.run(followup).conversationId, conversation);
  assert.equal(restarted.readText(request.projectId, "main.tex").revision, 0);
});
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
      } else {
        assert.ok(input.tools?.some((t) => t.name === "type_text"));
        return insertion("A fragment α");
      }
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
    assert.ok(input.tools?.some((t) => t.name === "type_text"));
    input.onText("e");
    input.onText("\u0301🙂 complete");
    return insertion("e\u0301🙂 complete");
  });
  await ai.run(request, (event) => {
    if (event.type === "run") {
      id = event.run.id;
      assert.throws(
        () => store.save(request.projectId, "main.tex", "competing", 0),
        /reserved/,
      );
      assert.throws(() => compiler.start(request.projectId), /reserved/);
    } else if (event.type === "typing") ai.progress(id, "e\u0301", 0);
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
  assert.equal(store.projectLocks.size, 0);
});
test("Stop retains only visible document text and supports undo", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  const ai = new AI(store, compiler, keys, async () => insertion("partial"));
  const id = await ai.run(request, () => {});
  ai.progress(id, "part", 0);
  ai.stop(id);
  ai.finish(id);
  assert.equal(store.run(id).status, "stopped");
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc part xyz",
  );
  assert.equal(ai.undo(id).content, "abc ORIGINAL xyz");
  assert.equal(store.projectLocks.size, 0);
});
test("network failure while generating keeps chat text out of the document", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  const ai = new AI(store, compiler, keys, async (input) => {
    input.onText("Let me check the bibliography.");
    throw new Error("network");
  });
  const events: AiEvent[] = [];
  const id = await ai.run(request, (e) => events.push(e));
  assert.equal(store.run(id).status, "failed");
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc ORIGINAL xyz",
  );
  assert.equal(events.filter((e) => e.type === "typing").length, 0);
  assert.equal(store.locks.size, 0);
  assert.equal(store.projectLocks.size, 0);
});
test("stale typing progress and Undo never overwrite competing changes", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let id = "";
  const ai = new AI(store, compiler, keys, async () => insertion("xy"));
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
  const ai = new AI(store, compiler, keys, async () => insertion("partial"));
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
  assert.equal(restarted.projectLocks.size, 0);
  restarted.close();
});
for (const mode of ["manual", "review"] as const) {
  test(`${mode} keeps the entire project readable and rejects competing writes until the run ends`, async (t) => {
    const { store, compiler, keys, request } = setup(t);
    const checkpoint = store.checkpoint(request.projectId, "Before run");
    let resolveProvider!: () => void;
    const waiting = new Promise<void>((resolve) => {
      resolveProvider = resolve;
    });
    const ai = new AI(store, compiler, keys, async () => {
      await waiting;
      return mode === "manual"
        ? insertion("replacement")
        : { text: "Reviewed.", calls: [], usage: {} };
    });
    let id = "";
    const run = ai.run({ ...request, mode }, (e) => {
      if (e.type === "run") id = e.run.id;
    });
    assert.equal(store.projectLocks.get(request.projectId), id);
    assert.equal(
      store.readText(request.projectId, "other.tex").content,
      "other",
    );
    assert.equal(store.project(request.projectId).files.length, 2);
    for (const mutate of [
      () => store.save(request.projectId, "other.tex", "overwrite", 0),
      () => store.add(request.projectId, "new.tex", Buffer.from("new")),
      () => store.rename(request.projectId, "other.tex", "renamed.tex"),
      () => store.trash(request.projectId, "other.tex"),
      () => store.update(request.projectId, { name: "changed" }),
      () => store.restoreCheckpoint(request.projectId, checkpoint.id),
      () => store.trashProject(request.projectId),
    ])
      assert.throws(mutate, /reserved by an active AI run/);
    await assert.rejects(
      ai.run({ ...request, mode }, () => {}),
      /reserved/,
    );
    resolveProvider();
    await run;
    if (mode === "manual") {
      assert.equal(store.projectLocks.get(request.projectId), id);
      ai.progress(id, "replacement", 0);
      assert.equal(
        store.readText(request.projectId, "main.tex").content,
        "abc replacement xyz",
      );
      ai.finish(id);
    }
    assert.equal(store.projectLocks.size, 0);
    assert.equal(
      store.save(request.projectId, "other.tex", "editable again", 0).content,
      "editable again",
    );
  });
}
test("stopping Review Edits releases the project after generation acknowledges cancellation", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  const ai = new AI(store, compiler, keys, async ({ signal }) => {
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Stopped", "AbortError")),
        { once: true },
      );
    });
    return { text: "", calls: [], usage: {} };
  });
  let id = "";
  const running = ai.run({ ...request, mode: "review" }, (e) => {
    if (e.type === "run") id = e.run.id;
  });
  ai.stop(id);
  await running;
  assert.equal(store.run(id).status, "stopped");
  assert.equal(store.projectLocks.size, 0);
  store.save(request.projectId, "other.tex", "editable after Stop", 0);
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
  const ai = new AI(store, compiler, keys, async () => insertion("buffered"));
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

test("Manual Type clarification is chat-only, creates no edit, and releases its file", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  const reply = "Please select Whole Project so I can inspect main.bbl.";
  const ai = new AI(store, compiler, keys, async (input) => {
    for (const chunk of [reply.slice(0, 9), reply.slice(9)])
      input.onText(chunk);
    return { text: reply, calls: [], usage: {} };
  });
  const events: AiEvent[] = [];
  const id = await ai.run(request, (e) => events.push(e));
  assert.equal(store.run(id).text, reply);
  assert.equal(store.run(id).status, "completed");
  assert.equal(store.readText(request.projectId, "main.tex").revision, 0);
  assert.equal(
    events.some((e) => e.type === "typing"),
    false,
  );
  assert.equal(store.locks.size, 0);
  assert.throws(() => ai.undo(id), /cannot be undone/);
});

test("Whole Project Manual Type reads a bibliography and emits only validated source to the editor", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  store.add(
    request.projectId,
    "main.bbl",
    Buffer.from("\\bibitem{sample} Synthetic citation."),
  );
  let count = 0;
  const ai = new AI(store, compiler, keys, async (input) => {
    count++;
    if (count === 1) {
      assert.match(input.messages[0].content, /main.bbl/);
      input.onText("I’ll read the bibliography. ");
      return {
        text: "I’ll read the bibliography. ",
        usage: {},
        calls: [
          { id: "read", name: "read_file", arguments: '{"path":"main.bbl"}' },
        ],
      };
    }
    assert.match(JSON.stringify(input.messages), /Synthetic citation/);
    input.onText("The replacement is ready.");
    return insertion(
      "\\begin{thebibliography}{1}\n\\bibitem{sample} Synthetic citation.\n\\end{thebibliography}",
      "ORIGINAL",
    );
  });
  const events: AiEvent[] = [];
  const id = await ai.run({ ...request, from: 0, to: 0 }, (e) =>
    events.push(e),
  );
  const edit = events.find((e) => e.type === "typing")!;
  assert.equal(edit.type, "typing");
  if (edit.type !== "typing") return;
  assert.equal(edit.from, 4);
  assert.equal(edit.to, 12);
  assert.ok(!edit.text.includes("replacement is ready"));
  assert.deepEqual(store.run(id).contextFiles, ["main.tex", "main.bbl"]);
  ai.progress(id, edit.text, 0);
  ai.finish(id);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc " + edit.text + " xyz",
  );
  assert.equal(
    store.run(id).text,
    "I’ll read the bibliography. The replacement is ready.",
  );
  assert.deepEqual(ai.undo(id).selection, { from: 0, to: 0 });
  assert.equal(count, 2); // Inspection + one edit; never one request per character.
});

for (const mode of ["manual", "review"] as const) {
  test(`${mode}: Document scope confines file listings, reads, searches, diagnostics, and proposals`, async (t) => {
    const { store, compiler, keys, request } = setup(t);
    compiler.list = () =>
      [
        {
          diagnostics: [
            { path: "main.tex", severity: "error", message: "current error" },
            {
              path: "other.tex",
              severity: "error",
              message: "private other error",
            },
          ],
        },
      ] as any;
    let count = 0;
    const ai = new AI(store, compiler, keys, async (input) => {
      count++;
      if (count === 1) {
        assert.ok(!input.messages[0].content.includes("other.tex"));
        return {
          text: "",
          usage: {},
          calls: [
            { id: "list", name: "list_files", arguments: "{}" },
            {
              id: "read",
              name: "read_file",
              arguments: '{"path":"other.tex"}',
            },
            {
              id: "search",
              name: "search_project",
              arguments: '{"query":"other"}',
            },
            { id: "logs", name: "compile_diagnostics", arguments: "{}" },
            {
              id: "edit",
              name: "propose_edits",
              arguments:
                '{"summary":"not allowed","files":[{"path":"other.tex","content":"changed"}]}',
            },
          ],
        };
      }
      const outputs = input.messages.filter((m) => m.role === "tool");
      assert.ok(
        !outputs
          .find((m) => m.callId === "list")!
          .content.includes("other.tex"),
      );
      assert.match(
        outputs.find((m) => m.callId === "read")!.content,
        /Document scope/,
      );
      assert.equal(outputs.find((m) => m.callId === "search")!.content, "[]");
      assert.ok(
        !outputs
          .find((m) => m.callId === "logs")!
          .content.includes("private other"),
      );
      assert.match(outputs.find((m) => m.callId === "edit")!.content, /error/);
      return { text: "", calls: [], usage: {} };
    });
    const id = await ai.run({ ...request, scope: "document", mode }, () => {});
    assert.deepEqual(store.run(id).contextFiles, ["main.tex"]);
    assert.equal(store.proposals(request.projectId).length, 0);
    assert.equal(
      store.readText(request.projectId, "other.tex").content,
      "other",
    );
  });
}

test("ambiguous typing replacements are rejected without writing, and deletion supports exact Undo", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  let count = 0;
  const ai = new AI(store, compiler, keys, async (input) => {
    count++;
    if (count === 1) return insertion("new", "missing");
    assert.match(input.messages.at(-1)!.content, /match exactly once/);
    return insertion("", "ORIGINAL");
  });
  const id = await ai.run(request, () => {});
  assert.throws(() => ai.progress(id, "explanation", 0), /must match/);
  ai.progress(id, "", 0);
  ai.finish(id);
  assert.equal(
    store.readText(request.projectId, "main.tex").content,
    "abc  xyz",
  );
  assert.equal(ai.undo(id).content, "abc ORIGINAL xyz");
});

test("Manual Type does not accept proposals, and Review Edits does not accept direct typing", async (t) => {
  const { store, compiler, keys, request } = setup(t);
  for (const mode of ["review", "manual"] as const) {
    let count = 0;
    const ai = new AI(store, compiler, keys, async (input) => {
      if (++count === 1)
        return {
          text: "",
          usage: {},
          calls: [
            mode === "review"
              ? insertion("wrong").calls[0]
              : {
                  id: "wrong",
                  name: "propose_edits",
                  arguments:
                    '{"summary":"wrong","files":[{"path":"main.tex","content":"wrong"}]}',
                },
          ],
        };
      assert.match(input.messages.at(-1)!.content, /unavailable/);
      return { text: "", usage: {}, calls: [] };
    });
    await ai.run({ ...request, mode }, () => {});
    assert.equal(store.proposals(request.projectId).length, 0);
    assert.equal(store.readText(request.projectId, "main.tex").revision, 0);
  }
});
