import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  defaultRuntimes,
  TexRuntimes,
  runtimeSnapshot,
  runtimePath,
  runtimeReadRoots,
  type ResolvedRuntime,
} from "./tex-runtimes";
import { requiredTexTools } from "../shared/tex-runtimes";
import { buildDiagnostics, DIAGNOSTICS_VERSION } from "./diagnostics";
import {
  supervisorPath,
  supervisorIdentity,
  supervisorResult,
  compilerLog,
  processGroup,
  atomicJson,
  type SupervisorResult,
} from "./supervision";
import type { CompileJob, Engine } from "../shared/types";
import {
  compileOptions,
  MISSING_BIBLIOGRAPHY_TOOL,
  sameCompileOptions,
  type CompileOptions,
  type CompileSettings,
} from "../shared/compiler";
import { Store } from "./store";
import { compileTimeout, type CompilerLimits } from "./compile-policy";
import {
  AppError,
  within,
  safePath,
  validateTree,
  type ImportedFile,
} from "./files";

export const TEX_PATH =
  "/Library/TeX/texbin:/usr/local/texlive/2026basic/bin/universal-darwin:/usr/bin:/bin";
export function toolPath(name: string) {
  for (const dir of TEX_PATH.split(":")) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
export function toolchain() {
  return {
    ...defaultRuntimes.catalog().runtimes.find((r) => r.id === "system")!.tools,
  };
}
export function compilerEnvironment(
  home: string,
  runtime?: ResolvedRuntime,
): NodeJS.ProcessEnv {
  return {
    PATH: runtime ? runtimePath(runtime) : TEX_PATH,
    HOME: home,
    TMPDIR: home,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    openin_any: "p",
    openout_any: "p",
    shell_escape: "f",
    GS_OPTIONS: "-dSAFER",
    TEXMFOUTPUT: home,
    TEXMFVAR: path.join(home, "texmf-var"),
    TEXMFCONFIG: path.join(home, "texmf-config"),
  };
}
/** Application-owned flags only; imported latexmk configuration stays disabled. */
export function compileArguments(
  engine: Engine,
  options: CompileOptions,
): string[] {
  const flag: Record<Engine, string> = {
    pdflatex: "-pdf",
    latex: "-pdfps",
    xelatex: "-xelatex",
    lualatex: "-lualatex",
  };
  return [
    "-norc",
    flag[engine],
    "-interaction=nonstopmode",
    ...(options.errorHandling === "stop" ? ["-halt-on-error"] : []),
    ...(options.errorHandling === "continue" ? ["-f"] : []),
    "-file-line-error",
    "-synctex=1",
    "-no-shell-escape",
    ...(options.mode === "draft"
      ? [
          String.raw`-usepretex=\PassOptionsToPackage{draft}{graphicx}\PassOptionsToPackage{draft}{graphics}`,
        ]
      : []),
  ];
}
function quoted(s: string) {
  return JSON.stringify(s);
}
export function sandboxProfile(buildDir: string, runtime?: ResolvedRuntime) {
  const root = fs.realpathSync(buildDir);
  return `(version 1)
(deny default)
(allow process*)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow mach-lookup)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath "/System") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/Library/TeX") (subpath "/Library/Fonts") (subpath "/Library/Apple") (subpath "/private/var/db/dyld") (subpath ${quoted(root)}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
${
  runtime
    ? runtimeReadRoots(runtime)
        .map((dir) => `(allow file-read* (subpath ${quoted(dir)}))`)
        .join("\n")
    : ""
}
(allow file-write* (subpath ${quoted(path.join(root, "out"))}) (subpath ${quoted(path.join(root, "home"))}) (literal "/dev/null"))
`;
}
export { parseDiagnostics } from "./diagnostics";
export class Compiler {
  jobs = new Map<string, CompileJob>();
  processes = new Map<string, ChildProcess>();
  private draining = new Set<string>();
  private recovering = new Set<string>();
  private drainTimer?: NodeJS.Timeout;
  private closing = false;
  readonly timeoutMs: number | null;
  constructor(
    public store: Store,
    public runtimes: TexRuntimes = defaultRuntimes,
    // A trusted launcher may opt into a deadline. Source/HTTP never choose it.
    limits: CompilerLimits = {},
  ) {
    this.timeoutMs = compileTimeout(limits.timeoutMs);
    fs.mkdirSync(path.join(store.root, "builds"), { recursive: true });
    for (const entry of fs.readdirSync(path.join(store.root, "builds"), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(store.root, "builds", entry.name, "job.json");
      if (fs.existsSync(file)) {
        try {
          const job = JSON.parse(fs.readFileSync(file, "utf8"));
          if (job.id !== entry.name) continue;
          this.jobs.set(job.id, job);
          if (["running", "queued"].includes(job.status)) {
            job.pdf = false;
            if (supervisorIdentity(this.dir(job.id))) {
              job.status = "running";
              job.log +=
                "\nBuild interrupted by server restart; waiting for compiler cleanup.";
              this.watchDrain(job, true);
            } else {
              job.status = "failed";
              job.log += "\nBuild interrupted by server restart.";
              this.persist(job);
            }
          }
        } catch {
          /* incomplete build metadata */
        }
      }
    }
  }
  dir(id: string) {
    if (!this.jobs.has(id)) throw new AppError(404, "Build not found.");
    return path.join(this.store.root, "builds", id);
  }
  persist(job: CompileJob) {
    atomicJson(path.join(this.dir(job.id), "job.json"), job);
  }
  refreshDiagnostics(job: CompileJob) {
    if (
      !["queued", "running"].includes(job.status) &&
      job.diagnosticsVersion !== DIAGNOSTICS_VERSION
    ) {
      job.diagnostics = buildDiagnostics(
        this.dir(job.id),
        job.root,
        job.log,
        job.status === "failed",
      );
      job.diagnosticsVersion = DIAGNOSTICS_VERSION;
      this.persist(job);
    }
    return job;
  }
  get(id: string) {
    const job = this.jobs.get(id);
    return job ? this.refreshDiagnostics(job) : undefined;
  }
  list(projectId: string) {
    const jobs = [...this.jobs.values()]
      .filter((j) => j.projectId === projectId && !j.preview)
      .sort((a, b) => b.started.localeCompare(a.started));
    if (jobs[0]) this.refreshDiagnostics(jobs[0]);
    return jobs;
  }
  settings(projectId: string): CompileSettings {
    this.store.requireProject(projectId);
    const saved = this.store.setting("compiler:" + projectId, {});
    return {
      ...compileOptions(saved),
      revision:
        Number.isSafeInteger(saved.revision) && saved.revision >= 0
          ? saved.revision
          : 0,
    };
  }
  configure(projectId: string, input: unknown): CompileSettings {
    this.store.requireProject(projectId);
    this.store.unlocked(projectId);
    const r = input as CompileSettings;
    if (
      !r ||
      typeof r !== "object" ||
      Array.isArray(r) ||
      !["normal", "draft"].includes(r.mode) ||
      !["stop", "continue"].includes(r.errorHandling) ||
      !Number.isSafeInteger(r.revision) ||
      r.revision < 0
    )
      throw new AppError(
        400,
        "Choose a compile mode and error handling with a current settings revision.",
      );
    const old = this.settings(projectId);
    if (
      r.runtimeId !== undefined &&
      (typeof r.runtimeId !== "string" ||
        r.runtimeId.length > 100 ||
        !/^(system|tex-[a-f0-9]{24})$/.test(r.runtimeId))
    )
      throw new AppError(400, "Choose a runtime from the installed TeX list.");
    const requested = { ...r, runtimeId: r.runtimeId ?? old.runtimeId };
    if (
      requested.runtimeId &&
      requested.runtimeId !== (old.runtimeId ?? "system")
    )
      this.runtimes.resolve(requested.runtimeId);
    if (sameCompileOptions(old, requested)) return old;
    if (old.revision !== r.revision)
      throw new AppError(
        409,
        "Compile options changed in another view. Refresh options, review your choices, and save again.",
      );
    const next = { ...compileOptions(requested), revision: old.revision + 1 };
    this.store.setSetting("compiler:" + projectId, next);
    return next;
  }
  latestPdf(projectId: string) {
    return (
      this.list(projectId).find((j) => j.pdf && j.status === "succeeded") ??
      null
    );
  }
  previewPdf(projectId: string) {
    const finished = this.list(projectId).find(
      (j) => !["queued", "running"].includes(j.status),
    );
    // A new stop/fatal/cancelled build without usable output falls back to
    // successful output, rather than silently resurrecting an older error PDF.
    return finished?.pdf && finished.status === "failed"
      ? finished
      : this.latestPdf(projectId);
  }
  pdfPath(id: string) {
    const job = this.jobs.get(id);
    if (!job?.pdf) throw new AppError(404, "This build has no PDF.");
    return within(
      this.dir(id),
      "out/" + path.basename(job.root, ".tex") + ".pdf",
    );
  }
  start(
    projectId: string,
    clean = false,
    draft?: {
      runId: string;
      path: string;
      content: string;
      request?: NonNullable<CompileJob["previewRequest"]>;
    },
  ) {
    const p = this.store.project(projectId);
    this.store.unlocked(projectId, undefined, draft?.runId);
    const files = this.store
      .exportFiles(projectId)
      .map((f) =>
        draft && f.path === draft.path
          ? { ...f, data: Buffer.from(draft.content) }
          : f,
      );
    return this.startSnapshot(
      { projectId, generation: p.generation, root: p.root, engine: p.engine },
      files,
      clean,
      !!draft,
      this.settings(projectId),
      draft?.request,
    );
  }
  startSnapshot(
    p: { projectId: string; generation: number; root: string; engine: Engine },
    files: ImportedFile[],
    clean = false,
    preview = true,
    options: CompileOptions = compileOptions(),
    previewRequest?: CompileJob["previewRequest"],
  ) {
    if (this.closing) throw new AppError(503, "The compiler is shutting down.");
    const projectId = p.projectId;
    if (!p.root)
      throw new AppError(
        400,
        "Choose a root .tex document in project settings.",
      );
    safePath(p.root);
    validateTree(files);
    if (
      !["pdflatex", "latex", "xelatex", "lualatex"].includes(p.engine) ||
      !p.root.endsWith(".tex") ||
      !files.some((f) => f.path === p.root && !f.directory)
    )
      throw new AppError(
        400,
        "Choose a main .tex document and a supported compiler.",
      );
    if (
      process.platform !== "darwin" ||
      !fs.existsSync("/usr/bin/sandbox-exec")
    )
      throw new AppError(
        503,
        "This release requires the macOS compiler sandbox. Compilation has not been started.",
      );
    options = compileOptions(options);
    const runtime = this.runtimes.resolve(options.runtimeId);
    const required = requiredTexTools(p.engine);
    const missing = required.filter((name) => !runtime.commands[name]);
    if (missing.length)
      throw new AppError(
        503,
        `The selected runtime is missing ${missing.join(", ")}. ${missing.some((n) => n === "gs" || n === "ps2pdf") ? "Install Ghostscript (for example, brew install ghostscript) for LaTeX → DVI → PS → PDF, then refresh runtimes." : "Install the missing tools in that TeX distribution, then refresh runtimes."} No build or fallback was started.`,
      );
    if (
      [...this.jobs.values()].some(
        (j) =>
          j.projectId === projectId && ["running", "queued"].includes(j.status),
      )
    )
      throw new AppError(409, "A build is already running.");
    const id = randomUUID(),
      job: CompileJob = {
        id,
        preview,
        ...(previewRequest ? { previewRequest } : {}),
        projectId,
        generation: p.generation,
        status: "queued",
        diagnostics: [],
        log: "",
        pdf: false,
        started: new Date().toISOString(),
        engine: p.engine,
        root: p.root,
        options,
        timeoutMs: this.timeoutMs,
        runtime: runtimeSnapshot(runtime),
      };
    this.jobs.set(id, job);
    const dir = this.dir(id),
      source = path.join(dir, "source"),
      out = path.join(dir, "out"),
      home = path.join(dir, "home");
    for (const d of [source, out, home]) fs.mkdirSync(d, { recursive: true });
    for (const file of files) {
      const dest = within(source, file.path);
      if (file.directory) fs.mkdirSync(dest, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.data);
      }
    }
    // Every build uses a fresh snapshot; prior successful PDFs remain available.
    if (clean) job.log = "Clean build from current project files.\n";
    const env = compilerEnvironment(home, runtime);
    const missingBibliography = (["bibtex", "biber"] as const).filter(
      (tool) => !runtime.commands[tool],
    );
    if (missingBibliography.length) {
      // latexmk knows which backend this build actually needs. Refuse a PATH
      // fallback only if it invokes one absent from the selected installation.
      const checks = path.join(dir, "tool-checks");
      fs.mkdirSync(checks);
      for (const tool of missingBibliography)
        fs.writeFileSync(
          path.join(checks, tool),
          `#!/bin/sh\nprintf '%s\\n' '${MISSING_BIBLIOGRAPHY_TOOL[tool]}' >&2\nexit 127\n`,
          { flag: "wx", mode: 0o700 },
        );
      env.PATH = checks + path.delimiter + env.PATH;
    }
    fs.writeFileSync(
      path.join(dir, "compiler.sb"),
      sandboxProfile(dir, runtime),
    );
    const args = [
      "-f",
      path.join(dir, "compiler.sb"),
      runtime.commands.latexmk!,
      ...compileArguments(p.engine, options),
      `-outdir=${out}`,
      "./" + p.root,
    ];
    job.status = "running";
    this.persist(job);
    const token = randomUUID();
    const child = spawn(process.execPath, [supervisorPath, dir, token], {
      cwd: source,
      env,
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    this.processes.set(id, child);
    child.on("message", (message: any) => {
      if (
        ["queued", "running"].includes(job.status) &&
        message?.type === "output" &&
        typeof message.text === "string" &&
        job.log.length < 1_000_000
      )
        job.log += message.text.slice(0, 1_000_000 - job.log.length);
    });
    child.on("error", () => {
      job.log += "\nCould not start compiler supervisor.";
      if (!child.pid) this.watchDrain(job);
    });
    child.on("exit", () => this.watchDrain(job));
    child.on("close", () => this.watchDrain(job));
    if (child.pid) {
      try {
        // No compiler launches until its group identity has been committed.
        atomicJson(path.join(dir, "supervisor.json"), {
          version: 1,
          pid: child.pid,
          token,
        });
        child.send(
          {
            type: "start",
            token,
            command: "/usr/bin/sandbox-exec",
            args,
            cwd: source,
            env,
            timeoutMs: this.timeoutMs,
            prefix: job.log,
          },
          (error) => {
            if (error && child.connected) child.disconnect();
          },
        );
      } catch {
        if (child.connected) child.disconnect();
      }
    }
    return job;
  }
  private watchDrain(job: CompileJob, recovered = false) {
    if (!["queued", "running"].includes(job.status)) return;
    if (recovered) this.recovering.add(job.id);
    this.draining.add(job.id);
    this.inspectDrain(job);
    if (this.draining.size && !this.drainTimer) {
      this.drainTimer = setInterval(() => {
        for (const id of this.draining) this.inspectDrain(this.jobs.get(id)!);
        if (!this.draining.size) {
          clearInterval(this.drainTimer);
          this.drainTimer = undefined;
        }
      }, 75);
      this.drainTimer.unref();
    }
  }
  private inspectDrain(job: CompileJob) {
    const dir = this.dir(job.id),
      identity = supervisorIdentity(dir);
    if (identity) {
      // A missing/unknown process listing never proves a drained group. Never
      // signal a PID loaded from disk, including after a failed supervisor.
      const members = processGroup(identity.pid);
      if (members === null || members.length) return;
    }
    this.finish(job, identity ? supervisorResult(dir, identity) : null);
  }
  private finish(job: CompileJob, result: SupervisorResult | null) {
    const recovered = this.recovering.delete(job.id),
      dir = this.dir(job.id);
    this.draining.delete(job.id);
    this.processes.delete(job.id);
    job.log = compilerLog(dir) ?? job.log;
    if (recovered || result?.reason === "parent-lost")
      job.log +=
        "\nBuild interrupted by server restart; compiler cleanup completed.\n";
    else if (result?.reason === "timeout")
      job.log += `\nBuild exceeded the configured time limit${job.timeoutMs ? ` (${job.timeoutMs} ms)` : ""}.\n`;
    else if (!result || result.reason === "error")
      job.log += "\nCompiler supervision failed; output was not promoted.\n";
    let runtimeUnchanged = true;
    try {
      this.runtimes.forSnapshot(job.runtime!);
    } catch {
      runtimeUnchanged = false;
      job.log +=
        "\nThe selected TeX installation changed during this build. Refresh runtimes and rebuild; this output was not promoted.\n";
    }
    const out = path.join(dir, "out"),
      pdf = path.join(out, path.basename(job.root, ".tex") + ".pdf");
    let usable = false;
    try {
      within(dir, "out/" + path.basename(pdf));
      const fd = fs.openSync(
        pdf,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      try {
        const stat = fs.fstatSync(fd),
          header = Buffer.alloc(5);
        usable =
          stat.isFile() &&
          stat.nlink === 1 &&
          stat.size >= 5 &&
          fs.readSync(fd, header, 0, 5, 0) === 5 &&
          header.toString("ascii") === "%PDF-";
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      /* No valid, confined PDF was produced. */
    }
    const normalExit = !recovered && result?.reason === "exit";
    job.status =
      job.cancelRequested || result?.reason === "cancel"
        ? "cancelled"
        : normalExit && result.code === 0 && usable && runtimeUnchanged
          ? "succeeded"
          : "failed";
    // Interrupted/timed-out output is never exposed, including Continue mode.
    job.pdf =
      usable &&
      runtimeUnchanged &&
      normalExit &&
      (job.status === "succeeded" ||
        (job.status === "failed" && job.options?.errorHandling === "continue"));
    job.diagnostics = buildDiagnostics(
      dir,
      job.root,
      job.log,
      job.status === "failed",
    );
    job.diagnosticsVersion = DIAGNOSTICS_VERSION;
    this.persist(job);
  }
  kill(id: string) {
    const child = this.processes.get(id);
    // Only this live IPC handle can request termination. Its independent
    // supervisor owns TERM/KILL and the deadline, even if this server dies.
    if (child?.connected) {
      try {
        child.send({ type: "cancel" }, (error) => {
          if (error && child.connected) child.disconnect();
        });
      } catch {
        if (child.connected) child.disconnect();
      }
    }
  }
  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new AppError(404, "Build not found.");
    if (["queued", "running"].includes(job.status)) {
      job.cancelRequested = true;
      if (!this.processes.has(id) && !this.draining.has(id))
        job.status = "cancelled";
      this.kill(id);
      this.persist(job);
    }
    return job;
  }
  async shutdown() {
    this.closing = true;
    for (const job of this.jobs.values())
      if (["queued", "running"].includes(job.status)) this.cancel(job.id);
    // Keep storage and the server alive until the actual owned groups drain.
    while (this.processes.size || this.draining.size)
      await new Promise((resolve) => setTimeout(resolve, 25));
    clearInterval(this.drainTimer);
    this.drainTimer = undefined;
  }
  sync(
    id: string,
    query: {
      direction: string;
      path?: string;
      line?: number;
      page?: number;
      x?: number;
      y?: number;
    },
  ) {
    const job = this.jobs.get(id);
    if (!job?.pdf) throw new AppError(404, "Compile the document first.");
    const runtime = job.runtime
      ? this.runtimes.forSnapshot(job.runtime)
      : undefined;
    const command = runtime ? runtime.commands.synctex : toolPath("synctex");
    if (!command) throw new AppError(503, "SyncTeX is not installed.");
    const source = path.join(this.dir(id), "source"),
      pdf = this.pdfPath(id);
    if (
      query.direction === "forward" &&
      !fs.existsSync(within(source, query.path ?? job.root))
    )
      throw new AppError(
        409,
        "This PDF predates the file move. Recompile before navigating between source and PDF.",
      );
    const args =
      query.direction === "forward"
        ? [
            "view",
            "-i",
            `${Math.max(1, Number(query.line) || 1)}:0:${within(source, query.path ?? job.root)}`,
            "-o",
            pdf,
          ]
        : [
            "edit",
            "-o",
            `${Math.max(1, Number(query.page) || 1)}:${Number(query.x) || 0}:${Number(query.y) || 0}:${pdf}`,
          ];
    const result = spawnSync(
      "/usr/bin/sandbox-exec",
      ["-f", path.join(this.dir(id), "compiler.sb"), command, ...args],
      {
        env: compilerEnvironment(path.join(this.dir(id), "home"), runtime),
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 500000,
      },
    );
    if (result.error || result.status !== 0)
      throw new AppError(
        422,
        "No SyncTeX location was found for this position.",
      );
    const fields: Record<string, string> = {};
    for (const line of result.stdout.split("\n")) {
      const at = line.indexOf(":");
      if (at > 0 && !fields[line.slice(0, at)])
        fields[line.slice(0, at)] = line.slice(at + 1);
    }
    if (query.direction === "forward")
      return {
        page: Number(fields.Page) || 1,
        x: Number(fields.x) || 0,
        y: Number(fields.y) || 0,
      };
    const relative = path.relative(source, fields.Input ?? "");
    safeSync(relative);
    return { path: relative, line: Number(fields.Line) || 1 };
  }
}
function safeSync(relative: string) {
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new AppError(422, "SyncTeX pointed outside this project snapshot.");
}
