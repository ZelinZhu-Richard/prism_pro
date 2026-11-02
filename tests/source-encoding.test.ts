import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../server/store";
import { SourceRecovery } from "../server/source-recovery";
import { Intelligence } from "../server/intelligence";
import { Tracking } from "../server/tracking";
import { HistoryRecovery } from "../server/history-recovery";
import { createApp } from "../server/app";
import { readZip, writeZip } from "../server/files";
const legacy = Buffer.concat([
  Buffer.from("Legacy caf"),
  Buffer.from([0xe9]),
  Buffer.from("\r\n"),
]);
function fixture(t: any) {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/source-encoding-test-"),
    ),
    store = new Store(root),
    p = store.create("Synthetic byte preservation", [
      { path: "main.tex", data: Buffer.from("Original UTF-8 👩🏽‍💻 é\n") },
      { path: "legacy.tex", data: legacy },
      {
        path: "legacy.bib",
        data: Buffer.concat([
          Buffer.from("@book{legacy,title={caf"),
          Buffer.from([0xe9]),
          Buffer.from("}}\n"),
        ]),
      },
      {
        path: "refs.bib",
        data: Buffer.from("@book{valid,title={Valid reference}}\n"),
      },
    ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const snapshot = () =>
    JSON.stringify({
      p: store.project(p.id),
      files: store.exportFiles(p.id),
      history: store.checkpoints(p.id),
      versions: store.db.prepare("SELECT * FROM versions").all(),
      receipts: store.db.prepare("SELECT * FROM file_disk_state").all(),
    });
  return {
    root,
    store,
    p,
    snapshot,
    file: (name: string) => path.join(store.projectDir(p.id), name),
  };
}
test("non-UTF-8 indexed source never enters the editable text API through replacement decoding", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  assert.throws(
    () => f.store.readText(f.p.id, "legacy.tex"),
    (e: any) => e.statusCode === 415 && /not valid UTF-8/.test(e.message),
  );
  assert.equal(f.snapshot(), before);
  assert.deepEqual(fs.readFileSync(f.file("legacy.tex")), legacy);
});
test("ordinary source save cannot implicitly convert legacy bytes or create write intent/history", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  assert.throws(
    () => f.store.save(f.p.id, "legacy.tex", "Legacy café\r\n", 0),
    (e: any) =>
      e.statusCode === 415 && /Download it from Files/.test(e.message),
  );
  assert.equal(f.snapshot(), before);
  assert.deepEqual(fs.readFileSync(f.file("legacy.tex")), legacy);
});
test("unpaired UTF-16 input is rejected before source, history or disk receipts change", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  for (const content of ["Broken \ud800", "Broken \udc00"])
    assert.throws(
      () => f.store.save(f.p.id, "main.tex", content, 0),
      (e: any) => e.statusCode === 400 && /Unicode/.test(e.message),
    );
  assert.equal(f.snapshot(), before);
});
test("recovered text validation precedes adoption of a valid external version", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file("main.tex"), "External version\n");
  const recovery = new SourceRecovery(f.store),
    review = recovery.review(f.p.id, "main.tex"),
    before = f.snapshot();
  assert.throws(
    () =>
      recovery.resolve(f.p.id, {
        path: "main.tex",
        token: review.token,
        action: "editor",
        content: "Broken \ud800",
      }),
    (e: any) => e.statusCode === 400,
  );
  assert.equal(f.snapshot(), before);
  assert.equal(
    fs.readFileSync(f.file("main.tex"), "utf8"),
    "External version\n",
  );
});
test("one legacy source does not poison valid bibliography indexing or produce lossy entries", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    index = new Intelligence(f.store).get(f.p.id);
  assert.deepEqual(
    index.citations.map((c) => c.key),
    ["valid"],
  );
  for (const name of ["legacy.tex", "legacy.bib"])
    assert(index.warnings.some((w) => w.includes(name) && w.includes("UTF-8")));
  assert.equal(f.snapshot(), before);
});
test("valid UTF-8 including BOM, CRLF, graphemes and an intentional replacement character stays exact", (t) => {
  const f = fixture(t),
    text = "\ufeffCafé 新文本 👩🏽‍💻 e\u0301 �\r\n",
    saved = f.store.save(f.p.id, "main.tex", text, 0);
  assert.equal(saved.content, text);
  assert.equal(f.store.readText(f.p.id, "main.tex").content, text);
  assert.deepEqual(fs.readFileSync(f.file("main.tex")), Buffer.from(text));
});
test("legacy bytes remain exact in source ZIPs and history without replacement-decoded comparisons", async (t) => {
  const f = fixture(t),
    checkpoint = f.store.checkpoints(f.p.id)[0],
    zipped = await readZip(writeZip(f.store.exportFiles(f.p.id)));
  assert.deepEqual(zipped.find((e) => e.path === "legacy.tex")!.data, legacy);
  assert.deepEqual(
    f.store
      .exportCheckpoint(f.p.id, checkpoint.id)
      .find((e) => e.path === "legacy.tex")!.data,
    legacy,
  );
  const compared = f.store.historyFile(f.p.id, checkpoint.id, "legacy.tex");
  assert.equal(compared.before, null);
  assert.equal(compared.after, null);
  const tracking = new Tracking(f.store);
  tracking.mode(f.p.id, {
    enabled: true,
    revision: tracking.status(f.p.id).revision,
  });
  const next = Buffer.concat([legacy, Buffer.from("Changed bytes\n")]);
  f.store.transaction(() => {
    f.store.insert(f.p.id, "legacy.tex", next, "text", 1);
    f.store.touch(f.p.id);
  });
  f.store.materializeFile(f.p.id, "legacy.tex");
  const savedReview = f.store.checkpoint(f.p.id, "Legacy review bytes"),
    before = f.snapshot();
  assert.throws(
    () =>
      new HistoryRecovery(f.store).archived(f.p.id, savedReview.id, {
        path: "legacy.tex",
      }),
    (e: any) => e.statusCode === 415 && /Download version ZIP/.test(e.message),
  );
  assert.equal(f.snapshot(), before);
  assert.deepEqual(fs.readFileSync(f.file("legacy.tex")), next);
});
test("local file API rejects lossy reads/writes/new text while raw downloads keep original bytes", async (t) => {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/source-encoding-api-"),
    ),
    f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("API byte preservation", [
      { path: "legacy.tex", data: legacy },
    ]),
    base = `/api/projects/${p.id}`,
    headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
  const read = await f.app.inject({
    url: base + "/file?path=legacy.tex",
    headers,
  });
  assert.equal(read.statusCode, 415);
  const write = await f.app.inject({
    method: "PUT",
    url: base + "/file?path=legacy.tex",
    headers,
    payload: { revision: 0, content: "Converted implicitly" },
  });
  assert.equal(write.statusCode, 415);
  const add = await f.app.inject({
    method: "POST",
    url: base + "/file?path=new.tex",
    headers,
    payload: { content: "Broken \ud800" },
  });
  assert.equal(add.statusCode, 400);
  const raw = await f.app.inject({
    url: base + "/raw?path=legacy.tex",
    headers,
  });
  assert.equal(raw.statusCode, 200);
  assert.deepEqual(raw.rawPayload, legacy);
  assert(!f.store.fileList(p.id).some((e) => e.path === "new.tex"));
  assert.deepEqual(f.store.file(p.id, "legacy.tex").content, legacy);
});
