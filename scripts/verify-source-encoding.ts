import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { offlineWorkspace } from "./offline-fixture";
import { readZip, writeZip } from "../server/files";
import { FileBatches } from "../server/file-batches";
import { supervisorIdentity, processGroup } from "../server/supervision";

const root = path.resolve(
    "data/verification/source-encoding-real-" + Date.now(),
  ),
  results: { name: string; passed: boolean }[] = [],
  jobs: string[] = [];
let f = await offlineWorkspace(root);
const evidence: ReturnType<typeof f.evidence>[] = [];
const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
const pass = (name: string) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
async function request(
  url: string,
  method = "GET",
  payload?: unknown,
  expected = 200,
) {
  const response = await f.app.inject({
    method: method as any,
    url: "/api" + url,
    headers,
    ...(payload === undefined ? {} : { payload: payload as any }),
  });
  assert.equal(response.statusCode, expected, response.body);
  return response;
}
async function reopen() {
  evidence.push(f.evidence());
  await f.app.close();
  f.restoreFetch();
  f = await offlineWorkspace(root);
}
try {
  const files = [
      {
        path: "main.tex",
        data: Buffer.from(
          String.raw`\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage[latin1]{inputenc}
\begin{document}
Legacy café root.\input{sections/legacy}
See \cite{local}.
\bibliographystyle{plain}\bibliography{references}
\end{document}
`,
          "latin1",
        ),
      },
      {
        path: "sections/legacy.tex",
        data: Buffer.from("Included café section.\n", "latin1"),
      },
      {
        path: "references.bib",
        data: Buffer.from(
          "@book{local,title={Local café study},author={Writer, A},year={2026},publisher={Local}}\n",
          "latin1",
        ),
      },
    ],
    archive = writeZip(files),
    p = f.store.create(
      "Legacy-byte preservation · synthetic verification",
      await readZip(archive),
    ),
    base = `/projects/${p.id}`,
    original = new Map(files.map((e) => [e.path, e.data])),
    snapshot = () =>
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
    exact = (expected: Map<string, Buffer>, id = p.id) => {
      for (const [name, bytes] of expected) {
        assert.deepEqual(f.store.file(id, name).content, bytes);
        assert.deepEqual(
          fs.readFileSync(path.join(f.store.projectDir(id), name)),
          bytes,
        );
      }
    };
  const before = snapshot();
  await request(base + "/file?path=main.tex", "GET", undefined, 415);
  await request(
    base + "/file?path=main.tex",
    "PUT",
    { revision: 0, content: files[0].data.toString("latin1") },
    415,
  );
  await request(
    base + "/file?path=new.tex",
    "POST",
    { content: "Broken \ud800" },
    400,
  );
  const raw = await request(base + "/raw?path=main.tex");
  assert.deepEqual(raw.rawPayload, original.get("main.tex"));
  for (const e of await readZip(writeZip(f.store.exportFiles(p.id))))
    assert.deepEqual(e.data, original.get(e.path));
  assert.equal(snapshot(), before);
  exact(original);
  pass(
    "legacy ZIP import, rejected text read/save and invalid new input leave exact bytes, metadata, source ZIP and raw downloads unchanged",
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
    assert.match(text.stdout, /Legacy café root/);
    assert.match(text.stdout, /Included café section/);
    assert.match(text.stdout, /Local café study/);
    jobs.push(job.id);
    return text.stdout;
  }
  const first = await compile();
  exact(original);
  pass(
    "actual Latin-1 root/include/BibTeX project compiles from original bytes with a drained process group",
  );
  const copy = f.store.copy(p.id, {
    name: "Independent legacy-byte copy",
    generation: f.store.project(p.id).generation,
    requestId: randomUUID(),
  });
  exact(original, copy.id);
  pass("project copy preserves all legacy bytes and independent source state");
  const converted = new Map(
      files.map((e) => [
        e.path,
        Buffer.from(e.data.toString("latin1").replace("[latin1]", "[utf8]")),
      ]),
    ),
    batches = new FileBatches(f.store),
    pending = snapshot(),
    review = batches.uploadPreview(p.id, {
      destination: "",
      entries: [...converted].map(([name, data]) => ({
        path: name,
        size: data.length,
      })),
    });
  assert(review.entries.every((e) => e.status === "replace"));
  assert.equal(snapshot(), pending);
  const applied = batches.upload(
    p.id,
    {
      token: review.token,
      indices: review.entries.map((e) => e.index),
      requestId: randomUUID(),
    },
    new Map(review.entries.map((e) => [e.index, converted.get(e.path)!])),
  );
  exact(converted);
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    converted.get("main.tex")!.toString(),
  );
  assert.equal(await compile(), first);
  pass(
    "explicit reviewed UTF-8 replacement enables exact editable source and preserves extracted PDF text",
  );
  await reopen();
  exact(converted);
  exact(original, copy.id);
  assert.equal(
    f.store.readText(p.id, "main.tex").content,
    converted.get("main.tex")!.toString(),
  );
  assert.throws(
    () => f.store.readText(copy.id, "main.tex"),
    (e: any) => e.statusCode === 415,
  );
  pass(
    "backend reopen preserves converted source and original legacy copy without decoding or rewriting either",
  );
  new FileBatches(f.store).undo(p.id, applied.operationId);
  exact(original);
  assert.throws(
    () => f.store.readText(p.id, "main.tex"),
    (e: any) => e.statusCode === 415,
  );
  const histories = f.store.checkpoints(p.id).flatMap((c) =>
    f.store
      .exportCheckpoint(p.id, c.id)
      .filter((e) => e.path === "main.tex")
      .map((e) => e.data),
  );
  assert(histories.some((b) => b.equals(original.get("main.tex")!)));
  assert(histories.some((b) => b.equals(converted.get("main.tex")!)));
  pass(
    "one persistent upload Undo restores exact original bytes with both encodings retained in history",
  );
  assert.equal(await compile(), first);
  exact(original);
  evidence.push(f.evidence());
  for (const e of evidence) {
    assert.equal(e.generations, 0);
    assert.equal(e.blocked.length, 0);
  }
  assert.deepEqual(f.store.runs(p.id), []);
  assert.deepEqual(f.store.conversations(p.id), []);
  pass(
    "restored legacy source compiles again with equivalent PDF text, drained compiler and zero AI/outbound attempts",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        project: p.id,
        copy: copy.id,
        results,
        jobs,
        evidence,
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
