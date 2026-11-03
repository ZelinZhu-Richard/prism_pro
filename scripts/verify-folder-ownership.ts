import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip, writeZip } from "../server/files";
import { captureDirectory } from "../server/project-directories";
import { DiskConflict } from "../server/disk-files";
import {
  supervisorIdentity,
  supervisorResult,
  processGroup,
} from "../server/supervision";
const root = path.resolve(
    "data/verification/folder-ownership-real-" + Date.now(),
  ),
  source = path.join(root, "ordinary paper"),
  data = path.join(root, "state"),
  entries = await readZip(offlineArchive(root));
fs.mkdirSync(source, { recursive: true });
for (const e of entries) {
  const file = path.join(source, e.path);
  if (e.directory) fs.mkdirSync(file, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, e.data);
  }
}
fs.writeFileSync(
  path.join(source, "unindexed.txt"),
  "Unindexed ordinary supporting content.\n",
);
fs.writeFileSync(
  path.join(source, ".latexmkrc"),
  `system('touch ${path.join(root, "local-config-ran")}');die 'Must stay inert';\n`,
);
let f = await offlineWorkspace(data);
const checks: { name: string; passed: true }[] = [],
  jobs: string[] = [],
  epochs: ReturnType<typeof f.evidence>[] = [];
const pass = (name: string) => {
  checks.push({ name, passed: true });
  console.log("PASS " + name);
};
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
async function request(
  url: string,
  method = "GET",
  payload?: any,
  status = 200,
) {
  const r = await f.app.inject({
    url: "/api" + url,
    method: method as any,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
  assert.equal(r.statusCode, status, r.body);
  return r;
}
async function restart() {
  epochs.push(f.evidence());
  await f.app.close();
  f.restoreFetch();
  f = await offlineWorkspace(data);
}
function disk(name: string) {
  return path.join(source, name);
}
function bytes() {
  return entries.map((e) => ({
    path: e.path,
    directory: !!e.directory,
    ...(!e.directory
      ? { bytes: fs.readFileSync(disk(e.path)).toString("base64") }
      : {}),
  }));
}
async function compile(id: string) {
  const job = f.compiler.start(id),
    end = Date.now() + 60000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > end) {
      f.compiler.cancel(job.id);
      throw Error("Verification build deadline.");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(job.status, "succeeded", job.log);
  const identity = supervisorIdentity(f.compiler.dir(job.id));
  assert(identity);
  assert.equal(
    supervisorResult(f.compiler.dir(job.id), identity)?.drained,
    true,
  );
  assert.deepEqual(processGroup(identity.pid), []);
  const text = spawnSync("pdftotext", [f.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
  });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Synthetic Author/);
  assert.match(text.stdout, /Equation 1 and Figure 1/);
  const info = spawnSync("pdfinfo", [f.compiler.pdfPath(job.id)], {
    encoding: "utf8",
  });
  assert.equal(info.status, 0);
  assert.match(info.stdout, /Pages:\s+2/);
  jobs.push(job.id);
  return job;
}
try {
  const before = bytes(),
    identity = captureDirectory(source),
    unknown = fs.statSync(disk("unindexed.txt")),
    p = f.store.createLinked(
      "In-place foundation · synthetic",
      identity,
      entries,
    ),
    base = "/projects/" + p.id;
  assert.deepEqual(bytes(), before);
  assert.deepEqual(captureDirectory(source), identity);
  assert.equal(f.store.projectDir(p.id), fs.realpathSync(source));
  assert(!fs.existsSync(path.join(data, "projects", p.id, "files")));
  const apiProject = (await request(base)).json();
  assert.equal(apiProject.storage.available, true);
  assert.equal(apiProject.storage.folder, fs.realpathSync(source));
  pass(
    "metadata-only directory adoption preserves actual source identity/bytes and exposes explicit local-folder metadata",
  );
  const context = f.ai.context({
    projectId: p.id,
    path: "main.tex",
    revision: 0,
    provider: "openai",
    model: "gpt-6.1-sol",
    mode: "review",
    scope: "project",
    from: 0,
    to: 0,
    prompt: "Synthetic context only; do not generate.",
  });
  assert(!context.context.includes(source));
  assert(!context.context.includes("unindexed.txt"));
  assert(!context.context.includes(".latexmkrc"));
  assert.equal(f.evidence().generations, 0);
  pass(
    "retained project-scope AI context uses only indexed relative files without directory binding or hidden/unindexed content;no generation",
  );
  const first = await compile(p.id);
  assert.deepEqual(bytes(), before);
  assert.equal(fs.statSync(disk("unindexed.txt")).ino, unknown.ino);
  pass(
    "real initial2page multi-file/pdfLaTeX/BibTeX/PNG build uses confined snapshots without rewriting ordinary source",
  );
  const main = f.store.readText(p.id, "main.tex"),
    changed = main.content + "\n% Local in-place save 新 👩🏽‍💻 é\n";
  await request(base + "/file?path=main.tex", "PUT", {
    content: changed,
    revision: main.revision,
  });
  assert.equal(fs.readFileSync(disk("main.tex"), "utf8"), changed);
  const badOrigin = await f.app.inject({
    url: "/api" + base + "/file?path=main.tex",
    method: "PUT",
    headers: { ...headers, origin: "https://foreign.invalid" },
    payload: { content: "Unwanted.", revision: 1 },
  });
  assert.equal(badOrigin.statusCode, 403);
  assert.equal(fs.readFileSync(disk("main.tex"), "utf8"), changed);
  pass(
    "explicit save targets the selected ordinary file while existing loopback/origin guards still reject a foreign write",
  );
  const external =
    fs.readFileSync(disk("sections/introduction.tex"), "utf8") +
    "\n% External included-file change 新\n";
  fs.writeFileSync(disk("sections/introduction.tex"), external);
  await restart();
  assert.equal(
    f.store.readText(p.id, "sections/introduction.tex").content,
    external,
  );
  assert.equal(fs.readFileSync(disk("main.tex"), "utf8"), changed);
  assert.equal(
    fs.readFileSync(disk("sections/introduction.tex"), "utf8"),
    external,
  );
  assert.equal(fs.statSync(disk("unindexed.txt")).ino, unknown.ino);
  pass(
    "actual backend close/reopen adopts external included text and retains local saves/unknown supporting file without source-tree replacement",
  );
  const current = f.store.readText(p.id, "main.tex");
  const last = await compile(p.id),
    pdf = await f.app.inject({
      url: "/api/builds/" + last.id + "/pdf",
      headers,
    });
  assert.equal(pdf.statusCode, 200);
  assert(pdf.rawPayload.equals(fs.readFileSync(f.compiler.pdfPath(last.id))));
  const zip = await request(base + "/export"),
    roundtrip = await readZip(zip.rawPayload);
  for (const e of f.store.exportFiles(p.id)) {
    const got = roundtrip.find((x) => x.path === e.path);
    assert(got, e.path);
    assert(got.data.equals(e.data));
  }
  assert(
    !roundtrip.some(
      (e) => e.path === "unindexed.txt" || e.path.startsWith("."),
    ),
  );
  const checkpoint = f.store.checkpoints(p.id)[0];
  assert(
    !JSON.stringify(f.store.snapshot(p.id, checkpoint.id)).includes(source),
  );
  pass(
    "second actual2page build resolves references;immutable PDF and relative source ZIP/history omit local binding and unindexed configuration",
  );
  const moved = source + " moved";
  fs.renameSync(source, moved);
  const count = f.compiler.jobs.size;
  assert.throws(() => f.compiler.start(p.id), DiskConflict);
  assert.equal(f.compiler.jobs.size, count);
  await restart();
  assert.equal(f.store.project(p.id).storage?.available, false);
  assert(!fs.existsSync(source));
  f.store.relocateDirectory(
    p.id,
    f.store.project(p.id).generation,
    captureDirectory(moved),
  );
  f.store.reconcileDisk(p.id);
  assert.equal(f.store.projectDir(p.id), fs.realpathSync(moved));
  assert.equal(f.store.readText(p.id, "main.tex").content, current.content);
  assert(!fs.existsSync(source));
  const replayZip = writeZip(f.store.exportFiles(p.id));
  assert(
    (await readZip(replayZip))
      .find((e) => e.path === "main.tex")!
      .data.equals(Buffer.from(current.content)),
  );
  pass(
    "moved folder refuses compilation before job creation, remains missing at restart and is explicitly relinked only by original identity",
  );
  for (const marker of [
    "imported-script-ran",
    "imported-config-ran",
    "local-config-ran",
  ])
    assert(!fs.existsSync(path.join(root, marker)));
  epochs.push(f.evidence());
  assert(epochs.every((e) => e.blocked.length === 0 && e.generations === 0));
  fs.writeFileSync(
    path.join(root, "result.json"),
    JSON.stringify(
      { checks, jobs, project: p.id, source: moved, data, epochs },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ root, checks: checks.length, jobs }));
} finally {
  await f.app.close();
  f.restoreFetch();
}
