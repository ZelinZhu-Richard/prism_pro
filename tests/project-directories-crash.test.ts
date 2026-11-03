import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
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
