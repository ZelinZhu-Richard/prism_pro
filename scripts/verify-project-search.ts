import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../server/store";
import { ProjectSearch } from "../server/project-search";
import { Compiler } from "../server/compiler";

const root = path.resolve("data/verification/project-search-" + Date.now());
fs.mkdirSync(root, { recursive: true });
const store = new Store(root),
  search = new ProjectSearch(store),
  compiler = new Compiler(store);
const project = store.create("Synthetic project replacement", [
  {
    path: "main.tex",
    data: Buffer.from(
      "\\documentclass{article}\n\\begin{document}\n\\section{Calibration}\nA calibration study.\n\\input{sections/method}\n\\end{document}\n",
    ),
  },
  {
    path: "sections/method.tex",
    data: Buffer.from(
      "\\subsection{Method}\nThe calibration model preserves \\textbf{source}.\n",
    ),
  },
]);
const before = store
  .exportFiles(project.id)
  .map((file) => ({ path: file.path, data: file.data.toString("base64") }));
const results: { name: string; job: string }[] = [];
async function compile(name: string) {
  const job = compiler.start(project.id),
    start = Date.now();
  while (compiler.processes.has(job.id)) {
    if (Date.now() - start > 130000)
      throw new Error("Compilation verification timed out.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(job.status, "succeeded", job.log.slice(-4000));
  assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
  results.push({ name, job: job.id });
  console.log("PASS " + name);
}
try {
  await compile("Original multi-file document");
  const checkpoints = store.checkpoints(project.id).length;
  const preview = await search.preview(project.id, {
    query: "calibration",
    caseSensitive: true,
    replacement: "\\emph{calibration}",
    include: "**/*.tex",
  });
  assert.equal(preview.total, 2);
  assert.equal(preview.files.length, 2);
  assert.equal(store.checkpoints(project.id).length, checkpoints);
  search.apply(
    project.id,
    preview.id,
    preview.files.map((file) => file.path),
  );
  await compile("Reviewed replacement in both files");
  search.apply(project.id, preview.id, undefined, true);
  assert.deepEqual(
    store
      .exportFiles(project.id)
      .map((file) => ({ path: file.path, data: file.data.toString("base64") })),
    before,
  );
  await compile("Exact source restored with project Undo");
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ passed: results.length, results }, null, 2),
  );
  console.log(JSON.stringify({ passed: results.length, root }));
} finally {
  for (const id of compiler.processes.keys()) compiler.cancel(id);
  while (compiler.processes.size)
    await new Promise((resolve) => setTimeout(resolve, 50));
  await search.close();
  store.close();
}
