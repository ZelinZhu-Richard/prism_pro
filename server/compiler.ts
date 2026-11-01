import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CompileJob, Diagnostic, Engine } from "../shared/types";
import { Store } from "./store";
import { AppError, within } from "./files";

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
  return Object.fromEntries(
    [
      "latexmk",
      "pdflatex",
      "xelatex",
      "lualatex",
      "bibtex",
      "biber",
      "synctex",
    ].map((n) => [n, !!toolPath(n)]),
  );
}
export function compilerEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    PATH: TEX_PATH,
    HOME: home,
    TMPDIR: home,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    openin_any: "p",
    openout_any: "p",
    shell_escape: "f",
    TEXMFOUTPUT: home,
    TEXMFVAR: path.join(home, "texmf-var"),
    TEXMFCONFIG: path.join(home, "texmf-config"),
  };
}
function quoted(s: string) {
  return JSON.stringify(s);
}
export function sandboxProfile(buildDir: string) {
  const root = fs.realpathSync(buildDir);
  return `(version 1)
(deny default)
(allow process*)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow mach-lookup)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath "/System") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/Library/TeX") (subpath "/Library/Fonts") (subpath "/Library/Apple") (subpath "/private/var/db/dyld") (subpath ${quoted(root)}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-write* (subpath ${quoted(path.join(root, "out"))}) (subpath ${quoted(path.join(root, "home"))}) (literal "/dev/null"))
`;
}
export function parseDiagnostics(log: string, root: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const line of log.split(/\r?\n/)) {
    let m = line.match(/(?:^|\/)([^\s:]+\.tex):(\d+):\s*(.*)/);
    if (m) {
      results.push({
        severity: "error",
        path: m[1].replace(/^\.\//, ""),
        line: Number(m[2]),
        message: m[3],
      });
      continue;
    }
    if (line.startsWith("! "))
      results.push({ severity: "error", path: root, message: line.slice(2) });
    else if (
      /LaTeX Warning:|Package .* Warning:|Overfull \\hbox|Underfull \\hbox/.test(
        line,
      )
    ) {
      const ln = line.match(/(?:lines?|input line)\s+(\d+)/);
      results.push({
        severity: "warning",
        path: root,
        line: ln ? Number(ln[1]) : undefined,
        message: line.trim(),
      });
    }
  }
  return results.slice(0, 150);
}
export class Compiler {
  jobs = new Map<string, CompileJob>();
  processes = new Map<string, ChildProcess>();
  constructor(public store: Store) {
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
          if (["running", "queued"].includes(job.status)) {
            job.status = "failed";
            job.log += "\nBuild interrupted by server restart.";
          }
          this.jobs.set(job.id, job);
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
    fs.writeFileSync(
      path.join(this.dir(job.id), "job.json"),
      JSON.stringify(job),
    );
  }
  list(projectId: string) {
    return [...this.jobs.values()]
      .filter((j) => j.projectId === projectId && !j.preview)
      .sort((a, b) => b.started.localeCompare(a.started));
  }
  latestPdf(projectId: string) {
    return (
      this.list(projectId).find((j) => j.pdf && j.status === "succeeded") ??
      null
    );
  }
  pdfPath(id: string) {
    const job = this.jobs.get(id);
    if (!job?.pdf) throw new AppError(404, "This build has no PDF.");
    return path.join(
      this.dir(id),
      "out",
      path.basename(job.root, ".tex") + ".pdf",
    );
  }
  start(
    projectId: string,
    clean = false,
    draft?: { runId: string; path: string; content: string },
  ) {
    const p = this.store.project(projectId);
    this.store.unlocked(projectId, undefined, draft?.runId);
    if (!p.root)
      throw new AppError(
        400,
        "Choose a root .tex document in project settings.",
      );
    if (
      process.platform !== "darwin" ||
      !fs.existsSync("/usr/bin/sandbox-exec")
    )
      throw new AppError(
        503,
        "This release requires the macOS compiler sandbox. Compilation has not been started.",
      );
    if (!toolPath("latexmk") || !toolPath(p.engine))
      throw new AppError(
        503,
        `Install a TeX distribution with latexmk and ${p.engine}, then restart Prism.`,
      );
    if (
      [...this.jobs.values()].some(
        (j) =>
          j.projectId === projectId && ["running", "queued"].includes(j.status),
      )
    )
      throw new AppError(409, "A build is already running.");
    const files = this.store
      .exportFiles(projectId)
      .map((f) =>
        draft && f.path === draft.path
          ? { ...f, data: Buffer.from(draft.content) }
          : f,
      );
    if (
      files.some(
        (f) =>
          f.path.endsWith(".tex") &&
          /\\usepackage(?:\[[^\]]*\])?\{biblatex\}/.test(f.data.toString()) &&
          !/backend\s*=\s*bibtex/.test(f.data.toString()),
      ) &&
      !toolPath("biber")
    )
      throw new AppError(
        503,
        "This project uses biblatex, but Biber is missing. Install Biber or configure the project to use BibTeX.",
      );
    const id = randomUUID(),
      job: CompileJob = {
        id,
        preview: !!draft,
        projectId,
        generation: p.generation,
        status: "queued",
        diagnostics: [],
        log: "",
        pdf: false,
        started: new Date().toISOString(),
        engine: p.engine,
        root: p.root,
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
    fs.writeFileSync(path.join(dir, "compiler.sb"), sandboxProfile(dir));
    const engineFlag: Record<Engine, string> = {
      pdflatex: "-pdf",
      xelatex: "-xelatex",
      lualatex: "-lualatex",
    };
    const args = [
      "-f",
      path.join(dir, "compiler.sb"),
      toolPath("latexmk")!,
      "-norc",
      engineFlag[p.engine],
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-file-line-error",
      "-synctex=1",
      "-no-shell-escape",
      `-outdir=${out}`,
      "./" + p.root,
    ];
    job.status = "running";
    this.persist(job);
    const child = spawn("/usr/bin/sandbox-exec", args, {
      cwd: source,
      env: compilerEnvironment(home),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(id, child);
    let timedOut = false;
    const collect = (data: Buffer) => {
      if (job.log.length < 1_000_000)
        job.log += data.toString().slice(0, 1_000_000 - job.log.length);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      job.log += "\nBuild exceeded the two-minute time limit.\n";
      this.kill(id);
    }, 120000);
    timer.unref();
    child.on("error", (e) => {
      job.log += "\nCould not start compiler: " + e.message;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      this.processes.delete(id);
      const pdf = path.join(out, path.basename(p.root, ".tex") + ".pdf");
      if (job.status !== "cancelled")
        job.status =
          code === 0 && fs.existsSync(pdf) && !timedOut
            ? "succeeded"
            : "failed";
      job.pdf = job.status === "succeeded";
      job.diagnostics = parseDiagnostics(job.log, p.root);
      if (
        job.status === "failed" &&
        !job.diagnostics.some((d) => d.severity === "error")
      )
        job.diagnostics.unshift({
          severity: "error",
          message:
            job.log
              .split("\n")
              .filter(Boolean)
              .slice(-5)
              .join(" ")
              .slice(0, 600) || "Compilation failed.",
        });
      this.persist(job);
    });
    return job;
  }
  kill(id: string) {
    const child = this.processes.get(id);
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
        setTimeout(() => {
          try {
            process.kill(-child.pid!, "SIGKILL");
          } catch {}
        }, 1000).unref();
      } catch {}
    }
  }
  cancel(id: string) {
    const j = this.jobs.get(id);
    if (!j) throw new AppError(404, "Build not found.");
    if (j.status === "running") {
      j.status = "cancelled";
      this.kill(id);
      this.persist(j);
    }
    return j;
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
    const command = toolPath("synctex");
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
        env: compilerEnvironment(path.join(this.dir(id), "home")),
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
