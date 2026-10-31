import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import type { AiRun, CompileJob, Proposal } from "../shared/types";

function directory(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-project-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("project Trash survives restart and restores exact source, history and metadata", (t) => {
  const root = directory(t);
  let store = new Store(root);
  t.after(() => store.close());
  const project = store.create("Keep my paper", [
    {
      path: "main.tex",
      data: Buffer.from("\\documentclass{article}\nDraft α"),
    },
    { path: "figures/data.bin", data: Buffer.from([0, 255, 1, 2]) },
    { path: "notes.txt", data: Buffer.from("Already in file Trash") },
  ]);
  store.save(project.id, "main.tex", "Revised α 👩🏽‍🔬", 0);
  store.trash(project.id, "notes.txt");
  const checkpoint = store.checkpoint(project.id, "Keep checkpoint");
  const run: AiRun = {
    id: "chat",
    projectId: project.id,
    provider: "openai",
    model: "fixture",
    mode: "review",
    path: "main.tex",
    status: "completed",
    prompt: "Revise",
    text: "A saved reply",
    created: new Date().toISOString(),
    contextFiles: ["main.tex"],
    from: 0,
    to: 0,
  };
  const proposal: Proposal = {
    id: "proposal",
    projectId: project.id,
    runId: run.id,
    summary: "Saved proposal",
    files: [],
    status: "rejected",
  };
  store.saveRun(run);
  store.saveProposal(proposal);
  const before = store.project(project.id);
  const source = store.readText(project.id, "main.tex");
  const diskPath = path.join(store.projectDir(project.id), "main.tex");
  const versions = store.db.prepare("SELECT * FROM versions").all();
  const deleted = store.trashProject(project.id);
  assert.ok(deleted.deletedAt);
  assert.deepEqual(store.list(), []);
  assert.equal(store.list(true)[0].id, project.id);
  assert.equal(store.trashProject(project.id).deletedAt, deleted.deletedAt);
  assert.equal(fs.readFileSync(diskPath, "utf8"), source.content);
  assert.throws(
    () => store.save(project.id, "main.tex", "stale tab", source.revision),
    /in Trash/,
  );
  assert.throws(() => store.trash(project.id, "figures/data.bin"), /in Trash/);
  assert.throws(
    () => store.update(project.id, { name: "stale rename" }),
    /in Trash/,
  );
  store.close();
  store = new Store(root);
  assert.equal(store.list(true)[0].deletedAt, deleted.deletedAt);
  assert.throws(() => store.project(project.id), /in Trash/);
  assert.deepEqual(store.trashProject(project.id, true), before);
  assert.deepEqual(store.trashProject(project.id, true), before);
  assert.deepEqual(store.list(true), []);
  assert.deepEqual(store.readText(project.id, "main.tex"), source);
  assert.deepEqual(
    store.file(project.id, "figures/data.bin").content,
    Buffer.from([0, 255, 1, 2]),
  );
  assert.ok(
    store.fileList(project.id).find((f) => f.path === "notes.txt")?.deleted,
  );
  assert.equal(store.checkpoints(project.id)[0].id, checkpoint.id);
  const migratedRun = store.runs(project.id)[0];
  assert.ok(migratedRun.conversationId);
  assert.deepEqual(migratedRun, {
    ...run,
    conversationId: migratedRun.conversationId,
  });
  assert.equal(
    store.conversation(migratedRun.conversationId, project.id).title,
    run.prompt,
  );
  assert.deepEqual(store.proposals(project.id), [proposal]);
  assert.deepEqual(store.db.prepare("SELECT * FROM versions").all(), versions);
});

test("legacy project schema migrates without recreating existing projects", (t) => {
  const root = directory(t);
  const db = new DatabaseSync(path.join(root, "prism.sqlite"));
  db.exec(
    "CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,engine TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL)",
  );
  db.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?)").run(
    "legacy",
    "Existing paper",
    "",
    "xelatex",
    7,
    "2025-01-01T00:00:00.000Z",
  );
  db.close();
  const store = new Store(root);
  t.after(() => store.close());
  assert.equal(store.list()[0].name, "Existing paper");
  assert.equal(store.list()[0].generation, 7);
  assert.equal(store.list()[0].deletedAt, null);
  assert.equal(store.list()[0].engine, "xelatex");
  assert.ok(store.create("New after migration").id);
});

test("Trash refuses active typing locks and AI runs", (t) => {
  const store = new Store(directory(t));
  t.after(() => store.close());
  const project = store.create("Busy", [
    { path: "main.tex", data: Buffer.from("x") },
  ]);
  store.locks.set(project.id + "/main.tex", "typing");
  assert.throws(() => store.trashProject(project.id), /active typing run/);
  store.locks.clear();
  store.saveRun({
    id: "review",
    projectId: project.id,
    provider: "openai",
    model: "fixture",
    mode: "review",
    path: "main.tex",
    status: "generating",
    prompt: "Test",
    text: "",
    created: new Date().toISOString(),
    contextFiles: [],
    from: 0,
    to: 0,
  });
  assert.throws(() => store.trashProject(project.id), /active AI request/);
  assert.equal(store.list().length, 1);
  assert.equal(store.list(true).length, 0);
});

test("HTTP project Trash is durable, keeps compiled output, and does not reseed an empty library", async (t) => {
  const root = directory(t);
  let service = await createApp(root, { seed: false });
  t.after(() => service.app.close());
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const request = (
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: object,
  ) => service.app.inject({ method, url: "/api" + url, headers, payload });
  const project = (
    await request("POST", "/projects", { name: "Only project", blank: true })
  ).json();
  const job: CompileJob = {
    id: "saved-build",
    projectId: project.id,
    generation: 0,
    status: "running",
    diagnostics: [],
    log: "",
    pdf: true,
    started: new Date().toISOString(),
    engine: "pdflatex",
    root: "main.tex",
  };
  service.compiler.jobs.set(job.id, job);
  assert.equal(
    (await request("POST", `/projects/${project.id}/trash`, {})).statusCode,
    409,
  );
  job.status = "succeeded";
  fs.mkdirSync(path.join(root, "builds", job.id, "out"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "builds", job.id, "out/main.pdf"),
    "%PDF-fixture-preserved",
  );
  service.compiler.persist(job);
  assert.equal(
    (await request("POST", `/projects/${project.id}/trash`, {})).statusCode,
    200,
  );
  assert.deepEqual((await request("GET", "/projects")).json(), []);
  assert.equal(
    (await request("GET", "/projects/trash")).json()[0].id,
    project.id,
  );
  assert.equal(
    (await request("GET", `/projects/${project.id}`)).statusCode,
    409,
  );
  assert.equal(
    (await request("POST", `/projects/${project.id}/compile`, {})).statusCode,
    409,
  );
  assert.equal(
    (await request("POST", "/projects/unknown/restore-project", {})).statusCode,
    404,
  );
  await service.app.close();
  service = await createApp(root, { seed: true });
  assert.deepEqual((await request("GET", "/projects")).json(), []);
  assert.equal((await request("GET", "/projects/trash")).json().length, 1);
  assert.equal(
    (await request("GET", `/builds/${job.id}/pdf`)).body,
    "%PDF-fixture-preserved",
  );
  assert.equal(
    (await request("POST", `/projects/${project.id}/restore-project`, {}))
      .statusCode,
    200,
  );
  assert.equal((await request("GET", "/projects")).json()[0].id, project.id);
  assert.deepEqual((await request("GET", "/projects/trash")).json(), []);
  assert.equal(
    (await request("GET", `/projects/${project.id}/builds`)).json()
      .lastSuccessful.id,
    job.id,
  );
});
