import { EditorState, type Transaction } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import {
  sourceEditTransaction,
  readOnlyTransactions,
} from "../src/editor-transactions";
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkedFormatEdit,
  FormatPreview,
  type FormatTarget,
} from "../src/format-preview";
import type { FormatJob } from "../shared/formatting";
const target: FormatTarget = {
  projectId: "p",
  path: "main.tex",
  revision: 2,
  content: "Exact α source",
  from: 0,
  to: 5,
};
const result = (
  id: string,
  status: FormatJob["status"] = "succeeded",
): FormatJob => ({
  id,
  projectId: "p",
  path: "main.tex",
  revision: 2,
  sourceHash: "hash",
  created: "now",
  status,
  runtime: {
    id: "system",
    label: "test",
    binDir: "/test",
    texRoot: "/test",
    version: "test",
    fingerprint: "test",
  },
  tool: "/test/latexindent",
  text: status === "succeeded" ? "  Exact α source" : undefined,
  log: "",
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture(
  overrides: Partial<ConstructorParameters<typeof FormatPreview>[0]> = {},
) {
  let n = 0;
  const canceled: string[] = [],
    views: any[] = [];
  const controller = new FormatPreview({
    id: () => "request-" + ++n,
    create: async (id) => result(id),
    read: async (id) => result(id),
    cancel: async (id) => {
      canceled.push(id);
      return { id, status: "cancelled" };
    },
    notify: (v) => views.push(v),
    ...overrides,
  });
  return { controller, canceled, views };
}
test("one explicit preview preserves its target and waits for terminal result", async () => {
  let captured: FormatTarget | undefined;
  const s = fixture({
    create: async (id, t) => {
      captured = t;
      return result(id);
    },
  });
  await s.controller.start(target);
  assert.equal(captured, target);
  assert.equal(s.controller.view.phase, "finished");
  assert.equal(s.controller.view.job?.text, "  Exact α source");
  assert.deepEqual(s.canceled, []);
  s.controller.dispose();
  assert.deepEqual(s.canceled, []);
});
test("Stop before a creation response retires the known identifier and ignores its late completion", async () => {
  const created = deferred<FormatJob>(),
    s = fixture({ create: () => created.promise });
  const started = s.controller.start(target);
  assert.equal(s.controller.view.phase, "starting");
  await s.controller.stop();
  assert.equal(s.controller.view.phase, "finished");
  assert.deepEqual(s.canceled, ["request-1"]);
  created.resolve(result("request-1"));
  await started;
  assert.notEqual(s.controller.view.job?.status, "succeeded");
  s.controller.dispose();
});
test("lost create response blocks another generation until Stop is confirmed", async () => {
  let calls = 0;
  const s = fixture({
    create: async () => {
      calls++;
      throw Error("Lost response");
    },
  });
  await s.controller.start(target);
  assert.equal(s.controller.view.phase, "uncertain");
  await s.controller.start(target);
  assert.equal(calls, 1);
  await s.controller.stop();
  await s.controller.start(target);
  assert.equal(calls, 2);
  s.controller.dispose();
});
test("a result from an older request cannot replace a later preview", async () => {
  const old = deferred<FormatJob>(),
    s = fixture({
      create: async (id) => (id === "request-1" ? old.promise : result(id)),
    });
  const first = s.controller.start(target);
  await s.controller.stop();
  await s.controller.start({ ...target, content: "New exact source" });
  old.resolve(result("request-1"));
  await first;
  assert.equal(s.controller.view.requestId, "request-2");
  assert.equal(s.controller.view.job?.id, "request-2");
  s.controller.dispose();
});
test("cancellation remains pending until the worker reports actual terminal state", async () => {
  let reads = 0;
  const s = fixture({
    create: async (id) => result(id, "running"),
    cancel: async (id) => ({ id, status: "running", cancelRequested: true }),
    read: async (id) => result(id, ++reads > 1 ? "cancelled" : "running"),
  });
  await s.controller.start(target);
  await s.controller.stop();
  assert.equal(s.controller.view.phase, "stopping");
  await s.controller.refresh();
  assert.equal(s.controller.view.phase, "finished");
  assert.equal(s.controller.view.job?.status, "cancelled");
  s.controller.dispose();
});
test("closed preview cancels an unacknowledged request and never publishes a late result", async () => {
  const pending = deferred<FormatJob>(),
    s = fixture({ create: () => pending.promise });
  const request = s.controller.start(target),
    count = s.views.length;
  s.controller.dispose();
  assert.deepEqual(s.canceled, ["request-1"]);
  pending.resolve(result("request-1"));
  await request;
  assert.equal(s.views.length, count);
});
test("a late polling failure cannot revive a request after Stop was confirmed", async () => {
  const pending = deferred<FormatJob>(),
    s = fixture({
      create: async (id) => result(id, "running"),
      read: () => pending.promise,
    });
  await s.controller.start(target);
  const read = s.controller.refresh();
  await s.controller.stop();
  pending.reject(Error("Old polling failure"));
  await read;
  assert.equal(s.controller.view.phase, "finished");
  assert.equal(s.controller.view.error, undefined);
  s.controller.dispose();
});

test("format Apply is one undoable edit and rejects stale or locked source before changing it", () => {
  const original = "\\newcommand{\\custom}[1]{#1}\nExact Café 新文本 👩🏽‍💻 é.\n",
    target = {
      projectId: "p",
      path: "main.tex",
      revision: 2,
      content: original,
      from: 6,
      to: 14,
    },
    job = {
      ...result("format-id"),
      text: original.replace("Exact", "  Exact"),
    };
  const live = {
    projectId: "p",
    path: "main.tex",
    revision: 2,
    content: original,
    locked: false,
  };
  for (const change of [
    { projectId: "other" },
    { path: "other.tex" },
    { revision: 3 },
    { content: original + "new" },
    { locked: true },
  ])
    assert.throws(
      () => checkedFormatEdit(target, job, { ...live, ...change }),
      /source|read-only/,
    );
  let state = EditorState.create({
    doc: original,
    selection: { anchor: 6, head: 14 },
    extensions: [history(), readOnlyTransactions],
  });
  state = state.update(
    sourceEditTransaction(checkedFormatEdit(target, job, live)),
  ).state;
  const editor = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
  assert.equal(state.doc.toString(), job.text);
  assert.equal(undo(editor), true);
  assert.equal(state.doc.toString(), original);
  assert.equal(state.selection.main.from, 6);
  assert.equal(state.selection.main.to, 14);
  assert.equal(redo(editor), true);
  assert.equal(state.doc.toString(), job.text);
});
