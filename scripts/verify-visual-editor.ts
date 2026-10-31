import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import {
  visualProjection,
  visualInput,
  visualEnter,
} from "../src/visual-source";
import { sourceEditTransaction } from "../src/editor-transactions";
const source = String.raw`\documentclass{article}
\usepackage{amsmath}
\newcommand{\custom}[2][default]{#1: #2}
\begin{document}
\section[Short]{First \textbf{bold words} last}
Ordinary text with \custom[kept]{custom source}.
$E=mc^2$
\begin{itemize}
  \item First second
\end{itemize}
\end{document}
`;
const root = path.resolve("data/verification/visual-editor-" + Date.now());
fs.mkdirSync(root, { recursive: true });
const store = new Store(root),
  compiler = new Compiler(store),
  results: { name: string; job: string }[] = [];
try {
  const insertion = source.indexOf("Ordinary"),
    typed = EditorState.create({ doc: source })
      .update(
        visualInput(source, visualProjection(source), [
          {
            from: insertion,
            to: insertion,
            text: "50% & $ _ # { } \\ ^ ~ café. ",
          },
        ]),
      )
      .state.doc.toString();
  const at = source.indexOf("words"),
    heading = EditorState.create({ doc: source })
      .update(
        sourceEditTransaction(
          visualEnter(source, visualProjection(source), at, at)!,
        ),
      )
      .state.doc.toString();
  const point = source.indexOf("second"),
    list = EditorState.create({ doc: source })
      .update(
        sourceEditTransaction(
          visualEnter(source, visualProjection(source), point, point)!,
        ),
      )
      .state.doc.toString();
  for (const [name, content] of [
    ["Unchanged source with custom macro", source],
    ["Literal characters and Unicode", typed],
    ["Heading split with nested formatting", heading],
    ["List-item split", list],
  ]) {
    assert.ok(
      content.includes(String.raw`\newcommand{\custom}[2][default]{#1: #2}`),
    );
    assert.ok(content.includes(String.raw`\custom[kept]{custom source}`));
    const project = store.create(name, [
        { path: "main.tex", data: Buffer.from(content) },
      ]),
      job = compiler.start(project.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000)
        throw new Error("Verification compile timed out.");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
    results.push({ name, job: job.id });
    console.log("PASS " + name);
  }
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ passed: results.length, results }, null, 2),
  );
  console.log(JSON.stringify({ passed: results.length, root }));
} finally {
  for (const id of compiler.processes.keys()) compiler.cancel(id);
  while (compiler.processes.size) await new Promise((r) => setTimeout(r, 50));
  store.close();
}
