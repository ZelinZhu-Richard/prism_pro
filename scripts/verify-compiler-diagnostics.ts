import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Compiler } from "../server/compiler";
import { Store } from "../server/store";
import type { CompileJob, Engine } from "../shared/types";
const root = path.resolve(
  "data/verification/compiler-diagnostics-" + Date.now(),
);
fs.mkdirSync(root, { recursive: true });
const store = new Store(root),
  compiler = new Compiler(store);
const results: any[] = [];
const main = String.raw`\documentclass{article}
\begin{document}
\input{sections/paragraph}
\bibliographystyle{plain}\bibliography{refs}
\end{document}
`;
const paragraph = String.raw`\section{Example}\label{sec:example}
Nested evidence cites~\cite{valid} and refers to Section~\ref{sec:example}.
`;
const bib =
  "@article{valid,author={Example Author},title={Synthetic diagnostics},journal={Example Journal},year={2026}}\n";
function make(
  name: string,
  engine: Engine = "pdflatex",
  body = paragraph,
  bibliography = bib,
) {
  const project = store.create(name, [
    { path: "paper/main.tex", data: Buffer.from(main) },
    { path: "sections/paragraph.tex", data: Buffer.from(body) },
    { path: "refs.bib", data: Buffer.from(bibliography) },
  ]);
  store.update(project.id, { root: "paper/main.tex", engine });
  return project;
}
function source(id: string) {
  return JSON.stringify({
    project: store.project(id),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.directory, f.data.toString("base64")]),
    history: store.checkpoints(id),
  });
}
async function build(id: string) {
  store.automaticCheckpoint(id);
  const before = source(id),
    job = compiler.start(id),
    child = compiler.processes.get(job.id)!;
  const end = Date.now() + 15000;
  while (["queued", "running"].includes(job.status)) {
    assert.ok(Date.now() < end, "Build timed out: " + job.log.slice(-1000));
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(source(id), before);
  const frozen = JSON.stringify({ log: job.log, diagnostics: job.diagnostics });
  child.emit("message", { type: "output", text: "UNEXPECTED_LATE_OUTPUT" });
  assert.equal(
    JSON.stringify({ log: job.log, diagnostics: job.diagnostics }),
    frozen,
  );
  return job;
}
function record(name: string, job: CompileJob, extra = {}) {
  const value = {
    name,
    project: job.projectId,
    id: job.id,
    engine: job.engine,
    status: job.status,
    pdf: job.pdf,
    diagnostics: job.diagnostics,
    ...extra,
  };
  results.push(value);
  console.log("PASS " + name);
}
try {
  for (const engine of ["pdflatex", "xelatex", "lualatex", "latex"] as const) {
    const p = make("Resolved " + engine, engine),
      job = await build(p.id);
    assert.equal(job.status, "succeeded", job.log);
    assert.equal(job.pdf, true);
    assert.ok(/LaTeX Warning:.*(?:Citation|Reference)/.test(job.log));
    assert.deepEqual(job.diagnostics, []);
    record("resolved citations/references · " + engine, job, {
      consoleHasEarlyWarnings: true,
    });
  }
  const missing = make(
      "Missing citation",
      "pdflatex",
      paragraph.replace("{valid}", "{missing}"),
    ),
    missingJob = await build(missing.id);
  assert.equal(missingJob.status, "succeeded", missingJob.log);
  const detail = missingJob.diagnostics.filter((d) =>
    /Citation.*missing/.test(d.message),
  );
  assert.equal(detail.length, 1);
  assert.equal(detail[0].path, "sections/paragraph.tex");
  assert.equal(detail[0].line, 2);
  assert.ok(
    missingJob.diagnostics.some((d) =>
      /BibTeX:.*database entry/.test(d.message),
    ),
  );
  record(
    "genuine missing citation remains linked and deduplicated",
    missingJob,
  );
  const fixed = store.readText(missing.id, "sections/paragraph.tex");
  store.save(missing.id, fixed.path, paragraph, fixed.revision);
  const fixedJob = await build(missing.id);
  assert.equal(fixedJob.status, "succeeded", fixedJob.log);
  assert.deepEqual(fixedJob.diagnostics, []);
  record("fixing citation clears final diagnostics", fixedJob);
  const badBib = make(
      "Malformed bibliography",
      "pdflatex",
      paragraph,
      "@article{valid,\n title={Broken} this is invalid\n}\n",
    ),
    badBibJob = await build(badBib.id);
  assert.equal(badBibJob.status, "failed", badBibJob.log);
  const bibError = badBibJob.diagnostics.find(
    (d) => d.severity === "error" && d.path === "refs.bib",
  );
  assert.ok(bibError?.line, JSON.stringify(badBibJob.diagnostics));
  record("BibTeX failure retains bibliography location", badBibJob);
  const warning = make(
      "Persistent warnings",
      "pdflatex",
      paragraph +
        "\\PackageWarning{fixture}{Persistent synthetic notice}\n\\hbox to 2pt{Wide synthetic content}\n",
    ),
    warningJob = await build(warning.id);
  assert.equal(warningJob.status, "succeeded", warningJob.log);
  assert.ok(
    warningJob.diagnostics.some(
      (d) =>
        /Persistent synthetic notice/.test(d.message) &&
        d.path === "sections/paragraph.tex" &&
        d.line === 3,
    ),
  );
  assert.ok(
    warningJob.diagnostics.some(
      (d) => /Overfull/.test(d.message) && d.path === "sections/paragraph.tex",
    ),
  );
  record("persistent package/box warnings remain", warningJob);
  const error = store.create("Nested error with spaces", [
    {
      path: "paper/main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\n\\input{sections/with space}\n\\end{document}\n",
      ),
    },
    {
      path: "sections/with space.tex",
      data: Buffer.from("Synthetic text.\n\\undefinedFixtureCommand\n"),
    },
  ]);
  store.update(error.id, { root: "paper/main.tex" });
  const errorJob = await build(error.id);
  assert.equal(errorJob.status, "failed", errorJob.log);
  assert.ok(
    errorJob.diagnostics.some(
      (d) =>
        d.severity === "error" &&
        d.path === "sections/with space.tex" &&
        d.line === 2,
    ),
    JSON.stringify(errorJob.diagnostics),
  );
  record("nested file error preserves spaces and exact line", errorJob);
  const longPath = "sections/" + "long_".repeat(24) + ".tex";
  const long = store.create("Long wrapped source path", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\n\\input{" +
          longPath +
          "}\n\\end{document}\n",
      ),
    },
    {
      path: longPath,
      data: Buffer.from("Synthetic.\n\\undefinedFixtureCommand\n"),
    },
  ]);
  const longJob = await build(long.id);
  assert.equal(longJob.status, "failed", longJob.log);
  assert.ok(
    longJob.diagnostics.some(
      (d) =>
        d.path === longPath &&
        d.line === 2 &&
        /Undefined control sequence/.test(d.message),
    ),
    JSON.stringify(longJob.diagnostics),
  );
  assert.ok(
    longJob.diagnostics.some((d) => /PDF file produced!/.test(d.message)),
    JSON.stringify(longJob.diagnostics),
  );
  record("long wrapped filename/error remains complete", longJob);
  const ps = store.create("Ghostscript error", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}Synthetic.\\special{ps: fixtureOperatorDoesNotExist}\\end{document}\n",
      ),
    },
  ]);
  store.update(ps.id, { engine: "latex" });
  const psJob = await build(ps.id);
  assert.equal(psJob.status, "failed", psJob.log);
  assert.ok(
    psJob.diagnostics.some(
      (d) => d.severity === "error" && /undefined|Ghostscript/.test(d.message),
    ),
    JSON.stringify(psJob.diagnostics),
  );
  record("Ghostscript failure survives a clean final TeX log", psJob);
  // Seed the historical console-only representation from a genuine multipass
  // build. This keeps the migration check self-contained on a fresh checkout.
  const legacy = compiler.jobs.get(results[0].id)!;
  const before = JSON.stringify({
    source: source(legacy.projectId),
    id: legacy.id,
    status: legacy.status,
    pdf: legacy.pdf,
    log: legacy.log,
    runtime: legacy.runtime,
  });
  legacy.diagnostics = legacy.log
    .split("\n")
    .filter((line) => /^LaTeX Warning:/.test(line))
    .map((message) => ({
      severity: "warning" as const,
      path: legacy.root,
      message,
    }));
  delete legacy.diagnosticsVersion;
  const count = legacy.diagnostics.length;
  assert.ok(count > 0);
  compiler.persist(legacy);
  compiler.get(legacy.id);
  assert.deepEqual(legacy.diagnostics, []);
  assert.equal(
    JSON.stringify({
      source: source(legacy.projectId),
      id: legacy.id,
      status: legacy.status,
      pdf: legacy.pdf,
      log: legacy.log,
      runtime: legacy.runtime,
    }),
    before,
  );
  results.push({
    name: "legacy metadata seeded from real multipass output",
    id: legacy.id,
    before: count,
    after: 0,
    sourceHistoryCompileIdentityExact: true,
  });
  console.log("PASS legacy metadata seeded from real multipass output");
} finally {
  await compiler.shutdown();
  store.close();
  const report = { root, results };
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    "data/verification/compiler-diagnostics-completed.json",
    JSON.stringify({ root }, null, 2),
  );
}
console.log(JSON.stringify({ root, checks: results.length }));
