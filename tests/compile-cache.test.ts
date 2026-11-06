import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  pruneCompileCache,
  seedCompileCache,
  sourceLayout,
} from "../server/compile-cache";

function fixture(t: TestContext) {
  const root = path.resolve(
      "data/verification/compile-cache-test-" + randomUUID(),
    ),
    before = path.join(root, "old"),
    after = path.join(root, "new");
  for (const dir of [before, after]) {
    fs.mkdirSync(path.join(dir, "source"), { recursive: true });
    fs.mkdirSync(path.join(dir, "out"));
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = (dir: string, name: string) => path.join(dir, "out", name);
  const fdb = (dir: string, auxiliaries = ["main.aux", "main.bbl"]) =>
    "# Fdb version 4\n" +
    `["pdflatex"] 12 "./main.tex" "${out(dir, "main.pdf")}" "main" 13 0\n` +
    '  "./main.tex" 11 7 abcd ""\n' +
    '  "/usr/fixture.sty" 11 7 bcde ""\n' +
    auxiliaries
      .map((name) => `  "${out(dir, name)}" 12 7 abcd "pdflatex"\n`)
      .join("") +
    "  (generated)\n" +
    auxiliaries.map((name) => `  "${out(dir, name)}"\n`).join("") +
    "  (rewritten before read)\n";
  for (const name of [
    "main.aux",
    "main.bbl",
    "main.blg",
    "main.pdf",
    "main.synctex.gz",
  ])
    fs.writeFileSync(out(before, name), name);
  fs.writeFileSync(out(before, "main.fdb_latexmk"), fdb(before));
  return { before, after, out, fdb };
}

test("source layout is independent of ordering and contents, and changes on renames and entry types", () => {
  const a = { path: "main.tex", data: Buffer.from("Before") },
    b = { path: "assets", directory: true, data: Buffer.alloc(0) };
  assert.equal(
    sourceLayout([a, b]),
    sourceLayout([b, { ...a, data: Buffer.from("After") }]),
  );
  assert.notEqual(
    sourceLayout([a, b]),
    sourceLayout([{ ...a, path: "new.tex" }, b]),
  );
  assert.notEqual(
    sourceLayout([a, b]),
    sourceLayout([a, { ...b, directory: false }]),
  );
});

test("cache rebases absolute job paths, rehashes snapshot inputs and never seeds PDF or SyncTeX", (t) => {
  const f = fixture(t),
    seeds = seedCompileCache(f.before, f.after, "main.tex");
  assert(seeds);
  const data = fs.readFileSync(f.out(f.after, "main.fdb_latexmk"), "utf8");
  assert(data.includes(f.out(f.after, "main.aux")));
  assert(!data.includes(f.before));
  assert(data.includes('"./main.tex" -1 7'));
  assert(data.includes('"/usr/fixture.sty" 11 7'));
  assert.deepEqual(fs.readdirSync(f.out(f.after, "")).sort(), [
    "main.aux",
    "main.bbl",
    "main.blg",
    "main.fdb_latexmk",
  ]);
  assert.equal(
    fs.readFileSync(f.out(f.before, "main.pdf"), "utf8"),
    "main.pdf",
  );
});

test("a stale bibliography is pruned while a newly written file is retained", (t) => {
  const f = fixture(t),
    seeds = seedCompileCache(f.before, f.after, "main.tex");
  assert(seeds);
  fs.writeFileSync(f.out(f.after, "main.fdb_latexmk"), f.fdb(f.after, []));
  fs.writeFileSync(f.out(f.after, "main.aux"), "new build output");
  pruneCompileCache(f.after, "main.tex", seeds);
  assert(!fs.existsSync(f.out(f.after, "main.bbl")));
  assert(!fs.existsSync(f.out(f.after, "main.blg")));
  assert.equal(
    fs.readFileSync(f.out(f.after, "main.aux"), "utf8"),
    "new build output",
  );
  assert(fs.existsSync(f.out(f.before, "main.bbl")));
});
test("a cache stage never overwrites existing output or leaves partial state", (t) => {
  const f = fixture(t), retained = f.out(f.after, "retained.txt");
  fs.writeFileSync(retained, "kept");
  assert.equal(seedCompileCache(f.before, f.after, "main.tex"), undefined);
  assert.equal(fs.readFileSync(retained, "utf8"), "kept");
  assert.deepEqual(fs.readdirSync(f.after).sort(), ["out", "source"]);
  assert.deepEqual(fs.readdirSync(f.out(f.after, "")), ["retained.txt"]);
});

test("missing, linked, unsupported, oversized or colliding state leaves the new output empty", (t) => {
  const f = fixture(t),
    aux = f.out(f.before, "main.aux"),
    fdb = f.out(f.before, "main.fdb_latexmk");
  const misses = () => {
    assert.equal(seedCompileCache(f.before, f.after, "main.tex"), undefined);
    assert.deepEqual(fs.readdirSync(f.out(f.after, "")), []);
  };
  fs.unlinkSync(aux);
  misses();
  fs.symlinkSync(f.out(f.before, "main.bbl"), aux);
  misses();
  fs.unlinkSync(aux);
  fs.linkSync(f.out(f.before, "main.bbl"), aux);
  misses();
  fs.unlinkSync(aux);
  fs.writeFileSync(aux, Buffer.alloc(1024 * 1024 + 1));
  misses();
  fs.writeFileSync(aux, "valid");
  fs.writeFileSync(fdb, f.fdb(f.before).replace("version 4", "version 99"));
  misses();
  fs.writeFileSync(
    fdb,
    f.fdb(f.before).replace('["pdflatex"]', '["cusdep test"]'),
  );
  misses();
  fs.writeFileSync(
    fdb,
    f.fdb(f.before).replace(f.out(f.before, "main.pdf"), "/unrelated/main.pdf"),
  );
  misses();
  fs.writeFileSync(fdb, f.fdb(f.before));
  fs.writeFileSync(path.join(f.after, "source/main.bbl"), "user bibliography");
  misses();
});
