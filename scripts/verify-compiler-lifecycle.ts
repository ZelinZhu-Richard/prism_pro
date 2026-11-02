import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app";
import { Compiler } from "../server/compiler";
import { Store } from "../server/store";
import {
  processGroup,
  supervisorIdentity,
  supervisorResult,
} from "../server/supervision";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out: " + label);
    await pause(15);
  }
}
function neutral(store: Store, id: string) {
  return JSON.stringify({
    project: store.project(id),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.directory, f.data.toString("base64")]),
    history: store.checkpoints(id),
  });
}
const finite = String.raw`\documentclass{article}
\begin{document}Genuine lifecycle baseline.\end{document}`;
const infiniteTex = String.raw`\documentclass{article}
\begin{document}Unfinished build.\newpage\loop\iftrue\repeat\end{document}`;
const infinitePs = String.raw`\documentclass{article}
\begin{document}Unfinished converter.\special{ps: {} loop}\end{document}`;

if (process.argv[2] === "worker") {
  const root = process.argv[3],
    stage = process.argv[4];
  const f = await createApp(root, {
    seed: false,
    dist: path.join(root, "absent-dist"),
  });
  const p = f.store.create("Synthetic lifecycle", [
    { path: "main.tex", data: Buffer.from(finite) },
  ]);
  if (stage === "gs") f.store.update(p.id, { engine: "latex" });
  const good = f.compiler.start(p.id);
  await until(
    () => good.status === "succeeded" || good.status === "failed",
    "baseline",
  );
  assert.equal(good.status, "succeeded", good.log);
  const file = f.store.readText(p.id, "main.tex");
  f.store.save(
    p.id,
    file.path,
    stage === "gs" ? infinitePs : infiniteTex,
    file.revision,
  );
  f.store.automaticCheckpoint(p.id, "Before lifecycle probe");
  f.compiler.configure(p.id, {
    mode: "normal",
    errorHandling: "continue",
    revision: 0,
  });
  const before = neutral(f.store, p.id),
    job = f.compiler.start(p.id);
  const identity = supervisorIdentity(f.compiler.dir(job.id))!;
  if (stage !== "early")
    await until(() => {
      const group = spawnSync(
        "/bin/ps",
        ["-g", String(identity.pid), "-o", "command="],
        { encoding: "utf8" },
      ).stdout;
      return stage === "gs"
        ? /\/gs(?: |$)/m.test(group)
        : /\bpdflatex\b/.test(group) && job.log.includes("article.cls");
    }, "actual compiler stage");
  process.on("message", async (message: any) => {
    if (message?.type === "exit") process.exit(0);
    if (message?.type === "close") {
      await f.app.close();
      assert.deepEqual(processGroup(identity.pid), []);
      process.send?.({
        type: "closed",
        status: job.status,
        processes: f.compiler.processes.size,
      });
      process.exit(0);
    }
  });
  process.send?.({
    type: "ready",
    backend: process.pid,
    pid: identity.pid,
    token: identity.token,
    job: job.id,
    project: p.id,
    good: good.id,
    before,
  });
} else {
  const root = path.resolve(
    "data/verification/compiler-lifecycle-" + Date.now(),
  );
  fs.mkdirSync(root, { recursive: true });
  const results: unknown[] = [];
  for (const [action, stage] of [
    ["exit", "tex"],
    ["kill", "tex"],
    ["kill", "gs"],
    ["exit", "early"],
    ["close", "tex"],
  ]) {
    const dir = path.join(root, action + "-" + stage);
    const backend = spawn(
      process.execPath,
      ["--import", "tsx", fileURLToPath(import.meta.url), "worker", dir, stage],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, LANG: "en_US.UTF-8" },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    let ready: any,
      closed: any,
      error = "";
    backend.on("message", (message: any) => {
      if (message?.type === "ready") ready = message;
      if (message?.type === "closed") closed = message;
    });
    backend.stderr!.on("data", (b) => {
      error = (error + b.toString()).slice(-10000);
    });
    let reopened: Store | undefined, recovered: Compiler | undefined;
    try {
      await until(() => !!ready || backend.exitCode !== null, "backend ready");
      assert.ok(ready, error);
      assert.equal(ready.backend, backend.pid);
      assert.ok(ready.pid > 1);
      const jobDir = path.join(dir, "builds", ready.job);
      // Seed a *known earlier valid PDF*, not simulated compiler success, to
      // prove interruption gates output even when usable bytes are present.
      if (stage !== "early")
        fs.copyFileSync(
          path.join(dir, "builds", ready.good, "out/main.pdf"),
          path.join(jobDir, "out/main.pdf"),
        );
      if (action === "kill") backend.kill("SIGKILL");
      else backend.send({ type: action });
      await until(
        () => backend.exitCode !== null || backend.signalCode !== null,
        "backend exit",
      );
      reopened = new Store(dir);
      recovered = new Compiler(reopened);
      const job = recovered.jobs.get(ready.job)!;
      const observedBusy = (processGroup(ready.pid)?.length ?? 0) > 0;
      if (observedBusy) {
        assert.equal(job.status, "running");
        assert.throws(() => recovered!.start(ready.project), /already running/);
      }
      await until(
        () => !["queued", "running"].includes(job.status),
        "restart cleanup",
      );
      assert.deepEqual(processGroup(ready.pid), []);
      assert.equal(job.status, action === "close" ? "cancelled" : "failed");
      assert.equal(job.pdf, false);
      assert.equal(recovered.latestPdf(ready.project)?.id, ready.good);
      assert.equal(neutral(reopened, ready.project), ready.before);
      const identity = supervisorIdentity(jobDir)!;
      assert.equal(identity.token, ready.token);
      const result = supervisorResult(jobDir, identity);
      assert.equal(
        result?.reason,
        action === "close" ? "cancel" : "parent-lost",
      );
      if (action === "close") {
        assert.deepEqual(closed, {
          type: "closed",
          status: "cancelled",
          processes: 0,
        });
        assert.equal(backend.exitCode, 0, error);
      }
      const file = reopened.readText(ready.project, "main.tex");
      reopened.save(ready.project, file.path, finite, file.revision);
      const next = recovered.start(ready.project);
      await until(
        () => !["running", "queued"].includes(next.status),
        "next successful build",
      );
      assert.equal(next.status, "succeeded", next.log);
      results.push({
        action,
        stage,
        root: dir,
        backend: ready.backend,
        group: ready.pid,
        job: ready.job,
        status: job.status,
        reason: result?.reason,
        observedBusy,
        sourceHistoryExact: true,
        lastSuccessRetained: true,
        seededPdfRejected: stage !== "early",
        next: next.id,
      });
      console.log("PASS " + action + " / " + stage);
    } finally {
      if (backend.connected) backend.send({ type: "exit" }, () => {});
      if (backend.exitCode === null && backend.signalCode === null)
        backend.kill("SIGKILL");
      if (ready)
        await until(
          () => processGroup(ready.pid)?.length === 0,
          "owned group cleanup",
        );
      await recovered?.shutdown();
      reopened?.close();
      fs.writeFileSync(
        path.join(root, "report.json"),
        JSON.stringify({ root, results }, null, 2),
      );
    }
  }
  console.log(JSON.stringify({ root, cases: results.length }));
}
