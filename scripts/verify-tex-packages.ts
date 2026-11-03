import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";
import type { TexPackageSearch } from "../shared/tex-packages";

const root = path.resolve("data/verification/tex-packages-real-" + Date.now()),
  f = await offlineWorkspace(root),
  results: { name: string; passed: boolean }[] = [];
function pass(name: string) {
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
try {
  const p = f.store.create(
      "Installed package metadata · synthetic verification",
      await readZip(offlineArchive(root)),
    ),
    state = () =>
      JSON.stringify({
        project: f.store.project(p.id),
        files: f.store.exportFiles(p.id),
        history: f.store.checkpoints(p.id),
        settings: f.compiler.settings(p.id),
      }),
    before = state(),
    snapshots: unknown[] = [];
  async function query(q: string, refresh = false) {
    const start = performance.now(),
      response = await f.app.inject({
        url: `/api/projects/${p.id}/packages?q=${encodeURIComponent(q)}${refresh ? "&refresh=1" : ""}`,
        headers,
      });
    assert.equal(response.statusCode, 200, response.body);
    const result = response.json<TexPackageSearch>();
    snapshots.push({ query: q, ms: performance.now() - start, result });
    return result;
  }
  const geometry = await query("geometry", true);
  assert.equal(geometry.status, "ready");
  assert(
    geometry.packages.some((p) => p.name === "geometry" && p.format === "sty"),
  );
  const article = await query("article");
  assert(
    article.packages.some((p) => p.name === "article" && p.format === "cls"),
  );
  const graphics = await query("graphicx");
  assert(graphics.packages.some((p) => p.name === "graphicx"));
  const all = await query("");
  assert(all.total > 200);
  assert.equal(all.packages.length, 200);
  assert(all.limited);
  assert.equal(state(), before);
  pass(
    "selected real TeX distribution provides geometry/graphicx/article metadata, bounded search and exact untouched project state",
  );
  f.store.projectLocks.set(p.id, "synthetic-read-only-metadata");
  const locked = await query("hyperref");
  assert(locked.packages.some((p) => p.name === "hyperref"));
  assert.equal(state(), before);
  f.store.projectLocks.delete(p.id);
  const pinned = f.compiler.runtimes
    .catalog()
    .runtimes.find(
      (r) => r.id !== "system" && r.binDir === geometry.runtime.binDir,
    )!;
  assert(pinned);
  const settings = f.compiler.settings(p.id);
  f.compiler.configure(p.id, { ...settings, runtimeId: pinned.id });
  const chosen = state();
  const pin = await query("geometry");
  assert.equal(pin.runtime.id, pinned.id);
  assert.equal(state(), chosen);
  pass(
    "read-only ownership and pinned runtime identity remain explicit without project/history writes or fallback",
  );
  const job = f.compiler.start(p.id),
    deadline = Date.now() + 60000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > deadline) {
      f.compiler.cancel(job.id);
      throw Error("Verification compile deadline");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(job.status, "succeeded", job.log);
  assert.equal(job.runtime?.id, pinned.id);
  const identity = supervisorIdentity(f.compiler.dir(job.id));
  assert(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  const text = spawnSync("pdftotext", [f.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
  });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Local Verification/);
  assert.match(text.stdout, /Equation 1 and Figure 1/);
  assert(!fs.existsSync(path.join(root, "imported-config-ran")));
  assert(!fs.existsSync(path.join(root, "imported-script-ran")));
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  const evidence = f.evidence();
  assert.equal(evidence.generations, 0);
  assert.deepEqual(evidence.blocked, []);
  pass(
    "real pinned multipass bibliography/image build succeeds, process group drains and script/config/AI/outbound counters remain clean",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        project: p.id,
        build: job.id,
        results,
        snapshots,
        evidence,
      },
      null,
      2,
    ),
  );
  console.log("Evidence: " + root);
} finally {
  f.store.projectLocks.clear();
  await f.app.close();
  f.restoreFetch();
}
