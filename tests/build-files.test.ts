import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import {
  Compiler,
  compileArguments,
  compilerEnvironment,
} from "../server/compiler";
import { BuildArtifacts } from "../server/build-files";
import { createApp } from "../server/app";
import { readZip } from "../server/files";
import {
  compileOptions,
  sameCompileOptions,
  BUILD_EXPORT_BYTES,
  BUILD_TEXT_BYTES,
} from "../shared/compiler";
import type { CompileJob } from "../shared/types";

function setup(t: any) {
  const root = path.resolve(
      "data/verification/build-files-test-" + randomUUID(),
    ),
    store = new Store(root),
    compiler = new Compiler(store);
  let now = 100000;
  const artifacts = new BuildArtifacts(compiler, () => now),
    p = store.create("Synthetic build source", [
      {
        path: "paper/main.tex",
        data: Buffer.from("Original snapshot source\n"),
      },
      { path: "main.bbl", data: Buffer.from("Imported old bibliography\n") },
      { path: "assets/raw.bin", data: Buffer.from([0, 255, 1, 2]) },
      { path: "assets/empty", data: Buffer.alloc(0), directory: true },
    ]);
  const job: CompileJob = {
    id: randomUUID(),
    projectId: p.id,
    generation: p.generation,
    engine: "pdflatex",
    root: "paper/main.tex",
    started: "2026-11-01T00:00:00Z",
    status: "succeeded",
    diagnostics: [],
    log: "finished",
    pdf: true,
  };
  compiler.jobs.set(job.id, job);
  const dir = compiler.dir(job.id),
    out = path.join(dir, "out"),
    source = path.join(dir, "source");
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  for (const f of store.exportFiles(p.id)) {
    const dest = path.join(source, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (f.directory) fs.mkdirSync(dest, { recursive: true });
    else fs.writeFileSync(dest, f.data);
  }
  const write = (name: string, bytes: string | Buffer) => {
    const dest = path.join(out, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
  };
  write("main.log", "Synthetic log with café and equations.\n");
  write("main.bbl", "Generated bibliography\n");
  write("nested/figure.bin", Buffer.from([0, 255, 2]));
  write("main.pdf", "%PDF-1.7\nsynthetic fixture only\n");
  compiler.persist(job);
  t.after(() => {
    artifacts.dispose();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    store,
    compiler,
    artifacts,
    p,
    job,
    out,
    source,
    write,
    advance: (n: number) => {
      now += n;
    },
  };
}
const request = (paths: string[], includeSource = false) => ({
  paths,
  includeSource,
});
function snapshot(f: ReturnType<typeof setup>) {
  return JSON.stringify({
    project: f.store.project(f.p.id),
    history: f.store.checkpoints(f.p.id),
    chats: f.store.conversations(f.p.id),
    files: f.store
      .exportFiles(f.p.id)
      .map((x) => [x.path, x.data.toString("base64"), !!x.directory]),
  });
}

test("compiler arguments preserve confinement across all mode/error/engine combinations", () => {
  for (const engine of ["pdflatex", "xelatex", "lualatex"] as const)
    for (const mode of ["normal", "draft"] as const)
      for (const errorHandling of ["stop", "continue"] as const) {
        const args = compileArguments(engine, { mode, errorHandling });
        for (const flag of [
          "-norc",
          "-no-shell-escape",
          "-interaction=nonstopmode",
          "-synctex=1",
        ])
          assert.ok(args.includes(flag));
        assert.equal(args.includes("-halt-on-error"), errorHandling === "stop");
        assert.equal(args.includes("-f"), errorHandling === "continue");
        assert.equal(
          args.some((s) => s.startsWith("-usepretex=")),
          mode === "draft",
        );
        assert.ok(
          !args.some(
            (s) => /shell-escape$/.test(s) && s !== "-no-shell-escape",
          ),
        );
        assert.ok(
          !Object.keys(compilerEnvironment("/build/home")).some((k) =>
            /KEY|TOKEN|SECRET/.test(k),
          ),
        );
      }
  assert.deepEqual(compileOptions(), { mode: "normal", errorHandling: "stop" });
  assert.ok(
    sameCompileOptions(undefined, { mode: "normal", errorHandling: "stop" }),
  );
  assert.ok(
    !sameCompileOptions(undefined, { mode: "draft", errorHandling: "stop" }),
  );
});
test("project compile preferences persist independently with stale-view protection and safe retry", (t) => {
  const f = setup(t),
    before = snapshot(f),
    other = f.store.create("Other", []);
  assert.deepEqual(f.compiler.settings(f.p.id), {
    mode: "normal",
    errorHandling: "stop",
    revision: 0,
  });
  const wanted = { mode: "draft", errorHandling: "continue", revision: 0 };
  assert.equal(f.compiler.configure(f.p.id, wanted).revision, 1);
  assert.equal(f.compiler.configure(f.p.id, wanted).revision, 1);
  assert.throws(
    () => f.compiler.configure(f.p.id, { ...wanted, mode: "normal" }),
    /another view/,
  );
  assert.equal(f.compiler.settings(other.id).mode, "normal");
  const second = new Store(f.root),
    restarted = new Compiler(second);
  assert.deepEqual(restarted.settings(f.p.id), {
    mode: "draft",
    errorHandling: "continue",
    revision: 1,
  });
  second.close();
  assert.equal(snapshot(f), before);
});
test("invalid or AI-locked compile preference changes cannot mutate settings", (t) => {
  const f = setup(t);
  for (const input of [
    null,
    [],
    {},
    { mode: "draft", errorHandling: "ignore", revision: 0 },
    { mode: "normal", errorHandling: "continue", revision: -1 },
    { mode: "draft", errorHandling: "stop", revision: 0.5 },
  ])
    assert.throws(() => f.compiler.configure(f.p.id, input));
  f.store.locks.set(f.p.id + "/paper/main.tex", "active-fixture");
  assert.throws(
    () =>
      f.compiler.configure(f.p.id, {
        mode: "draft",
        errorHandling: "stop",
        revision: 0,
      }),
    /active typing run/i,
  );
  assert.equal(f.compiler.settings(f.p.id).revision, 0);
  f.store.locks.clear();
});
test("erroneous preview remains distinct from the last successful PDF, including restart", (t) => {
  const f = setup(t),
    bad = {
      ...f.job,
      id: randomUUID(),
      started: "2026-11-01T01:00:00Z",
      status: "failed" as const,
      options: { mode: "normal" as const, errorHandling: "continue" as const },
    };
  f.compiler.jobs.set(bad.id, bad);
  fs.mkdirSync(f.compiler.dir(bad.id), { recursive: true });
  f.compiler.persist(bad);
  assert.equal(f.compiler.latestPdf(f.p.id)?.id, f.job.id);
  assert.equal(f.compiler.previewPdf(f.p.id)?.id, bad.id);
  const stopped = {
    ...bad,
    id: randomUUID(),
    started: "2026-11-01T02:00:00Z",
    pdf: false,
    options: { mode: "normal" as const, errorHandling: "stop" as const },
  };
  f.compiler.jobs.set(stopped.id, stopped);
  fs.mkdirSync(f.compiler.dir(stopped.id), { recursive: true });
  f.compiler.persist(stopped);
  assert.equal(f.compiler.previewPdf(f.p.id)?.id, f.job.id);
  const second = new Store(f.root),
    restarted = new Compiler(second);
  assert.equal(restarted.previewPdf(f.p.id)?.id, f.job.id);
  assert.equal(restarted.latestPdf(f.p.id)?.id, f.job.id);
  second.close();
});
test("generated metadata and UTF-8/binary previews never change source, review or history", (t) => {
  const f = setup(t),
    before = snapshot(f),
    manifest = f.artifacts.list(f.job.id);
  assert.deepEqual(
    manifest.files.map((x) => x.path),
    ["main.bbl", "main.log", "main.pdf", "nested/figure.bin"],
  );
  assert.equal(manifest.sourceFiles, 6);
  assert.equal(manifest.root, "paper/main.tex");
  assert.deepEqual(manifest.options, compileOptions());
  assert.match(f.artifacts.text(f.job.id, "main.log").text!, /café/);
  assert.equal(f.artifacts.text(f.job.id, "nested/figure.bin").text, null);
  f.write("legacy.log", Buffer.from([0xff, 0xfe]));
  assert.equal(f.artifacts.text(f.job.id, "legacy.log").text, null);
  f.write("large.log", Buffer.alloc(BUILD_TEXT_BYTES + 1, 65));
  assert.match(f.artifacts.text(f.job.id, "large.log").reason!, /512 KiB/);
  assert.equal(snapshot(f), before);
});
test("selected generated ZIP preserves nested binary bytes and excludes unselected files", async (t) => {
  const f = setup(t),
    before = snapshot(f),
    plan = f.artifacts.preview(
      f.job.id,
      request(["nested/figure.bin", "main.log"]),
    ),
    d = f.artifacts.prepare(f.job.id, { ...plan, allowReplace: false }),
    zip = await readZip(f.artifacts.download(d.id).bytes);
  assert.deepEqual(
    zip.map((x) => x.path),
    ["main.log", "nested/figure.bin"],
  );
  assert.deepEqual(zip[1].data, Buffer.from([0, 255, 2]));
  assert.equal(snapshot(f), before);
});
test("source-plus-output review requires replacement consent and exports the build snapshot", async (t) => {
  const f = setup(t),
    plan = f.artifacts.preview(f.job.id, request(["main.bbl"], true));
  assert.deepEqual(plan.collisions, ["main.bbl"]);
  assert.throws(
    () => f.artifacts.prepare(f.job.id, { ...plan, allowReplace: false }),
    /replace source/,
  );
  const current = f.store.readText(f.p.id, "paper/main.tex");
  f.store.save(f.p.id, current.path, "Newer editor text", current.revision);
  const d = f.artifacts.prepare(f.job.id, { ...plan, allowReplace: true }),
    zip = await readZip(f.artifacts.download(d.id).bytes);
  assert.equal(
    zip.find((x) => x.path === "main.bbl")!.data.toString(),
    "Generated bibliography\n",
  );
  assert.equal(
    zip.find((x) => x.path === "paper/main.tex")!.data.toString(),
    "Original snapshot source\n",
  );
  assert.ok(zip.find((x) => x.path === "assets/empty" && x.directory));
  assert.equal(
    f.store.readText(f.p.id, "main.bbl").content,
    "Imported old bibliography\n",
  );
});
test("identical generated/source content does not require replacement consent", (t) => {
  const f = setup(t);
  f.write("main.bbl", "Imported old bibliography\n");
  const plan = f.artifacts.preview(f.job.id, request(["main.bbl"], true));
  assert.deepEqual(plan.collisions, []);
  assert.ok(
    f.artifacts.prepare(f.job.id, { ...plan, allowReplace: false }).url,
  );
});
test("review hash detects same-size output and source changes and ignores path ordering", (t) => {
  const f = setup(t),
    req = request(["main.log", "main.bbl"], true),
    plan = f.artifacts.preview(f.job.id, req);
  assert.equal(
    f.artifacts.preview(f.job.id, { ...req, paths: [...req.paths].reverse() })
      .hash,
    plan.hash,
  );
  const changedOutput = fs.readFileSync(path.join(f.out, "main.bbl"));
  changedOutput[0] ^= 32;
  f.write("main.bbl", changedOutput);
  assert.throws(
    () => f.artifacts.prepare(f.job.id, { ...plan, allowReplace: true }),
    /changed after review/,
  );
  const fresh = f.artifacts.preview(f.job.id, req);
  const sourcePath = path.join(f.source, "paper/main.tex"),
    changedSource = fs.readFileSync(sourcePath);
  changedSource[0] ^= 32;
  fs.writeFileSync(sourcePath, changedSource);
  assert.throws(
    () => f.artifacts.prepare(f.job.id, { ...fresh, allowReplace: true }),
    /changed after review/,
  );
});
test("prepared bytes are frozen; expiry, eviction, dispose and restart have explicit recovery", (t) => {
  const f = setup(t),
    plan = f.artifacts.preview(f.job.id, request(["main.log"])),
    d = f.artifacts.prepare(f.job.id, { ...plan, allowReplace: false }),
    original = f.artifacts.download(d.id).bytes;
  f.write("main.log", "Later changed output");
  assert.deepEqual(f.artifacts.download(d.id).bytes, original);
  for (let n = 0; n < 4; n++) {
    const p = f.artifacts.preview(f.job.id, request(["main.log"]));
    f.artifacts.prepare(f.job.id, { ...p, allowReplace: false });
  }
  assert.throws(() => f.artifacts.download(d.id), /expired|restarted/);
  const p = f.artifacts.preview(f.job.id, request(["main.log"])),
    last = f.artifacts.prepare(f.job.id, { ...p, allowReplace: false });
  f.advance(15 * 60 * 1000);
  assert.throws(() => f.artifacts.download(last.id), /expired/);
  const next = f.artifacts.prepare(f.job.id, { ...p, allowReplace: false });
  f.artifacts.dispose();
  assert.throws(() => f.artifacts.download(next.id), /expired/);
  const second = new BuildArtifacts(f.compiler);
  assert.throws(() => second.download(next.id), /restarted/);
  second.dispose();
});
test("running/cancelled-but-unclosed compilers cannot expose changing output", (t) => {
  const f = setup(t);
  f.job.status = "running";
  assert.throws(() => f.artifacts.list(f.job.id), /still writing/);
  f.job.status = "cancelled";
  f.compiler.processes.set(f.job.id, {} as any);
  assert.throws(() => f.artifacts.file(f.job.id, "main.log"), /still writing/);
  f.compiler.processes.clear();
  assert.ok(f.artifacts.list(f.job.id).files.length);
});
test("generated downloads reject traversal, symlinks, escaping parents and hard links", (t) => {
  const f = setup(t),
    outside = path.join(f.root, "outside-private-fixture.txt");
  fs.writeFileSync(outside, "must never appear");
  for (const p of [
    "../outside-private-fixture.txt",
    "/etc/passwd",
    "nested/../../main.log",
    "nested\\x",
    "main.log\n",
    null,
  ])
    assert.throws(() => f.artifacts.file(f.job.id, p));
  fs.symlinkSync(outside, path.join(f.out, "leak.log"));
  assert.throws(() => f.artifacts.list(f.job.id), /Symlink/);
  fs.unlinkSync(path.join(f.out, "leak.log"));
  fs.symlinkSync(
    path.join(f.root, "not-present"),
    path.join(f.out, "dangling"),
  );
  assert.throws(() => f.artifacts.list(f.job.id), /Symlink/);
  fs.unlinkSync(path.join(f.out, "dangling"));
  fs.linkSync(outside, path.join(f.out, "hard.log"));
  assert.throws(() => f.artifacts.list(f.job.id), /Linked/);
  fs.unlinkSync(path.join(f.out, "hard.log"));
  fs.renameSync(f.out, f.out + "-saved");
  fs.symlinkSync(f.out + "-saved", f.out);
  assert.throws(() => f.artifacts.list(f.job.id), /Symlink/);
  fs.unlinkSync(f.out);
  fs.renameSync(f.out + "-saved", f.out);
  fs.symlinkSync(outside, path.join(f.source, "leak.txt"));
  assert.throws(
    () => f.artifacts.preview(f.job.id, request(["main.log"], true)),
    /Symlink/,
  );
});
test("source/output folder collisions reject the ZIP without altering either tree", (t) => {
  const f = setup(t);
  f.write("assets/empty", "generated file conflicts with source folder");
  assert.throws(
    () => f.artifacts.preview(f.job.id, request(["assets/empty"], true)),
    /source folder/,
  );
  assert.ok(fs.statSync(path.join(f.source, "assets/empty")).isDirectory());
});
test("malformed selections and oversized files fail before download preparation", (t) => {
  const f = setup(t);
  for (const r of [
    null,
    {},
    request([]),
    request(["main.log", "main.log"]),
    request(["missing"]),
    { paths: ["main.log"], includeSource: "yes" },
  ])
    assert.throws(() => f.artifacts.preview(f.job.id, r));
  fs.closeSync(fs.openSync(path.join(f.out, "huge.bin"), "w"));
  fs.truncateSync(path.join(f.out, "huge.bin"), BUILD_EXPORT_BYTES + 1);
  assert.ok(
    f.artifacts.list(f.job.id).files.find((x) => x.path === "huge.bin"),
  );
  assert.throws(
    () => f.artifacts.preview(f.job.id, request(["huge.bin"])),
    /100 MiB/,
  );
  assert.throws(() => f.artifacts.file(f.job.id, "huge.bin"), /100 MiB/);
  assert.equal(
    f.artifacts.preview(f.job.id, request(["main.log"])).paths.length,
    1,
  );
});
test("output entry limits prevent unbounded directory inspection", (t) => {
  const f = setup(t);
  for (let n = 0; n < 5000; n++)
    fs.writeFileSync(path.join(f.out, "extra-" + n), "");
  assert.throws(() => f.artifacts.list(f.job.id), /5,000/);
});
test("actual build-file HTTP routes enforce origin guards and truthful attachment/error headers", async (t) => {
  const f = setup(t),
    e = await createApp(f.root, { seed: false });
  t.after(async () => {
    await e.app.close();
  });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    base = "/api/builds/" + f.job.id;
  const manifest = await e.app.inject({ url: base + "/files", headers });
  assert.equal(manifest.statusCode, 200);
  const file = await e.app.inject({
    url: base + "/files/download?path=nested%2Ffigure.bin",
    headers,
  });
  assert.equal(file.statusCode, 200);
  assert.deepEqual(file.rawPayload, Buffer.from([0, 255, 2]));
  assert.match(file.headers["content-disposition"]!, /attachment/);
  assert.equal(file.headers["cache-control"], "no-store");
  const missing = await e.app.inject({
    url: base + "/files/download?path=missing",
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers["content-disposition"], undefined);
  const preview = await e.app.inject({
    method: "POST",
    url: base + "/exports/preview",
    headers,
    payload: request(["main.log"]),
  });
  assert.equal(preview.statusCode, 200);
  const prepared = await e.app.inject({
    method: "POST",
    url: base + "/exports",
    headers,
    payload: {
      ...preview.json<Record<string, unknown>>(),
      allowReplace: false,
    },
  });
  assert.equal(prepared.statusCode, 200);
  const zip = await e.app.inject({ url: prepared.json().url, headers });
  assert.equal(zip.statusCode, 200);
  assert.equal((await readZip(zip.rawPayload))[0].path, "main.log");
  assert.equal(
    (
      await e.app.inject({
        url: prepared.json().url,
        headers: { ...headers, origin: "https://evil.invalid" },
      })
    ).statusCode,
    403,
  );
  e.artifacts.dispose();
  const expired = await e.app.inject({ url: prepared.json().url, headers });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.headers["content-disposition"], undefined);
  const options = await e.app.inject({
    method: "PUT",
    url: "/api/projects/" + f.p.id + "/compile-options",
    headers,
    payload: { mode: "draft", errorHandling: "stop", revision: 0 },
  });
  assert.equal(options.statusCode, 200);
  const staleCompile = await e.app.inject({
    method: "POST",
    url: "/api/projects/" + f.p.id + "/compile",
    headers,
    payload: { optionsRevision: 0 },
  });
  assert.equal(staleCompile.statusCode, 409);
  assert.match(staleCompile.json().error, /options changed/);
  assert.equal(e.compiler.processes.size, 0);
});
