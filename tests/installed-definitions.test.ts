import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { DIAGNOSTICS_VERSION } from "../server/diagnostics";
import { recordedPackages } from "../server/installed-definitions";
import { TexRuntimes, runtimeSnapshot } from "../server/tex-runtimes";
import {
  sourceOccurrences,
  type SourceNavigationResult,
} from "../shared/source-navigation";
import type { CompileJob } from "../shared/types";

const packagePath = "tex/latex/example/example.sty";
const definition = "\\newcommand{\\Example}{Installed value}\n";

async function fixture(t: TestContext) {
  const root = path.resolve(
    "data/verification/installed-definition-test-" + randomUUID(),
  );
  const texRoot = path.join(root, "texlive/2026"),
    bin = path.join(texRoot, "bin/universal-darwin"),
    dist = path.join(texRoot, "texmf-dist");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "pdftex"),
    "#!/bin/sh\nprintf 'pdfTeX (TeX Live 2026)\\n'\n",
    { mode: 0o755 },
  );
  const installed = path.join(dist, packagePath);
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.writeFileSync(installed, definition);
  const runtimes = new TexRuntimes({
    systemBin: bin,
    texLiveRoot: path.join(root, "texlive"),
    extraBins: [],
    supportDirs: [],
  });
  const { app, store, compiler } = await createApp(path.join(root, "data"), {
    seed: false,
    runtimes,
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.create("Synthetic installed definition", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\n\\Example\n\\end{document}\n",
      ),
    },
  ]);
  const api = (projectId: string, endpoint: string, payload: object) =>
    app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/${endpoint}`,
      payload,
      headers: { host: "127.0.0.1:5173", "x-prism-request": "1" },
    });
  const job: CompileJob = {
    id: randomUUID(),
    projectId: project.id,
    generation: project.generation,
    engine: project.engine,
    root: project.root,
    status: "succeeded",
    pdf: true,
    started: new Date().toISOString(),
    diagnostics: [],
    log: "",
    diagnosticsVersion: DIAGNOSTICS_VERSION,
    runtime: runtimeSnapshot(runtimes.resolve()),
  };
  const output = path.join(store.root, "builds", job.id, "out");
  fs.mkdirSync(output, { recursive: true });
  const recorder = path.join(output, "main.fls");
  fs.writeFileSync(recorder, `INPUT ${installed}\nINPUT ${installed}\n`);
  const find = async (query: object = {}) => {
    const response = await api(project.id, "source-locations", {
      kind: "command",
      name: "Example",
      mode: "definitions",
      ...query,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<SourceNavigationResult>();
  };
  return {
    store,
    compiler,
    root,
    dist,
    project,
    installed,
    recorder,
    job,
    find,
    api,
  };
}

test("recorder parsing admits only distinct distribution package inputs", () => {
  const root = "/synthetic/texmf-dist";
  const input = [
    `INPUT ${root}/${packagePath}`,
    `INPUT ${root}/${packagePath}`,
    `OUTPUT ${root}/tex/output.sty`,
    `INPUT ${root}-untrusted/tex/escape.sty`,
    `INPUT ${root}/tex/../../escape.sty`,
    `INPUT ${root}/tex/holdout/hidden.sty`,
    `INPUT ${root}/tex/.hidden/missing.sty`,
    `INPUT ${root}/doc/ignored.sty`,
    `INPUT ${root}/tex/latex/example/example.cls`,
  ];
  assert.deepEqual(recordedPackages(input.join("\r\n"), [root]), [
    packagePath,
    "tex/latex/example/example.cls",
  ]);
});

test("local draft definitions precede recorded package definitions and open exact read-only excerpts", async (t) => {
  const f = await fixture(t);
  assert.match((await f.find()).warnings.join(" "), /Compile this document/);
  f.compiler.jobs.set(f.job.id, f.job);
  const result = await f.find({
    current: {
      path: "main.tex",
      revision: 0,
      content: "\\newcommand{\\Example}{Unsaved project definition}\n",
    },
  });
  assert.equal(result.total, 2);
  assert.equal(result.locations[0].unsaved, true);
  const location = result.locations[1];
  assert.equal(location.path, packagePath);
  assert.equal(location.installed?.buildId, f.job.id);
  const view = await f.api(f.project.id, "installed-definition", location);
  assert.equal(view.statusCode, 200, view.body);
  const excerpt = view.json();
  assert.equal(excerpt.before + excerpt.symbol + excerpt.after, definition);
  assert.equal(excerpt.symbol, "\\Example");
  assert.equal(excerpt.line, 1);
  assert.equal(
    f.store.requireProject(f.project.id).generation,
    f.project.generation,
  );
  assert(
    (await f.find({ mode: "references" })).locations.every(
      (entry) => !entry.installed,
    ),
  );
});

test("installed locations expire after file, recorder or project ownership changes", async (t) => {
  const f = await fixture(t);
  f.compiler.jobs.set(f.job.id, f.job);
  const location = (await f.find()).locations[0];
  const malformed = await f.api(f.project.id, "installed-definition", {
    ...location,
    hash: { toString: "not a fingerprint" },
  });
  assert.equal(malformed.statusCode, 400);
  fs.writeFileSync(
    f.installed,
    definition.replace("Installed value", "Changed package"),
  );
  assert.equal(
    (await f.api(f.project.id, "installed-definition", location)).statusCode,
    409,
  );
  const refreshed = (await f.find()).locations[0];
  assert.notEqual(refreshed.hash, location.hash);
  const other = f.store.create("Other project");
  assert.equal(
    (await f.api(other.id, "installed-definition", refreshed)).statusCode,
    409,
  );
  fs.writeFileSync(f.recorder, "");
  assert.equal(
    (await f.api(f.project.id, "installed-definition", refreshed)).statusCode,
    409,
  );
});

test("recorded escaping links and hard links never expose their contents", async (t) => {
  const f = await fixture(t);
  f.compiler.jobs.set(f.job.id, f.job);
  const outside = path.join(f.root, "outside.sty");
  fs.writeFileSync(outside, definition);
  const selected = (await f.find()).locations[0];
  fs.unlinkSync(f.installed);
  for (const link of [fs.symlinkSync, fs.linkSync]) {
    link(outside, f.installed);
    assert.equal((await f.find()).total, 0);
    assert.equal(
      (await f.api(f.project.id, "installed-definition", selected)).statusCode,
      409,
    );
    fs.unlinkSync(f.installed);
  }
});

test("literal aliases leave later package declarations visible and keep comments masked", () => {
  const content = String.raw`\let\old= % \IgnoredReference
  \providecommand
\let\alias\newenvironment
\newenvironment{displayrow}{open}{close}
\newcommand{\Example}{value}
`;
  const result = sourceOccurrences({ path: packagePath, content });
  assert.deepEqual(
    result.occurrences
      .filter((entry) => entry.role === "definition")
      .map((entry) => entry.name),
    ["displayrow", "Example"],
  );
  assert(
    result.occurrences.some(
      (entry) => entry.name === "providecommand" && entry.role === "reference",
    ),
  );
  assert(
    result.occurrences.every((entry) => entry.name !== "IgnoredReference"),
  );
});
