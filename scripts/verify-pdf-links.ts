import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";

export function linkedPdfFiles() {
  let source = String.raw`\documentclass{article}
\usepackage{fontspec,pdflscape}
\usepackage[unicode,colorlinks=true]{hyperref}
\pagestyle{plain}
\begin{document}
\pdfbookmark[0]{Synthetic linked paper}{paper.root}
Original sentence.
\section{Start}\label{sec:start}
\pdfbookmark[1]{研究 · Résumé · 👩🏽‍🔬}{unicode.title}
\pdfbookmark[1]{<script>Literal bookmark title</script>}{literal.title}
Jump to \hyperref[sec:last]{Final destination} or the \hyperref[sec:rotated]{Rotated destination}.
Read the citation \cite{sample}, or \hyperlink{named.target}{A named target}.

\href{http://127.0.0.1:5173/link-proof}{Local proof page}. \href{https://example.com/}{Example web address}.
\href{mailto:paper@example.invalid}{Contact address}.

\href{run:build.sh}{Unsupported file action}. \href{javascript:alert(1)}{Unsupported script action}.
\tableofcontents
`;
  for (let n = 2; n <= 17; n++)
    source += String.raw`\clearpage
\section{Section ${n}}\label{sec:${n}}
Synthetic text on page ${n}. \hyperref[sec:start]{Back to start}.
${
  n === 2
    ? String.raw`\subsection{Nested detail}\label{sec:detail}
Nested bookmark content.`
    : ""
}
\vfill Page ${n}.
`;
  source += String.raw`\clearpage
\begin{landscape}
\section{Rotated destination}\label{sec:rotated}
Rotated target text. \hyperref[sec:last]{Continue to final page}.
\end{landscape}
\section{Final destination}\label{sec:last}
\hypertarget{named.target}{A named target is here.}
Final target text. \hyperref[sec:start]{Return to start}.
\begin{thebibliography}{1}
\bibitem{sample} Synthetic Author. A linked reference. 2026.
\end{thebibliography}
\end{document}
`;
  return [
    { path: "main.tex", data: Buffer.from(source) },
    {
      path: "notes.tex",
      data: Buffer.from(
        "% Synthetic notes for read-only AI browsing.\nSupporting file.\n",
      ),
    },
  ];
}
export async function verifyPdfLinks() {
  const root = path.resolve(`data/verification/pdf-links-${Date.now()}`),
    store = new Store(root),
    compiler = new Compiler(store);
  try {
    const project = store.create("Linked paper · synthetic", linkedPdfFiles());
    store.update(project.id, { engine: "xelatex" });
    store.automaticCheckpoint(project.id);
    const before = {
      project: store.project(project.id),
      files: store
        .exportFiles(project.id)
        .map((f) => ({ path: f.path, data: f.data.toString("base64") })),
      history: store.checkpoints(project.id),
    };
    const job = compiler.start(project.id);
    while (compiler.processes.has(job.id))
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(job.status, "succeeded", job.log.slice(-4000));
    assert.ok(
      fs
        .readFileSync(compiler.pdfPath(job.id))
        .subarray(0, 5)
        .equals(Buffer.from("%PDF-")),
    );
    for (const file of before.files)
      assert.ok(
        store
          .file(project.id, file.path)
          .content.equals(Buffer.from(file.data, "base64")),
      );
    const report = {
      root,
      project: project.id,
      job: job.id,
      pdf: compiler.pdfPath(job.id),
      before,
      checks: [
        "Real confined XeLaTeX compile",
        "Cross-references, citation, named target, rotated link, URLs and nested Unicode bookmarks",
        "Exact source retained",
      ],
    };
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(report, null, 2),
    );
    fs.writeFileSync(
      "data/verification/pdf-links-fixture.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        { root, project: project.id, job: job.id, pdf: report.pdf },
        null,
        2,
      ),
    );
    return report;
  } finally {
    store.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await verifyPdfLinks();
