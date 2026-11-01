import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Tracking } from "../server/tracking";
import { Compiler } from "../server/compiler";
const root = path.resolve(`data/verification/tracking-compiler-${Date.now()}`),
  store = new Store(root),
  tracking = new Tracking(store),
  compiler = new Compiler(store);
const main =
    "\\documentclass{article}\n\\begin{document}\n\\section{Synthetic tracked review}\n\\input{sections/body}\n\\end{document}\n",
  body = "An original target paragraph.\n\nA supporting statement.\n",
  changed =
    "A revised target paragraph.\n\nA supporting statement with evidence.\n";
const results: { name: string; job: string; text?: string }[] = [];
try {
  const p = store.create("Synthetic tracked review", [
    { path: "main.tex", data: Buffer.from(main) },
    { path: "sections/body.tex", data: Buffer.from(body) },
  ]);
  async function compile(name: string) {
    const job = compiler.start(p.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    const extracted = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
      encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        LANG: "en_US.UTF-8",
      },
    });
    results.push({
      name,
      job: job.id,
      text: extracted.status === 0 ? extracted.stdout : undefined,
    });
    console.log("PASS " + name);
  }
  await compile("Original multi-file project");
  tracking.mode(p.id, { enabled: true, revision: 0 });
  store.save(p.id, "sections/body.tex", changed, 0);
  await compile("Tracked current source compiles without review markup");
  const review = (action: string) => {
    const f = tracking.file(p.id, "sections/body.tex");
    return tracking.apply(p.id, {
      id: randomUUID(),
      path: f.path,
      action,
      ids: f.hunks.map((h) => h.id),
      sourceRevision: f.sourceRevision,
      reviewRevision: f.reviewRevision,
      token: f.token,
    });
  };
  const generation = store.project(p.id).generation,
    history = store.checkpoints(p.id).length,
    accepted = review("accept");
  assert.equal(store.project(p.id).generation, generation);
  assert.equal(store.checkpoints(p.id).length, history);
  assert.equal(store.readText(p.id, "sections/body.tex").content, changed);
  await compile("Accept leaves source and compiled text unchanged");
  tracking.undo(p.id, accepted.id);
  assert.ok(tracking.file(p.id, "sections/body.tex").hunks.length);
  const rejected = review("reject");
  assert.equal(store.readText(p.id, "sections/body.tex").content, body);
  await compile("Reject restores original source and output");
  tracking.undo(p.id, rejected.id);
  assert.equal(store.readText(p.id, "sections/body.tex").content, changed);
  await compile("Undo Reject restores current source and pending review");
  if (results.every((r) => r.text !== undefined)) {
    assert.equal(results[0].text, results[3].text);
    assert.equal(results[1].text, results[2].text);
    assert.equal(results[1].text, results[4].text);
    assert.notEqual(results[0].text, results[1].text);
    console.log("PASS expected PDF text equivalence for Accept/Reject/Undo");
  } else console.log("SKIP PDF text comparison: pdftotext unavailable");
  assert.equal(store.readText(p.id, "main.tex").content, main);
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        project: p.id,
        results,
        exactSource: true,
        acceptDoesNotChangeHistory: true,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
