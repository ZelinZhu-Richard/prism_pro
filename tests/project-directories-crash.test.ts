import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { FileBatches } from "../server/file-batches";
import { FileMoves } from "../server/file-moves";
import { captureDirectory } from "../server/project-directories";

for (const phase of [
  "before-metadata-commit",
  "after-metadata-commit",
  "after-case-stage",
  "after-rename",
  "after-reference",
]) {
  test("actual process death during a linked folder rename: " + phase, (t) => {
    const root = path.resolve(
      "data/verification/linked-move-crash-" + randomUUID(),
    );
    let store: Store | undefined;
    t.after(() => {
      store?.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/linked-move-crash.ts", root, phase],
      { cwd: process.cwd(), encoding: "utf8", timeout: 15000 },
    );
    assert.equal(child.signal, "SIGKILL", child.stderr);
    const fixture = JSON.parse(
        fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
      ),
      { source, state, id, from, to, request, main } = fixture,
      committed = phase !== "before-metadata-commit",
      folder = committed ? to : from;
    store = new Store(state);
    assert.deepEqual(captureDirectory(source), fixture.identity);
    assert(fs.readdirSync(source).includes(folder));
    assert(!fs.readdirSync(source).includes(committed ? from : to));
    assert(!fs.readdirSync(source).some((name) => name.endsWith(".prism-tmp")));
    const diskOnly = path.join(source, folder, "unindexed.bin");
    assert.equal(fs.statSync(diskOnly).ino, fixture.inode);
    assert.deepEqual(fs.readFileSync(diskOnly), Buffer.from([0, 1, 255]));
    assert.equal(
      store.readText(id, "main.tex").content,
      main.replace(from + "/one", folder + "/one"),
    );
    const moves = new FileMoves(store);
    if (committed) {
      assert.equal(moves.renameResult(id, from, to, request).replayed, true);
      moves.undo(id, request.requestId);
      assert.equal(
        fs.statSync(path.join(source, from, "unindexed.bin")).ino,
        fixture.inode,
      );
      assert.equal(store.readText(id, "main.tex").content, main);
    } else assert.equal(moves.list(id).length, 0);
  });
}
for (const phase of [
  "before-commit",
  "after-commit",
  "after-rename",
  "external-after-commit",
  "root-replaced-after-commit",
])
  test(
    "actual process death preserves linked-folder boundary: " + phase,
    (t) => {
      const root = path.resolve(
        "data/verification/linked-crash-" + randomUUID(),
      );
      fs.mkdirSync(root, { recursive: true });
      let store: Store | undefined;
      t.after(() => {
        store?.close();
        fs.rmSync(root, { recursive: true, force: true });
      });
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "tests/fixtures/linked-write-crash.ts",
          root,
          phase,
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 15000 },
      );
      assert.equal(child.signal, "SIGKILL", child.stderr);
      assert.equal(child.status, null);
      const f = JSON.parse(
          fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
        ),
        before = fs.statSync(path.join(f.source, "main.tex"));
      store = new Store(f.data);
      if (phase === "root-replaced-after-commit") {
        assert.equal(store.project(f.id).storage?.available, false);
        assert.equal(
          fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
          "Replacement folder bytes.\n",
        );
        assert.equal(
          fs.readFileSync(
            path.join(f.source + " original", "main.tex"),
            "utf8",
          ),
          "Original ordinary source.\n",
        );
        assert.equal(
          store.exportFiles(f.id)[0].data.toString(),
          "Latest ordinary app version.\n",
        );
        assert(!fs.existsSync(path.join(f.data, "projects", f.id, "files")));
        fs.renameSync(f.source, f.source + " replacement");
        fs.renameSync(f.source + " original", f.source);
        store.reconcileDisk(f.id);
        assert.equal(
          fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
          "Latest ordinary app version.\n",
        );
        assert.equal(
          fs.readFileSync(
            path.join(f.source + " replacement", "main.tex"),
            "utf8",
          ),
          "Replacement folder bytes.\n",
        );
      } else {
        const expected =
          phase === "before-commit"
            ? "Original ordinary source.\n"
            : phase === "external-after-commit"
              ? "External after linked crash.\n"
              : "Latest ordinary app version.\n";
        assert.equal(store.readText(f.id, "main.tex").content, expected);
        assert.equal(
          fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
          expected,
        );
        if (phase === "after-rename")
          assert.equal(
            fs.statSync(path.join(f.source, "main.tex")).ino,
            before.ino,
          );
        const versions = store
          .checkpoints(f.id)
          .flatMap((c) =>
            store!.exportCheckpoint(f.id, c.id).map((e) => e.data.toString()),
          );
        assert(versions.includes("Original ordinary source.\n"));
        if (phase === "external-after-commit")
          assert(versions.includes("Latest ordinary app version.\n"));
      }
    },
  );

for (const phase of [
  "before-metadata-commit",
  "after-metadata-commit",
  "after-first-write",
]) {
  test("actual process death during an in-place upload: " + phase, (t) => {
    const root = path.resolve(
      "data/verification/linked-batch-crash-" + randomUUID(),
    );
    let store: Store | undefined;
    t.after(() => {
      store?.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/linked-batch-crash.ts", root, phase],
      { cwd: process.cwd(), encoding: "utf8", timeout: 15000 },
    );
    assert.equal(child.signal, "SIGKILL", child.stderr);
    const fixture = JSON.parse(
        fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
      ),
      main = path.join(fixture.source, "main.tex"),
      asset = path.join(fixture.source, "nested/figure.bin"),
      oldInode = fs.statSync(main).ino,
      committed = phase !== "before-metadata-commit";
    assert.equal(
      fs.readFileSync(main, "utf8"),
      phase === "after-first-write" ? "Replacement.\n" : "Original.\n",
    );
    assert(!fs.existsSync(asset));
    store = new Store(fixture.state);
    assert.equal(
      store.readText(fixture.id, "main.tex").content,
      committed ? "Replacement.\n" : "Original.\n",
    );
    assert.deepEqual(captureDirectory(fixture.source), fixture.identity);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.source, "unindexed.bin")),
      Buffer.from([0, 1, 255]),
    );
    if (phase === "after-first-write")
      assert.equal(fs.statSync(main).ino, oldInode);
    if (committed) {
      assert.deepEqual(fs.readFileSync(asset), Buffer.from([0, 42, 255]));
      const batches = new FileBatches(store);
      assert.equal(
        batches.upload(
          fixture.id,
          fixture.input,
          new Map([
            [0, Buffer.from("Replacement.\n")],
            [1, Buffer.from([0, 42, 255])],
          ]),
        ).replayed,
        true,
      );
      batches.undo(fixture.id, fixture.input.requestId);
      assert.equal(fs.readFileSync(main, "utf8"), "Original.\n");
      assert(!fs.existsSync(asset));
    } else {
      assert(!fs.existsSync(asset));
      assert.equal(new FileBatches(store).list(fixture.id).length, 0);
    }
  });
}
