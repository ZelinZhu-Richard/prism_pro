import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { offlineWorkspace } from "./offline-fixture";
import { PERSONAL_TEX_DIR } from "../server/personal-tex";
import { processGroup, supervisorIdentity } from "../server/supervision";
import type { DiskStatus } from "../shared/disk-status";
import type { TexPackageSearch } from "../shared/tex-packages";
import type {
  InstalledDefinitionPreview,
  SourceNavigationResult,
} from "../shared/source-navigation";
import type { CompileJob } from "../shared/types";

const root = path.resolve("data/verification/personal-tex-" + randomUUID());
const tree = path.join(root, "Personal tree");
const packagePath = "tex/latex/Personal examples/leafprobe-local.sty";
const packageFile = path.join(tree, packagePath);
const bibFile = path.join(tree, "bibtex/bib/leaf/leafpersonal.bib");
const firstText = "First package snapshot";
const secondText = "Later package snapshot";
const style = (text: string) =>
  `\\ProvidesPackage{leafprobe-local}\n\\newcommand{\\LeafProbe}{${text}}\n`;
fs.mkdirSync(path.dirname(packageFile), { recursive: true });
fs.mkdirSync(path.dirname(bibFile), { recursive: true });
fs.writeFileSync(packageFile, style(firstText));
fs.writeFileSync(
  bibFile,
  "@book{personal2026,author={A. Local},title={Personal Bibliography},publisher={Leaf},year={2026}}\n",
);
fs.writeFileSync(
  path.join(tree, "ls-R"),
  "This index should never be needed.\n",
);
fs.mkdirSync(path.join(tree, "web2c"));
fs.writeFileSync(path.join(tree, "web2c/texmf.cnf"), "shell_escape = t\n");
const outside = path.join(root, "outside.sty");
fs.writeFileSync(outside, "This file is outside the tree.\n");
fs.symlinkSync(outside, path.join(tree, "tex/escaping.sty"));

const instance = await offlineWorkspace(
  path.join(root, "state"),
  undefined,
  tree,
);
const { app, store, compiler } = instance;
const main = String.raw`\documentclass{article}
\usepackage{leafprobe-local}
\begin{document}
\LeafProbe\ cites a personal reference~\cite{personal2026}.
\bibliographystyle{plain}
\bibliography{leafpersonal}
\end{document}
`;
const project = store.create("Personal TeX fixture", [
  { path: "main.tex", data: Buffer.from(main) },
]);
const base = `/api/projects/${project.id}`;
const checks: string[] = [],
  jobs: string[] = [];
function pass(check: string) {
  checks.push(check);
  console.log("PASS", check);
}
async function request<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  payload?: object,
  expected = 200,
): Promise<T> {
  const result = await app.inject({
    method,
    url: endpoint,
    payload,
    headers: {
      host: "127.0.0.1:5173",
      "x-prism-request": "1",
    },
  });
  assert.equal(result.statusCode, expected, result.body);
  return result.json<T>();
}
const disk = () => request<DiskStatus>(base + "/disk/status");
const find = () =>
  request<SourceNavigationResult>(base + "/source-locations", "POST", {
    kind: "command",
    name: "LeafProbe",
    mode: "definitions",
  });
async function finished(job: CompileJob, text: string) {
  const deadline = Date.now() + 30000;
  while (["queued", "running"].includes(job.status)) {
    assert(Date.now() < deadline, "Personal TeX build timed out");
    await delay(35);
  }
  assert.equal(job.status, "succeeded", job.log);
  jobs.push(job.id);
  const pdf = compiler.pdfPath(job.id);
  const output = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8" });
  assert.equal(output.status, 0, output.stderr);
  assert(output.stdout.includes(text));
  assert(output.stdout.includes("Personal Bibliography"));
  const identity = supervisorIdentity(compiler.dir(job.id));
  assert(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  return fs.readFileSync(pdf);
}

try {
  const names = await request<TexPackageSearch>(
    base + "/packages?q=leafprobe&refresh=1",
  );
  assert.deepEqual(
    names.packages.map((p) => [p.name, p.origin]),
    [["leafprobe-local", "personal"]],
  );
  assert.equal(names.personalTex?.kind, "ready");
  assert(!JSON.stringify(names.packages).includes(tree));
  assert.equal(
    (await request<TexPackageSearch>(base + "/packages?q=escaping")).total,
    0,
  );
  pass(
    "Personal package discovery works without a filename database and excludes links",
  );

  const first = compiler.start(project.id);
  fs.writeFileSync(packageFile, style(secondText));
  const oldPdf = await finished(first, firstText);
  const firstSnapshot = path.join(compiler.dir(first.id), PERSONAL_TEX_DIR);
  assert.equal(
    fs.readFileSync(path.join(firstSnapshot, packagePath), "utf8"),
    style(firstText),
  );
  assert(!fs.existsSync(path.join(firstSnapshot, "web2c")));
  assert(!fs.existsSync(path.join(firstSnapshot, "ls-R")));
  assert(!fs.existsSync(path.join(firstSnapshot, "tex/escaping.sty")));
  const profile = path.join(compiler.dir(first.id), "compiler.sb");
  const inside = path.join(firstSnapshot, packagePath);
  const confined = (...command: string[]) =>
    spawnSync("/usr/bin/sandbox-exec", ["-f", profile, ...command], {
      encoding: "utf8",
      timeout: 2000,
    });
  const snapshotRead = confined("/bin/cat", inside);
  assert.equal(snapshotRead.status, 0, snapshotRead.stderr);
  assert.equal(snapshotRead.stdout, style(firstText));
  const liveRead = confined("/bin/cat", packageFile);
  assert.notEqual(liveRead.status, 0);
  assert.match(liveRead.stderr, /Operation not permitted|Permission denied/);
  const snapshotWrite = confined(
    "/bin/sh",
    "-c",
    'printf changed > "$1"',
    "sh",
    inside,
  );
  assert.notEqual(snapshotWrite.status, 0);
  assert.equal(fs.readFileSync(inside, "utf8"), style(firstText));
  pass(
    "The actual compiler profile reads the snapshot and refuses access to the live tree and snapshot writes",
  );
  const oldDefinition = (await find()).locations.find(
    (location) => location.installed?.origin === "personal",
  );
  assert(oldDefinition);
  const excerpt = await request<InstalledDefinitionPreview>(
    base + "/installed-definition",
    "POST",
    oldDefinition,
  );
  assert.equal(excerpt.origin, "personal");
  assert.match(excerpt.after, new RegExp(firstText));
  assert(!excerpt.after.includes(secondText));
  await request(base + "/packages?q=leafprobe&refresh=1");
  const observed = (await disk()).personalTex;
  assert(observed?.kind === "ready");
  assert.notEqual(observed.signature, first.personalTex?.signature);
  pass(
    "A real build and its definition excerpt use captured package bytes after the live tree changes",
  );

  const second = compiler.start(project.id);
  await finished(second, secondText);
  assert.notEqual(
    second.personalTex?.fingerprint,
    first.personalTex?.fingerprint,
  );
  assert.equal(second.incrementalFrom, undefined);
  assert.deepEqual(fs.readFileSync(compiler.pdfPath(first.id)), oldPdf);
  await request(base + "/installed-definition", "POST", oldDefinition, 409);
  const third = compiler.start(project.id);
  await finished(third, secondText);
  assert.equal(third.incrementalFrom, second.id);
  pass(
    "Same-size package edits force a clean dependency state and unchanged bytes allow reuse",
  );

  const original = tree + " original";
  fs.renameSync(tree, original);
  fs.mkdirSync(tree);
  const count = compiler.jobs.size;
  await request(base + "/compile", "POST", {}, 409);
  assert.equal(compiler.jobs.size, count);
  assert.equal(compiler.latestPdf(project.id)?.id, third.id);
  assert.equal((await disk()).personalTex?.kind, "unavailable");
  fs.rmdirSync(tree);
  fs.renameSync(original, tree);
  assert.equal((await disk()).personalTex?.kind, "ready");
  assert.equal(fs.readFileSync(packageFile, "utf8"), style(secondText));
  assert.equal(store.readText(project.id, "main.tex").content, main);
  assert.equal(store.exportFiles(project.id).length, 1);
  pass(
    "Replacement trees fail before build creation and the previous PDF and project export stay intact",
  );

  if (process.argv.includes("--browser")) {
    await app.listen({ host: "127.0.0.1", port: 5173 });
    console.log(
      "Browser preview:",
      `http://127.0.0.1:5173/?project=${project.id}`,
    );
    console.log("Fixture directory:", root);
    console.log("Press Enter to close the verifier and save its report.");
    await new Promise<void>((resolve) =>
      process.stdin.once("data", () => {
        process.stdin.pause();
        resolve();
      }),
    );
  }
  const evidence = instance.evidence();
  assert.deepEqual(evidence.blocked, []);
  assert.equal(evidence.generations, 0);
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ checks, jobs, evidence }, null, 2),
  );
  console.log("Report:", path.join(root, "report.json"));
} finally {
  await app.close();
  instance.restoreFetch();
}
