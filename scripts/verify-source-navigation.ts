import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip } from "../server/files";
import { supervisorIdentity, processGroup } from "../server/supervision";
import type {
  InstalledDefinitionPreview,
  SourceNavigationRequest,
  SourceNavigationResult,
} from "../shared/source-navigation";

const root = path.resolve(
    "data/verification/source-navigation-real-" + Date.now(),
  ),
  f = await offlineWorkspace(root),
  results: { name: string; passed: boolean }[] = [],
  jobs: string[] = [];
const pass = (name: string) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
async function request<T>(
  url: string,
  method = "GET",
  payload?: unknown,
  expected = 200,
): Promise<T> {
  const response = await f.app.inject({
    method: method as any,
    url: "/api" + url,
    headers,
    ...(payload === undefined ? {} : { payload: payload as any }),
  });
  assert.equal(response.statusCode, expected, response.body);
  return response.json();
}
try {
  const entries = await readZip(offlineArchive(root)),
    main = entries.find((e) => e.path === "main.tex")!,
    source = main.data
      .toString()
      .replace(
        "\\usepackage[hidelinks]{hyperref}",
        "\\usepackage[hidelinks]{hyperref}\n\\usepackage{styles/local}\n\\newcommand{\\CurrentValue}[1]{#1}",
      )
      .replace(
        "\\maketitle",
        "\\maketitle\n\\ProjectValue{A navigable local style.}\n\\CurrentValue{A current-file command.}\n\\begin{localbox}A literal local environment.\\end{localbox}",
      ),
    style =
      "\\ProvidesPackage{local}\n\\newcommand{\\ProjectValue}[1]{\\textbf{#1}}\n\\newenvironment{localbox}{\\begin{quote}}{\\end{quote}}\n";
  main.data = Buffer.from(source);
  entries.push({ path: "styles/local.sty", data: Buffer.from(style) });
  const p = f.store.create(
      "Source navigation engine · synthetic verification",
      entries,
    ),
    base = `/projects/${p.id}`,
    file = (name: string) => path.join(f.store.projectDir(p.id), name),
    state = () =>
      JSON.stringify({
        project: f.store.project(p.id),
        files: f.store.exportFiles(p.id),
        history: f.store.checkpoints(p.id),
        versions: f.store.db
          .prepare("SELECT * FROM versions WHERE project=?")
          .all(p.id),
        receipts: f.store.db
          .prepare("SELECT * FROM file_disk_state WHERE project=?")
          .all(p.id),
      }),
    find = (
      kind: SourceNavigationRequest["kind"],
      name: string,
      mode: SourceNavigationRequest["mode"] = "definitions",
      current?: SourceNavigationRequest["current"],
    ) =>
      request<SourceNavigationResult>(base + "/source-locations", "POST", {
        kind,
        name,
        mode,
        current,
      });
  const before = state();
  const defs = await find("command", "ProjectValue"),
    refs = await find("command", "ProjectValue", "references"),
    environment = await find("environment", "localbox");
  assert.equal(defs.total, 1);
  assert.equal(refs.total, 1);
  assert.equal(environment.total, 1);
  assert.equal(defs.locations[0].path, "styles/local.sty");
  for (const l of [
    ...defs.locations,
    ...refs.locations,
    ...environment.locations,
  ]) {
    const content = f.store.readText(p.id, l.path).content;
    assert.equal(l.hash, createHash("sha256").update(content).digest("hex"));
    assert.equal(
      content.slice(l.from, l.to),
      l.kind === "command" ? "\\" + l.name : l.name,
    );
  }
  const references = f.store
      .exportFiles(p.id)
      .find((e) => e.path.endsWith(".bib"))!,
    bibtext = references.data.toString(),
    key = /@\w+\s*\{\s*([^,\s]+)/.exec(bibtext)![1];
  const citation = await find("citation", key);
  assert.equal(citation.locations[0].path, references.path);
  assert.equal(
    bibtext.slice(citation.locations[0].from, citation.locations[0].to),
    key,
  );
  assert((await find("citation", key, "references")).total > 0);
  assert.equal(state(), before);
  pass(
    "exact cross-file command/environment/citation positions and SHA256 without source/history/receipt changes",
  );
  const overlay = {
    path: "main.tex",
    revision: 0,
    content: source.replaceAll("CurrentValue", "DraftValue"),
  };
  assert.equal(
    (await find("command", "DraftValue", "definitions", overlay)).locations[0]
      .unsaved,
    true,
  );
  assert.equal(
    (await find("command", "CurrentValue", "definitions", overlay)).total,
    0,
  );
  assert.equal((await find("command", "DraftValue")).total, 0);
  assert.equal(state(), before);
  assert.equal(fs.readFileSync(file("main.tex"), "utf8"), source);
  pass(
    "unsaved current-file overlay replaces its saved index only for the request and does not save source",
  );
  async function compile() {
    const job = f.compiler.start(p.id),
      deadline = Date.now() + 60000;
    while (["queued", "running"].includes(job.status)) {
      if (Date.now() > deadline) {
        f.compiler.cancel(job.id);
        throw Error("Synthetic verification compile deadline");
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(job.status, "succeeded", job.log);
    const identity = supervisorIdentity(f.compiler.dir(job.id));
    assert(identity);
    assert.deepEqual(processGroup(identity.pid), []);
    const text = spawnSync("pdftotext", [f.compiler.pdfPath(job.id), "-"], {
      encoding: "utf8",
    });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /A navigable local style/);
    assert.match(text.stdout, /A literal local environment/);
    jobs.push(job.id);
    return text.stdout;
  }
  const first = await compile();
  pass(
    "real multi-file/style/bibliography/image build succeeds and compiler process group drains",
  );
  const compiled = state();
  const installed = (await find("command", "includegraphics")).locations.find(
    (entry) => entry.installed?.buildId === jobs[0],
  );
  assert(installed);
  assert.match(installed.path, /\/graphics\.sty$/);
  const installedView = await request<InstalledDefinitionPreview>(
    base + "/installed-definition", "POST", installed,
  );
  assert.equal(installedView.symbol, "\\includegraphics");
  assert.equal(installedView.line, installed.line);
  assert.match(installedView.before, /\\protected\\def$/);
  assert((await find("environment", "align")).locations.some(
    (entry) => entry.installed?.buildId === jobs[0] && /\/amsmath\.sty$/.test(entry.path),
  ));
  assert.equal(state(), compiled);
  pass("recorded TeX Live packages provide exact graphics command and amsmath environment definitions without source writes");
  const external =
    style +
    "\\newcommand{\\ExternalValue}{Externally added literal command.}\n";
  fs.writeFileSync(file("styles/local.sty"), external);
  assert.equal((await find("command", "ExternalValue")).total, 0);
  const review = await request<any>(base + "/disk?path=styles%2Flocal.sty"),
    inode = fs.statSync(file("styles/local.sty")).ino;
  await request(base + "/disk/resolve", "POST", {
    path: "styles/local.sty",
    token: review.token,
    action: "disk",
  });
  assert.equal(fs.statSync(file("styles/local.sty")).ino, inode);
  const adopted = await find("command", "ExternalValue");
  assert.equal(adopted.total, 1);
  assert.equal(fs.readFileSync(file("styles/local.sty"), "utf8"), external);
  pass(
    "external style remains unindexed until explicit version adoption, then invalidates cached navigation without rewriting bytes",
  );
  assert.equal(await compile(), first);
  await request(base + "/installed-definition", "POST", installed, 409);
  const final = state();
  await find("command", "ProjectValue", "references");
  assert.equal(state(), final);
  const evidence = f.evidence();
  assert.equal(evidence.generations, 0);
  assert.equal(evidence.blocked.length, 0);
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  pass(
    "second real build preserves extracted document text, source navigation remains read-only and AI/outbound counts stay zero",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        project: p.id,
        results,
        jobs,
        evidence,
        definition: defs.locations[0],
        installed,
        citation: citation.locations[0],
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
