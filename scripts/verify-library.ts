import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Library } from "../server/library";
import { readZip } from "../server/files";
const root = path.resolve("data/verification/library-compiler-" + Date.now()),
  store = new Store(root),
  compiler = new Compiler(store),
  library = new Library(store, compiler),
  results: any[] = [];
async function build(id: string) {
  const job = compiler.start(id),
    start = Date.now();
  while (compiler.processes.has(job.id)) {
    if (Date.now() - start > 130000) throw new Error("Compile timeout");
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(job.status, "succeeded", job.log.slice(-3500));
  const output = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
    env: {
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      LANG: "en_US.UTF-8",
    },
  });
  assert.equal(
    output.status,
    0,
    "Install pdftotext for this verification command.",
  );
  assert.ok(output.stdout.trim());
  results.push({ id: job.id, project: id, text: output.stdout });
  return output.stdout;
}
function snapshot(id: string) {
  return JSON.stringify({
    row: store.project(id),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.data.toString("base64"), !!f.directory]),
    history: store.checkpoints(id),
    chats: store.conversations(id),
  });
}
function apply(action: string, ids: string[], tags?: string[]) {
  library.apply({
    id: randomUUID(),
    preview: library.preview({ action, projects: ids, tags }),
  });
}
try {
  const p = store.create("Synthetic library source", [
    {
      path: "paper/main.tex",
      data: Buffer.from(String.raw`\documentclass{article}
\begin{document}
\section{An independent local project}
Archive and tags preserve the exact source.
\input{paper/sections/body}
\end{document}
`),
    },
    {
      path: "paper/sections/body.tex",
      data: Buffer.from(
        "Nested evidence and an empty asset folder remain available.\n",
      ),
    },
    { path: "assets/raw.bin", data: Buffer.from([0, 255, 7, 9]) },
    { path: "assets/empty", data: Buffer.alloc(0), directory: true },
  ]);
  store.update(p.id, { root: "paper/main.tex", engine: "pdflatex" });
  store.automaticCheckpoint(p.id);
  const before = snapshot(p.id),
    text = await build(p.id);
  library.changeTag({
    id: randomUUID(),
    action: "create",
    name: "Research",
    color: "#6087b9",
  });
  library.changeTag({
    id: randomUUID(),
    action: "create",
    name: "Teaching",
    color: "#5f9670",
  });
  const ids = library.state().tags.map((t) => t.id);
  apply("tag-add", [p.id], ids);
  apply("archive", [p.id]);
  assert.equal(snapshot(p.id), before);
  const archivedText = await build(p.id);
  assert.equal(archivedText, text);
  apply("trash", [p.id]);
  apply("restore", [p.id]);
  assert.ok(library.state().projects.find((x) => x.id === p.id)!.archivedAt);
  assert.equal(snapshot(p.id), before);
  const exportPlan = library.preview({ action: "export", projects: [p.id] });
  const outer = await readZip(Buffer.from(library.export(exportPlan))),
    files = await readZip(outer[0].data);
  assert.deepEqual(
    files
      .map((f) => [
        f.path,
        createHash("sha256").update(f.data).digest("hex"),
        !!f.directory,
      ])
      .sort(),
    store
      .exportFiles(p.id)
      .map((f) => [
        f.path,
        createHash("sha256").update(f.data).digest("hex"),
        !!f.directory,
      ])
      .sort(),
  );
  const roundtrip = store.create("Imported independent ZIP", files);
  store.update(roundtrip.id, { root: "paper/main.tex", engine: "pdflatex" });
  assert.equal(await build(roundtrip.id), text);
  assert.equal(snapshot(p.id), before);
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      { root, originalExact: true, sourceZipExact: true, results },
      null,
      2,
    ),
  );
  console.log(
    "PASS three real builds, archived compile, exact Trash/restore and nested ZIP round-trip; " +
      root,
  );
} finally {
  for (const job of compiler.jobs.values())
    if (["queued", "running"].includes(job.status)) compiler.cancel(job.id);
  const deadline = Date.now() + 10000;
  while (compiler.processes.size && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  store.close();
}
