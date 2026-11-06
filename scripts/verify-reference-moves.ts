import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { FileMoves } from "../server/file-moves";
import { syntheticPng } from "./verify-source-tools";
import { readZip, writeZip } from "../server/files";
export function referenceFixtureFiles() {
  return [
    {
      path: "main.tex",
      data: Buffer.from(String.raw`\documentclass{localclasses/demo}
\usepackage{graphicx}
\usepackage{localstyles/custom}
\graphicspath{{figures/}}
\begin{document}
\section{Reviewed reference updates}
\input{sections/intro}
\begin{figure}[htbp]
\centering
\includegraphics[width=.3\linewidth]{\detokenize{sample.png}}
\caption{A synthetic image}
\end{figure}
\bibliographystyle{plain}
\bibliography{refs/library}
\end{document}
`),
    },
    {
      path: "sections/intro.tex",
      data: Buffer.from(
        "A café experiment preserves \\customnote{source details}.\\input{sections/method}\n",
      ),
    },
    {
      path: "sections/method.tex",
      data: Buffer.from(
        "The method includes a citation~\\cite{example2026}.\n",
      ),
    },
    {
      path: "localclasses/demo.cls",
      data: Buffer.from("\\ProvidesClass{demo}\n\\LoadClass{article}\n"),
    },
    {
      path: "localstyles/custom.sty",
      data: Buffer.from(
        "\\ProvidesPackage{custom}\n\\input{localstyles/commands.tex}\n",
      ),
    },
    {
      path: "localstyles/commands.tex",
      data: Buffer.from("\\newcommand{\\customnote}[1]{\\textit{#1}}\n"),
    },
    { path: "figures/sample.png", data: syntheticPng() },
    {
      path: "refs/library.bib",
      data: Buffer.from(
        "@article{example2026,title={A synthetic study},author={Example, A.},journal={Example Methods},year={2026}}\n",
      ),
    },
    { path: "archive", directory: true, data: Buffer.alloc(0) },
    { path: "notes.txt", data: Buffer.from("Unrelated notes remain exact.\n") },
  ];
}
async function verify() {
  const root = path.resolve("data/verification/reference-moves-" + Date.now());
  fs.mkdirSync(root, { recursive: true });
  const store = new Store(root),
    compiler = new Compiler(store),
    moves = new FileMoves(store),
    project = store.create(
      "Reference moves · synthetic",
      referenceFixtureFiles(),
    );
  store.update(project.id, { engine: "xelatex" });
  const original = store.exportFiles(project.id),
    jobs: { label: string; id: string }[] = [];
  async function compile(label: string) {
    const job = compiler.start(project.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000)
        throw new Error("Compilation timed out.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-6000));
    jobs.push({ label, id: job.id });
    console.log("PASS " + label);
  }
  try {
    await compile(
      "Original nested includes, figure, local class/package and BibTeX",
    );
    const paths = [
        "sections",
        "figures",
        "refs",
        "localclasses",
        "localstyles",
      ],
      preview = moves.preview(project.id, { paths, destination: "archive" });
    assert.equal(preview.references!.files.length, 3);
    const moved = moves.apply(project.id, {
      paths,
      destination: "archive",
      generation: preview.generation,
      requestId: randomUUID(),
      updateReferences: true,
      referenceToken: preview.references!.token,
    });
    await compile("Moved folders and reviewed cross-file references");
    const exported = await readZip(writeZip(store.exportFiles(project.id)));
    for (const file of store.exportFiles(project.id))
      assert.deepEqual(
        exported.find((f) => f.path === file.path)?.data,
        file.data,
      );
    const rename = moves.previewRename(
      project.id,
      "archive/figures/sample.png",
      "archive/figures/plot one.png",
    );
    const renamed = moves.renameResult(
      project.id,
      "archive/figures/sample.png",
      "archive/figures/plot one.png",
      {
        generation: rename.generation,
        requestId: randomUUID(),
        updateReferences: true,
        referenceToken: rename.references!.token,
      },
    );
    assert.match(
      store.readText(project.id, "main.tex").content,
      /\\detokenize\{[^}]*plot one\.png\}/,
    );
    await compile(
      "Renamed figure with spaces and reviewed detokenized filename",
    );
    moves.undo(project.id, renamed.operationId);
    moves.undo(project.id, moved.operationId);
    assert.deepEqual(store.exportFiles(project.id), original);
    await compile("Consecutive Undo restores exact original source and PDF");
    const report = {
      root,
      project: project.id,
      jobs,
      checks: [
        "Four real confined XeLaTeX/BibTeX builds",
        "Literal class, package, graphicspath, include and bibliography edits",
        "Moved and unmoved sources updated in one transaction",
        "Renamed figure with spaces compiles",
        "ZIP round-trip and consecutive exact Undo",
      ],
    };
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    store.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve("scripts/verify-reference-moves.ts")
)
  await verify();
