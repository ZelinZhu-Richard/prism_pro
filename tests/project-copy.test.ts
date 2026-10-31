import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { copyProjectName } from "../shared/project-copy";

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-project-copy-"));
  const store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.create("Synthetic original", [
    {
      path: "roots/paper.tex",
      data: Buffer.from("\\documentclass{article}\nDraft α 😀\r\n"),
    },
    { path: "sections/intro.tex", data: Buffer.from("Original intro") },
    {
      path: "refs.bib",
      data: Buffer.from("@article{example,title={Synthetic}}"),
    },
    { path: "assets/plot.bin", data: Buffer.from([0, 255, 1, 99]) },
    { path: "legacy.tex", data: Buffer.from([99, 97, 102, 233, 13, 10]) },
    { path: "empty-folder", directory: true, data: Buffer.alloc(0) },
    {
      path: "build.sh",
      data: Buffer.from("#!/bin/sh\ntouch SHOULD_NOT_RUN\n"),
    },
    { path: "deleted.tex", data: Buffer.from("Keep only in original Trash") },
  ]);
  store.save(project.id, "sections/intro.tex", "Revised intro", 0);
  store.trash(project.id, "deleted.tex");
  store.update(project.id, { root: "roots/paper.tex", engine: "xelatex" });
  const p = store.project(project.id);
  return { root, store, p };
}
const request = (generation: number, name = "Independent copy") => ({
  generation,
  name,
  requestId: randomUUID(),
});
const sourceState = (store: Store, id: string) => ({
  project: store.project(id),
  rows: store.db
    .prepare("SELECT * FROM files WHERE project=? ORDER BY path")
    .all(id),
  versions: store.db.prepare("SELECT * FROM versions WHERE project=?").all(id),
  checkpoints: store.checkpoints(id),
  chats: store.runs(id),
  conversations: store.conversations(id),
  proposals: store.proposals(id),
});

test("copy preserves exact active files, binary/legacy bytes, folders and compiler settings without changing the original", (t) => {
  const { store, p } = fixture(t),
    before = sourceState(store, p.id);
  const copied = store.copy(p.id, request(p.generation, "研究 notes 👩🏽‍🔬"));
  assert.notEqual(copied.id, p.id);
  assert.equal(copied.name, "研究 notes 👩🏽‍🔬");
  assert.equal(copied.generation, 0);
  assert.equal(copied.root, p.root);
  assert.equal(copied.engine, p.engine);
  assert.ok(copied.files.every((file) => !file.deleted && file.revision === 0));
  assert.deepEqual(store.exportFiles(copied.id), store.exportFiles(p.id));
  assert.ok(!copied.files.some((file) => file.path === "deleted.tex"));
  assert.ok(
    fs
      .statSync(path.join(store.projectDir(copied.id), "empty-folder"))
      .isDirectory(),
  );
  for (const file of store.exportFiles(copied.id))
    if (!file.directory)
      assert.deepEqual(
        fs.readFileSync(path.join(store.projectDir(copied.id), file.path)),
        file.data,
      );
  assert.equal(
    fs.existsSync(path.join(store.projectDir(copied.id), "SHOULD_NOT_RUN")),
    false,
  );
  assert.equal(
    fs.statSync(path.join(store.projectDir(copied.id), "build.sh")).mode &
      0o111,
    0,
  );
  assert.deepEqual(sourceState(store, p.id), before);
});

test("copy starts with one fresh baseline and no old versions, chat sessions, proposals or replacement metadata", (t) => {
  const { store, p } = fixture(t);
  const conversation = store.createConversation(p.id, "Original conversation");
  store.saveRun({
    id: "original-run",
    projectId: p.id,
    conversationId: conversation.id,
    status: "completed",
    provider: "openai",
    model: "fixture",
    mode: "review",
    path: p.root,
    prompt: "Original private fixture",
    text: "A saved response",
    created: new Date().toISOString(),
    contextFiles: [p.root],
    from: 0,
    to: 0,
  });
  store.saveProposal({
    id: "original-proposal",
    projectId: p.id,
    runId: "original-run",
    summary: "Original suggestion",
    status: "rejected",
    files: [],
  });
  store.checkpoint(p.id, "A named original milestone");
  store.setSetting("preferences", { theme: "dark", provider: "openai" });
  const copied = store.copy(p.id, request(p.generation));
  assert.equal(store.checkpoints(copied.id).length, 1);
  assert.equal((store.checkpoints(copied.id)[0] as any).name, "Project copied");
  assert.equal(
    (
      store.db
        .prepare("SELECT COUNT(*) n FROM versions WHERE project=?")
        .get(copied.id) as any
    ).n,
    0,
  );
  assert.deepEqual(store.runs(copied.id), []);
  assert.deepEqual(store.conversations(copied.id), []);
  assert.deepEqual(store.proposals(copied.id), []);
  assert.equal(store.runs(p.id).length, 1);
  assert.ok(
    !JSON.stringify(
      store.snapshot(copied.id, (store.checkpoints(copied.id)[0] as any).id),
    ).includes("original-run"),
  );
  const sourceHashes = (
    store.db
      .prepare(
        "SELECT payload FROM checkpoints WHERE project=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(p.id) as any
  ).payload;
  assert.ok(sourceHashes.includes("contentHash"));
});

test("editing, restoring, renaming or trashing a copy leaves original files and history independent", (t) => {
  const { store, p } = fixture(t),
    before = sourceState(store, p.id);
  const copied = store.copy(p.id, request(p.generation));
  const baseline = (store.checkpoints(copied.id)[0] as any).id;
  store.save(copied.id, "sections/intro.tex", "Only in the copy", 0);
  store.rename(copied.id, "assets/plot.bin", "assets/renamed.bin");
  store.restoreCheckpointFile(copied.id, baseline, "sections/intro.tex", 1);
  assert.equal(
    store.readText(copied.id, "sections/intro.tex").content,
    "Revised intro",
  );
  store.trashProject(copied.id);
  store.trashProject(copied.id, true);
  assert.deepEqual(sourceState(store, p.id), before);
  store.save(p.id, "sections/intro.tex", "A later original edit", 1);
  assert.equal(
    store.readText(copied.id, "sections/intro.tex").content,
    "Revised intro",
  );
});

test("stale source snapshots, trashed originals and all active AI states reject copies without leaving projects", (t) => {
  const { store, p, root } = fixture(t),
    count = store.list().length;
  const beforeDirs = fs.readdirSync(path.join(root, "projects"));
  assert.throws(
    () => store.copy(p.id, request(p.generation - 1)),
    /original project changed/,
  );
  store.projectLocks.set(p.id, "fixture");
  assert.throws(() => store.copy(p.id, request(p.generation)), /reserved/);
  store.projectLocks.clear();
  store.locks.set(`${p.id}/${p.root}`, "fixture");
  assert.throws(() => store.copy(p.id, request(p.generation)), /reserved/);
  store.locks.clear();
  for (const status of ["generating", "typing", "paused", "preview"] as const) {
    store.saveRun({ id: "busy-fixture", projectId: p.id, status } as any);
    assert.throws(() => store.copy(p.id, request(p.generation)), /active AI/);
  }
  store.db.prepare("DELETE FROM runs WHERE id=?").run("busy-fixture");
  store.trashProject(p.id);
  assert.throws(() => store.copy(p.id, request(p.generation)), /Trash/);
  store.trashProject(p.id, true);
  assert.equal(store.list().length, count);
  assert.deepEqual(fs.readdirSync(path.join(root, "projects")), beforeDirs);
});

test("copy names and request metadata are validated before creating anything", (t) => {
  const { store, p } = fixture(t);
  for (const name of [
    "",
    "   ",
    null,
    7,
    "x".repeat(121),
    "bad\nname",
    "bad\u0000name",
    "broken\ud800",
  ])
    assert.throws(
      () => store.copy(p.id, { ...request(p.generation), name }),
      /project name/,
    );
  for (const generation of [null, undefined, -1, 0.5, "3", Infinity])
    assert.throws(
      () => store.copy(p.id, { ...request(p.generation), generation }),
      /source revision/,
    );
  for (const requestId of [null, "", "../outside", "arbitrary-token"])
    assert.throws(
      () => store.copy(p.id, { ...request(p.generation), requestId }),
      /request ID/,
    );
  assert.equal(store.list().length, 1);
});

test("retrying a copy request is idempotent, while reusing a request ID for a different intent is rejected", (t) => {
  const { store, p } = fixture(t),
    body = request(p.generation);
  const copied = store.copy(p.id, body),
    before = sourceState(store, copied.id);
  assert.deepEqual(store.copy(p.id, body), copied);
  assert.equal(store.list().length, 2);
  assert.deepEqual(sourceState(store, copied.id), before);
  assert.throws(
    () => store.copy(p.id, { ...body, name: "Different copy" }),
    /another copy/,
  );
  assert.throws(
    () => store.copy(p.id, { ...body, generation: body.generation + 1 }),
    /another copy/,
  );
  assert.throws(() => store.copy(copied.id, body), /another copy/);
  store.trashProject(p.id);
  assert.equal(store.copy(p.id, body).id, copied.id);
});

test("copy rollback removes database rows and new files on materialization or checkpoint failure", (t) => {
  const { store, p, root } = fixture(t),
    before = sourceState(store, p.id);
  const dirs = fs.readdirSync(path.join(root, "projects"));
  const materialize = store.materialize;
  store.materialize = function (id) {
    materialize.call(this, id);
    throw new Error("Injected disk failure");
  };
  try {
    assert.throws(
      () => store.copy(p.id, request(p.generation)),
      /Injected disk/,
    );
  } finally {
    store.materialize = materialize;
  }
  const checkpoint = store.checkpoint;
  store.checkpoint = function (...args) {
    checkpoint.apply(this, args);
    throw new Error("Injected checkpoint failure");
  };
  try {
    assert.throws(
      () => store.copy(p.id, request(p.generation)),
      /Injected checkpoint/,
    );
  } finally {
    store.checkpoint = checkpoint;
  }
  assert.deepEqual(sourceState(store, p.id), before);
  assert.deepEqual(fs.readdirSync(path.join(root, "projects")), dirs);
  assert.equal(store.list().length, 1);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) n FROM project_copies").get() as any).n,
    0,
  );
  assert.equal(
    (
      store.db
        .prepare("SELECT COUNT(DISTINCT project) n FROM checkpoints")
        .get() as any
    ).n,
    1,
  );
});

test("new project creation also rolls back cleanly on a write failure", (t) => {
  const { store, p, root } = fixture(t),
    before = sourceState(store, p.id);
  const dirs = fs.readdirSync(path.join(root, "projects")),
    materialize = store.materialize;
  store.materialize = function (id) {
    materialize.call(this, id);
    throw new Error("Injected create failure");
  };
  try {
    assert.throws(
      () =>
        store.create("Failed new project", [
          { path: "main.tex", data: Buffer.from("x") },
        ]),
      /Injected create/,
    );
  } finally {
    store.materialize = materialize;
  }
  assert.equal(store.list().length, 1);
  assert.deepEqual(sourceState(store, p.id), before);
  assert.deepEqual(fs.readdirSync(path.join(root, "projects")), dirs);
});

test("copy survives restart with its own baseline and retry identity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-copy-restart-"));
  let store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const original = store.create("Original", [
    { path: "main.tex", data: Buffer.from("Unicode α 👩🏽‍🔬") },
  ]);
  const body = request(original.generation),
    copied = store.copy(original.id, body);
  store.close();
  store = new Store(root);
  assert.deepEqual(store.copy(original.id, body), copied);
  assert.equal(store.checkpoints(copied.id).length, 1);
  assert.equal(store.readText(copied.id, "main.tex").content, "Unicode α 👩🏽‍🔬");
});

test("empty projects, missing root documents and symlinked storage have explicit outcomes", (t) => {
  const { store, p, root } = fixture(t);
  store.trash(p.id, p.root);
  assert.equal(
    store.copy(p.id, request(store.project(p.id).generation)).root,
    "",
  );
  const empty = store.create("Empty");
  const copied = store.copy(empty.id, request(empty.generation));
  assert.equal(copied.root, "");
  assert.deepEqual(copied.files, []);
  assert.ok(fs.statSync(store.projectDir(copied.id)).isDirectory());
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), "prism-copy-linked-"));
  const isolated = new Store(linked);
  try {
    const destination = path.join(root, "unmanaged-fixture");
    fs.mkdirSync(destination);
    fs.symlinkSync(destination, path.join(linked, "projects"));
    assert.throws(
      () => isolated.create("Should fail"),
      /Symlinked project storage/,
    );
    assert.deepEqual(fs.readdirSync(destination), []);
    assert.deepEqual(isolated.list(), []);
  } finally {
    isolated.close();
    fs.rmSync(linked, { recursive: true, force: true });
  }
});

test("suggested copy names preserve complete graphemes and fit the existing 120-character field", () => {
  assert.equal(copyProjectName("My paper"), "My paper (Copy)");
  assert.equal(copyProjectName("  "), "Untitled project (Copy)");
  assert.equal(copyProjectName("a\n\tb"), "a b (Copy)");
  assert.equal(
    copyProjectName("x".repeat(112) + "👩🏽‍🔬"),
    "x".repeat(112) + " (Copy)",
  );
  const unicode = copyProjectName("研究👩🏽‍🔬".repeat(50));
  assert.ok(unicode.length <= 120);
  assert.equal(Buffer.from(unicode).toString(), unicode);
});

test("local copy APIs expose metadata only, reject stale requests and preserve compiled-output separation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-copy-api-"));
  const { app, store, compiler } = await createApp(root, { seed: false });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const original = store.create("Original", [
    { path: "main.tex", data: Buffer.from("Private synthetic content") },
  ]);
  const job = {
    id: "original-build",
    projectId: original.id,
    generation: 0,
    status: "succeeded",
    pdf: true,
    root: "main.tex",
    engine: "pdflatex",
    diagnostics: [],
    log: "",
    started: new Date().toISOString(),
  } as const;
  compiler.jobs.set(job.id, job as any);
  fs.mkdirSync(path.join(root, "builds", job.id, "out"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "builds", job.id, "out", "main.pdf"),
    "%PDF-synthetic-original",
  );
  compiler.persist(job as any);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    url = `/api/projects/${original.id}`;
  const preview = await app.inject({
    method: "GET",
    url: `${url}/copy-preview`,
    headers,
  });
  assert.equal(preview.statusCode, 200);
  assert.ok(!preview.body.includes("Private synthetic content"));
  const body = request(original.generation, "Copy from API");
  const result = await app.inject({
    method: "POST",
    url: `${url}/copy`,
    headers,
    payload: body,
  });
  assert.equal(result.statusCode, 200);
  const copied = result.json();
  assert.deepEqual(compiler.list(copied.id), []);
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/builds/${job.id}/pdf`,
        headers,
      })
    ).body,
    "%PDF-synthetic-original",
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${url}/copy`,
        headers,
        payload: body,
      })
    ).json().id,
    copied.id,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${url}/copy`,
        headers,
        payload: request(100),
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${url}/copy`,
        headers: { ...headers, origin: "https://example.com" },
        payload: request(0),
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${url}/copy`,
        headers: { host: "127.0.0.1:4317" },
        payload: request(0),
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/projects/missing/copy",
        headers,
        payload: request(0),
      })
    ).statusCode,
    404,
  );
  assert.equal(store.list().length, 2);
});
