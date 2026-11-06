import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { captureDirectory } from "../server/project-directories";
import type {
  LocalOpenResult,
  LocalOpenReview,
} from "../shared/local-projects";

const tex =
  "\\documentclass{article}\n\\begin{document}\n\\input{sections/one}\n\\end{document}\n";
const folder = (t: TestContext) => {
  const root = path.resolve(
      "data/verification/local-open-test-" + randomUUID(),
    ),
    source = path.join(root, "Ordinary paper"),
    data = path.join(root, "leaf");
  fs.mkdirSync(path.join(source, "sections"), { recursive: true });
  fs.writeFileSync(path.join(source, "main.tex"), tex);
  fs.writeFileSync(path.join(source, "sections/one.tex"), "Section.\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, source, data };
};

async function fixture(t: TestContext) {
  const f = folder(t),
    { app, store } = await createApp(f.data, { seed: false });
  t.after(() => app.close());
  const headers = { host: "127.0.0.1:5173", "x-prism-request": "1" };
  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url: "/api" + url, headers, payload });
  const review = async (payload: object) => {
    const result = await post("/local-projects/review", payload);
    assert.equal(result.statusCode, 200, result.body);
    return result.json<LocalOpenReview>();
  };
  const open = async (payload: object) => {
    const result = await post("/local-projects/open", payload);
    assert.equal(result.statusCode, 200, result.body);
    return result.json<LocalOpenResult>();
  };
  return { ...f, app, store, post, review, open };
}

test("reviewed folder opens in place with selected main, skips unsafe entries and retains nested bytes", async (t) => {
  const f = await fixture(t),
    main = path.join(f.source, "main.tex"),
    before = fs.statSync(main),
    input = { mode: "folder", path: f.source };
  fs.writeFileSync(
    path.join(f.source, ".latexmkrc"),
    "Not part of the opened project.",
  );
  fs.symlinkSync(main, path.join(f.source, "alias.tex"));
  fs.linkSync(
    path.join(f.source, "sections/one.tex"),
    path.join(f.source, "duplicate.tex"),
  );
  const preview = await f.review(input);
  assert.equal(preview.main, "main.tex");
  assert.equal(preview.skipped.length, 4);
  assert.equal(preview.files.length, 1);
  assert.equal(f.store.list().length, 0);
  const { project } = await f.open({
    ...input,
    token: preview.token,
    main: "main.tex",
  });
  assert.equal(project.root, "main.tex");
  assert.equal(project.storage?.folder, captureDirectory(f.source).path);
  assert.equal(fs.statSync(main).ino, before.ino);
  assert.equal(fs.statSync(main).mtimeMs, before.mtimeMs);
  assert.equal(fs.readFileSync(main, "utf8"), tex);
  assert.deepEqual(
    f.store.exportFiles(project.id).map((file) => file.path),
    ["main.tex"],
  );
  const reopened = await f.review(input);
  assert.equal(reopened.action, "open");
  assert.equal(
    (await f.open({ ...input, token: reopened.token })).project.id,
    project.id,
  );
});

test("opening a .tex file keeps its containing folder and rejects a stale inventory and foreign origin", async (t) => {
  const f = await fixture(t),
    input = { mode: "file", path: path.join(f.source, "main.tex") };
  const first = await f.review(input);
  assert.equal(first.file, "main.tex");
  assert(first.files.some((entry) => entry.path === "sections/one.tex"));
  fs.writeFileSync(
    path.join(f.source, "sections/one.tex"),
    "Edited after review.\n",
  );
  const changed = await f.post("/local-projects/open", {
    ...input,
    token: first.token,
  });
  assert.equal(changed.statusCode, 409);
  assert.equal(f.store.list().length, 0);
  const foreign = await f.app.inject({
    method: "POST",
    url: "/api/local-projects/review",
    headers: {
      host: "127.0.0.1:5173",
      origin: "https://foreign.test",
      "x-prism-request": "1",
    },
    payload: input,
  });
  assert.equal(foreign.statusCode, 403);
  const now = await f.review(input),
    opened = await f.open({ ...input, token: now.token });
  assert.equal(opened.file, "main.tex");
  assert.equal(
    f.store.readText(opened.project.id, "sections/one.tex").content,
    "Edited after review.\n",
  );
  const nested = {
      mode: "file",
      path: path.join(f.source, "sections/one.tex"),
    },
    nestedReview = await f.review(nested),
    nestedOpened = await f.open({ ...nested, token: nestedReview.token });
  assert.equal(nestedReview.action, "open");
  assert.equal(nestedOpened.project.id, opened.project.id);
  assert.equal(nestedOpened.project.root, "main.tex");
  assert.equal(nestedOpened.file, "sections/one.tex");
  const recorded = (
    await f.post(`/projects/${opened.project.id}/opened`, {})
  ).json<LocalOpenResult["project"]>();
  assert(recorded.lastOpenedAt);
  assert.equal(recorded.generation, opened.project.generation);
  assert.equal(recorded.updated, opened.project.updated);
});

test("open preview rejects broad, protected and app data paths before inventory", async (t) => {
  const f = await fixture(t);
  for (const name of [
    f.root,
    f.data,
    path.join(f.root, "holdout"),
    f.source + "/../Ordinary paper",
  ]) {
    const result = await f.post("/local-projects/review", {
      mode: "folder",
      path: name,
    });
    assert.equal(result.statusCode, 400, result.body);
  }
  assert.equal(f.store.list().length, 0);
});

test("opening the original moved folder relinks the saved project and history", async (t) => {
  const f = await fixture(t),
    original = { mode: "folder", path: f.source };
  const first = await f.review(original),
    { project } = await f.open({ ...original, token: first.token });
  const version = f.store.checkpoints(project.id)[0].id;
  const moved = path.join(f.root, "Relocated source");
  fs.renameSync(f.source, moved);
  fs.mkdirSync(f.source);
  fs.writeFileSync(path.join(f.source, "main.tex"), "Different folder.");
  assert.equal(f.store.project(project.id).storage?.available, false);
  const rejected = await f.post("/local-projects/review", {
    ...original,
    projectId: project.id,
  });
  assert.equal(rejected.statusCode, 409);
  const input = { mode: "folder", path: moved, projectId: project.id };
  const preview = await f.review(input);
  assert.equal(preview.action, "relink");
  const result = await f.open({ ...input, token: preview.token });
  assert.equal(result.project.id, project.id);
  assert.equal(result.project.storage?.available, true);
  assert.equal(f.store.checkpoints(project.id)[0].id, version);
  assert.equal(
    fs.readFileSync(path.join(f.source, "main.tex"), "utf8"),
    "Different folder.",
  );
});

test("a file missing at adoption is never recreated from the captured bytes", (t) => {
  const f = folder(t),
    store = new Store(f.data),
    main = path.join(f.source, "main.tex"),
    bytes = fs.readFileSync(main);
  t.after(() => store.close());
  fs.unlinkSync(main);
  assert.throws(
    () =>
      store.createLinked("Paper", captureDirectory(f.source), [
        { path: "main.tex", data: bytes },
      ]),
    /changed after the local folder review/,
  );
  assert(!fs.existsSync(main));
  assert.equal(store.list().length, 0);
});
