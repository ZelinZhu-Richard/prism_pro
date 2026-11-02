import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { DISK_FILE_BYTES } from "../server/disk-files";
const original = "Original source α.\n";
function fixture(
  t: any,
  files = [{ path: "main.tex", data: Buffer.from(original) }],
) {
  const root = path.resolve("data/verification/disk-unit-" + randomUUID());
  let store = new Store(root);
  const project = store.create("Synthetic disk recovery", files);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    project,
    get store() {
      return store;
    },
    file: (name = "main.tex") =>
      path.join(root, "projects", project.id, "files", name),
    reopen: () => {
      store.close();
      store = new Store(root);
      return store;
    },
  };
}
function versions(store: Store, id: string, name = "main.tex") {
  return store.checkpoints(id).flatMap((c) =>
    store
      .exportCheckpoint(id, c.id)
      .filter((f) => f.path === name)
      .map((f) => f.data.toString("utf8")),
  );
}
function state(store: Store, id: string) {
  return {
    project: store.project(id),
    files: store.exportFiles(id),
    history: store.checkpoints(id),
  };
}
test("clean restart preserves exact source/history/mtime/inode without rewriting files", (t) => {
  const f = fixture(t),
    before = state(f.store, f.project.id),
    stat = fs.statSync(f.file());
  const rename = fs.renameSync;
  fs.renameSync = (() => {
    throw Error("Clean startup must not rewrite files");
  }) as typeof fs.renameSync;
  try {
    f.reopen();
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(state(f.store, f.project.id), before);
  const after = fs.statSync(f.file());
  assert.equal(after.ino, stat.ino);
  assert.equal(after.mtimeMs, stat.mtimeMs);
});
test("external Unicode source, bibliography and binary edits survive restart with exact before/after checkpoints", (t) => {
  const f = fixture(t, [
    { path: "main.tex", data: Buffer.from(original) },
    { path: "sections/a.tex", data: Buffer.from("Old section") },
    { path: "refs.bib", data: Buffer.from("@book{old,title={Old}}") },
    { path: "figure.png", data: Buffer.from([1, 2, 3]) },
  ]);
  const chat = f.store.createConversation(f.project.id, "Retain chat");
  f.store.setSetting("preferences", { theme: "dark", provider: "openai" });
  const changed = new Map([
    ["sections/a.tex", Buffer.from("  新段落 👩🏽‍💻 e\u0301\n\\cite{new}  ")],
    ["refs.bib", Buffer.from("@book{new,title={New title}}\n")],
    ["figure.png", Buffer.from([0, 255, 7, 9])],
  ]);
  for (const [name, data] of changed) fs.writeFileSync(f.file(name), data);
  const inode = fs.statSync(f.file("sections/a.tex")).ino;
  f.reopen();
  assert.equal(
    f.store.project(f.project.id).generation,
    f.project.generation + 1,
  );
  for (const [name, data] of changed) {
    assert.deepEqual(f.store.file(f.project.id, name).content, data);
    assert.deepEqual(fs.readFileSync(f.file(name)), data);
    assert.equal(f.store.file(f.project.id, name).revision, 1);
  }
  assert.equal(fs.statSync(f.file("sections/a.tex")).ino, inode);
  const report = f.store.setting("disk-recovery:" + f.project.id, null);
  assert.equal(report.paths.length, 3);
  assert.equal(
    f.store.historyFile(f.project.id, report.backup, "sections/a.tex").before,
    "Old section",
  );
  assert.equal(
    f.store.historyFile(f.project.id, report.recovered, "sections/a.tex")
      .before,
    changed.get("sections/a.tex")!.toString(),
  );
  assert.deepEqual(f.store.conversation(chat.id, f.project.id), chat);
  assert.deepEqual(f.store.setting("preferences", {}), {
    theme: "dark",
    provider: "openai",
  });
  const before = state(f.store, f.project.id);
  f.reopen();
  assert.deepEqual(state(f.store, f.project.id), before);
});
test("a recovered disk edit and its earlier app version can each be restored through existing file history", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file(), "External revision\n");
  f.reopen();
  const report = f.store.setting("disk-recovery:" + f.project.id, null);
  f.store.restoreCheckpointFile(f.project.id, report.backup, "main.tex", 1);
  assert.equal(fs.readFileSync(f.file(), "utf8"), original);
  f.store.restoreCheckpointFile(f.project.id, report.recovered, "main.tex", 2);
  assert.equal(fs.readFileSync(f.file(), "utf8"), "External revision\n");
});
test("externally deleted files stay deleted and their content remains recoverable in Trash/history", (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.file());
  f.reopen();
  assert.equal(fs.existsSync(f.file()), false);
  assert.equal(f.store.fileList(f.project.id)[0].deleted, true);
  assert.ok(versions(f.store, f.project.id).includes(original));
  f.store.trash(f.project.id, "main.tex", true);
  assert.equal(fs.readFileSync(f.file(), "utf8"), original);
});
test("a reappeared trashed file is recovered rather than removed at startup", (t) => {
  const f = fixture(t);
  f.store.trash(f.project.id, "main.tex");
  fs.writeFileSync(f.file(), "External restoration");
  f.reopen();
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "External restoration",
  );
  assert.equal(f.store.fileList(f.project.id)[0].deleted, false);
  assert.equal(fs.readFileSync(f.file(), "utf8"), "External restoration");
});
test("unindexed files/scripts are not read, executed, removed or imported on restart", (t) => {
  const f = fixture(t),
    sentinel = path.join(f.root, "must-not-exist");
  fs.writeFileSync(f.file("unindexed.sh"), `echo executed > '${sentinel}'\n`);
  fs.writeFileSync(f.file("unindexed.txt"), "Keep exact disk-only content");
  f.reopen();
  assert.equal(fs.existsSync(sentinel), false);
  assert.equal(
    fs.readFileSync(f.file("unindexed.txt"), "utf8"),
    "Keep exact disk-only content",
  );
  assert.equal(f.store.fileList(f.project.id).length, 1);
});
test("creating a managed file refuses an occupied unindexed path without losing either version", (t) => {
  const f = fixture(t),
    before = state(f.store, f.project.id);
  fs.writeFileSync(f.file("new.tex"), "Disk-only source");
  assert.throws(
    () => f.store.add(f.project.id, "new.tex", Buffer.from("App source")),
    /changed outside Leaf/,
  );
  assert.equal(fs.readFileSync(f.file("new.tex"), "utf8"), "Disk-only source");
  assert.deepEqual(state(f.store, f.project.id), before);
});
test("large external text is recovered byte-exact as download-only content", (t) => {
  const f = fixture(t),
    bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 97);
  fs.writeFileSync(f.file(), bytes);
  f.reopen();
  assert.equal(f.store.file(f.project.id, "main.tex").kind, "binary");
  assert.deepEqual(f.store.file(f.project.id, "main.tex").content, bytes);
  assert.deepEqual(fs.readFileSync(f.file()), bytes);
  assert.ok(versions(f.store, f.project.id).includes(original));
});
test("an inconsistent external parent and interrupted new descendant block only their project", (t) => {
  const f = fixture(t, [
      { path: "main.tex", data: Buffer.from(original) },
      { path: "folder", directory: true, data: Buffer.alloc(0) },
    ] as any),
    healthy = f.store.create("Healthy", [
      { path: "main.tex", data: Buffer.from("Healthy") },
    ]);
  const rename = fs.renameSync;
  fs.renameSync = (() => {
    throw Error("Interrupted new file");
  }) as typeof fs.renameSync;
  try {
    assert.throws(
      () =>
        f.store.add(
          f.project.id,
          "folder/new.tex",
          Buffer.from("Pending source"),
        ),
      /Interrupted new file/,
    );
  } finally {
    fs.renameSync = rename;
  }
  fs.rmdirSync(f.file("folder"));
  fs.writeFileSync(f.file("folder"), "External parent file");
  f.reopen();
  assert.throws(
    () => f.store.readText(f.project.id, "main.tex"),
    /inconsistent recovered tree/,
  );
  assert.equal(
    fs.readFileSync(f.file("folder"), "utf8"),
    "External parent file",
  );
  assert.equal(f.store.readText(healthy.id, "main.tex").content, "Healthy");
  assert.equal(
    Buffer.from(
      f.store.db
        .prepare("SELECT content FROM files WHERE project=? AND path=?")
        .get(f.project.id, "folder/new.tex")!.content as Uint8Array,
    ).toString(),
    "Pending source",
  );
});
test("legacy projects without receipts preserve external edits and archive the old database version", (t) => {
  const f = fixture(t);
  f.store.db.exec("DELETE FROM file_disk_state");
  fs.writeFileSync(f.file(), "Legacy external edit");
  f.reopen();
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "Legacy external edit",
  );
  assert.ok(versions(f.store, f.project.id).includes(original));
  assert.ok(versions(f.store, f.project.id).includes("Legacy external edit"));
});
function failedSave(f: ReturnType<typeof fixture>, text = "Saved app version") {
  const rename = fs.renameSync;
  fs.renameSync = ((from: any, to: any) => {
    if (String(from).endsWith(".prism-tmp"))
      throw Error("Injected disk write failure");
    return rename(from, to);
  }) as typeof fs.renameSync;
  try {
    assert.throws(
      () => f.store.save(f.project.id, "main.tex", text, 0),
      /disk write failure/,
    );
  } finally {
    fs.renameSync = rename;
  }
}
test("restart replays a committed write whose original disk state still matches", (t) => {
  const f = fixture(t);
  failedSave(f);
  assert.equal(fs.readFileSync(f.file(), "utf8"), original);
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "Saved app version",
  );
  f.reopen();
  assert.equal(fs.readFileSync(f.file(), "utf8"), "Saved app version");
  assert.equal(f.store.readText(f.project.id, "main.tex").revision, 1);
});
test("external changes after an interrupted write win on disk and both app/external versions remain recoverable", (t) => {
  const f = fixture(t);
  failedSave(f);
  fs.writeFileSync(f.file(), "External after crash");
  f.reopen();
  assert.equal(fs.readFileSync(f.file(), "utf8"), "External after crash");
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "External after crash",
  );
  assert.ok(versions(f.store, f.project.id).includes("Saved app version"));
  assert.ok(versions(f.store, f.project.id).includes("External after crash"));
  assert.ok(versions(f.store, f.project.id).includes(original));
});
test("active external edits reject Save before changing source revisions or history", (t) => {
  const f = fixture(t),
    before = state(f.store, f.project.id);
  fs.writeFileSync(f.file(), "External while Leaf is open");
  assert.throws(
    () => f.store.save(f.project.id, "main.tex", "Unsent editor text", 0),
    /changed outside Leaf/,
  );
  assert.equal(
    fs.readFileSync(f.file(), "utf8"),
    "External while Leaf is open",
  );
  assert.deepEqual(state(f.store, f.project.id), before);
});
test("an edit during write staging invalidates replacement and keeps the committed app text in recovery history", (t) => {
  const f = fixture(t),
    sync = fs.fsyncSync;
  let inject = true;
  fs.fsyncSync = ((fd: number) => {
    if (inject) {
      inject = false;
      fs.writeFileSync(f.file(), "External during staging");
    }
    return sync(fd);
  }) as typeof fs.fsyncSync;
  try {
    assert.throws(
      () => f.store.save(f.project.id, "main.tex", "Committed editor text", 0),
      /changed while Leaf was saving/,
    );
  } finally {
    fs.fsyncSync = sync;
  }
  assert.equal(fs.readFileSync(f.file(), "utf8"), "External during staging");
  assert.ok(
    !fs
      .readdirSync(path.dirname(f.file()))
      .some((n) => n.endsWith(".prism-tmp")),
  );
  f.reopen();
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "External during staging",
  );
  assert.ok(versions(f.store, f.project.id).includes("Committed editor text"));
});
test("file/directory type changes preserve disk state and reconcile indexed descendants", (t) => {
  const f = fixture(t, [
    { path: "main.tex", data: Buffer.from(original) },
    { path: "folder", directory: true, data: Buffer.alloc(0) },
    { path: "folder/child.tex", data: Buffer.from("Child source") },
  ] as any);
  fs.unlinkSync(f.file());
  fs.mkdirSync(f.file());
  fs.writeFileSync(
    path.join(f.file(), "unindexed.txt"),
    "Inside new directory",
  );
  fs.rmSync(f.file("folder"), { recursive: true });
  fs.writeFileSync(f.file("folder"), "Directory became file");
  f.reopen();
  assert.equal(f.store.file(f.project.id, "main.tex").kind, "directory");
  assert.equal(f.store.file(f.project.id, "folder").kind, "binary");
  assert.equal(
    f.store.fileList(f.project.id).find((x) => x.path === "folder/child.tex")
      ?.deleted,
    true,
  );
  assert.equal(
    fs.readFileSync(path.join(f.file(), "unindexed.txt"), "utf8"),
    "Inside new directory",
  );
});
for (const bytes of [Buffer.from([0xff, 0xfe, 0x80]), Buffer.from([0, 1, 2])])
  test(`non-text disk content is preserved byte-exact and never decoded into editable text (${bytes[0]})`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.file(), bytes);
    f.reopen();
    assert.deepEqual(f.store.file(f.project.id, "main.tex").content, bytes);
    assert.equal(f.store.file(f.project.id, "main.tex").kind, "binary");
    assert.throws(
      () => f.store.readText(f.project.id, "main.tex"),
      /not editable/,
    );
  });
for (const kind of ["symlink", "hardlink", "fifo", "oversized"] as const)
  test(
    `unsafe ${kind} is preserved and blocks only that project, without unsafe reads`,
    { skip: process.platform === "win32" },
    (t) => {
      const f = fixture(t),
        healthy = f.store.create("Healthy project", [
          { path: "main.tex", data: Buffer.from("Healthy") },
        ]);
      const outside = path.join(f.root, "synthetic-sentinel.txt");
      fs.writeFileSync(outside, "Outside synthetic sentinel");
      fs.unlinkSync(f.file());
      if (kind === "symlink") fs.symlinkSync(outside, f.file());
      if (kind === "hardlink") fs.linkSync(outside, f.file());
      if (kind === "fifo")
        assert.equal(spawnSync("mkfifo", [f.file()]).status, 0);
      if (kind === "oversized") {
        const fd = fs.openSync(f.file(), "w");
        fs.ftruncateSync(fd, DISK_FILE_BYTES + 1);
        fs.closeSync(fd);
      }
      f.reopen();
      assert.throws(
        () => f.store.readText(f.project.id, "main.tex"),
        /preserved/,
      );
      assert.equal(f.store.readText(healthy.id, "main.tex").content, "Healthy");
      assert.equal(
        fs.readFileSync(outside, "utf8"),
        "Outside synthetic sentinel",
      );
      assert.ok(fs.lstatSync(f.file()));
    },
  );
test("a failed multi-file adoption rolls back source/history while preserving all disk bytes", (t) => {
  const f = fixture(t, [
    { path: "main.tex", data: Buffer.from(original) },
    { path: "other.tex", data: Buffer.from("Old other") },
  ]);
  const before = state(f.store, f.project.id),
    insert = f.store.insert.bind(f.store);
  fs.writeFileSync(f.file(), "External main");
  fs.writeFileSync(f.file("other.tex"), "External other");
  f.store.insert = (...args: Parameters<Store["insert"]>) => {
    if (args[1] === "other.tex") throw Error("Injected adoption failure");
    return insert(...args);
  };
  assert.throws(() => f.store.reconcileDisk(f.project.id), /adoption failure/);
  f.store.insert = insert;
  assert.deepEqual(state(f.store, f.project.id), before);
  assert.equal(fs.readFileSync(f.file(), "utf8"), "External main");
  assert.equal(fs.readFileSync(f.file("other.tex"), "utf8"), "External other");
  f.store.reconcileDisk(f.project.id);
  assert.equal(
    f.store.readText(f.project.id, "other.tex").content,
    "External other",
  );
});
test("real HTTP restart serves the external revision and preserves a downloadable earlier source snapshot", async (t) => {
  const root = path.resolve("data/verification/disk-api-" + randomUUID());
  let f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("API recovery", [
    { path: "main.tex", data: Buffer.from(original) },
  ]);
  const file = path.join(f.store.projectDir(p.id), "main.tex");
  await f.app.close();
  fs.writeFileSync(file, "Externally updated source");
  f = await createApp(root, { seed: false });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const read = await f.app.inject({
    method: "GET",
    url: `/api/projects/${p.id}/file?path=main.tex`,
    headers,
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().content, "Externally updated source");
  assert.equal(read.json().revision, 1);
  const saved = f.store.setting("disk-recovery:" + p.id, null);
  assert.ok(
    f.store
      .exportCheckpoint(p.id, saved.backup)
      .some((v) => v.path === "main.tex" && v.data.toString() === original),
  );
  const stale = await f.app.inject({
    method: "PUT",
    url: `/api/projects/${p.id}/file?path=main.tex`,
    headers,
    payload: { content: "Old client", revision: 0 },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(fs.readFileSync(file, "utf8"), "Externally updated source");
});
for (const phase of [
  "before-commit",
  "after-commit",
  "after-rename",
  "external-after-commit",
  "new-file",
  "delete",
])
  test(`actual process death recovers ${phase} without overwriting external changes`, (t) => {
    const root = path.resolve("data/verification/disk-crash-" + randomUUID());
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/disk-write-crash.ts", root, phase],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 91, result.stderr);
    const id = JSON.parse(
      fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
    ).id;
    const store = new Store(root);
    t.after(() => store.close());
    if (phase === "delete") {
      assert.equal(
        fs.existsSync(path.join(store.projectDir(id), "main.tex")),
        false,
      );
      assert.equal(store.fileList(id)[0].deleted, true);
      store.trash(id, "main.tex", true);
      assert.equal(
        store.readText(id, "main.tex").content,
        "Original committed source.\n",
      );
      return;
    }
    const expected =
      phase === "before-commit" || phase === "new-file"
        ? "Original committed source.\n"
        : phase === "external-after-commit"
          ? "External version after crash.\n"
          : "Latest committed app version.\n";
    assert.equal(store.readText(id, "main.tex").content, expected);
    assert.equal(
      fs.readFileSync(path.join(store.projectDir(id), "main.tex"), "utf8"),
      expected,
    );
    if (phase === "external-after-commit")
      assert.ok(
        versions(store, id).includes("Latest committed app version.\n"),
      );
    if (phase === "new-file")
      assert.equal(
        store.readText(id, "added.tex").content,
        "Committed new file.\n",
      );
    assert.ok(versions(store, id).includes(expected));
  });
