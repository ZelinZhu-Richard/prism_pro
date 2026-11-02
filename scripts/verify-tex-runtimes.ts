import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { Store } from "../server/store";
import {
  Compiler,
  compileArguments,
  compilerEnvironment,
  sandboxProfile,
} from "../server/compiler";
import { BuildArtifacts } from "../server/build-files";
import { runtimeSnapshot } from "../server/tex-runtimes";
import { readZip } from "../server/files";
import type { Engine, CompileJob } from "../shared/types";
import { requiredTexTools } from "../shared/tex-runtimes";

const root = path.resolve(
  "data/verification/tex-runtimes-compiler-" + Date.now(),
);
fs.mkdirSync(root, { recursive: true });
const store = new Store(root),
  compiler = new Compiler(store),
  artifacts = new BuildArtifacts(compiler);
const stages: any[] = [];
let classicCancellation:
  | {
      id: string;
      stage: string;
      processes: string;
      pdf: boolean;
      status: string;
    }
  | undefined;
let operatingSystemReadDenied = false;
const results: any[] = [],
  skipped: string[] = [];
const source = String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\section{Synthetic runtime evidence}
\input{sections/evidence}
Evidence~\cite{synthetic}.
\bibliographystyle{plain}\bibliography{references}
\end{document}
`;
function fixturePng() {
  function chunk(name: string, data: Buffer) {
    const raw = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const b of raw) {
      crc ^= b;
      for (let n = 0; n < 8; n++)
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    const length = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, raw, sum]);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(2);
  head.writeUInt32BE(2, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk(
      "IDAT",
      deflateSync(
        Buffer.from([0, 200, 30, 30, 200, 30, 30, 0, 200, 30, 30, 200, 30, 30]),
      ),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const png = fixturePng();
const eps = Buffer.from(
  "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 50\n0.3 0.3 0.3 setrgbcolor\nnewpath 0 0 moveto 100 0 lineto 100 50 lineto 0 50 lineto closepath fill\nshowpage\n%%EOF\n",
);
function files(engine: Engine) {
  return [
    {
      path: "paper/main.tex",
      data: Buffer.from(
        source.replace(
          "\\input{sections/evidence}",
          `\\input{sections/evidence}\n\\includegraphics[width=2cm]{assets/figure.${engine === "latex" ? "eps" : "png"}}`,
        ),
      ),
    },
    {
      path: "sections/evidence.tex",
      data: Buffer.from(
        "A stable nested runtime paragraph.\\label{sec:evidence}\n",
      ),
    },
    {
      path: "references.bib",
      data: Buffer.from(
        "@article{synthetic,author={Example Author},title={Runtime evidence},journal={Synthetic Journal},year={2026}}\n",
      ),
    },
    { path: "assets/figure.png", data: png },
    { path: "assets/figure.eps", data: eps },
    { path: "assets/empty", directory: true, data: Buffer.alloc(0) },
    {
      path: "latexmkrc",
      data: Buffer.from('die "IMPORTED_CONFIGURATION_EXECUTED";'),
    },
  ];
}
function snapshot(id: string) {
  return JSON.stringify(
    store
      .exportFiles(id)
      .map((f) => [f.path, f.data.toString("base64"), !!f.directory])
      .sort(),
  );
}
function text(job: CompileJob) {
  const r = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
async function finish(job: CompileJob) {
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (!compiler.processes.has(job.id)) resolve();
      else if (Date.now() - started > 130000)
        reject(new Error("Verification exceeded build timeout."));
      else setTimeout(tick, 100);
    };
    tick();
  });
  return job;
}
async function build(id: string) {
  const j = await finish(compiler.start(id));
  results.push({
    id: j.id,
    engine: j.engine,
    status: j.status,
    pdf: j.pdf,
    runtime: j.runtime,
    options: j.options,
  });
  return j;
}
async function dviPsStages(id: string, runtimeId: string) {
  const runtime = compiler.runtimes.resolve(runtimeId);
  for (const mode of ["normal", "draft"] as const) {
    const dir = path.join(root, "dvi-ps-stage-" + mode),
      source = path.join(dir, "source"),
      out = path.join(dir, "out"),
      home = path.join(dir, "home");
    for (const d of [source, out, home]) fs.mkdirSync(d, { recursive: true });
    for (const f of store.exportFiles(id)) {
      const dest = path.join(source, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (f.directory) fs.mkdirSync(dest, { recursive: true });
      else fs.writeFileSync(dest, f.data);
    }
    const profile = path.join(dir, "compiler.sb");
    fs.writeFileSync(profile, sandboxProfile(dir, runtime));
    const args = compileArguments("latex", { mode, errorHandling: "stop" }).map(
      (a) => (a === "-pdfps" ? "-dvi" : a),
    );
    // This deliberately ends at PostScript. It does not certify the missing PDF converter.
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [
        "-f",
        profile,
        runtime.commands.latexmk!,
        ...args,
        "-ps",
        "-outdir=" + out,
        "./paper/main.tex",
      ],
      {
        cwd: source,
        env: compilerEnvironment(home, runtime),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    child.stdout.on("data", (b) => (log += b.toString()));
    child.stderr.on("data", (b) => (log += b.toString()));
    const timer = setTimeout(() => {
      if (child.pid)
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
    }, 120000);
    timer.unref();
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    clearTimeout(timer);
    fs.writeFileSync(path.join(dir, "stage.log"), log);
    assert.equal(code, 0, log.slice(-4000));
    const dvi = fs.readFileSync(path.join(out, "main.dvi")),
      ps = fs.readFileSync(path.join(out, "main.ps"));
    assert.equal(dvi[0], 247);
    assert.ok(ps.toString("ascii", 0, 20).startsWith("%!PS-Adobe"));
    assert.ok(fs.existsSync(path.join(out, "main.bbl")));
    assert.equal(
      /%%BeginDocument:.*figure\.eps/.test(ps.toString("latin1")),
      mode === "normal",
    );
    assert.equal(fs.existsSync(path.join(out, "main.pdf")), false);
    stages.push({
      mode,
      code,
      dviBytes: dvi.length,
      psBytes: ps.length,
      epsEmbedded: mode === "normal",
      runtime: runtimeSnapshot(runtime),
      pdfVerified: false,
    });
    console.log(
      "PASS LaTeX " +
        mode +
        " DVI/PostScript stages with bibliography; final PDF conversion remains unverified",
    );
  }
}
function options(
  id: string,
  runtimeId: string,
  mode: "normal" | "draft" = "normal",
  errorHandling: "stop" | "continue" = "stop",
) {
  return compiler.configure(id, {
    mode,
    errorHandling,
    runtimeId,
    revision: compiler.settings(id).revision,
  });
}
try {
  const catalog = compiler.runtimes.catalog(),
    pinned = catalog.runtimes.find((r) => r.id !== "system" && r.available)!;
  assert.ok(pinned, "A detected installed TeX Live runtime is required.");
  const resolved = compiler.runtimes.resolve(pinned.id);
  const projects: any[] = [];
  for (const engine of [
    "pdflatex",
    "xelatex",
    "lualatex",
    "latex",
  ] as Engine[]) {
    const p = store.create("Synthetic " + engine, files(engine));
    store.update(p.id, { root: "paper/main.tex", engine });
    options(p.id, pinned.id);
    const before = snapshot(p.id),
      missing = requiredTexTools(engine).filter((n) => !pinned.tools[n]);
    if (missing.length) {
      const count = compiler.jobs.size;
      assert.throws(() => compiler.start(p.id), /missing.*Install/);
      assert.equal(compiler.jobs.size, count);
      assert.equal(snapshot(p.id), before);
      skipped.push(
        `${engine}: missing ${missing.join(", ")}; missing-tool preflight verified without fallback or job.`,
      );
      if (
        engine === "latex" &&
        !missing.some((n) => ["latexmk", "latex", "dvips"].includes(n))
      )
        await dviPsStages(p.id, pinned.id);
      continue;
    }
    const j = await build(p.id);
    assert.equal(j.status, "succeeded", j.log.slice(-4000));
    assert.deepEqual(j.runtime, runtimeSnapshot(resolved));
    assert.equal(j.options?.runtimeId, pinned.id);
    assert.match(text(j), /A stable nested runtime paragraph/);
    assert.equal(snapshot(p.id), before);
    assert.doesNotMatch(j.log, /IMPORTED_CONFIGURATION_EXECUTED/);
    const forward = compiler.sync(j.id, {
      direction: "forward",
      path: "sections/evidence.tex",
      line: 1,
    });
    assert.ok(forward.page && Number.isFinite(forward.x));
    const inverse = compiler.sync(j.id, {
      direction: "inverse",
      page: forward.page,
      x: forward.x,
      y: forward.y,
    });
    assert.ok(inverse.path?.endsWith(".tex"));
    const list = artifacts.list(j.id);
    assert.deepEqual(list.runtime, j.runtime);
    assert.ok(list.files.some((f) => f.path === "main.bbl"));
    if (engine === "latex")
      for (const ext of ["dvi", "ps", "pdf"])
        assert.ok(list.files.some((f) => f.path === "main." + ext));
    projects.push({ id: p.id, engine, job: j.id, before });
    console.log(
      "PASS " +
        engine +
        " pinned runtime, bibliography, figure, generated files and SyncTeX",
    );
  }
  const p = projects.find((p) => p.engine === "pdflatex")!;
  options(p.id, "system");
  const system = await build(p.id);
  assert.equal(system.status, "succeeded", system.log.slice(-3000));
  assert.equal(system.runtime?.id, "system");
  assert.equal(snapshot(p.id), p.before);
  const classic = projects.find((p) => p.engine === "latex");
  if (classic) {
    options(classic.id, pinned.id, "draft");
    const draft = await build(classic.id);
    assert.equal(draft.status, "succeeded", draft.log.slice(-4000));
    assert.match(text(draft), /figure\.eps/);
    assert.doesNotMatch(text(compiler.jobs.get(classic.job)!), /figure\.eps/);
    const f = store.readText(classic.id, "paper/main.tex");
    store.save(
      classic.id,
      f.path,
      f.content.replace(
        "\\section{Synthetic runtime evidence}",
        "\\section{Synthetic runtime evidence}\\UndefinedSyntheticCommand",
      ),
      f.revision,
    );
    options(classic.id, pinned.id);
    const stop = await build(classic.id);
    assert.equal(stop.status, "failed");
    assert.equal(stop.pdf, false);
    options(classic.id, pinned.id, "normal", "continue");
    const cont = await build(classic.id);
    assert.equal(cont.status, "failed");
    assert.equal(cont.pdf, true, cont.log.slice(-4000));
    assert.equal(compiler.latestPdf(classic.id)?.id, draft.id);
    const current = store.readText(classic.id, f.path);
    store.save(classic.id, f.path, f.content, current.revision);
    options(classic.id, pinned.id);
    const good = await build(classic.id);
    assert.equal(good.status, "succeeded");
    const plan = artifacts.preview(good.id, {
      paths: ["main.bbl", "main.dvi", "main.ps"],
      includeSource: true,
    });
    const download = artifacts.prepare(good.id, {
        ...plan,
        hash: plan.hash,
        allowReplace: true,
      }),
      zip = artifacts.download(download.id).bytes;
    const imported = await readZip(zip),
      round = store.create("Classic roundtrip", imported);
    store.update(round.id, { root: "paper/main.tex", engine: "latex" });
    options(round.id, pinned.id);
    const roundJob = await build(round.id);
    assert.equal(roundJob.status, "succeeded", roundJob.log.slice(-4000));
    const outside = path.join(root, "outside-synthetic.txt");
    fs.writeFileSync(outside, "SYNTHETIC_OUTSIDE_SENTINEL");
    const malicious = store.create("Confined PostScript", [
      {
        path: "main.tex",
        data: Buffer.from(
          `\\documentclass{article}\\begin{document}Before.\\special{ps: (${outside}) (r) file pop} After.\\end{document}`,
        ),
      },
    ]);
    store.update(malicious.id, { engine: "latex" });
    options(malicious.id, pinned.id);
    const denied = await build(malicious.id);
    assert.equal(denied.status, "failed");
    assert.match(denied.log, /Running 'ps2pdf/);
    assert.match(denied.log, /invalidfileaccess|Permission denied/);
    assert.doesNotMatch(denied.log, /SYNTHETIC_OUTSIDE_SENTINEL/);
    assert.equal(
      fs.readFileSync(outside, "utf8"),
      "SYNTHETIC_OUTSIDE_SENTINEL",
    );
    const osRead = spawnSync(
      "/usr/bin/sandbox-exec",
      [
        "-f",
        path.join(compiler.dir(denied.id), "compiler.sb"),
        "/bin/cat",
        outside,
      ],
      {
        cwd: path.join(compiler.dir(denied.id), "source"),
        env: compilerEnvironment(
          path.join(compiler.dir(denied.id), "home"),
          resolved,
        ),
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.notEqual(osRead.status, 0);
    assert.match(osRead.stderr, /Operation not permitted|Permission denied/);
    assert.doesNotMatch(osRead.stdout, /SYNTHETIC_OUTSIDE_SENTINEL/);
    operatingSystemReadDenied = true;
    const loop = store.create("Cancel classic", [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\\begin{document}Before.\\special{ps: {} loop} After.\\end{document}",
        ),
      },
    ]);
    store.update(loop.id, { engine: "latex" });
    options(loop.id, pinned.id);
    const active = compiler.start(loop.id);
    assert.ok(compiler.processes.get(active.id)?.pid);
    const group = compiler.processes.get(active.id)!.pid!,
      deadline = Date.now() + 15000;
    let converterProcesses = "";
    while (compiler.processes.has(active.id) && Date.now() < deadline) {
      if (active.log.includes("Running 'ps2pdf")) {
        const observed = spawnSync(
          "/bin/ps",
          ["-g", String(group), "-o", "pid=,ppid=,stat=,command="],
          { encoding: "utf8", timeout: 2000 },
        );
        if (/(?:^|\/|\s)gs(?:\s|$)/m.test(observed.stdout)) {
          converterProcesses = observed.stdout;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(
      converterProcesses,
      "The real Ghostscript conversion process must be running before cancellation.",
    );
    compiler.cancel(active.id);
    await finish(active);
    assert.equal(active.status, "cancelled");
    assert.equal(active.pdf, false);
    classicCancellation = {
      id: active.id,
      stage: "ps2pdf",
      processes: converterProcesses,
      pdf: active.pdf,
      status: active.status,
    };
    assert.equal(snapshot(classic.id), classic.before);
    console.log(
      "PASS classic draft/stop/continue/source-output ZIP roundtrip/PostScript confinement/cancellation",
    );
  }
  store.close();
  const again = new Store(root),
    restarted = new Compiler(again, compiler.runtimes);
  try {
    assert.equal(
      restarted.jobs.get(system.id)?.runtime?.fingerprint,
      system.runtime?.fingerprint,
    );
    assert.equal(restarted.settings(p.id).runtimeId, undefined);
  } finally {
    again.close();
  }
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        catalog,
        physicalRuntimeDirectories: [
          ...new Set(
            catalog.runtimes.filter((r) => r.available).map((r) => r.binDir),
          ),
        ],
        results,
        stages,
        classicCancellation,
        operatingSystemReadDenied,
        skipped,
        sourceNeutral: true,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    "data/verification/tex-runtimes-completed-fixture.json",
    JSON.stringify(
      { root, classicCancellation, operatingSystemReadDenied },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ root, builds: results.length, skipped }));
} finally {
  artifacts.dispose();
  for (const j of compiler.jobs.values())
    if (j.status === "running") compiler.cancel(j.id);
  try {
    store.close();
  } catch {}
}
