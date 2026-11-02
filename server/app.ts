import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store";
import { Compiler, toolchain } from "./compiler";
import { Intelligence } from "./intelligence";
import { SourceNavigation } from "./source-navigation";
import { WordCounter } from "./word-count";
import { ProjectSearch } from "./project-search";
import { SourceRecovery } from "./source-recovery";
import { Formatting } from "./formatting";
import { SourceDraftStore } from "./source-drafts";
import { DiskDiscovery } from "./disk-discovery";
import { DiskObserver } from "./disk-status";
import { AI } from "./ai";
import { Keys } from "./providers";
import { AppError, readZip, writeZip, findRoots, safePath } from "./files";
import { FileMoves } from "./file-moves";
import { FileBatches } from "./file-batches";
import { WritingChecks } from "./writing-checks";
import { Chats } from "./chats";
import { ChatDrafts } from "./chat-drafts";
import { ChatSearch } from "./chat-search";
import { Comments } from "./comments";
import { Tracking } from "./tracking";
import { HistoryRecovery } from "./history-recovery";
import { HistoryLabels } from "./history-labels";
import { Templates } from "./templates";
import { Library } from "./library";
import { BuildArtifacts } from "./build-files";
import type { TexRuntimes } from "./tex-runtimes";
import type { CompilerLimits } from "./compile-policy";
import { ClipboardFragments } from "./clipboard";
import { UPLOAD_BYTES, UPLOAD_FILES } from "../shared/file-batches";
import { demoFiles } from "./demo";
import { models, CATALOG_DATE } from "../shared/catalog";
import {
  editorPreferences,
  editorPreferencesPatch,
} from "../shared/editor-preferences";
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
  {
    seed = true,
    dist = path.resolve("dist"),
    runtimes,
    compilerLimits,
  }: {
    seed?: boolean;
    dist?: string;
    runtimes?: TexRuntimes;
    compilerLimits?: CompilerLimits;
  } = {},
) {
  const store = new Store(dataDir),
    fileMoves = new FileMoves(store),
    fileBatches = new FileBatches(store),
    writing = new WritingChecks(store),
    chats = new Chats(store),
    chatDrafts = new ChatDrafts(store),
    chatSearch = new ChatSearch(store),
    comments = new Comments(store),
    tracking = new Tracking(store),
    historyRecovery = new HistoryRecovery(store),
    compiler = new Compiler(store, runtimes, compilerLimits),
    artifacts = new BuildArtifacts(compiler),
    formatting = new Formatting(compiler),
    templates = new Templates(store, compiler),
    library = new Library(store, compiler),
    keys = new Keys(),
    ai = new AI(store, compiler, keys),
    intelligence = new Intelligence(store),
    sourceNavigation = new SourceNavigation(store),
    wordCounter = new WordCounter(store, compiler),
    projectSearch = new ProjectSearch(store),
    sourceRecovery = new SourceRecovery(store),
    diskDiscovery = new DiskDiscovery(store),
    diskObserver = new DiskObserver(store),
    sourceDrafts = new SourceDraftStore(store);
  if (seed && !store.list().length && !store.list(true).length)
    store.create("Small ideas, beautifully expressed", demoFiles);
  const app = Fastify({ logger: false, bodyLimit: 3 * 1024 * 1024 });
  const clipboard = new ClipboardFragments();
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 4 },
  });
  app.addHook("onRequest", async (req) => {
    if (!allowedRequest(req.headers.host, req.headers.origin))
      throw new AppError(
        403,
        "Leaf only accepts requests from its local interface.",
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
    compileTimeoutMs: compiler.timeoutMs,
  }));
  app.get("/api/tex-runtimes", async () => compiler.runtimes.catalog());
  app.post("/api/tex-runtimes/refresh", async () =>
    compiler.runtimes.refresh(),
  );
  app.get("/api/projects/:id/formatter", async (req) =>
    formatting.status(id(req)),
  );
  app.post("/api/projects/:id/format", async (req) =>
    formatting.start(id(req), body(req)),
  );
  app.get("/api/projects/:id/format/:job", async (req) =>
    formatting.get(id(req), String((req.params as any).job)),
  );
  app.post("/api/projects/:id/format/:job/cancel", async (req) =>
    formatting.cancel(id(req), String((req.params as any).job)),
  );
  app.post("/api/projects/:id/format/:job/validate", async (req) =>
    formatting.validate(id(req), String((req.params as any).job), body(req)),
  );
  app.get("/api/projects", async () => store.list());
  app.get("/api/library", async () => library.state());
  app.post("/api/library/tags", async (req) => library.changeTag(body(req)));
  app.post("/api/library/preview", async (req) => library.preview(body(req)));
  app.post("/api/library/apply", async (req) => library.apply(body(req)));
  app.post("/api/library/export", async (req, reply) =>
    reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="selected-projects.zip"',
      )
      .send(library.export(body(req))),
  );
  app.post("/api/library/exports", async (req) =>
    library.prepareDownload(body(req)),
  );
  app.get("/api/library/exports/:download", async (req: any, reply) => {
    const bytes = library.download(String(req.params.download));
    return reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="selected-projects.zip"',
      )
      .header("Cache-Control", "no-store")
      .send(bytes);
  });
  app.post("/api/clipboard/fragments", async (req) => clipboard.set(body(req)));
  app.get("/api/clipboard/fragments/:fragment", async (req: any) =>
    clipboard.get(String(req.params.fragment)),
  );
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
  app.get("/api/templates", async (req: any) =>
    templates.list(req.query.trash === "1"),
  );
  app.get("/api/templates/:template", async (req: any) =>
    templates.get(req.params.template),
  );
  app.get("/api/templates/:template/file", async (req: any) =>
    templates.file(req.params.template, name(req)),
  );
  app.get("/api/templates/:template/export", async (req: any, reply) =>
    reply
      .type("application/zip")
      .header("Content-Disposition", "attachment; filename=leaf-template.zip")
      .send(writeZip(templates.export(req.params.template))),
  );
  app.post("/api/templates/:template/change", async (req: any) =>
    templates.change(req.params.template, body(req)),
  );
  app.post("/api/templates/:template/projects", async (req: any) =>
    templates.create(req.params.template, body(req)),
  );
  app.post("/api/templates/:template/compile", async (req: any) =>
    templates.compile(req.params.template, body(req)),
  );
  app.get("/api/projects/:id/template-preview", async (req) =>
    templates.preview(id(req)),
  );
  app.post("/api/projects/:id/templates", async (req) =>
    templates.save(id(req), body(req)),
  );
  app.get("/api/projects/:id", async (req) => ({
    ...store.project(id(req)),
    rootCandidates: findRoots(store.exportFiles(id(req))),
  }));
  app.get("/api/projects/:id/copy-preview", async (req) =>
    store.project(id(req)),
  );
  app.post("/api/projects/:id/copy", async (req) =>
    store.copy(id(req), body(req)),
  );
  app.patch("/api/projects/:id", async (req) =>
    store.update(id(req), body(req)),
  );
  app.get("/api/projects/:id/comments", async (req) =>
    comments.list(id(req), req.query),
  );
  app.get("/api/projects/:id/tracking", async (req) =>
    tracking.status(id(req)),
  );
  app.get("/api/projects/:id/tracking/file", async (req: any) =>
    tracking.file(id(req), req.query.path),
  );
  app.put("/api/projects/:id/tracking", async (req) =>
    tracking.mode(id(req), body(req)),
  );
  app.post("/api/projects/:id/tracking/review", async (req) =>
    tracking.apply(id(req), body(req)),
  );
  app.post("/api/projects/:id/tracking/:operation/undo", async (req: any) =>
    tracking.undo(id(req), req.params.operation),
  );
  app.get("/api/projects/:id/comments/anchors", async (req: any) =>
    comments.anchors(id(req), req.query.path),
  );
  app.get("/api/projects/:id/comments/:thread", async (req: any) =>
    comments.get(id(req), req.params.thread),
  );
  app.post("/api/projects/:id/comments", async (req) =>
    comments.create(id(req), body(req)),
  );
  app.post("/api/projects/:id/comments/:thread", async (req: any) =>
    comments.change(id(req), req.params.thread, body(req)),
  );
  app.get("/api/projects/:id/intelligence", async (req) =>
    intelligence.get(id(req)),
  );
  app.post("/api/projects/:id/source-locations", async (req) =>
    sourceNavigation.find(id(req), body(req)),
  );
  app.post("/api/projects/:id/word-count", async (req) =>
    wordCounter.count(id(req), body(req).includeBibliography === true),
  );
  app.post("/api/projects/:id/search", async (req) =>
    projectSearch.search(id(req), body(req)),
  );
  app.post("/api/projects/:id/replacements/preview", async (req) =>
    projectSearch.preview(id(req), body(req)),
  );
  app.get("/api/projects/:id/replacements", async (req) =>
    projectSearch.list(id(req)),
  );
  app.get("/api/projects/:id/replacements/:replacement", async (req: any) =>
    projectSearch.get(id(req), req.params.replacement),
  );
  app.get(
    "/api/projects/:id/replacements/:replacement/file",
    async (req: any) =>
      projectSearch.file(id(req), req.params.replacement, name(req)),
  );
  app.get(
    "/api/projects/:id/replacements/:replacement/download",
    async (req: any, reply) => {
      if (!["before", "after"].includes(req.query.version))
        throw new AppError(400, "Choose the original or replacement source.");
      const file = projectSearch.file(
        id(req),
        req.params.replacement,
        name(req),
      );
      const extension = path.posix.extname(file.path),
        filename = `${path.posix.basename(file.path, extension)}.${req.query.version}${extension || ".txt"}`,
        encoded = encodeURIComponent(filename).replace(
          /[!'()*]/g,
          (character) =>
            "%" + character.charCodeAt(0).toString(16).toUpperCase(),
        );
      return reply
        .type("text/plain; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="leaf-source.txt"; filename*=UTF-8''${encoded}`,
        )
        .send(req.query.version === "before" ? file.before : file.after);
    },
  );
  app.post(
    "/api/projects/:id/replacements/:replacement/apply",
    async (req: any) =>
      projectSearch.apply(id(req), req.params.replacement, body(req).paths),
  );
  app.post(
    "/api/projects/:id/replacements/:replacement/undo",
    async (req: any) =>
      projectSearch.apply(id(req), req.params.replacement, undefined, true),
  );
  app.get("/api/projects/:id/file", async (req) => ({
    ...store.readText(id(req), name(req)),
    readOnly: chats.activity(id(req)).activeRuns.length > 0,
  }));
  app.get("/api/projects/:id/disk", async (req) =>
    sourceRecovery.review(id(req), name(req)),
  );
  app.get("/api/projects/:id/disk/discovery", async (req) =>
    diskDiscovery.scan(id(req)),
  );
  app.get("/api/projects/:id/disk/status", async (req) =>
    diskObserver.status(id(req)),
  );
  app.post("/api/projects/:id/disk/discovery", async (req) =>
    diskDiscovery.apply(id(req), body(req)),
  );
  app.post("/api/projects/:id/disk/resolve", async (req) =>
    sourceRecovery.resolve(id(req), body(req)),
  );
  app.get("/api/projects/:id/source-drafts", async (req) =>
    sourceDrafts.list(id(req)),
  );
  app.put("/api/projects/:id/source-drafts", async (req) =>
    sourceDrafts.save(id(req), body(req)),
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
  const renameFiles = (req: any) => {
    const payload = body(req);
    if (
      !Number.isInteger(payload.generation) ||
      typeof payload.requestId !== "string"
    )
      throw new AppError(
        400,
        "Refresh the file list before renaming. A source generation and request identifier are required.",
      );
    return fileMoves.renameResult(
      id(req),
      String(payload.from),
      String(payload.to),
      payload,
    );
  };
  app.post("/api/projects/:id/rename", async (req) => renameFiles(req).project);
  app.post("/api/projects/:id/file-moves/preview", async (req) =>
    fileMoves.preview(id(req), body(req)),
  );
  app.post("/api/projects/:id/file-moves/rename/preview", async (req) =>
    fileMoves.previewRename(
      id(req),
      String(body(req).from),
      String(body(req).to),
    ),
  );
  app.post("/api/projects/:id/file-moves/rename", async (req) =>
    renameFiles(req),
  );
  app.post("/api/projects/:id/file-moves", async (req) =>
    fileMoves.apply(id(req), body(req)),
  );
  app.get("/api/projects/:id/file-moves", async (req) =>
    fileMoves.list(id(req)),
  );
  app.post("/api/projects/:id/file-moves/:move/undo", async (req: any) =>
    fileMoves.undo(id(req), String(req.params.move)),
  );
  app.post("/api/projects/:id/upload", async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    return store.add(id(req), safePath(file.filename), buffer);
  });
  app.post("/api/projects/:id/uploads/preview", async (req) =>
    fileBatches.uploadPreview(id(req), body(req)),
  );
  app.post("/api/projects/:id/uploads", async (req) => {
    let input: any,
      total = 0;
    const files = new Map<number, Buffer>();
    for await (const part of req.parts({
      limits: {
        files: UPLOAD_FILES,
        fileSize: UPLOAD_BYTES,
        fields: 1,
        parts: UPLOAD_FILES + 1,
        fieldSize: 128 * 1024,
      },
    })) {
      if (part.type === "field") {
        if (
          input ||
          part.fieldname !== "request" ||
          typeof part.value !== "string" ||
          part.valueTruncated
        )
          throw new AppError(400, "Upload metadata must be the first part.");
        try {
          input = JSON.parse(part.value);
        } catch {
          throw new AppError(400, "Invalid upload request.");
        }
      } else {
        const match = /^file-(\d+)$/.exec(part.fieldname),
          index = match ? Number(match[1]) : -1;
        if (
          !input ||
          !match ||
          files.has(index) ||
          !Array.isArray(input.indices) ||
          !input.indices.includes(index)
        )
          throw new AppError(
            400,
            "Upload contents do not match the selection.",
          );
        const data = await part.toBuffer();
        total += data.length;
        if (part.file.truncated || total > UPLOAD_BYTES)
          throw new AppError(413, "An upload is limited to 50 MB.");
        files.set(index, data);
      }
    }
    if (!input) throw new AppError(400, "Choose files to upload.");
    return fileBatches.upload(id(req), input, files);
  });
  app.get("/api/projects/:id/file-batches", async (req) =>
    fileBatches.list(id(req)),
  );
  app.post("/api/projects/:id/file-batches/:batch/undo", async (req: any) =>
    fileBatches.undo(id(req), String(req.params.batch)),
  );
  for (const kind of ["trash", "restore"] as const) {
    app.post(`/api/projects/:id/files/${kind}/preview`, async (req) =>
      fileBatches.statePreview(id(req), kind, body(req).paths),
    );
    app.post(`/api/projects/:id/files/${kind}`, async (req) =>
      fileBatches.state(id(req), kind, body(req)),
    );
  }
  app.post("/api/projects/:id/files/download", async (req, reply) =>
    reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="selected-files.zip"',
      )
      .send(
        fileBatches.download(id(req), body(req).paths, body(req).generation),
      ),
  );
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
  app.get("/api/projects/:id/history-settings", async (req) =>
    historyRecovery.settings(id(req)),
  );
  app.put("/api/projects/:id/history-settings", async (req) =>
    historyRecovery.configure(id(req), body(req)),
  );
  app.post(
    "/api/projects/:id/checkpoints/:checkpoint/restore-preview",
    async (req: any) =>
      historyRecovery.plan(id(req), req.params.checkpoint, body(req)),
  );
  app.get(
    "/api/projects/:id/checkpoints/:checkpoint/review",
    async (req: any) =>
      historyRecovery.archived(id(req), req.params.checkpoint, req.query),
  );
  app.get(
    "/api/projects/:id/checkpoints/:checkpoint/review/:thread",
    async (req: any) =>
      historyRecovery.archivedThread(
        id(req),
        req.params.checkpoint,
        req.params.thread,
      ),
  );
  app.get("/api/projects/:id/checkpoints/:checkpoint/compare", async (req) => ({
    ...store.compareHistory(
      id(req),
      (req.params as any).checkpoint,
      (req.query as any).target,
    ),
    reviews: historyRecovery.comparison(
      id(req),
      (req.params as any).checkpoint,
      (req.query as any).target,
    ),
  }));
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
  app.get<{ Params: { id: string; checkpoint: string } }>(
    "/api/projects/:id/checkpoints/:checkpoint/labels",
    async (req) => new HistoryLabels(store).get(id(req), req.params.checkpoint),
  );
  app.post<{ Params: { id: string; checkpoint: string } }>(
    "/api/projects/:id/checkpoints/:checkpoint/labels",
    async (req) =>
      new HistoryLabels(store).change(
        id(req),
        req.params.checkpoint,
        body(req),
      ),
  );
  app.post(
    "/api/projects/:id/checkpoints/:checkpoint/restore-file",
    async (req) =>
      historyRecovery.apply(id(req), (req.params as any).checkpoint, {
        ...body(req),
        path: safePath(body(req).path),
      }),
  );
  app.get(
    "/api/projects/:id/checkpoints/:checkpoint/export",
    async (req, reply) =>
      reply
        .type("application/zip")
        .header("Content-Disposition", "attachment; filename=leaf-version.zip")
        .send(
          writeZip(
            store.exportCheckpoint(id(req), (req.params as any).checkpoint),
          ),
        ),
  );
  app.post("/api/projects/:id/checkpoints/:checkpoint/restore", async (req) =>
    historyRecovery.apply(id(req), (req.params as any).checkpoint, body(req)),
  );
  app.get("/api/projects/:id/builds", async (req) => ({
    jobs: compiler.list(id(req)),
    lastSuccessful: compiler.latestPdf(id(req)),
    previewPdf: compiler.previewPdf(id(req)),
    options: compiler.settings(id(req)),
    runtime:
      compiler.runtimes
        .catalog()
        .runtimes.find(
          (r) => r.id === (compiler.settings(id(req)).runtimeId ?? "system"),
        ) ?? null,
  }));
  app.get("/api/projects/:id/compile-options", async (req) =>
    compiler.settings(id(req)),
  );
  app.put("/api/projects/:id/compile-options", async (req) =>
    compiler.configure(id(req), body(req)),
  );
  app.get("/api/builds/:id/files", async (req) => artifacts.list(id(req)));
  app.get("/api/builds/:id/files/text", async (req: any) =>
    artifacts.text(id(req), req.query.path),
  );
  app.get("/api/builds/:id/files/download", async (req: any, reply) => {
    const f = artifacts.file(id(req), req.query.path),
      name = path.basename(f.path);
    return reply
      .type("application/octet-stream")
      .header("Cache-Control", "no-store")
      .header(
        "Content-Disposition",
        `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
      )
      .send(f.bytes);
  });
  app.post(
    "/api/builds/:id/exports/preview",
    { bodyLimit: 8 * 1024 * 1024 },
    async (req) => artifacts.preview(id(req), body(req)),
  );
  app.post(
    "/api/builds/:id/exports",
    { bodyLimit: 8 * 1024 * 1024 },
    async (req) => artifacts.prepare(id(req), body(req)),
  );
  app.get("/api/build-exports/:id", async (req, reply) => {
    const d = artifacts.download(id(req));
    return reply
      .type("application/zip")
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="${d.filename}"`)
      .send(d.bytes);
  });
  app.post("/api/projects/:id/compile", async (req) => {
    const r = body(req);
    if (
      r.optionsRevision !== undefined &&
      (!Number.isSafeInteger(r.optionsRevision) ||
        compiler.settings(id(req)).revision !== r.optionsRevision)
    )
      throw new AppError(
        409,
        "Compile options changed in another view. Open Compile options, refresh, and review them before compiling.",
      );
    return compiler.start(id(req), !!r.clean);
  });
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
    writing: writing.settings(),
    providers: { ...keys.all(), ...ai.cli.all() },
    models,
    preferences: {
      ...store.setting("preferences", {
        theme: "light",
        autoCompile: false,
        provider: "openai",
        model: "gpt-6.1-sol",
      }),
      editor: editorPreferences(store.setting("preferences", {}).editor),
    },
    catalogDate: CATALOG_DATE,
  }));
  app.put("/api/settings/writing", async (req) => writing.update(body(req)));
  app.post("/api/settings/writing/words", async (req) =>
    writing.word(body(req)),
  );
  app.post("/api/projects/:id/writing/exclusion", async (req) =>
    writing.exclude(id(req), body(req)),
  );
  app.get("/api/writing/dictionary/:language/:part", async (req: any, reply) =>
    reply
      .type("text/plain; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send(writing.dictionary(req.params.language, req.params.part)),
  );
  app.put("/api/settings/preferences", async (req) => {
    const b = body(req),
      old = store.setting("preferences", {});
    const clean: Record<string, unknown> = {};
    if (Object.hasOwn(b, "editor")) {
      try {
        clean.editor = {
          ...editorPreferences(old.editor),
          ...editorPreferencesPatch(b.editor),
        };
      } catch (e) {
        throw new AppError(400, (e as Error).message);
      }
    }
    if (["dark", "light", "system"].includes(b.theme)) clean.theme = b.theme;
    if (typeof b.autoCompile === "boolean") clean.autoCompile = b.autoCompile;
    if (isProvider(b.provider)) clean.provider = b.provider;
    if (typeof b.model === "string" && b.model.length < 150)
      clean.model = b.model;
    if (["document", "project"].includes(b.scope)) clean.scope = b.scope;
    if (["code", "visual"].includes(b.editorView))
      clean.editorView = b.editorView;
    store.setSetting("preferences", { ...old, ...clean });
    return { ok: true, editor: editorPreferences(clean.editor ?? old.editor) };
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
  app.get("/api/projects/:id/activity", async (req) => chats.activity(id(req)));
  app.get("/api/projects/:id/chat-search", async (req: any) =>
    chatSearch.search(id(req), req.query),
  );
  app.get("/api/projects/:id/chat-draft", async (req: any) =>
    chatDrafts.read(id(req), req.query.conversation || null),
  );
  app.put("/api/projects/:id/chat-draft", async (req: any) =>
    chatDrafts.save(id(req), req.query.conversation || null, body(req)),
  );
  app.get("/api/projects/:id/runs/:run", async (req: any) =>
    chats.run(id(req), req.params.run),
  );
  app.get("/api/projects/:id/chats", async (req: any) =>
    req.query.summary === "1"
      ? chats.state(id(req))
      : {
          conversations: store.conversations(id(req)),
          runs: store.runs(id(req)),
          proposals: store.proposals(id(req)),
        },
  );
  app.get(
    "/api/projects/:id/conversations/:conversation/turns",
    async (req: any) =>
      chats.turns(id(req), req.params.conversation, req.query.before, {
        after: req.query.after,
        around: req.query.around,
      }),
  );
  app.patch("/api/projects/:id/conversations/:conversation", async (req: any) =>
    chats.edit(id(req), req.params.conversation, body(req)),
  );
  app.put("/api/projects/:id/active-conversation", async (req) =>
    chats.select(id(req), body(req)),
  );
  app.get("/api/projects/:id/proposals/:proposal", async (req: any) => {
    const p = store.proposal(req.params.proposal);
    store.requireProject(id(req));
    if (p.projectId !== id(req))
      throw new AppError(404, "Proposal not found in this project.");
    return p;
  });
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
    ai.compileDraft(id(req), body(req).text, body(req).requestId),
  );
  app.get("/api/ai/runs/:id/compile-preview", async (req: any) =>
    ai.previewBuilds.status(id(req), req.query.request),
  );
  app.post("/api/ai/runs/:id/compile-preview/cancel", async (req) =>
    ai.previewBuilds.cancel(id(req), body(req).requestId),
  );
  app.get("/api/builds/:id", async (req) => {
    const job = compiler.get(id(req));
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
    await Promise.all([compiler.shutdown(), formatting.shutdown()]);
  });
  app.addHook("onClose", async () => {
    artifacts.dispose();
    library.dispose();
    await projectSearch.close();
    await chatSearch.close();
    store.close();
  });
  return {
    app,
    store,
    compiler,
    keys,
    ai,
    templates,
    library,
    artifacts,
    formatting,
    diskDiscovery,
  };
}
