import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEditorIdle } from "../src/editor-workflow";
import {
  editorPreferences,
  defaultEditorPreferences,
} from "../shared/editor-preferences";
import { createApp } from "../server/app";

test("replaced idle tasks honor the new full delay and cancellation never starts an old write", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const writes: string[] = [];
  const cancel = afterEditorIdle(
    600,
    () => true,
    () => writes.push("old"),
  );
  t.mock.timers.tick(599);
  assert.equal(writes.length, 0);
  cancel();
  const next = afterEditorIdle(
    2000,
    () => true,
    () => writes.push("new"),
  );
  t.mock.timers.tick(1999);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(writes, ["new"]);
  next();
  t.mock.timers.tick(60000);
  assert.deepEqual(writes, ["new"]);
});
test("idle work rechecks destination, source cleanliness and an agent lock at firing time", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const writes: string[] = [];
  let active = "A/main.tex",
    locked = false,
    dirty = false;
  afterEditorIdle(
    1800,
    () => active === "A/main.tex" && !locked && !dirty,
    () => writes.push("compile A"),
  );
  active = "B/main.tex";
  t.mock.timers.tick(1800);
  assert.equal(writes.length, 0);
  active = "A/main.tex";
  afterEditorIdle(
    600,
    () => !locked && !dirty,
    () => writes.push("save A"),
  );
  locked = true;
  t.mock.timers.tick(600);
  assert.equal(writes.length, 0);
  locked = false;
  afterEditorIdle(
    1000,
    () => !locked && !dirty,
    () => writes.push("compile clean"),
  );
  dirty = true;
  t.mock.timers.tick(1000);
  assert.equal(writes.length, 0);
  dirty = false;
  afterEditorIdle(
    1000,
    () => !locked && !dirty,
    () => writes.push("compile clean"),
  );
  t.mock.timers.tick(1000);
  assert.deepEqual(writes, ["compile clean"]);
});
test("legacy workflow defaults recover independently and preserve valid custom delays", () => {
  assert.equal(defaultEditorPreferences.autoSave, true);
  assert.equal(defaultEditorPreferences.autoSaveDelayMs, 600);
  assert.equal(defaultEditorPreferences.autoCompileDelayMs, 1800);
  const p = editorPreferences({
    autoSave: false,
    autoSaveDelayMs: "600",
    autoCompileDelayMs: 550,
    fontSize: 18,
  });
  assert.equal(p.autoSave, false);
  assert.equal(p.autoSaveDelayMs, 600);
  assert.equal(p.autoCompileDelayMs, 550);
  assert.equal(p.fontSize, 18);
});
test("workflow preference APIs persist manual/custom choices and reject invalid patches without changing source, history or compile policy", async (t) => {
  const root = path.resolve("data/verification/workflow-unit-" + randomUUID());
  let f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("Workflow preferences", [
      { path: "main.tex", data: Buffer.from("Exact source α.\n") },
    ]),
    before = {
      project: f.store.project(p.id),
      history: f.store.checkpoints(p.id),
      compiler: f.compiler.settings(p.id),
    };
  f.store.setSetting("preferences", {
    theme: "dark",
    provider: "anthropic",
    model: "retained-model",
    autoCompile: false,
  });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const write = async (editor: unknown) =>
    f.app.inject({
      method: "PUT",
      url: "/api/settings/preferences",
      headers,
      payload: { editor },
    });
  assert.equal(
    (
      await write({
        autoSave: false,
        autoSaveDelayMs: 250,
        autoCompileDelayMs: 60000,
      })
    ).statusCode,
    200,
  );
  const saved = f.store.setting("preferences", {});
  for (const editor of [
    { autoSave: "false" },
    { autoSave: 0 },
    { autoSaveDelayMs: 249 },
    { autoSaveDelayMs: 30001 },
    { autoSaveDelayMs: 600.5 },
    { autoCompileDelayMs: 0 },
    { autoCompileDelayMs: 60001 },
    { autoCompileDelayMs: "1800" },
  ]) {
    assert.equal((await write({ fontSize: 18, ...editor })).statusCode, 400);
    assert.deepEqual(f.store.setting("preferences", {}), saved);
  }
  await f.app.close();
  f = await createApp(root, { seed: false });
  const response = (
    await f.app.inject({ url: "/api/settings", headers })
  ).json();
  assert.equal(response.preferences.editor.autoSave, false);
  assert.equal(response.preferences.editor.autoSaveDelayMs, 250);
  assert.equal(response.preferences.editor.autoCompileDelayMs, 60000);
  assert.equal(response.preferences.theme, "dark");
  assert.equal(response.preferences.provider, "anthropic");
  assert.equal(response.preferences.model, "retained-model");
  assert.equal(response.preferences.autoCompile, false);
  assert.deepEqual(
    {
      project: f.store.project(p.id),
      history: f.store.checkpoints(p.id),
      compiler: f.compiler.settings(p.id),
    },
    before,
  );
  assert.equal(f.store.readText(p.id, "main.tex").content, "Exact source α.\n");
  assert.deepEqual(f.store.runs(p.id), []);
  assert.equal(f.compiler.jobs.size, 0);
});
