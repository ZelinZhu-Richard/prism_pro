import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Compiler } from "./compiler";
import { compilerEnvironment, sandboxProfile } from "./compiler";
import { AppError, safePath, within } from "./files";
import { SourceRecovery } from "./source-recovery";
import { LocalProcess } from "./local-process";
import { runtimeSnapshot } from "./tex-runtimes";
import {
  FORMAT_BYTES,
  type FormatJob,
  type FormatterStatus,
} from "../shared/formatting";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function toolIdentity(file: string) {
  const real = fs.realpathSync(file),
    s = fs.statSync(real);
  fs.accessSync(real, fs.constants.X_OK);
  if (!s.isFile()) throw Error("Not executable");
  return {
    path: real,
    dev: s.dev,
    ino: s.ino,
    size: s.size,
    mtime: s.mtimeMs,
    ctime: s.ctimeMs,
  };
}
export class Formatting {
  readonly jobs = new Map<string, FormatJob>();
  private processes = new Map<string, LocalProcess>();
  private stoppedRequests = new Map<string, number>();
  private closing = false;
  constructor(private compiler: Compiler) {}
  status(projectId: string): FormatterStatus {
    this.compiler.store.requireProject(projectId);
    try {
      const runtime = this.compiler.runtimes.resolve(
        this.compiler.settings(projectId).runtimeId,
      );
      for (const name of ["latexindent", "latexindent.pl"]) {
        try {
          const tool = toolIdentity(path.join(runtime.binDir, name));
          return {
            available: true,
            name: "latexindent",
            path: tool.path,
            runtime: runtimeSnapshot(runtime),
          };
        } catch {
          /* Try the alternate installed executable name. */
        }
      }
      return {
        available: false,
        name: "latexindent",
        runtime: runtimeSnapshot(runtime),
        problem:
          "latexindent is missing from the selected TeX installation. Install its TeX Live/MacTeX package and required Perl dependencies, then refresh runtimes. Leaf does not install it automatically.",
      };
    } catch (e) {
      return {
        available: false,
        name: "latexindent",
        problem: (e as Error).message,
      };
    }
  }
  private check(projectId: string, name: string, revision: unknown) {
    this.compiler.store.assertSourceOwner(projectId, name);
    const file = this.compiler.store.readText(projectId, name),
      review = new SourceRecovery(this.compiler.store).review(projectId, name);
    if (review.saved.kind !== "text")
      throw new AppError(
        400,
        "This file is not valid UTF-8 source. Download its original bytes before choosing a text conversion.",
      );
    if (file.revision !== revision || review.changed)
      throw new AppError(
        409,
        "This file changed. Keep your source and review file versions before formatting.",
      );
    return file;
  }
  start(projectId: string, request: any): FormatJob {
    if (this.closing)
      throw new AppError(
        503,
        "Leaf is shutting down. Your source is unchanged.",
      );
    const name = safePath(request.path);
    if (
      !/\.tex$/i.test(name) ||
      !Number.isInteger(request.revision) ||
      typeof request.content !== "string" ||
      request.content.includes("\0") ||
      Buffer.from(request.content).toString("utf8") !== request.content ||
      Buffer.byteLength(request.content) > FORMAT_BYTES
    )
      throw new AppError(
        400,
        "Choose a .tex source of at most 2 MiB and its current revision.",
      );
    const content: string = request.content;
    const id = request.requestId ?? randomUUID();
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      throw new AppError(400, "Use a new formatting request identifier.");
    const requestKey = projectId + "/" + id;
    if (this.stoppedRequests.has(requestKey))
      throw new AppError(
        409,
        "This formatting request was stopped before launch. Your source is unchanged.",
      );
    this.check(projectId, name, request.revision);
    const existing = this.jobs.get(id);
    if (existing) {
      if (
        existing.projectId !== projectId ||
        existing.path !== name ||
        existing.revision !== request.revision ||
        existing.sourceHash !== hash(content)
      )
        throw new AppError(
          409,
          "This formatting identifier belongs to another request. Start a new preview.",
        );
      return existing;
    }
    if (this.processes.size >= 4)
      throw new AppError(
        503,
        "Four formatting previews are already running. Stop one or wait for it to finish.",
      );
    if (
      [...this.jobs.values()].some(
        (j) => j.projectId === projectId && j.status === "running",
      )
    )
      throw new AppError(
        409,
        "A formatting preview is still running for this project. Stop it before starting another.",
      );
    const status = this.status(projectId);
    if (!status.available || !status.path || !status.runtime)
      throw new AppError(503, status.problem!);
    if (process.platform !== "darwin")
      throw new AppError(
        503,
        "Confined local formatting currently requires macOS. Your source is unchanged.",
      );
    const runtime = this.compiler.runtimes.forSnapshot(status.runtime),
      identity = toolIdentity(status.path),
      dir = path.join(this.compiler.store.root, "formatting", id),
      source = path.join(dir, "source"),
      out = path.join(dir, "out"),
      home = path.join(dir, "home");
    fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(dir, { mode: 0o700 });
    } catch {
      throw new AppError(
        409,
        "This formatting preview already exists from an earlier session. Start a new preview with a new identifier.",
      );
    }
    for (const folder of [source, out, home])
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(source, "input.tex"), content, {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(dir, "tool.sb"), sandboxProfile(dir, runtime));
    const job: FormatJob = {
      id,
      projectId,
      path: name,
      revision: request.revision,
      sourceHash: hash(content),
      created: new Date().toISOString(),
      status: "running",
      runtime: status.runtime,
      tool: status.path,
      log: "",
    };
    // A preview is disposable derived output, never project history. Bound the
    // in-memory result cache; an expired view can request a fresh preview.
    while (this.jobs.size >= 40) {
      const expired = [...this.jobs.values()].find(
        (j) => j.status !== "running",
      );
      if (!expired) break;
      this.jobs.delete(expired.id);
    }
    this.jobs.set(id, job);
    // One immutable file only. Default-only mode ignores home/project YAML;
    // neither overwrite nor shell/source execution is requested.
    const runner = new LocalProcess(dir, {
      command: "/usr/bin/sandbox-exec",
      args: [
        "-f",
        path.join(dir, "tool.sb"),
        status.path,
        "-d",
        "-s",
        `-c=${out}/`,
        `-o=${path.join(out, "formatted.tex")}`,
        "input.tex",
      ],
      cwd: source,
      env: compilerEnvironment(home, runtime),
      timeoutMs: 15000,
    });
    this.processes.set(id, runner);
    void runner.done.then(({ result, log }) => {
      this.processes.delete(id);
      job.log = log.slice(0, 65536);
      job.status =
        job.cancelRequested || result?.reason === "cancel"
          ? "cancelled"
          : "failed";
      if (job.status === "cancelled") return;
      if (result?.reason !== "exit" || result.code !== 0) {
        job.error =
          result?.reason === "timeout"
            ? "Formatting exceeded 15 seconds. Your source is unchanged; try a smaller file or check the local tool."
            : "latexindent did not complete. Check the local tool and its Perl dependencies; your source is unchanged.";
        return;
      }
      try {
        this.compiler.runtimes.forSnapshot(job.runtime);
        if (JSON.stringify(identity) !== JSON.stringify(toolIdentity(job.tool)))
          throw Error(
            "The formatter installation changed. Refresh runtimes and try again.",
          );
        const fd = fs.openSync(
          within(dir, "out/formatted.tex"),
          fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
        let bytes: Buffer;
        try {
          const s = fs.fstatSync(fd);
          if (!s.isFile() || s.nlink !== 1 || s.size > FORMAT_BYTES)
            throw Error(
              "The formatter output is not a regular source file of at most 2 MiB.",
            );
          bytes = fs.readFileSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        const text = bytes.toString("utf8");
        if (
          text.includes("\0") ||
          !Buffer.from(text).equals(bytes) ||
          (content.trim() && !text.trim())
        )
          throw Error(
            "The formatter returned invalid or empty source. Your source is unchanged.",
          );
        job.text = text;
        job.status = "succeeded";
      } catch (e) {
        job.error = (e as Error).message;
      }
    });
    return job;
  }
  get(projectId: string, id: string) {
    this.compiler.store.requireProject(projectId);
    const job = this.jobs.get(id);
    if (!job || job.projectId !== projectId)
      throw new AppError(
        404,
        "This formatting preview is no longer available. Your source is kept; start a new preview.",
      );
    return job;
  }
  validate(projectId: string, id: string, request: any) {
    const job = this.get(projectId, id);
    if (job.status !== "succeeded" || job.text === undefined)
      throw new AppError(
        409,
        "Wait for a successful formatting preview before applying it.",
      );
    this.check(projectId, job.path, job.revision);
    if (
      typeof request.content !== "string" ||
      Buffer.byteLength(request.content) > FORMAT_BYTES ||
      hash(request.content) !== job.sourceHash
    )
      throw new AppError(
        409,
        "The editor text changed after formatting. Start a new preview; your current source is kept.",
      );
    return {
      text: job.text,
      revision: job.revision,
      path: job.path,
      sourceHash: job.sourceHash,
    };
  }
  cancel(projectId: string, id: string) {
    this.compiler.store.requireProject(projectId);
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      throw new AppError(400, "Invalid formatting request identifier.");
    if (!this.jobs.has(id)) {
      // A local Stop can arrive before the creation response/request. Retire
      // that explicit ID, so a delayed create cannot launch a forgotten tool.
      const now = Date.now();
      for (const [key, created] of this.stoppedRequests)
        if (now - created > 120000 || this.stoppedRequests.size >= 256)
          this.stoppedRequests.delete(key);
      this.stoppedRequests.set(projectId + "/" + id, now);
      return { id, status: "cancelled" as const };
    }
    const job = this.get(projectId, id);
    if (job.status === "running") {
      job.cancelRequested = true;
      this.processes.get(id)?.cancel();
    }
    return job;
  }
  async shutdown() {
    this.closing = true;
    for (const [id, runner] of this.processes) {
      const job = this.jobs.get(id);
      if (job) job.cancelRequested = true;
      runner.cancel();
    }
    await Promise.all([...this.processes.values()].map((p) => p.done));
  }
}
