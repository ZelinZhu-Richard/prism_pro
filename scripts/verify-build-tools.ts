import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { BuildArtifacts } from "../server/build-files";
import { readZip } from "../server/files";
import type { CompileOptions } from "../shared/compiler";
import type { Engine } from "../shared/types";
const root = path.resolve(
    "data/verification/build-tools-compiler-" + Date.now(),
  ),
  store = new Store(root),
  compiler = new Compiler(store),
  artifacts = new BuildArtifacts(compiler),
  results: any[] = [];
function png() {
  function chunk(name: string, data: Buffer) {
    const raw = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const b of raw) {
      crc ^= b;
      for (let n = 0; n < 8; n++)
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    const length = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, raw, sum]);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(2);
  head.writeUInt32BE(2, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk(
      "IDAT",
      deflateSync(
        Buffer.from([0, 200, 30, 30, 200, 30, 30, 0, 200, 30, 30, 200, 30, 30]),
      ),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function snapshot(id: string) {
  return JSON.stringify({
    project: store.project(id),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.data.toString("base64"), !!f.directory]),
    history: store.checkpoints(id),
    chats: store.conversations(id),
  });
}
async function finish(job: ReturnType<Compiler["start"]>) {
  const deadline = Date.now() + 130000;
  while (compiler.processes.has(job.id)) {
    assert.ok(Date.now() < deadline, "Compile did not settle");
    await new Promise((r) => setTimeout(r, 100));
  }
  return job;
}
function imageCount(file: string) {
  const r = spawnSync("/opt/homebrew/bin/pdfimages", ["-list", file], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split("\n").filter((l) => /^\s+\d+\s+\d+\s+image\s/.test(l))
    .length;
}
async function build(id: string, options: CompileOptions) {
  compiler.configure(id, {
    ...options,
    revision: compiler.settings(id).revision,
  });
  const before = snapshot(id),
    job = await finish(compiler.start(id));
  assert.equal(
    snapshot(id),
    before,
    "Compilation/options changed source/history",
  );
  results.push({
    id: job.id,
    project: id,
    engine: job.engine,
    options: job.options,
    status: job.status,
    pdf: job.pdf,
    diagnostics: job.diagnostics.length,
  });
  console.log(
    `${job.engine} ${options.mode}/${options.errorHandling}: ${job.status}, PDF ${job.pdf}`,
  );
  return job;
}
const tex = String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\section{Synthetic build options study}
This snapshot includes a bibliography~\cite{synthetic}.
\input{sections/body}
\includegraphics[width=1cm]{assets/example.png}
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`;
try {
  let normalId = "",
    errorId = "";
  for (const engine of ["pdflatex", "xelatex", "lualatex"] as Engine[]) {
    const p = store.create("Synthetic " + engine, [
      { path: "paper/main.tex", data: Buffer.from(tex) },
      {
        path: "sections/body.tex",
        data: Buffer.from("Independent nested source is preserved.\n"),
      },
      { path: "assets/example.png", data: png() },
      { path: "assets/empty", data: Buffer.alloc(0), directory: true },
      {
        path: "references.bib",
        data: Buffer.from(
          "@article{synthetic,title={Local build evidence},author={Author, Example},journal={Synthetic Journal},year={2026}}\n",
        ),
      },
    ]);
    store.update(p.id, { root: "paper/main.tex", engine });
    store.automaticCheckpoint(p.id);
    const normal = await build(p.id, { mode: "normal", errorHandling: "stop" });
    assert.equal(normal.status, "succeeded", normal.log.slice(-4000));
    assert.equal(imageCount(compiler.pdfPath(normal.id)), 1);
    normalId = normal.id;
    const draft = await build(p.id, { mode: "draft", errorHandling: "stop" });
    assert.equal(draft.status, "succeeded", draft.log.slice(-4000));
    assert.equal(
      imageCount(compiler.pdfPath(draft.id)),
      0,
      "Fast draft should skip the standard image",
    );
    const e = store.create("Synthetic errors " + engine, [
      {
        path: "main.tex",
        data: Buffer.from(
          String.raw`\documentclass{article}\begin{document}Before.\UndefinedSyntheticCommand{X} After.\end{document}`,
        ),
      },
    ]);
    store.update(e.id, { engine });
    store.automaticCheckpoint(e.id);
    const stop = await build(e.id, { mode: "normal", errorHandling: "stop" });
    assert.equal(stop.status, "failed");
    assert.equal(stop.pdf, false);
    const cont = await build(e.id, {
      mode: "normal",
      errorHandling: "continue",
    });
    assert.equal(cont.status, "failed");
    assert.equal(cont.pdf, true, cont.log.slice(-4000));
    assert.equal(compiler.latestPdf(e.id), null);
    assert.equal(compiler.previewPdf(e.id)?.id, cont.id);
    errorId = cont.id;
  }
  const normal = compiler.jobs.get(normalId)!,
    manifest = artifacts.list(normalId);
  assert.ok(manifest.files.some((f) => f.path === "main.bbl"));
  assert.match(
    artifacts.text(normalId, "main.bbl").text!,
    /Local build evidence/,
  );
  const before = snapshot(normal.projectId),
    plan = artifacts.preview(normalId, {
      paths: ["main.bbl"],
      includeSource: true,
    }),
    download = artifacts.prepare(normalId, { ...plan, allowReplace: false }),
    zip = artifacts.download(download.id).bytes,
    files = await readZip(zip);
  fs.writeFileSync(path.join(root, "source-and-bbl.zip"), zip);
  assert.equal(snapshot(normal.projectId), before);
  const copy = store.create("Synthetic exported snapshot", files);
  store.update(copy.id, { root: normal.root, engine: normal.engine });
  store.automaticCheckpoint(copy.id);
  const roundtrip = await build(copy.id, {
    mode: "normal",
    errorHandling: "stop",
  });
  assert.equal(roundtrip.status, "succeeded", roundtrip.log.slice(-4000));
  const loop = store.create("Synthetic cancellation", [
    {
      path: "main.tex",
      data: Buffer.from(
        String.raw`\documentclass{article}\begin{document}\loop\iftrue\repeat\end{document}`,
      ),
    },
  ]);
  const cancelled = compiler.start(loop.id);
  compiler.cancel(cancelled.id);
  await finish(cancelled);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.pdf, false);
  assert.ok(artifacts.list(cancelled.id));
  const report = {
    root,
    normalId,
    errorId,
    sourceNeutral: true,
    exactSourceAndBblExport: true,
    roundtrip: roundtrip.id,
    cancelled: cancelled.id,
    results,
  };
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS 13 real builds plus cancellation, normal/draft images, stop/continue PDFs, bibliography output and source/output round-trip: " +
      root,
  );
} finally {
  for (const job of compiler.jobs.values())
    if (["queued", "running"].includes(job.status)) compiler.cancel(job.id);
  const until = Date.now() + 10000;
  while (compiler.processes.size && Date.now() < until)
    await new Promise((r) => setTimeout(r, 100));
  artifacts.dispose();
  store.close();
}
