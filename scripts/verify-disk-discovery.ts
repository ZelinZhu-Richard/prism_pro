import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";
import type { DiskDiscoveryView } from "../shared/disk-discovery";
const root = path.resolve(
  "data/verification/disk-discovery-real-" + Date.now(),
);
let f = await offlineWorkspace(root);
const results: string[] = [],
  builds: string[] = [];
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
const pass = (name: string) => {
  results.push(name);
  console.log("PASS " + name);
};
const exact = (files: { path: string; data: Buffer; directory?: boolean }[]) =>
  files.map((e) => [e.path, e.data.toString("base64"), !!e.directory]);
async function compile(project: string, expected: RegExp) {
  const job = f.compiler.start(project),
    deadline = Date.now() + 40000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > deadline) {
      f.compiler.cancel(job.id);
      throw Error("Verification compile deadline");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(job.status, "succeeded", job.log);
  const owner = supervisorIdentity(f.compiler.dir(job.id));
  assert.ok(owner);
  assert.deepEqual(processGroup(owner.pid), []);
  const text = spawnSync("pdftotext", [f.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: root },
  });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, expected);
  builds.push(job.id);
  return job;
}
try {
  const entries = await readZip(offlineArchive(root)),
    p = f.store.create("Reviewed ordinary disk files", entries),
    initial = f.store.checkpoints(p.id)[0],
    initialFiles = f.store.exportFiles(p.id),
    folder = f.store.projectDir(p.id);
  const additions = [
    {
      path: "sections/disk-added.tex",
      data: Buffer.from(String.raw`\section{A reviewed disk addition}\label{sec:added}
Reviewed source, references~\cite{added2026} and figures become part of the real project.
Café and $a^2+b^2$ remain ordinary LaTeX.
\begin{figure}[h]\centering\includegraphics[width=2cm]{disk-assets/added.png}\caption{A reviewed synthetic asset.}\end{figure}
% Source notes: 新文本 👩🏽‍💻 é
`),
    },
    {
      path: "disk-assets/added.png",
      data: entries.find((e) => e.path === "figures/local.png")!.data,
    },
    {
      path: "added-references.bib",
      data: Buffer.from(
        "@book{added2026,author={Synthetic Author},title={A Reviewed Reference},year={2026},publisher={Local Press}}\n",
      ),
    },
    {
      path: "tools/local.sh",
      data: Buffer.from(
        "#!/bin/sh\ntouch " + path.join(root, "script-must-not-run") + "\n",
      ),
    },
    { path: "empty-from-disk", data: Buffer.alloc(0), directory: true },
    {
      path: "notes/pending.tex",
      data: Buffer.from("% An unselected source stays on disk.\n"),
    },
  ];
  for (const entry of additions) {
    const target = path.join(folder, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.directory) fs.mkdirSync(target);
    else fs.writeFileSync(target, entry.data);
  }
  fs.writeFileSync(
    path.join(folder, ".latexmkrc"),
    "system('touch " +
      path.join(root, "config-must-not-run") +
      "'); die 'ignored';\n",
  );
  const staging = "main.tex." + randomUUID() + ".prism-tmp";
  fs.writeFileSync(
    path.join(folder, staging),
    "Unfinished staging bytes remain untouched.",
  );
  const original = f.store.readText(p.id, "main.tex"),
    main = original.content
      .replace(
        "\\bibliography{references}",
        "\\bibliography{references,added-references}",
      )
      .replace(
        "\\input{sections/results}",
        "\\input{sections/results}\n\\input{sections/disk-added}",
      );
  f.store.save(p.id, "main.tex", main, original.revision);
  const before = JSON.stringify({
    project: f.store.project(p.id),
    history: f.store.checkpoints(p.id),
    files: exact(f.store.exportFiles(p.id)),
  });
  const response = await f.app.inject({
    url: `/api/projects/${p.id}/disk/discovery`,
    headers,
  });
  assert.equal(response.statusCode, 200, response.body);
  const view = response.json<DiskDiscoveryView>();
  assert.equal(view.added.length, 6);
  assert.ok(view.skipped.some((e) => e.path === staging));
  assert.equal(
    JSON.stringify({
      project: f.store.project(p.id),
      history: f.store.checkpoints(p.id),
      files: exact(f.store.exportFiles(p.id)),
    }),
    before,
  );
  pass(
    "read-only discovery captures six new entries and leaves configs, staging bytes, source and history untouched",
  );
  const selected = additions.filter((e) => e.path !== "notes/pending.tex"),
    stats = selected.map((e) => ({
      path: e.path,
      stat: fs.statSync(path.join(folder, e.path)),
    })),
    request = {
      requestId: randomUUID(),
      token: view.token,
      paths: selected.map((e) => e.path),
    };
  const applied = await f.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/disk/discovery`,
    headers,
    payload: request,
  });
  assert.equal(applied.statusCode, 200, applied.body);
  for (const entry of selected) {
    const stored = f.store
      .exportFiles(p.id)
      .find((e) => e.path === entry.path)!;
    assert.ok(stored.data.equals(entry.data));
    const physical = fs.statSync(path.join(folder, entry.path)),
      old = stats.find((s) => s.path === entry.path)!.stat;
    assert.equal(physical.ino, old.ino);
    assert.equal(physical.mtimeMs, old.mtimeMs);
  }
  assert.equal(f.store.readText(p.id, "main.tex").content, main);
  assert.ok(
    !f.store.project(p.id).files.some((e) => e.path === "notes/pending.tex"),
  );
  pass(
    "selected nested text, bibliography, binary, script and empty folder are indexed without physical writes or implicit adoption",
  );
  const imported = f.store
      .checkpoints(p.id)
      .find((c) => c.name === "Imported disk files")!,
    importedFiles = f.store.exportFiles(p.id);
  const job = await compile(p.id, /A reviewed disk addition/);
  const pdf = await f.app.inject({ url: `/api/builds/${job.id}/pdf`, headers });
  assert.equal(pdf.statusCode, 200);
  assert.ok(pdf.rawPayload.equals(fs.readFileSync(f.compiler.pdfPath(job.id))));
  const forward = f.compiler.sync(job.id, {
    direction: "forward",
    path: "sections/disk-added.tex",
    line: 2,
  });
  assert.ok(forward.page && forward.page > 0);
  const inverse = f.compiler.sync(job.id, {
    direction: "inverse",
    page: forward.page,
    x: forward.x,
    y: forward.y,
  });
  assert.equal(inverse.path, "sections/disk-added.tex");
  pass(
    "real multi-file LaTeX/BibTeX/PNG/Unicode source compiles, exact PDF exports and newly indexed included-file SyncTeX works both ways",
  );
  const zip = await f.app.inject({
    url: `/api/projects/${p.id}/export`,
    headers,
  });
  assert.equal(zip.statusCode, 200);
  assert.deepEqual(exact(await readZip(zip.rawPayload)), exact(importedFiles));
  assert.ok(
    !f.store
      .exportFiles(p.id)
      .some((e) => e.path === staging || e.path === ".latexmkrc"),
  );
  fs.writeFileSync(path.join(root, "reviewed-source.zip"), zip.rawPayload);
  pass(
    "source ZIP round-trips exact indexed bytes and empty folders while unselected/config/staging files stay out",
  );
  const stale = f.diskDiscovery.scan(p.id),
    stable = JSON.stringify({
      project: f.store.project(p.id),
      files: exact(f.store.exportFiles(p.id)),
      history: f.store.checkpoints(p.id),
    });
  fs.appendFileSync(
    path.join(folder, "notes/pending.tex"),
    "% Changed after scan.\n",
  );
  const rejected = await f.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/disk/discovery`,
    headers,
    payload: {
      requestId: randomUUID(),
      token: stale.token,
      paths: ["notes/pending.tex"],
    },
  });
  assert.equal(rejected.statusCode, 409);
  assert.equal(
    JSON.stringify({
      project: f.store.project(p.id),
      files: exact(f.store.exportFiles(p.id)),
      history: f.store.checkpoints(p.id),
    }),
    stable,
  );
  pass(
    "a stale physical review rejects atomically and keeps the unindexed external version",
  );
  fs.writeFileSync(
    path.join(folder, "notes/restart.tex"),
    "% Never silently imported on restart.\n",
  );
  const beforeRestart = {
    files: exact(f.store.exportFiles(p.id)),
    history: f.store.checkpoints(p.id),
    project: f.store.project(p.id),
  };
  await f.app.close();
  f.restoreFetch();
  f = await offlineWorkspace(root);
  assert.deepEqual(exact(f.store.exportFiles(p.id)), beforeRestart.files);
  assert.deepEqual(f.store.checkpoints(p.id), beforeRestart.history);
  assert.deepEqual(f.store.project(p.id), beforeRestart.project);
  assert.ok(
    !f.store.project(p.id).files.some((e) => e.path === "notes/restart.tex"),
  );
  const replay = f.diskDiscovery.apply(p.id, request);
  assert.equal(replay.replayed, true);
  assert.deepEqual(exact(f.store.exportFiles(p.id)), beforeRestart.files);
  assert.deepEqual(f.store.checkpoints(p.id), beforeRestart.history);
  pass(
    "backend reopen retains exact source/history and the durable receipt; replay adds nothing and unindexed files remain unindexed",
  );
  f.store.restoreCheckpoint(p.id, initial.id);
  assert.deepEqual(exact(f.store.exportFiles(p.id)), exact(initialFiles));
  await compile(p.id, /Writing without a connection/);
  assert.ok(fs.existsSync(path.join(folder, "notes/pending.tex")));
  assert.ok(fs.existsSync(path.join(folder, staging)));
  f.store.restoreCheckpoint(p.id, imported.id);
  assert.deepEqual(exact(f.store.exportFiles(p.id)), exact(importedFiles));
  await compile(p.id, /A reviewed disk addition/);
  pass(
    "before/after project history restores exact source and real PDFs while unrelated unindexed and staging files survive",
  );
  assert.equal(fs.existsSync(path.join(root, "script-must-not-run")), false);
  assert.equal(fs.existsSync(path.join(root, "config-must-not-run")), false);
  assert.equal(f.evidence().generations, 0);
  assert.deepEqual(f.evidence().blocked, []);
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  pass(
    "imported scripts and configs stay inert, with no AI generation or outbound backend fetch",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        project: p.id,
        results,
        builds,
        requestId: request.requestId,
        checkpoints: { initial: initial.id, imported: imported.id },
        synctex: { forward, inverse },
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
