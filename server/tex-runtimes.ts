import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { AppError } from "./files";
import {
  TEX_TOOLS,
  type TexTool,
  type TexRuntime,
  type TexRuntimeCatalog,
  type TexRuntimeSnapshot,
} from "../shared/tex-runtimes";

const SUPPORT_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];
const SUPPORT_TOOLS = new Set<TexTool>(["gs", "ps2pdf"]);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type ResolvedRuntime = TexRuntime & {
  commands: Partial<Record<TexTool, string>>;
};
function executable(file: string) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
function commands(bin: string, supportDirs: string[]) {
  return Object.fromEntries(
    TEX_TOOLS.map((name) => {
      const file = [bin, ...(SUPPORT_TOOLS.has(name) ? supportDirs : [])]
        .map((dir) => path.join(dir, name))
        .find(executable);
      return [name, file ? fs.realpathSync(file) : undefined];
    }),
  ) as ResolvedRuntime["commands"];
}
function fingerprint(binDir: string, cmd: ResolvedRuntime["commands"]) {
  return hash(
    JSON.stringify([
      binDir,
      ...TEX_TOOLS.map((name) => {
        const file = cmd[name];
        if (!file) return [name, null];
        const stat = fs.statSync(file);
        return [
          name,
          file,
          stat.dev,
          stat.ino,
          stat.size,
          stat.mtimeMs,
          stat.ctimeMs,
        ];
      }),
    ]),
  );
}
/** Only installed, backend-configured tool directories; never project-supplied paths. */
export class TexRuntimes {
  private cache?: ResolvedRuntime[];
  private problems: string[] = [];
  constructor(
    private options: {
      systemBin?: string;
      texLiveRoot?: string;
      extraBins?: string[];
      supportDirs?: string[];
    } = {},
  ) {}
  refresh(): TexRuntimeCatalog {
    this.cache = undefined;
    return this.catalog();
  }
  private discover() {
    if (this.cache) return this.cache;
    this.problems = [];
    const candidates: { id?: string; bin: string }[] = [
      { id: "system", bin: this.options.systemBin ?? "/Library/TeX/texbin" },
    ];
    const root = this.options.texLiveRoot ?? "/usr/local/texlive";
    try {
      if (fs.existsSync(root))
        for (const year of fs.readdirSync(root).sort().slice(0, 64)) {
          const bin = path.join(root, year, "bin");
          try {
            if (!fs.existsSync(bin) || !fs.statSync(bin).isDirectory())
              continue;
            for (const arch of fs.readdirSync(bin).sort())
              if (arch.endsWith("-darwin"))
                candidates.push({ bin: path.join(bin, arch) });
          } catch {
            this.problems.push(
              `Could not inspect installed TeX directory ${bin}.`,
            );
          }
        }
    } catch {
      this.problems.push(
        "The installed TeX Live directory could not be inspected.",
      );
    }
    const configured =
      this.options.extraBins ??
      (process.env.PRISM_TEX_BIN_DIRS ?? "")
        .split(path.delimiter)
        .filter(Boolean);
    if (configured.length > 32)
      this.problems.push(
        "Only the first 32 configured TeX directories are inspected.",
      );
    candidates.push(...configured.slice(0, 32).map((bin) => ({ bin })));
    const result: ResolvedRuntime[] = [],
      seen = new Set<string>();
    for (const item of candidates) {
      let bin = item.bin;
      try {
        if (!path.isAbsolute(bin) || /[\u0000-\u001f\u007f]/u.test(bin))
          throw new Error(
            "Use an absolute TeX binary directory without control characters.",
          );
        bin = fs.realpathSync(bin);
        if (!fs.statSync(bin).isDirectory())
          throw new Error("Not a directory.");
        if (/[\u0000-\u001f\u007f]/u.test(bin))
          throw new Error("Runtime paths cannot contain control characters.");
        const texRoot = path.dirname(path.dirname(bin));
        if (
          path.basename(path.dirname(bin)) !== "bin" ||
          !fs.existsSync(path.join(texRoot, "texmf-dist"))
        )
          throw new Error(
            "Choose a TeX Live installation's bin/<architecture> directory.",
          );
        if (!item.id && seen.has(bin)) continue;
        const cmd = commands(bin, this.options.supportDirs ?? SUPPORT_DIRS);
        const probe = path.join(bin, "pdftex");
        if (!executable(probe)) throw new Error("TeX Live pdftex is missing.");
        const version = spawnSync(probe, ["--version"], {
          encoding: "utf8",
          timeout: 2000,
          maxBuffer: 16384,
          env: {
            PATH: bin + ":/usr/bin:/bin",
            LANG: "en_US.UTF-8",
            LC_ALL: "en_US.UTF-8",
          },
        });
        const match = version.stdout?.match(/TeX Live[^)\r\n]*/);
        if (version.status !== 0 || !match)
          throw new Error("Not a working TeX Live runtime.");
        const versionLabel = match[0].slice(0, 200);
        const label = `${versionLabel} · ${path.basename(texRoot)}`;
        const runtime: ResolvedRuntime = {
          id: item.id ?? "tex-" + hash(bin).slice(0, 24),
          label: item.id ? "System · " + label : label,
          version: versionLabel,
          binDir: bin,
          texRoot,
          fingerprint: fingerprint(bin, cmd),
          tools: Object.fromEntries(
            TEX_TOOLS.map((name) => [name, !!cmd[name]]),
          ) as TexRuntime["tools"],
          commands: cmd,
          available: true,
        };
        result.push(runtime);
        // Keep a pinned identity alongside System even when they currently resolve to the same directory.
        if (item.id) candidates.push({ bin });
        else seen.add(bin);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Runtime could not be inspected.";
        if (item.id)
          result.push({
            id: "system",
            label: "System TeX · unavailable",
            version: "Unknown",
            binDir: item.bin,
            texRoot: "",
            fingerprint: "",
            tools: Object.fromEntries(
              TEX_TOOLS.map((n) => [n, false]),
            ) as TexRuntime["tools"],
            commands: {},
            available: false,
            problem:
              "Install TeX Live or MacTeX, then refresh runtimes. " + message,
          });
        else if (configured.includes(item.bin))
          this.problems.push(`${item.bin}: ${message}`);
      }
      if (result.length >= 65) {
        this.problems.push("Runtime discovery is limited to 65 choices.");
        break;
      }
    }
    return (this.cache = result);
  }
  catalog(): TexRuntimeCatalog {
    const runtimes = this.discover().map(
      ({ commands: _, ...runtime }) => runtime,
    );
    return { runtimes, problems: [...this.problems] };
  }
  resolve(id = "system"): ResolvedRuntime {
    const runtime = this.discover().find((r) => r.id === id);
    if (!runtime?.available)
      throw new AppError(
        503,
        "The selected TeX runtime is unavailable. Refresh runtimes and explicitly choose an installed version; no fallback was used.",
      );
    try {
      if (
        fingerprint(
          runtime.binDir,
          commands(runtime.binDir, this.options.supportDirs ?? SUPPORT_DIRS),
        ) !== runtime.fingerprint
      )
        throw new Error();
    } catch {
      throw new AppError(
        409,
        "TeX tools changed since discovery. Refresh runtimes and review the selected version before compiling.",
      );
    }
    return runtime;
  }
  forSnapshot(snapshot: TexRuntimeSnapshot) {
    const matching = this.discover().find(
      (r) =>
        r.binDir === snapshot.binDir && r.fingerprint === snapshot.fingerprint,
    );
    if (!matching)
      throw new AppError(
        503,
        "This build's TeX runtime is no longer available. Restore that installation or recompile with an explicitly selected runtime.",
      );
    return this.resolve(matching.id);
  }
}
export const defaultRuntimes = new TexRuntimes();
export function runtimeSnapshot(r: TexRuntime): TexRuntimeSnapshot {
  const { id, label, version, binDir, texRoot, fingerprint } = r;
  return { id, label, version, binDir, texRoot, fingerprint };
}
export function runtimePath(r: ResolvedRuntime) {
  return [
    r.binDir,
    ...new Set(
      Object.values(r.commands)
        .filter(Boolean)
        .map((c) => path.dirname(c!)),
    ),
    "/usr/bin",
    "/bin",
  ].join(path.delimiter);
}
export function runtimeReadRoots(r: ResolvedRuntime) {
  const homebrew = Object.values(r.commands).some((c) =>
    c?.startsWith("/opt/homebrew/"),
  )
    ? [
        "/opt/homebrew/Cellar",
        "/opt/homebrew/opt",
        "/opt/homebrew/share",
        "/opt/homebrew/etc/ghostscript",
        "/opt/homebrew/etc/fonts",
      ]
    : [];
  return [
    ...new Set([
      r.texRoot,
      ...homebrew,
      ...Object.entries(r.commands)
        .filter(([n, c]) => !!c && SUPPORT_TOOLS.has(n as TexTool))
        .map(([, c]) => {
          // Homebrew's resolved Cellar/<formula>/<version>/bin executable needs its matching lib/share tree.
          return path.dirname(path.dirname(c!));
        }),
    ]),
  ];
}
