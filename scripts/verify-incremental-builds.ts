import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { CompileJob, Engine } from "../shared/types";
import type {
  LocalOpenResult,
  LocalOpenReview,
} from "../shared/local-projects";
import { readZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";
import { offlineArchive, offlineWorkspace } from "./offline-fixture";

const root = path.resolve("data/verification/incremental-builds-" + Date.now()),
  source = path.join(root, "ordinary paper"),
  data = path.join(root, "state"),
  entries = await readZip(offlineArchive(root));
for (const entry of entries) {
  const target = path.join(source, entry.path);
  if (entry.directory) fs.mkdirSync(target, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
}

let fixture = await offlineWorkspace(data);
const observations: {
  label: string;
  id: string;
  ms: number;
  tex: number;
  bib: number;
  seed?: string;
}[] = [];
const epochs: ReturnType<typeof fixture.evidence>[] = [];
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };

async function post<T>(url: string, payload: object) {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api" + url,
    headers,
    payload,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<T>();
}
async function finish(
  label: string,
  id: string,
  started: number,
  expected = "succeeded",
) {
  let job: CompileJob;
  do {
    job = fixture.compiler.get(id)!;
    if (["running", "queued"].includes(job.status)) {
      assert(
        performance.now() - started < 60_000,
        "Verification build deadline",
      );
      await delay(20);
    }
  } while (["running", "queued"].includes(job.status));
  assert.equal(job.status, expected, job.log.slice(-2500));
  const identity = supervisorIdentity(fixture.compiler.dir(id));
  assert(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  const row = {
    label,
    id,
    ms: Math.round(performance.now() - started),
    tex: (job.log.match(/applying rule '(?:pdf|lua|xe)?latex'/g) ?? []).length,
    bib: (job.log.match(/applying rule 'bib(?:tex|er)\b/g) ?? []).length,
    seed: job.incrementalFrom,
  };
  observations.push(row);
  console.log("PASS", JSON.stringify(row));
  return job;
}
async function build(label: string, projectId: string, clean = false) {
  const started = performance.now();
  const job = await post<CompileJob>(`/projects/${projectId}/compile`, {
    clean,
  });
  return finish(label, job.id, started);
}
function change(id: string, name: string, transform: (old: string) => string) {
  const file = fixture.store.readText(id, name);
  fixture.store.save(id, name, transform(file.content), file.revision);
}
function out(job: CompileJob, file: string) {
  return path.join(fixture.compiler.dir(job.id), "out", file);
}
function pdfText(job: CompileJob) {
  const result = spawnSync(
    "pdftotext",
    [fixture.compiler.pdfPath(job.id), "-"],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.replace(/\s+/g, " ");
}
const digest = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

try {
  const input = { mode: "folder", path: source };
  const review = await post<LocalOpenReview>("/local-projects/review", input);
  const { project } = await post<LocalOpenResult>("/local-projects/open", {
    ...input,
    token: review.token,
    main: "main.tex",
  });
  const id = project.id;
  const initial = await build("initial linked-folder build", id);
  assert.equal(initial.incrementalFrom, undefined);
  const oldPdf = digest(fixture.compiler.pdfPath(initial.id)),
    oldFdb = digest(out(initial, "main.fdb_latexmk"));
  assert(pdfText(initial).includes("Local Verification"));
  epochs.push(fixture.evidence());
  await fixture.app.close();
  fixture.restoreFetch();
  fixture = await offlineWorkspace(data);

  change(id, "sections/introduction.tex", (text) =>
    text.replace("Offline writing", "Focused writing"),
  );
  const warm = await build("prose edit after backend restart", id);
  assert.equal(warm.incrementalFrom, initial.id);
  assert.equal(observations.at(-1)!.bib, 0);
  assert.equal(observations.at(-1)!.tex, 1);
  assert(fs.existsSync(out(warm, "main.blg")));
  assert(pdfText(warm).includes("Focused writing"));
  const fwd = fixture.compiler.sync(warm.id, {
    direction: "forward",
    path: "sections/introduction.tex",
    line: 2,
  });
  const back = fixture.compiler.sync(warm.id, { direction: "inverse", ...fwd });
  assert.equal(back.path, "sections/introduction.tex");
  assert.equal(digest(fixture.compiler.pdfPath(initial.id)), oldPdf);
  assert.equal(digest(out(initial, "main.fdb_latexmk")), oldFdb);
  assert(
    !fs
      .readFileSync(out(warm, "main.fdb_latexmk"), "utf8")
      .includes(initial.id),
  );

  change(id, "references.bib", (text) => {
    const updated = text.replace("Local Verification", "Fresh Verification");
    assert.equal(Buffer.byteLength(text), Buffer.byteLength(updated));
    return updated;
  });
  const bib = await build("same-size bibliography edit", id);
  assert.equal(bib.incrementalFrom, warm.id);
  assert(observations.at(-1)!.bib >= 1);
  assert.match(
    fs.readFileSync(out(bib, "main.bbl"), "utf8"),
    /Fresh Verification/,
  );
  assert(pdfText(bib).includes("Fresh Verification"));

  const clean = await build("explicit clean rebuild", id, true);
  assert.equal(clean.incrementalFrom, undefined);
  assert(observations.at(-1)!.tex > 1);
  assert(pdfText(clean).includes("Fresh Verification"));

  change(id, "main.tex", (text) =>
    text.replace("\\bibliographystyle{plain}\\bibliography{references}\n", ""),
  );
  change(id, "sections/introduction.tex", (text) =>
    text.replace("~\\cite{local2026}", ""),
  );
  const removed = await build(
    "remove bibliography without removing any source path",
    id,
  );
  assert.equal(removed.incrementalFrom, clean.id);
  assert(!fs.existsSync(out(removed, "main.bbl")));
  assert(!fs.existsSync(out(removed, "main.blg")));
  assert(!pdfText(removed).includes("Fresh Verification"));

  fixture.store.add(id, "notes/fresh.txt", Buffer.from("New path."));
  const layout = await build("source layout invalidates state", id);
  assert.equal(layout.incrementalFrom, undefined);
  fixture.compiler.configure(id, {
    ...fixture.compiler.settings(id),
    mode: "draft",
  });
  const options = await build("changed compiler options invalidate state", id);
  assert.equal(options.incrementalFrom, undefined);
  const file = fixture.store.readText(id, "main.tex");
  const startedPreview = performance.now(),
    preview = fixture.compiler.start(id, false, {
      runId: "synthetic-preview",
      path: file.path,
      content: file.content,
    });
  const completedPreview = await finish(
    "draft preview is isolated from ordinary reuse",
    preview.id,
    startedPreview,
  );
  assert.equal(completedPreview.incrementalFrom, undefined);
  assert.equal(fixture.compiler.latestPdf(id)?.id, options.id);

  const draftText = String.raw`\documentclass{article}
\newcommand{\retiredcachecommand}{}
\begin{document}
\makeatletter
\immediate\write\@auxout{\string\retiredcachecommand}
\makeatother
An initial document.
\end{document}`;
  const fallback = fixture.store.create("Auxiliary compatibility", [
    { path: "main.tex", data: Buffer.from(draftText) },
  ]);
  const first = await build(
    "create valid auxiliary with a document macro",
    fallback.id,
  );
  assert.match(
    fs.readFileSync(out(first, "main.aux"), "utf8"),
    /retiredcachecommand/,
  );
  change(
    fallback.id,
    "main.tex",
    () => String.raw`\documentclass{article}
\begin{document}
The clean retry succeeds.
\end{document}`,
  );
  const retried = await build(
    "stale auxiliary causes one automatic clean retry",
    fallback.id,
  );
  assert.equal(retried.incrementalFrom, first.id);
  assert.match(retried.log, /^Incremental build failed\. Retrying once/);
  assert(!retried.diagnostics.some((d) => d.severity === "error"));
  assert(pdfText(retried).includes("The clean retry succeeds."));

  change(
    fallback.id,
    "main.tex",
    () => String.raw`\documentclass{article}
\begin{document}
\loop\iftrue\repeat
\end{document}`,
  );
  const cancelStarted = performance.now(),
    pending = await post<CompileJob>(`/projects/${fallback.id}/compile`, {});
  assert.equal(pending.incrementalFrom, retried.id);
  while (
    !fixture.compiler
      .get(pending.id)
      ?.log.includes("Run number 1 of rule 'pdflatex'")
  ) {
    assert(
      performance.now() - cancelStarted < 10_000,
      "The running TeX process did not report its first pass",
    );
    await delay(20);
  }
  await post(`/builds/${pending.id}/cancel`, {});
  const cancelled = await finish(
    "Stop drains the incremental job without a retry",
    pending.id,
    cancelStarted,
    "cancelled",
  );
  assert(!cancelled.log.includes("Retrying once"));
  assert.equal(fixture.compiler.latestPdf(fallback.id)?.id, retried.id);

  for (const engine of ["xelatex", "lualatex", "latex"] as Engine[]) {
    const entry = String.raw`\documentclass{article}
\begin{document}
\input{part}
Read Section~\ref{sec:test}.
\end{document}`;
    const p = fixture.store.create(engine, [
      { path: "main.tex", data: Buffer.from(entry) },
      {
        path: "part.tex",
        data: Buffer.from(
          String.raw`\section{Example}\label{sec:test} Initial text.`,
        ),
      },
    ]);
    fixture.store.update(p.id, { engine });
    const base = await build(engine + " initial", p.id);
    change(p.id, "part.tex", (text) =>
      text.replace("Initial text.", "Updated text."),
    );
    const changed = await build(engine + " incremental", p.id);
    assert.equal(changed.incrementalFrom, base.id);
    assert(pdfText(changed).includes("Updated text."));
  }

  epochs.push(fixture.evidence());
  assert(epochs.every((e) => e.generations === 0 && e.blocked.length === 0));
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpu: os.cpus()[0]?.model,
          memoryBytes: os.totalmem(),
          node: process.version,
        },
        fixture: {
          entries: entries.length,
          sourceBytes: entries.reduce((n, e) => n + e.data.length, 0),
          mainPages: 2,
          runtime: initial.runtime?.label,
        },
        observations,
      },
      null,
      2,
    ),
  );
  console.log("Report:", path.join(root, "report.json"));
} finally {
  await fixture.app.close();
  fixture.restoreFetch();
}
