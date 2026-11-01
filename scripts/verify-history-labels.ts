import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { HistoryLabels } from "../server/history-labels";
const root = path.resolve(
    "data/verification/history-labels-compiler-" + Date.now(),
  ),
  store = new Store(root),
  compiler = new Compiler(store),
  labels = new HistoryLabels(store),
  jobs: any[] = [];
try {
  const p = store.create("Synthetic labels compilation", [
      {
        path: "main.tex",
        data: Buffer.from(String.raw`\documentclass{article}
\begin{document}
\section{Synthetic milestone}
\input{sections/body}
\end{document}
`),
      },
      {
        path: "sections/body.tex",
        data: Buffer.from("Unchanged source across label operations.\n"),
      },
    ]),
    version = store.checkpoint(p.id, "Initial milestone");
  const evidence = () => ({
    files: store.exportFiles(p.id),
    generation: store.project(p.id).generation,
    payload: store.db
      .prepare("SELECT payload FROM checkpoints WHERE id=?")
      .get(version.id)!.payload,
    history: store.checkpoints(p.id).length,
  });
  const before = evidence();
  async function compile(name: string) {
    const job = compiler.start(p.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    const output = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
      encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        LANG: "en_US.UTF-8",
      },
    });
    jobs.push({
      name,
      id: job.id,
      text: output.status === 0 ? output.stdout : undefined,
    });
    console.log("PASS " + name);
  }
  await compile("Original source");
  let v = labels.get(p.id, version.id);
  const add = {
    id: randomUUID(),
    action: "add",
    name: "Ready for review · 第二轮",
    expectedRevision: v.labelRevision,
  };
  v = labels.change(p.id, version.id, add).version;
  const first = v.labels![0].id;
  for (const action of ["rename", "remove", "restore"])
    v = labels.change(p.id, version.id, {
      id: randomUUID(),
      action,
      labelId: first,
      expectedRevision: v.labelRevision,
      ...(action === "rename" ? { name: "Café milestone" } : {}),
    }).version;
  assert.equal(labels.change(p.id, version.id, add).replayed, true);
  assert.deepEqual(evidence(), before);
  await compile(
    "Identical source after multiple labels, rename, removal, recovery and replay",
  );
  if (jobs.every((j) => j.text !== undefined))
    assert.equal(jobs[0].text, jobs[1].text);
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        exactSource: true,
        exactSnapshot: true,
        unchangedGeneration: true,
        jobs,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS unchanged source, immutable version and extracted PDF text",
  );
} finally {
  store.close();
}
