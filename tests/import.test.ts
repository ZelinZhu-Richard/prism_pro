import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { readZip, writeZip } from "../server/files";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import {
  droppedArchives,
  validateArchiveSelection,
} from "../src/import-project";
import type { SkippedArchiveEntry } from "../shared/types";

const source =
  "\\documentclass{article}\n\\begin{document}ZIP example.\\end{document}\n";
function zip(entries: Record<string, string | Uint8Array>) {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([name, data]) => [
          name,
          typeof data === "string" ? Buffer.from(data) : data,
        ]),
      ),
      { level: 0 },
    ),
  );
}
function root(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-import-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("ZIP dot-root markers import nested files and assets with exact round-trip bytes", async (t) => {
  const files = await readZip(
    zip({
      "./": "",
      "./paper/": "",
      "./paper/main.tex": source,
      "./paper/sections/./method.tex": "Nested Ω source",
      "./paper/figures/plot.png": new Uint8Array([0, 1, 2, 255]),
      "./paper/scripts/helper.py": "raise Exception('must not execute')",
    }),
  );
  const store = new Store(root(t));
  try {
    const project = store.create("Dot-root example", files);
    assert.equal(project.root, "main.tex");
    assert.equal(
      store.readText(project.id, "sections/method.tex").content,
      "Nested Ω source",
    );
    assert.deepEqual(await readZip(writeZip(files)), files);
    assert.deepEqual(
      store.exportFiles(project.id).find((f) => f.path === "figures/plot.png")
        ?.data,
      Buffer.from([0, 1, 2, 255]),
    );
  } finally {
    store.close();
  }
});

test("ZIP hidden files and Mac metadata are skipped and reported while visible source survives", async () => {
  const skipped: SkippedArchiveEntry[] = [];
  const files = await readZip(
    zip({
      "./paper/main.tex": source,
      "./paper/.gitignore": "build/",
      "./paper/.git/config": "synthetic config",
      "./paper/.env": "SYNTHETIC_SECRET=never-import",
      "./paper/.latexmkrc": "die 'must not execute';",
      "./paper/._main.tex": "AppleDouble metadata",
      "./paper/.DS_Store": "Finder metadata",
      "./__MACOSX/._paper": "AppleDouble metadata",
    }),
    (entry) => skipped.push(entry),
  );
  assert.deepEqual(files, [{ path: "main.tex", data: Buffer.from(source) }]);
  assert.equal(skipped.length, 7);
  assert.equal(skipped.filter((e) => e.reason === "metadata").length, 3);
  assert.ok(skipped.some((e) => e.path === "paper/.env"));
  assert.ok(!JSON.stringify(skipped).includes("never-import"));
});

test("ZIP normalization still rejects traversal, protected paths, backslashes and collisions", async () => {
  for (const name of [
    "../outside.tex",
    "./paper/../outside.tex",
    "/absolute.tex",
    "a\\b.tex",
    "a//b.tex",
    "paper/holdout/private.tex",
    "paper/.git/holdout/private.tex",
  ])
    await assert.rejects(readZip(zip({ [name]: "synthetic" })), name);
  await assert.rejects(
    readZip(zip({ "./main.tex": source, "main.tex": source })),
    /duplicate/,
  );
  await assert.rejects(
    readZip(zip({ "./A.tex": source, "a.tex": source })),
    /collision/,
  );
});

test("ZIP ignored entries cannot bypass symlink, encryption or expanded-size checks", async () => {
  for (const kind of ["symlink", "encrypted", "oversized"]) {
    const bytes = zip({ ".hidden": "synthetic", "main.tex": source });
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (kind === "symlink")
      bytes.writeUInt32LE((0xa1ff * 65536) >>> 0, central + 38);
    if (kind === "encrypted")
      bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 1, central + 8);
    if (kind === "oversized")
      bytes.writeUInt32LE(50 * 1024 * 1024 + 1, central + 24);
    await assert.rejects(readZip(bytes), kind);
  }
});

test("ZIP import API returns the project and omissions, and rejects metadata-only archives", async (t) => {
  const { app, store } = await createApp(root(t));
  t.after(() => app.close());
  const send = (payload: Buffer) =>
    app.inject({
      method: "POST",
      url: "/api/import",
      headers: {
        host: "127.0.0.1:4317",
        "x-prism-request": "1",
        "content-type": "multipart/form-data; boundary=prism-import-test",
      },
      payload: Buffer.concat([
        Buffer.from(
          '--prism-import-test\r\nContent-Disposition: form-data; name="file"; filename="example.zip"\r\nContent-Type: application/zip\r\n\r\n',
        ),
        payload,
        Buffer.from("\r\n--prism-import-test--\r\n"),
      ]),
    });
  const imported = await send(
    zip({ "./main.tex": source, ".gitignore": "build/" }),
  );
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().root, "main.tex");
  assert.deepEqual(imported.json().skippedEntries, [
    { path: ".gitignore", reason: "hidden" },
  ]);
  const count = store.list().length;
  const empty = await send(zip({ ".DS_Store": "metadata" }));
  assert.equal(empty.statusCode, 400);
  assert.match(empty.json().error, /no importable project files/);
  assert.equal(store.list().length, count);
});

test("ZIP drop handling prevents navigation and validates file count, extension and size", () => {
  let prevented = false;
  const file = { name: "project.ZIP", size: 12 };
  const selected = droppedArchives({
    preventDefault: () => {
      prevented = true;
    },
    dataTransfer: { files: [file] } as unknown as DataTransfer,
  });
  assert.equal(prevented, true);
  assert.deepEqual(selected, [file]);
  assert.equal(validateArchiveSelection(selected), null);
  assert.match(validateArchiveSelection([])!, /one project/);
  assert.match(validateArchiveSelection([file, file])!, /one project/);
  assert.match(
    validateArchiveSelection([{ name: "project.pdf", size: 12 }])!,
    /\.zip/,
  );
  assert.match(
    validateArchiveSelection([
      { name: "project.zip", size: 100 * 1024 * 1024 + 1 },
    ])!,
    /100 MB/,
  );
});
