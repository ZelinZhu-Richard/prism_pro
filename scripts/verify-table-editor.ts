import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import {
  parseTable,
  editTableCell,
  tableRow,
  tableColumn,
  tableColumnStyle,
  mergeTableCells,
  tableBorders,
  editTableCaption,
} from "../src/table-source";
const original = String.raw`\begin{table}[htbp]
\centering
% Synthetic preservation fixture.
\caption[Short]{Synthetic table}\label{tab:synthetic}
\begin{tabular}{lcr}
\toprule
\textbf{Method} & Sample & Score \\
\midrule
A \& B & $x_1$ & 10 \\
Prism & $x_2$ & 12 \\
\bottomrule
\end{tabular}
\end{table}`;
let changed = editTableCell(
  parseTable(original),
  1,
  0,
  String.raw`\textit{Revised} \& checked`,
);
changed = tableRow(parseTable(changed), 1, "after");
changed = tableColumn(parseTable(changed), 1, "after");
changed = tableColumnStyle(parseTable(changed), 0, "m", "3cm");
changed = tableBorders(parseTable(changed), "grid");
changed = editTableCaption(parseTable(changed), "Reviewed synthetic table");
const variants = [
  {
    name: "Edited rows, columns, fixed width, grid and caption",
    source: changed,
  },
  {
    name: "Merged cells with retained borders",
    source: mergeTableCells(
      parseTable(tableBorders(parseTable(original), "grid")),
      1,
      0,
      1,
    ),
  },
  {
    name: "Last row without terminator and booktabs",
    source: tableBorders(
      parseTable(String.raw`\begin{tabular}{lc}A&B\end{tabular}`),
      "booktabs",
    ),
  },
];
const root = path.resolve("data/verification/table-compiler-" + Date.now()),
  store = new Store(root),
  compiler = new Compiler(store),
  results = [];
try {
  for (const v of variants) {
    const p = store.create(v.name, [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\n\\usepackage{array,booktabs,amsmath}\n\\begin{document}\n" +
            v.source +
            "\n\\end{document}\n",
        ),
      },
    ]);
    const job = compiler.start(p.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
    results.push({ name: v.name, job: job.id, status: job.status });
    console.log("PASS " + v.name);
  }
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ results }, null, 2),
  );
} finally {
  store.close();
}
