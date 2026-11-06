import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { planReferenceUpdates } from "../server/latex-references";
import { captureDirectory } from "../server/project-directories";
import {
  buildPreflightFindings,
  type ManuscriptPreflight,
} from "../shared/manuscript-preflight";

test("preflight checks reachable literal paths, preserving project bytes and history when disk changes", async (t) => {
  const root = path.resolve("data/verification/preflight-test-" + randomUUID());
  const folder = path.join(root, "project");
  const files = Object.entries({
    "main.tex": String.raw`\documentclass{article}
\usepackage{graphicx}
\graphicspath{{figures/}}
\begin{document}
% \input{example-comment}
\input{sections/introduction}
\include{appendix-missing}
\bibliography{bib/missing}
\end{document}`,
    "sections/introduction.tex": String.raw`\includegraphics{\detokenize{local figure.png}}
\includegraphics{\detokenize{absent figure.png}}
\verbatiminput{assets/absent.txt}
\input{main}
\verb|\input{example-verbatim}|`,
    "notes.tex": String.raw`\input{example-unreachable}`,
    "figures/local figure.png": "fake fixture image",
  }).map(([path, content]) => ({ path, data: Buffer.from(content) }));
  for (const file of files) {
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
  const { app, store, compiler } = await createApp(path.join(root, "data"), {
    seed: false,
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.createLinked(
    "Preflight fixture",
    captureDirectory(folder),
    files,
  );
  const url = `/api/projects/${project.id}/preflight`;
  const headers = { host: "127.0.0.1:4317" };
  const check = async () => {
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ManuscriptPreflight>();
  };
  const before = store.checkpoints(project.id);
  const report = await check();
  assert.equal(report.disk, "current");
  assert.equal(report.scanned, 2);
  assert.deepEqual(
    report.findings.map(({ category, severity, path, line }) => [
      category,
      severity,
      path,
      line,
    ]),
    [
      ["include", "warning", "main.tex", 7],
      ["bibliography", "warning", "main.tex", 8],
      ["figure", "warning", "sections/introduction.tex", 2],
      ["dependency", "warning", "sections/introduction.tex", 3],
    ],
  );
  const edited = path.join(folder, "sections/introduction.tex");
  fs.writeFileSync(edited, "External revision\n");
  const changed = await check();
  assert.equal(changed.disk, "changed");
  assert.equal(changed.generation, project.generation);
  assert.deepEqual(changed.findings, report.findings);
  assert.equal(fs.readFileSync(edited, "utf8"), "External revision\n");
  assert.deepEqual(store.checkpoints(project.id), before);
  assert.equal(compiler.list(project.id).length, 0);
  assert.equal(
    (
      await app.inject({
        url,
        headers: { ...headers, origin: "https://example.invalid" },
      })
    ).statusCode,
    403,
  );
});

test("build findings distinguish errors from unresolved keys and cosmetic box warnings", () => {
  const findings = buildPreflightFindings([
    {
      severity: "warning",
      message: "Overfull \\hbox (4.0pt too wide)",
      path: "main.tex",
      line: 9,
    },
    { severity: "warning", message: "Underfull \\vbox" },
    {
      severity: "warning",
      message: "LaTeX Warning: Citation `draft' on page 1 undefined",
    },
    {
      severity: "warning",
      message: "LaTeX Warning: Reference `fig:unknown' undefined",
    },
    {
      severity: "warning",
      message: 'BibTeX: I didn\'t find a database entry for "draft"',
    },
    {
      severity: "error",
      message: "Package pdftex.def Error: File `images/absent.png' not found",
      path: "chapter.tex",
      line: 10,
    },
    {
      severity: "error",
      message: "BibTeX: I couldn't open database file draft.bib",
    },
    { severity: "error", message: "LaTeX Error: File `chapter.tex' not found" },
    { severity: "error", message: "Undefined control sequence" },
    { severity: "info", message: "Unused global option" },
  ]);
  assert.deepEqual(
    findings.map(({ category }) => category),
    [
      "figure",
      "bibliography",
      "include",
      "build",
      "layout",
      "layout",
      "citation",
      "reference",
      "citation",
    ],
  );
  assert.equal(findings[0].path, "chapter.tex");
  assert.equal(findings[0].line, 10);
  assert.equal(findings[4].severity, "warning");
});

test("reviewed figure renames keep detokenize and replace only the literal filename", () => {
  const content = String.raw`\includegraphics[width=.5\linewidth]{\detokenize{figures/one two.png}}`;
  const result = planReferenceUpdates(
    "fixture",
    0,
    [{ from: "figures/one two.png", to: "figures/new name.png" }],
    [{ path: "main.tex", revision: 0, content }],
    ["main.tex", "figures/one two.png"],
  );
  assert.equal(result.changes.length, 1);
  assert.equal(
    result.changes[0].after,
    content.replace("one two.png", "new name.png"),
  );
});
