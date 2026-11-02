import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditorState, Transaction } from "@codemirror/state";
import {
  history,
  historyField,
  isolateHistory,
  undo,
  redo,
  undoDepth,
  redoDepth,
} from "@codemirror/commands";
import {
  latestTypingUndo,
  typingUndoHistory,
  TypingUndoRecovery,
  type TypingUndoPorts,
  type TypingUndoResult,
  type TypingUndoRun,
} from "../src/typing-undo";
import { Store } from "../server/store";
import { AI } from "../server/ai";
import { Compiler } from "../server/compiler";
import { Keys } from "../server/providers";
import { Chats } from "../server/chats";
import { createApp } from "../server/app";
import type { FileInfo, TextFile } from "../shared/types";

const original = "Earlier edit.\nSelected α👩🏽‍💻 passage.\nEnding.\n";
const from = original.indexOf("Selected"),
  to = original.indexOf("\nEnding");
const inserted = "A changed e\u0301 and 中文 paragraph.\nA second line.";
const partial = original.slice(0, from) + inserted + original.slice(to);
const before: TextFile = {
  path: "chapters/target.tex",
  content: partial,
  revision: 3,
};
const restored: TypingUndoResult = {
  ...before,
  content: original,
  revision: 4,
  selection: { from, to },
  projectGeneration: 8,
};
const run: TypingUndoRun = {
  id: "run-1",
  projectId: "project-1",
  path: before.path,
  mode: "manual",
  status: "stopped",
  from,
  to,
  visible: inserted,
  lastRevision: before.revision,
  created: "2026-11-01T00:00:00.000Z",
};
const files: FileInfo[] = [
  {
    path: before.path,
    kind: "text",
    revision: 3,
    size: partial.length,
    deleted: false,
  },
  { path: "notes.tex", kind: "text", revision: 2, size: 10, deleted: false },
];
function load(snapshot: ReturnType<EditorState["toJSON"]>) {
  return EditorState.fromJSON(
    snapshot,
    { extensions: history() },
    { history: historyField },
  );
}
function command(state: EditorState, action: typeof undo) {
  let next = state;
  const changed = action({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return { changed, state: next };
}
function nativeHistory() {
  let state = EditorState.create({
    doc: original.replace("Earlier edit.", "Before ordinary edit."),
    extensions: history(),
  });
  state = state.update({
    changes: {
      from: 0,
      to: "Before ordinary edit.".length,
      insert: "Earlier edit.",
    },
    annotations: isolateHistory.of("full"),
  }).state;
  state = state.update({
    selection: { anchor: from, head: to },
    annotations: Transaction.addToHistory.of(false),
  }).state;
  state = state.update({
    changes: { from, to, insert: inserted },
    annotations: [
      Transaction.userEvent.of("input.type.ai"),
      isolateHistory.of("full"),
    ],
  }).state;
  return state.toJSON({ history: historyField });
}
test("project-wide typing Undo survives inspecting and editing a different file", () => {
  assert.equal(
    latestTypingUndo([run], files, run.projectId, {
      file: { path: "notes.tex", revision: 2 },
      dirty: true,
    })?.id,
    run.id,
  );
  assert.equal(
    latestTypingUndo([run], files, run.projectId, {
      file: before,
      dirty: true,
    }),
    undefined,
  );
  assert.equal(
    latestTypingUndo([run], files, run.projectId, {
      file: { ...before, revision: 4 },
      dirty: false,
    }),
    undefined,
  );
  for (const change of [
    { projectId: "other" },
    { mode: "review" },
    { status: "typing" },
    { status: "undone" },
    { lastRevision: 1 },
    { lastRevision: undefined },
    { visible: undefined },
    { path: "missing.tex" },
  ])
    assert.equal(
      latestTypingUndo(
        [{ ...run, ...change } as TypingUndoRun],
        files,
        run.projectId,
      ),
      undefined,
    );
  assert.equal(
    latestTypingUndo(
      [run],
      files.map((f) => ({ ...f, deleted: true })),
      run.projectId,
    ),
    undefined,
  );
  for (const status of [
    "completed",
    "stopped",
    "failed",
    "interrupted",
  ] as const)
    assert.equal(
      latestTypingUndo([{ ...run, status }], files, run.projectId)?.status,
      status,
    );
  assert.equal(
    latestTypingUndo(
      [{ ...run, from: 0, to: 0, visible: "" }],
      files,
      run.projectId,
    ),
    undefined,
  );
  assert.ok(
    latestTypingUndo([{ ...run, visible: "" }], files, run.projectId),
    "a completed selection deletion is reversible",
  );
  const newer = { ...run, id: "newer", created: "2026-11-01T01:00:00.000Z" };
  assert.equal(
    latestTypingUndo([newer, run], files, run.projectId)?.id,
    newer.id,
  );
});
test("native typing Undo restores exact Unicode source and selection while retaining earlier Undo and one Redo", () => {
  const result = typingUndoHistory(before, restored, nativeHistory());
  assert.equal(result.preservedHistory, true);
  let state = load(result.snapshot);
  assert.equal(state.doc.toString(), original);
  assert.deepEqual(
    { from: state.selection.main.from, to: state.selection.main.to },
    { from, to },
  );
  assert.equal(undoDepth(state), 1);
  assert.equal(redoDepth(state), 1);
  state = command(state, redo).state;
  assert.equal(state.doc.toString(), partial);
  state = command(state, undo).state;
  assert.equal(state.doc.toString(), original);
  state = command(state, undo).state;
  assert.equal(
    state.doc.toString(),
    original.replace("Earlier edit.", "Before ordinary edit."),
  );
});
test("restart or unusable cache reconstructs exactly one typing Redo, including an empty replacement", () => {
  for (const cached of [
    undefined,
    { doc: partial, history: { broken: true } },
    { doc: "other" },
  ]) {
    const result = typingUndoHistory(before, restored, cached);
    assert.equal(result.preservedHistory, false);
    let state = load(result.snapshot);
    assert.equal(state.doc.toString(), original);
    assert.equal(undoDepth(state), 0);
    assert.equal(redoDepth(state), 1);
    state = command(state, redo).state;
    assert.equal(state.doc.toString(), partial);
    assert.equal(command(state, undo).state.doc.toString(), original);
  }
  const deleted = {
    ...before,
    content: original.slice(0, from) + original.slice(to),
  };
  assert.equal(
    command(
      load(typingUndoHistory(deleted, restored).snapshot),
      redo,
    ).state.doc.toString(),
    deleted.content,
  );
  assert.equal(
    redoDepth(
      load(
        typingUndoHistory({ ...before, content: original }, restored).snapshot,
      ),
    ),
    0,
  );
  assert.throws(
    () => typingUndoHistory({ ...before, path: "wrong.tex" }, restored),
    /different file/,
  );
  for (const selection of [
    { from: -1, to },
    { from, to: original.length + 1 },
    { from: to, to: from },
    { from: 1.5, to },
  ])
    assert.throws(
      () => typingUndoHistory(before, { ...restored, selection }),
      /selection/,
    );
});
function recoveryFixture() {
  const events: string[] = [],
    state = {
      project: run.projectId,
      target: { ...before },
      inspected: "unsaved notes",
      savedNotes: "old notes",
      applied: undefined as TypingUndoResult | undefined,
      calls: 0,
    };
  const ports: TypingUndoPorts = {
    projectId: () => state.project,
    lock: (value) => {
      events.push("lock:" + value);
    },
    saveInspected: async () => {
      events.push("save:notes.tex");
      state.savedNotes = state.inspected;
    },
    readTarget: async (target) => {
      events.push("read:" + target);
      return { ...state.target };
    },
    snapshotTarget: (target) => {
      events.push("snapshot:" + target);
      return nativeHistory();
    },
    undoRun: async (id) => {
      events.push("undo:" + id);
      state.calls++;
      state.target = { ...restored };
      return { ...restored };
    },
    applyTarget: (file, snapshot) => {
      events.push("apply:" + file.path);
      assert.equal(snapshot.doc, original);
      state.applied = file;
    },
  };
  return { events, state, ports, recovery: new TypingUndoRecovery() };
}
test("cross-file recovery saves inspected edits first, confirms the target, then applies only target source", async () => {
  const f = recoveryFixture();
  assert.equal(await f.recovery.restore(run, f.ports), true);
  assert.deepEqual(f.events, [
    "lock:true",
    "save:notes.tex",
    "read:" + run.path,
    "snapshot:" + run.path,
    "undo:" + run.id,
    "read:" + run.path,
    "apply:" + run.path,
    "lock:false",
  ]);
  assert.equal(f.state.savedNotes, "unsaved notes");
  assert.equal(f.state.inspected, "unsaved notes");
  assert.deepEqual(f.state.applied, restored);
  assert.equal(await f.recovery.restore(run, f.ports), false);
  assert.equal(f.state.calls, 1);
});
test("in-flight duplicate Undo is ignored and cannot unlock the first operation", async () => {
  const f = recoveryFixture();
  let resume!: () => void;
  f.ports.saveInspected = () =>
    new Promise<void>((r) => {
      resume = r;
    });
  const first = f.recovery.restore(run, f.ports);
  assert.equal(await f.recovery.restore(run, f.ports), false);
  assert.equal(f.recovery.working, true);
  assert.deepEqual(f.events, ["lock:true"]);
  resume();
  await first;
  assert.equal(f.state.calls, 1);
  assert.equal(f.events.filter((e) => e === "lock:false").length, 1);
});
test("lost successful Undo response can retry without overwriting later edits or discarding original Redo history", async () => {
  const f = recoveryFixture(),
    normal = f.ports.undoRun;
  f.ports.undoRun = async (id) => {
    await normal(id);
    throw new Error("lost response");
  };
  await assert.rejects(f.recovery.restore(run, f.ports), /lost response/);
  assert.equal(f.state.applied, undefined);
  assert.equal(f.recovery.attempt?.file?.content, partial);
  f.ports.undoRun = async () => ({ ...restored }); // server's idempotent response
  f.ports.applyTarget = (file, snapshot) => {
    f.state.applied = file;
    const recovered = load(snapshot);
    assert.equal(undoDepth(recovered), 1);
    assert.equal(command(recovered, redo).state.doc.toString(), partial);
  };
  assert.equal(await f.recovery.restore(run, f.ports), true);
  assert.equal(f.recovery.attempt, undefined);
  assert.equal(f.state.savedNotes, "unsaved notes");
});
test("save failure, stale revision, wrong project and wrong-file responses never apply target content", async () => {
  const cases = [
    {
      change: (f: ReturnType<typeof recoveryFixture>) => {
        f.ports.saveInspected = async () => {
          throw new Error("save failed");
        };
      },
      error: /save failed/,
    },
    {
      change: (f: ReturnType<typeof recoveryFixture>) => {
        f.state.target.revision++;
      },
      error: /changed after typing/,
    },
    {
      change: (f: ReturnType<typeof recoveryFixture>) => {
        f.state.project = "other";
      },
      error: /project changed/,
    },
    {
      change: (f: ReturnType<typeof recoveryFixture>) => {
        f.state.target.path = "notes.tex";
      },
      error: /unexpected file/,
    },
    {
      change: (f: ReturnType<typeof recoveryFixture>) => {
        f.ports.saveInspected = async () => {
          f.state.project = "other";
        };
      },
      error: /project changed/,
    },
  ];
  for (const scenario of cases) {
    const f = recoveryFixture();
    scenario.change(f);
    await assert.rejects(f.recovery.restore(run, f.ports), scenario.error);
    assert.equal(f.state.calls, 0);
    assert.equal(f.state.applied, undefined);
    assert.equal(f.recovery.working, false);
    assert.equal(
      f.events.includes("lock:false"),
      f.events.includes("lock:true"),
    );
  }
});
test("delayed, legacy and conflicting successful responses keep editor contents intact", async () => {
  for (const kind of ["project", "path", "legacy", "conflict"] as const) {
    const f = recoveryFixture();
    f.ports.undoRun = async () => {
      if (kind === "project") f.state.project = "other";
      if (kind === "conflict")
        f.state.target = {
          ...restored,
          revision: 5,
          content: "later user edit",
        };
      return {
        ...restored,
        ...(kind === "path" ? { path: "notes.tex" } : {}),
        ...(kind === "legacy" ? { projectGeneration: undefined } : {}),
      } as TypingUndoResult;
    };
    await assert.rejects(
      f.recovery.restore(run, f.ports),
      /project changed|unexpected file|older response|target changed/,
    );
    assert.equal(f.state.applied, undefined);
    assert.equal(f.recovery.working, false);
  }
});
function serverFixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-typing-undo-")),
    store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic Undo", [
    { path: before.path, data: Buffer.from(original) },
    { path: "notes.tex", data: Buffer.from("Other file stays exact. 中文\n") },
  ]);
  const c = store.createConversation(p.id, "Typing recovery");
  const typed = store.save(p.id, before.path, partial, 0);
  const value = {
    ...run,
    projectId: p.id,
    conversationId: c.id,
    lastRevision: typed.revision,
    before: original,
    originalSelection: { from, to },
    provider: "openai" as const,
    model: "synthetic",
    prompt: "Synthetic edit",
    text: "Synthetic response",
    contextFiles: [before.path],
  };
  store.saveRun(value);
  const ai = new AI(store, new Compiler(store), new Keys(), async () => {
    throw new Error("Undo must not call a provider");
  });
  return { root, store, p, value, ai };
}
test("server Undo is revision-bound, exact and idempotent across restart without touching other files", (t) => {
  const f = serverFixture(t),
    notes = f.store.readText(f.p.id, "notes.tex"),
    generation = f.store.project(f.p.id).generation;
  const result = f.ai.undo(run.id);
  assert.equal(result.content, original);
  assert.deepEqual(result.selection, { from, to });
  assert.equal(result.projectGeneration, generation + 1);
  assert.deepEqual(f.store.readText(f.p.id, "notes.tex"), notes);
  const versions = f.store.db
    .prepare("SELECT * FROM versions WHERE project=? ORDER BY revision")
    .all(f.p.id);
  assert.deepEqual(f.ai.undo(run.id), result);
  assert.deepEqual(
    f.store.db
      .prepare("SELECT * FROM versions WHERE project=? ORDER BY revision")
      .all(f.p.id),
    versions,
  );
  const second = new Store(f.root);
  try {
    const restarted = new AI(second, new Compiler(second), new Keys());
    assert.deepEqual(restarted.undo(run.id), result);
    second.save(f.p.id, before.path, original + "Later edit", result.revision);
    assert.throws(() => restarted.undo(run.id), /Later edits have been kept/);
    assert.equal(
      second.readText(f.p.id, before.path).content,
      original + "Later edit",
    );
  } finally {
    second.close();
  }
});
test("run metadata failure rolls back the Undo source, versions and generation atomically", (t) => {
  const f = serverFixture(t),
    source = f.store.readText(f.p.id, before.path),
    generation = f.store.project(f.p.id).generation;
  const versions = f.store.db
    .prepare("SELECT * FROM versions WHERE project=?")
    .all(f.p.id);
  const saveRun = f.store.saveRun.bind(f.store);
  f.store.saveRun = () => {
    throw new Error("injected metadata failure");
  };
  assert.throws(() => f.ai.undo(run.id), /metadata failure/);
  assert.deepEqual(f.store.readText(f.p.id, before.path), source);
  assert.equal(f.store.project(f.p.id).generation, generation);
  assert.equal(f.store.run(run.id).status, "stopped");
  assert.deepEqual(
    f.store.db.prepare("SELECT * FROM versions WHERE project=?").all(f.p.id),
    versions,
  );
  f.store.saveRun = saveRun;
  assert.equal(f.ai.undo(run.id).content, original);
});
test("disk failure after committed Undo is repaired by retry without a second source revision", (t) => {
  const f = serverFixture(t),
    materialize = f.store.materializeFile.bind(f.store);
  f.store.materializeFile = () => {
    throw new Error("injected disk failure");
  };
  assert.throws(() => f.ai.undo(run.id), /disk failure/);
  const saved = f.store.readText(f.p.id, before.path),
    generation = f.store.project(f.p.id).generation;
  assert.equal(saved.content, original);
  assert.equal(f.store.run(run.id).status, "undone");
  f.store.materializeFile = materialize;
  const retried = f.ai.undo(run.id);
  assert.equal(retried.revision, saved.revision);
  assert.equal(retried.projectGeneration, generation);
  assert.equal(
    fs.readFileSync(path.join(f.store.projectDir(f.p.id), before.path), "utf8"),
    original,
  );
});
test("stale and invalid-selection Undo fail before mutating source", (t) => {
  const f = serverFixture(t),
    saved = f.store.readText(f.p.id, before.path);
  f.store.saveRun({
    ...f.value,
    originalSelection: { from: 0, to: original.length + 1 },
  });
  assert.throws(() => f.ai.undo(run.id), /selection is invalid/);
  assert.deepEqual(f.store.readText(f.p.id, before.path), saved);
  f.store.saveRun(f.value);
  const later = f.store.save(
    f.p.id,
    before.path,
    partial + "Later",
    saved.revision,
  );
  assert.throws(() => f.ai.undo(run.id), /changed after typing/);
  assert.deepEqual(f.store.readText(f.p.id, before.path), later);
});
test("local HTTP Undo returns generation and selection; retries and origin rejection preserve source", async (t) => {
  const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prism-typing-undo-http-"),
    ),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("HTTP Undo", [
      { path: before.path, data: Buffer.from(partial) },
    ]),
    c = env.store.createConversation(p.id, "HTTP recovery");
  env.store.saveRun({
    ...run,
    projectId: p.id,
    lastRevision: 0,
    conversationId: c.id,
    before: original,
    provider: "openai",
    model: "synthetic",
    text: "",
    prompt: "Synthetic edit",
    contextFiles: [before.path],
  });
  const request = {
    method: "POST" as const,
    url: "/api/ai/runs/" + run.id + "/undo",
    headers: {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      "x-prism-request": "1",
    },
    payload: {},
  };
  const denied = await env.app.inject({
    ...request,
    headers: { ...request.headers, origin: "https://example.com" },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(env.store.readText(p.id, before.path).content, partial);
  const response = await env.app.inject(request);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().selection, { from, to });
  assert.equal(response.json().content, original);
  assert.equal(
    response.json().projectGeneration,
    env.store.project(p.id).generation,
  );
  const retry = await env.app.inject(request);
  assert.deepEqual(retry.json(), response.json());
});

test("real lightweight chat summaries retain insertion-only Undo after restart and reconstruct the Unicode Redo caret", async (t) => {
  const f = serverFixture(t),
    at = original.indexOf("Selected"),
    text = "α👩🏽‍💻e\u0301 inserted. ";
  let file = f.store.readText(f.p.id, before.path);
  file = f.store.save(f.p.id, before.path, original, file.revision);
  file = f.store.save(
    f.p.id,
    before.path,
    original.slice(0, at) + text + original.slice(at),
    file.revision,
  );
  f.store.saveRun({
    ...f.value,
    from: at,
    to: at,
    originalSelection: { from: at, to: at },
    visible: text,
    lastRevision: file.revision,
    status: "completed",
  });
  const restarted = new Store(f.root);
  try {
    const summaries = new Chats(restarted).state(f.p.id).runs;
    assert.equal(
      summaries[0].visible,
      "",
      "summary must keep generated text out of refreshes",
    );
    assert.ok(!JSON.stringify(summaries).includes(text));
    const candidate = latestTypingUndo(
      summaries,
      restarted.project(f.p.id).files,
      f.p.id,
      { file: restarted.readText(f.p.id, "notes.tex"), dirty: false },
    );
    assert.ok(
      candidate,
      "insertion-only Undo must survive a real summary refresh/restart",
    );
    const ai = new AI(restarted, new Compiler(restarted), new Keys());
    let recovered: EditorState | undefined;
    await new TypingUndoRecovery().restore(candidate, {
      projectId: () => f.p.id,
      lock: () => {},
      saveInspected: async () => {},
      readTarget: async (name) => restarted.readText(f.p.id, name),
      snapshotTarget: () => undefined,
      undoRun: async (id) => ai.undo(id),
      applyTarget: (result, snapshot) => {
        assert.equal(result.content, original);
        recovered = load(snapshot);
      },
    });
    assert.ok(recovered);
    assert.equal(recovered.selection.main.head, at);
    const redone = command(recovered, redo).state;
    assert.equal(redone.doc.toString(), file.content);
    assert.equal(
      redone.selection.main.head,
      at + text.length,
      "Redo caret uses actual UTF-16 source offsets, not an empty summary marker",
    );
  } finally {
    restarted.close();
  }
});
test("real chat summaries distinguish an empty no-op from a selection deletion", (t) => {
  const f = serverFixture(t),
    source = f.store.readText(f.p.id, before.path),
    chats = new Chats(f.store);
  f.store.saveRun({
    ...f.value,
    from: 0,
    to: 0,
    visible: "",
    lastRevision: source.revision,
  });
  assert.equal(
    latestTypingUndo(
      chats.state(f.p.id).runs,
      f.store.project(f.p.id).files,
      f.p.id,
    ),
    undefined,
  );
  f.store.saveRun({
    ...f.value,
    from: 0,
    to: 1,
    visible: "",
    lastRevision: source.revision,
  });
  assert.ok(
    latestTypingUndo(
      chats.state(f.p.id).runs,
      f.store.project(f.p.id).files,
      f.p.id,
    ),
  );
});

test("reconstructed history restores the original selection and uses the captured range for exact Redo and Undo", () => {
  for (const text of [inserted, ""]) {
    const typed = {
      ...before,
      content: original.slice(0, from) + text + original.slice(to),
    };
    const recovered = load(
      typingUndoHistory(typed, restored, undefined, from + text.length, {
        from,
        to,
      }).snapshot,
    );
    assert.deepEqual(
      { from: recovered.selection.main.from, to: recovered.selection.main.to },
      { from, to },
    );
    const redone = command(recovered, redo).state;
    assert.equal(redone.doc.toString(), typed.content);
    assert.equal(redone.selection.main.head, from + text.length);
    const undone = command(redone, undo).state;
    assert.equal(undone.doc.toString(), original);
  }
  for (const range of [
    { from: 0, to: 1 },
    { from: -1, to },
    { from: 0, to: original.length + 1 },
    { from: 0.5, to },
  ])
    assert.throws(
      () => typingUndoHistory(before, restored, undefined, from, range),
      /saved typing range/,
    );
});
