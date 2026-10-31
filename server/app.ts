import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store";
import { Compiler, toolchain } from "./compiler";
import { Intelligence } from "./intelligence";
import { WordCounter } from "./word-count";
import { AI } from "./ai";
import { Keys } from "./providers";
import { AppError, readZip, writeZip, findRoots, safePath } from "./files";
import { demoFiles } from "./demo";
import { models, CATALOG_DATE } from "../shared/catalog";
import type { AiRequest, Provider, SkippedArchiveEntry } from "../shared/types";
import {
  isProvider,
  isApiProvider,
  isCliProvider,
  apiProviders,
  cliProviders,
} from "../shared/types";

export function allowedRequest(
  host: string | undefined,
  origin: string | undefined,
) {
  const hosts = [
    "127.0.0.1:4317",
    "localhost:4317",
    "127.0.0.1:5173",
    "localhost:5173",
  ];
  return (
    !!host &&
    hosts.includes(host) &&
    (!origin || hosts.some((h) => origin === "http://" + h))
  );
}
export async function createApp(
  dataDir: string,
  { seed = true, dist = path.resolve("dist") } = {},
) {
  const store = new Store(dataDir),
    compiler = new Compiler(store),
    keys = new Keys(),
    ai = new AI(store, compiler, keys),
    intelligence = new Intelligence(store),
    wordCounter = new WordCounter(store, compiler);
  if (seed && !store.list().length && !store.list(true).length)
    store.create("Small ideas, beautifully expressed", demoFiles);
  const app = Fastify({ logger: false, bodyLimit: 3 * 1024 * 1024 });
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 4 },
  });
  app.addHook("onRequest", async (req) => {
    if (!allowedRequest(req.headers.host, req.headers.origin))
      throw new AppError(
        403,
        "Prism only accepts requests from its local interface.",
      );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-prism-request"] !== "1"
    )
      throw new AppError(403, "Missing local request header.");
  });
  app.setErrorHandler((error: any, _req, reply) => {
    const status =
      error.statusCode && error.statusCode < 600 ? error.statusCode : 500;
    reply.code(status).send({
      error:
        status === 500
          ? "The operation could not be completed. Your saved files remain available."
          : error.message,
    });
  });
  const id = (req: any) => String(req.params.id),
    body = (req: any) => req.body ?? {},
    name = (req: any) => safePath(req.query.path);
  app.get("/api/health", async () => ({
    ok: true,
    toolchain: toolchain(),
    sandbox: process.platform === "darwin",
    catalogDate: CATALOG_DATE,
  }));
  app.get("/api/projects", async () => store.list());
  app.get("/api/projects/trash", async () => store.list(true));
  app.post("/api/projects/:id/trash", async (req) => {
    store.requireProject(id(req), true);
    if (
      compiler
        .list(id(req))
        .some((job) => ["queued", "running"].includes(job.status))
    )
      throw new AppError(
        409,
        "Finish or cancel the running compilation before moving this project to Trash.",
      );
    return store.trashProject(id(req));
  });
  app.post("/api/projects/:id/restore-project", async (req) =>
    store.trashProject(id(req), true),
  );
  app.post("/api/projects", async (req) =>
    store.create(
      String(body(req).name ?? "Untitled project"),
      body(req).blank
        ? [
            {
              path: "main.tex",
              data: Buffer.from(
                "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n",
              ),
            },
          ]
        : demoFiles,
    ),
  );
  app.get("/api/projects/:id", async (req) => ({
    ...store.project(id(req)),
    rootCandidates: findRoots(store.exportFiles(id(req))),
  }));
  app.patch("/api/projects/:id", async (req) =>
    store.update(id(req), body(req)),
  );
  app.get("/api/projects/:id/intelligence", async (req) =>
    intelligence.get(id(req)),
  );
  app.post("/api/projects/:id/word-count", async (req) =>
    wordCounter.count(id(req), body(req).includeBibliography === true),
  );
  app.get("/api/projects/:id/file", async (req) =>
    store.readText(id(req), name(req)),
  );
  app.get("/api/projects/:id/raw", async (req, reply) => {
    const f = store.file(id(req), name(req));
    return reply
      .type("application/octet-stream")
      .header("Content-Disposition", "attachment")
      .send(f.content);
  });
  app.put("/api/projects/:id/file", async (req) => {
    const b = body(req);
    if (typeof b.content !== "string" || !Number.isInteger(b.revision))
      throw new AppError(400, "Invalid file contents or revision.");
    return store.save(id(req), name(req), b.content, b.revision);
  });
  app.post("/api/projects/:id/file", async (req) => {
    const b = body(req);
    return store.add(
      id(req),
      name(req),
      Buffer.from(String(b.content ?? "")),
      !!b.directory,
    );
  });
  app.delete("/api/projects/:id/file", async (req) =>
    store.trash(id(req), name(req)),
  );
  app.post("/api/projects/:id/restore", async (req) =>
    store.trash(id(req), String(body(req).path), true),
  );
  app.post("/api/projects/:id/rename", async (req) =>
    store.rename(id(req), String(body(req).from), String(body(req).to)),
  );
  app.post("/api/projects/:id/upload", async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    return store.add(id(req), safePath(file.filename), buffer);
  });
  app.post("/api/import", async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, "Choose a project ZIP.");
    const skippedEntries: SkippedArchiveEntry[] = [];
    const files = await readZip(await file.toBuffer(), (entry) =>
      skippedEntries.push(entry),
    );
    if (!files.some((entry) => !entry.directory))
      throw new AppError(
        400,
        "This ZIP has no importable project files. Hidden files and system metadata are skipped. Choose a ZIP containing your LaTeX source.",
      );
    return {
      ...store.create(
        file.filename.replace(/\.zip$/i, "").slice(0, 120),
        files,
      ),
      skippedEntries,
    };
  });
  app.get("/api/projects/:id/export", async (req, reply) => {
    const p = store.project(id(req));
    return reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        `attachment; filename="${p.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip"`,
      )
      .send(writeZip(store.exportFiles(p.id)));
  });
  app.get("/api/projects/:id/checkpoints", async (req) => {
    store.automaticCheckpoint(id(req));
    return store.checkpoints(id(req));
  });
  app.post("/api/projects/:id/checkpoints", async (req) =>
    store.checkpoint(id(req), String(body(req).name ?? "Checkpoint")),
  );
  app.get("/api/projects/:id/checkpoints/:checkpoint/compare", async (req) =>
    store.compareHistory(
      id(req),
      (req.params as any).checkpoint,
      (req.query as any).target,
    ),
  );
  app.get("/api/projects/:id/checkpoints/:checkpoint/file", async (req) =>
    store.historyFile(
      id(req),
      (req.params as any).checkpoint,
      name(req),
      (req.query as any).target,
    ),
  );
  app.patch("/api/projects/:id/checkpoints/:checkpoint", async (req) =>
    store.labelCheckpoint(
      id(req),
      (req.params as any).checkpoint,
      String(body(req).name || ""),
    ),
  );
  app.post(
    "/api/projects/:id/checkpoints/:checkpoint/restore-file",
    async (req) =>
      store.restoreCheckpointFile(
        id(req),
        (req.params as any).checkpoint,
        safePath(body(req).path),
        body(req).expectedRevision,
      ),
  );
  app.get(
    "/api/projects/:id/checkpoints/:checkpoint/export",
    async (req, reply) =>
      reply
        .type("application/zip")
        .header("Content-Disposition", "attachment; filename=prism-version.zip")
        .send(
          writeZip(
            store.exportCheckpoint(id(req), (req.params as any).checkpoint),
          ),
        ),
  );
  app.post("/api/projects/:id/checkpoints/:checkpoint/restore", async (req) =>
    store.restoreCheckpoint(id(req), (req.params as any).checkpoint),
  );
  app.get("/api/projects/:id/builds", async (req) => ({
    jobs: compiler.list(id(req)),
    lastSuccessful: compiler.latestPdf(id(req)),
  }));
  app.post("/api/projects/:id/compile", async (req) =>
    compiler.start(id(req), !!body(req).clean),
  );
  app.post("/api/builds/:id/cancel", async (req) => compiler.cancel(id(req)));
  app.get("/api/builds/:id/pdf", async (req, reply) =>
    reply
      .type("application/pdf")
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .send(fs.createReadStream(compiler.pdfPath(id(req)))),
  );
  app.post("/api/builds/:id/sync", async (req) =>
    compiler.sync(id(req), body(req)),
  );
  app.get("/api/settings", async () => ({
    providers: { ...keys.all(), ...ai.cli.all() },
    models,
    preferences: store.setting("preferences", {
      theme: "dark",
      autoCompile: false,
      provider: "openai",
      model: "gpt-6.1-sol",
    }),
    catalogDate: CATALOG_DATE,
  }));
  app.put("/api/settings/preferences", async (req) => {
    const b = body(req),
      old = store.setting("preferences", {});
    const clean: Record<string, unknown> = {};
    if (["dark", "light", "system"].includes(b.theme)) clean.theme = b.theme;
    if (typeof b.autoCompile === "boolean") clean.autoCompile = b.autoCompile;
    if (isProvider(b.provider)) clean.provider = b.provider;
    if (typeof b.model === "string" && b.model.length < 150)
      clean.model = b.model;
    if (["document", "project"].includes(b.scope)) clean.scope = b.scope;
    store.setSetting("preferences", { ...old, ...clean });
    return { ok: true };
  });
  const provider = (req: any): Provider => {
    const p = req.params.provider;
    if (!isProvider(p)) throw new AppError(400, "Unknown provider.");
    return p;
  };
  app.put("/api/providers/:provider/key", async (req) => {
    const p = provider(req);
    if (!isApiProvider(p))
      throw new AppError(
        400,
        "CLI backends use your terminal login, not API keys.",
      );
    const b = body(req);
    if (b.baseUrl !== undefined && typeof b.baseUrl !== "string")
      throw new AppError(400, "Invalid endpoint.");
    keys.set(p, b.key === undefined ? undefined : String(b.key), b.baseUrl);
    return keys.state(p);
  });
  app.post("/api/providers/:provider/verify", async (req) => {
    const p = provider(req);
    return isCliProvider(p) ? ai.cli.check(p) : keys.verify(p);
  });
  app.post("/api/providers/refresh", async () => {
    await Promise.allSettled([
      ...cliProviders.map((p) => ai.cli.check(p)),
      ...apiProviders
        .filter((p) => keys.state(p).configured)
        .map((p) => keys.verify(p)),
    ]);
    return { ...keys.all(), ...ai.cli.all() };
  });
  app.post("/api/ai/quote", async (req) => ai.quote(body(req) as AiRequest));
  app.get("/api/projects/:id/chats", async (req) => ({
    conversations: store.conversations(id(req)),
    runs: store.runs(id(req)),
    proposals: store.proposals(id(req)),
  }));
  app.post("/api/projects/:id/conversations", async (req) =>
    store.createConversation(
      id(req),
      String(body(req).title || "New conversation"),
    ),
  );
  app.post("/api/ai/runs", async (req, reply) => {
    const request = body(req) as AiRequest;
    ai.context(request);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let runId = "",
      ended = false;
    reply.raw.on("close", () => {
      if (!ended && runId) {
        try {
          ai.stop(runId);
          ai.release(runId);
        } catch {}
      }
    });
    const keepAlive = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
    }, 15000);
    keepAlive.unref();
    try {
      await ai.run(request, (event) => {
        if (event.type === "run") runId = event.run.id;
        if (!reply.raw.destroyed)
          reply.raw.write("data: " + JSON.stringify(event) + "\n\n");
      });
    } catch (e) {
      if (!reply.raw.destroyed)
        reply.raw.write(
          "data: " +
            JSON.stringify({
              type: "error",
              message:
                e instanceof AppError
                  ? e.message
                  : "Could not start this AI request.",
            }) +
            "\n\ndata: " +
            JSON.stringify({ type: "done" }) +
            "\n\n",
        );
    } finally {
      clearInterval(keepAlive);
      ended = true;
      reply.raw.end();
    }
  });
  app.post("/api/ai/runs/:id/approve", async (req) =>
    ai.approve(id(req), body(req).text),
  );
  app.post("/api/ai/runs/:id/compile-preview", async (req) =>
    ai.compileDraft(id(req), body(req).text),
  );
  app.get("/api/builds/:id", async (req) => {
    const job = compiler.jobs.get(id(req));
    if (!job) throw new AppError(404, "Build not found.");
    return job;
  });
  app.post("/api/ai/runs/:id/heartbeat", async (req) => {
    const run = store.run(id(req));
    if (store.locks.get(run.projectId + "/" + run.path) !== run.id)
      throw new AppError(409, "Typing run is no longer active.");
    ai.heartbeat(run.id, body(req).paused);
    return { ok: true };
  });
  app.put("/api/ai/runs/:id/progress", async (req) =>
    ai.progress(id(req), body(req).visible, body(req).revision),
  );
  app.post("/api/ai/runs/:id/stop", async (req) => {
    ai.stop(id(req));
    return { ok: true };
  });
  app.post("/api/ai/runs/:id/finish", async (req) => {
    ai.finish(id(req));
    return { ok: true };
  });
  app.post("/api/ai/runs/:id/undo", async (req) => ai.undo(id(req)));
  app.post("/api/proposals/:id/apply", async (req) =>
    store.applyProposal(id(req)),
  );
  app.post("/api/proposals/:id/undo", async (req) =>
    store.applyProposal(id(req), true),
  );
  app.post("/api/proposals/:id/reject", async (req) => {
    const p = store.proposal(id(req));
    if (p.status !== "pending")
      throw new AppError(409, "Proposal already resolved.");
    p.status = "rejected";
    store.saveProposal(p);
    return p;
  });
  if (fs.existsSync(dist)) {
    await app.register(staticFiles, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Endpoint not found." })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("preClose", async () => {
    ai.shutdown();
    for (const job of compiler.jobs.values())
      if (["queued", "running"].includes(job.status)) compiler.cancel(job.id);
  });
  app.addHook("onClose", async () => store.close());
  return { app, store, compiler, keys, ai };
}
