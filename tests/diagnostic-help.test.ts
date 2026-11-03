import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  diagnosticHelp,
  diagnosticCounts,
  filterDiagnostics,
  currentCompilerDiagnostics,
  diagnosticRanges,
} from "../shared/diagnostic-help";
import {
  buildDiagnostics,
  parseDiagnostics,
  finalizeDiagnostics,
} from "../server/diagnostics";
import type { Diagnostic, CompileJob, Project } from "../shared/types";
const issue = (
  message: string,
  severity: Diagnostic["severity"] = "error",
): Diagnostic => ({ severity, message });
test("missing package/class and document dependencies give different local guidance without guessing packages", () => {
  for (const name of ["absent.sty", "MyClass.cls"])
    assert.equal(
      diagnosticHelp(issue(`LaTeX Error: File \`${name}' not found.`))?.title,
      "Package or class file is missing",
    );
  for (const name of ["sections/中文.tex", "figures/missing image.png"])
    assert.equal(
      diagnosticHelp(issue(`LaTeX Error: File \`${name}' not found.`))?.title,
      "A project dependency is missing",
    );
  assert.equal(
    diagnosticHelp(issue("I can't find file `sections/missing'."))?.title,
    "A project dependency is missing",
  );
  const help = diagnosticHelp(issue("Undefined control sequence."))!;
  assert.match(help.steps.join(" "), /does not identify which package/);
  assert(!/usepackage\{|install [A-Za-z]+/.test(help.steps.join(" ")));
});
test("recognized math, Unicode, environment, argument and bibliography problems retain source messages exactly", () => {
  for (const message of [
    "Missing $ inserted.",
    "LaTeX Error: Unicode character 新 (U+65B0)",
    "LaTeX Error: \\begin{align} on input line 2 ended by \\end{equation}.",
    "File ended while scanning use of \\section.",
    "BibTeX: I was expecting a `,' or a `}'",
  ]) {
    const d = issue(message),
      before = structuredClone(d);
    assert(diagnosticHelp(d), message);
    assert.deepEqual(d, before);
  }
});
test("persistent citation/reference and layout warnings explain bounded checks, not an automatic fix", () => {
  for (const message of [
    "LaTeX Warning: Citation `missing' on page 1 undefined on input line 4.",
    'BibTeX: I didn\'t find a database entry for "missing"',
    "LaTeX Warning: Reference `eq:one' on page 2 undefined on input line 5.",
    "LaTeX Warning: There were undefined references.",
    "Overfull \\hbox (3.0pt too wide) in paragraph at lines 2--4",
    "Underfull \\vbox (badness 10000) has occurred while \\output is active",
  ])
    assert(diagnosticHelp(issue(message, "warning")), message);
  assert.match(
    diagnosticHelp(issue("Overfull \\hbox (1pt too wide)", "warning"))!
      .explanation,
    /does not by itself mean compilation failed/,
  );
});
test("only recognized messages receive help and informational output never becomes a repair claim", () => {
  for (const message of [
    "An unfamiliar plugin emitted something.",
    "Example prose says Undefined control sequence.",
    "<script>Missing $ inserted.</script>",
    "LaTeX Error: A new unknown failure.",
  ])
    assert.equal(diagnosticHelp(issue(message)), undefined, message);
  assert.equal(diagnosticHelp(issue("Missing $ inserted.", "info")), undefined);
  assert(
    diagnosticHelp(
      issue("Build exceeded the configured time limit (1000 ms)."),
    ),
  );
  assert(diagnosticHelp(issue("Build interrupted by server restart.")));
  assert(
    diagnosticHelp(
      issue(
        "Package epstopdf Warning: Shell escape feature is not enabled.",
        "warning",
      ),
    ),
  );
});
test("package/class information is parsed with explicit severity and exact nested location; routine font/file banners stay raw", (t) => {
  const text =
    "(./main.tex\n(./sections/one.tex\nPackage fixture Info: Synthetic note on input line 7.\n(fixture)    Continued note.\n\nLaTeX Font Info: Font loaded on input line 3.\nPackage fixture Warning: Real warning on input line 9.\n\n! Undefined control sequence.\nl.10 \\oops\n)\n)";
  const dir = fs.mkdtempSync(
    path.resolve("data/verification/diagnostic-info-"),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "source/sections"), { recursive: true });
  fs.mkdirSync(path.join(dir, "out"));
  fs.writeFileSync(path.join(dir, "source/main.tex"), "% fixture");
  fs.writeFileSync(path.join(dir, "source/sections/one.tex"), "% fixture");
  fs.writeFileSync(path.join(dir, "out/main.log"), text);
  const ds = buildDiagnostics(dir, "main.tex", "");
  assert.deepEqual(
    ds.map((d) => d.severity),
    ["error", "warning", "info"],
  );
  assert.equal(ds[2].path, "sections/one.tex");
  assert.equal(ds[2].line, 7);
  assert.match(ds[2].message, /Continued note/);
  assert(!ds.some((d) => d.message.includes("Font loaded")));
  assert.equal(text.includes("LaTeX Font Info:"), true);
  assert.equal(
    parseDiagnostics(
      "./main.tex:2: Class fixture Info: Explicit note.",
      "main.tex",
    )[0].severity,
    "info",
  );
});
test("informational floods cannot suppress errors/warnings and deduplication keeps distinct severity", () => {
  const ds = finalizeDiagnostics([
    ...Array.from({ length: 180 }, (_, n) =>
      issue("Package fixture Info: " + n, "info"),
    ),
    issue("Real warning.", "warning"),
    issue("Real error."),
    issue("Real error."),
  ]);
  assert.equal(ds.length, 150);
  assert.equal(ds[0].message, "Real error.");
  assert.equal(ds[1].message, "Real warning.");
  assert.match(ds.at(-1)!.message, /limited/);
  assert.equal(
    finalizeDiagnostics([issue("Same.", "info"), issue("Same.", "warning")])
      .length,
    2,
  );
});
test("filters preserve original indices and severities without modifying source evidence", () => {
  const items = [issue("e"), issue("w", "warning"), issue("i", "info")],
    before = structuredClone(items);
  assert.deepEqual(diagnosticCounts(items), {
    error: 1,
    warning: 1,
    info: 1,
    problems: 2,
    all: 3,
  });
  assert.deepEqual(filterDiagnostics(items, "info"), [
    { index: 2, item: items[2] },
  ]);
  assert.equal(filterDiagnostics(items, "problems").length, 2);
  assert.equal(filterDiagnostics(items, "all").length, 3);
  assert.deepEqual(items, before);
});
test("compiler markers require matching project/generation, clean known saved source and a completed noncancelled build", () => {
  const d = { ...issue("bad"), path: "section.tex", line: 2 },
    job = {
      projectId: "p",
      generation: 4,
      status: "failed",
      diagnostics: [d, { ...d, path: "other.tex" }, { ...d, line: 0 }],
    } as CompileJob,
    p = { id: "p", generation: 4 } as Project;
  assert.deepEqual(
    currentCompilerDiagnostics(job, p, "section.tex", true, false),
    [d],
  );
  for (const state of [
    { job: { ...job, generation: 3 } },
    { job: { ...job, projectId: "other" } },
    { job: { ...job, status: "running" } },
    { job: { ...job, status: "cancelled" } },
    { project: { ...p, generation: 5 } },
    { clean: false },
    { uncertain: true },
  ])
    assert.deepEqual(
      currentCompilerDiagnostics(
        (state.job || job) as CompileJob,
        state.project || p,
        "section.tex",
        state.clean ?? true,
        state.uncertain ?? false,
      ),
      [],
    );
  assert.deepEqual(
    currentCompilerDiagnostics(undefined, p, "section.tex", true, false),
    [],
  );
});
test("compiler ranges use Unicode-safe source line starts and reject nonexistent or fractional lines", () => {
  const text = "新 👩🏽‍💻 é\n\\oops\n",
    d = { ...issue("bad"), line: 2 };
  const ranges = diagnosticRanges(text, [
    d,
    { ...d, line: 4 },
    { ...d, line: 0 },
    { ...d, line: 1.5 },
  ]);
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0].from, ranges[0].to), "\\oops");
  assert.equal(
    diagnosticRanges(text, [{ ...d, line: 3 }])[0].from,
    text.length,
  );
});
test("hard-wrapped informational/warning words and line numbers remain exact rather than linking to a truncated number", () => {
  for (const severity of ["Info", "Warning"]) {
    const prefix = `Package fixture ${severity}: `,
      tail = " on input line 284.",
      message =
        prefix +
        "x".repeat(79 - prefix.length - " on input line ".length - 1) +
        tail,
      wrapped = message.match(/.{1,79}/g)!.join("\n");
    assert.match(wrapped, /2\n84/);
    const ds = parseDiagnostics(
      "(./main.tex\n" + wrapped + "\n\n)",
      "main.tex",
    );
    assert.equal(ds[0].message, message);
    assert.equal(ds[0].line, 284);
    assert.equal(ds[0].path, "main.tex");
  }
});
