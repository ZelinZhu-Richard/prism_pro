import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Comments } from "../server/comments";
import { Compiler } from "../server/compiler";
const root = path.resolve(`data/verification/comments-compiler-${Date.now()}`),
  store = new Store(root),
  comments = new Comments(store),
  compiler = new Compiler(store);
const main = String.raw`\documentclass{article}
\begin{document}
\section{Synthetic review}
\input{sections/body}
\end{document}
`,
  body = "A synthetic target paragraph.\n";
const results: { name: string; job: string; text?: string }[] = [];
try {
  const project = store.create("Synthetic comments compilation", [
    { path: "main.tex", data: Buffer.from(main) },
    { path: "sections/body.tex", data: Buffer.from(body) },
  ]);
  const compile = async (name: string) => {
    const job = compiler.start(project.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    const text = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
      encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        LANG: "en_US.UTF-8",
      },
    });
    results.push({
      name,
      job: job.id,
      text: text.status === 0 ? text.stdout : undefined,
    });
    console.log("PASS " + name);
  };
  await compile("Original multi-file project");
  const before = store.checkpoints(project.id).length,
    generation = store.project(project.id).generation;
  let thread = comments.create(project.id, {
    id: randomUUID(),
    path: "sections/body.tex",
    revision: 0,
    from: 0,
    to: body.trim().length,
    body: "A local review note, Café 👩🏽‍🔬. No source edit.",
  });
  const change = (action: string, extra: Record<string, unknown> = {}) =>
    (thread = comments.change(project.id, thread.id, {
      revision: thread.revision,
      action,
      ...extra,
    }));
  change("reply", { id: randomUUID(), body: "A synthetic reply." });
  change("resolve");
  change("reopen");
  change("trash");
  change("restore");
  assert.equal(store.checkpoints(project.id).length, before);
  assert.equal(store.project(project.id).generation, generation);
  assert.equal(store.readText(project.id, "main.tex").content, main);
  assert.equal(store.readText(project.id, "sections/body.tex").content, body);
  await compile("After comment/reply/resolution/Trash recovery");
  const file = store.save(
    project.id,
    "sections/body.tex",
    "A revised synthetic paragraph.\n",
    0,
  );
  assert.notEqual(
    comments.get(project.id, thread.id).anchor.status,
    "attached",
  );
  store.save(project.id, file.path, body, file.revision);
  assert.equal(comments.get(project.id, thread.id).anchor.status, "attached");
  await compile("Exact source Undo with restored comment anchor");
  if (results.every((r) => r.text !== undefined)) {
    assert.equal(results[1].text, results[0].text);
    assert.equal(results[2].text, results[0].text);
    console.log("PASS identical extracted PDF text across all three builds");
  } else
    console.log(
      "SKIP text comparison: pdftotext unavailable; compile/source checks passed",
    );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        results,
        project: project.id,
        historyUnchangedByComments: true,
        sourceUnchangedByComments: true,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
