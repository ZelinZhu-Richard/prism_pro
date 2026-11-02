import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys } from "../server/providers";
import type { AiRun, CompileJob } from "../shared/types";
const root = path.resolve("data/verification/preview-builds-" + Date.now()),
  store = new Store(root),
  compiler = new Compiler(store),
  ai = new AI(store, compiler, new Keys());
const content =
  "\\documentclass{article}\n\\begin{document}\n\\section{Synthetic preview checks}\nORIGINAL passage.\n\\input{notes}\n\\end{document}\n";
const p = store.create("Synthetic isolated preview builds", [
  { path: "main.tex", data: Buffer.from(content) },
  { path: "notes.tex", data: Buffer.from("Independent nested source.\n") },
]);
store.automaticCheckpoint(p.id);
const conversation = store.createConversation(
  p.id,
  "One synthetic conversation",
);
function run() {
  const id = randomUUID(),
    from = content.indexOf("ORIGINAL passage.");
  const r: AiRun & Record<string, any> = {
    id,
    projectId: p.id,
    conversationId: conversation.id,
    provider: "openai",
    model: "fixture-no-generation",
    mode: "manual",
    scope: "project",
    path: "main.tex",
    from,
    to: from + "ORIGINAL passage.".length,
    status: "preview",
    created: new Date().toISOString(),
    prompt: "Synthetic reviewed replacement",
    text: "Synthetic explanation",
    insertion: "Replacement passage.",
    before: content,
    baseRevision: 0,
    lastRevision: 0,
    contextFiles: ["main.tex", "notes.tex"],
  };
  store.saveRun(r);
  store.projectLocks.set(p.id, id);
  store.locks.set(p.id + "/main.tex", id);
  return r;
}
const neutral = () =>
  JSON.stringify({
    p: store.project(p.id),
    files: store
      .exportFiles(p.id)
      .map((f) => ({ path: f.path, data: f.data.toString("base64") })),
    history: store.checkpoints(p.id),
    versions: store.db
      .prepare("SELECT * FROM versions WHERE project=?")
      .all(p.id),
  });
async function finish(job: CompileJob) {
  const until = Date.now() + 150000;
  while (["running", "queued"].includes(job.status) && Date.now() < until)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(
    !["running", "queued"].includes(job.status),
    "Compiler did not settle",
  );
  assert.equal(compiler.processes.has(job.id), false);
  return job;
}
try {
  const ordinary = await finish(compiler.start(p.id));
  assert.equal(ordinary.status, "succeeded", ordinary.log);
  const r = run(),
    before = neutral(),
    request = randomUUID(),
    first = ai.compileDraft(r.id, "\\emph{Replacement preview.}", request);
  assert.equal(
    ai.compileDraft(r.id, "\\emph{Replacement preview.}", request).id,
    first.id,
  );
  await finish(first);
  assert.equal(first.status, "succeeded", first.log);
  assert.equal(first.pdf, true);
  assert.equal(neutral(), before);
  assert.ok(
    fs
      .readFileSync(
        path.join(compiler.dir(first.id), "source/main.tex"),
        "utf8",
      )
      .includes("\\emph{Replacement preview.}"),
  );
  const cancelled = ai.compileDraft(
    r.id,
    "\\loop\\iftrue\\repeat",
    randomUUID(),
  );
  const stopped = ai.previewBuilds.cancel(
    r.id,
    cancelled.previewRequest!.requestId,
  );
  assert.equal(stopped.job?.cancelRequested, true);
  assert.equal(cancelled.status, "running");
  assert.throws(
    () => ai.compileDraft(r.id, "Another replacement.", randomUUID()),
    /already running/,
  );
  assert.throws(() => ai.approve(r.id, "Replacement."), /preview build/);
  await finish(cancelled);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.pdf, false);
  assert.equal(neutral(), before);
  const never = randomUUID(),
    count = compiler.jobs.size;
  ai.previewBuilds.cancel(r.id, never);
  assert.throws(
    () => ai.compileDraft(r.id, "Never compiled", never),
    /stopped before/,
  );
  assert.equal(compiler.jobs.size, count);
  const discarded = ai.compileDraft(
    r.id,
    "\\loop\\iftrue\\repeat",
    randomUUID(),
  );
  ai.stop(r.id);
  ai.finish(r.id);
  await finish(discarded);
  assert.equal(discarded.status, "cancelled");
  assert.equal(neutral(), before);
  assert.equal(compiler.latestPdf(p.id)?.id, ordinary.id);
  assert.equal(compiler.list(p.id).length, 1);
  const report = {
    root,
    project: p.id,
    conversation: conversation.id,
    ordinary: ordinary.id,
    success: first.id,
    cancelled: cancelled.id,
    discarded: discarded.id,
    sourceHistoryNeutral: true,
    requestReplayExact: true,
    stopBeforeStart: true,
    processDrainVerified: true,
    priorPdfPreserved: true,
    generations: 0,
  };
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    "data/verification/preview-builds-fixture.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const job of compiler.jobs.values())
    if (["queued", "running"].includes(job.status)) compiler.cancel(job.id);
  for (const timer of ai.leases.values()) clearTimeout(timer);
  store.close();
}
