import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { FileMoves, recoverFileTree } from "../server/file-moves";
import { createApp } from "../server/app";
import { movedPath, selectionRoots } from "../shared/file-moves";

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-move-")),
    store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.create("Synthetic moves", [
    {
      path: "source/main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}Exact café bytes.\\end{document}\n",
      ),
    },
    { path: "source/asset.bin", data: Buffer.from([0, 1, 2, 255]) },
    { path: "source/empty", directory: true, data: Buffer.alloc(0) },
    { path: "destination", directory: true, data: Buffer.alloc(0) },
    { path: "other.tex", data: Buffer.from("An unrelated file.\n") },
    {
      path: "source/old.txt",
      data: Buffer.from("Trash stays where it was.\n"),
    },
  ]);
  store.trash(project.id, "source/old.txt");
  store.automaticCheckpoint(project.id);
  const moves = new FileMoves(store);
  const request = (paths = ["source"], destination = "destination") => ({
    paths,
    destination,
    requestId: randomUUID(),
    generation: store.project(project.id).generation,
  });
  return { root, store, project, moves, request };
}
test("selection roots collapse parent/child selections, and path mapping respects boundaries", () => {
  assert.deepEqual(selectionRoots(["a/b.tex", "a", "ab.tex", "a"]), [
    "a",
    "ab.tex",
  ]);
  assert.equal(
    movedPath("a/b.tex", [{ from: "a", to: "dest/a" }]),
    "dest/a/b.tex",
  );
  assert.equal(movedPath("ab.tex", [{ from: "a", to: "dest/a" }]), "ab.tex");
});
test("move preview is read-only; a folder move preserves bytes, empty directories, Trash and unindexed disk files", (t) => {
  const { store, project, moves, request } = fixture(t),
    original = store.project(project.id),
    files = store.exportFiles(project.id),
    history = store.checkpoints(project.id);
  fs.writeFileSync(
    path.join(store.projectDir(project.id), "source/unindexed.txt"),
    "Disk-only data",
  );
  const preview = moves.preview(project.id, {
    paths: ["source", "source/main.tex"],
    destination: "destination",
  });
  assert.equal(preview.moves.length, 1);
  assert.equal(preview.rootAfter, "destination/source/main.tex");
  assert.equal(
    preview.entries.some((f) => f.from.endsWith("old.txt")),
    false,
  );
  assert.deepEqual(store.project(project.id), original);
  assert.deepEqual(store.checkpoints(project.id), history);
  const result = moves.apply(project.id, request());
  assert.equal(result.project.root, preview.rootAfter);
  for (const f of files)
    assert.deepEqual(
      store.file(project.id, movedPath(f.path, preview.moves)).content,
      f.data,
    );
  assert.equal(
    store.fileList(project.id).find((f) => f.path === "source/old.txt")
      ?.deleted,
    true,
  );
  assert.equal(
    fs.readFileSync(
      path.join(
        store.projectDir(project.id),
        "destination/source/unindexed.txt",
      ),
      "utf8",
    ),
    "Disk-only data",
  );
  moves.undo(project.id, result.operationId);
  assert.deepEqual(store.exportFiles(project.id), files);
  assert.equal(store.project(project.id).root, original.root);
  assert.equal(
    fs.readFileSync(
      path.join(store.projectDir(project.id), "source/unindexed.txt"),
      "utf8",
    ),
    "Disk-only data",
  );
});
test("multi-file move and Undo are exact and preserve unrelated edits and a later engine choice", (t) => {
  const { store, project, moves, request } = fixture(t);
  const old = store.exportFiles(project.id),
    result = moves.apply(
      project.id,
      request(["source/main.tex", "source/asset.bin", "source/empty"]),
    );
  const other = store.readText(project.id, "other.tex");
  store.save(project.id, other.path, "Later unrelated edit.\n", other.revision);
  store.update(project.id, { engine: "xelatex", root: "other.tex" });
  moves.undo(project.id, result.operationId);
  for (const file of old.filter((f) => f.path !== "other.tex"))
    assert.deepEqual(store.file(project.id, file.path).content, file.data);
  assert.equal(
    store.readText(project.id, "other.tex").content,
    "Later unrelated edit.\n",
  );
  assert.equal(store.project(project.id).engine, "xelatex");
  assert.equal(store.project(project.id).root, "other.tex");
});
test("moving the last child retains its implicit source folder; Undo restores the original managed tree", (t) => {
  const { store, moves } = fixture(t);
  const p = store.create("Implicit", [
    { path: "implicit/a.tex", data: Buffer.from("A") },
    { path: "dest", directory: true, data: Buffer.alloc(0) },
  ]);
  const before = store.exportFiles(p.id);
  const result = moves.apply(p.id, {
    paths: ["implicit/a.tex"],
    destination: "dest",
    generation: p.generation,
    requestId: randomUUID(),
  });
  assert.equal(
    store.fileList(p.id).find((f) => f.path === "implicit")?.kind,
    "directory",
  );
  moves.undo(p.id, result.operationId);
  assert.deepEqual(store.exportFiles(p.id), before);
});
test("collisions, overlapping destinations, stale previews and AI reservations reject without partial changes", (t) => {
  const { store, project, moves, request } = fixture(t);
  store.add(
    project.id,
    "destination/main.tex",
    Buffer.from("Do not overwrite."),
  );
  store.automaticCheckpoint(project.id);
  const before = store.project(project.id),
    history = store.checkpoints(project.id);
  assert.throws(
    () =>
      moves.apply(project.id, request(["source/main.tex", "source/asset.bin"])),
    /destination already exists/i,
  );
  assert.throws(
    () => moves.apply(project.id, request(["source"], "source/empty")),
    /inside itself/,
  );
  assert.deepEqual(store.project(project.id), before);
  assert.deepEqual(store.checkpoints(project.id), history);
  const stale = request(["source/asset.bin"]),
    other = store.readText(project.id, "other.tex");
  store.save(project.id, other.path, "Newer", other.revision);
  assert.throws(() => moves.apply(project.id, stale), /project changed/);
  store.projectLocks.set(project.id, "AI");
  assert.throws(() => moves.preview(project.id, request()), /reserved/);
  store.projectLocks.clear();
  assert.ok(store.file(project.id, "source/asset.bin"));
});
test("a moved file edit prevents Undo; duplicate requests cannot apply twice or revive an undone move", (t) => {
  const { store, project, moves, request } = fixture(t),
    input = request();
  const applied = moves.apply(project.id, input),
    generation = store.project(project.id).generation;
  assert.equal(moves.apply(project.id, input).replayed, true);
  assert.equal(store.project(project.id).generation, generation);
  assert.throws(
    () => moves.apply(project.id, { ...input, destination: "" }),
    /already used/,
  );
  const text = store.readText(project.id, "destination/source/main.tex");
  store.save(
    project.id,
    text.path,
    text.content + "% changed\n",
    text.revision,
  );
  assert.throws(
    () => moves.undo(project.id, applied.operationId),
    /newer edits/,
  );
  assert.equal(moves.list(project.id)[0].undoable, false);
});
test("recreating an old moved path cannot reuse a stale file revision", (t) => {
  const { store, project, moves, request } = fixture(t),
    old = store.readText(project.id, "source/main.tex");
  moves.apply(project.id, request([old.path]));
  store.add(project.id, old.path, Buffer.from(old.content));
  const fresh = store.readText(project.id, old.path);
  assert.ok(fresh.revision > old.revision);
  assert.throws(
    () => store.save(project.id, old.path, "stale edit", old.revision),
    /changed elsewhere/,
  );
});
test("Undo refuses new folder descendants without moving their bytes or metadata", (t) => {
  const { store, project, moves, request } = fixture(t);
  const moved = moves.apply(project.id, request());
  store.add(project.id, "destination/source/new.tex", Buffer.from("New file"));
  const before = store.project(project.id),
    files = store.exportFiles(project.id);
  assert.equal(moves.list(project.id)[0].undoable, false);
  assert.throws(
    () => moves.undo(project.id, moved.operationId),
    /contains new items/,
  );
  assert.deepEqual(store.project(project.id), before);
  assert.deepEqual(store.exportFiles(project.id), files);
  assert.equal(
    fs.readFileSync(
      path.join(store.projectDir(project.id), "destination/source/new.tex"),
      "utf8",
    ),
    "New file",
  );
});
test("sequential exact Undo restores earlier move eligibility without permitting arbitrary revision changes", (t) => {
  const { store, project, moves, request } = fixture(t),
    files = store.exportFiles(project.id);
  const first = moves.apply(project.id, request(["source/main.tex"]));
  const second = moves.renameResult(
    project.id,
    "destination/main.tex",
    "destination/paper.tex",
  );
  assert.equal(
    moves.list(project.id).find((m) => m.id === first.operationId)?.undoable,
    false,
  );
  moves.undo(project.id, second.operationId);
  assert.equal(
    moves.list(project.id).find((m) => m.id === first.operationId)?.undoable,
    true,
  );
  moves.undo(project.id, first.operationId);
  assert.deepEqual(store.exportFiles(project.id), files);
  const third = moves.apply(project.id, request(["source/main.tex"]));
  const current = store.readText(project.id, "destination/main.tex");
  store.save(
    project.id,
    current.path,
    current.content + "% edit",
    current.revision,
  );
  const changed = store.readText(project.id, current.path);
  store.save(project.id, current.path, current.content, changed.revision);
  assert.throws(() => moves.undo(project.id, third.operationId), /newer edits/);
});
test("rename requests bind generations, preserve case-only names and replay once", (t) => {
  const { store, project, moves } = fixture(t);
  const options = {
    generation: store.project(project.id).generation,
    requestId: randomUUID(),
  };
  const before = store.readText(project.id, "source/main.tex");
  const result = moves.renameResult(
    project.id,
    before.path,
    "source/Main.tex",
    options,
  );
  assert.equal(result.project.root, "source/Main.tex");
  assert.equal(
    store.readText(project.id, "source/Main.tex").content,
    before.content,
  );
  assert.equal(
    fs.existsSync(path.join(store.projectDir(project.id), "source/Main.tex")),
    true,
  );
  assert.equal(
    moves.renameResult(project.id, before.path, "source/Main.tex", options)
      .replayed,
    true,
  );
  assert.throws(
    () =>
      moves.rename(project.id, "source/Main.tex", "source/new.tex", {
        generation: options.generation,
      }),
    /project changed/,
  );
  moves.undo(project.id, result.operationId);
  assert.equal(store.project(project.id).root, before.path);
  assert.throws(
    () =>
      moves.renameResult(project.id, before.path, "source/Main.tex", options),
    /already used/,
  );
});
test("canonical destination aliases, duplicate basenames, protected paths and deleted folders reject safely", (t) => {
  const { store, project, moves, request } = fixture(t);
  store.add(project.id, "another/main.tex", Buffer.from("Other main"));
  assert.throws(
    () =>
      moves.apply(project.id, request(["source/main.tex", "another/main.tex"])),
    /collision|duplicate/i,
  );
  assert.throws(
    () => moves.rename(project.id, "source/main.tex", "Destination/paper.tex"),
    /existing spelling/,
  );
  for (const to of ["../outside.tex", ".secret.tex", "holdout/paper.tex"])
    assert.throws(
      () => moves.rename(project.id, "source/main.tex", to),
      /allowed|holdout|path/i,
    );
  assert.throws(
    () =>
      moves.preview(project.id, {
        paths: Array(201).fill("source"),
        destination: "destination",
      }),
    /200/,
  );
  store.add(project.id, "gone", Buffer.alloc(0), true);
  store.trash(project.id, "gone");
  assert.throws(
    () => moves.rename(project.id, "source/main.tex", "gone/paper.tex"),
    /Restore.*Trash/,
  );
  assert.equal(
    store.readText(project.id, "source/main.tex").path,
    "source/main.tex",
  );
});
test("filesystem failure rolls back metadata, bytes, checkpoints and operation identity", (t) => {
  const { store, project, moves, request } = fixture(t),
    before = store.project(project.id),
    files = store.exportFiles(project.id),
    history = store.checkpoints(project.id);
  const rename = fs.renameSync;
  let failed = false;
  fs.renameSync = ((from, to) => {
    if (
      !failed &&
      String(from).includes("/file-stage-") &&
      String(to) === store.projectDir(project.id)
    ) {
      failed = true;
      throw new Error("Injected swap failure");
    }
    return rename(from, to);
  }) as typeof fs.renameSync;
  try {
    assert.throws(() => moves.apply(project.id, request()), /Injected/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(store.project(project.id), before);
  assert.deepEqual(store.exportFiles(project.id), files);
  assert.deepEqual(store.checkpoints(project.id), history);
  assert.deepEqual(moves.list(project.id), []);
  assert.ok(
    fs.existsSync(path.join(store.projectDir(project.id), "source/main.tex")),
  );
  assert.equal(
    fs.existsSync(
      path.join(
        path.dirname(store.projectDir(project.id)),
        "file-tree-operation.json",
      ),
    ),
    false,
  );
});
test("unindexed destinations and symlinked source/parent paths cannot overwrite or escape files", (t) => {
  const { store, project, moves, request, root } = fixture(t),
    fileRoot = store.projectDir(project.id);
  fs.writeFileSync(
    path.join(fileRoot, "destination/main.tex"),
    "Unindexed destination",
  );
  assert.throws(
    () => moves.apply(project.id, request(["source/main.tex"])),
    /exists on disk/,
  );
  assert.equal(
    fs.readFileSync(path.join(fileRoot, "destination/main.tex"), "utf8"),
    "Unindexed destination",
  );
  const outside = path.join(root, "outside.txt");
  fs.writeFileSync(outside, "Outside sentinel");
  fs.unlinkSync(path.join(fileRoot, "source/main.tex"));
  fs.symlinkSync(outside, path.join(fileRoot, "source/main.tex"));
  assert.throws(() => moves.apply(project.id, request()), /Symlinks/);
  assert.equal(fs.readFileSync(outside, "utf8"), "Outside sentinel");
});
test("recovery journals validate their owned paths before filesystem cleanup", (t) => {
  const { store, project, root } = fixture(t),
    parent = path.dirname(store.projectDir(project.id)),
    outside = path.join(root, "outside.txt");
  fs.writeFileSync(outside, "Keep");
  const journal = path.join(parent, "file-tree-operation.json");
  fs.writeFileSync(
    journal,
    JSON.stringify({
      id: randomUUID(),
      stage: "../../outside.txt",
      backup: "files",
    }),
  );
  assert.throws(() => recoverFileTree(store.db, parent), /Invalid.*paths/);
  assert.equal(fs.readFileSync(outside, "utf8"), "Keep");
  fs.unlinkSync(journal);
});
for (const phase of ["before-new-tree", "after-new-tree", "after-commit"])
  test(`restart recovers an interrupted move ${phase}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-move-crash-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/file-move-crash.ts", root, phase],
      { encoding: "utf8" },
    );
    assert.equal(child.status, 91, child.stderr);
    const state = JSON.parse(
        fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
      ),
      store = new Store(root);
    t.after(() => store.close());
    const name =
      phase === "after-commit" ? "dest/source/main.tex" : "source/main.tex";
    assert.equal(store.readText(state.id, name).content, "Exact source bytes.");
    assert.equal(
      fs.readFileSync(path.join(store.projectDir(state.id), name), "utf8"),
      "Exact source bytes.",
    );
    assert.equal(store.project(state.id).root, name);
    assert.equal(
      new FileMoves(store).list(state.id).length,
      phase === "after-commit" ? 1 : 0,
    );
  });
test("move APIs persist idempotent requests/Undo across restart and reject cross-project operations", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-move-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let instance = await createApp(root, { seed: false });
  const project = instance.store.create("API moves", [
    { path: "main.tex", data: Buffer.from("Exact API source") },
    { path: "dest", directory: true, data: Buffer.alloc(0) },
  ]);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    payload = {
      paths: ["main.tex"],
      destination: "dest",
      generation: project.generation,
      requestId: randomUUID(),
    };
  const response = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves`,
    method: "POST",
    headers,
    payload,
  });
  assert.equal(response.statusCode, 200);
  await instance.app.close();
  instance = await createApp(root, { seed: false });
  t.after(() => instance.app.close());
  const other = instance.store.create("Other project", [
    { path: "main.tex", data: Buffer.from("Other") },
  ]);
  const wrong = await instance.app.inject({
    url: `/api/projects/${other.id}/file-moves/${payload.requestId}/undo`,
    method: "POST",
    headers,
    payload: {},
  });
  assert.equal(wrong.statusCode, 404);
  const replay = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves`,
    method: "POST",
    headers,
    payload,
  });
  assert.equal(replay.json().replayed, true);
  const undone = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves/${payload.requestId}/undo`,
    method: "POST",
    headers,
    payload: {},
  });
  assert.equal(undone.statusCode, 200);
  const repeat = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves/${payload.requestId}/undo`,
    method: "POST",
    headers,
    payload: {},
  });
  assert.equal(repeat.json().replayed, true);
  const bad = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves`,
    method: "POST",
    headers,
    payload,
  });
  assert.equal(bad.statusCode, 409);
  assert.equal(
    instance.store.readText(project.id, "main.tex").content,
    "Exact API source",
  );
  const rename = {
    from: "main.tex",
    to: "paper.tex",
    generation: instance.store.project(project.id).generation,
    requestId: randomUUID(),
  };
  const renameUrl = `/api/projects/${project.id}/file-moves/rename`;
  const unbound = await instance.app.inject({
    url: renameUrl,
    method: "POST",
    headers,
    payload: { from: rename.from, to: rename.to },
  });
  assert.equal(unbound.statusCode, 400);
  const staleRename = await instance.app.inject({
    url: renameUrl,
    method: "POST",
    headers,
    payload: { ...rename, generation: rename.generation - 1 },
  });
  assert.equal(staleRename.statusCode, 409);
  const renamed = await instance.app.inject({
    url: renameUrl,
    method: "POST",
    headers,
    payload: rename,
  });
  assert.equal(renamed.statusCode, 200);
  assert.deepEqual(renamed.json().moves, [
    { from: "main.tex", to: "paper.tex" },
  ]);
  const renamedAgain = await instance.app.inject({
    url: renameUrl,
    method: "POST",
    headers,
    payload: rename,
  });
  assert.equal(renamedAgain.json().replayed, true);
  const renameUndo = await instance.app.inject({
    url: `/api/projects/${project.id}/file-moves/${rename.requestId}/undo`,
    method: "POST",
    headers,
    payload: {},
  });
  assert.equal(renameUndo.statusCode, 200);
  assert.equal(
    instance.store.readText(project.id, "main.tex").content,
    "Exact API source",
  );
});
