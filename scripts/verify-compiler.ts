import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import {
  Compiler,
  compilerEnvironment,
  sandboxProfile,
  toolchain,
} from "../server/compiler";
import { demoFiles } from "../server/demo";
import type { Engine } from "../shared/types";
const root = path.resolve("data/verification/compiler-" + Date.now());
fs.mkdirSync(root, { recursive: true });
const store = new Store(root),
  compiler = new Compiler(store),
  results: any[] = [];
async function build(id: string, runner = compiler) {
  const job = runner.start(id);
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (!runner.processes.has(job.id)) resolve();
      else if (Date.now() - start > 130000)
        reject(new Error("verification timeout"));
      else setTimeout(tick, 100);
    };
    tick();
  });
  return job;
}
async function check(name: string, action: () => Promise<unknown> | unknown) {
  try {
    const detail = await action();
    results.push({ name, passed: true, detail });
    console.log("PASS " + name);
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
    console.log("FAIL " + name + ": " + String(error));
  }
}
const sample = store.create("Synthetic compiler verification", demoFiles);
for (const engine of ["pdflatex", "xelatex", "lualatex"] as Engine[])
  await check(engine + " multi-file document and BibTeX", async () => {
    store.update(sample.id, { engine });
    const job = await build(sample.id);
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
    return { jobId: job.id, diagnostics: job.diagnostics.length };
  });
await check("bidirectional SyncTeX", () => {
  const job = compiler.latestPdf(sample.id)!;
  const forward = compiler.sync(job.id, {
    direction: "forward",
    path: "sections/method.tex",
    line: 2,
  });
  assert.ok((forward.page ?? 0) > 0);
  const back = compiler.sync(job.id, {
    direction: "inverse",
    page: forward.page,
    x: forward.x,
    y: forward.y,
  });
  assert.ok(back.path?.endsWith(".tex"));
  return { forward, back };
});
await check("Unicode with XeLaTeX", async () => {
  const p = store.create("Unicode", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}Café — naïve. Ελληνικά.\\end{document}",
      ),
    },
  ]);
  store.update(p.id, { engine: "xelatex" });
  assert.equal((await build(p.id)).status, "succeeded");
});
await check("figures, nested directories and a root selector", async () => {
  const pdf = fs.readFileSync(
    compiler.pdfPath(compiler.latestPdf(sample.id)!.id),
  );
  const p = store.create("Figures", [
    {
      path: "roots/entry.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\\includegraphics[width=2cm]{figures/plot.pdf}\\end{document}",
      ),
    },
    { path: "figures/plot.pdf", data: pdf },
  ]);
  store.update(p.id, { root: "roots/entry.tex" });
  const j = await build(p.id);
  assert.equal(j.status, "succeeded", j.log.slice(-1000));
});
await check(
  "compiler errors keep last good PDF and include source line",
  async () => {
    const before = compiler.latestPdf(sample.id)!;
    const f = store.readText(sample.id, "main.tex");
    store.save(
      sample.id,
      f.path,
      f.content.replace("\\maketitle", "\\notARealCommand"),
      f.revision,
    );
    const bad = await build(sample.id);
    assert.equal(bad.status, "failed");
    assert.ok(bad.diagnostics.some((d) => d.severity === "error" && d.line));
    assert.equal(compiler.latestPdf(sample.id)!.id, before.id);
    assert.notEqual(store.project(sample.id).generation, before.generation);
  },
);
await check("missing package diagnosis", async () => {
  const p = store.create("Missing", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\usepackage{prismMissingPackage}\n\\begin{document}x\\end{document}",
      ),
    },
  ]);
  const j = await build(p.id);
  assert.equal(j.status, "failed");
  assert.match(j.log, /prismMissingPackage/);
});
await check("missing Biber is detected before spawning", () => {
  if (toolchain().biber)
    return "Biber installed; missing-tool test inapplicable";
  const p = store.create("Biber", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\usepackage{biblatex}\n\\begin{document}x\\end{document}",
      ),
    },
  ]);
  assert.throws(() => compiler.start(p.id), /Biber is missing/);
});
await check(
  "shell escape and imported latexmk configuration are disabled",
  async () => {
    const p = store.create("No scripts", [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\n\\begin{document}\\immediate\\write18{touch SCRIPT_EXECUTED}Safe.\\end{document}",
        ),
      },
      {
        path: "latexmkrc",
        data: Buffer.from('die "IMPORTED_CONFIG_EXECUTED";'),
      },
    ]);
    const j = await build(p.id);
    assert.equal(j.status, "succeeded", j.log.slice(-800));
    assert.equal(
      fs.existsSync(path.join(compiler.dir(j.id), "source", "SCRIPT_EXECUTED")),
      false,
    );
    assert.ok(!j.log.includes("IMPORTED_CONFIG_EXECUTED"));
  },
);
await check("sandbox denies outside reads, outside writes, and network", () => {
  const dir = path.join(root, "sandbox-fixture");
  fs.mkdirSync(dir);
  const sentinel = path.join(root, "private-sentinel.txt");
  fs.writeFileSync(sentinel, "SENTINEL");
  const profile = sandboxProfile(dir),
    env = compilerEnvironment(dir);
  const read = spawnSync(
    "/usr/bin/sandbox-exec",
    ["-p", profile, "/bin/cat", sentinel],
    { env, encoding: "utf8" },
  );
  assert.notEqual(read.status, 0);
  assert.ok(!read.stdout.includes("SENTINEL"));
  const write = spawnSync(
    "/usr/bin/sandbox-exec",
    ["-p", profile, "/usr/bin/touch", path.join(root, "escape.txt")],
    { env },
  );
  assert.notEqual(write.status, 0);
  assert.ok(!fs.existsSync(path.join(root, "escape.txt")));
  const immutable = spawnSync(
    "/usr/bin/sandbox-exec",
    ["-p", profile, "/usr/bin/touch", path.join(dir, "snapshot-mutation")],
    { env },
  );
  assert.notEqual(immutable.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, "snapshot-mutation")));
  const network = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      profile,
      "/usr/bin/curl",
      "--max-time",
      "2",
      "http://127.0.0.1:4317/api/health",
    ],
    { env, encoding: "utf8" },
  );
  assert.notEqual(network.status, 0);
  return { read: read.status, write: write.status, network: network.status };
});
await check("cancellation stops a running immutable snapshot", async () => {
  const p = store.create("Cancel", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\\def\\forever{\\forever}\\forever\\end{document}",
      ),
    },
  ]);
  const j = compiler.start(p.id);
  await new Promise((r) => setTimeout(r, 200));
  compiler.cancel(j.id);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(j.status, "cancelled");
  assert.ok(!compiler.processes.has(j.id));
});
if (process.argv.includes("--timeout"))
  await check(
    "explicit two-minute deadline terminates runaway TeX",
    async () => {
      const limited = new Compiler(store, undefined, { timeoutMs: 120000 });
      const p = store.create("Timeout", [
        {
          path: "main.tex",
          data: Buffer.from(String.raw`\documentclass{article}
\begin{document}
\loop\iftrue\repeat
\end{document}`),
        },
      ]);
      const started = Date.now(),
        job = await build(p.id, limited);
      assert.equal(job.status, "failed");
      assert.match(job.log, /configured time limit \(120000 ms\)/);
      assert.equal(job.timeoutMs, 120000);
      assert.ok(Date.now() - started >= 120000);
      await limited.shutdown();
      return { elapsedMs: Date.now() - started };
    },
  );
fs.writeFileSync(
  path.join(root, "report.json"),
  JSON.stringify(
    { date: new Date().toISOString(), toolchain: toolchain(), results },
    null,
    2,
  ),
);
store.close();
console.log("Report: " + path.join(root, "report.json"));
if (results.some((r) => !r.passed)) process.exitCode = 1;
