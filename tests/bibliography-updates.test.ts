import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { captureDirectory } from "../server/project-directories";
import type { BibliographyUpdates } from "../shared/bibliography-updates";
import type { DiskReview, SourceDraft } from "../shared/source-recovery";

const bibPath = "references/library.bib";
const initial =
  "@book{oldKey,title={Saved title},author={A. Author},year={2024}}\n";
const updated =
  "@book{newKey,title={Outside title},author={B. Author},year={2026}}\n";
const main =
  "\\documentclass{article}\n\\begin{document}\nFixture\n\\end{document}\n";

async function fixture(t: TestContext) {
  const root = path.resolve(
    "data/verification/bibliography-test-" + randomUUID(),
  );
  const folder = path.join(root, "project");
  const bib = path.join(folder, bibPath);
  fs.mkdirSync(path.dirname(bib), { recursive: true });
  fs.writeFileSync(path.join(folder, "main.tex"), main);
  fs.writeFileSync(bib, initial);
  const { app, store } = await createApp(path.join(root, "data"), {
    seed: false,
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.createLinked(
    "Bibliography preview",
    captureDirectory(folder),
    [
      { path: "main.tex", data: Buffer.from(main) },
      { path: bibPath, data: Buffer.from(initial) },
    ],
  );
  const base = `/api/projects/${project.id}`;
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const request = (
    route: string,
    method: "GET" | "PUT" | "POST" = "GET",
    payload?: object,
  ) => app.inject({ method, url: base + route, payload, headers });
  const preview = async (refresh = true) => {
    const response = await request(
      "/bibliography-updates" + (refresh ? "?refresh=1" : ""),
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json<BibliographyUpdates>();
  };
  const replace = (text: string) => {
    const temporary = path.join(root, "atomic-bib-replacement");
    fs.writeFileSync(temporary, text);
    fs.renameSync(temporary, bib);
  };
  return {
    app,
    store,
    root,
    bib,
    project,
    base,
    headers,
    request,
    preview,
    replace,
  };
}

test("a fresh external bibliography preview observes atomic replacements without adopting source or history", async (t) => {
  const f = await fixture(t);
  const before = f.store.checkpoints(f.project.id);
  assert.deepEqual((await f.preview()).files, []);
  f.replace(updated);
  const result = await f.preview();
  assert.equal(result.generation, f.project.generation);
  assert.equal(result.files[0].kind, "updated");
  assert.equal(result.files[0].citations[0].key, "newKey");
  assert.equal(result.files[0].citations[0].title, "Outside title");
  f.replace(updated.replace("Outside title", "Second title"));
  assert.equal((await f.preview()).files[0].citations[0].title, "Second title");
  assert.equal(f.store.readText(f.project.id, bibPath).content, initial);
  assert.deepEqual(f.store.checkpoints(f.project.id), before);
  assert.equal(
    (await f.request("/intelligence")).json().citations[0].key,
    "oldKey",
  );
});

test("review rejects a later external update and adoption reindexes without losing either draft", async (t) => {
  const f = await fixture(t);
  const drafts: SourceDraft[] = ["main.tex", bibPath].map((path) => ({
    id: "prism:source-draft:v1:" + JSON.stringify(["test", f.project.id, path]),
    project: f.project.id,
    path,
    text: "Uncommitted " + path,
    revision: 0,
    updated: 1,
    sequence: 1,
  }));
  for (const draft of drafts)
    assert.equal(
      (await f.request("/source-drafts", "PUT", draft)).statusCode,
      200,
    );
  f.replace(updated);
  const compare = async () =>
    (
      await f.request("/disk?path=" + encodeURIComponent(bibPath))
    ).json<DiskReview>();
  const review = await compare();
  const newer = updated.replace("Outside title", "Latest external title");
  f.replace(newer);
  const resolve = (token: string) =>
    f.request("/disk/resolve", "POST", {
      path: bibPath,
      token,
      action: "disk",
    });
  assert.equal((await resolve(review.token)).statusCode, 409);
  assert.equal(f.store.readText(f.project.id, bibPath).content, initial);
  const inode = fs.statSync(f.bib).ino;
  assert.equal((await resolve((await compare()).token)).statusCode, 200);
  assert.equal(fs.statSync(f.bib).ino, inode);
  assert.equal(fs.readFileSync(f.bib, "utf8"), newer);
  assert.equal(f.store.readText(f.project.id, "main.tex").content, main);
  assert.deepEqual((await f.preview()).files, []);
  assert.equal(
    (await f.request("/intelligence")).json().citations[0].title,
    "Latest external title",
  );
  const remaining = (await f.request("/source-drafts")).json<SourceDraft[]>();
  assert.deepEqual(
    remaining.map((draft) => draft.text).sort(),
    drafts.map((draft) => draft.text).sort(),
  );
});

test("bibliography previews mark missing, linked, non-UTF8 and oversized disk versions without exposing their bytes", async (t) => {
  const f = await fixture(t);
  fs.unlinkSync(f.bib);
  assert.equal((await f.preview()).files[0].kind, "deleted");
  const outside = path.join(f.root, "outside.bib");
  fs.writeFileSync(outside, "@book{private,title={Outside sentinel}}\n");
  fs.symlinkSync(outside, f.bib);
  const linked = (await f.preview()).files[0];
  assert.equal(linked.kind, "unavailable");
  assert.deepEqual(linked.citations, []);
  fs.unlinkSync(f.bib);
  fs.writeFileSync(f.bib, Buffer.from([0xff, 0xfe, 0x20]));
  assert.equal((await f.preview()).files[0].kind, "unavailable");
  fs.truncateSync(f.bib, 2 * 1024 * 1024 + 1);
  assert.equal((await f.preview()).files[0].kind, "unavailable");
  assert.equal(f.store.readText(f.project.id, bibPath).content, initial);
  assert.equal(
    (
      await f.app.inject({
        url: f.base + "/bibliography-updates",
        headers: { ...f.headers, origin: "https://outside.invalid" },
      })
    ).statusCode,
    403,
  );
});
