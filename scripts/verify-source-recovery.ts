import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { SourceDrafts, type DraftStorage } from "../src/source-drafts";
import { supervisorIdentity, processGroup } from "../server/supervision";

for (const key of [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
])
  delete process.env[key];
const root = path.resolve(
    "data/verification/source-recovery-real-" + Date.now(),
  ),
  results: { name: string; passed: boolean }[] = [];
let app = await createApp(root, { seed: false }),
  generations = 0;
const guard = () => {
  app.ai.providerRunner = async () => {
    generations++;
    throw Error("No provider request is part of this verification.");
  };
};
guard();
const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
async function request(
  method: "GET" | "PUT" | "POST",
  url: string,
  payload?: unknown,
  expected = 200,
) {
  const reply = await app.app.inject({
    method,
    url: "/api" + url,
    headers,
    ...(payload === undefined ? {} : { payload: payload as any }),
  });
  assert.equal(reply.statusCode, expected, reply.body);
  return reply.json();
}
const pass = (name: string) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
class Memory implements DraftStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
try {
  const raced: {
    id: string;
    chosen: string;
    external: string;
    draft: unknown;
  }[] = [];
  for (const action of ["disk", "editor"] as const)
    for (const boundary of [1, 2]) {
      const p = app.store.create("Synthetic interleaved conflict", [
          {
            path: "main.tex",
            data: Buffer.from("Original reviewed source.\n"),
          },
        ]),
        base = `/projects/${p.id}`,
        file = path.join(app.store.projectDir(p.id), "main.tex"),
        candidate = "Unsaved candidate 👩🏽‍💻 e\u0301\n",
        external = `External process at boundary ${boundary}.\n`,
        draft = {
          id: "prism:source-draft:v1:" + randomUUID(),
          project: p.id,
          path: "main.tex",
          revision: 0,
          sequence: 1,
          updated: Date.now(),
          text: candidate,
        };
      await request("PUT", base + "/source-drafts", draft);
      const review = await request("GET", base + "/disk?path=main.tex"),
        inspect = app.store.disk.inspect.bind(app.store.disk),
        snapshot = () =>
          JSON.stringify({
            project: app.store.project(p.id),
            files: app.store.exportFiles(p.id),
            history: app.store.checkpoints(p.id),
            versions: app.store.db
              .prepare("SELECT * FROM versions WHERE project=?")
              .all(p.id),
            receipts: app.store.db
              .prepare("SELECT * FROM file_disk_state WHERE project=?")
              .all(p.id),
          }),
        before = snapshot();
      let reads = 0;
      app.store.disk.inspect = (id, name) => {
        const actual = inspect(id, name);
        if (id === p.id && name === "main.tex" && ++reads === boundary) {
          const writer = spawnSync(
            process.execPath,
            [
              "-e",
              "require('node:fs').writeFileSync(process.argv[1],process.argv[2])",
              file,
              external,
            ],
            { env: {}, encoding: "utf8" },
          );
          assert.equal(writer.status, 0, writer.stderr);
        }
        return actual;
      };
      try {
        await request(
          "POST",
          base + "/disk/resolve",
          {
            path: "main.tex",
            token: review.token,
            action,
            content: candidate,
          },
          409,
        );
      } finally {
        app.store.disk.inspect = inspect;
      }
      assert.equal(snapshot(), before);
      assert.equal(fs.readFileSync(file, "utf8"), external);
      assert.deepEqual(await request("GET", base + "/source-drafts"), [draft]);
      const fresh = await request("GET", base + "/disk?path=main.tex");
      const resolved = await request("POST", base + "/disk/resolve", {
        path: "main.tex",
        token: fresh.token,
        action,
        content: candidate,
      });
      const chosen = action === "disk" ? external : candidate;
      assert.equal(resolved.file.content, chosen);
      assert.equal(fs.readFileSync(file, "utf8"), chosen);
      raced.push({ id: p.id, chosen, external, draft });
      pass(
        `interleaved ${action} boundary ${boundary} rejects stale choice without metadata writes, then accepts a fresh review`,
      );
    }
  await app.app.close();
  app = await createApp(root, { seed: false });
  guard();
  for (const p of raced) {
    const texts = app.store.checkpoints(p.id).flatMap((checkpoint) =>
      app.store
        .exportCheckpoint(p.id, checkpoint.id)
        .filter((f) => f.path === "main.tex")
        .map((f) => f.data.toString()),
    );
    assert(texts.includes("Original reviewed source.\n"));
    assert(texts.includes(p.external));
    assert.equal(app.store.readText(p.id, "main.tex").content, p.chosen);
    assert.equal(
      fs.readFileSync(
        path.join(app.store.projectDir(p.id), "main.tex"),
        "utf8",
      ),
      p.chosen,
    );
    assert.deepEqual(await request("GET", `/projects/${p.id}/source-drafts`), [
      p.draft,
    ]);
  }
  pass(
    "all four interleaved resolutions retain original/external history, exact chosen bytes and separate drafts after backend reopen",
  );
  const source =
    "\\documentclass{article}\n\\begin{document}\n\\section{Recoverable writing}\nOriginal saved manuscript.\n\\input{sections/results}\n\\end{document}\n";
  const project = app.store.create("Synthetic source recovery", [
      { path: "main.tex", data: Buffer.from(source) },
      {
        path: "sections/results.tex",
        data: Buffer.from("An included local result.\n"),
      },
    ]),
    base = `/projects/${project.id}`,
    file = path.join(app.store.projectDir(project.id), "main.tex");
  const drafts = new SourceDrafts(new Memory(), "verification", () => 1),
    candidate = source.replace(
      "Original saved manuscript.",
      "Recovered writing after interruption. % 新文本 👩🏽‍💻 e\u0301",
    );
  const draft = drafts.write(project.id, "main.tex", 0, candidate, source);
  await request("PUT", base + "/source-drafts", draft);
  assert.equal(app.store.readText(project.id, "main.tex").content, source);
  assert.equal(fs.readFileSync(file, "utf8"), source);
  const history = app.store.checkpoints(project.id);
  await app.app.close();
  app = await createApp(root, { seed: false });
  guard();
  assert.deepEqual(await request("GET", base + "/source-drafts"), [draft]);
  assert.deepEqual(app.store.checkpoints(project.id), history);
  assert.equal(app.store.readText(project.id, "main.tex").content, source);
  assert.deepEqual(
    app.store.exportFiles(project.id).map((f) => f.path),
    ["main.tex", "sections/results.tex"],
  );
  pass(
    "confirmed SQLite draft survives reopen without source/history mutation or export leakage",
  );

  const external = source.replace(
    "Original saved manuscript.",
    "External writer preserved in history.",
  );
  fs.writeFileSync(file, external);
  const review = await request("GET", base + "/disk?path=main.tex");
  assert.equal(review.changed, true);
  assert.equal(review.disk.content, external);
  const later = external.replace(
    "External writer preserved in history.",
    "Later external writer preserved in history.",
  );
  fs.writeFileSync(file, later);
  await request(
    "POST",
    base + "/disk/resolve",
    {
      path: "main.tex",
      token: review.token,
      action: "editor",
      content: candidate,
    },
    409,
  );
  assert.equal(fs.readFileSync(file, "utf8"), later);
  assert.equal(app.store.readText(project.id, "main.tex").content, source);
  pass(
    "second external change invalidates approval without replacing either source",
  );

  const fresh = await request("GET", base + "/disk?path=main.tex"),
    inode = fs.statSync(file).ino;
  await request("POST", base + "/disk/resolve", {
    path: "main.tex",
    token: fresh.token,
    action: "disk",
  });
  assert.equal(fs.readFileSync(file, "utf8"), later);
  assert.equal(fs.statSync(file).ino, inode);
  assert.equal(
    (await request("GET", base + "/source-drafts"))[0].text,
    candidate,
  );
  pass(
    "Use disk imports exact bytes without rewriting and retains separate unsaved draft",
  );

  const chosen = await request("GET", base + "/disk?path=main.tex");
  const saved = await request("POST", base + "/disk/resolve", {
    path: "main.tex",
    token: chosen.token,
    action: "editor",
    content: candidate,
  });
  assert.equal(saved.file.content, candidate);
  assert.equal(fs.readFileSync(file, "utf8"), candidate);
  app.store.automaticCheckpoint(project.id);
  const versions = app.store.checkpoints(project.id).flatMap((c) =>
    app.store
      .exportCheckpoint(project.id, c.id)
      .filter((f) => f.path === "main.tex")
      .map((f) => f.data.toString()),
  );
  for (const text of [source, later, candidate])
    assert.ok(versions.includes(text));
  pass(
    "reviewed editor choice retains original, external and chosen text in exact history",
  );

  const cleared = drafts.discard(draft);
  await request("PUT", base + "/source-drafts", cleared);
  const delayed = await request("PUT", base + "/source-drafts", draft);
  assert.equal(delayed.cleared, true);
  assert.equal(delayed.text, "");
  await app.app.close();
  app = await createApp(root, { seed: false });
  guard();
  assert.equal(
    (await request("GET", base + "/source-drafts"))[0].cleared,
    true,
  );
  assert.equal(app.store.readText(project.id, "main.tex").content, candidate);
  pass("cleared draft stays cleared through delayed writes and backend reopen");

  const job = app.compiler.start(project.id),
    deadline = Date.now() + 30000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > deadline) {
      app.compiler.cancel(job.id);
      throw Error("Verification deadline; compiler cancellation requested.");
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(job.status, "succeeded", job.log);
  const identity = supervisorIdentity(app.compiler.dir(job.id));
  assert.ok(identity);
  assert.deepEqual(processGroup(identity.pid), []);
  const output = spawnSync("pdftotext", [app.compiler.pdfPath(job.id), "-"], {
    encoding: "utf8",
  });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /Recovered writing after interruption/);
  assert.match(output.stdout, /An included local result/);
  assert.equal(generations, 0);
  assert.deepEqual(app.store.runs(project.id), []);
  assert.deepEqual(app.store.conversations(project.id), []);
  pass(
    "recovered manuscript compiles through real confined LaTeX with no AI and drained process group",
  );
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        date: new Date().toISOString(),
        results,
        job: job.id,
        pdfText: output.stdout,
        generations,
      },
      null,
      2,
    ),
  );
  console.log("Report: " + path.join(root, "report.json"));
} finally {
  await app.app.close();
}
