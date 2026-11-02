import { createHash, randomUUID } from "node:crypto";
import type { CompileJob } from "../shared/types";
import type { PreviewBuildState } from "../shared/preview-builds";
import type { Store } from "./store";
import type { Compiler } from "./compiler";
import { AppError } from "./files";
type RequestRow = {
  run: string;
  request: string;
  project: string;
  hash: string | null;
  job: string | null;
  cancelled: number;
};
/** Journal explicit local compilation actions, including cancel-before-start tombstones. */
export class PreviewBuilds {
  constructor(
    private store: Store,
    private compiler: Compiler,
  ) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS preview_build_requests(run TEXT NOT NULL,request TEXT NOT NULL,project TEXT NOT NULL,hash TEXT,job TEXT,cancelled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(run,request))",
    );
  }
  private run(id: string) {
    const run = this.store.run(id);
    this.store.requireProject(run.projectId);
    if (run.mode !== "manual")
      throw new AppError(400, "This is not a replacement preview.");
    return run;
  }
  requestId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value))
      throw new AppError(400, "Invalid preview compilation request.");
    return value;
  }
  private row(run: string, request: string) {
    return this.store.db
      .prepare("SELECT * FROM preview_build_requests WHERE run=? AND request=?")
      .get(run, request) as RequestRow | undefined;
  }
  private job(row: RequestRow) {
    const job =
      (row.job ? this.compiler.jobs.get(row.job) : undefined) ??
      [...this.compiler.jobs.values()].find(
        (j) =>
          j.preview &&
          j.projectId === row.project &&
          j.previewRequest?.runId === row.run &&
          j.previewRequest.requestId === row.request,
      );
    if (
      !job ||
      !job.preview ||
      job.projectId !== row.project ||
      job.previewRequest?.runId !== row.run ||
      job.previewRequest.requestId !== row.request
    )
      return null;
    if (row.job !== job.id)
      this.store.db
        .prepare(
          "UPDATE preview_build_requests SET job=? WHERE run=? AND request=?",
        )
        .run(job.id, row.run, row.request);
    return job;
  }
  status(id: string, request?: unknown): PreviewBuildState {
    this.run(id);
    const row =
      request === undefined
        ? (this.store.db
            .prepare(
              "SELECT * FROM preview_build_requests WHERE run=? ORDER BY rowid DESC LIMIT 1",
            )
            .get(id) as RequestRow | undefined)
        : this.row(id, this.requestId(request));
    const job = row ? this.job(row) : null;
    return {
      runId: id,
      requestId: row?.request,
      textHash: row?.hash ?? undefined,
      cancelled: !!row?.cancelled,
      unavailable: !!row?.job && !job,
      job,
    };
  }
  start(
    id: string,
    text: unknown,
    requested: unknown,
    create: (metadata: NonNullable<CompileJob["previewRequest"]>) => CompileJob,
  ) {
    const run = this.run(id),
      requestId =
        requested === undefined ? randomUUID() : this.requestId(requested);
    if (
      typeof text !== "string" ||
      Buffer.byteLength(text) > 200000 ||
      Buffer.from(text).toString() !== text
    )
      throw new AppError(400, "Replacement must be valid text under 200 KB.");
    const hash = createHash("sha256").update(text).digest("hex"),
      old = this.row(id, requestId);
    if (old?.hash && old.hash !== hash)
      throw new AppError(
        409,
        "This preview request belongs to a different replacement. Compile again with a new request.",
      );
    if (old) {
      const job = this.job(old);
      if (job) return job;
      if (old.cancelled)
        throw new AppError(
          409,
          "This preview compilation was stopped before it started. Compile again for a new preview.",
        );
      if (old.job)
        throw new AppError(
          409,
          "This preview output is no longer available. Compile again for a new preview.",
        );
    } else
      this.store.db
        .prepare(
          "INSERT INTO preview_build_requests(run,request,project,hash) VALUES(?,?,?,?)",
        )
        .run(id, requestId, run.projectId, hash);
    const metadata = { runId: id, requestId, textHash: hash },
      job = create(metadata);
    this.store.db
      .prepare(
        "UPDATE preview_build_requests SET job=? WHERE run=? AND request=?",
      )
      .run(job.id, id, requestId);
    return job;
  }
  cancel(id: string, requested: unknown): PreviewBuildState {
    const run = this.run(id),
      requestId = this.requestId(requested);
    this.store.db
      .prepare(
        "INSERT INTO preview_build_requests(run,request,project,cancelled) VALUES(?,?,?,1) ON CONFLICT(run,request) DO UPDATE SET cancelled=1",
      )
      .run(id, requestId, run.projectId);
    const row = this.row(id, requestId)!,
      job = this.job(row);
    if (job && ["queued", "running"].includes(job.status))
      this.compiler.cancel(job.id);
    return this.status(id, requestId);
  }
  cancelRun(id: string) {
    this.store.db
      .prepare("UPDATE preview_build_requests SET cancelled=1 WHERE run=?")
      .run(id);
    for (const job of this.compiler.jobs.values())
      if (
        job.previewRequest?.runId === id &&
        ["queued", "running"].includes(job.status)
      )
        this.compiler.cancel(job.id);
  }
  active(id: string) {
    return [...this.compiler.jobs.values()].some(
      (j) =>
        j.previewRequest?.runId === id &&
        ["queued", "running"].includes(j.status),
    );
  }
}
