import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultWorkspaceLayout as defaults,
  workspaceLayout,
  workspaceLayoutPatch,
  workspacePreset,
  type SavedWorkspaceLayout,
} from "../shared/workspace-layout";
import { LayoutSession } from "../src/workspace-layout";
import { WorkspaceLayouts } from "../server/workspace-layout";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { projectCommands } from "../src/quick-navigation";
const snapshot = (
  revision = 0,
  value = { ...defaults },
): SavedWorkspaceLayout => ({ revision, value });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function settled(session: LayoutSession) {
  const end = Date.now() + 1000;
  while (session.view.phase !== "saved") {
    assert(Date.now() < end, JSON.stringify(session.view));
    await new Promise((r) => setTimeout(r, 2));
  }
}
function client() {
  let saved = snapshot(),
    writes = 0;
  const ports = {
    read: async (signal: AbortSignal) => structuredClone(saved),
    save: async (value: SavedWorkspaceLayout, signal: AbortSignal) => {
      writes++;
      saved = snapshot(saved.revision + 1, { ...value.value });
      return structuredClone(saved);
    },
    notify: () => {},
    delayMs: 100,
    timeoutMs: 100,
  };
  const session = new LayoutSession(ports);
  session.load(saved);
  return {
    session,
    ports,
    saved: () => saved,
    writes: () => writes,
    remote: (value: SavedWorkspaceLayout) => (saved = value),
  };
}
test("legacy layout values normalize independently; incoming CSS/prototype/coercible fields reject together", () => {
  assert.deepEqual(workspaceLayout(undefined), defaults);
  const old = workspaceLayout(
    JSON.parse(
      '{"sidebar":false,"sourceWidth":61.5,"sidebarWidth":"240","__proto__":{"polluted":true},"assistantHeight":"url(secret)"}',
    ),
  );
  assert.equal(old.sidebar, false);
  assert.equal(old.sourceWidth, 61.5);
  assert.equal(old.sidebarWidth, 230);
  assert.equal(old.assistantHeight, 360);
  assert.equal(({} as any).polluted, undefined);
  for (const bad of [
    null,
    [],
    { sourceWidth: 29 },
    { sourceWidth: 76 },
    { sourceWidth: NaN },
    { sidebarWidth: Infinity },
    { assistant: 1 },
    { assistantHeight: 551 },
    { unknown: 42 },
    JSON.parse('{"__proto__":{}}'),
  ])
    assert.throws(() => workspaceLayoutPatch(bad));
  const full = {
    ...defaults,
    sidebarWidth: 280,
    sourceWidth: 61.5,
    assistantHeight: 400,
  };
  assert.deepEqual(workspacePreset(full, "write"), {
    ...full,
    sidebar: false,
    assistant: false,
    preview: false,
  });
  assert.deepEqual(workspacePreset(full, "source-pdf"), {
    ...full,
    sidebar: false,
    assistant: false,
    preview: true,
  });
  assert.deepEqual(
    workspacePreset(workspacePreset(full, "write"), "full"),
    full,
  );
});
test("layout revisions reject interleaved stale writers and allow exact ambiguous retry without new metadata", (t) => {
  const root = path.resolve(
      "data/verification/layout-revision-" + randomUUID(),
    ),
    store = new Store(root),
    service = new WorkspaceLayouts(store);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  assert.deepEqual(service.get(), snapshot());
  const first = service.put(snapshot(0, { ...defaults, preview: false }));
  assert.equal(first.revision, 1);
  assert.deepEqual(
    service.put(snapshot(0, { ...defaults, preview: false })),
    first,
  );
  const second = service.put(snapshot(1, { ...defaults, assistant: false }));
  assert.equal(second.revision, 2);
  assert.throws(
    () => service.put(snapshot(0, { ...defaults, sidebar: false })),
    /another view/,
  );
  assert.deepEqual(service.get(), second);
  for (const bad of [
    { revision: 2, value: { sidebar: false } },
    { revision: -1, value: defaults },
    { revision: 2, value: { ...defaults, sourceWidth: "54" } },
    { revision: 2, value: { ...defaults, unknown: true } },
  ])
    assert.throws(() => service.put(bad));
  assert.deepEqual(service.get(), second);
});
test("layout API persists restart, stays independent of locked source/history/preferences and enforces origin", async (t) => {
  const root = path.resolve("data/verification/layout-api-" + randomUUID());
  let f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("Synthetic layout safety", [
      { path: "main.tex", data: Buffer.from("Original Unicode 新 👩🏽‍💻 é\n") },
    ]),
    headers = { host: "127.0.0.1:5173", "x-prism-request": "1" },
    before = () =>
      JSON.stringify({
        project: f.store.project(p.id),
        files: f.store.exportFiles(p.id),
        history: f.store.checkpoints(p.id),
      }),
    original = before();
  f.store.setSetting("preferences", {
    theme: "dark",
    provider: "anthropic",
    editor: { autoSave: false },
  });
  const preferences = f.store.setting("preferences", {});
  f.store.projectLocks.set(p.id, "synthetic-layout-lock");
  const value = {
    ...defaults,
    sidebar: false,
    assistant: false,
    preview: false,
    sourceWidth: 63,
    sidebarWidth: 270,
    assistantHeight: 420,
  };
  const saved = await f.app.inject({
    method: "PUT",
    url: "/api/settings/layout",
    headers,
    payload: snapshot(0, value),
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().revision, 1);
  assert.equal(before(), original);
  assert.deepEqual(f.store.setting("preferences", {}), preferences);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: "/api/settings/layout",
        headers: { ...headers, origin: "https://external.invalid" },
        payload: snapshot(1, defaults),
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: "/api/settings/layout",
        headers,
        payload: snapshot(0, defaults),
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: "/api/settings/layout",
        headers,
        payload: { revision: 1, value: { ...value, sourceWidth: 100 } },
      })
    ).statusCode,
    400,
  );
  f.store.projectLocks.clear();
  await f.app.close();
  f = await createApp(root, { seed: false });
  const loaded = await f.app.inject({ url: "/api/settings/layout", headers });
  assert.deepEqual(loaded.json(), snapshot(1, value));
  assert.equal(before(), original);
  assert.deepEqual(f.store.setting("preferences", {}), preferences);
  const settings = await f.app.inject({ url: "/api/settings", headers });
  assert.deepEqual(settings.json().layout, loaded.json());
});
test("a saved old layout acknowledgment cannot replace newer visible dimensions or final intent", async () => {
  const f = client(),
    d = deferred<SavedWorkspaceLayout>(),
    calls: SavedWorkspaceLayout[] = [];
  f.ports.save = async (v, s) => {
    calls.push(structuredClone(v));
    if (calls.length === 1) return d.promise;
    return snapshot(2, v.value);
  };
  f.session.edit({ sidebarWidth: 250 });
  const pending = f.session.flush();
  f.session.edit({ sidebarWidth: 300, preview: false });
  assert.equal(f.session.view.phase, "saving");
  d.resolve(snapshot(1, { ...defaults, sidebarWidth: 250 }));
  await pending;
  await settled(f.session);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].revision, 1);
  assert.equal(f.session.view.value.sidebarWidth, 300);
  assert.equal(f.session.view.value.preview, false);
  f.session.dispose();
});
test("an ambiguous committed save retains the current view and retry reads its receipt without a duplicate write", async () => {
  const f = client();
  let writes = 0;
  f.ports.save = async (v, s) => {
    writes++;
    f.remote(snapshot(1, v.value));
    throw Error("Synthetic reply lost");
  };
  f.session.edit({ assistant: false });
  await f.session.flush();
  assert.equal(f.session.view.phase, "error");
  assert.equal(f.session.view.value.assistant, false);
  await f.session.retry();
  assert.equal(f.session.view.phase, "saved");
  assert.equal(writes, 1);
  f.session.dispose();
});
test("conflicting layout choices preserve local state until explicit retry or loading saved settings", async () => {
  const f = client();
  f.ports.save = async (v, s) => {
    if (v.revision !== f.saved().revision)
      throw Error("Layout changed in another view");
    f.remote(snapshot(v.revision + 1, v.value));
    return f.saved();
  };
  f.remote(snapshot(5, { ...defaults, sidebar: false }));
  f.session.edit({ assistant: false });
  await f.session.flush();
  assert.equal(f.session.view.phase, "error");
  assert.equal(f.session.view.value.sidebar, true);
  await f.session.retry();
  assert.equal(f.saved().revision, 6);
  assert.equal(f.saved().value.assistant, false);
  f.remote(snapshot(7, { ...defaults, preview: false }));
  f.session.edit({ assistantHeight: 430 });
  await f.session.flush();
  assert.equal(f.session.view.phase, "error");
  await f.session.retry(true);
  assert.equal(f.session.view.value.preview, false);
  assert.equal(f.session.view.value.assistantHeight, 360);
  assert.equal(f.saved().revision, 7);
  f.session.dispose();
});
test("a delayed load-saved response cannot discard a newer local layout edit", async () => {
  const f = client(),
    d = deferred<SavedWorkspaceLayout>();
  f.ports.read = () => d.promise;
  f.session.edit({ assistant: false });
  const pending = f.session.retry(true);
  f.session.edit({ sidebarWidth: 310 });
  f.remote(snapshot(2, { ...defaults, preview: false }));
  d.resolve(snapshot(2, { ...defaults, preview: false }));
  await pending;
  await settled(f.session);
  assert.equal(f.session.view.value.sidebarWidth, 310);
  assert.equal(f.session.view.value.assistant, false);
  assert.equal(f.session.view.value.preview, true);
  f.session.dispose();
});
test("a stalled layout save aborts at its deadline, retains visible state and ignores a late acknowledgment", async () => {
  const f = client(),
    d = deferred<SavedWorkspaceLayout>();
  let signal: AbortSignal | undefined;
  f.ports.timeoutMs = 5;
  f.ports.save = (v, s) => {
    signal = s;
    return d.promise;
  };
  f.session.edit({ sourceWidth: 70 });
  await f.session.flush();
  assert.equal(f.session.view.phase, "error");
  assert(signal!.aborted);
  assert.equal(f.session.view.value.sourceWidth, 70);
  f.ports.save = async (v, s) => snapshot(1, v.value);
  await f.session.retry();
  d.resolve(snapshot(1, defaults));
  assert.equal(f.session.view.value.sourceWidth, 70);
  assert.equal(f.session.view.phase, "saved");
  f.session.dispose();
});
test("view commands remain available under read-only source ownership and name hidden panels explicitly", () => {
  const commands = projectCommands({
    source: true,
    tex: true,
    locked: true,
    compileReady: true,
    running: false,
    stopping: false,
    pdf: true,
    layout: { sidebar: false, assistant: false, preview: false },
  });
  for (const id of [
    "layout-full",
    "layout-write",
    "layout-source-pdf",
    "layout-sidebar",
    "layout-assistant",
    "layout-preview",
    "layout-reset",
  ])
    assert.equal(commands.find((c) => c.id === id)?.disabled, undefined);
  assert.equal(
    commands.find((c) => c.id === "layout-preview")?.label,
    "Show PDF and logs",
  );
  assert.equal(
    commands.find((c) => c.id === "save")?.disabled,
    "Source is read-only while an operation is active",
  );
});
