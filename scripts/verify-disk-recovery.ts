import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createApp } from "../server/app";
import { readZip, writeZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";

const root = path.resolve("data/verification/disk-recovery-real-" + Date.now());
let app = await createApp(root, { seed: false });
const results: Record<string, unknown>[] = [];
const source = String.raw`\documentclass{article}
\usepackage{graphicx}
\title{Original local manuscript}\author{Synthetic verification}\date{}
\begin{document}\maketitle
\input{sections/body}
Figure~\ref{fig:diagram} and Section~\ref{sec:result} are local.
\bibliographystyle{plain}\bibliography{references}
\end{document}`;
const body = (
  text: string,
) => String.raw`\section{A recoverable result}\label{sec:result}
${text} Evidence~\cite{source}.
\begin{figure}[h]\centering\includegraphics[width=3cm]{assets/diagram.eps}
\caption{Synthetic local figure.}\label{fig:diagram}\end{figure}
\begin{tabular}{lr}Observation&Value\\\hline Example&42\end{tabular}`;
const eps = (gray: number) =>
  Buffer.from(
    `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 120 60\n${gray} setgray\nnewpath 0 0 moveto 120 0 lineto 120 60 lineto 0 60 lineto closepath fill\nshowpage\n%%EOF\n`,
  );
async function compile(id: string, label: string) {
  const job = app.compiler.start(id),
    end = Date.now() + 30000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > end) {
      app.compiler.cancel(job.id);
      throw Error("Verification deadline: " + label);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(job.status, "succeeded", job.log);
  const identity = supervisorIdentity(app.compiler.dir(job.id));
  assert.ok(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  const text = spawnSync("pdftotext", [app.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
  });
  assert.equal(text.status, 0, text.stderr);
  results.push({ name: label, passed: true, job: job.id, text: text.stdout });
  console.log("PASS " + label);
  return text.stdout;
}
try {
  const p = app.store.create("External edits · synthetic verification", [
    { path: "main.tex", data: Buffer.from(source) },
    {
      path: "sections/body.tex",
      data: Buffer.from(body("Original app content.")),
    },
    {
      path: "references.bib",
      data: Buffer.from(
        "@book{source,author={Synthetic Author},title={Original reference},year={2026},publisher={Synthetic Press}}",
      ),
    },
    { path: "assets/diagram.eps", data: eps(0.3) },
    {
      path: "build.sh",
      data: Buffer.from("# This supporting script remains inert.\nexit 99\n"),
    },
  ]);
  app.store.update(p.id, { engine: "latex" });
  app.store.automaticCheckpoint(p.id, "Before external edits");
  const before = app.store.exportFiles(p.id);
  const beforePdf = await compile(
    p.id,
    "baseline multi-file LaTeX/EPS/BibTeX compile",
  );
  const directory = app.store.projectDir(p.id);
  await app.app.close();
  const changed = [
    [
      "main.tex",
      Buffer.from(
        source.replace(
          "Original local manuscript",
          "Recovered local manuscript",
        ),
      ),
    ],
    [
      "sections/body.tex",
      Buffer.from(body("External disk content survives restart.")),
    ],
    [
      "references.bib",
      Buffer.from(
        "@book{source,author={Synthetic Author},title={Recovered reference},year={2026},publisher={Synthetic Press}}",
      ),
    ],
    ["assets/diagram.eps", eps(0.7)],
  ] as const;
  for (const [name, bytes] of changed)
    fs.writeFileSync(path.join(directory, name), bytes);
  const stats = changed.map(([name]) => ({
    name,
    inode: fs.statSync(path.join(directory, name)).ino,
    mtime: fs.statSync(path.join(directory, name)).mtimeMs,
  }));
  app = await createApp(root, { seed: false });
  for (const [name, bytes] of changed) {
    assert.deepEqual(fs.readFileSync(path.join(directory, name)), bytes);
    assert.deepEqual(app.store.file(p.id, name).content, bytes);
  }
  for (const stat of stats) {
    const current = fs.statSync(path.join(directory, stat.name));
    assert.equal(current.ino, stat.inode);
    assert.equal(current.mtimeMs, stat.mtime);
  }
  const recovery = app.store.setting("disk-recovery:" + p.id, null);
  assert.equal(recovery.paths.length, 4);
  assert.deepEqual(app.store.exportCheckpoint(p.id, recovery.backup), before);
  const after = app.store.exportFiles(p.id);
  const roundTrip = await readZip(writeZip(after));
  assert.deepEqual(
    roundTrip.map((f) => [f.path, f.data]),
    after.map((f) => [f.path, f.data]),
  );
  results.push({
    name: "external source/bibliography/figure preserved with source ZIP round-trip and before checkpoint",
    passed: true,
    recovery,
    inodeMtimeExact: true,
  });
  const afterPdf = await compile(
    p.id,
    "recovered external manuscript compiles",
  );
  assert.match(afterPdf, /External disk content survives restart/);
  assert.match(afterPdf, /Recovered reference/);
  const job = app.compiler.latestPdf(p.id)!;
  const forward = app.compiler.sync(job.id, {
    direction: "forward",
    path: "sections/body.tex",
    line: 2,
  });
  assert.ok(forward.page && forward.page > 0);
  const inverse = app.compiler.sync(job.id, {
    direction: "inverse",
    page: forward.page,
    x: forward.x,
    y: forward.y,
  });
  assert.equal(inverse.path, "sections/body.tex");
  results.push({
    name: "reconciled included-file bidirectional SyncTeX",
    passed: true,
    forward,
    inverse,
  });
  app.store.restoreCheckpoint(p.id, recovery.backup);
  assert.deepEqual(app.store.exportFiles(p.id), before);
  assert.equal(
    await compile(p.id, "earlier app version restores and compiles exactly"),
    beforePdf,
  );
  app.store.restoreCheckpoint(p.id, recovery.recovered);
  assert.deepEqual(app.store.exportFiles(p.id), after);
  assert.equal(
    await compile(p.id, "external version restores and compiles exactly"),
    afterPdf,
  );
  app.store.automaticCheckpoint(p.id, "After verified recovery");
  const stable = JSON.stringify({
    project: app.store.project(p.id),
    history: app.store.checkpoints(p.id),
  });
  await app.app.close();
  app = await createApp(root, { seed: false });
  assert.equal(
    JSON.stringify({
      project: app.store.project(p.id),
      history: app.store.checkpoints(p.id),
    }),
    stable,
  );
  assert.equal(app.store.runs(p.id).length, 0);
  assert.equal(app.store.conversations(p.id).length, 0);
  results.push({
    name: "second restart is idempotent and no AI run/chat was created",
    passed: true,
  });
  fs.writeFileSync(
    "data/verification/disk-recovery/completed.json",
    JSON.stringify({ root, project: p.id, recovery }, null, 2),
  );
} finally {
  await app.app.close();
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ root, date: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify({ root, checks: results.length }));
}
