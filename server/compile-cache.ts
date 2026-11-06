import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { safePath, within, type ImportedFile } from "./files";

const DATABASE_LIMIT = 2 * 1024 * 1024;
const ARTIFACT_LIMIT = 1024 * 1024;
const CACHE_LIMIT = 8 * 1024 * 1024;
const AUXILIARY = /\.(?:aux|bbl|bcf|idx|ind|lof|lot|nav|out|run\.xml|snm|toc)$/;
const DEPENDENCY =
  /^(\s*)"([^"]*)"\s+(-?\d+(?:\.\d+)?)\s+(-?\d+)\s+(\S+)\s+"([^"]*)"\s*$/;
const RULE =
  /^\["(pdflatex|lualatex|xelatex|latex|xdvipdfmx|dvips|ps2pdf|(?:bibtex|biber|makeindex) [^"]+)"\]\s+\S+\s+"([^"]+)"\s+"([^"]+)"\s+"/;
const stamp = (stat: fs.BigIntStats) =>
  [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");

export function sourceLayout(files: readonly ImportedFile[]) {
  const entries = files.map((file) => [file.path, !!file.directory] as const);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function readState(dir: string, name: string, limit: number) {
  const fd = fs.openSync(
    within(dir, "out/" + name),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > limit)
      throw new Error("Unsafe build state.");
    const bytes = Buffer.alloc(before.size);
    const count = fs.readSync(fd, bytes);
    const after = fs.fstatSync(fd);
    if (
      count !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.nlink !== 1
    )
      throw new Error("Build state changed.");
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function outputName(name: string, roots: readonly string[]) {
  const root = roots.find((candidate) => name.startsWith(candidate + "/out/"));
  if (root) return name.slice(root.length + "/out/".length);
  if (name.startsWith("../out/")) return name.slice("../out/".length);
}

function databaseLines(data: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (!/^# Fdb version 4\r?\n/.test(text) || text.includes("\0"))
    throw new Error("Unsupported latexmk database.");
  return text.split(/\r?\n/);
}

/** Only completed builds supply state. The new run must still produce its own PDF. */
export function seedCompileCache(
  previous: string,
  current: string,
  main: string,
) {
  const base = path.basename(main, ".tex"),
    database = base + ".fdb_latexmk";
  const files = new Map<string, Buffer>();
  try {
    const oldPaths = [...new Set([previous, fs.realpathSync(previous)])];
    if ([...oldPaths, current].some((p) => /["\\\r\n]/.test(p))) return;
    const data = readState(previous, database, DATABASE_LIMIT);
    const inputs = new Set<string>();
    const lines = databaseLines(data).map((line) => {
      if (line.startsWith("[")) {
        const rule = RULE.exec(line);
        if (!rule) throw new Error("Unsupported latexmk rule.");
        const input = rule[2],
          output = outputName(rule[3], oldPaths);
        safePath(output);
        safePath(outputName(input, oldPaths) ?? input.replace(/^\.\//, ""));
        const specialized = /^(?:bibtex|biber|makeindex) (.+)$/.exec(rule[1]);
        if (specialized) safePath(outputName(specialized[1], oldPaths));
      }
      const dep = DEPENDENCY.exec(line);
      if (!dep) return line;
      const name = dep[2];
      const prefix = oldPaths.find((old) => name.startsWith(old + "/"));
      const outPath = outputName(name, oldPaths);
      if (
        outPath &&
        ![".dvi", ".ps", ".xdv"].some((ext) => outPath === base + ext)
      )
        inputs.add(outPath);
      if (!prefix && path.isAbsolute(name)) return line;
      // Force latexmk to hash snapshot dependencies even after a same-size edit
      // made within the timestamp resolution of the previous build.
      return `${dep[1]}"${name}" -1 ${dep[4]} ${dep[5]} "${dep[6]}"`;
    });
    if (!inputs.size || inputs.size > 256) return;
    for (const input of inputs) {
      if (!input.endsWith(".bbl")) continue;
      const log = input.slice(0, -4) + ".blg";
      if (
        fs.lstatSync(within(previous, "out/" + log), { throwIfNoEntry: false })
      )
        inputs.add(log);
    }
    let total = data.length;
    for (const input of inputs) {
      if (
        !(AUXILIARY.test(input) || input.endsWith(".blg")) ||
        fs.lstatSync(within(current, "source/" + input), {
          throwIfNoEntry: false,
        })
      )
        return;
      const bytes = readState(previous, input, ARTIFACT_LIMIT);
      total += bytes.length;
      if (
        total > CACHE_LIMIT ||
        oldPaths.some((old) => bytes.includes(old + "/"))
      )
        return;
      files.set(input, bytes);
    }
    const rebased = lines
      .map((line) => {
        for (const old of oldPaths)
          line = line.replaceAll(old + "/", current + "/");
        return line;
      })
      .join("\n");
    files.set(database, Buffer.from(rebased));
  } catch {
    // Damaged, unsupported or missing state is only a cache miss.
    return;
  }

  const stage = path.join(current, ".cache-stage-" + randomUUID()),
    seeds = new Map<string, string>();
  let staged = false;
  try {
    fs.mkdirSync(stage, { mode: 0o700 });
    staged = true;
    for (const [name, bytes] of files) {
      const target = within(stage, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const fd = fs.openSync(target, "wx", 0o600);
      try {
        fs.writeFileSync(fd, bytes);
        seeds.set(name, stamp(fs.fstatSync(fd, { bigint: true })));
      } finally {
        fs.closeSync(fd);
      }
    }
    const out = within(current, "out");
    if (!fs.lstatSync(out).isDirectory() || fs.readdirSync(out).length) return;
    fs.renameSync(stage, out);
    staged = false;
    return seeds;
  } catch {
    // The new build output has not been touched.
  } finally {
    if (staged) {
      try {
        fs.rmSync(stage, { recursive: true, force: true });
      } catch {
        // A failed cache preparation can leave an isolated stage.
      }
    }
  }
}

/** Unused state is not a generated artifact of the new build. */
export function pruneCompileCache(
  dir: string,
  main: string,
  seeds: ReadonlyMap<string, string>,
  useDatabase = true,
) {
  const used = new Set<string>();
  if (useDatabase)
    try {
      const database = path.basename(main, ".tex") + ".fdb_latexmk",
        roots = [dir, fs.realpathSync(dir)];
      for (const line of databaseLines(
        readState(dir, database, DATABASE_LIMIT),
      )) {
        const name =
          DEPENDENCY.exec(line)?.[2] ?? /^\s*"([^"]*)"\s*$/.exec(line)?.[1];
        const output = name && outputName(name, roots);
        if (output) used.add(output);
      }
    } catch {
      // There is no readable dependency record endorsing the unused seeds.
    }
  for (const [name, before] of seeds) {
    if (used.has(name)) continue;
    try {
      const target = within(dir, "out/" + name),
        after = fs.lstatSync(target, { bigint: true, throwIfNoEntry: false });
      if (after?.isFile() && stamp(after) === before) fs.unlinkSync(target);
    } catch {
      // Never touch a changed or unsafe path during optional cache cleanup.
    }
  }
}
