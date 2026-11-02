import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { Compiler } from "../server/compiler";
import { Store } from "../server/store";
import { processGroup, supervisorIdentity } from "../server/supervision";

const root = path.resolve(
  "data/verification/compile-policy-real-" + Date.now(),
);
const store = new Store(root),
  compiler = new Compiler(store);
const compilers = [compiler];
const results: Record<string, unknown>[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const source = String.raw`\documentclass{article}
\begin{document}Local build policy.\input{sections/body}\end{document}`;
const infinite = String.raw`\documentclass{article}
\begin{document}\loop\iftrue\repeat\end{document}`;
async function until(check: () => boolean, timeout: number, label: string) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out: " + label);
    await pause(30);
  }
}
function snapshot(id: string) {
  return JSON.stringify({
    project: store.project(id),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.data.toString("base64")]),
    history: store.checkpoints(id),
  });
}
function drained(runner: Compiler, id: string) {
  const identity = supervisorIdentity(runner.dir(id));
  assert.ok(identity);
  assert.deepEqual(processGroup(identity.pid), []);
}
try {
  const p = store.create("Synthetic unlimited local compile", [
    { path: "main.tex", data: Buffer.from(source) },
    {
      path: "sections/body.tex",
      data: Buffer.from("Nested source with $x^2$.\n"),
    },
  ]);
  const good = compiler.start(p.id);
  await until(
    () => !["queued", "running"].includes(good.status),
    20000,
    "finite compile",
  );
  assert.equal(good.status, "succeeded", good.log);
  assert.equal(good.timeoutMs, null);
  assert.ok(fs.statSync(compiler.pdfPath(good.id)).size > 1000);
  drained(compiler, good.id);
  results.push({
    name: "real multi-file compile uses unlimited default",
    job: good.id,
    passed: true,
  });
  console.log("PASS real multi-file compile uses unlimited default");

  if (process.argv.includes("--long")) {
    const file = store.readText(p.id, "main.tex");
    store.save(p.id, file.path, infinite, file.revision);
    store.automaticCheckpoint(p.id, "Before long policy verification");
    const before = snapshot(p.id),
      started = Date.now(),
      job = compiler.start(p.id);
    await until(
      () => job.log.includes("article.cls"),
      10000,
      "real TeX running",
    );
    while (Date.now() - started < 122000) {
      assert.equal(job.status, "running", job.log);
      await pause(100);
    }
    assert.equal(job.timeoutMs, null);
    assert.equal(job.status, "running");
    const elapsedMs = Date.now() - started;
    compiler.cancel(job.id);
    await until(
      () => job.status === "cancelled",
      10000,
      "unlimited Stop drain",
    );
    drained(compiler, job.id);
    assert.equal(compiler.latestPdf(p.id)?.id, good.id);
    assert.equal(snapshot(p.id), before);
    results.push({
      name: "real TeX survives former two-minute cap and still stops",
      job: job.id,
      passed: true,
      elapsedMs,
      sourceHistoryExact: true,
      previousPdfRetained: good.id,
    });
    console.log("PASS real TeX survives former two-minute cap and still stops");
  } else {
    results.push({
      name: "real compile beyond two minutes",
      passed: null,
      reason: "Run with --long to execute the 122-second integration check.",
    });
  }

  const limited = new Compiler(store, undefined, { timeoutMs: 500 });
  compilers.push(limited);
  const pDeadline = store.create("Synthetic owner-chosen deadline", [
    { path: "main.tex", data: Buffer.from(infinite) },
  ]);
  const before = snapshot(pDeadline.id),
    job = limited.start(pDeadline.id);
  await until(
    () => !["queued", "running"].includes(job.status),
    10000,
    "configured timeout",
  );
  assert.equal(job.status, "failed", job.log);
  assert.equal(job.timeoutMs, 500);
  assert.match(job.log, /configured time limit \(500 ms\)/);
  assert.ok(
    job.diagnostics.some((d) => /configured time limit/.test(d.message)),
  );
  assert.equal(job.pdf, false);
  assert.equal(snapshot(pDeadline.id), before);
  drained(limited, job.id);
  results.push({
    name: "explicit configured deadline stops real TeX and yields an actionable diagnostic",
    job: job.id,
    passed: true,
    timeoutMs: job.timeoutMs,
    sourceHistoryExact: true,
  });
  console.log("PASS explicit configured deadline stops real TeX");
} finally {
  for (const runner of compilers) await runner.shutdown();
  store.close();
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        machine: {
          platform: os.platform(),
          architecture: os.arch(),
          release: os.release(),
          cpus: os.cpus().length,
          cpu: os.cpus()[0]?.model,
          memoryBytes: os.totalmem(),
          node: process.version,
        },
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ root, checks: results.length }));
}
