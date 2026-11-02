import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { offlineWorkspace, offlineArchive } from "./offline-fixture";
import { readZip } from "../server/files";
import { defaultSearch } from "../shared/search";
import { supervisorIdentity, processGroup } from "../server/supervision";
const root = path.resolve("data/verification/offline-real-" + Date.now()),
  f = await offlineWorkspace(root),
  results: { name: string; passed: boolean }[] = [];
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
const pass = (name: string) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
async function request(
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: any,
) {
  const r = await f.app.inject({
    method,
    url: "/api" + url,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
async function compile(id: string) {
  const created = await request("POST", `/projects/${id}/compile`, {}),
    job = f.compiler.jobs.get(created.id)!,
    deadline = Date.now() + 30000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > deadline) {
      f.compiler.cancel(job.id);
      throw Error("Offline verification deadline");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  const identity = supervisorIdentity(f.compiler.dir(job.id));
  assert.ok(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  return job;
}
try {
  const archive = offlineArchive(root),
    boundary = "leaf-offline-boundary";
  fs.writeFileSync(path.join(root, "synthetic-project.zip"), archive);
  const imported = await f.app.inject({
    method: "POST",
    url: "/api/import",
    headers: {
      ...headers,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="offline-paper.zip"\r\nContent-Type: application/zip\r\n\r\n`,
      ),
      archive,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(imported.statusCode, 200, imported.body);
  const p = imported.json(),
    base = `/projects/${p.id}`;
  assert.equal(p.root, "main.tex");
  assert.equal(p.files.length, 7);
  assert.ok(p.skippedEntries.some((v: any) => v.path.endsWith(".latexmkrc")));
  pass(
    "ordinary ZIP import keeps nested source, binary figure, empty folder and inert script; skips compiler configuration",
  );
  const settings = await request("GET", "/settings");
  assert.ok(Object.values(settings.providers).every((s: any) => !s.configured));
  const file = await request(
      "GET",
      base + "/file?path=sections%2Fintroduction.tex",
    ),
    updated = file.content.replace("Offline writing", "Offline edited writing");
  await request("PUT", base + "/file?path=sections%2Fintroduction.tex", {
    content: updated,
    revision: file.revision,
  });
  assert.equal(
    (await request("GET", base + "/file?path=sections%2Fintroduction.tex"))
      .content,
    updated,
  );
  pass(
    "source edit and save need no account, key, CLI login or external request",
  );
  const job = await compile(p.id);
  assert.equal(job.status, "succeeded", job.log);
  const text = spawnSync("pdftotext", [f.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
  });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Offline edited writing/);
  assert.match(text.stdout, /Local Verification/);
  assert.match(text.stdout, /Results/);
  const pdf = await f.app.inject({ url: `/api/builds/${job.id}/pdf`, headers });
  assert.equal(pdf.statusCode, 200);
  assert.ok(pdf.rawPayload.subarray(0, 5).equals(Buffer.from("%PDF-")));
  fs.writeFileSync(path.join(root, "compiled.pdf"), pdf.rawPayload);
  pass(
    "real multi-file LaTeX/BibTeX/PNG/math PDF compiles and downloads with no external fetch",
  );
  const point = await request("POST", `/builds/${job.id}/sync`, {
      direction: "forward",
      path: "sections/results.tex",
      line: 2,
    }),
    inverse = await request("POST", `/builds/${job.id}/sync`, {
      direction: "inverse",
      page: point.page,
      x: point.x,
      y: point.y,
    });
  assert.equal(inverse.path, "sections/results.tex");
  assert.ok(point.page >= 2);
  const index = await request("GET", base + "/intelligence");
  assert.ok(index.citations.some((c: any) => c.key === "local2026"));
  assert.ok(index.labels.some((l: any) => l.key === "sec:results"));
  const count = await request("POST", base + "/word-count", {});
  assert.ok(count.text > 20);
  const search = await request("POST", base + "/search", {
    ...defaultSearch,
    query: "Offline edited",
  });
  assert.ok(
    search.files.some((v: any) => v.path === "sections/introduction.tex"),
  );
  for (const language of ["en-US", "en-GB"])
    for (const part of ["aff", "dic"]) {
      const d = await f.app.inject({
        url: `/api/writing/dictionary/${language}/${part}`,
        headers,
      });
      assert.equal(d.statusCode, 200);
      assert.ok(d.body.length > 1000);
    }
  pass(
    "included-file SyncTeX, bibliography/labels, project search, word count and both local dictionaries work offline",
  );
  const before = f.store.readText(p.id, "sections/results.tex");
  await request("PUT", base + "/file?path=sections%2Fresults.tex", {
    content: before.content + "\n\\UndefinedOfflineCheck\n",
    revision: before.revision,
  });
  const failed = await compile(p.id);
  assert.equal(failed.status, "failed");
  assert.ok(
    failed.diagnostics.some(
      (d) =>
        d.severity === "error" && d.path === "sections/results.tex" && d.line,
    ),
  );
  assert.equal(f.compiler.latestPdf(p.id)?.id, job.id);
  await request("PUT", base + "/file?path=sections%2Fresults.tex", {
    content: before.content,
    revision: before.revision + 1,
  });
  const fixed = await compile(p.id);
  assert.equal(fixed.status, "succeeded", fixed.log);
  pass(
    "local file/line error retains last successful PDF and manual correction compiles without AI",
  );
  const exported = await f.app.inject({
    url: "/api" + base + "/export",
    headers,
  });
  assert.equal(exported.statusCode, 200);
  const round = await readZip(exported.rawPayload),
    current = f.store.exportFiles(p.id),
    signature = (files: typeof current) =>
      files
        .map((v) => [
          v.path,
          !!v.directory,
          createHash("sha256").update(v.data).digest("hex"),
        ])
        .sort();
  assert.deepEqual(signature(round), signature(current));
  fs.writeFileSync(path.join(root, "source-export.zip"), exported.rawPayload);
  assert.equal(fs.existsSync(path.join(root, "imported-script-ran")), false);
  assert.equal(fs.existsSync(path.join(root, "imported-config-ran")), false);
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  assert.deepEqual(f.evidence().blocked, []);
  assert.equal(f.evidence().generations, 0);
  pass(
    "source ZIP round-trip is exact; imported scripts/config stay inert; no AI or outbound backend request",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        results,
        project: p.id,
        jobs: [job.id, failed.id, fixed.id],
        wordCount: count,
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
