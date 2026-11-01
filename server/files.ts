import path from "node:path";
import fs from "node:fs";
import yauzl from "yauzl";
import { zipSync } from "fflate";
import type { SkippedArchiveEntry } from "../shared/types";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function safePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 500 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.includes(":")
  )
    throw new AppError(400, "Invalid project path.");
  const segments = value.split("/");
  if (
    segments.some(
      (s) =>
        !s ||
        s === "." ||
        s === ".." ||
        s.startsWith(".") ||
        s.toLowerCase() === "holdout",
    )
  )
    throw new AppError(
      400,
      "Hidden, protected, and parent paths are not allowed.",
    );
  return segments.join("/");
}
export function within(root: string, relative: string) {
  const clean = safePath(relative),
    target = path.resolve(root, clean);
  if (!target.startsWith(path.resolve(root) + path.sep))
    throw new AppError(400, "Path escapes this project.");
  let parent = root;
  if (fs.lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new AppError(400, "Symlinked project roots are not allowed.");
  for (const segment of clean.split("/")) {
    parent = path.join(parent, segment);
    // existsSync follows symlinks and misses a link whose target is absent.
    if (fs.lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new AppError(400, "Symlinks are not allowed in projects.");
  }
  return target;
}
export function kindOf(name: string, data: Buffer): "text" | "binary" {
  if (data.includes(0)) return "binary";
  const ext = path.extname(name).toLowerCase();
  return [
    ".tex",
    ".bib",
    ".sty",
    ".cls",
    ".bbl",
    ".bst",
    ".txt",
    ".md",
    ".json",
    ".csv",
    ".sh",
    ".py",
    ".r",
    ".yaml",
    ".yml",
    ".toml",
    ".log",
  ].includes(ext)
    ? "text"
    : "binary";
}
export interface ImportedFile {
  path: string;
  data: Buffer;
  directory?: boolean;
}
export function validateTree(files: ImportedFile[]) {
  const seen = new Map<string, ImportedFile>();
  for (const file of files) {
    const name = safePath(file.path).normalize("NFC").toLowerCase();
    if (seen.has(name))
      throw new AppError(409, "Duplicate or case-insensitive path collision.");
    seen.set(name, file);
  }
  for (const name of seen.keys()) {
    const parts = name.split("/");
    parts.pop();
    while (parts.length) {
      const ancestor = seen.get(parts.join("/"));
      if (ancestor && !ancestor.directory)
        throw new AppError(409, "A file conflicts with a parent directory.");
      parts.pop();
    }
  }
}
// ZIP tools commonly prefix members with ./ or include an explicit ./ root.
// Normalize those markers only; never resolve parent paths or follow links.
function archivePath(raw: string, directory: boolean): string | null {
  const value = directory ? raw.slice(0, -1) : raw;
  const invalid = (reason: string) =>
    new AppError(
      400,
      `Cannot import ZIP entry ${JSON.stringify(raw)}: ${reason}`,
    );
  if (
    !value ||
    value.length > 500 ||
    value.startsWith("/") ||
    /[\\\0:]/.test(value)
  )
    throw invalid("use a relative project path.");
  const parts = value.split("/");
  if (parts.some((p) => !p || p === ".."))
    throw invalid("empty and parent path segments are not allowed.");
  if (parts.some((p) => p.toLowerCase() === "holdout"))
    throw invalid("protected folders cannot be imported.");
  const name = parts.filter((p) => p !== ".").join("/");
  if (!name && !directory) throw invalid("the file needs a name.");
  return name || null;
}
export async function readZip(
  buffer: Buffer,
  onSkipped?: (entry: SkippedArchiveEntry) => void,
): Promise<ImportedFile[]> {
  if (buffer.length > 100 * 1024 * 1024)
    throw new AppError(413, "ZIP exceeds 100 MB.");
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err || !zip)
          return reject(new AppError(400, "Could not read this ZIP."));
        const files: ImportedFile[] = [],
          seen = new Set<string>();
        let total = 0,
          count = 0,
          failed = false;
        const fail = (e: Error) => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(e);
        };
        zip.on("error", () =>
          fail(
            new AppError(
              400,
              "This ZIP contains an invalid entry or unsafe path. Re-export the project with relative file paths.",
            ),
          ),
        );
        zip.on("entry", (entry: yauzl.Entry) => {
          try {
            if (++count > 10000)
              throw new AppError(413, "ZIP contains more than 10,000 entries.");
            const directory = entry.fileName.endsWith("/");
            const name = archivePath(entry.fileName, directory);
            if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
              throw new AppError(400, "ZIP symlinks are not supported.");
            if (entry.generalPurposeBitFlag & 1)
              throw new AppError(400, "Encrypted ZIPs are not supported.");
            total += entry.uncompressedSize;
            if (
              total > 500 * 1024 * 1024 ||
              entry.uncompressedSize > 50 * 1024 * 1024
            )
              throw new AppError(413, "ZIP exceeds the expanded size limit.");
            if (name === null) {
              zip.readEntry();
              return;
            }
            const parts = name.split("/");
            const metadata = parts.some(
              (p) =>
                p.toUpperCase() === "__MACOSX" ||
                p === ".DS_Store" ||
                p.startsWith("._"),
            );
            // Skip hidden files without opening their streams (including .env,
            // VCS data and editor settings). Report omissions to the user.
            if (metadata || parts.some((p) => p.startsWith("."))) {
              onSkipped?.({
                path: name + (directory ? "/" : ""),
                reason: metadata ? "metadata" : "hidden",
              });
              zip.readEntry();
              return;
            }
            safePath(name);
            if (seen.has(name))
              throw new AppError(
                400,
                `ZIP contains duplicate path ${JSON.stringify(name)}.`,
              );
            seen.add(name);
            if (directory) {
              files.push({
                path: name,
                data: Buffer.alloc(0),
                directory: true,
              });
              zip.readEntry();
              return;
            }
            zip.openReadStream(entry, (error, stream) => {
              if (error || !stream)
                return fail(
                  new AppError(400, "Could not extract a ZIP member."),
                );
              const chunks: Buffer[] = [];
              let bytes = 0;
              stream.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (
                  bytes > entry.uncompressedSize ||
                  bytes > 50 * 1024 * 1024
                ) {
                  stream.destroy();
                  fail(
                    new AppError(413, "ZIP member exceeded its declared size."),
                  );
                } else chunks.push(chunk);
              });
              stream.on("error", fail);
              stream.on("end", () => {
                if (!failed) {
                  files.push({ path: name, data: Buffer.concat(chunks) });
                  zip.readEntry();
                }
              });
            });
          } catch (e) {
            fail(e as Error);
          }
        });
        zip.on("end", () => {
          if (failed) return;
          try {
            validateTree(files);
          } catch (e) {
            fail(e as Error);
            return;
          }
          // Remove one enclosing directory only when it encloses the entire project.
          const actual = files.filter((f) => !f.directory),
            tops = new Set(actual.map((f) => f.path.split("/")[0]));
          if (
            tops.size === 1 &&
            actual.length &&
            actual.every((f) => f.path.includes("/"))
          ) {
            const prefix = [...tops][0] + "/";
            resolve(
              files
                .filter((f) => f.path.startsWith(prefix))
                .map((f) => ({ ...f, path: f.path.slice(prefix.length) })),
            );
          } else resolve(files);
        });
        zip.readEntry();
      },
    );
  });
}
export function writeZip(files: ImportedFile[]) {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files)
    entries[safePath(file.path) + (file.directory ? "/" : "")] = file.data;
  return Buffer.from(zipSync(entries, { level: 6 }));
}
export function findRoots(files: ImportedFile[]) {
  return files
    .filter(
      (f) =>
        f.path.endsWith(".tex") &&
        !f.directory &&
        /\\documentclass(?:\[|\{)/.test(f.data.toString("utf8")),
    )
    .map((f) => f.path)
    .sort(
      (a, b) =>
        a.split("/").length - b.split("/").length ||
        (a === "main.tex" ? -1 : b === "main.tex" ? 1 : a.localeCompare(b)),
    );
}
