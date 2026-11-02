import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { DiskDiscovery } from "../server/disk-discovery";
import { createApp } from "../server/app";
function fixture(t: any) {
  const root = fs.mkdtempSync(
    path.resolve("data/verification/discovery-test-"),
  );
  let store = new Store(root);
  const p = store.create("Synthetic disk discovery", [
    { path: "main.tex", data: Buffer.from("Original source.\n") },
    { path: "refs.bib", data: Buffer.from("@book{local,title={Local}}") },
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    p,
    get store() {
      return store;
    },
    get disk() {
      return new DiskDiscovery(store);
    },
    file: (name: string) => path.join(store.projectDir(p.id), name),
    reopen() {
      store.close();
      store = new Store(root);
    },
  };
}
function write(
  f: ReturnType<typeof fixture>,
  name: string,
  bytes: Buffer | string,
) {
  fs.mkdirSync(path.dirname(f.file(name)), { recursive: true });
  fs.writeFileSync(f.file(name), bytes);
}
const input = (view: any, paths = view.added.map((e: any) => e.path)) => ({
  requestId: randomUUID(),
  token: view.token,
  paths,
});
function snapshot(f: ReturnType<typeof fixture>) {
  return JSON.stringify({
    project: f.store.project(f.p.id),
    history: f.store.checkpoints(f.p.id),
    files: f.store.exportFiles(f.p.id),
  });
}
test("disk scan is read-only and discovers nested Unicode text, binary, legacy bytes and empty folders without executing scripts", (t) => {
  const f = fixture(t);
  write(f, "sections/Café 新.tex", "% 新 👩🏽‍💻 é\n\\section{Local}");
  write(f, "assets/image.dat", Buffer.from([0, 255, 1]));
  write(f, "legacy.tex", Buffer.from([0xff, 0xfe, 65]));
  const staging = "main.tex." + randomUUID() + ".prism-tmp";
  write(
    f,
    staging,
    "Unfinished staging bytes stay available outside the index.",
  );
  write(
    f,
    "build.sh",
    "#!/bin/sh\ntouch " + path.join(f.root, "must-not-exist"),
  );
  fs.mkdirSync(f.file("empty"));
  const before = snapshot(f),
    view = f.disk.scan(f.p.id);
  assert.deepEqual(
    view.added.map((e) => e.path).sort(),
    [
      "assets/image.dat",
      "build.sh",
      "empty",
      "legacy.tex",
      "sections/Café 新.tex",
    ].sort(),
  );
  assert.equal(view.added.find((e) => e.path === "legacy.tex")?.kind, "binary");
  assert.equal(view.added.find((e) => e.path === "empty")?.kind, "directory");
  assert.deepEqual(view.changed, []);
  assert.equal(snapshot(f), before);
  assert.ok(view.skipped.some((e) => e.path === staging));
  assert.equal(
    fs.readFileSync(f.file(staging), "utf8"),
    "Unfinished staging bytes stay available outside the index.",
  );
  assert.equal(fs.existsSync(path.join(f.root, "must-not-exist")), false);
  assert.equal(f.disk.scan(f.p.id).token, view.token);
});
test("selected disk adoption preserves physical inode/mtime/bytes, source history, supporting files and exact exported source bytes", (t) => {
  const f = fixture(t);
  write(f, "nested/new.tex", "New ordinary source.");
  write(f, "asset.bin", Buffer.from([0, 1, 255]));
  fs.mkdirSync(f.file("empty"));
  const view = f.disk.scan(f.p.id),
    stat = fs.statSync(f.file("nested/new.tex")),
    source = f.store.readText(f.p.id, "main.tex"),
    beforeHistory = f.store.checkpoints(f.p.id).length;
  const result = f.disk.apply(f.p.id, input(view, ["nested/new.tex", "empty"]));
  assert.equal(result.replayed, false);
  assert.equal(
    f.store.readText(f.p.id, "nested/new.tex").content,
    "New ordinary source.",
  );
  assert.equal(f.store.file(f.p.id, "empty").kind, "directory");
  assert.equal(fs.statSync(f.file("nested/new.tex")).ino, stat.ino);
  assert.equal(fs.statSync(f.file("nested/new.tex")).mtimeMs, stat.mtimeMs);
  assert.deepEqual(f.store.readText(f.p.id, "main.tex"), source);
  assert.ok(f.store.checkpoints(f.p.id).length >= beforeHistory + 2);
  assert.equal(
    f.store.fileList(f.p.id).some((e) => e.path === "asset.bin"),
    false,
  );
  assert.deepEqual(
    fs.readFileSync(f.file("asset.bin")),
    Buffer.from([0, 1, 255]),
  );
  assert.ok(
    f.store
      .exportFiles(f.p.id)
      .find((e) => e.path === "nested/new.tex")!
      .data.equals(Buffer.from("New ordinary source.")),
  );
});
test("indexed external modifications/deletions/restored Trash are reported but never silently adopted with new files", (t) => {
  const f = fixture(t);
  f.store.trash(f.p.id, "refs.bib");
  write(f, "refs.bib", "External restored reference.");
  write(f, "main.tex", "External main.");
  write(f, "new.tex", "New source.");
  const view = f.disk.scan(f.p.id);
  assert.deepEqual(view.changed.map((c) => [c.path, c.change]).sort(), [
    ["main.tex", "modified"],
    ["refs.bib", "restored"],
  ]);
  f.disk.apply(f.p.id, input(view));
  assert.equal(
    f.store.readText(f.p.id, "main.tex").content,
    "Original source.\n",
  );
  assert.equal(fs.readFileSync(f.file("main.tex"), "utf8"), "External main.");
  assert.equal(f.store.file(f.p.id, "refs.bib", true).deleted, 1);
  fs.unlinkSync(f.file("main.tex"));
  assert.equal(
    f.disk.scan(f.p.id).changed.find((e) => e.path === "main.tex")?.change,
    "deleted",
  );
});
test("changed disk content, additions, deletion or project revisions invalidate a proposal atomically", (t) => {
  const f = fixture(t);
  write(f, "new.tex", "Before.");
  let view = f.disk.scan(f.p.id),
    before = snapshot(f);
  write(f, "new.tex", "After.");
  assert.throws(() => f.disk.apply(f.p.id, input(view)), /changed/);
  assert.equal(snapshot(f), before);
  view = f.disk.scan(f.p.id);
  write(f, "other.tex", "Other.");
  assert.throws(() => f.disk.apply(f.p.id, input(view)), /changed/);
  view = f.disk.scan(f.p.id);
  fs.unlinkSync(f.file("other.tex"));
  assert.throws(() => f.disk.apply(f.p.id, input(view)), /changed/);
  view = f.disk.scan(f.p.id);
  f.store.save(f.p.id, "main.tex", "New saved revision.", 0);
  before = snapshot(f);
  assert.throws(() => f.disk.apply(f.p.id, input(view)), /changed/);
  assert.equal(snapshot(f), before);
  assert.equal(
    f.store.fileList(f.p.id).some((e) => e.path === "new.tex"),
    false,
  );
});
test("adoption replays exactly once after restart and never overwrites later edits; request IDs bind project/selection/token", (t) => {
  const f = fixture(t);
  write(f, "new.tex", "Imported.");
  const view = f.disk.scan(f.p.id),
    request = input(view);
  f.disk.apply(f.p.id, request);
  f.reopen();
  f.store.save(f.p.id, "new.tex", "Later editor text.", 0);
  const before = snapshot(f),
    reply = f.disk.apply(f.p.id, request);
  assert.equal(reply.replayed, true);
  assert.equal(snapshot(f), before);
  assert.equal(
    fs.readFileSync(f.file("new.tex"), "utf8"),
    "Later editor text.",
  );
  assert.throws(
    () => f.disk.apply(f.p.id, { ...request, token: "0".repeat(64) }),
    /identifier/,
  );
  assert.throws(
    () => f.disk.apply(f.p.id, { ...request, paths: ["main.tex"] }),
    /identifier/,
  );
});
test("plain source ownership blocks new adoption while allowing read-only inspection and replay acknowledgment", (t) => {
  const f = fixture(t);
  write(f, "new.tex", "New.");
  const view = f.disk.scan(f.p.id),
    request = input(view),
    before = snapshot(f);
  f.store.locks.set(f.p.id + "/main.tex", "fixture-run");
  assert.ok(f.disk.scan(f.p.id).added.length);
  assert.throws(() => f.disk.apply(f.p.id, request), /reserved/);
  assert.equal(snapshot(f), before);
  f.store.locks.clear();
  f.disk.apply(f.p.id, request);
  f.store.projectLocks.set(f.p.id, "fixture-run");
  assert.equal(f.disk.apply(f.p.id, request).replayed, true);
  f.store.projectLocks.clear();
});
test("hidden/protected directory contents are never inspected and unsafe links/hardlinks remain untouched", (t) => {
  const f = fixture(t);
  write(f, ".hidden/secret.txt", "Hidden sentinel.");
  write(f, "holdout/secret.txt", "Protected synthetic sentinel.");
  write(f, "outside-target.txt", "Ordinary.");
  fs.symlinkSync(path.join(f.root, "not-in-project"), f.file("broken-link"));
  fs.symlinkSync(f.file(".hidden"), f.file("linked-dir"));
  fs.linkSync(f.file("outside-target.txt"), f.file("hard-link.txt"));
  const original = f.store.disk.inspect.bind(f.store.disk),
    seen: string[] = [];
  f.store.disk.inspect = (id, name) => {
    seen.push(name);
    return original(id, name);
  };
  const view = f.disk.scan(f.p.id);
  assert.ok(view.skipped.length >= 5);
  assert.equal(
    seen.some((n) => n.startsWith(".hidden") || n.startsWith("holdout")),
    false,
  );
  assert.equal(
    view.added.some(
      (e) =>
        e.path.includes("link") ||
        e.path.startsWith(".hidden") ||
        e.path.startsWith("holdout"),
    ),
    false,
  );
  assert.equal(fs.lstatSync(f.file("linked-dir")).isSymbolicLink(), true);
});
test("symlinked storage roots are rejected without reading their targets", (t) => {
  const f = fixture(t),
    root = f.store.projectDir(f.p.id),
    held = root + "-original";
  fs.renameSync(root, held);
  fs.symlinkSync(held, root);
  assert.throws(() => f.disk.scan(f.p.id), /plain directory/);
  fs.unlinkSync(root);
  fs.renameSync(held, root);
});
test("malformed selections and stale/non-new paths never partially import", (t) => {
  const f = fixture(t);
  write(f, "new.tex", "New.");
  const view = f.disk.scan(f.p.id),
    before = snapshot(f);
  for (const patch of [
    { paths: [] },
    { paths: ["../escape"] },
    { paths: ["new.tex", "new.tex"] },
    { requestId: "bad" },
    { token: "bad" },
    { paths: ["main.tex"] },
    { paths: ["new.tex", "not-present"] },
  ])
    assert.throws(() => f.disk.apply(f.p.id, { ...input(view), ...patch }));
  assert.equal(snapshot(f), before);
});
test("oversized content and excessive entries stop before any adoption", (t) => {
  const f = fixture(t);
  const fd = fs.openSync(f.file("huge.bin"), "w");
  fs.ftruncateSync(fd, 100 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  const before = snapshot(f);
  assert.throws(() => f.disk.scan(f.p.id), /100 MiB/);
  assert.equal(snapshot(f), before);
  fs.unlinkSync(f.file("huge.bin"));
  fs.mkdirSync(f.file("many"));
  for (let i = 0; i < 10001; i++) fs.writeFileSync(f.file("many/f" + i), "");
  assert.throws(() => f.disk.scan(f.p.id), /10,000/);
  assert.equal(snapshot(f), before);
});
test("local APIs expose a guarded review/import and no side effects from inspection", async (t) => {
  const root = fs.mkdtempSync(path.resolve("data/verification/discovery-api-")),
    f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("API fixture", [
    { path: "main.tex", data: Buffer.from("Original.") },
  ]);
  fs.writeFileSync(path.join(f.store.projectDir(p.id), "new.tex"), "API new.");
  const url = "/api/projects/" + p.id + "/disk/discovery",
    headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
  const before = JSON.stringify(f.store.project(p.id)),
    preview = await f.app.inject({ url, headers });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(JSON.stringify(f.store.project(p.id)), before);
  const blocked = await f.app.inject({
    method: "POST",
    url,
    headers: { host: "127.0.0.1:5173" },
    payload: input(preview.json()),
  });
  assert.equal(blocked.statusCode, 403);
  const result = await f.app.inject({
    method: "POST",
    url,
    headers,
    payload: input(preview.json()),
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(f.store.readText(p.id, "new.tex").content, "API new.");
});

test("failed metadata adoption rolls back every new row, receipt and checkpoint while physical files stay exact", (t) => {
  const f = fixture(t);
  write(f, "a.tex", "A source.");
  write(f, "b.tex", "B source.");
  const view = f.disk.scan(f.p.id),
    request = input(view),
    before = snapshot(f),
    insert = f.store.insert.bind(f.store);
  let count = 0;
  f.store.insert = (...args: Parameters<Store["insert"]>) => {
    if (++count === 2) throw Error("Synthetic database failure");
    return insert(...args);
  };
  assert.throws(
    () => f.disk.apply(f.p.id, request),
    /Synthetic database failure/,
  );
  assert.equal(snapshot(f), before);
  assert.equal(
    f.store.db
      .prepare("SELECT 1 FROM disk_imports WHERE request=?")
      .get(request.requestId),
    undefined,
  );
  assert.equal(fs.readFileSync(f.file("a.tex"), "utf8"), "A source.");
  assert.equal(fs.readFileSync(f.file("b.tex"), "utf8"), "B source.");
  f.store.insert = insert;
  assert.equal(f.disk.apply(f.p.id, request).imported.length, 2);
});
test("a directory changing during enumeration invalidates the whole scan without importing partial entries", (t) => {
  const f = fixture(t);
  write(f, "new.tex", "New.");
  const original = fs.opendirSync,
    before = snapshot(f);
  let changed = false;
  fs.opendirSync = ((...args: any[]) => {
    const dir = (original as any)(...args),
      read = dir.readSync.bind(dir);
    if (args[0] === f.store.projectDir(f.p.id))
      dir.readSync = () => {
        const result = read();
        if (!changed && result) {
          changed = true;
          write(f, "late.tex", "Late addition.");
        }
        return result;
      };
    return dir;
  }) as typeof fs.opendirSync;
  t.after(() => {
    fs.opendirSync = original;
  });
  assert.throws(() => f.disk.scan(f.p.id), /entries changed/);
  assert.equal(snapshot(f), before);
});
test("aggregate byte limits apply to ordinary files before a second large allocation", (t) => {
  const f = fixture(t);
  for (const name of ["first.bin", "second.bin"]) {
    const fd = fs.openSync(f.file(name), "w");
    fs.ftruncateSync(fd, 70 * 1024 * 1024);
    fs.closeSync(fd);
  }
  const before = snapshot(f);
  assert.throws(() => f.disk.scan(f.p.id), /128 MiB/);
  assert.equal(snapshot(f), before);
});

for (const mode of ["during", "after"] as const)
  test(`actual child death ${mode} disk adoption preserves physical bytes and an atomic replay receipt`, async (t) => {
    const f = fixture(t);
    write(f, "new-a.tex", "New A.");
    write(f, "new-b.tex", "New B.");
    const before = fs.statSync(f.file("new-a.tex")),
      view = f.disk.scan(f.p.id),
      request = input(view);
    fs.writeFileSync(
      path.join(f.root, "import-request.json"),
      JSON.stringify(request),
    );
    const { spawn } = await import("node:child_process"),
      child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          path.resolve("tests/fixtures/disk-import-crash.ts"),
          f.root,
          f.p.id,
          mode,
        ],
        {
          cwd: process.cwd(),
          env: {
            PATH: process.env.PATH,
            TMPDIR: process.env.TMPDIR,
            HOME: f.root,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
    let error = "";
    child.stderr.on("data", (d) => (error += d.toString()));
    const outcome = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(outcome.signal, "SIGKILL", error);
    assert.equal(
      fs.readFileSync(path.join(f.root, "crash-point"), "utf8"),
      mode,
    );
    assert.equal(fs.readFileSync(f.file("new-a.tex"), "utf8"), "New A.");
    assert.equal(fs.readFileSync(f.file("new-b.tex"), "utf8"), "New B.");
    assert.equal(fs.statSync(f.file("new-a.tex")).ino, before.ino);
    assert.equal(fs.statSync(f.file("new-a.tex")).mtimeMs, before.mtimeMs);
    f.reopen();
    assert.equal(
      f.store.fileList(f.p.id).some((e) => e.path === "new-a.tex"),
      mode === "after",
    );
    assert.equal(
      f.store.fileList(f.p.id).some((e) => e.path === "new-b.tex"),
      mode === "after",
    );
    const result = f.disk.apply(f.p.id, request);
    assert.equal(result.replayed, mode === "after");
    assert.equal(
      f.store.db
        .prepare("SELECT count(*) AS n FROM disk_imports WHERE project=?")
        .get(f.p.id)?.n,
      1,
    );
    assert.equal(f.store.readText(f.p.id, "new-b.tex").content, "New B.");
  });
