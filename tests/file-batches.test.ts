import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { FileBatches } from "../server/file-batches";
import { createApp } from "../server/app";
import { readZip, within } from "../server/files";
import { uploadPathIssue, UPLOAD_BYTES } from "../shared/file-batches";
import {
  selectedUploads,
  droppedUploads,
  sendUpload,
} from "../src/upload-files";

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-batches-")),
    store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic batches", [
    { path: "main.tex", data: Buffer.from("Original café.\r\n") },
    { path: "assets/old.bin", data: Buffer.from([0, 1, 255]) },
    { path: "empty", data: Buffer.alloc(0), directory: true },
    { path: "trash.txt", data: Buffer.from("Saved trash") },
  ]);
  store.trash(p.id, "trash.txt");
  store.automaticCheckpoint(p.id);
  const batches = new FileBatches(store);
  const request = (paths = ["assets"]) => ({
    paths,
    generation: store.project(p.id).generation,
    requestId: randomUUID(),
  });
  const upload = (
    files: { path: string; data: Buffer; directory?: boolean }[],
    destination = "",
  ) => {
    const review = batches.uploadPreview(p.id, {
      destination,
      entries: files.map((f) => ({
        path: f.path,
        size: f.data.length,
        directory: f.directory,
      })),
    });
    const indices = review.entries
      .filter((e) => e.status === "add" || e.status === "replace")
      .map((e) => e.index);
    const data = new Map(
      indices.filter((i) => !files[i].directory).map((i) => [i, files[i].data]),
    );
    return {
      review,
      input: { token: review.token, indices, requestId: randomUUID() },
      data,
    };
  };
  return { root, store, p, batches, request, upload };
}
test("upload review is read-only, merges folders and defaults conflicts to explicit statuses", (t) => {
  const { store, p, batches } = fixture(t),
    before = store.project(p.id),
    history = store.checkpoints(p.id);
  assert.throws(
    () =>
      batches.uploadPreview(p.id, {
        destination: "",
        entries: [
          { path: "main.tex", size: 5 },
          { path: "MAIN.tex", size: 3 },
        ],
      }),
    /collision/,
  );
  assert.deepEqual(store.project(p.id), before);
  assert.deepEqual(store.checkpoints(p.id), history);
});
test("nested uploads, binary bytes, explicit replacements, persistent replay and one-step Undo recover exact source", (t) => {
  const { root, store, p, batches, upload } = fixture(t),
    original = store.exportFiles(p.id);
  const u = upload([
    { path: "new/figure.bin", data: Buffer.from([0, 255, 3]) },
    { path: "main.tex", data: Buffer.from("Replacement 👩🏽‍🔬\n") },
    { path: "new/empty", data: Buffer.alloc(0), directory: true },
  ]);
  const result = batches.upload(p.id, u.input, u.data);
  assert.equal(result.project.generation, store.project(p.id).generation);
  assert.ok(
    store.file(p.id, "new/figure.bin").content.equals(Buffer.from([0, 255, 3])),
  );
  assert.equal(store.readText(p.id, "main.tex").content, "Replacement 👩🏽‍🔬\n");
  assert.equal(batches.upload(p.id, u.input, u.data).replayed, true);
  assert.throws(
    () =>
      batches.upload(
        p.id,
        u.input,
        new Map([
          [0, Buffer.from([1, 2, 3])],
          [1, Buffer.from("Replacement 👩🏽‍🔬\n")],
        ]),
      ),
    /identifier/,
  );
  const reopened = new Store(root);
  try {
    const again = new FileBatches(reopened);
    assert.equal(again.upload(p.id, u.input, u.data).replayed, true);
    assert.equal(again.list(p.id)[0].undoable, true);
    again.undo(p.id, result.operationId);
    for (const f of original)
      assert.deepEqual(reopened.file(p.id, f.path).content, f.data);
    assert.equal(reopened.file(p.id, "new/figure.bin", true).deleted, 1);
    assert.equal(again.undo(p.id, result.operationId).replayed, true);
  } finally {
    reopened.close();
  }
});
test("upload review reports active, Trash, case and prefix conflicts without reading file contents", (t) => {
  const { store, p, batches } = fixture(t),
    before = store.project(p.id),
    history = store.checkpoints(p.id);
  const r = batches.uploadPreview(p.id, {
    destination: "",
    entries: [
      { path: "assets", size: 0, directory: true },
      { path: "main.tex", size: 4 },
      { path: "trash.txt", size: 3 },
      { path: "empty/child.txt", size: 2 },
    ],
  });
  assert.deepEqual(
    r.entries.map((e) => e.status),
    ["merge", "replace", "blocked", "add"],
  );
  assert.equal(
    batches.uploadPreview(p.id, {
      destination: "",
      entries: [{ path: "MAIN.tex", size: 1 }],
    }).entries[0].status,
    "blocked",
  );
  assert.equal(
    batches.uploadPreview(p.id, {
      destination: "",
      entries: [{ path: "main.tex/child", size: 1 }],
    }).entries[0].status,
    "blocked",
  );
  assert.deepEqual(store.project(p.id), before);
  assert.deepEqual(store.checkpoints(p.id), history);
});
test("upload validation rejects unsafe/canonical duplicate paths, sizes, unknown destinations and stale or mismatched uploads", (t) => {
  const { store, p, batches, upload } = fixture(t);
  for (const name of [
    "../escape",
    "/absolute",
    "a\\b",
    "bad\0file",
    "x:drive",
    "holdout/x",
    ".env",
    "__MACOSX/file",
  ])
    assert.throws(() =>
      batches.uploadPreview(p.id, {
        destination: "",
        entries: [{ path: name, size: 1 }],
      }),
    );
  for (const entries of [
    [{ path: "a", size: -1 }],
    [{ path: "a", size: UPLOAD_BYTES + 1 }],
    [
      { path: "a", size: 1 },
      { path: "A", size: 1 },
    ],
    [
      { path: "a", size: 1 },
      { path: "a/b", size: 1 },
    ],
    [{ path: "a", size: 1, directory: true }],
  ])
    assert.throws(() =>
      batches.uploadPreview(p.id, { destination: "", entries }),
    );
  assert.throws(() =>
    batches.uploadPreview(p.id, {
      destination: "missing",
      entries: [{ path: "a", size: 1 }],
    }),
  );
  const u = upload([{ path: "good.txt", data: Buffer.from("abc") }]);
  assert.throws(
    () => batches.upload(p.id, u.input, new Map([[0, Buffer.from("ab")]])),
    /size/,
  );
  assert.throws(
    () =>
      batches.upload(
        p.id,
        u.input,
        new Map([
          [0, Buffer.from("abc")],
          [1, Buffer.from("x")],
        ]),
      ),
    /selection/,
  );
  store.save(p.id, "main.tex", "Concurrent edit", 0);
  assert.throws(() => batches.upload(p.id, u.input, u.data), /project changed/);
  assert.equal(
    store.fileList(p.id).some((f) => f.path === "good.txt"),
    false,
  );
});
test("batch Trash includes folder descendants once, preserves old Trash, restores together and undoes sequentially", (t) => {
  const { store, p, batches, request } = fixture(t),
    old = store.file(p.id, "assets/old.bin").content;
  const input = request(["assets", "assets/old.bin", "empty"]);
  const one = batches.state(p.id, "trash", input);
  assert.equal(one.changedFiles.length, 2);
  assert.equal(store.file(p.id, "trash.txt", true).revision, 1);
  assert.equal(batches.state(p.id, "trash", input).replayed, true);
  assert.throws(
    () => batches.state(p.id, "trash", { ...input, paths: ["main.tex"] }),
    /identifier/,
  );
  const restored = batches.state(p.id, "restore", request(["assets", "empty"]));
  assert.deepEqual(store.file(p.id, "assets/old.bin").content, old);
  batches.undo(p.id, restored.operationId);
  assert.equal(store.file(p.id, "assets/old.bin", true).deleted, 1);
  batches.undo(p.id, one.operationId);
  assert.deepEqual(store.file(p.id, "assets/old.bin").content, old);
  assert.equal(store.file(p.id, "empty").kind, "directory");
});
test("state operations reject stale generations and project locks; selection ZIP is exact, read-only and excludes Trash", async (t) => {
  const { store, p, batches, request } = fixture(t),
    r = request(["main.tex", "assets"]);
  const zip = await readZip(batches.download(p.id, r.paths, r.generation));
  assert.deepEqual(zip.map((f) => f.path).sort(), [
    "assets/old.bin",
    "main.tex",
  ]);
  for (const f of zip)
    assert.deepEqual(f.data, store.file(p.id, f.path).content);
  assert.throws(() => batches.download(p.id, ["trash.txt"], r.generation));
  store.projectLocks.set(p.id, "run");
  assert.throws(() => batches.state(p.id, "trash", r), /AI run/);
  store.projectLocks.clear();
  store.save(p.id, "main.tex", "New", 0);
  assert.throws(() => batches.state(p.id, "trash", r), /project changed/);
});
test("filesystem failures roll back files, SQLite, operation records and generation together", (t) => {
  const { store, p, batches, upload } = fixture(t),
    u = upload([{ path: "new.txt", data: Buffer.from("New") }]),
    before = store.project(p.id),
    original = fs.renameSync;
  fs.renameSync = ((from: any, to: any) => {
    if (String(from).includes("file-stage-"))
      throw new Error("simulated tree failure");
    return original(from, to);
  }) as typeof fs.renameSync;
  try {
    assert.throws(() => batches.upload(p.id, u.input, u.data), /tree failure/);
  } finally {
    fs.renameSync = original;
  }
  assert.deepEqual(store.project(p.id), before);
  assert.equal(batches.list(p.id).length, 0);
  assert.equal(
    fs.existsSync(path.join(store.projectDir(p.id), "new.txt")),
    false,
  );
  assert.equal(batches.upload(p.id, u.input, u.data).replayed, undefined);
});
test("external disk changes, unknown folder contents, symlinks and later edits prevent destructive overwrites", (t) => {
  const { store, p, batches, upload, request } = fixture(t),
    u = upload([{ path: "main.tex", data: Buffer.from("New") }]);
  fs.writeFileSync(path.join(store.projectDir(p.id), "main.tex"), "External");
  assert.throws(() => batches.upload(p.id, u.input, u.data), /outside Leaf/);
  fs.writeFileSync(
    path.join(store.projectDir(p.id), "main.tex"),
    store.file(p.id, "main.tex").content,
  );
  fs.writeFileSync(
    path.join(store.projectDir(p.id), "assets/unindexed.bin"),
    "Keep",
  );
  assert.throws(() => batches.state(p.id, "trash", request()), /disk-only/);
  assert.equal(
    fs.readFileSync(
      path.join(store.projectDir(p.id), "assets/unindexed.bin"),
      "utf8",
    ),
    "Keep",
  );
  const applied = batches.upload(p.id, u.input, u.data);
  store.save(p.id, "main.tex", "Later", 1);
  assert.throws(() => batches.undo(p.id, applied.operationId), /changed after/);
  const fresh = upload([{ path: "unsafe/file.txt", data: Buffer.from("No") }]);
  fs.symlinkSync(
    store.projectDir(p.id),
    path.join(store.projectDir(p.id), "unsafe"),
    "dir",
  );
  assert.throws(
    () => batches.upload(p.id, fresh.input, fresh.data),
    /Symlinks/,
  );
});
test("file-selection upload metadata skips hidden/system entries and rejects invalid paths before content reads", () => {
  assert.ok(uploadPathIssue("paper/.git/config").skip);
  assert.ok(uploadPathIssue("__MACOSX/._figure").skip);
  assert.ok(uploadPathIssue("../bad").error);
  assert.ok(uploadPathIssue("paper/holdout/data").error);
  assert.deepEqual(uploadPathIssue("研究/figure.png"), {});
});

test("multipart API accepts multiple nested files, preserves binary bytes, replays safely and enforces origins/manifests", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-upload-api-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("Synthetic API", [
      { path: "main.tex", data: Buffer.from("Original") },
      { path: "folder", directory: true, data: Buffer.alloc(0) },
    ]),
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const review = (
    await env.app.inject({
      method: "POST",
      url: `/api/projects/${p.id}/uploads/preview`,
      headers,
      payload: {
        destination: "folder",
        entries: [
          { path: "a.tex", size: 3 },
          { path: "nested/image.bin", size: 3 },
        ],
      },
    })
  ).json();
  const input = {
    token: review.token,
    indices: [0, 1],
    requestId: randomUUID(),
  };
  function multipart(request: any, parts: [string, Buffer][]) {
    const boundary = "PrismBoundary";
    return {
      headers: {
        ...headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\n\r\n${JSON.stringify(request)}\r\n`,
        ),
        ...parts.flatMap(([name, b]) => [
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
          ),
          b,
          Buffer.from("\r\n"),
        ]),
        Buffer.from(`--${boundary}--\r\n`),
      ]),
    };
  }
  const body = multipart(input, [
    ["file-0", Buffer.from("abc")],
    ["file-1", Buffer.from([0, 255, 9])],
  ]);
  const saved = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/uploads`,
    ...body,
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(
    env.store.file(p.id, "folder/nested/image.bin").content,
    Buffer.from([0, 255, 9]),
  );
  const replay = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/uploads`,
    ...body,
  });
  assert.equal(replay.json().replayed, true);
  const denied = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/uploads`,
    ...body,
    headers: { ...body.headers, origin: "https://outside.invalid" },
  });
  assert.equal(denied.statusCode, 403);
  const mismatch = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/uploads`,
    ...multipart({ ...input, requestId: randomUUID() }, [
      ["file-0", Buffer.from("ab")],
    ]),
  });
  assert.equal(mismatch.statusCode, 409); // stale preview is rejected before contents can mutate
  const malformed = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/uploads`,
    ...multipart(input, [
      ["file-0", Buffer.from("abc")],
      ["file-0", Buffer.from("abc")],
    ]),
  });
  assert.equal(malformed.statusCode, 400);
  const download = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/files/download`,
    headers,
    payload: {
      paths: ["folder"],
      generation: env.store.project(p.id).generation,
    },
  });
  assert.equal(download.statusCode, 200);
  assert.equal(
    (await readZip(download.rawPayload)).filter((f) => !f.directory).length,
    2,
  );
  const trash = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/files/trash`,
    headers,
    payload: {
      paths: ["folder"],
      generation: env.store.project(p.id).generation,
      requestId: randomUUID(),
    },
  });
  assert.equal(trash.statusCode, 200, trash.body);
  const undone = await env.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/file-batches/${trash.json().operationId}/undo`,
    headers,
    payload: {},
  });
  assert.equal(undone.statusCode, 200, undone.body);
});

test("process exits at each tree transaction boundary recover upload and Trash consistently", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-batch-crash-"));
  let store: Store | null = null;
  t.after(() => {
    store?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const kind of ["upload", "trash"])
    for (const phase of ["before", "replaced", "committed"]) {
      const dir = path.join(root, kind + "-" + phase);
      store = new Store(dir);
      const p = store.create("Crash fixture", [
        { path: "folder/paper.tex", data: Buffer.from("Original") },
        { path: "other.tex", data: Buffer.from("Untouched") },
      ]);
      store.close();
      store = null;
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "tests/fixtures/file-batch-crash.ts",
          dir,
          p.id,
          kind,
          phase,
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 15000 },
      );
      assert.equal(
        child.status,
        phase === "before" ? 71 : phase === "replaced" ? 72 : 73,
        child.stderr,
      );
      store = new Store(dir);
      const batches = new FileBatches(store),
        file = store.file(p.id, "folder/paper.tex", true),
        committed = phase === "committed";
      assert.equal(!!file.deleted, committed && kind === "trash");
      assert.equal(
        file.content.toString(),
        committed && kind === "upload" ? "Replacement" : "Original",
      );
      assert.equal(store.readText(p.id, "other.tex").content, "Untouched");
      assert.equal(batches.list(p.id).length, committed ? 1 : 0);
      if (committed) {
        batches.undo(p.id, batches.list(p.id)[0].id);
        assert.equal(
          store.readText(p.id, "folder/paper.tex").content,
          "Original",
        );
      }
      assert.equal(
        fs.existsSync(
          path.join(dir, "projects", p.id, "file-tree-operation.json"),
        ),
        false,
      );
      store.close();
      store = null;
    }
});

test("folder selection and batched directory drops preserve nested and empty folders without reading skipped metadata", async () => {
  const a = new File(["café"], "a.tex");
  Object.defineProperty(a, "webkitRelativePath", {
    value: "paper/sections/a.tex",
  });
  assert.equal(selectedUploads([a]).files[0].path, "paper/sections/a.tex");
  const hidden = new File(["never read"], ".env");
  assert.equal(selectedUploads([hidden]).skipped.length, 1);
  assert.throws(
    () =>
      selectedUploads([
        new File(["a"], "same.tex"),
        new File(["b"], "SAME.tex"),
      ]),
    /More than one/,
  );
  let reads = 0;
  const leaf = (name: string): any => ({
    name,
    isDirectory: false,
    isFile: true,
    file: (resolve: any) => {
      reads++;
      resolve(new File(["Text"], name));
    },
  });
  const dir = (name: string, children: any[]): any => ({
    name,
    isDirectory: true,
    isFile: false,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (resolve: any) => resolve(index++ === 0 ? children : []),
      };
    },
  });
  const transfer = {
    items: [
      {
        kind: "file",
        webkitGetAsEntry: () =>
          dir("paper", [
            dir("empty", []),
            dir(".git", [leaf("secret")]),
            leaf("a.tex"),
          ]),
      },
    ],
    files: [],
  } as any;
  const result = await droppedUploads(transfer);
  assert.equal(reads, 1);
  assert.deepEqual(
    result.files.map((f) => f.path),
    ["paper", "paper/empty", "paper/a.tex"],
  );
  assert.equal(result.skipped[0].path, "paper/.git");
});

test("upload transport reports progress, rejects incomplete responses and reuses the same retry body", async () => {
  const original = globalThis.XMLHttpRequest,
    created: any[] = [];
  class FakeXHR {
    status = 200;
    response: any = null;
    upload: any = {};
    headers: any = {};
    onload: any;
    onerror: any;
    ontimeout: any;
    url = "";
    form: any;
    constructor() {
      created.push(this);
    }
    open(method: string, url: string) {
      assert.equal(method, "POST");
      this.url = url;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send(form: any) {
      this.form = form;
    }
  }
  globalThis.XMLHttpRequest = FakeXHR as any;
  try {
    const form = new FormData();
    form.append("request", "synthetic");
    let progress = 0;
    const one = sendUpload("/projects/x/uploads", form, (p) => (progress = p)),
      xhr = created[0];
    assert.equal(xhr.url, "/api/projects/x/uploads");
    assert.equal(xhr.headers["X-Prism-Request"], "1");
    xhr.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 });
    assert.equal(progress, 50);
    xhr.onload();
    await assert.rejects(one, /incomplete/);
    const two = sendUpload("/projects/x/uploads", form, () => {});
    assert.equal(created[1].form, form);
    created[1].response = {
      project: { id: "x" },
      operationId: "same",
      changedFiles: [],
    };
    created[1].onload();
    assert.equal((await two).operationId, "same");
    assert.equal(created.length, 2);
  } finally {
    globalThis.XMLHttpRequest = original;
  }
});

test("dangling file and root symlinks are rejected before an upload can create their missing targets", (t) => {
  const { root, store, p, batches, upload } = fixture(t),
    outside = path.join(root, "must-not-be-created.tex"),
    link = path.join(store.projectDir(p.id), "broken.tex");
  fs.symlinkSync(outside, link);
  assert.throws(() => within(store.projectDir(p.id), "broken.tex"), /Symlinks/);
  const u = upload([
    { path: "broken.tex", data: Buffer.from("Never written") },
  ]);
  assert.throws(() => batches.upload(p.id, u.input, u.data), /Symlinks/);
  assert.equal(fs.existsSync(outside), false);
  const rootLink = path.join(root, "dangling-root");
  fs.symlinkSync(path.join(root, "absent-folder"), rootLink, "dir");
  assert.throws(() => within(rootLink, "file.tex"), /Symlinked/);
});
