import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/store";
import { Compiler, toolPath } from "../server/compiler";
import { spawnSync } from "node:child_process";
import { htmlToLatex } from "../src/rich-clipboard";
import { visualPasteTransaction } from "../src/visual-clipboard";
import { parseTable, tableColumnStyle } from "../src/table-source";
import { EditorState } from "@codemirror/state";
const styles =
  '<h2>A synthetic heading</h2><p><b>Bold <i>nested</i></b>, <u>underline</u>, <code>a_b</code>, <sup>2</sup>, 50% &amp; $3. <a href="https://example.org/a?x=1&amp;y=2#part">A link</a>.</p><ul><li>First<ol><li>Nested</li></ol></li><li>Second</li></ul><pre>\tif a_b:\n  \\end{verbatim}</pre>';
const table =
  '<table border="1"><caption>Synthetic &amp; reviewed</caption><tr><th colspan="2" style="text-align:center">Combined</th><th>Score</th></tr><tr><td style="width:30%;text-align:center">A</td><td><p>First line</p><p>Second line</p></td><td>12</td></tr><tr><td><ul><li>Cell list</li><li>Second item</li></ul></td><td>B</td><td>14</td></tr></table>';
const vertical =
  '<table border="1"><tr><td rowspan="2">Two rows</td><td>A</td></tr><tr><td>B</td></tr></table>';
const kpse = toolPath("pdflatex")?.replace(/pdflatex$/, "kpsewhich"),
  hasMulti =
    !!kpse &&
    spawnSync(kpse, ["multirow.sty"], { encoding: "utf8" }).status === 0;
const variants = [
  {
    name: "Formatted paragraphs, lists, links and literal code",
    latex: htmlToLatex(styles).latex,
  },
  {
    name: "Merged table, borders, widths and list cells",
    latex: htmlToLatex(table).latex,
  },
];
if (hasMulti)
  variants.push({
    name: "Vertical table spans with partial-width rules",
    latex: htmlToLatex(vertical).latex,
  });
const nested = String.raw`\section{Left \textbf{inner right} tail}`;
variants.push({
  name: "Block replacement inside a formatted heading",
  latex: EditorState.create({ doc: nested })
    .update(
      visualPasteTransaction(
        nested,
        nested.indexOf(" right"),
        nested.indexOf(" right"),
        "\\subsection{Pasted}\nNew paragraph.",
        true,
      ),
    )
    .newDoc.toString(),
});
const bordered = htmlToLatex(
  '<table border="1"><tr><td style="text-align:center">A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>',
).latex;
variants.push({
  name: "Pasted border declarations follow later column widths",
  latex: tableColumnStyle(parseTable(bordered), 0, "p", "2.5cm"),
});
const root = path.resolve("data/verification/clipboard-compiler-" + Date.now()),
  store = new Store(root),
  compiler = new Compiler(store),
  results = [];
try {
  for (const v of variants) {
    const source =
      "\\documentclass{article}\n\\usepackage{array,graphicx,hyperref}" +
      (hasMulti ? "\n\\usepackage{multirow}" : "") +
      "\n\\begin{document}\n" +
      v.latex +
      "\n\\end{document}\n";
    const p = store.create(v.name, [
        { path: "main.tex", data: Buffer.from(source) },
      ]),
      job = compiler.start(p.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-4000));
    results.push({ name: v.name, job: job.id, status: job.status });
    console.log("PASS " + v.name);
  }
  if (!hasMulti)
    console.log(
      "SKIP vertical spans: multirow package is not installed; no installation attempted.",
    );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ results, multirowInstalled: hasMulti }, null, 2),
  );
} finally {
  store.close();
}
