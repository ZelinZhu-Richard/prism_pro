import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip } from "../server/files";
import { defaultRuntimes, TexRuntimes } from "../server/tex-runtimes";
import { TEX_TOOLS } from "../shared/tex-runtimes";
import { compilerEnvironment, sandboxProfile } from "../server/compiler";
import { LocalProcess } from "../server/local-process";
import { processGroup, supervisorIdentity } from "../server/supervision";

// Explicit verification-only path. No download, installation or persistent
// production tool setting is performed by this script.
const supplied = process.env.LEAF_VERIFY_LATEXINDENT;
if (!supplied || !path.isAbsolute(supplied))
  throw Error(
    "Set LEAF_VERIFY_LATEXINDENT to an installed or verified standalone latexindent executable.",
  );
const executable = fs.realpathSync(supplied),
  digest = createHash("sha256")
    .update(fs.readFileSync(executable))
    .digest("hex");
fs.accessSync(executable, fs.constants.X_OK);
const root = path.resolve("data/verification/formatting-real-" + Date.now()),
  f = await offlineWorkspace(root),
  results: string[] = [];
const actual = defaultRuntimes.resolve(),
  texRoot = path.join(root, "toolchain/2026"),
  bin = path.join(texRoot, "bin/universal-darwin");
fs.mkdirSync(bin, { recursive: true });
fs.symlinkSync(
  path.join(actual.texRoot, "texmf-dist"),
  path.join(texRoot, "texmf-dist"),
);
for (const name of [...TEX_TOOLS, "pdftex"] as string[]) {
  const tool =
    name === "pdftex"
      ? path.join(actual.binDir, name)
      : actual.commands[name as keyof typeof actual.commands];
  if (tool && fs.existsSync(tool)) fs.symlinkSync(tool, path.join(bin, name));
}
fs.copyFileSync(executable, path.join(bin, "latexindent"));
fs.chmodSync(path.join(bin, "latexindent"), 0o700);
f.compiler.runtimes = new TexRuntimes({
  systemBin: bin,
  texLiveRoot: path.join(root, "toolchain"),
  extraBins: [],
  supportDirs: [],
});
const runtime = f.compiler.runtimes.resolve(),
  pass = (name: string) => {
    results.push(name);
    console.log("PASS " + name);
  };
async function until(check: () => boolean, label: string, ms = 25000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw Error("Timed out: " + label);
    await new Promise((r) => setTimeout(r, 30));
  }
}
function drained(dir: string) {
  const identity = supervisorIdentity(dir);
  assert.ok(identity);
  assert.deepEqual(processGroup(identity.pid), []);
}
async function format(project: string, content: string, revision: number) {
  const job = f.formatting.start(project, {
    path: "main.tex",
    content,
    revision,
  });
  await until(() => job.status !== "running", "real formatter");
  drained(path.join(root, "formatting", job.id));
  assert.equal(job.status, "succeeded", job.error + "\n" + job.log);
  return job;
}
async function compile(project: string) {
  const job = f.compiler.start(project);
  await until(
    () => !["queued", "running"].includes(job.status),
    "real TeX",
    40000,
  );
  drained(f.compiler.dir(job.id));
  assert.equal(job.status, "succeeded", job.log);
  return job;
}
const sourceBlock = String.raw`\begin{itemize}
\item \localemph{Source-backed local formatting.}
\begin{itemize}
\item Nested content with $x^2$.
\end{itemize}
\end{itemize}
\begin{verbatim}
  literal \begin{not-an-environment} stays exact
\end{verbatim}
`;
const rawBlock = String.raw`\begin{verbatim}
  literal \begin{not-an-environment} stays exact
\end{verbatim}`;
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
try {
  const dir = path.join(root, "version-probe");
  for (const name of ["source", "out", "home"])
    fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, "tool.sb"), sandboxProfile(dir, runtime));
  const probe = new LocalProcess(dir, {
    command: "/usr/bin/sandbox-exec",
    args: [
      "-f",
      path.join(dir, "tool.sb"),
      path.join(bin, "latexindent"),
      "--version",
    ],
    cwd: path.join(dir, "source"),
    env: compilerEnvironment(path.join(dir, "home"), runtime),
    timeoutMs: 15000,
  });
  const version = await probe.done;
  drained(dir);
  assert.equal(version.result?.code, 0, version.log);
  assert.match(version.log, /\d+\.\d+/);
  pass(
    "real formatter starts and reports its version inside the unchanged sandbox",
  );
  const entries = await readZip(offlineArchive(root)),
    main = entries.find((e) => e.path === "main.tex")!;
  const original = main.data
    .toString()
    .replace(
      "\\begin{document}",
      "\\newcommand{\\localemph}[1]{\\emph{#1}}\n% Unicode notes: 新文本 👩🏽‍💻 é\n\\begin{document}",
    )
    .replace("\\bibliographystyle", sourceBlock + "\\bibliographystyle");
  main.data = Buffer.from(original);
  entries.push({
    path: "localSettings.yaml",
    data: Buffer.from("This invalid project YAML must never be read: ["),
  });
  const p = f.store.create("Real local formatter verification", entries),
    before = JSON.stringify({
      files: f.store.exportFiles(p.id),
      project: f.store.project(p.id),
      history: f.store.checkpoints(p.id),
    }),
    revision = f.store.readText(p.id, "main.tex").revision;
  const job = await format(p.id, original, revision);
  assert.notEqual(job.text, original);
  assert.ok(job.text!.includes(rawBlock));
  assert.ok(job.text!.includes("\\newcommand{\\localemph}[1]{\\emph{#1}}"));
  assert.ok(job.text!.includes("新文本 👩🏽‍💻 é"));
  assert.equal(
    JSON.stringify({
      files: f.store.exportFiles(p.id),
      project: f.store.project(p.id),
      history: f.store.checkpoints(p.id),
    }),
    before,
  );
  pass(
    "real default-only formatting changes indentation while preserving custom commands, Unicode and literal source; preview writes no project/history",
  );
  const response = await f.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/format/${job.id}/validate`,
    headers,
    payload: { content: original },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().text, job.text);
  f.store.save(p.id, "main.tex", job.text!, revision);
  const compiled = await compile(p.id);
  pass(
    "approved real formatting saves and compiles with actual multi-file LaTeX/BibTeX/math/figure dependencies",
  );
  const second = await format(p.id, job.text!, revision + 1);
  assert.equal(second.text, job.text);
  pass("a second real default-only pass is byte-identical");
  f.store.save(p.id, "main.tex", original, revision + 1);
  const restored = await compile(p.id);
  assert.equal(f.store.readText(p.id, "main.tex").content, original);
  for (const entry of entries.filter((e) => e.path !== "main.tex")) {
    const got = f.store.exportFiles(p.id).find((e) => e.path === entry.path)!;
    assert.ok(got.data.equals(entry.data));
  }
  assert.equal(f.evidence().generations, 0);
  assert.deepEqual(f.evidence().blocked, []);
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  pass(
    "exact source restoration compiles; all supporting bytes stay exact; no AI or external backend request",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        executable,
        sha256: digest,
        version: version.log.trim(),
        results,
        project: p.id,
        formatting: [job.id, second.id],
        builds: [compiled.id, restored.id],
        evidence: f.evidence(),
      },
      null,
      2,
    ),
  );
  console.log("Report: " + path.join(root, "report.json"));
} finally {
  await f.app.close();
  f.restoreFetch();
}
