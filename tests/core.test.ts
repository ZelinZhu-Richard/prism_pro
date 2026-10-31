import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import {
  readZip,
  writeZip,
  safePath,
  within,
  validateTree,
} from "../server/files";
import { cheapest, models, CATALOG_DATE } from "../shared/catalog";
import { TypingBuffer, typingDelay } from "../src/typing";
import {
  compilerEnvironment,
  sandboxProfile,
  parseDiagnostics,
} from "../server/compiler";
import { allowedRequest, createApp } from "../server/app";
import { EditorState, Transaction } from "@codemirror/state";
import { history, undo, isolateHistory, undoDepth } from "@codemirror/commands";

const files = [
  { path: "main.tex", data: Buffer.from("before") },
  { path: "chapters/a.tex", data: Buffer.from("alpha") },
  { path: "figures/plot.png", data: Buffer.from([0, 1, 2, 255]) },
];
function fixture(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-test-"));
  const store = new Store(dir);
  t.after(() => {
    try {
      store.close();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return store;
}
test("ZIP round trip retains nested text and binary assets", async () => {
  const output = await readZip(writeZip(files));
  assert.deepEqual(
    output.map((f) => [f.path, f.data]),
    files.map((f) => [f.path, f.data]),
  );
});
test("ZIP strips one enclosing project directory", async () => {
  const output = await readZip(
    writeZip(files.map((f) => ({ ...f, path: "project/" + f.path }))),
  );
  assert.equal(output[0].path, "main.tex");
});
test("paths, ZIPs, case collisions and symlinks cannot escape managed files", async (t) => {
  for (const value of [
    "../secret",
    "/tmp/file",
    "a/../../x",
    "a\\b",
    "a//b",
    "a/.env",
    "holdout/x",
    "a:stream",
  ])
    assert.throws(() => safePath(value));
  assert.throws(() =>
    validateTree([
      { path: "a", data: Buffer.alloc(0) },
      { path: "a/file.tex", data: Buffer.alloc(0) },
    ]),
  );
  assert.throws(() =>
    validateTree([
      { path: "A.tex", data: Buffer.alloc(0) },
      { path: "a.tex", data: Buffer.alloc(0) },
    ]),
  );
  const store = fixture(t),
    p = store.create("P", files);
  const target = path.join(store.projectDir(p.id), "link");
  fs.symlinkSync(os.tmpdir(), target);
  assert.throws(() => within(store.projectDir(p.id), "link/file"));
  // Mutate a valid archive's same-length member name to traversal in both headers.
  const zip = writeZip([{ path: "aaa/x.tex", data: Buffer.from("x") }]);
  const unsafe = Buffer.from(zip);
  let at = 0;
  while ((at = unsafe.indexOf("aaa/x.tex", at)) >= 0) {
    unsafe.write("../x.tex", at);
    at += 8;
  }
  await assert.rejects(readZip(unsafe));
  const symlink = writeZip([{ path: "link", data: Buffer.from("/tmp") }]);
  const central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  symlink.writeUInt32LE((0xa1ff * 65536) >>> 0, central + 38);
  await assert.rejects(readZip(symlink), /symlink/);
  await assert.rejects(readZip(Buffer.alloc(100 * 1024 * 1024 + 1)), /100 MB/);
});
test("save revisions, atomic multi-file Apply/Undo and stale conflicts", (t) => {
  const s = fixture(t),
    p = s.create("P", files);
  const proposal: any = {
    id: "p",
    projectId: p.id,
    runId: "r",
    status: "pending",
    summary: "update",
    files: [
      { path: "main.tex", baseRevision: 0, before: "before", after: "after" },
      {
        path: "chapters/a.tex",
        baseRevision: 0,
        before: "alpha",
        after: "beta",
      },
    ],
  };
  s.saveProposal(proposal);
  s.applyProposal("p");
  assert.equal(s.readText(p.id, "chapters/a.tex").content, "beta");
  s.applyProposal("p", true);
  assert.equal(s.readText(p.id, "main.tex").content, "before");
  assert.equal(s.readText(p.id, "chapters/a.tex").content, "alpha");
  assert.throws(() => s.save(p.id, "main.tex", "stale", 0), /changed/);
  const current = s.readText(p.id, "main.tex");
  s.saveProposal({
    ...proposal,
    id: "stale",
    files: proposal.files.map((f: any) => ({ ...f, baseRevision: 2 })),
  });
  s.save(p.id, "chapters/a.tex", "new user edit", 2);
  assert.throws(() => s.applyProposal("stale"), /changed/);
  assert.deepEqual(s.readText(p.id, "main.tex"), current);
});
test("trash, checkpoint, rename and restart preserve exact contents", (t) => {
  const s = fixture(t),
    p = s.create("P", files);
  const checkpoint = s.checkpoint(p.id, "before");
  s.rename(p.id, "chapters", "sections");
  assert.equal(s.readText(p.id, "sections/a.tex").content, "alpha");
  s.trash(p.id, "main.tex");
  assert.throws(() => s.readText(p.id, "main.tex"));
  s.trash(p.id, "main.tex", true);
  s.restoreCheckpoint(p.id, checkpoint.id);
  assert.equal(s.readText(p.id, "chapters/a.tex").content, "alpha");
  assert.ok(fs.existsSync(path.join(s.projectDir(p.id), "chapters/a.tex")));
  const second = new Store(s.root);
  assert.equal(second.readText(p.id, "main.tex").content, "before");
  second.close();
});
test("manual typing buffers Unicode graphemes across arbitrary fragments", () => {
  const expected = "Ae\u0301 👩🏽‍🔬\n𝛼.\n\nEnd";
  for (let split = 1; split < expected.length; split++) {
    const b = new TypingBuffer();
    b.push(expected.slice(0, split));
    while (b.take()) {}
    b.push(expected.slice(split));
    b.complete();
    while (b.take()) {}
    assert.equal(b.visible, expected);
    assert.ok(b.finished);
  }
});
test("typing pause, speed changes, Stop and partial error preserve visible text", () => {
  const b = new TypingBuffer();
  b.push("Hello world");
  assert.equal(b.take(), "H");
  b.paused = true;
  b.push("!");
  assert.equal(b.take(true), "");
  b.paused = false;
  assert.equal(b.take(), "e");
  b.stop();
  b.push("discard");
  assert.equal(b.take(true), "");
  assert.equal(b.visible, "He");
  assert.ok(b.finished);
  assert.equal(typingDelay("a", 0), 0);
  assert.equal(
    typingDelay("a", 2, () => 0.5) * 2,
    typingDelay("a", 1, () => 0.5),
  );
  assert.ok(typingDelay(".", 1, () => 0.5) > typingDelay("a", 1, () => 0.5));
});
test("one CodeMirror undo restores selection replacement despite long typing gaps", () => {
  let state = EditorState.create({
    doc: "abc DEF xyz",
    selection: { anchor: 4, head: 7 },
    extensions: [
      history({
        newGroupDelay: 750,
        joinToEvent: (tr, adjacent) =>
          tr.isUserEvent("input.type.ai") || adjacent,
      }),
    ],
  });
  let cursor = 4;
  for (const [i, char] of [..."é🙂 result"].entries()) {
    state = state.update({
      changes: { from: cursor, to: i === 0 ? 7 : cursor, insert: char },
      selection: { anchor: cursor + char.length },
      annotations: [
        Transaction.userEvent.of(
          i === 0 ? "input.type.ai" : "input.type.compose",
        ),
        Transaction.time.of(100000 + i * 1500),
        ...(i === 0 ? [isolateHistory.of("before")] : []),
      ],
    }).state;
    cursor += char.length;
  }
  state = state.update({ annotations: isolateHistory.of("after") }).state;
  assert.equal(undoDepth(state), 1);
  undo({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.equal(state.doc.toString(), "abc DEF xyz");
  assert.equal(state.selection.main.from, 4);
  assert.equal(state.selection.main.to, 7);
});
test("routing handles availability, budgets, missing prices and stale catalog", () => {
  const date = new Date(CATALOG_DATE),
    available = models.map((m) => m.id);
  assert.equal(
    cheapest("openai", available, 2000, 4096, models, date)?.id,
    "gpt-6-luna",
  );
  assert.equal(
    cheapest("openai", ["gpt-6.1-sol"], 2000, 4096, models, date)?.id,
    "gpt-6.1-sol",
  );
  assert.equal(cheapest("openai", [], 2000, 4096, models, date), null);
  assert.equal(cheapest("openai", available, 100001, 4096, models, date), null);
  assert.equal(
    cheapest("openai", available, 2000, 4096, models, new Date("2028-01-01")),
    null,
  );
  assert.equal(
    cheapest(
      "openai",
      available,
      2000,
      4096,
      models.map((m) => ({ ...m, input: NaN })),
      date,
    ),
    null,
  );
});
test("Gemini routing honors access and promotional expiry; Qwen requires explicit regional pricing", () => {
  const date = new Date(CATALOG_DATE),
    available = models.map((m) => m.id);
  assert.equal(
    cheapest("gemini", available, 2000, 4096, models, date)?.id,
    "gemini-2.5-flash-lite",
  );
  assert.equal(
    cheapest("gemini", ["gemini-3.5-flash-lite"], 2000, 4096, models, date)?.id,
    "gemini-3.5-flash-lite",
  );
  assert.equal(
    cheapest(
      "gemini",
      ["gemini-3.8-flash"],
      2000,
      4096,
      models,
      new Date("2027-01-01"),
    ),
    null,
  );
  assert.equal(cheapest("gemini", [], 2000, 4096, models, date), null);
  assert.equal(cheapest("gemini", available, 100001, 4096, models, date), null);
  assert.equal(cheapest("qwen", available, 2000, 4096, models, date), null);
});
test("compiler has allowlisted environment and deny-default confinement", (t) => {
  const s = fixture(t);
  const env = compilerEnvironment(s.root);
  assert.deepEqual(
    Object.keys(env).sort(),
    [
      "HOME",
      "LANG",
      "LC_ALL",
      "PATH",
      "TEXMFCONFIG",
      "TEXMFOUTPUT",
      "TEXMFVAR",
      "TMPDIR",
      "openin_any",
      "openout_any",
      "shell_escape",
    ].sort(),
  );
  assert.equal(env.shell_escape, "f");
  const profile = sandboxProfile(s.root);
  assert.match(profile, /\(deny default\)/);
  assert.doesNotMatch(profile, /allow network/);
  assert.match(profile, /file-write.*subpath/);
  assert.match(profile, /out/);
  assert.match(profile, /home/);
  assert.deepEqual(
    parseDiagnostics(
      "./sections/a.tex:12: Undefined control sequence.",
      "main.tex",
    )[0],
    {
      severity: "error",
      path: "sections/a.tex",
      line: 12,
      message: "Undefined control sequence.",
    },
  );
});
test("HTTP rejects foreign origins and missing local mutation headers", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-http-"));
  const { app } = await createApp(dir, { seed: false, dist: "/nonexistent" });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.ok(allowedRequest("127.0.0.1:4317", "http://127.0.0.1:5173"));
  assert.equal(
    (await app.inject({ url: "/api/projects", headers: { host: "evil.test" } }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/projects",
        headers: { host: "127.0.0.1:4317", origin: "https://evil.test" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { host: "127.0.0.1:4317" },
        payload: { name: "x" },
      })
    ).statusCode,
    403,
  );
  const result = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { host: "127.0.0.1:4317", "x-prism-request": "1" },
    payload: { name: "test", blank: true },
  });
  assert.equal(result.statusCode, 200);
});
