import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Store } from "./store";
import { AppError, within, safePath } from "./files";
import { Compiler, compilerEnvironment, sandboxProfile } from "./compiler";
export interface WordCountResult {
  generation: number;
  root: string;
  engine: string;
  text: number;
  headings: number;
  captions: number;
  headers: number;
  floats: number;
  inlineMath: number;
  displayMath: number;
  sections: {
    title: string;
    text: number;
    headings: number;
    captions: number;
  }[];
  warnings: string[];
  report: string;
}
export function parseWordCount(
  report: string,
  generation: number,
  root: string,
): WordCountResult {
  const value = (label: string) => {
    const match = report.match(new RegExp("^" + label + ":\\s*(\\d+)", "m"));
    if (!match)
      throw new AppError(
        422,
        "TeXcount could not produce a complete count. " + report.slice(0, 2500),
      );
    return Number(match[1]);
  };
  const sections = [
    ...report.matchAll(/^\s+(\d+)\+(\d+)\+(\d+)\s+\([^\n]+\)\s+(.+)$/gm),
  ].map((m) => ({
    title: m[4],
    text: Number(m[1]),
    headings: Number(m[2]),
    captions: Number(m[3]),
  }));
  return {
    generation,
    root,
    engine: "TeXcount 3.1.1",
    text: value("Words in text"),
    headings: value("Words in headers"),
    captions: value("Words outside text \\(captions, etc.\\)"),
    headers: value("Number of headers"),
    floats: value("Number of floats/tables/figures"),
    inlineMath: value("Number of math inlines"),
    displayMath: value("Number of math displayed"),
    sections,
    warnings: report
      .split("\n")
      .filter((l) => /^!!!|^Warning:|^ERROR:|\(errors:\d+\)/.test(l)),
    report,
  };
}
export class WordCounter {
  private active = new Map<string, Promise<WordCountResult>>();
  constructor(
    private store: Store,
    private compiler?: Compiler,
  ) {}
  count(id: string, includeBibliography = false) {
    const p = this.store.project(id),
      key = [id, p.generation, includeBibliography].join(":");
    if (this.active.has(key)) return this.active.get(key)!;
    if (this.active.size >= 2)
      throw new AppError(
        429,
        "Two word counts are already running. Try again shortly.",
      );
    const promise = this.run(id, includeBibliography).finally(() =>
      this.active.delete(key),
    );
    this.active.set(key, promise);
    return promise;
  }
  private async run(id: string, includeBibliography: boolean) {
    const project = this.store.project(id);
    if (!project.root)
      throw new AppError(
        400,
        "Choose a root .tex document in project settings.",
      );
    const root = safePath(project.root);
    if (!root.endsWith(".tex"))
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
        "Word count requires the macOS analysis sandbox in this release.",
      );
    const parent = path.join(this.store.root, "analysis");
    fs.mkdirSync(parent, { recursive: true });
    const dir = fs.mkdtempSync(path.join(parent, "count-")),
      source = path.join(dir, "source");
    try {
      for (const folder of ["source", "out", "home"])
        fs.mkdirSync(path.join(dir, folder));
      let size = 0;
      for (const file of project.files.filter(
        (f) => !f.deleted && f.kind === "text",
      )) {
        size += file.size;
        if (size > 32 * 1024 * 1024)
          throw new AppError(
            413,
            "Word count supports up to 32 MB of project text.",
          );
        const dest = within(source, file.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, this.store.readText(id, file.path).content);
      }
      const compiled = this.compiler?.latestPdf(id);
      if (compiled?.generation === project.generation && this.compiler) {
        const bbl = path.join(
          this.compiler.dir(compiled.id),
          "out",
          path.basename(root, ".tex") + ".bbl",
        );
        if (
          fs.existsSync(bbl) &&
          fs.lstatSync(bbl).isFile() &&
          fs.statSync(bbl).size <= 2 * 1024 * 1024
        ) {
          const dest = within(source, root.replace(/\.tex$/, ".bbl"));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(bbl, dest);
        }
      }
      const script = path.join(dir, "texcount.pl");
      fs.copyFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../vendor/texcount/texcount.pl",
        ),
        script,
      );
      fs.writeFileSync(path.join(dir, "analysis.sb"), sandboxProfile(dir));
      const args = [
        "-f",
        path.join(dir, "analysis.sb"),
        "/usr/bin/perl",
        script,
        "-utf8",
        "-merge",
        "-nocol",
        "-sub",
        ...(includeBibliography ? ["-incbib"] : []),
        "./" + root,
      ];
      const report = await new Promise<string>((resolve, reject) => {
        const child = spawn("/usr/bin/sandbox-exec", args, {
          cwd: source,
          env: compilerEnvironment(path.join(dir, "home")),
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
        let output = "",
          failed = false;
        const fail = (message: string) => {
          if (failed) return;
          failed = true;
          try {
            process.kill(-child.pid!, "SIGKILL");
          } catch {}
          reject(new AppError(422, message));
        };
        const timer = setTimeout(
          () =>
            fail(
              "Word count exceeded 15 seconds. Simplify cyclic inputs or reduce the project.",
            ),
          15000,
        );
        timer.unref();
        for (const stream of [child.stdout, child.stderr]) {
          stream.setEncoding("utf8");
          stream.on("data", (chunk: string) => {
            output += chunk;
            if (Buffer.byteLength(output) > 1024 * 1024)
              fail(
                "Word count output exceeded its limit. Check the source inputs.",
              );
          });
        }
        child.on("error", () => {
          clearTimeout(timer);
          fail("The word count utility could not start.");
        });
        child.on("close", () => {
          clearTimeout(timer);
          if (!failed) resolve(output.replaceAll(dir, "[analysis]"));
        });
      });
      return parseWordCount(report, project.generation, root);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
