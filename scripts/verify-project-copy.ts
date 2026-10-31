import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { syntheticPng } from "./verify-source-tools";
import { readZip, writeZip, type ImportedFile } from "../server/files";

export function copyFixtureFiles(): ImportedFile[] {
  return [
    {
      path: "roots/paper.tex",
      data: Buffer.from(String.raw`\documentclass{article}
\usepackage{graphicx}
\newcommand{\customnote}[1]{\textit{#1}}
\begin{document}
\title{A synthetic study}
\author{Example Author}
\maketitle
\section{A small question}
A café experiment preserves \customnote{every source detail}.
\input{sections/intro}
\begin{figure}[htbp]
\centering
\includegraphics[width=.35\linewidth]{figures/sample.png}
\caption{A synthetic image}
\end{figure}
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`),
    },
    {
      path: "sections/intro.tex",
      data: Buffer.from(
        "\\subsection{Method}\nThe original source includes a citation~\\cite{example2026}.\n",
      ),
    },
    {
      path: "references.bib",
      data: Buffer.from(
        "@article{example2026,title={A synthetic example},author={Example, A.},journal={Example Methods},year={2026}}\n",
      ),
    },
    { path: "figures/sample.png", data: syntheticPng() },
    { path: "empty-folder", directory: true, data: Buffer.alloc(0) },
    {
      path: "old-notes.txt",
      data: Buffer.from("This file stays in the original Trash.\n"),
    },
    {
      path: "build.sh",
      data: Buffer.from("#!/bin/sh\ntouch SHOULD_NOT_RUN\n"),
    },
  ];
}
async function verify() {
  const root = path.resolve("data/verification/project-copy-" + Date.now());
  fs.mkdirSync(root, { recursive: true });
  const store = new Store(root),
    compiler = new Compiler(store);
  const original = store.create("Original · synthetic", copyFixtureFiles());
  store.trash(original.id, "old-notes.txt");
  store.update(original.id, { root: "roots/paper.tex", engine: "xelatex" });
  const source = store.project(original.id);
  const files = store.exportFiles(source.id),
    baseline = store.checkpoints(source.id);
  const results: { name: string; job: string }[] = [];
  async function compile(id: string, name: string) {
    const job = compiler.start(id),
      started = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - started > 130000)
        throw new Error("Compilation verification timed out.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-4000));
    assert.equal(job.engine, "xelatex");
    assert.equal(job.root, "roots/paper.tex");
    assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
    results.push({ name, job: job.id });
    console.log("PASS " + name);
  }
  try {
    await compile(
      source.id,
      "Original nested-root XeLaTeX document with bibliography and figure",
    );
    const copy = store.copy(source.id, {
      name: "Independent copy",
      generation: source.generation,
      requestId: randomUUID(),
    });
    assert.deepEqual(store.exportFiles(copy.id), files);
    assert.deepEqual(store.project(source.id), source);
    assert.deepEqual(store.checkpoints(source.id), baseline);
    assert.equal(store.checkpoints(copy.id).length, 1);
    assert.deepEqual(compiler.list(copy.id), []);
    await compile(
      copy.id,
      "Copied document with preserved engine and entry point",
    );
    const roundTrip = await readZip(writeZip(store.exportFiles(copy.id)));
    for (const file of files)
      assert.deepEqual(
        roundTrip.find((entry) => entry.path === file.path)?.data,
        file.data,
      );
    const intro = store.readText(copy.id, "sections/intro.tex");
    store.save(
      copy.id,
      intro.path,
      intro.content + "Only the copy has this sentence.\n",
      intro.revision,
    );
    assert.deepEqual(store.exportFiles(source.id), files);
    await compile(copy.id, "Independent edited copy");
    for (const id of [source.id, copy.id])
      assert.equal(
        fs.existsSync(path.join(store.projectDir(id), "SHOULD_NOT_RUN")),
        false,
      );
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(
        { passed: results.length, original: source.id, copy: copy.id, results },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: results.length, root }));
  } finally {
    for (const id of compiler.processes.keys()) compiler.cancel(id);
    while (compiler.processes.size)
      await new Promise((resolve) => setTimeout(resolve, 50));
    store.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve("scripts/verify-project-copy.ts")
)
  await verify();
