import type { Completion } from "@codemirror/autocomplete";
import type { TexPackageSearch } from "../shared/tex-packages";
import type { LatexCompletionResult } from "./latex-completion";

export interface CompletionOwner {
  projectId: string;
  runtimeId: string;
  settingsRevision: number;
}
/** Enrich a literal package completion; this function never edits source or selects a runtime. */
export async function installedCompletions(
  base: LatexCompletionResult,
  owner: CompletionOwner,
  ports: {
    read: (query: string, signal: AbortSignal) => Promise<TexPackageSearch>;
    current: () => boolean;
    report: (message: string) => void;
    signal?: AbortSignal;
    deadlineMs?: number;
  },
): Promise<LatexCompletionResult | null> {
  const query = base.packageQuery;
  if (query === undefined) return base;
  const abort = new AbortController(),
    cancel = () => abort.abort(ports.signal?.reason),
    current = () => !abort.signal.aborted && ports.current();
  ports.signal?.addEventListener("abort", cancel, { once: true });
  if (ports.signal?.aborted) cancel();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    abort.signal.addEventListener(
      "abort",
      () =>
        reject(abort.signal.reason ?? Error("Package suggestions canceled.")),
      { once: true },
    );
    if (abort.signal.aborted)
      reject(abort.signal.reason ?? Error("Package suggestions canceled."));
    timer = setTimeout(
      () => abort.abort(Error("Installed package suggestions timed out.")),
      ports.deadlineMs ?? 5000,
    );
  });
  void expiry.catch(() => {});
  try {
    if (!current()) return null;
    if (query.length > 160)
      throw Error("Installed package searches support at most 160 characters.");
    const result = await Promise.race([
      ports.read(query, abort.signal),
      expiry,
    ]);
    if (!current()) return null;
    if (
      result.projectId !== owner.projectId ||
      result.settingsRevision !== owner.settingsRevision ||
      result.runtime?.id !== owner.runtimeId ||
      typeof result.runtime.label !== "string" ||
      result.query !== query ||
      !["ready", "unavailable"].includes(result.status) ||
      !Array.isArray(result.warnings) ||
      !result.warnings.every((w) => typeof w === "string") ||
      !Array.isArray(result.packages) ||
      result.packages.length > 200 ||
      !Number.isSafeInteger(result.total) ||
      result.total < result.packages.length ||
      typeof result.limited !== "boolean" ||
      !result.packages.every(
        (p) =>
          typeof p.path === "string" &&
          p.path.startsWith("tex/") &&
          !p.path.split("/").some((s) => !s || s === "." || s === "..") &&
          !/[\\\u0000-\u001f\u007f]/u.test(p.path) &&
          /^[A-Za-z0-9@][A-Za-z0-9@_.+-]{0,159}$/.test(p.name) &&
          ["sty", "cls"].includes(p.format),
      )
    )
      throw Error(
        "The TeX selection or package response changed. Retry completion against the current installation.",
      );
    if (result.status !== "ready")
      throw Error(
        result.warnings.join(" ") ||
          "The selected installation's filename database is unavailable.",
      );
    const grouped = new Map<string, string[]>();
    for (const p of result.packages.filter(
      (p) =>
        p.format === "sty" &&
        p.name.toLowerCase().includes(query.toLowerCase()),
    )) {
      const paths = grouped.get(p.name) ?? [];
      if (!paths.includes(p.path)) paths.push(p.path);
      grouped.set(p.name, paths);
    }
    const existing = new Map(base.options.map((o) => [o.label, o])),
      options: Completion[] = [...base.options];
    for (const [name, paths] of grouped) {
      const previous = existing.get(name);
      // Project files remain authoritative over an identically named installed package.
      if (previous?.detail === "Project package") continue;
      const info = [
        result.runtime.label,
        "Indexed files in texmf-dist:",
        ...paths,
        "Filename metadata does not prove engine compatibility, dependencies or TeX search order.",
        ...(result.limited
          ? [
              "This search is limited to 200 results. Type more of the package name.",
            ]
          : []),
        ...result.warnings,
      ].join("\n");
      const option: Completion = {
        label: name,
        type: "module",
        detail: "Installed distribution",
        info: previous
          ? `${typeof previous.info === "string" ? previous.info + "\n" : ""}${info}`
          : info,
      };
      if (previous) options[options.indexOf(previous)] = option;
      else options.push(option);
    }
    return { ...base, options };
  } catch (e) {
    if (ports.signal?.aborted || !ports.current()) return null;
    ports.report(
      `${(e as Error).message} Project package suggestions remain available. Use Ctrl+Space (Option+backtick on macOS) to retry installed suggestions.`,
    );
    return base;
  } finally {
    clearTimeout(timer);
    ports.signal?.removeEventListener("abort", cancel);
  }
}
