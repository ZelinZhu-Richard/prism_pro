import fs from "node:fs";
import path from "node:path";
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { AppError } from "./files";
import { runtimeSnapshot, type ResolvedRuntime } from "./tex-runtimes";
import type {
  InstalledTexPackage,
  TexPackageCatalog,
} from "../shared/tex-packages";

const MAX_DATABASE = 8 * 1024 * 1024;
const MAX_PACKAGES = 20000;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const inside = (root: string, file: string) => file.startsWith(root + path.sep);
const identity = (s: fs.Stats) =>
  [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");

/** Filename metadata only; never TeX source, user TEXMF trees or package scripts. */
export function parsePackageDatabase(text: string, limit = MAX_PACKAGES) {
  function* lines() {
    let start = 0;
    while (start <= text.length) {
      const end = text.indexOf("\n", start);
      yield text.slice(start, end < 0 ? text.length : end).replace(/\r$/, "");
      if (end < 0) return;
      start = end + 1;
    }
  }
  const iterator = lines();
  if (
    !iterator
      .next()
      .value?.startsWith("% ls-R -- filename database for kpathsea;")
  )
    throw Error(
      "The installed filename database is not a Kpathsea ls-R index.",
    );
  const packages: InstalledTexPackage[] = [],
    warnings = new Set<string>(),
    seen = new Set<string>();
  let directory: string | undefined,
    count = 0;
  for (const line of iterator) {
    if (++count > 500000) {
      warnings.add(
        "Installed package discovery is limited to 500000 database lines.",
      );
      break;
    }
    if (line.endsWith(":")) {
      directory = undefined;
      const value = /^\.\/(.*):$/.exec(line)?.[1];
      if (
        value !== undefined &&
        !/[\\\u0000-\u001f\u007f]/u.test(value) &&
        (value === "" ||
          value
            .split("/")
            .every((part) => part && part !== "." && part !== ".."))
      )
        directory = value;
      else warnings.add("Unsafe index directories were skipped.");
      continue;
    }
    if (!directory?.startsWith("tex/") || !/\.(?:sty|cls)$/i.test(line))
      continue;
    if (!/^[A-Za-z0-9@][A-Za-z0-9@_.+-]{0,159}\.(?:sty|cls)$/i.test(line)) {
      warnings.add("Unsupported package filenames were skipped.");
      continue;
    }
    const relative = directory + "/" + line;
    if (seen.has(relative)) continue;
    if (packages.length >= limit) {
      warnings.add(`Installed package discovery is limited to ${limit} files.`);
      break;
    }
    seen.add(relative);
    packages.push({
      name: line.slice(0, -4),
      path: relative,
      format: line.slice(-3).toLowerCase() as "sty" | "cls",
    });
  }
  packages.sort(
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
  );
  return { packages, warnings: [...warnings] };
}

/** A bounded, read-only view of the selected trusted installation's distribution. */
export class TexPackages {
  private cache = new Map<
    string,
    { signature: string; expires: number; value: TexPackageCatalog }
  >();
  private pending = new Map<string, Promise<TexPackageCatalog>>();
  private serial = new Map<string, number>();
  constructor(private options: { ttlMs?: number; now?: () => number } = {}) {}
  async get(
    runtime: ResolvedRuntime,
    refresh = false,
  ): Promise<TexPackageCatalog> {
    const key = runtime.binDir,
      now = this.options.now ?? Date.now,
      base = {
        runtime: runtimeSnapshot(runtime),
        source: "texmf-dist/ls-R" as const,
      };
    let dist: string, signature: string;
    try {
      const root = await fs.promises.realpath(runtime.texRoot);
      dist = await fs.promises.realpath(path.join(root, "texmf-dist"));
      if (!inside(root, dist))
        throw Error("Distribution escapes its installation.");
      const stat = await fs.promises.lstat(path.join(dist, "ls-R"));
      if (!stat.isFile() || stat.size > MAX_DATABASE)
        throw Error("Missing, linked or oversized filename database.");
      signature = runtime.fingerprint + ":" + dist + ":" + identity(stat);
    } catch {
      this.cache.delete(key);
      return {
        ...base,
        status: "unavailable",
        checkedAt: new Date(now()).toISOString(),
        fingerprint: "",
        packages: [],
        warnings: [
          "The selected installation's texmf-dist/ls-R database is unavailable, linked or oversized. Refresh after repairing the installation; no filesystem scan or network fallback was used.",
        ],
      };
    }
    const old = this.cache.get(key);
    if (!refresh && old?.signature === signature && old.expires > now())
      return structuredClone({ ...old.value, ...base });
    const pendingKey = key + ":" + signature;
    if (!refresh && this.pending.has(pendingKey))
      return structuredClone({
        ...(await this.pending.get(pendingKey)!),
        ...base,
      });
    const serial = (this.serial.get(key) ?? 0) + 1;
    this.serial.set(key, serial);
    const scan = this.scan(runtime, dist, signature, now).then((value) => {
      if (this.serial.get(key) === serial) {
        this.cache.delete(key);
        this.cache.set(key, {
          signature,
          value,
          expires: now() + (this.options.ttlMs ?? 30000),
        });
        if (this.cache.size > 4) {
          const oldest = this.cache.keys().next().value!;
          this.cache.delete(oldest);
          this.serial.delete(oldest);
        }
      }
      return value;
    });
    this.pending.set(pendingKey, scan);
    try {
      return structuredClone(await scan);
    } finally {
      if (this.pending.get(pendingKey) === scan)
        this.pending.delete(pendingKey);
    }
  }
  private async scan(
    runtime: ResolvedRuntime,
    dist: string,
    signature: string,
    now: () => number,
  ): Promise<TexPackageCatalog> {
    const base = {
      runtime: runtimeSnapshot(runtime),
      source: "texmf-dist/ls-R" as const,
      checkedAt: new Date(now()).toISOString(),
    };
    try {
      const database = path.join(dist, "ls-R"),
        handle = await fs.promises.open(
          database,
          fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
      let raw: Buffer;
      try {
        const before = await handle.stat();
        if (
          !before.isFile() ||
          before.size > MAX_DATABASE ||
          signature !==
            runtime.fingerprint + ":" + dist + ":" + identity(before)
        )
          throw Error("The filename database changed. Refresh to retry.");
        const buffer = Buffer.alloc(
          Math.min(before.size + 1, MAX_DATABASE + 1),
        );
        let size = 0;
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(
            buffer,
            size,
            buffer.length - size,
            size,
          );
          if (!bytesRead) break;
          size += bytesRead;
        }
        if (
          size !== before.size ||
          identity(await handle.stat()) !== identity(before)
        )
          throw Error("The filename database changed. Refresh to retry.");
        raw = buffer.subarray(0, size);
      } finally {
        await handle.close();
      }
      if (!isUtf8(raw))
        throw Error("The filename database is not valid UTF-8.");
      const parsed = parsePackageDatabase(raw.toString("utf8")),
        packages: InstalledTexPackage[] = [],
        warnings = new Set(parsed.warnings);
      for (let at = 0; at < parsed.packages.length; at += 32) {
        const candidates = parsed.packages.slice(at, at + 32);
        const valid = await Promise.all(
          candidates.map(async (entry) => {
            try {
              const file = await fs.promises.realpath(
                path.join(dist, entry.path),
              );
              if (
                !inside(dist, file) ||
                !(await fs.promises.stat(file)).isFile()
              )
                return false;
              return true;
            } catch {
              return false;
            }
          }),
        );
        candidates.forEach((entry, i) => {
          if (valid[i]) packages.push(entry);
          else
            warnings.add(
              "Missing, non-file or escaping package entries were skipped. Refresh the installation's filename database if needed.",
            );
        });
      }
      return {
        ...base,
        status: "ready",
        fingerprint: digest(signature + JSON.stringify(packages)),
        packages,
        warnings: [...warnings],
      };
    } catch (e) {
      return {
        ...base,
        status: "unavailable",
        fingerprint: "",
        packages: [],
        warnings: [
          (e as Error).message.includes("filename database")
            ? (e as Error).message
            : "The installed filename database could not be read. Refresh to retry.",
        ],
      };
    }
  }
}

export function searchTexPackages(
  catalog: TexPackageCatalog,
  query: unknown = "",
) {
  if (
    typeof query !== "string" ||
    query.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(query)
  )
    throw new AppError(
      400,
      "Search installed packages with at most 160 plain characters.",
    );
  const term = query.toLowerCase(),
    matched = catalog.packages.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.path.toLowerCase().includes(term),
    );
  matched.sort(
    (a, b) =>
      Number(b.name.toLowerCase().startsWith(term)) -
        Number(a.name.toLowerCase().startsWith(term)) ||
      a.name.localeCompare(b.name) ||
      Number(b.origin === "personal") - Number(a.origin === "personal") ||
      a.path.localeCompare(b.path),
  );
  return {
    query,
    total: matched.length,
    packages: matched.slice(0, 200),
    limited: matched.length > 200,
  };
}
