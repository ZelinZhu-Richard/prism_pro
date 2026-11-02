import test from "node:test";
import assert from "node:assert/strict";
import {
  DiagnosticActionController,
  diagnosticPrompt,
  type DiagnosticContext,
  type DiagnosticFix,
  type DiagnosticOpened,
} from "../src/diagnostic-actions";
import { DRAFT_LIMIT } from "../shared/chat-drafts";

const request: DiagnosticFix = {
  projectId: "project",
  buildId: "build",
  target: "sections/paragraph.tex",
  line: 2,
  diagnostic: {
    severity: "error",
    path: "sections/paragraph.tex",
    line: 2,
    message: "Undefined control sequence: \\unknown 👩🏽‍💻 e\u0301",
  },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((r) => setImmediate(r));
function fixture(prompt = "") {
  const state = {
    context: {
      projectId: "project",
      conversationId: "existing-chat",
      scope: "document",
      mode: "manual",
      prompt,
      navigation: 3,
      path: "main.tex",
      content: "Original source.\n",
      locked: false,
      ready: true,
    } as DiagnosticContext,
    opened: [] as DiagnosticFix[],
    commits: [] as { request: DiagnosticFix; prompt: string }[],
    flushes: 0,
    flush: async () => {},
    open: async (): Promise<DiagnosticOpened> => ({
      path: request.target,
      valid: () => true,
    }),
    notices: 0,
  };
  const controller = new DiagnosticActionController({
    context: () => state.context,
    flush: async () => {
      state.flushes++;
      await state.flush();
    },
    open: async (req, initial, current) => {
      assert.equal(initial.path, "main.tex");
      assert.equal(initial.navigation, 3);
      assert.equal(current(), true);
      state.opened.push(req);
      return state.open();
    },
    commit: (req, text) => {
      state.commits.push({ request: req, prompt: text });
      state.context.prompt = text;
    },
    notify: () => state.notices++,
  });
  return { state, controller };
}
test("empty draft opens the named nested source before preparing; scope and chat remain unchanged", async () => {
  const { state, controller } = fixture();
  const pending = deferred<DiagnosticOpened>();
  state.open = () => pending.promise;
  controller.begin(request);
  await tick();
  assert.equal(controller.view.phase, "preparing");
  assert.equal(state.commits.length, 0);
  assert.deepEqual(state.opened, [request]);
  pending.resolve({ path: request.target, valid: () => true });
  await tick();
  assert.equal(state.commits[0].prompt, diagnosticPrompt(request));
  assert.equal(state.context.scope, "document");
  assert.equal(state.context.conversationId, "existing-chat");
  assert.equal(controller.view.phase, "idle");
});
test("a literal Unicode draft is reviewed without mutation; Keep dismisses without opening", () => {
  const text = "  留下 α 👩🏽‍💻 e\u0301\n\\cite{one}\t ";
  const { state, controller } = fixture(text);
  controller.begin(request);
  assert.equal(controller.view.existing, text);
  assert.equal(controller.view.proposed, diagnosticPrompt(request));
  assert.equal(controller.view.phase, "review");
  assert.equal(state.flushes, 0);
  assert.deepEqual(state.opened, []);
  controller.cancel();
  assert.equal(state.context.prompt, text);
  assert.deepEqual(state.commits, []);
});
for (const choice of ["append", "replace"] as const)
  test(`${choice} is exact and opens the source only after the explicit choice`, async () => {
    const text = "  Original\nα👩🏽‍💻  ";
    const { state, controller } = fixture(text);
    state.context.scope = "project";
    controller.begin(request);
    await controller.choose(choice);
    assert.equal(state.commits.length, 1);
    assert.equal(
      state.commits[0].prompt,
      choice === "append"
        ? text + "\n\n" + diagnosticPrompt(request)
        : diagnosticPrompt(request),
    );
    assert.equal(state.context.scope, "project");
  });
test("whitespace drafts require review and an identical prepared draft is not duplicated", async () => {
  const first = fixture(" \n\t");
  first.controller.begin(request);
  assert.equal(first.controller.view.phase, "review");
  const second = fixture(diagnosticPrompt(request));
  second.controller.begin(request);
  await tick();
  assert.equal(second.state.commits.length, 1);
  assert.equal(second.state.commits[0].prompt, diagnosticPrompt(request));
});
test("append over the draft limit fails without truncation, and Replace can recover", async () => {
  const text = "x".repeat(DRAFT_LIMIT);
  const { state, controller } = fixture(text);
  controller.begin(request);
  await controller.choose("append");
  assert.equal(controller.view.phase, "error");
  assert.match(controller.view.error!, /16,000/);
  assert.equal(controller.view.existing, text);
  assert.equal(state.context.prompt, text);
  assert.equal(state.opened.length, 0);
  controller.retry();
  await controller.choose("replace");
  assert.equal(state.commits[0].prompt, diagnosticPrompt(request));
});
test("oversized diagnostic requests fail without truncation or source navigation", async () => {
  const { state, controller } = fixture();
  controller.begin({
    ...request,
    diagnostic: { ...request.diagnostic, message: "x".repeat(DRAFT_LIMIT) },
  });
  await tick();
  assert.equal(controller.view.phase, "error");
  assert.equal(state.context.prompt, "");
  assert.equal(state.opened.length, 0);
});
test("failed draft persistence leaves exact text, and retry uses the current draft", async () => {
  const { state, controller } = fixture("Original");
  state.flush = async () => {
    throw Error("Draft could not be saved.");
  };
  controller.begin(request);
  await controller.choose("replace");
  assert.match(controller.view.error!, /could not be saved/);
  assert.equal(state.context.prompt, "Original");
  assert.equal(state.opened.length, 0);
  state.context.prompt = "Edited draft";
  state.flush = async () => {};
  controller.retry();
  assert.equal(controller.view.existing, "Edited draft");
  await controller.choose("append");
  assert.equal(
    state.commits[0].prompt,
    "Edited draft\n\n" + diagnosticPrompt(request),
  );
});
for (const error of [
  "Save failed",
  "Source was removed or renamed",
  "The target file changed",
  "Source is read-only",
])
  test(`${error} during source preparation retains the draft and offers recovery`, async () => {
    const { state, controller } = fixture("Unsent");
    state.open = async () => {
      throw Error(error);
    };
    controller.begin(request);
    await controller.choose("replace");
    assert.equal(controller.view.phase, "error");
    assert.equal(controller.view.error, error);
    assert.equal(state.context.prompt, "Unsent");
    assert.deepEqual(state.commits, []);
  });
for (const [name, mutate] of Object.entries({
  navigation: (c: DiagnosticContext): void => {
    c.navigation++;
  },
  file: (c: DiagnosticContext): void => {
    c.path = "other.tex";
  },
  source: (c: DiagnosticContext): void => {
    c.content += "New edit";
  },
  prompt: (c: DiagnosticContext): void => {
    c.prompt = "A newer prompt";
  },
  scope: (c: DiagnosticContext): void => {
    c.scope = "project";
  },
  mode: (c: DiagnosticContext): void => {
    c.mode = "review";
  },
  lock: (c: DiagnosticContext): void => {
    c.locked = true;
  },
  loading: (c: DiagnosticContext): void => {
    c.ready = false;
  },
}))
  test(`changed ${name} while draft persistence is pending rejects stale preparation`, async () => {
    const { state, controller } = fixture();
    const pending = deferred<void>();
    state.flush = () => pending.promise;
    controller.begin(request);
    mutate(state.context);
    pending.resolve();
    await tick();
    assert.equal(controller.view.phase, "error");
    assert.deepEqual(state.opened, []);
    assert.deepEqual(state.commits, []);
  });
for (const field of ["projectId", "conversationId"] as const)
  test(`changed ${field} discards the stale action without writing into the new conversation`, async () => {
    const { state, controller } = fixture();
    const pending = deferred<DiagnosticOpened>();
    state.open = () => pending.promise;
    controller.begin(request);
    await tick();
    state.context[field] = "other";
    controller.dismissOtherConversation();
    pending.resolve({ path: request.target, valid: () => true });
    await tick();
    assert.equal(controller.view.phase, "idle");
    assert.deepEqual(state.commits, []);
  });
test("a changed draft between review and choice cannot be overwritten", async () => {
  const { state, controller } = fixture("Old");
  controller.begin(request);
  state.context.prompt = "New";
  await controller.choose("replace");
  assert.equal(controller.view.phase, "error");
  assert.equal(state.context.prompt, "New");
  assert.equal(state.flushes, 0);
});
for (const changed of [
  "wrong path",
  "invalid source",
  "changed scope",
  "new lock",
])
  test(`${changed} after opening cannot commit a prepared request`, async () => {
    const { state, controller } = fixture();
    state.open = async () => {
      if (changed === "changed scope") state.context.scope = "project";
      if (changed === "new lock") state.context.locked = true;
      return {
        path: changed === "wrong path" ? "main.tex" : request.target,
        valid: () => changed !== "invalid source",
      };
    };
    controller.begin(request);
    await tick();
    assert.equal(controller.view.phase, "error");
    assert.deepEqual(state.commits, []);
  });
test("duplicate clicks are coalesced; cancel and dispose ignore late source results", async () => {
  for (const cancel of ["cancel", "dispose"] as const) {
    const { state, controller } = fixture();
    const pending = deferred<DiagnosticOpened>();
    state.open = () => pending.promise;
    controller.begin(request);
    controller.begin(request);
    await controller.choose("replace");
    await tick();
    assert.equal(state.flushes, 1);
    assert.equal(state.opened.length, 1);
    controller[cancel]();
    const notices = state.notices;
    pending.resolve({ path: request.target, valid: () => true });
    await tick();
    assert.deepEqual(state.commits, []);
    assert.equal(state.notices, notices);
  }
});
test("a locked or loading editor cannot start an action", async () => {
  for (const field of ["locked", "ready"] as const) {
    const { state, controller } = fixture();
    state.context[field] = field === "locked";
    controller.begin(request);
    await tick();
    assert.equal(controller.view.phase, "idle");
    assert.equal(state.flushes, 0);
  }
});
