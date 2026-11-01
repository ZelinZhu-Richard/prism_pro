import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { FileBatches } from "../server/file-batches";
import { readZip, writeZip } from "../server/files";
import {syntheticPng} from './verify-source-tools';
export async function verifyFileBatches() {
  const root = path.resolve("data/verification/file-batches-" + Date.now()),
    store = new Store(root),
    compiler = new Compiler(store),
    batches = new FileBatches(store);
  const files = [
    {
      path: "main.tex",
      data: Buffer.from(String.raw`\documentclass{article}
\usepackage{fontspec,graphicx}
\begin{document}
Original sentence.
\input{sections/body}
\includegraphics[width=1cm]{figures/pixel.png}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`),
    },
    {
      path: "sections/body.tex",
      data: Buffer.from("A synthetic section. Reference~\\cite{sample}.\n"),
    },
    {
      path: "figures/pixel.png",
      data: syntheticPng(),
    },
    {
      path: "refs.bib",
      data: Buffer.from(
        "@article{sample,title={Synthetic reference},author={Example, A.},journal={Local Tests},year={2026}}\n",
      ),
    },
    { path: "empty", directory: true, data: Buffer.alloc(0) },
    {
      path: "notes.tex",
      data: Buffer.from("% A synthetic note for read-only browsing.\n"),
    },
  ];
  try {
    const p = store.create("File organization · synthetic", files);
    store.update(p.id, { engine: "xelatex" });
    store.automaticCheckpoint(p.id);
    const jobs: string[] = [];
    async function compile() {
      const job = compiler.start(p.id);
      while (compiler.processes.has(job.id))
        await new Promise((r) => setTimeout(r, 100));
      assert.equal(job.status, "succeeded", job.log.slice(-4000));
      jobs.push(job.id);
      return job;
    }
    await compile();
    const replacement = Buffer.from(
        "An uploaded café section. Reference~\\cite{sample}.\n",
      ),
      review = batches.uploadPreview(p.id, {
        destination: "sections",
        entries: [
          { path: "body.tex", size: replacement.length },
          { path: "extra.txt", size: 5 },
        ],
      }),
      upload = batches.upload(
        p.id,
        { token: review.token, indices: [0, 1], requestId: randomUUID() },
        new Map([
          [0, replacement],
          [1, Buffer.from("Extra")],
        ]),
      );
    await compile();
    batches.undo(p.id, upload.operationId);
    await compile();
    const trash = batches.state(p.id, "trash", {
      paths: ["sections", "figures", "empty"],
      generation: store.project(p.id).generation,
      requestId: randomUUID(),
    });
    assert.ok(trash.changedFiles.includes("sections/body.tex"));
    batches.state(p.id, "restore", {
      paths: ["sections/body.tex", "figures", "empty"],
      generation: store.project(p.id).generation,
      requestId: randomUUID(),
    });
    await compile();
    for (const file of files)
      assert.deepEqual(store.file(p.id, file.path).content, file.data);
    const zip = await readZip(
      batches.download(
        p.id,
        ["sections", "figures", "refs.bib"],
        store.project(p.id).generation,
      ),
    );
    for (const file of zip)
      assert.deepEqual(file.data, store.file(p.id, file.path).content);
    const round = await readZip(writeZip(store.exportFiles(p.id)));
    assert.equal(round.length, files.length);
    const input = path.join(root, "upload-input");
    fs.mkdirSync(path.join(input, "upload-package", "nested"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(input, "body.tex"),
      "A reviewed replacement section. Reference~\\cite{sample}.\n",
    );
    fs.writeFileSync(path.join(input, "new-note.tex"), "New source file.\n");
    fs.writeFileSync(
      path.join(input, "upload-package", "nested", "研究.txt"),
      "Nested café 👩🏽‍🔬\r\n",
    );
    fs.writeFileSync(
      path.join(input, "upload-package", "nested", "data.bin"),
      Buffer.from([0, 1, 2, 255]),
    );
    fs.writeFileSync(
      path.join(input, "upload-package", ".env"),
      "SYNTHETIC_METADATA=not-a-key\n",
    );
    const report = {
      root,
      project: p.id,
      jobs,
      input,
      before: {
        project: store.project(p.id),
        files: files.map((f) => ({ ...f, data: f.data.toString("base64") })),
      },
      checks: [
        "Original, uploaded replacement, exact upload Undo, grouped Trash/restore compile",
        "Exact source/assets, selected ZIP and project ZIP round-trip",
      ],
    };
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(report, null, 2),
    );
    fs.writeFileSync(
      "data/verification/file-batches-fixture.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify({ root, project: p.id, jobs, input }));
    return report;
  } finally {
    store.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await verifyFileBatches();
