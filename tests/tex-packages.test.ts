import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TexRuntimes } from "../server/tex-runtimes";
import {
  TexPackages,
  parsePackageDatabase,
  searchTexPackages,
} from "../server/tex-packages";
import { createApp } from "../server/app";

const header =
  "% ls-R -- filename database for kpathsea; do not change this line.\n";
function fixture(t: any) {
  const root = path.resolve(
      "data/verification/tex-packages-test-" + randomUUID(),
    ),
    prefix = path.join(root, "texlive/2026"),
    bin = path.join(prefix, "bin/universal-darwin"),
    dist = path.join(prefix, "texmf-dist");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "pdftex"),
    "#!/bin/sh\nprintf 'pdfTeX (TeX Live 2026)\\n'\n",
    { mode: 0o755 },
  );
  const runtimes = new TexRuntimes({
    systemBin: bin,
    texLiveRoot: path.join(root, "texlive"),
    extraBins: [],
    supportDirs: [],
  });
  const file = (
    relative: string,
    text = "% Synthetic package; never executed.\n",
  ) => {
    const name = path.join(dist, relative);
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, text);
    return name;
  };
  const index = (text: string | Buffer) =>
    fs.writeFileSync(path.join(dist, "ls-R"), text);
  const catalog = new TexPackages();
  const cleanup: { before?: () => Promise<unknown> } = {};
  t.after(async () => {
    await cleanup.before?.();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    dist,
    bin,
    prefix,
    runtimes,
    file,
    index,
    catalog,
    cleanup,
    runtime: runtimes.resolve(),
  };
}

test("filename index parses only TeX package/class leaves, preserving duplicate provenance", () => {
  const p = parsePackageDatabase(
    header +
      "./doc/latex/foo:\nignored.sty\n./source/latex/foo:\nignored.cls\n./tex/latex/a:\nsame.sty\narticle.cls\nsame.sty\n./tex/generic/b:\nsame.sty\nfile.tex\n",
  );
  assert.deepEqual(
    p.packages.map((e) => [e.name, e.path, e.format]),
    [
      ["article", "tex/latex/a/article.cls", "cls"],
      ["same", "tex/generic/b/same.sty", "sty"],
      ["same", "tex/latex/a/same.sty", "sty"],
    ],
  );
  assert.deepEqual(p.warnings, []);
});
test("filename index rejects traversal, absolute/linked-style headers and unsupported leaf spelling", () => {
  const p = parsePackageDatabase(
    header +
      "./tex/latex/good:\ngood.sty\n../bad.sty\n.hidden.sty\n./tex/../../outside:\nescape.sty\n/absolute/tex:\nabsolute.sty\n./tex\\outside:\nbackslash.sty\n./tex/latex//empty:\nempty.sty\n./tex/latex/good:\nother.sty\n",
  );
  assert.deepEqual(
    p.packages.map((p) => p.name),
    ["good", "other"],
  );
  assert.equal(p.warnings.length, 2);
  assert.throws(
    () => parsePackageDatabase("./tex/latex/foo:\na.sty\n"),
    /not a Kpathsea/,
  );
});
test("filename index limits candidates explicitly and search bounds/sorts without changing the catalog", () => {
  const limited = parsePackageDatabase(
    header + "./tex/latex/a:\na.sty\nb.sty\nc.sty\n",
    2,
  );
  assert.equal(limited.packages.length, 2);
  assert.match(limited.warnings[0], /limited to 2/);
  const packages = Array.from({ length: 250 }, (_, i) => ({
    name: "prefix" + i,
    path: "tex/latex/x/prefix" + i + ".sty",
    format: "sty" as const,
  }));
  packages.unshift({
    name: "aprefix",
    path: "tex/latex/x/aprefix.sty",
    format: "sty",
  });
  const c = { packages } as any,
    before = JSON.stringify(c),
    result = searchTexPackages(c, "prefix");
  assert.equal(result.total, 251);
  assert.equal(result.packages.length, 200);
  assert(result.limited);
  assert.equal(result.packages[0].name, "prefix0");
  assert.equal(JSON.stringify(c), before);
  for (const q of [[], {}, "bad\n", "x".repeat(161)])
    assert.throws(() => searchTexPackages(c, q), /160 plain/);
});

test("filename metadata has a line ceiling even when an index contains no package candidates", () => {
  const p = parsePackageDatabase(
    header + "\n".repeat(500001) + "./tex/latex/a:\nlate.sty\n",
  );
  assert.deepEqual(p.packages, []);
  assert.match(p.warnings[0], /500000 database lines/);
});
test("installed metadata checks existing confined regular files; never walks unindexed/user trees", async (t) => {
  const s = fixture(t);
  s.file("tex/latex/a/one.sty");
  s.file("tex/latex/a/article.cls");
  s.file("tex/latex/a/unindexed.sty");
  s.file("tex/latex/b/inside.sty");
  const outside = path.join(s.root, "outside.sty");
  fs.writeFileSync(outside, "Private synthetic content.");
  fs.symlinkSync(outside, path.join(s.dist, "tex/latex/a/escape.sty"));
  fs.symlinkSync("../b/inside.sty", path.join(s.dist, "tex/latex/a/alias.sty"));
  fs.mkdirSync(path.join(s.dist, "tex/latex/a/directory.sty"));
  s.index(
    header +
      "./tex/latex/a:\none.sty\narticle.cls\nmissing.sty\nescape.sty\nalias.sty\ndirectory.sty\n",
  );
  const c = await s.catalog.get(s.runtime);
  assert.equal(c.status, "ready");
  assert.deepEqual(
    c.packages.map((p) => p.name),
    ["alias", "article", "one"],
  );
  assert.equal(c.warnings.length, 1);
  assert.match(c.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(c.runtime.id, "system");
  assert(!c.packages.some((p) => p.name === "unindexed"));
  assert.equal(fs.readFileSync(outside, "utf8"), "Private synthetic content.");
});
test("installed cache isolates callers, keeps System/pinned identity and refreshes missing files", async (t) => {
  const s = fixture(t);
  const leaf = s.file("tex/latex/a/one.sty");
  s.index(header + "./tex/latex/a:\none.sty\n");
  const first = await s.catalog.get(s.runtime);
  first.packages[0].name = "changed";
  first.warnings.push("mutated");
  const pinned = s.runtimes.catalog().runtimes.find((r) => r.id !== "system")!;
  const c = await s.catalog.get(s.runtimes.resolve(pinned.id));
  assert.equal(c.runtime.id, pinned.id);
  assert.equal(c.packages[0].name, "one");
  assert.deepEqual(c.warnings, []);
  fs.unlinkSync(leaf);
  assert.equal((await s.catalog.get(s.runtime)).packages.length, 1);
  const fresh = await s.catalog.get(s.runtime, true);
  assert.equal(fresh.packages.length, 0);
  assert.notEqual(fresh.fingerprint, c.fingerprint);
});
test("index stat changes and bounded cache expiry recheck the installation without an explicit refresh", async (t) => {
  const s = fixture(t);
  s.file("tex/latex/a/one.sty");
  s.index(header + "./tex/latex/a:\none.sty\n");
  let now = 1000;
  const catalog = new TexPackages({ ttlMs: 100, now: () => now });
  const a = await catalog.get(s.runtime);
  s.file("tex/latex/a/two.sty");
  s.index(header + "./tex/latex/a:\none.sty\ntwo.sty\n");
  const b = await catalog.get(s.runtime);
  assert.equal(b.packages.length, 2);
  assert.notEqual(a.fingerprint, b.fingerprint);
  fs.unlinkSync(path.join(s.dist, "tex/latex/a/two.sty"));
  now += 101;
  assert.deepEqual(
    (await catalog.get(s.runtime)).packages.map((p) => p.name),
    ["one"],
  );
});
test("absent, malformed, legacy-byte, linked and oversized indexes stay unavailable without a scan fallback", async (t) => {
  const s = fixture(t);
  s.file("tex/latex/a/one.sty");
  assert.equal((await s.catalog.get(s.runtime)).status, "unavailable");
  for (const text of ["broken", Buffer.from([255, 0, 10])]) {
    s.index(text);
    const c = await s.catalog.get(s.runtime, true);
    assert.equal(c.status, "unavailable");
    assert.deepEqual(c.packages, []);
    assert(c.warnings.length);
  }
  fs.unlinkSync(path.join(s.dist, "ls-R"));
  const outside = path.join(s.root, "database");
  fs.writeFileSync(outside, header + "./tex/latex/a:\none.sty\n");
  fs.symlinkSync(outside, path.join(s.dist, "ls-R"));
  assert.equal((await s.catalog.get(s.runtime, true)).status, "unavailable");
  fs.unlinkSync(path.join(s.dist, "ls-R"));
  s.index("");
  fs.truncateSync(path.join(s.dist, "ls-R"), 8 * 1024 * 1024 + 1);
  assert.equal((await s.catalog.get(s.runtime, true)).status, "unavailable");
});
test("distribution directory cannot escape the trusted runtime installation", async (t) => {
  const s = fixture(t);
  fs.rmSync(s.dist, { recursive: true });
  const outside = path.join(s.root, "other-dist");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "ls-R"), header);
  fs.symlinkSync(outside, s.dist);
  const c = await s.catalog.get(s.runtime);
  assert.equal(c.status, "unavailable");
  assert.deepEqual(c.packages, []);
});
test("package API follows only selected compile runtime, is read-only under a lock and validates origin/project/query", async (t) => {
  const s = fixture(t);
  s.file("tex/latex/a/one.sty");
  s.index(header + "./tex/latex/a:\none.sty\n");
  const f = await createApp(path.join(s.root, "app"), {
    seed: false,
    runtimes: s.runtimes,
  });
  s.cleanup.before = () => f.app.close();
  const p = f.store.create("Synthetic installed metadata", [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\\begin{document}Metadata.\\end{document}",
        ),
      },
    ]),
    base = "/api/projects/" + p.id + "/packages",
    headers = { host: "127.0.0.1:5173", "x-prism-request": "1" },
    state = () =>
      JSON.stringify({
        p: f.store.project(p.id),
        files: f.store.exportFiles(p.id),
        history: f.store.checkpoints(p.id),
        settings: f.compiler.settings(p.id),
      }),
    before = state();
  f.store.projectLocks.set(p.id, "synthetic-metadata-lock");
  const response = await f.app.inject({
    url: base + "?q=one&runtimeId=untrusted&refresh=1",
    headers,
  });
  assert.equal(response.statusCode, 200, response.body);
  const c = response.json();
  assert.equal(c.projectId, p.id);
  assert.equal(c.runtime.id, "system");
  assert.equal(c.settingsRevision, 0);
  assert.equal(c.total, 1);
  assert.equal(c.packages[0].name, "one");
  assert.equal(state(), before);
  assert.equal(
    (await f.app.inject({ url: base + "?q[]=bad", headers })).statusCode,
    200,
  );
  assert.equal(
    (await f.app.inject({ url: base + "?q=%0A", headers })).statusCode,
    400,
  );
  assert.equal(
    (
      await f.app.inject({
        url: base,
        headers: { ...headers, origin: "https://not-local.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        url: "/api/projects/" + randomUUID() + "/packages",
        headers,
      })
    ).statusCode,
    404,
  );
  f.store.projectLocks.delete(p.id);
  const old = f.compiler.settings(p.id);
  f.store.setSetting("compiler:" + p.id, {
    ...old,
    runtimeId: "tex-" + "a".repeat(24),
  });
  const missing = await f.app.inject({ url: base, headers });
  assert.equal(missing.statusCode, 503);
  assert.match(missing.body, /no fallback/);
});
