import fs from "node:fs";
import path from "node:path";
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { AppError, safePath, within } from "./files";
import type { Compiler } from "./compiler";
import {
  sourceOccurrences,
  SOURCE_LOCATION_LIMIT,
  validSourceSymbol,
  type InstalledDefinitionPreview,
  type SourceLocation,
  type SourceOccurrence,
  type SourceSymbol,
} from "../shared/source-navigation";

const RECORDER_BYTES = 2 * 1024 * 1024;
const PACKAGE_BYTES = 1024 * 1024;
const TOTAL_BYTES = 8 * PACKAGE_BYTES;
const MAX_FILES = 128;
const MAX_DECLARATIONS = 2048;
const stamp = (stat: fs.Stats) =>
  [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
  ].join(":");

export function recordedPackages(text: string, distPaths: string[]) {
  const files = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("INPUT ")) continue;
    const absolute = line.slice(6);
    const root = distPaths.find((dir) => absolute.startsWith(dir + "/tex/"));
    if (!root) continue;
    const relative = absolute.slice(root.length + 1);
    if (!/^[\w@+.-]+(?:\/[\w@+.-]+)*\.(?:sty|cls)$/i.test(relative)) continue;
    try {
      files.add(safePath(relative));
    } catch {
      // A recorder is compiler output and can contain untrusted input paths.
    }
    if (files.size > MAX_FILES) break;
  }
  return [...files];
}

function plainFile(file: string, limit: number) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit)
    throw Error("Unsafe or oversized source file");
  return stat;
}

function readText(file: string, stat: fs.Stats) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    if (
      stamp(fs.fstatSync(fd)) !== stamp(stat) ||
      fs.realpathSync(file) !== file
    )
      throw Error("Source path changed");
    const data = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < data.length) {
      const n = fs.readSync(fd, data, size, data.length - size, null);
      if (!n) break;
      size += n;
    }
    const bytes = data.subarray(0, size);
    if (
      size !== stat.size ||
      stamp(fs.fstatSync(fd)) !== stamp(stat) ||
      !isUtf8(bytes)
    )
      throw Error("Source changed or is not UTF-8");
    return bytes.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function declarations(name: string, text: string) {
  const parsed = sourceOccurrences({ path: name, content: text });
  const definitions = parsed.occurrences.filter(
    (entry) =>
      entry.role === "definition" &&
      (entry.kind === "command" || entry.kind === "environment"),
  );
  return {
    hash: createHash("sha256").update(text).digest("hex"),
    definitions: definitions.slice(0, MAX_DECLARATIONS),
    limited: parsed.limited || definitions.length > MAX_DECLARATIONS,
  };
}

const matches = (entry: SourceOccurrence, symbol: SourceSymbol) =>
  entry.kind === symbol.kind && entry.name === symbol.name;

/** Only recorded sources from the currently selected distribution are eligible. */
export class InstalledDefinitions {
  private cache = new Map<
    string,
    ReturnType<typeof declarations> & { stamp: string }
  >();
  constructor(private compiler: Compiler) {}

  private inputs(projectId: string) {
    const project = this.compiler.store.requireProject(projectId);
    const job = this.compiler.latestPdf(projectId);
    if (
      !job?.runtime ||
      job.root !== project.root ||
      job.engine !== project.engine
    )
      throw new AppError(
        409,
        "Compile this document to look up definitions in its installed packages.",
      );
    const settings = this.compiler.settings(projectId);
    const runtime = this.compiler.runtimes.resolve(settings.runtimeId);
    if (
      runtime.binDir !== job.runtime.binDir ||
      runtime.fingerprint !== job.runtime.fingerprint
    )
      throw new AppError(
        409,
        "Compile with the selected TeX runtime to look up its package definitions.",
      );
    const distribution = path.join(runtime.texRoot, "texmf-dist");
    const root = fs.realpathSync(distribution);
    if (!root.startsWith(runtime.texRoot + path.sep))
      throw Error("Distribution escapes installation");
    const recorder = within(
      fs.realpathSync(this.compiler.store.root),
      `builds/${job.id}/out/${path.basename(job.root, ".tex")}.fls`,
    );
    const names = recordedPackages(
      readText(recorder, plainFile(recorder, RECORDER_BYTES)),
      [distribution, root],
    );
    return {
      root,
      job,
      runtime,
      names,
      earlier: project.generation !== job.generation,
    };
  }

  find(projectId: string, symbol: SourceSymbol) {
    const locations: SourceLocation[] = [],
      warnings: string[] = [];
    let total = 0;
    try {
      const { root, job, runtime, names, earlier } = this.inputs(projectId);
      if (earlier)
        warnings.push(
          "Installed definitions use the files recorded by an earlier successful build.",
        );
      let bytes = 0,
        limited = names.length > MAX_FILES,
        skipped = false;
      for (const name of names.slice(0, MAX_FILES)) {
        try {
          const file = within(root, name),
            stat = plainFile(file, PACKAGE_BYTES);
          if (bytes + stat.size > TOTAL_BYTES) {
            limited = true;
            break;
          }
          bytes += stat.size;
          const signature = stamp(stat);
          let entry = this.cache.get(file);
          if (entry?.stamp !== signature) {
            entry = {
              ...declarations(name, readText(file, stat)),
              stamp: signature,
            };
            this.cache.set(file, entry);
            if (this.cache.size > MAX_FILES)
              this.cache.delete(this.cache.keys().next().value!);
          }
          limited ||= entry.limited;
          for (const found of entry.definitions) {
            if (!matches(found, symbol)) continue;
            total++;
            if (locations.length < SOURCE_LOCATION_LIMIT)
              locations.push({
                ...found,
                path: name,
                hash: entry.hash,
                revision: 0,
                installed: { buildId: job.id, runtime: runtime.label },
              });
          }
        } catch {
          skipped = true;
        }
      }
      if (limited || skipped)
        warnings.push(
          "Some installed sources exceeded the lookup limits or could not be read safely.",
        );
    } catch (e) {
      warnings.push(
        e instanceof AppError && e.statusCode !== 400
          ? e.message
          : "The successful build’s installed package recorder is unavailable.",
      );
    }
    return { locations, total, warnings };
  }

  open(
    projectId: string,
    requested: Partial<SourceLocation>,
  ): InstalledDefinitionPreview {
    this.compiler.store.requireProject(projectId);
    const name = safePath(requested.path);
    const symbol = requested as SourceLocation;
    if (
      !["command", "environment"].includes(symbol.kind) ||
      !validSourceSymbol(symbol) ||
      typeof symbol.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(symbol.hash) ||
      !Number.isSafeInteger(symbol.from) ||
      !Number.isSafeInteger(symbol.to) ||
      symbol.from < 0 ||
      symbol.to <= symbol.from ||
      typeof symbol.installed?.buildId !== "string"
    )
      throw new AppError(400, "Choose a definition from the current results.");
    try {
      const { root, job, runtime, names } = this.inputs(projectId);
      if (
        symbol.installed.buildId === job.id &&
        names.slice(0, MAX_FILES).includes(name)
      ) {
        const file = within(root, name);
        const text = readText(file, plainFile(file, PACKAGE_BYTES));
        const parsed = declarations(name, text);
        const location = parsed.definitions.find(
          (entry) =>
            matches(entry, symbol) &&
            entry.from === symbol.from &&
            entry.to === symbol.to,
        );
        if (parsed.hash === symbol.hash && location) {
          const { from, to, line } = location;
          const before = Array.from(text.slice(Math.max(0, from - 1200), from))
            .slice(-500)
            .join("");
          const after = Array.from(text.slice(to, to + 1200))
            .slice(0, 500)
            .join("");
          return {
            path: name,
            line,
            runtime: runtime.label,
            before,
            symbol: text.slice(from, to),
            after,
          };
        }
      }
    } catch {
      // A replaced recorder, installation, or file invalidates the chosen result.
    }
    throw new AppError(
      409,
      "The installed definition changed or is unavailable. Refresh locations and choose again.",
    );
  }
}
