import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { FileMoves } from "../server/file-moves";
import { copyFixtureFiles } from "./verify-project-copy";
import { readZip, writeZip } from "../server/files";

async function verify() {
  const root = path.resolve("data/verification/file-moves-" + Date.now());
  fs.mkdirSync(root, { recursive: true });
  const store = new Store(root),
    compiler = new Compiler(store),
    moves = new FileMoves(store);
  const project = store.create("File moves · synthetic", [
    ...copyFixtureFiles(),
    { path: "archive", directory: true, data: Buffer.alloc(0) },
  ]);
  store.update(project.id, { root: "roots/paper.tex", engine: "xelatex" });
  store.trash(project.id, "old-notes.txt");
  const original = store.exportFiles(project.id),
    jobs: string[] = [];
  async function compile() {
    const job = compiler.start(project.id),
      started = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - started > 130000)
        throw new Error("Compilation timed out.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-4000));
    assert.equal(
      job.diagnostics.filter((d) => d.severity === "error").length,
      0,
    );
    jobs.push(job.id);
    return job;
  }
  try {
    const first = await compile();
    const initial = compiler.sync(first.id, {
      direction: "forward",
      path: "roots/paper.tex",
      line: 9,
    });
    assert.ok((initial.page ?? 0) >= 1);
    const result = moves.apply(project.id, {
      paths: ["roots"],
      destination: "archive",
      requestId: randomUUID(),
      generation: store.project(project.id).generation,
    });
    assert.equal(result.project.root, "archive/roots/paper.tex");
    assert.equal(
      store.readText(project.id, result.project.root).content,
      original.find((f) => f.path === "roots/paper.tex")!.data.toString(),
    );
    assert.throws(
      () =>
        compiler.sync(first.id, {
          direction: "forward",
          path: result.project.root,
          line: 9,
        }),
      /predates the file move/,
    );
    const second = await compile();
    const forward = compiler.sync(second.id, {
      direction: "forward",
      path: result.project.root,
      line: 9,
    });
    assert.ok((forward.page ?? 0) >= 1);
    const inverse = compiler.sync(second.id, {
      direction: "inverse",
      page: forward.page,
      x: forward.x,
      y: forward.y,
    });
    assert.ok(store.fileList(project.id).some((f) => f.path === inverse.path));
    const exported = await readZip(writeZip(store.exportFiles(project.id)));
    for (const file of store.exportFiles(project.id))
      assert.deepEqual(
        exported.find((f) => f.path === file.path)?.data,
        file.data,
      );
    moves.undo(project.id, result.operationId);
    assert.deepEqual(store.exportFiles(project.id), original);
    assert.equal(store.project(project.id).root, "roots/paper.tex");
    await compile();
    assert.equal(
      fs.existsSync(path.join(store.projectDir(project.id), "SHOULD_NOT_RUN")),
      false,
    );
    const report = {
      root,
      project: project.id,
      jobs,
      checks: [
        "Three real XeLaTeX builds with nested root, BibTeX, Unicode and figure",
        "Moved root follows project settings; source/reference bytes stay exact",
        "Stale PDF forward navigation rejected; rebuilt forward/inverse SyncTeX works",
        "Moved ZIP round-trip and exact move Undo",
        "Imported build.sh never executed",
      ],
    };
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    store.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/verify-file-moves.ts")
)
  await verify();
