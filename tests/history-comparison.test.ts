import test from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { readZip, writeZip } from "../server/files";
function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-timeline-"));
  const store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic", [
    { path: "main.tex", data: Buffer.from("Original main") },
    { path: "sections/intro.tex", data: Buffer.from("Original intro") },
    { path: "figure.bin", data: Buffer.from([0, 255, 7]) },
  ]);
  return { store, p, initial: (store.checkpoints(p.id)[0] as any).id };
}
test("version comparison reports added, deleted, modified, unchanged and compiler settings", (t) => {
  const { store, p, initial } = setup(t);
  store.save(p.id, "main.tex", "Changed main", 0);
  store.trash(p.id, "figure.bin");
  store.add(p.id, "new.tex", Buffer.from("Added"));
  store.update(p.id, { engine: "xelatex" });
  const result = store.compareHistory(p.id, initial);
  assert.deepEqual(
    Object.fromEntries(result.files.map((f) => [f.path, f.change])),
    {
      "figure.bin": "deleted",
      "main.tex": "modified",
      "new.tex": "added",
      "sections/intro.tex": "unchanged",
    },
  );
  assert.equal(result.settingsChanged, true);
  assert.equal(
    store.historyFile(p.id, initial, "main.tex").before,
    "Original main",
  );
  assert.equal(
    store.historyFile(p.id, initial, "main.tex").after,
    "Changed main",
  );
  const second = store.checkpoint(p.id, "Second");
  assert.equal(
    store
      .compareHistory(p.id, initial, second.id)
      .files.find((f) => f.path === "main.tex")?.change,
    "modified",
  );
  assert.equal(
    store
      .compareHistory(p.id, second.id, second.id)
      .files.filter((f) => f.change !== "unchanged").length,
    0,
  );
});
test("restoring one file preserves all other bytes/settings and records a recoverable backup", (t) => {
  const { store, p, initial } = setup(t);
  store.save(p.id, "main.tex", "Changed main", 0);
  store.save(p.id, "sections/intro.tex", "Keep this edit", 0);
  store.update(p.id, { engine: "xelatex" });
  const latest = store.project(p.id);
  store.restoreCheckpointFile(p.id, initial, "main.tex", 1);
  assert.equal(store.readText(p.id, "main.tex").content, "Original main");
  assert.equal(store.readText(p.id, "main.tex").revision, 2);
  assert.equal(
    store.readText(p.id, "sections/intro.tex").content,
    "Keep this edit",
  );
  assert.equal(store.project(p.id).engine, "xelatex");
  const backup = store
    .checkpoints(p.id)
    .find((c: any) => c.name === "Before restoring main.tex") as any;
  assert.ok(backup);
  assert.equal(
    store.historyFile(p.id, backup.id, "main.tex").before,
    "Changed main",
  );
  assert.ok(store.project(p.id).generation > latest.generation);
});
test("file restore rejects stale comparisons and conflicting directory layouts atomically", (t) => {
  const { store, p, initial } = setup(t);
  store.save(p.id, "main.tex", "Newer edit", 0);
  assert.throws(
    () => store.restoreCheckpointFile(p.id, initial, "main.tex", 0),
    /changed after comparison/,
  );
  assert.equal(store.readText(p.id, "main.tex").content, "Newer edit");
  store.rename(p.id, "main.tex", "renamed.tex");
  store.add(p.id, "main.tex/child.tex", Buffer.from("Do not overwrite"));
  const count = store.checkpoints(p.id).length;
  assert.throws(
    () => store.restoreCheckpointFile(p.id, initial, "main.tex", null),
    /file|folder|path/i,
  );
  assert.equal(
    store.readText(p.id, "main.tex/child.tex").content,
    "Do not overwrite",
  );
  assert.equal(store.checkpoints(p.id).length, count);
});
test("deleted binary files restore exactly, history exports round-trip, and labels preserve snapshot content", async (t) => {
  const { store, p, initial } = setup(t);
  store.trash(p.id, "figure.bin");
  store.restoreCheckpointFile(p.id, initial, "figure.bin", 1);
  assert.deepEqual(
    store.file(p.id, "figure.bin").content,
    Buffer.from([0, 255, 7]),
  );
  const zipped = await readZip(writeZip(store.exportCheckpoint(p.id, initial)));
  const files = zipped;
  assert.deepEqual(
    files.find((f: any) => f.path === "figure.bin")?.data,
    Buffer.from([0, 255, 7]),
  );
  store.labelCheckpoint(p.id, initial, "Before experiments");
  const version = store
    .checkpoints(p.id)
    .find((c: any) => c.id === initial) as any;
  assert.equal(version.name, "Before experiments");
  assert.equal(version.automatic, 0);
  assert.equal(
    store.historyFile(p.id, initial, "main.tex").before,
    "Original main",
  );
  const other = store.create("Other");
  assert.throws(() => store.compareHistory(other.id, initial), /not found/);
  assert.throws(
    () => store.historyFile(p.id, initial, "../escape"),
    /paths|path/i,
  );
});
test("history endpoints enforce local requests and return exact file comparisons", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-history-api-"));
  const { app, store } = await createApp(root, {
    seed: false,
    dist: "/nonexistent",
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("API", [
    { path: "main.tex", data: Buffer.from("Initial") },
  ]);
  const initial = (store.checkpoints(p.id)[0] as any).id;
  store.save(p.id, "main.tex", "Later", 0);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const base = `/api/projects/${p.id}/checkpoints/${initial}`;
  const compared = await app.inject({ url: base + "/compare", headers });
  assert.equal(compared.statusCode, 200);
  assert.equal(compared.json().files[0].change, "modified");
  const archive = await app.inject({ url: base + "/export", headers });
  assert.equal(archive.statusCode, 200);
  assert.match(archive.headers["content-type"]!, /application\/zip/);
  const entries = await readZip(archive.rawPayload);
  assert.equal(
    entries.find((f) => f.path === "main.tex")?.data.toString(),
    "Initial",
  );
  const preview = await app.inject({
    method: "POST",
    url: base + "/restore-preview",
    headers,
    payload: {
      path: "main.tex",
      expectedRevision: 1,
      includeReview: true,
      expectedReviewToken: compared.json().reviews.currentToken,
    },
  });
  assert.equal(preview.statusCode, 200);
  const restoreRequest = {
    path: "main.tex",
    expectedRevision: 1,
    includeReview: preview.json().includeReview,
    expectedReviewToken: compared.json().reviews.currentToken,
    token: preview.json().token,
    id: randomUUID(),
  };
  const restored = await app.inject({
    method: "POST",
    url: base + "/restore-file",
    headers,
    payload: restoreRequest,
  });
  assert.equal(restored.statusCode, 200);
  assert.equal(store.readText(p.id, "main.tex").content, "Initial");
  const stale = await app.inject({
    method: "POST",
    url: base + "/restore-file",
    headers,
    payload: { ...restoreRequest, id: randomUUID() },
  });
  assert.equal(stale.statusCode, 409);
});

test("legacy inline-base64 versions remain comparable, exportable and restorable after migration", (t) => {
  const { store, p, initial } = setup(t);
  const payload = {
    project: store.requireProject(p.id),
    files: (
      store.db.prepare("SELECT * FROM files WHERE project=?").all(p.id) as any[]
    ).map((f) => ({
      ...f,
      content: Buffer.from(f.content).toString("base64"),
    })),
  };
  store.db
    .prepare("UPDATE checkpoints SET payload=? WHERE id=?")
    .run(JSON.stringify(payload), initial);
  store.save(p.id, "main.tex", "Later", 0);
  assert.equal(
    store.historyFile(p.id, initial, "main.tex").before,
    "Original main",
  );
  assert.deepEqual(
    store.exportCheckpoint(p.id, initial).find((f) => f.path === "figure.bin")
      ?.data,
    Buffer.from([0, 255, 7]),
  );
  store.restoreCheckpointFile(p.id, initial, "main.tex", 1);
  assert.equal(store.readText(p.id, "main.tex").content, "Original main");
  store.save(p.id, "main.tex", "Still later", 2);
  store.restoreCheckpoint(p.id, initial);
  assert.equal(store.readText(p.id, "main.tex").content, "Original main");
});
