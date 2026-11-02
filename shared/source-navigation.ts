import { sourceDeclarations } from "./latex-declarations";
import { scanEnvironments, ENVIRONMENT_CHARACTERS } from "./latex-environments";
import {
  parseBibtex,
  maskTexComments,
  validKey,
  type SourceText,
} from "./project-intelligence";

export type SourceSymbolKind = "command" | "environment" | "label" | "citation";
export interface SourceSymbol {
  kind: SourceSymbolKind;
  name: string;
}
export interface SourceOccurrence extends SourceSymbol {
  role: "definition" | "reference";
  from: number;
  to: number;
  line: number;
  preview: string;
}
export interface SourceLocation extends SourceOccurrence {
  path: string;
  revision: number;
  hash: string;
  unsaved?: boolean;
}
export interface SourceNavigationRequest extends SourceSymbol {
  mode: "definitions" | "references";
  current?: { path: string; revision: number; content: string };
}
export interface SourceNavigationResult extends SourceSymbol {
  projectId: string;
  generation: number;
  mode: SourceNavigationRequest["mode"];
  total: number;
  locations: SourceLocation[];
  warnings: string[];
}
export const SOURCE_OCCURRENCES = 20000;
export function validSourceSymbol(symbol: SourceSymbol) {
  return (
    typeof symbol.name === "string" &&
    (symbol.kind === "command"
      ? /^[A-Za-z@]{1,128}$/.test(symbol.name)
      : symbol.kind === "environment"
        ? /^[A-Za-z0-9@*:_-]{1,80}$/.test(symbol.name)
        : ["label", "citation"].includes(symbol.kind) &&
          symbol.name !== "*" &&
          validKey(symbol.name))
  );
}
/** Literal source positions only. This does not execute TeX or infer load order. */
export function sourceOccurrences(source: SourceText) {
  const { content } = source,
    occurrences: SourceOccurrence[] = [],
    warnings: string[] = [],
    starts = [0];
  let limited = false;
  if (
    content.length >
    (/\.bib$/i.test(source.path)
      ? 2 * ENVIRONMENT_CHARACTERS
      : ENVIRONMENT_CHARACTERS)
  )
    return {
      occurrences,
      limited: true,
      warnings: ["Source exceeds the per-file navigation limit."],
    };
  for (let i = 0; i < content.length; i++)
    if (content[i] === "\n") starts.push(i + 1);
  function add(
    kind: SourceSymbolKind,
    name: string,
    role: SourceOccurrence["role"],
    from: number,
    to: number,
  ) {
    if (!validSourceSymbol({ kind, name })) return;
    if (occurrences.length >= SOURCE_OCCURRENCES) {
      limited = true;
      return;
    }
    let lo = 0,
      hi = starts.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (starts[m] <= from) lo = m + 1;
      else hi = m;
    }
    const lineStart = starts[lo - 1],
      newline = content.indexOf("\n", from),
      lineEnd = newline < 0 ? content.length : newline;
    let excerptStart = Math.max(lineStart, from - 80),
      excerptEnd = Math.min(lineEnd, excerptStart + 196);
    const lowSurrogate = (at: number) =>
      content.charCodeAt(at) >= 0xdc00 && content.charCodeAt(at) <= 0xdfff;
    if (excerptStart > lineStart && lowSurrogate(excerptStart)) excerptStart--;
    if (excerptEnd < lineEnd && lowSurrogate(excerptEnd)) excerptEnd--;
    occurrences.push({
      kind,
      name,
      role,
      from,
      to,
      line: lo,
      preview:
        (excerptStart > lineStart ? "…" : "") +
        content.slice(excerptStart, excerptEnd).trim() +
        (excerptEnd < lineEnd ? "…" : ""),
    });
  }
  if (/\.bib$/i.test(source.path)) {
    for (const entry of parseBibtex(source, warnings))
      if (entry.from !== undefined && entry.to !== undefined)
        add("citation", entry.key, "definition", entry.from, entry.to);
    return { occurrences, limited, warnings };
  }
  const declarations = sourceDeclarations(source),
    scan = scanEnvironments(content);
  if (declarations.limited || scan.limited)
    return {
      occurrences,
      limited: true,
      warnings: ["Literal source scanning reached its limit."],
    };
  for (const d of declarations.commands)
    add("command", d.name, "definition", d.from, d.to);
  for (const r of scan.opaque) {
    if (
      !r.declaration ||
      !/^(?:newenvironment|renewenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment)$/.test(
        r.declaration,
      )
    )
      continue;
    const header = maskTexComments(
        content.slice(r.from, Math.min(r.to, r.from + 2000)),
      ),
      m = /^\\[A-Za-z]+\*?\s*\{\s*([A-Za-z0-9@*:_-]{1,80})\s*\}/.exec(header);
    if (m) {
      const from =
        r.from +
        m[0].indexOf("{") +
        1 +
        /^\s*/.exec(m[0].slice(m[0].indexOf("{") + 1))![0].length;
      add("environment", m[1], "definition", from, from + m[1].length);
    }
  }
  const pieces: string[] = [];
  let at = 0;
  for (const r of scan.opaque) {
    pieces.push(
      content.slice(at, r.from),
      content.slice(r.from, r.to).replace(/[^\n]/g, " "),
    );
    at = r.to;
  }
  pieces.push(content.slice(at));
  const visible = pieces.join("");
  const escaped = (from: number) => {
    let slashes = 0;
    for (let i = from - 1; i >= 0 && visible[i] === "\\"; i--) slashes++;
    return !!(slashes % 2);
  };
  // Preserve the scanner's literal/raw boundaries rather than treating strings as TeX expansion.
  for (const token of scan.tokens) {
    const from = token.to - token.name.length - 1;
    if (from > 0)
      add(
        "environment",
        token.name,
        "reference",
        from,
        from + token.name.length,
      );
  }
  for (const m of visible.matchAll(
    /\\(label|ref|eqref|pageref|autoref|cref|Cref|vref|Vref|cpageref|Cpageref|[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\s*\[[^\[\]]*\]){0,2}\s*\{([^{}]*)\}/g,
  )) {
    if (escaped(m.index!)) continue;
    const command = m[1],
      kind = /cite/i.test(command) ? "citation" : "label",
      group = m.index! + m[0].length - m[2].length - 1;
    let offset = 0;
    for (const piece of m[2].split(",")) {
      const name = piece.trim(),
        from = group + offset + piece.length - piece.trimStart().length;
      add(
        kind,
        name,
        command === "label" ? "definition" : "reference",
        from,
        from + name.length,
      );
      offset += piece.length + 1;
    }
    if (limited) break;
  }
  for (const m of visible.matchAll(
    /\\(?:bibitem(?:\s*\[[^\[\]]*\])?|entry)\s*\{([^{}]+)\}/g,
  )) {
    if (escaped(m.index!)) continue;
    const from = m.index! + m[0].length - m[1].length - 1;
    add("citation", m[1], "definition", from, from + m[1].length);
    if (limited) break;
  }
  for (const m of visible.matchAll(/\\([A-Za-z@]{1,128})(?![A-Za-z@])/g)) {
    if (!escaped(m.index!))
      add("command", m[1], "reference", m.index!, m.index! + m[0].length);
    if (limited) break;
  }
  occurrences.sort((a, b) => a.from - b.from || a.to - b.to);
  return { occurrences, limited, warnings };
}
export function sourceSymbolAt(
  source: SourceText,
  position: number,
): SourceSymbol | undefined {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position > source.content.length
  )
    return;
  const found = sourceOccurrences(source)
    .occurrences.filter((o) => o.from <= position && position <= o.to)
    .sort(
      (a, b) =>
        Number(a.kind === "command") - Number(b.kind === "command") ||
        a.to - a.from - (b.to - b.from),
    )[0];
  return found && { kind: found.kind, name: found.name };
}
