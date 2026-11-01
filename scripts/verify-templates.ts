import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Templates } from "../server/templates";
import { templateStarters } from "../server/template-starters";
const root = path.resolve("data/verification/templates-compiler-" + Date.now()),
  store = new Store(root),
  compiler = new Compiler(store),
  templates = new Templates(store, compiler),
  results: any[] = [];
async function wait(job: any) {
  const start = Date.now();
  while (compiler.processes.has(job.id)) {
    if (Date.now() - start > 130000) throw new Error("Compile timeout");
    await new Promise((r) => setTimeout(r, 100));
  }
  return job;
}
function output(job: any) {
  const text = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
    env: {
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      LANG: "en_US.UTF-8",
    },
  });
  assert.equal(
    text.status,
    0,
    "Install pdftotext for this verification command.",
  );
  return text.stdout;
}
async function preview(id: string) {
  const v = templates.get(id),
    before = {
      projects: store.list(),
      histories: store.db
        .prepare("SELECT id,payload FROM checkpoints ORDER BY rowid")
        .all(),
    },
    job = await wait(
      templates.compile(id, {
        hash: v.hash,
        expectedRevision: v.revision,
        root: v.root,
        engine: v.engine,
      }),
    );
  assert.equal(job.status, "succeeded", id + "\n" + job.log.slice(-3500));
  assert.equal(job.preview, true);
  assert.deepEqual(
    {
      projects: store.list(),
      histories: store.db
        .prepare("SELECT id,payload FROM checkpoints ORDER BY rowid")
        .all(),
    },
    before,
  );
  assert.equal(compiler.list(job.projectId).length, 0);
  const text = output(job);
  assert.ok(text.trim());
  results.push({ name: id, job: job.id, text });
  console.log("PASS " + id + " frozen preview, no project/history effects");
  return job;
}
try {
  assert.throws(() => templates.compile("builtin-blank", {}), /blank starter/);
  console.log(
    "PASS intentionally empty starter requires content before preview",
  );
  for (const starter of templateStarters.filter(
    (s) => s.id !== "builtin-blank",
  ))
    await preview(starter.id);
  const source = store.create("Synthetic personal template", [
    {
      path: "paper/main report.tex",
      data: Buffer.from(String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\section{Personal source}
\input{paper/sections/body}
\immediate\write18{touch ../out/shell-ran}
\end{document}
`),
    },
    {
      path: "paper/sections/body.tex",
      data: Buffer.from("Exact source retained after the original changes.\n"),
    },
    { path: "assets/binary.bin", data: Buffer.from([0, 255, 1, 7]) },
    { path: "assets/empty", data: Buffer.alloc(0), directory: true },
    {
      path: "build.sh",
      data: Buffer.from("#!/bin/sh\ntouch ../out/script-ran\n"),
    },
  ]);
  store.update(source.id, {
    root: "paper/main report.tex",
    engine: "pdflatex",
  });
  store.automaticCheckpoint(source.id);
  const original = store.exportFiles(source.id),
    state = templates.preview(source.id),
    saved = templates.save(source.id, {
      id: randomUUID(),
      name: "Personal independent template",
      description: "Synthetic nested source.",
      expectedGeneration: state.generation,
      hash: state.hash,
    }).template;
  store.save(source.id, "paper/sections/body.tex", "Later original text.\n", 0);
  store.trashProject(source.id);
  const personal = await preview(saved.id);
  assert.ok(
    !fs.existsSync(path.join(compiler.dir(personal.id), "out/shell-ran")),
  );
  assert.ok(
    !fs.existsSync(path.join(compiler.dir(personal.id), "out/script-ran")),
  );
  assert.deepEqual(templates.export(saved.id), original);
  const created = templates.create(saved.id, {
    id: randomUUID(),
    name: "Independent instance",
    expectedRevision: saved.revision,
    hash: saved.hash,
    root: saved.root,
    engine: saved.engine,
  }).project;
  assert.deepEqual(store.exportFiles(created.id), original);
  assert.equal(store.checkpoints(created.id).length, 1);
  const normal = await wait(compiler.start(created.id));
  assert.equal(normal.status, "succeeded", normal.log.slice(-2500));
  assert.equal(normal.preview, false);
  assert.equal(output(personal), output(normal));
  results.push({
    name: "Created personal project",
    job: normal.id,
    text: output(normal),
  });
  console.log(
    "PASS personal clone normal build matches frozen preview and exact assets/folders",
  );
  const cancel = templates.get("builtin-report"),
    cancelled = templates.compile(cancel.id, {
      hash: cancel.hash,
      expectedRevision: cancel.revision,
      root: cancel.root,
      engine: cancel.engine,
    });
  compiler.cancel(cancelled.id);
  await wait(cancelled);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(compiler.processes.size, 0);
  console.log("PASS explicit preview cancellation");
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        previewCount: results.length - 1,
        normalCount: 1,
        cancelled: cancelled.id,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  for (const job of compiler.jobs.values())
    if (["queued", "running"].includes(job.status)) compiler.cancel(job.id);
  store.close();
}
