import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PersonalTexTree } from "../server/personal-tex";

function fixture(t: TestContext) {
  const root = path.resolve(
    "data/verification/personal-tex-test-" + randomUUID(),
  );
  const tree = path.join(root, "Personal TeX");
  const file = (name: string, contents: string | Buffer) => {
    const target = path.join(tree, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target;
  };
  const style = file("tex/latex/Local packages/leaf.sty", "package A");
  const personal = new PersonalTexTree(tree);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, tree, file, style, personal };
}

test("personal TeX is opt-in and captures only permitted regular files", (t) => {
  const f = fixture(t);
  const disabled = new PersonalTexTree();
  assert.equal(disabled.catalog().status.kind, "disabled");
  assert.equal(disabled.capture(), undefined);
  f.file("tex/latex/Local packages/leaf.cls", "class data");
  f.file("tex/latex/Local packages/.env", "ignored");
  f.file("web2c/texmf.cnf", "ignored");
  f.file("ls-R", "ignored");
  f.file("fonts/type1/leaf/leaf.pfb", Buffer.from([0, 1, 255]));
  const outside = path.join(f.root, "outside.sty");
  fs.writeFileSync(outside, "external bytes");
  fs.symlinkSync(outside, path.join(f.tree, "tex/alias.sty"));
  fs.linkSync(outside, path.join(f.tree, "tex/hard.sty"));
  const catalog = f.personal.catalog();
  assert.equal(catalog.status.kind, "ready");
  assert.deepEqual(
    catalog.packages.map((entry) => [entry.name, entry.format, entry.origin]),
    [
      ["leaf", "cls", "personal"],
      ["leaf", "sty", "personal"],
    ],
  );
  assert.equal(catalog.warnings.length, 1);
  const captured = f.personal.capture();
  assert(captured);
  assert.deepEqual(
    captured.files.map((entry) => entry.path),
    [
      "fonts/type1/leaf/leaf.pfb",
      "tex/latex/Local packages/leaf.cls",
      "tex/latex/Local packages/leaf.sty",
    ],
  );
  assert.deepEqual(captured.files[0].data, Buffer.from([0, 1, 255]));
});

test("metadata and byte fingerprints track a same-size package change while captured bytes stay stable", (t) => {
  const f = fixture(t);
  const before = f.personal.capture()!;
  fs.writeFileSync(f.style, "package B");
  const after = f.personal.capture()!;
  assert.notEqual(after.build.fingerprint, before.build.fingerprint);
  assert.notEqual(after.build.signature, before.build.signature);
  assert.equal(before.files[0].data.toString(), "package A");
  assert.equal(after.files[0].data.toString(), "package B");
  assert.equal(
    f.personal.capture()?.build.fingerprint,
    after.build.fingerprint,
  );
});

test("a replaced personal directory stays unavailable until the original returns", (t) => {
  const f = fixture(t);
  assert.equal(f.personal.catalog().status.kind, "ready");
  const original = f.tree + " original";
  fs.renameSync(f.tree, original);
  f.file("tex/latex/replacement.sty", "wrong tree");
  assert.equal(f.personal.catalog(true).status.kind, "unavailable");
  assert.throws(() => f.personal.capture(), /was replaced/);
  fs.renameSync(f.tree, f.tree + " replacement");
  fs.renameSync(original, f.tree);
  assert.equal(f.personal.capture()?.files[0].data.toString(), "package A");
});

test("unreadable, protected, or oversized configurations fail without a partial snapshot", (t) => {
  const f = fixture(t);
  for (const bad of [
    "relative-tree",
    path.join(f.root, "absent"),
    f.root + "/holdout",
    "/",
  ]) {
    const tree = new PersonalTexTree(bad);
    assert.equal(tree.catalog().status.kind, "unavailable");
    assert.throws(() => tree.capture());
  }
  fs.truncateSync(f.style, 16 * 1024 * 1024 + 1);
  assert.equal(f.personal.catalog().status.kind, "unavailable");
  assert.throws(() => f.personal.capture(), /16 MiB/);
});

test("an intervening write while reading a package rejects the capture", (t) => {
  const f = fixture(t);
  const original = fs.readSync;
  let edited = false;
  t.mock.method(fs, "readSync", (...args: Parameters<typeof fs.readSync>) => {
    const bytes = Reflect.apply(original, fs, args);
    if (!edited) {
      edited = true;
      fs.writeFileSync(f.style, "changed after the read");
    }
    return bytes;
  });
  assert.throws(() => f.personal.capture(), /could not be read safely/);
  assert(edited);
  assert.equal(fs.readFileSync(f.style, "utf8"), "changed after the read");
});
