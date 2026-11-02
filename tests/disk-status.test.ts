import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../server/store";
import { DiskObserver } from "../server/disk-status";
import { SourceRecovery } from "../server/source-recovery";
import { createApp } from "../server/app";
function fixture(t: any) {
  const root = fs.mkdtempSync(
    path.resolve("data/verification/disk-status-test-"),
  );
  const store = new Store(root),
    p = store.create("Synthetic live disk checks", [
      { path: "main.tex", data: Buffer.from("Original source.\n") },
      {
        path: "nested/references.bib",
        data: Buffer.from("@book{local,title={Local}}"),
      },
      { path: "asset.bin", data: Buffer.from([0, 1, 255]) },
      { path: "empty", data: Buffer.alloc(0), directory: true },
    ]);
  let now = 10000;
  const observer = new DiskObserver(store, () => now);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    store,
    p,
    observer,
    next() {
      now += 2100;
    },
    file: (name: string) => path.join(store.projectDir(p.id), name),
    snapshot: () =>
      JSON.stringify({
        project: store.project(p.id),
        files: store.exportFiles(p.id),
        history: store.checkpoints(p.id),
        receipts: store.db.prepare("SELECT * FROM file_disk_state").all(),
      }),
  };
}
test("live disk observations are read-only, reuse unchanged metadata and rehash changed same-size text even when mtime is restored", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    inspect = f.store.disk.inspect.bind(f.store.disk);
  let reads = 0;
  f.store.disk.inspect = (id, name) => {
    reads++;
    return inspect(id, name);
  };
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
  const initialReads = reads;
  assert.equal(initialReads, 4);
  f.next();
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
  assert.equal(reads, initialReads);
  const stamp = fs.statSync(f.file("main.tex"));
  fs.writeFileSync(f.file("main.tex"), "External source.\n");
  fs.utimesSync(f.file("main.tex"), stamp.atime, stamp.mtime);
  f.next();
  assert.deepEqual(f.observer.status(f.p.id).changes, [
    { path: "main.tex", change: "modified" },
  ]);
  assert.equal(reads, initialReads + 1);
  assert.equal(f.snapshot(), before);
  assert.equal(
    fs.readFileSync(f.file("main.tex"), "utf8"),
    "External source.\n",
  );
  fs.writeFileSync(f.file("main.tex"), "Original source.\n");
  f.next();
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
});
test("live checks distinguish deletes, restored Trash paths, file types and binary edits without automatic reconciliation", (t) => {
  const f = fixture(t);
  f.store.trash(f.p.id, "nested/references.bib");
  const before = f.snapshot();
  fs.writeFileSync(
    f.file("nested/references.bib"),
    "External restored bibliography",
  );
  fs.unlinkSync(f.file("main.tex"));
  fs.rmdirSync(f.file("empty"));
  fs.writeFileSync(f.file("empty"), "A file now");
  fs.writeFileSync(f.file("asset.bin"), Buffer.from([0, 2, 255]));
  assert.deepEqual(f.observer.status(f.p.id).changes, [
    { path: "asset.bin", change: "modified" },
    { path: "empty", change: "type" },
    { path: "main.tex", change: "deleted" },
    { path: "nested/references.bib", change: "restored" },
  ]);
  assert.equal(f.snapshot(), before);
  assert.equal(fs.existsSync(f.file("main.tex")), false);
});
test("unknown paths are not traversed or imported; unsafe indexed links are reported without reading targets and corrected paths recover", (t) => {
  const f = fixture(t);
  const before = f.snapshot();
  fs.mkdirSync(f.file("unknown"));
  fs.writeFileSync(f.file("unknown/new.tex"), "Leave unindexed");
  fs.symlinkSync(f.file("unknown"), f.file("unindexed-link"));
  fs.unlinkSync(f.file("main.tex"));
  fs.symlinkSync(f.file("unknown/new.tex"), f.file("main.tex"));
  const inspect = f.store.disk.inspect.bind(f.store.disk);
  let opened = false;
  f.store.disk.inspect = (id, name) => {
    if (name === "main.tex") opened = true;
    return inspect(id, name);
  };
  assert.deepEqual(f.observer.status(f.p.id).changes, [
    { path: "main.tex", change: "unsafe" },
  ]);
  assert.equal(opened, false);
  assert.equal(f.snapshot(), before);
  fs.unlinkSync(f.file("main.tex"));
  fs.writeFileSync(f.file("main.tex"), "Original source.\n");
  f.next();
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
  assert.equal(
    f.store.fileList(f.p.id).some((x) => x.path === "unknown/new.tex"),
    false,
  );
});
test("bounded observer errors retain source; a missing root is never recreated and restored availability can be checked", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    folder = f.store.projectDir(f.p.id),
    held = folder + ".held";
  fs.renameSync(folder, held);
  assert.throws(
    () => f.observer.status(f.p.id),
    /Restore the managed project folder/,
  );
  assert.equal(fs.existsSync(folder), false);
  fs.renameSync(held, folder);
  assert.equal(f.snapshot(), before);
  const fileList = f.store.fileList.bind(f.store);
  f.store.fileList = () =>
    Array.from({ length: 10001 }, (_, i) => ({
      path: i + ".tex",
      revision: 0,
      kind: "text" as const,
      size: 0,
      deleted: false,
    }));
  assert.throws(() => f.observer.status(f.p.id), /10,000/);
  f.store.fileList = fileList;
  const fingerprint = f.store.disk.fingerprint.bind(f.store.disk);
  f.store.disk.fingerprint = (id, name) => ({
    ...fingerprint(id, name),
    size: 70 * 1024 * 1024,
  });
  assert.throws(() => f.observer.status(f.p.id), /128 MiB/);
  f.store.disk.fingerprint = fingerprint;
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
  assert.equal(f.snapshot(), before);
});
test("canonical generation changes invalidate the short cache, and deliberate version resolution is required to adopt external bytes", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file("main.tex"), "External source.\n");
  const status = f.observer.status(f.p.id);
  assert.equal(status.changes.length, 1);
  const recovery = new SourceRecovery(f.store),
    review = recovery.review(f.p.id, "main.tex");
  recovery.resolve(f.p.id, {
    path: "main.tex",
    token: review.token,
    action: "disk",
  });
  const clean = f.observer.status(f.p.id);
  assert(clean.generation > status.generation);
  assert.deepEqual(clean.changes, []);
  assert.equal(
    f.store.readText(f.p.id, "main.tex").content,
    "External source.\n",
  );
  const d = f.store.readText(f.p.id, "main.tex");
  f.store.save(f.p.id, d.path, "App source.\n", d.revision);
  assert.deepEqual(f.observer.status(f.p.id).changes, []);
});
test("disk status endpoint keeps local origin and project boundaries without returning source text or writing revisions", async (t) => {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/disk-status-api-"),
    ),
    f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("Endpoint fixture", [
    { path: "main.tex", data: Buffer.from("Sensitive synthetic source") },
  ]);
  fs.writeFileSync(
    path.join(f.store.projectDir(p.id), "main.tex"),
    "External synthetic source",
  );
  const history = JSON.stringify(f.store.checkpoints(p.id));
  const response = await f.app.inject({
    url: `/api/projects/${p.id}/disk/status`,
    headers: { host: "127.0.0.1:5173" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().projectId, p.id);
  assert.deepEqual(response.json().changes, [
    { path: "main.tex", change: "modified" },
  ]);
  assert(!response.body.includes("synthetic source"));
  assert.equal(JSON.stringify(f.store.checkpoints(p.id)), history);
  assert.equal(
    (
      await f.app.inject({
        url: `/api/projects/${p.id}/disk/status`,
        headers: { host: "127.0.0.1:5173", origin: "https://other.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        url: "/api/projects/not-a-project/disk/status",
        headers: { host: "127.0.0.1:5173" },
      })
    ).statusCode,
    404,
  );
});
