import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  buildDiagnostics,
  finalizeDiagnostics,
  DIAGNOSTICS_VERSION,
} from "../server/diagnostics";
import { Compiler } from "../server/compiler";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import type { CompileJob } from "../shared/types";
const oldWarning =
  "LaTeX Warning: Citation `resolved' on page 1 undefined on input line 4.";
const clean =
  "(./paper/main.tex\n(./sections/part.tex)\n)\nOutput written on main.pdf\n";
function fixture(t: any) {
  const dir = path.resolve(
    "data/verification/diagnostics-test-" + randomUUID(),
  );
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function write(name: string, value: string) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
  }
  for (const name of [
    "paper/main.tex",
    "sections/part.tex",
    "sections/name (one).tex",
    "sections/中文.tex",
    "refs/my refs.bib",
    "refs/references.bib",
    "assets/cost$.txt",
  ])
    write("source/" + name, "% Synthetic fixture\n");
  fs.mkdirSync(path.join(dir, "out"));
  const diagnostics = (log = "", failed = false) =>
    buildDiagnostics(dir, "paper/main.tex", log, failed);
  return { dir, write, diagnostics };
}
test("final clean TeX artifact removes resolved early-pass citation warnings without modifying the console log", (t) => {
  const f = fixture(t);
  f.write("out/main.log", clean);
  const log =
    "Latexmk: applying rule 'pdflatex'...\n" +
    oldWarning +
    "\nLatexmk: applying rule 'bibtex main'...\nNo errors\nLatexmk: applying rule 'pdflatex'...\n" +
    clean;
  assert.deepEqual(f.diagnostics(log), []);
  assert.match(log, /undefined/);
});
test("unresolved final citation and bibliography warnings remain unique and point to nested source", (t) => {
  const f = fixture(t);
  f.write(
    "out/main.log",
    "(./paper/main.tex\n(./sections/part.tex\nLaTeX Warning: Citation `missing' on page 1 undefined on input line 4.\n\n)\nLaTeX Warning: There were undefined references.\n)",
  );
  f.write(
    "out/main.blg",
    'This is BibTeX\nWarning--I didn\'t find a database entry for "missing"\n',
  );
  const result = f.diagnostics(
    "Latexmk: applying rule 'bibtex main'...\nWarning--I didn't find a database entry for \"missing\"\n",
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].path, "sections/part.tex");
  assert.equal(result[0].line, 4);
  assert.ok(result.every((d) => d.severity === "warning"));
  assert.equal(result.filter((d) => d.message.startsWith("BibTeX:")).length, 1);
});
test("explicit errors preserve spaces and Unicode paths without inventing links to generated or installed files", (t) => {
  const f = fixture(t);
  f.write(
    "out/main.log",
    "./sections/name (one).tex:7: Undefined control sequence.\n./sections/中文.tex:8: Missing $ inserted.\n" +
      path.join(f.dir, "out/main.bbl") +
      ":9: Bad generated content.\n/usr/local/texlive/texmf/pkg.sty:42: Package failed.",
  );
  const result = f.diagnostics("", true);
  assert.deepEqual(
    result.map((d) => [d.path, d.line]),
    [
      ["sections/name (one).tex", 7],
      ["sections/中文.tex", 8],
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  assert.match(result[2].message, /^main\.bbl:9:/);
  assert.match(result[3].message, /^pkg\.sty:42:/);
});
test("hard-wrapped source paths and error message bodies remain complete", (t) => {
  const f = fixture(t),
    file = "sections/" + "long_".repeat(24) + ".tex";
  f.write("source/" + file, "% synthetic");
  const original =
    "./" + file + ":2: ==> Fatal error occurred, no output PDF file produced!";
  const wrapped = original.match(/.{1,79}/g)!.join("\n");
  f.write("out/main.log", "(./paper/main.tex\n" + wrapped + "\nl.2 \\oops\n)");
  const result = f.diagnostics("", true);
  assert.equal(result[0].path, file);
  assert.equal(result[0].line, 2);
  assert.match(result[0].message, /PDF file produced!$/);
});
test("bang errors use current nested file and source-line markers, then restore the enclosing file", (t) => {
  const f = fixture(t);
  f.write(
    "out/main.log",
    "(./paper/main.tex\n(./sections/part.tex\n! Undefined control sequence.\nl.12 \\oops\n)\n! Missing $ inserted.\nl.20 \\other\n)",
  );
  assert.deepEqual(
    f.diagnostics("", true).map((d) => [d.path, d.line]),
    [
      ["sections/part.tex", 12],
      ["paper/main.tex", 20],
    ],
  );
});
test("known file context supports quoted spaces, filename parentheses and wrapped absolute paths", (t) => {
  const f = fixture(t);
  const absolute = path.join(f.dir, "source/sections/中文.tex"),
    raw = "(" + absolute;
  const wrapped = raw.slice(0, 79) + "\n" + raw.slice(79);
  f.write(
    "out/main.log",
    '(./paper/main.tex\n("./sections/name (one).tex"\nLaTeX Warning: First on input line 2.\n\n)\n' +
      wrapped +
      "\nLaTeX Warning: Second on input line 3.\n\n)\n)",
  );
  const result = f.diagnostics();
  assert.deepEqual(
    result.map((d) => [d.path, d.line]),
    [
      ["sections/name (one).tex", 2],
      ["sections/中文.tex", 3],
    ],
  );
});
test("multiline package warnings and box warnings retain their complete message and source line", (t) => {
  const f = fixture(t);
  f.write(
    "out/main.log",
    "(./paper/main.tex\nPackage demo Warning: A useful warning:\n(demo)                additional context on input line 9.\n\nOverfull \\hbox (5.0pt too wide) in paragraph at lines 14--15\n[]\n\nUnderfull \\vbox (badness 10000) detected at line 17\n)",
  );
  const result = f.diagnostics();
  assert.equal(result.length, 3);
  assert.match(result[0].message, /additional context/);
  assert.deepEqual(
    result.map((d) => d.line),
    [9, 14, 17],
  );
});
test("BibTeX syntax errors retain .bib file lines and errors precede warnings", (t) => {
  const f = fixture(t);
  f.write("out/main.log", clean);
  f.write(
    "out/main.blg",
    "This is BibTeX\nWarning--empty year in synthetic\nI was expecting a `,'---line 8 of file refs/my refs.bib\n(There was 1 error message)\n",
  );
  const result = f.diagnostics("", true);
  assert.equal(result.length, 2);
  assert.equal(result[0].severity, "error");
  assert.equal(result[0].path, "refs/my refs.bib");
  assert.equal(result[0].line, 8);
});
test("Biber fixture errors and warnings preserve severity without using Biber program line numbers as source locations", (t) => {
  const f = fixture(t);
  f.write("out/main.log", clean);
  f.write(
    "out/main.blg",
    "[42] Utils.pm:410> ERROR - BibTeX subsystem: refs/references.bib, line 11, syntax error\n[43] Biber.pm:124> WARN - A bibliography warning\n[44] Utils.pm:410> FATAL - Cannot open database\n",
  );
  const result = f.diagnostics("", true);
  assert.equal(result.length, 3);
  assert.equal(result[0].path, "refs/references.bib");
  assert.equal(result[0].line, 11);
  assert.equal(result[1].path, undefined);
  assert.equal(result[1].line, undefined);
  assert.deepEqual(
    result.map((d) => d.severity),
    ["error", "error", "warning"],
  );
});
test("a clean final TeX log cannot hide Ghostscript errors or lifecycle failures", (t) => {
  const f = fixture(t);
  f.write("out/main.log", clean);
  const result = f.diagnostics(
    "Latexmk: applying rule 'latex'...\n" +
      oldWarning +
      "\nLatexmk: applying rule 'ps2pdf'...\nError: /invalidfileaccess in --file--\nGPL Ghostscript: Unrecoverable error, exit code1\nBuild exceeded the two-minute time limit.\n",
    true,
  );
  assert.ok(result.some((d) => d.message.includes("invalidfileaccess")));
  assert.ok(result.some((d) => d.message.includes("two-minute")));
  assert.ok(!result.some((d) => d.message.includes("undefined")));
});
test("missing final artifact falls back to the last TeX pass rather than all passes", (t) => {
  const f = fixture(t);
  const log =
    "Latexmk: applying rule 'pdflatex'...\n" +
    oldWarning +
    "\nLatexmk: applying rule 'bibtex main'...\nNo error\nLatexmk: applying rule 'pdflatex'...\n" +
    clean;
  assert.deepEqual(f.diagnostics(log), []);
});
test("bounded final log reads retain tail errors and disclose missing file context", (t) => {
  const f = fixture(t);
  f.write(
    "out/main.log",
    oldWarning +
      "\n" +
      "x\n".repeat(600000) +
      "./sections/part.tex:88: Final error.\n",
  );
  const result = f.diagnostics("", true);
  assert.equal(result[0].path, "sections/part.tex");
  assert.equal(result[0].line, 88);
  assert.ok(result.some((d) => d.message.includes("limited")));
  assert.ok(!result.some((d) => d.message.includes("resolved")));
});
test("diagnostic artifact reads reject symlinks, hardlinks and special files", (t) => {
  const f = fixture(t),
    canary = f.write("private-canary", "! OUTSIDE_SENTINEL\n");
  const artifact = path.join(f.dir, "out/main.log");
  fs.symlinkSync(canary, artifact);
  assert.ok(!JSON.stringify(f.diagnostics()).includes("OUTSIDE_SENTINEL"));
  fs.unlinkSync(artifact);
  fs.linkSync(canary, artifact);
  assert.ok(!JSON.stringify(f.diagnostics()).includes("OUTSIDE_SENTINEL"));
  fs.unlinkSync(artifact);
  if (process.platform !== "win32") {
    const r = spawnSync("/usr/bin/mkfifo", [artifact]);
    assert.equal(r.status, 0);
    assert.ok(!JSON.stringify(f.diagnostics()).includes("OUTSIDE_SENTINEL"));
  }
  assert.equal(fs.readFileSync(canary, "utf8"), "! OUTSIDE_SENTINEL\n");
});
test("limits prioritize errors and disclose omitted diagnostics", () => {
  const result = finalizeDiagnostics([
    ...Array.from({ length: 200 }, (_, n) => ({
      severity: "warning" as const,
      message: "Warning " + n,
    })),
    {
      severity: "error",
      path: "main.tex",
      line: 2,
      message: "Important error",
    },
  ]);
  assert.equal(result.length, 150);
  assert.equal(result[0].severity, "error");
  assert.match(result.at(-1)!.message, /limited/);
});
test("failed unknown formats remain errors and legacy API reads refresh derived diagnostics without changing source/history/status", async (t) => {
  const f = fixture(t),
    data = path.join(f.dir, "app");
  const store = new Store(data),
    compiler = new Compiler(store);
  const p = store.create("Synthetic diagnostics", [
    { path: "main.tex", data: Buffer.from("% preserved source") },
  ]);
  const id = randomUUID(),
    dir = path.join(data, "builds", id);
  fs.mkdirSync(path.join(dir, "source"), { recursive: true });
  fs.mkdirSync(path.join(dir, "out"));
  fs.writeFileSync(path.join(dir, "source/main.tex"), "% preserved source");
  fs.writeFileSync(path.join(dir, "out/main.log"), "(./main.tex\n)\n");
  const job: CompileJob = {
    id,
    projectId: p.id,
    generation: p.generation,
    status: "succeeded",
    diagnostics: [{ severity: "warning", message: oldWarning }],
    log: oldWarning,
    pdf: false,
    started: new Date().toISOString(),
    engine: "pdflatex",
    root: "main.tex",
  };
  compiler.jobs.set(id, job);
  compiler.persist(job);
  const before = JSON.stringify({
    project: store.project(p.id),
    history: store.checkpoints(p.id),
    source: store.readText(p.id, "main.tex"),
  });
  store.close();
  const app = await createApp(data, {
    seed: false,
    dist: path.join(data, "absent-dist"),
  });
  try {
    const list = await app.app.inject({
      method: "GET",
      url: `/api/projects/${p.id}/builds`,
      headers: { host: "127.0.0.1:4317" },
    });
    assert.equal(list.statusCode, 200);
    const refreshed = list.json().jobs[0];
    assert.deepEqual(refreshed.diagnostics, []);
    assert.equal(refreshed.status, job.status);
    assert.equal(refreshed.diagnosticsVersion, DIAGNOSTICS_VERSION);
    const read = await app.app.inject({
      method: "GET",
      url: `/api/builds/${id}`,
      headers: { host: "127.0.0.1:4317" },
    });
    assert.deepEqual(read.json(), refreshed);
    assert.equal(
      JSON.stringify({
        project: app.store.project(p.id),
        history: app.store.checkpoints(p.id),
        source: app.store.readText(p.id, "main.tex"),
      }),
      before,
    );
  } finally {
    await app.app.close();
  }
  const restarted = new Store(data),
    restored = new Compiler(restarted).get(id)!;
  assert.deepEqual(restored.diagnostics, []);
  assert.equal(restored.diagnosticsVersion, DIAGNOSTICS_VERSION);
  restarted.close();
  assert.equal(
    f.diagnostics("Unknown external tool failure", true)[0].severity,
    "error",
  );
});
