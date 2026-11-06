import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import {
  captureDirectory,
  directoryPathsOverlap,
} from "../server/project-directories";
import { DiskConflict } from "../server/disk-files";
import { FileMoves, commitFileTree } from "../server/file-moves";
import { FileBatches } from "../server/file-batches";
import { readZip, writeZip } from "../server/files";
const text =
  "\\documentclass{article}\n\\begin{document}\nOriginal 新 👩🏽‍💻 é.\n\\end{document}\n";
function fixture(t: any) {
  const root = path.resolve(
      "data/verification/folder-boundary-test-" + randomUUID(),
    ),
    source = path.join(root, "ordinary project"),
    data = path.join(root, "state");
  fs.mkdirSync(path.join(source, "sections"), { recursive: true });
  fs.writeFileSync(path.join(source, "main.tex"), text);
  fs.writeFileSync(path.join(source, "sections/one.tex"), "Included source.\n");
  fs.writeFileSync(
    path.join(source, "unknown.bin"),
    Buffer.from([0, 255, 1, 9]),
  );
  const entries = [
    { path: "main.tex", data: Buffer.from(text) },
    { path: "sections/one.tex", data: Buffer.from("Included source.\n") },
  ];
  const f = {
    root,
    source,
    data,
    entries,
    store: new Store(data),
    open() {
      return f.store.createLinked(
        "Ordinary source",
        captureDirectory(source),
        entries,
      );
    },
    reopen() {
      f.store.close();
      f.store = new Store(data);
      return f.store;
    },
  };
  t.after(() => {
    f.store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return f;
}
function sourceState(f: ReturnType<typeof fixture>) {
  const names = ["main.tex", "sections/one.tex", "unknown.bin"];
  return names.map((name) => {
    const file = path.join(f.source, name),
      s = fs.lstatSync(file);
    return {
      name,
      ino: s.ino,
      mode: s.mode,
      mtime: s.mtimeMs,
      bytes: fs.readFileSync(file).toString("base64"),
    };
  });
}
function canonical(s: Store, id: string) {
  return JSON.stringify({
    row: s.requireProject(id, true),
    files: s
      .exportFiles(id)
      .map((e) => ({ path: e.path, bytes: e.data.toString("base64") })),
    versions: s.db.prepare("SELECT * FROM versions WHERE project=?").all(id),
    history: s.checkpoints(id),
    receipts: s.db
      .prepare("SELECT * FROM file_disk_state WHERE project=? ORDER BY path")
      .all(id),
  });
}

test("opening indexes exact existing bytes without touching source identities, mode, timestamps or unknown files", (t) => {
  const f = fixture(t),
    before = sourceState(f),
    identity = captureDirectory(f.source),
    p = f.open();
  assert.deepEqual(sourceState(f), before);
  assert.deepEqual(captureDirectory(f.source), identity);
  assert.equal(f.store.projectDir(p.id), fs.realpathSync(f.source));
  assert.equal(p.storage?.kind, "linked");
  assert.equal(p.storage?.available, true);
  assert.equal(p.generation, 0);
  assert.equal(f.store.readText(p.id, "main.tex").content, text);
  assert(!fs.existsSync(path.join(f.data, "projects", p.id, "files")));
  assert(
    !JSON.stringify(
      f.store.snapshot(p.id, f.store.checkpoints(p.id)[0].id),
    ).includes(f.source),
  );
});
test("managed projects retain their existing storage shape and folder construction", (t) => {
  const f = fixture(t),
    p = f.store.create("Managed", f.entries);
  assert(!Object.hasOwn(p, "storage"));
  assert.equal(
    f.store.projectDir(p.id),
    path.join(f.data, "projects", p.id, "files"),
  );
  assert.equal(
    fs.readFileSync(path.join(f.store.projectDir(p.id), "main.tex"), "utf8"),
    text,
  );
});
test("duplicate and overlapping live directories reject without reserving or modifying source", (t) => {
  const f = fixture(t),
    p = f.open(),
    before = sourceState(f);
  assert.throws(() => f.open(), /already open/);
  assert.throws(
    () =>
      f.store.createLinked(
        "Nested",
        captureDirectory(path.join(f.source, "sections")),
        [{ path: "one.tex", data: Buffer.from("Included source.\n") }],
      ),
    /overlaps/,
  );
  assert.throws(
    () => f.store.createLinked("Parent", captureDirectory(f.root), []),
    /application data/,
  );
  assert.equal(f.store.list().length, 1);
  assert.equal(f.store.directories.existing(captureDirectory(f.source)), p.id);
  assert.deepEqual(sourceState(f), before);
  assert.deepEqual(fs.readdirSync(path.join(f.data, "projects")), [p.id]);
});
test("application-data/ancestor candidates reject before any project directory is allocated", (t) => {
  const f = fixture(t);
  for (const folder of [f.data, f.root])
    assert.throws(
      () => f.store.createLinked("Unsafe", captureDirectory(folder), []),
      /application data/,
    );
  assert.equal(f.store.list().length, 0);
  assert(!fs.existsSync(path.join(f.data, "projects")));
});
test("protected, parent, relative, control and incomplete Unicode input reject before filesystem lookup", (t) => {
  const f = fixture(t),
    lookup = t.mock.method(fs, "lstatSync", () => {
      throw Error("Unexpected filesystem access");
    });
  for (const value of [
    "relative",
    "/project/../folder",
    path.join(f.root, "holdout"),
    "bad\0path",
    "/bad\npath",
    "/bad\ud800",
    null,
  ])
    assert.throws(() => captureDirectory(value), /path|folder/i);
  assert.equal(lookup.mock.callCount(), 0);
  lookup.mock.restore();
});
test("root symlinks reject and an allowed ancestor alias records the canonical identity", (t) => {
  const f = fixture(t),
    link = path.join(f.root, "source-link"),
    alias = path.join(f.root, "parent-alias");
  fs.symlinkSync(f.source, link);
  assert.throws(() => captureDirectory(link), /symlink/);
  fs.symlinkSync(f.root, alias);
  assert.deepEqual(
    captureDirectory(path.join(alias, "ordinary project")),
    captureDirectory(f.source),
  );
});
test("changed captured contents abort adoption and clean only reserved app metadata", (t) => {
  const f = fixture(t),
    identity = captureDirectory(f.source);
  fs.writeFileSync(path.join(f.source, "main.tex"), "External candidate.\n");
  assert.throws(
    () => f.store.createLinked("Stale", identity, f.entries),
    DiskConflict,
  );
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    "External candidate.\n",
  );
  assert.equal(f.store.list().length, 0);
  assert.equal(
    f.store.db.prepare("SELECT * FROM project_directories").all().length,
    0,
  );
  assert.deepEqual(fs.readdirSync(path.join(f.data, "projects")), []);
});
test("symlinked indexed descendants cannot be adopted or written outside the chosen root", (t) => {
  const f = fixture(t),
    other = path.join(f.root, "other.tex");
  fs.writeFileSync(other, "Separate original.");
  fs.unlinkSync(path.join(f.source, "main.tex"));
  fs.symlinkSync(other, path.join(f.source, "main.tex"));
  assert.throws(() => f.open(), DiskConflict);
  assert.equal(fs.readFileSync(other, "utf8"), "Separate original.");
  assert.equal(f.store.list().length, 0);
});
test("replacement root blocks reads/writes/reconciliation and never materializes a managed fallback", (t) => {
  const f = fixture(t),
    p = f.open(),
    old = f.source + " old";
  fs.renameSync(f.source, old);
  fs.mkdirSync(f.source);
  fs.writeFileSync(path.join(f.source, "main.tex"), "Replacement source.");
  const before = canonical(f.store, p.id);
  assert.equal(f.store.project(p.id).storage?.available, false);
  for (const action of [
    () => f.store.projectDir(p.id),
    () => f.store.readText(p.id, "main.tex"),
    () => f.store.save(p.id, "main.tex", "Unwanted.", 0),
    () => f.store.add(p.id, "new.tex", Buffer.from("Unwanted.")),
    () => f.store.materialize(p.id),
    () => f.store.reconcileDisk(p.id),
  ])
    assert.throws(action, DiskConflict);
  assert.equal(canonical(f.store, p.id), before);
  f.reopen();
  assert.equal(f.store.project(p.id).storage?.available, false);
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    "Replacement source.",
  );
  assert.equal(fs.readFileSync(path.join(old, "main.tex"), "utf8"), text);
  assert(!fs.existsSync(path.join(f.data, "projects", p.id, "files")));
});
test("missing root remains missing at restart; restoring the original folder explicitly recovers external edits", (t) => {
  const f = fixture(t),
    p = f.open(),
    away = f.source + " away";
  fs.renameSync(f.source, away);
  fs.writeFileSync(
    path.join(away, "main.tex"),
    "Externally edited while moved.\n",
  );
  f.reopen();
  assert(!fs.existsSync(f.source));
  assert.equal(f.store.project(p.id).storage?.available, false);
  fs.renameSync(away, f.source);
  f.store.reconcileDisk(p.id);
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    "Externally edited while moved.\n",
  );
  assert.equal(f.store.project(p.id).generation, 1);
  assert(
    f.store.db
      .prepare("SELECT content FROM versions WHERE project=?")
      .all(p.id)
      .some((v: any) => Buffer.from(v.content).toString() === text),
  );
});
test("a symlink replacing the bound root never changes the symlink target or starts fallback recovery", (t) => {
  const f = fixture(t),
    p = f.open(),
    old = f.source + " old",
    other = path.join(f.root, "different");
  fs.renameSync(f.source, old);
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, "main.tex"), "Other project.");
  fs.symlinkSync(other, f.source);
  f.reopen();
  assert.equal(f.store.project(p.id).storage?.available, false);
  assert.throws(
    () => f.store.save(p.id, "main.tex", "Unwanted.", 0),
    DiskConflict,
  );
  assert.equal(
    fs.readFileSync(path.join(other, "main.tex"), "utf8"),
    "Other project.",
  );
  assert(!fs.existsSync(path.join(f.data, "projects", p.id, "files")));
});
test("bound root birth identity is validated independently of its path/device/inode", (t) => {
  const f = fixture(t),
    identity = captureDirectory(f.source);
  assert.throws(
    () =>
      f.store.createLinked(
        "Wrong birth",
        {
          ...identity,
          birthtime: (BigInt(identity.birthtime) + 1n).toString(),
        },
        f.entries,
      ),
    DiskConflict,
  );
  assert.equal(f.store.list().length, 0);
});
test("ordinary saves target the opened folder, preserve unknown files and reject later external edits", (t) => {
  const f = fixture(t),
    p = f.open(),
    unknown = fs.lstatSync(path.join(f.source, "unknown.bin")).ino;
  const saved = f.store.save(p.id, "main.tex", text + "% Local edit.\n", 0);
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    saved.content,
  );
  fs.writeFileSync(
    path.join(f.source, "main.tex"),
    "External second version.\n",
  );
  const before = canonical(f.store, p.id);
  assert.throws(
    () => f.store.save(p.id, "main.tex", "Stale edit.", saved.revision),
    DiskConflict,
  );
  assert.equal(canonical(f.store, p.id), before);
  f.store.reconcileDisk(p.id);
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    "External second version.\n",
  );
  assert.equal(fs.lstatSync(path.join(f.source, "unknown.bin")).ino, unknown);
  assert.deepEqual(
    fs.readFileSync(path.join(f.source, "unknown.bin")),
    Buffer.from([0, 255, 1, 9]),
  );
});
test("an empty ordinary folder is adopted without creating source and accepts an explicit new file", (t) => {
  const f = fixture(t),
    folder = path.join(f.root, "empty");
  fs.mkdirSync(folder);
  const identity = captureDirectory(folder),
    p = f.store.createLinked("Empty", identity, []);
  assert.deepEqual(fs.readdirSync(folder), []);
  f.store.add(p.id, "nested/main.tex", Buffer.from(text));
  assert.equal(
    fs.readFileSync(path.join(folder, "nested/main.tex"), "utf8"),
    text,
  );
  assert.deepEqual(captureDirectory(folder), identity);
});
test("file history restore writes only indexed source and retains the selected folder identity and unknown bytes", (t) => {
  const f = fixture(t),
    p = f.open(),
    identity = captureDirectory(f.source),
    checkpoint = f.store.checkpoints(p.id)[0];
  f.store.save(p.id, "main.tex", text + "Changed.\n", 0);
  f.store.restoreCheckpointFile(p.id, checkpoint.id, "main.tex", 1);
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  assert.deepEqual(captureDirectory(f.source), identity);
  assert.deepEqual(
    fs.readFileSync(path.join(f.source, "unknown.bin")),
    Buffer.from([0, 255, 1, 9]),
  );
});
test("project Trash is metadata-only and restoration adopts external changes before any write", (t) => {
  const f = fixture(t),
    p = f.open(),
    before = sourceState(f);
  f.store.trashProject(p.id);
  assert.deepEqual(sourceState(f), before);
  fs.writeFileSync(path.join(f.source, "main.tex"), "Edited while closed.\n");
  f.reopen();
  assert.equal(f.store.list().length, 0);
  const restored = f.store.trashProject(p.id, true);
  assert.equal(restored.generation, 1);
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    "Edited while closed.\n",
  );
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    "Edited while closed.\n",
  );
});
test("missing opened folders can be closed/restored logically without being recreated", (t) => {
  const f = fixture(t),
    p = f.open(),
    away = f.source + " away";
  fs.renameSync(f.source, away);
  f.store.trashProject(p.id);
  f.reopen();
  const restored = f.store.trashProject(p.id, true);
  assert.equal(restored.storage?.available, false);
  assert(!fs.existsSync(f.source));
  assert.equal(fs.readFileSync(path.join(away, "main.tex"), "utf8"), text);
});
test("legacy whole-tree operations are blocked before source/receipt/history changes and never inspect sibling journals", (t) => {
  const f = fixture(t),
    sentinel = path.join(f.root, "file-tree-operation.json");
  fs.writeFileSync(sentinel, "Not a Leaf journal.");
  const p = f.open(),
    before = canonical(f.store, p.id),
    source = sourceState(f);
  f.store.materialize(p.id);
  f.store.reconcileDisk(p.id);
  const unchanged = canonical(f.store, p.id);
  assert.throws(
    () =>
      commitFileTree(
        f.store,
        p.id,
        () => assert.fail("No staging"),
        () => assert.fail("No mutation"),
      ),
    /managed project storage/,
  );
  assert.equal(canonical(f.store, p.id), unchanged);
  assert.deepEqual(sourceState(f), source);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "Not a Leaf journal.");
  assert.equal(before, unchanged);
});
test("linked folder rename, reviewed reference updates and Undo preserve unknown descendants and the root identity", (t) => {
  const f = fixture(t),
    main = path.join(f.source, "main.tex"),
    original = text.replace("Original", "\\input{sections/one}\nOriginal");
  fs.writeFileSync(main, original);
  f.entries[0].data = Buffer.from(original);
  const p = f.open(),
    physical = captureDirectory(f.source),
    folder = captureDirectory(path.join(f.source, "sections")),
    diskOnly = path.join(f.source, "sections/disk-only.bin"),
    operationId = randomUUID(),
    moves = new FileMoves(f.store),
    review = moves.previewRename(p.id, "sections", "parts");
  fs.writeFileSync(diskOnly, Buffer.from([0, 255, 42]));
  const diskInode = fs.statSync(diskOnly).ino;
  const request = {
    generation: review.generation,
    requestId: operationId,
    updateReferences: true,
    referenceToken: review.references?.token,
  };
  moves.renameResult(p.id, "sections", "parts", request);
  assert.equal(
    fs.readFileSync(main, "utf8"),
    original.replace("sections/one", "parts/one"),
  );
  const moved = captureDirectory(path.join(f.source, "parts"));
  assert.deepEqual(moved, { ...folder, path: moved.path });
  assert.equal(
    fs.statSync(path.join(f.source, "parts/disk-only.bin")).ino,
    diskInode,
  );
  f.reopen();
  const reopened = new FileMoves(f.store);
  assert.equal(
    reopened.renameResult(p.id, "sections", "parts", request).replayed,
    true,
  );
  reopened.undo(p.id, operationId);
  assert.equal(fs.readFileSync(main, "utf8"), original);
  assert.equal(fs.statSync(diskOnly).ino, diskInode);
  assert.deepEqual(fs.readFileSync(diskOnly), Buffer.from([0, 255, 42]));
  assert.deepEqual(captureDirectory(f.source), physical);
});
test("linked case-only rename has exact on-disk spelling and preserves an unchanged file inode", (t) => {
  const f = fixture(t),
    p = f.open(),
    moves = new FileMoves(f.store),
    inode = fs.statSync(path.join(f.source, "main.tex")).ino;
  const result = moves.renameResult(p.id, "main.tex", "Main.tex");
  assert.equal(result.project.root, "Main.tex");
  assert(fs.readdirSync(f.source).includes("Main.tex"));
  assert(!fs.readdirSync(f.source).includes("main.tex"));
  assert.equal(fs.statSync(path.join(f.source, "Main.tex")).ino, inode);
  moves.undo(p.id, result.operationId);
  assert(fs.readdirSync(f.source).includes("main.tex"));
  assert.equal(fs.statSync(path.join(f.source, "main.tex")).ino, inode);
});
test("linked move preflight preserves an occupied destination and leaves no operation or receipt changes", (t) => {
  const f = fixture(t),
    p = f.open(),
    moves = new FileMoves(f.store),
    before = canonical(f.store, p.id);
  assert.throws(
    () => moves.rename(p.id, "main.tex", "unknown.bin"),
    /occupied/,
  );
  assert.equal(canonical(f.store, p.id), before);
  assert.deepEqual(
    fs.readFileSync(path.join(f.source, "unknown.bin")),
    Buffer.from([0, 255, 1, 9]),
  );
  fs.writeFileSync(
    path.join(f.source, "sections/one.tex"),
    "Edited outside Leaf.",
  );
  assert.throws(() => moves.rename(p.id, "sections", "parts"), DiskConflict);
  assert.equal(canonical(f.store, p.id), before);
});
test("an interrupted linked move blocks other source edits and keeps a new destination until explicitly cleared", (t) => {
  const f = fixture(t),
    p = f.open(),
    moves = new FileMoves(f.store),
    original = path.join(f.source, "main.tex"),
    target = path.join(f.source, "paper.tex"),
    request = { requestId: randomUUID(), generation: p.generation };
  const recover = t.mock.method(f.store.linkedMoves, "recover", () => {
    fs.writeFileSync(target, "External destination.");
    throw new DiskConflict("paper.tex");
  });
  assert.throws(
    () => moves.renameResult(p.id, "main.tex", "paper.tex", request),
    DiskConflict,
  );
  recover.mock.restore();
  f.reopen();
  assert.throws(() => f.store.unlocked(p.id), /move needs recovery/);
  assert.throws(
    () =>
      new FileMoves(f.store).renameResult(
        p.id,
        "main.tex",
        "paper.tex",
        request,
      ),
    /move needs recovery/,
  );
  assert.equal(fs.readFileSync(original, "utf8"), text);
  assert.equal(fs.readFileSync(target, "utf8"), "External destination.");
  fs.renameSync(target, path.join(f.source, "preserved-external.tex"));
  f.store.reconcileDisk(p.id);
  assert.equal(fs.readFileSync(target, "utf8"), text);
  assert.equal(
    fs.readFileSync(path.join(f.source, "preserved-external.tex"), "utf8"),
    "External destination.",
  );
  assert.equal(
    new FileMoves(f.store).renameResult(p.id, "main.tex", "paper.tex", request)
      .replayed,
    true,
  );
});
test("linked upload and Undo touch only reviewed paths and preserve the physical project root", (t) => {
  const f = fixture(t),
    p = f.open(),
    batches = new FileBatches(f.store),
    root = captureDirectory(f.source),
    contents = new Map([
      [1, Buffer.from([0, 19, 255])],
      [2, Buffer.from("Replacement\n")],
    ]),
    review = batches.uploadPreview(p.id, {
      destination: "",
      entries: [
        { path: "figures", directory: true, size: 0 },
        { path: "figures/deep/image.bin", size: 3 },
        { path: "main.tex", size: contents.get(2)!.length },
      ],
    }),
    input = {
      token: review.token,
      indices: [0, 1, 2],
      requestId: randomUUID(),
    },
    original = sourceState(f);
  batches.upload(p.id, input, contents);
  assert.deepEqual(
    fs.readFileSync(path.join(f.source, "figures/deep/image.bin")),
    contents.get(1),
  );
  assert.equal(f.store.readText(p.id, "main.tex").content, "Replacement\n");
  assert.deepEqual(captureDirectory(f.source), root);
  f.reopen();
  const reopened = new FileBatches(f.store);
  assert.equal(reopened.upload(p.id, input, contents).replayed, true);
  reopened.undo(p.id, input.requestId);
  assert.equal(f.store.readText(p.id, "main.tex").content, text);
  assert(!fs.existsSync(path.join(f.source, "figures")));
  assert.deepEqual(sourceState(f).slice(1), original.slice(1));
  assert.deepEqual(captureDirectory(f.source), root);
});
test("linked Trash preserves unindexed children and restores exact indexed bytes", (t) => {
  const f = fixture(t),
    p = f.open(),
    extra = path.join(f.source, "sections/private.bin");
  fs.writeFileSync(extra, Buffer.from([0, 42]));
  const before = canonical(f.store, p.id);
  assert.throws(() => f.store.trash(p.id, "sections"), /disk-only/);
  assert.equal(canonical(f.store, p.id), before);
  assert.deepEqual(fs.readFileSync(extra), Buffer.from([0, 42]));
  f.store.trash(p.id, "sections/one.tex");
  assert(!fs.existsSync(path.join(f.source, "sections/one.tex")));
  f.reopen();
  f.store.trash(p.id, "sections/one.tex", true);
  assert.equal(
    fs.readFileSync(path.join(f.source, "sections/one.tex"), "utf8"),
    "Included source.\n",
  );
  assert.deepEqual(fs.readFileSync(extra), Buffer.from([0, 42]));
});
test("linked batch rejects a disk-only collision before committing history or touching either file", (t) => {
  const f = fixture(t),
    p = f.open(),
    before = canonical(f.store, p.id),
    original = sourceState(f),
    batches = new FileBatches(f.store),
    review = batches.uploadPreview(p.id, {
      destination: "",
      entries: [
        { path: "main.tex", size: 1 },
        { path: "unknown.bin", size: 1 },
      ],
    });
  assert.throws(
    () =>
      batches.upload(
        p.id,
        {
          token: review.token,
          indices: [0, 1],
          requestId: randomUUID(),
        },
        new Map([
          [0, Buffer.from("A")],
          [1, Buffer.from("B")],
        ]),
      ),
    DiskConflict,
  );
  assert.equal(canonical(f.store, p.id), before);
  assert.deepEqual(sourceState(f), original);
});
test("linked batch recovery blocks stale retries and preserves a changed path and both app versions", (t) => {
  const f = fixture(t),
    p = f.open(),
    batches = new FileBatches(f.store),
    next = Buffer.from("Reviewed replacement\n"),
    later = path.join(f.source, "sections/one.tex"),
    first = path.join(f.source, "main.tex"),
    review = batches.uploadPreview(p.id, {
      destination: "",
      entries: [
        { path: "main.tex", size: next.length },
        { path: "sections/one.tex", size: next.length },
      ],
    }),
    input = { token: review.token, indices: [0, 1], requestId: randomUUID() },
    data = new Map([
      [0, next],
      [1, next],
    ]);
  const native = fs.renameSync;
  const rename = t.mock.method(
    fs,
    "renameSync",
    (from: fs.PathLike, to: fs.PathLike) => {
      if (to === later)
        throw Object.assign(Error("interrupted"), { code: "EIO" });
      return native(from, to);
    },
  );
  assert.throws(() => batches.upload(p.id, input, data), /EIO/);
  rename.mock.restore();
  assert.deepEqual(fs.readFileSync(first), next);
  assert.equal(fs.readFileSync(later, "utf8"), "Included source.\n");
  fs.writeFileSync(first, "External after batch.\n");
  f.reopen();
  assert.throws(() => f.store.unlocked(p.id), /needs recovery/);
  assert.throws(
    () => new FileBatches(f.store).upload(p.id, input, data),
    /needs recovery/,
  );
  assert.equal(fs.readFileSync(first, "utf8"), "External after batch.\n");
  assert.equal(fs.readFileSync(later, "utf8"), "Included source.\n");
  const versions = f.store
    .checkpoints(p.id)
    .flatMap((entry) =>
      f.store
        .exportCheckpoint(p.id, entry.id)
        .map((file) => file.data.toString()),
    );
  assert(versions.includes(text));
  assert(versions.includes(next.toString()));
  fs.writeFileSync(first, next);
  f.store.reconcileDisk(p.id);
  assert.equal(
    f.store.readText(p.id, "sections/one.tex").content,
    next.toString(),
  );
  assert.equal(
    new FileBatches(f.store).upload(p.id, input, data).replayed,
    true,
  );
});
test("read-only destination permission prevents canonical changes while adoption remains read-only", (t) => {
  const f = fixture(t),
    native = fs.accessSync;
  const access = t.mock.method(fs, "accessSync", (name: any, mode?: number) => {
    if (String(name).startsWith(f.source)) {
      const error = Object.assign(Error("Read only"), { code: "EROFS" });
      throw error;
    }
    return native(name, mode);
  });
  const p = f.open(),
    before = canonical(f.store, p.id);
  assert.equal(p.storage?.writable, false);
  assert.throws(
    () => f.store.save(p.id, "main.tex", "Changed.", 0),
    /read-only/,
  );
  assert.throws(
    () => f.store.add(p.id, "new.tex", Buffer.from("Changed.")),
    /read-only/,
  );
  assert.equal(canonical(f.store, p.id), before);
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  access.mock.restore();
});
test("write failure after source commit stays recoverable per project rather than preventing application restart", (t) => {
  const f = fixture(t),
    p = f.open(),
    managed = f.store.create("Other project", f.entries),
    native = fs.openSync,
    open = t.mock.method(fs, "openSync", (name: any, ...args: any[]) => {
      if (
        String(name).startsWith(f.source) &&
        String(name).endsWith(".prism-tmp")
      )
        throw Object.assign(Error("Read only"), { code: "EROFS" });
      return (native as any)(name, ...args);
    });
  assert.throws(
    () => f.store.save(p.id, "main.tex", "Pending saved version.\n", 0),
    DiskConflict,
  );
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  f.reopen();
  assert.equal(f.store.readText(managed.id, "main.tex").content, text);
  assert.throws(() => f.store.readText(p.id, "main.tex"), /EROFS/);
  open.mock.restore();
  f.reopen();
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    "Pending saved version.\n",
  );
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    "Pending saved version.\n",
  );
});
test("a root replacement during staging cannot receive the saved bytes even when its file matches the old hash", (t) => {
  const f = fixture(t),
    p = f.open(),
    native = fs.fsyncSync,
    old = f.source + " old";
  let swapped = false;
  const sync = t.mock.method(fs, "fsyncSync", (fd: number) => {
    native(fd);
    if (!swapped) {
      swapped = true;
      fs.renameSync(f.source, old);
      fs.mkdirSync(f.source);
      fs.writeFileSync(path.join(f.source, "main.tex"), text);
    }
  });
  assert.throws(
    () => f.store.save(p.id, "main.tex", "Pending at original root.\n", 0),
    DiskConflict,
  );
  sync.mock.restore();
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  assert.equal(fs.readFileSync(path.join(old, "main.tex"), "utf8"), text);
  f.reopen();
  assert.equal(f.store.project(p.id).storage?.available, false);
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
});
test("corrupted persisted root binding fails closed without a fallback and leaves other projects usable", (t) => {
  const f = fixture(t),
    p = f.open(),
    managed = f.store.create("Other project", f.entries);
  f.store.db
    .prepare("UPDATE project_directories SET path=? WHERE project=?")
    .run("../invalid", p.id);
  f.reopen();
  assert.equal(f.store.project(p.id).storage?.available, false);
  assert.equal(f.store.readText(managed.id, "main.tex").content, text);
  assert.throws(() => f.store.readText(p.id, "main.tex"), DiskConflict);
  assert(!fs.existsSync(path.join(f.data, "projects", p.id, "files")));
});
test("linked source exports are ordinary relative files, and copies become independent managed projects", async (t) => {
  const f = fixture(t),
    p = f.open(),
    zip = await readZip(writeZip(f.store.exportFiles(p.id)));
  assert.deepEqual(
    zip.map((e) => e.path),
    f.entries.map((e) => e.path),
  );
  assert(!zip.some((e) => e.path.startsWith("/") || e.path.includes("sqlite")));
  const copy = f.store.copy(p.id, {
    name: "Independent copy",
    generation: 0,
    requestId: randomUUID(),
  });
  assert(!copy.storage);
  f.store.save(copy.id, "main.tex", "Copy edit.", 0);
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  assert.equal(f.store.readText(p.id, "main.tex").content, text);
});
test("explicit moved-folder recovery requires the original identity and reviewed generation without changing source", (t) => {
  const f = fixture(t),
    p = f.open(),
    moved = f.source + " moved",
    different = path.join(f.root, "replacement");
  fs.renameSync(f.source, moved);
  fs.mkdirSync(different);
  fs.writeFileSync(path.join(different, "main.tex"), "Different source.");
  f.reopen();
  const before = canonical(f.store, p.id),
    binding = f.store.directories.binding(p.id);
  assert.throws(
    () => f.store.relocateDirectory(p.id, 1, captureDirectory(moved)),
    /project changed/,
  );
  assert.throws(
    () => f.store.relocateDirectory(p.id, 0, captureDirectory(different)),
    /original local folder/,
  );
  assert.deepEqual(f.store.directories.binding(p.id), binding);
  assert.equal(canonical(f.store, p.id), before);
  const changed = f.store.relocateDirectory(p.id, 0, captureDirectory(moved));
  assert.equal(changed.storage?.folder, fs.realpathSync(moved));
  assert.equal(changed.generation, 0);
  assert.equal(fs.readFileSync(path.join(moved, "main.tex"), "utf8"), text);
  f.store.reconcileDisk(p.id);
  assert.equal(f.store.readText(p.id, "main.tex").content, text);
  f.reopen();
  assert.equal(f.store.projectDir(p.id), fs.realpathSync(moved));
  assert.equal(
    fs.readFileSync(path.join(different, "main.tex"), "utf8"),
    "Different source.",
  );
});
test("active agent ownership prevents root relocation before metadata or source changes", (t) => {
  const f = fixture(t),
    p = f.open(),
    binding = f.store.directories.binding(p.id);
  f.store.projectLocks.set(p.id, "owner");
  assert.throws(
    () => f.store.relocateDirectory(p.id, 0, captureDirectory(f.source)),
    /active AI run/,
  );
  assert.deepEqual(f.store.directories.binding(p.id), binding);
  assert.equal(fs.readFileSync(path.join(f.source, "main.tex"), "utf8"), text);
  f.store.projectLocks.clear();
});

test("folder overlap includes filesystem roots and normalized component boundaries without prefix false positives", () => {
  assert(directoryPathsOverlap("/", "/Users/example/project"));
  assert(directoryPathsOverlap("/Users/example/project", "/"));
  assert(directoryPathsOverlap("/Projects/Paper", "/projects/paper/sections"));
  assert(directoryPathsOverlap("/projects/café", "/projects/café/sections"));
  assert(!directoryPathsOverlap("/projects/paper", "/projects/paper-two"));
  assert(!directoryPathsOverlap("/projects/state", "/projects/source"));
});
