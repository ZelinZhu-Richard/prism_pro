import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  AppError,
  safePath,
  validateTree,
  within,
  type ImportedFile,
} from "./files";
import {
  captureDirectory,
  type DirectoryIdentity,
} from "./project-directories";
import { fileStamp, readFileSnapshot } from "./file-snapshot";
import type {
  InstalledTexPackage,
  PersonalTexBuild,
  PersonalTexStatus,
} from "../shared/tex-packages";

export const PERSONAL_TEX_DIR = "texmf-home";
const TREES = ["tex", "bibtex", "fonts"];
const MAX_ENTRIES = 4000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 16;
const digest = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
type Entry = { path: string; stat: fs.Stats };
type Inventory = {
  root: string;
  files: Entry[];
  directories: Entry[];
  signature: string;
  packages: InstalledTexPackage[];
  warnings: string[];
};

export interface PersonalTexSnapshot {
  build: PersonalTexBuild;
  files: ImportedFile[];
}

/** Enabled only by the local launcher. Never takes a path from HTTP or project source. */
export class PersonalTexTree {
  private identity?: DirectoryIdentity;
  private cached?: { inventory: Inventory; expires: number };
  constructor(private configured?: string) {}

  private root() {
    const current = captureDirectory(this.configured);
    if (
      this.identity &&
      (current.path !== this.identity.path ||
        current.device !== this.identity.device ||
        current.inode !== this.identity.inode ||
        current.birthtime !== this.identity.birthtime)
    )
      throw new AppError(
        409,
        "The configured personal TeX folder was replaced. Check LEAF_TEXMFHOME and restart Leaf to confirm it.",
      );
    if (current.path === path.parse(current.path).root)
      throw new AppError(
        409,
        "Choose a specific personal TeX folder in LEAF_TEXMFHOME.",
      );
    this.identity ??= current;
    return current.path;
  }

  private scan(root: string): Inventory {
    const files: Entry[] = [],
      directories: Entry[] = [];
    let visited = 0,
      bytes = 0,
      skipped = false;
    const walk = (name: string, depth: number) => {
      if (depth > MAX_DEPTH)
        throw new AppError(
          413,
          "The personal TeX tree is deeper than 16 folders.",
        );
      const target = within(root, name),
        stat = fs.lstatSync(target);
      if (!stat.isDirectory() || fs.realpathSync.native(target) !== target)
        throw Error("Package directory changed");
      directories.push({ path: name, stat });
      const dir = fs.opendirSync(target);
      try {
        for (let item = dir.readSync(); item; item = dir.readSync()) {
          if (++visited > MAX_ENTRIES)
            throw new AppError(
              413,
              "The personal TeX tree exceeds 4,000 entries.",
            );
          const relative = name + "/" + item.name;
          try {
            safePath(relative);
            if (/[\u0000-\u001f\u007f\ufffd]/u.test(relative))
              throw Error("Unsafe name");
          } catch {
            skipped = true;
            continue;
          }
          if (item.isDirectory()) walk(relative, depth + 1);
          else if (item.isFile()) {
            const child = fs.lstatSync(within(root, relative));
            if (!child.isFile() || child.nlink !== 1) {
              skipped = true;
              continue;
            }
            bytes += child.size;
            if (child.size > MAX_FILE_BYTES || bytes > MAX_BYTES)
              throw new AppError(
                413,
                "The personal TeX tree exceeds 16 MiB per file or 64 MiB in total.",
              );
            files.push({ path: relative, stat: child });
          } else skipped = true;
        }
      } finally {
        dir.closeSync();
      }
    };
    for (const name of TREES) {
      const stat = fs.lstatSync(path.join(root, name), {
        throwIfNoEntry: false,
      });
      if (stat?.isDirectory()) walk(name, 1);
      else if (stat) skipped = true;
    }
    if (!directories.length)
      throw new AppError(
        409,
        "LEAF_TEXMFHOME needs a tex, bibtex or fonts directory.",
      );
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const empty = Buffer.alloc(0);
    validateTree([
      ...directories.map((directory) => ({
        path: directory.path,
        data: empty,
        directory: true,
      })),
      ...files.map((file) => ({ path: file.path, data: empty })),
    ]);
    const inventory = {
      root,
      files,
      directories,
      signature: digest(
        JSON.stringify(files.map((file) => [file.path, fileStamp(file.stat)])),
      ),
      packages: files.flatMap(({ path: file }): InstalledTexPackage[] => {
        const match = /^([A-Za-z0-9@][A-Za-z0-9@_.+-]{0,159})\.(sty|cls)$/.exec(
          path.basename(file),
        );
        return file.startsWith("tex/") && match
          ? [
              {
                name: match[1],
                format: match[2] as "sty" | "cls",
                path: file,
                origin: "personal",
              },
            ]
          : [];
      }),
      warnings: skipped
        ? [
            "Hidden, linked or unsafe entries were skipped in the personal TeX tree.",
          ]
        : [],
    };
    this.verify(inventory);
    return inventory;
  }

  private verify(inventory: Inventory) {
    if (
      this.root() !== inventory.root ||
      [...inventory.directories, ...inventory.files].some(
        ({ path: name, stat }) =>
          fileStamp(fs.lstatSync(within(inventory.root, name))) !==
          fileStamp(stat),
      )
    )
      throw Error("Personal TeX tree changed while being captured");
  }

  private problem(error: unknown) {
    return error instanceof AppError && error.statusCode !== 400
      ? error.message
      : "The configured personal TeX tree could not be read safely. Check LEAF_TEXMFHOME and try again.";
  }

  catalog(refresh = false): {
    status: PersonalTexStatus;
    packages: InstalledTexPackage[];
    warnings: string[];
  } {
    if (!this.configured)
      return { status: { kind: "disabled" }, packages: [], warnings: [] };
    try {
      const root = this.root();
      const inventory =
        !refresh && this.cached && this.cached.expires > Date.now()
          ? this.cached.inventory
          : this.scan(root);
      if (this.cached?.inventory !== inventory)
        this.cached = { inventory, expires: Date.now() + 5000 };
      return {
        status: {
          kind: "ready",
          signature: inventory.signature,
          files: inventory.files.length,
        },
        packages: inventory.packages,
        warnings: inventory.warnings,
      };
    } catch (e) {
      this.cached = undefined;
      const problem = this.problem(e);
      return {
        status: { kind: "unavailable", problem },
        packages: [],
        warnings: [problem],
      };
    }
  }

  capture(): PersonalTexSnapshot | undefined {
    if (!this.configured) return;
    try {
      const inventory = this.scan(this.root());
      const files = inventory.files.map(({ path: name, stat }) => ({
        path: name,
        data: readFileSnapshot(within(inventory.root, name), stat),
      }));
      this.verify(inventory);
      this.cached = { inventory, expires: Date.now() + 5000 };
      return {
        build: {
          signature: inventory.signature,
          fingerprint: digest(
            JSON.stringify(files.map((file) => [file.path, digest(file.data)])),
          ),
          files: files.length,
        },
        files,
      };
    } catch (e) {
      this.cached = undefined;
      throw new AppError(
        e instanceof AppError && e.statusCode === 413 ? 413 : 409,
        this.problem(e),
      );
    }
  }
}
