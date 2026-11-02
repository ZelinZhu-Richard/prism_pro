import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Compartment,
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import {
  history,
  indentMore,
  isolateHistory,
  redo,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { getIndentUnit } from "@codemirror/language";
import { editorDisplay, editorKeymap } from "../src/editor-preferences";
import { internalEdit, readOnlyTransactions } from "../src/editor-transactions";
import {
  defaultEditorPreferences,
  editorPreferences,
  editorPreferencesPatch,
} from "../shared/editor-preferences";
import { createApp } from "../server/app";
import { build } from "vite";
import { pathToFileURL } from "node:url";
import { emacsInitialization } from "../build/emacs-initialization";

test("legacy and invalid persisted preferences recover independently without CSS or prototype injection", () => {
  assert.deepEqual(editorPreferences(undefined), defaultEditorPreferences);
  const value = editorPreferences(
    JSON.parse(
      '{"fontSize":18,"fontFamily":"url(https://invalid.test/font)","tabSize":"8","lineWrapping":false,"__proto__":{"polluted":true}}',
    ),
  );
  assert.equal(value.fontSize, 18);
  assert.equal(value.fontFamily, "system");
  assert.equal(value.tabSize, 2);
  assert.equal(value.lineWrapping, false);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(({} as any).polluted, undefined);
});

test("incoming preferences reject out-of-range, coercible, unknown and malformed values", () => {
  for (const bad of [
    null,
    [],
    "vim",
    { fontSize: 9 },
    { fontSize: 25 },
    { fontSize: 12.5 },
    { fontSize: "14" },
    { tabSize: 3 },
    { lineWrapping: 1 },
    { keymap: "javascript" },
    { fontFamily: "constructor" },
    { lineHeight: "0" },
    { closeBrackets: null },
    { unknown: true },
    JSON.parse('{"__proto__":{}}'),
  ]) {
    assert.throws(
      () => editorPreferencesPatch(bad),
      /Editor preferences|Invalid editor preference/,
    );
  }
  assert.deepEqual(
    editorPreferencesPatch({
      fontSize: 24,
      fontFamily: "dyslexic",
      keymap: "emacs",
      lineWrapping: false,
    }),
    {
      fontSize: 24,
      fontFamily: "dyslexic",
      keymap: "emacs",
      lineWrapping: false,
    },
  );
});

test("preference APIs merge partial changes, reject the whole invalid write and leave project/history alone", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-editor-settings-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { app, store } = await createApp(root, { seed: false });
  t.after(() => app.close());
  const project = store.create("Synthetic preferences", [
    { path: "main.tex", data: Buffer.from("A source that stays intact.\n") },
  ]);
  const original = store.project(project.id),
    checkpoints = store.checkpoints(project.id);
  store.setSetting("preferences", {
    theme: "light",
    provider: "anthropic",
    model: "existing-model",
    scope: "project",
  });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const initial = await app.inject({ url: "/api/settings", headers });
  assert.deepEqual(initial.json().preferences.editor, defaultEditorPreferences);
  for (const editor of [
    { fontFamily: "dyslexic", fontSize: 18, tabSize: 4 },
    { keymap: "vim", lineWrapping: false },
  ]) {
    const saved = await app.inject({
      url: "/api/settings/preferences",
      method: "PUT",
      headers,
      payload: { editor },
    });
    assert.equal(saved.statusCode, 200);
  }
  const before = store.setting("preferences", {});
  assert.equal(before.editor.fontSize, 18);
  assert.equal(before.editor.tabSize, 4);
  assert.equal(before.editor.keymap, "vim");
  assert.equal(before.provider, "anthropic");
  assert.equal(before.scope, "project");
  assert.equal(before.theme, "light");
  const bad = await app.inject({
    url: "/api/settings/preferences",
    method: "PUT",
    headers,
    payload: {
      theme: "dark",
      editor: { fontSize: 16, fontFamily: "url(invalid)" },
    },
  });
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(store.setting("preferences", {}), before);
  await app.inject({
    url: "/api/settings/preferences",
    method: "PUT",
    headers,
    payload: { model: "another-model" },
  });
  assert.deepEqual(store.setting("preferences", {}).editor, before.editor);
  assert.deepEqual(store.project(project.id), original);
  assert.deepEqual(store.checkpoints(project.id), checkpoints);
  assert.equal(store.readText(project.id, "main.tex").revision, 0);
});

test("SQLite restart retains every editor preference", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-editor-restart-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let instance = await createApp(root, { seed: false });
  instance.store.setSetting("preferences", {
    editor: {
      fontSize: 24,
      fontFamily: "source",
      lineHeight: "wide",
      keymap: "emacs",
      indentWithTabs: true,
      tabSize: 8,
      autoComplete: false,
      closeBrackets: false,
      lineNumbers: false,
      lineWrapping: false,
    },
  });
  await instance.app.close();
  instance = await createApp(root, { seed: false });
  t.after(() => instance.app.close());
  const response = await instance.app.inject({
    url: "/api/settings",
    headers: { host: "127.0.0.1:4317" },
  });
  assert.equal(response.json().preferences.editor.fontSize, 24);
  assert.equal(response.json().preferences.editor.indentWithTabs, true);
  assert.equal(response.json().preferences.editor.keymap, "emacs");
});

test("indentation changes affect new edits without rewriting existing whitespace", () => {
  for (const indentWithTabs of [false, true]) {
    const preferences = {
      ...defaultEditorPreferences,
      tabSize: 8 as const,
      indentWithTabs,
    };
    let state = EditorState.create({
      doc: "  original\n\tindent",
      extensions: [editorDisplay(preferences)],
    });
    assert.equal(state.doc.toString(), "  original\n\tindent");
    assert.equal(state.tabSize, 8);
    assert.equal(getIndentUnit(state), 8);
    indentMore({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    assert.equal(
      state.doc.line(1).text,
      (indentWithTabs ? "\t" : "        ") + "  original",
    );
    assert.equal(state.doc.line(2).text, "\tindent");
  }
});

test("display/keymap reconfiguration preserves selection and the exact single Manual Type Undo/Redo group", () => {
  const display = new Compartment(),
    keyboard = new Compartment();
  let state = EditorState.create({
    doc: "abc ORIGINAL xyz",
    selection: { anchor: 4, head: 12 },
    extensions: [
      history({
        joinToEvent: (tr, adjacent) =>
          tr.isUserEvent("input.type.ai") || adjacent,
      }),
      display.of(editorDisplay({ ...defaultEditorPreferences })),
      keyboard.of([]),
    ],
  });
  const dispatch = (...spec: TransactionSpec[]) => {
    state = state.update(...spec).state;
  };
  dispatch({
    changes: { from: 4, to: 12, insert: "A" },
    selection: { anchor: 5 },
    annotations: [
      internalEdit.of(true),
      Transaction.userEvent.of("input.type.ai"),
      isolateHistory.of("before"),
    ],
  });
  const depth = undoDepth(state),
    selection = state.selection.toJSON();
  dispatch({
    effects: [
      display.reconfigure(
        editorDisplay({
          ...defaultEditorPreferences,
          fontSize: 20,
          lineWrapping: false,
          fontFamily: "dyslexic",
        }),
      ),
      keyboard.reconfigure(
        editorKeymap({ ...defaultEditorPreferences, keymap: "emacs" }),
      ),
    ],
  });
  assert.equal(state.doc.toString(), "abc A xyz");
  assert.deepEqual(state.selection.toJSON(), selection);
  assert.equal(undoDepth(state), depth);
  dispatch({
    changes: { from: 5, to: 5, insert: "B" },
    selection: { anchor: 6 },
    annotations: [
      internalEdit.of(true),
      Transaction.userEvent.of("input.type.compose"),
    ],
  });
  dispatch({ annotations: isolateHistory.of("after") });
  const target = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = tr.state;
    },
  };
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), "abc ORIGINAL xyz");
  assert.deepEqual(state.selection.toJSON(), {
    ranges: [{ anchor: 4, head: 12 }],
    main: 0,
  });
  assert.equal(redo(target), true);
  assert.equal(state.doc.toString(), "abc AB xyz");
});

test("changing keymaps/display cannot release AI read-only locks or block authorized typing transactions", () => {
  const keyboard = new Compartment();
  let state = EditorState.create({
    doc: "locked",
    extensions: [
      EditorState.readOnly.of(true),
      readOnlyTransactions,
      keyboard.of([]),
    ],
  });
  for (const keymap of ["vim", "emacs", "default"] as const) {
    state = state.update({
      effects: keyboard.reconfigure(
        editorKeymap({ ...defaultEditorPreferences, keymap }),
      ),
    }).state;
    state = state.update({
      changes: { from: 0, to: 6, insert: "competing edit" },
    }).state;
    assert.equal(state.doc.toString(), "locked");
  }
  state = state.update({
    changes: { from: 0, to: 6, insert: "AI text" },
    annotations: internalEdit.of(true),
  }).state;
  assert.equal(state.doc.toString(), "AI text");
});

test("production tree-shaking preserves Emacs key registration and kill/yank commands", async (t) => {
  fs.mkdirSync(path.resolve("data/verification"), { recursive: true });
  const root = fs.mkdtempSync(path.resolve("data/verification/emacs-bundle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, "entry.ts");
  fs.writeFileSync(
    entry,
    'export { EmacsHandler } from "@replit/codemirror-emacs"; export { EditorState } from "@codemirror/state";',
  );
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [emacsInitialization()],
    build: {
      lib: { entry, formats: ["es"], fileName: () => "commands.mjs" },
      outDir: path.join(root, "bundle"),
      minify: "esbuild",
    },
  });
  const compiled = await import(
    pathToFileURL(path.join(root, "bundle/commands.mjs")).href
  );
  let state = compiled.EditorState.create({ doc: "original\nnext" });
  const handler = new compiled.EmacsHandler({
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = tr.state ?? state.update(tr).state;
    },
  });
  const press = (key: string) =>
    handler.handleKeyboard({
      key,
      code: "Key" + key.toUpperCase(),
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    });
  assert.ok(press("k"));
  assert.equal(state.doc.toString(), "\nnext");
  assert.ok(press("y"));
  assert.equal(state.doc.toString(), "original\nnext");
});

test("Leaf defaults new workspaces to light and retains explicit existing theme choices", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "leaf-theme-"));
  let f = await createApp(root, { seed: false });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const fresh = await f.app.inject({
    method: "GET",
    url: "/api/settings",
    headers,
  });
  assert.equal(fresh.json().preferences.theme, "light");
  for (const theme of ["dark", "system", "light"]) {
    const save = await f.app.inject({
      method: "PUT",
      url: "/api/settings/preferences",
      headers,
      payload: { theme },
    });
    assert.equal(save.statusCode, 200);
    await f.app.close();
    f = await createApp(root, { seed: false });
    const reopened = await f.app.inject({
      method: "GET",
      url: "/api/settings",
      headers,
    });
    assert.equal(reopened.json().preferences.theme, theme);
  }
});
