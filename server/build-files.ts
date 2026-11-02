import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Compiler } from "./compiler";
import {
  AppError,
  safePath,
  within,
  validateTree,
  writeZip,
  type ImportedFile,
} from "./files";
import {
  BUILD_EXPORT_BYTES,
  BUILD_FILE_LIMIT,
  BUILD_TEXT_BYTES,
  compileOptions,
  type BuildDownload,
  type BuildExportPlan,
  type BuildFiles,
} from "../shared/compiler";

type Node = {
  path: string;
  full: string;
  root: string;
  bytes: number;
  directory: boolean;
  stat: fs.Stats;
};
const digest = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
function object(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new AppError(400, "Invalid build-file request.");
  return v as Record<string, any>;
}
function cleanPath(v: unknown) {
  const p = safePath(v);
  if (/[\u0000-\u001f\u007f]/u.test(p) || Buffer.from(p).toString("utf8") !== p)
    throw new AppError(
      400,
      "Build-file names cannot contain control characters or invalid Unicode.",
    );
  return p;
}
function scan(root: string): Node[] {
  const result: Node[] = [];
  if (fs.lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new AppError(400, "Symlinked build folders cannot be downloaded.");
  if (!fs.existsSync(root)) return result;
  let entries = 0;
  function visit(relative: string) {
    const dir = relative ? within(root, relative) : root;
    for (const name of fs.readdirSync(dir).sort()) {
      if (++entries > BUILD_FILE_LIMIT * 2)
        throw new AppError(
          413,
          "This build has too many files or folders to inspect (10,000 entries).",
        );
      if (name.startsWith(".")) continue;
      const p = cleanPath(relative ? relative + "/" + name : name),
        full = within(root, p),
        stat = fs.lstatSync(full);
      if (!stat.isFile() && !stat.isDirectory())
        throw new AppError(
          400,
          "Only regular build files and folders can be downloaded.",
        );
      if (stat.isFile() && stat.nlink !== 1)
        throw new AppError(400, "Linked build files cannot be downloaded.");
      result.push({
        path: p,
        full,
        root,
        bytes: stat.isDirectory() ? 0 : stat.size,
        directory: stat.isDirectory(),
        stat,
      });
      if (result.length > BUILD_FILE_LIMIT)
        throw new AppError(
          413,
          "This build contains more than 5,000 files and folders.",
        );
      if (stat.isDirectory()) visit(p);
    }
  }
  visit("");
  return result;
}
function unchanged(a: fs.Stats, b: fs.Stats) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
function read(node: Node) {
  within(node.root, node.path);
  const fd = fs.openSync(
    node.full,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || !unchanged(node.stat, before))
      throw new AppError(
        409,
        "Build files changed. Refresh the list and review the download again.",
      );
    if (before.size > BUILD_EXPORT_BYTES)
      throw new AppError(
        413,
        "This build file exceeds the 100 MiB download limit.",
      );
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!n)
        throw new AppError(
          409,
          "Build file changed while reading. Refresh and try again.",
        );
      offset += n;
    }
    if (!unchanged(before, fs.fstatSync(fd)))
      throw new AppError(
        409,
        "Build file changed while reading. Refresh and try again.",
      );
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}
export class BuildArtifacts {
  private downloads = new Map<
    string,
    {
      bytes: Buffer;
      filename: string;
      expires: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    public compiler: Compiler,
    private now = Date.now,
  ) {}
  private context(id: string) {
    const job = this.compiler.jobs.get(id);
    if (!job) throw new AppError(404, "Build not found.");
    if (
      ["queued", "running"].includes(job.status) ||
      this.compiler.processes.has(id)
    )
      throw new AppError(
        409,
        "This build is still writing files. Finish or stop it, then refresh the list.",
      );
    const dir = this.compiler.dir(id);
    return {
      job,
      outputs: scan(within(dir, "out")),
      source: () => scan(within(dir, "source")),
    };
  }
  list(id: string): BuildFiles {
    const c = this.context(id),
      s = c.source();
    return {
      buildId: id,
      runtime: c.job.runtime,
      projectId: c.job.projectId,
      generation: c.job.generation,
      root: c.job.root,
      engine: c.job.engine,
      status: c.job.status,
      started: c.job.started,
      preview: !!c.job.preview,
      options: compileOptions(c.job.options),
      files: c.outputs
        .filter((n) => !n.directory)
        .map((n) => ({ path: n.path, bytes: n.bytes })),
      sourceFiles: s.length,
      sourceBytes: s.reduce((n, f) => n + f.bytes, 0),
    };
  }
  file(id: string, name: unknown) {
    const p = cleanPath(name),
      n = this.context(id).outputs.find((n) => n.path === p && !n.directory);
    if (!n) throw new AppError(404, "Generated file not found in this build.");
    return { path: p, bytes: read(n) };
  }
  text(id: string, name: unknown) {
    const p = cleanPath(name),
      n = this.context(id).outputs.find((n) => n.path === p && !n.directory);
    if (!n) throw new AppError(404, "Generated file not found in this build.");
    if (n.bytes > BUILD_TEXT_BYTES)
      return {
        path: p,
        text: null,
        reason:
          "This file is larger than the 512 KiB text preview limit. Download it to inspect it.",
      };
    const bytes = read(n),
      text = bytes.toString("utf8");
    if (bytes.includes(0) || !Buffer.from(text).equals(bytes))
      return {
        path: p,
        text: null,
        reason:
          "This file is binary or uses a different text encoding. Download it to inspect it.",
      };
    return { path: p, text, reason: null };
  }
  private plan(id: string, input: unknown) {
    const r = object(input),
      c = this.context(id);
    if (
      !Array.isArray(r.paths) ||
      r.paths.length > BUILD_FILE_LIMIT ||
      typeof r.includeSource !== "boolean"
    )
      throw new AppError(
        400,
        "Choose up to 5,000 generated files and whether to include this build's source.",
      );
    const paths = (r.paths as unknown[]).map(cleanPath).sort();
    if (
      new Set(paths).size !== paths.length ||
      (!paths.length && !r.includeSource)
    )
      throw new AppError(
        400,
        "Choose distinct generated files or include the source snapshot.",
      );
    const output = paths.map((p) => {
        const n = c.outputs.find((n) => n.path === p && !n.directory);
        if (!n)
          throw new AppError(
            404,
            "A selected generated file is no longer in this build. Refresh the list.",
          );
        return n;
      }),
      source: Node[] = r.includeSource ? c.source() : [],
      inputs = [...source, ...output];
    const sizes = new Map(inputs.map((n) => [n.path, n.bytes]));
    if (
      source.reduce((n, f) => n + f.bytes, 0) > BUILD_EXPORT_BYTES ||
      output.reduce((n, f) => n + f.bytes, 0) > BUILD_EXPORT_BYTES ||
      [...sizes.values()].reduce((n, v) => n + v, 0) > BUILD_EXPORT_BYTES
    )
      throw new AppError(
        413,
        "The selected source or generated files exceed the 100 MiB ZIP limit. Select fewer generated files or omit the source snapshot.",
      );
    const merged = new Map<string, ImportedFile>(),
      fingerprints: any[] = [],
      collisions: string[] = [];
    for (const [group, nodes] of [
      ["source", source],
      ["output", output],
    ] as const)
      for (const n of nodes) {
        const data = n.directory ? Buffer.alloc(0) : read(n),
          previous = merged.get(n.path);
        fingerprints.push([group, n.path, n.directory, digest(data)]);
        if (previous) {
          if (previous.directory || n.directory)
            throw new AppError(
              409,
              `Generated file “${n.path}” conflicts with a source folder. Deselect it before exporting.`,
            );
          if (!previous.data.equals(data)) collisions.push(n.path);
        }
        merged.set(n.path, { path: n.path, data, directory: n.directory });
      }
    const files = [...merged.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    validateTree(files);
    const plan: BuildExportPlan = {
      buildId: id,
      paths,
      includeSource: r.includeSource,
      files: files.map((f) => ({
        path: f.path + (f.directory ? "/" : ""),
        bytes: f.data.length,
      })),
      bytes: files.reduce((n, f) => n + f.data.length, 0),
      collisions,
      hash: digest(JSON.stringify([id, paths, r.includeSource, fingerprints])),
    };
    return { plan, files };
  }
  preview(id: string, input: unknown) {
    return this.plan(id, input).plan;
  }
  prepare(id: string, input: unknown): BuildDownload {
    const r = object(input);
    if (
      typeof r.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(r.hash) ||
      typeof r.allowReplace !== "boolean"
    )
      throw new AppError(
        400,
        "Review this ZIP and its source-file replacements before preparation.",
      );
    const { plan, files } = this.plan(id, r);
    if (plan.hash !== r.hash)
      throw new AppError(
        409,
        "Build files changed after review. Review the ZIP again before preparation.",
      );
    if (plan.collisions.length && !r.allowReplace)
      throw new AppError(
        409,
        "Selected generated files replace source files in the ZIP. Confirm those replacements or change the selection.",
      );
    const bytes = writeZip(files),
      token = randomUUID(),
      expires = this.now() + 15 * 60 * 1000;
    if (bytes.length > 200 * 1024 * 1024)
      throw new AppError(
        413,
        "The prepared ZIP exceeds the download cache limit.",
      );
    for (const [key, value] of this.downloads)
      if (value.expires <= this.now()) this.remove(key);
    while (
      this.downloads.size >= 4 ||
      [...this.downloads.values()].reduce((n, v) => n + v.bytes.length, 0) +
        bytes.length >
        200 * 1024 * 1024
    )
      this.remove(this.downloads.keys().next().value!);
    const filename = `build-${id.slice(0, 8)}-${plan.includeSource ? "source-and-output" : "generated-files"}.zip`,
      timer = setTimeout(() => this.remove(token), 15 * 60 * 1000);
    timer.unref();
    this.downloads.set(token, { bytes, expires, filename, timer });
    return {
      id: token,
      url: "/api/build-exports/" + token,
      filename,
      bytes: bytes.length,
      expiresAt: new Date(expires).toISOString(),
    };
  }
  download(id: string) {
    const value = this.downloads.get(id);
    if (!value || value.expires <= this.now()) {
      this.remove(id);
      throw new AppError(
        410,
        "This prepared ZIP expired or Leaf restarted. Review the ZIP and prepare it again.",
      );
    }
    return { bytes: value.bytes, filename: value.filename };
  }
  private remove(id: string) {
    const value = this.downloads.get(id);
    if (value) clearTimeout(value.timer);
    this.downloads.delete(id);
  }
  dispose() {
    for (const id of this.downloads.keys()) this.remove(id);
  }
}
