// Conservative source scanning, not TeX execution. Offsets use UTF-16 like CM6.
export interface EnvironmentToken {
  from: number;
  to: number;
  name: string;
  kind: "begin" | "end";
  mate?: number;
}
export interface EnvironmentIndex {
  tokens: EnvironmentToken[];
  declared: string[];
  opaque: { from: number; to: number }[];
  limited: boolean;
}
export const ENVIRONMENT_CHARACTERS = 1024 * 1024;
const raw = new Set([
  "verbatim",
  "verbatim*",
  "Verbatim",
  "Verbatim*",
  "lstlisting",
  "minted",
  "comment",
  "filecontents",
  "filecontents*",
  "luacode",
  "luacode*",
  "pycode",
]);
const definitions = new Map([
  ...[
    "newcommand",
    "renewcommand",
    "providecommand",
    "DeclareRobustCommand",
  ].map((n) => [n, 1] as const),
  ...["newenvironment", "renewenvironment"].map((n) => [n, 2] as const),
  ...[
    "NewDocumentCommand",
    "RenewDocumentCommand",
    "ProvideDocumentCommand",
    "DeclareDocumentCommand",
  ].map((n) => [n, 2] as const),
  ...[
    "NewDocumentEnvironment",
    "RenewDocumentEnvironment",
    "ProvideDocumentEnvironment",
    "DeclareDocumentEnvironment",
  ].map((n) => [n, 3] as const),
]);
const commandAt = (s: string, at: number) =>
  /^\\([A-Za-z@]+|[^\r\n])/u.exec(s.slice(at, at + 160));
function space(s: string, at: number) {
  while (at < s.length) {
    if (/\s/.test(s[at])) {
      at++;
      continue;
    }
    if (s[at] === "%") {
      const end = s.indexOf("\n", at);
      at = end < 0 ? s.length : end + 1;
      continue;
    }
    break;
  }
  return at;
}
function groupEnd(s: string, at: number): number {
  const open = s[at],
    close = open === "{" ? "}" : "]";
  let depth = 1;
  for (let i = at + 1; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === "%") {
      const end = s.indexOf("\n", i);
      if (end < 0) return s.length + 1;
      i = end;
      continue;
    }
    if (open === "[" && s[i] === "{") {
      const end = groupEnd(s, i);
      if (end > s.length) return end;
      i = end - 1;
      continue;
    }
    if (s[i] === open) depth++;
    else if (s[i] === close && !--depth) return i + 1;
  }
  return s.length + 1;
}
function definitionEnd(s: string, at: number, name: string) {
  let end = space(s, at);
  if (s[end] === "*") end = space(s, end + 1);
  if (["def", "gdef", "edef", "xdef"].includes(name)) {
    while (end < s.length && s[end] !== "{") {
      if (s[end] === "%") {
        end = space(s, end);
        continue;
      }
      if (s[end] === "\\") {
        const cmd = commandAt(s, end);
        end += cmd?.[0].length ?? 1;
      } else end++;
    }
    return s[end] === "{" ? groupEnd(s, end) : s.length;
  }
  if (s[end] === "{") end = groupEnd(s, end);
  else {
    const cmd = commandAt(s, end);
    if (!cmd) return s.length;
    end += cmd[0].length;
  }
  for (let i = 0; i < 2; i++) {
    end = space(s, end);
    if (s[end] === "[") end = groupEnd(s, end);
  }
  for (let i = 0; i < (definitions.get(name) ?? 0); i++) {
    end = space(s, end);
    if (s[end] !== "{") return s.length;
    end = groupEnd(s, end);
  }
  return end;
}
export function scanEnvironments(source: string): EnvironmentIndex {
  const result: EnvironmentIndex = {
    tokens: [],
    declared: [],
    opaque: [],
    limited: source.length > ENVIRONMENT_CHARACTERS,
  };
  if (result.limited) return result;
  const stack: number[] = [];
  const token = (
    from: number,
    to: number,
    name: string,
    kind: "begin" | "end",
  ) => {
    const t: EnvironmentToken = { from, to, name, kind },
      at = result.tokens.length;
    result.tokens.push(t);
    if (kind === "begin") stack.push(at);
    else {
      const top = stack.at(-1);
      if (top !== undefined && result.tokens[top].name === name) {
        stack.pop();
        t.mate = top;
        result.tokens[top].mate = at;
      }
    }
    return t;
  };
  for (let i = 0; i < source.length;) {
    if (result.tokens.length >= 20000 || stack.length > 256) {
      result.limited = true;
      result.tokens = [];
      result.opaque = [];
      return result;
    }
    if (source[i] === "%") {
      const end = source.indexOf("\n", i),
        to = end < 0 ? source.length : end;
      result.opaque.push({ from: i, to });
      i = to;
      continue;
    }
    if (source[i] !== "\\") {
      i++;
      continue;
    }
    const cmd = commandAt(source, i);
    if (!cmd) {
      i++;
      continue;
    }
    const name = cmd[1];
    let end = i + cmd[0].length;
    if (name === "verb") {
      if (source[end] === "*") end++;
      const delimiter = source[end],
        line = source.indexOf("\n", end),
        stop =
          delimiter && !/\s/.test(delimiter)
            ? source.indexOf(delimiter, end + 1)
            : -1;
      end =
        stop >= 0 && (line < 0 || stop < line)
          ? stop + 1
          : line < 0
            ? source.length
            : line;
      result.opaque.push({ from: i, to: end });
      i = end;
      continue;
    }
    if (
      definitions.has(name) ||
      ["def", "gdef", "edef", "xdef"].includes(name)
    ) {
      if (
        /^(?:new|renew|NewDocument|RenewDocument|ProvideDocument|DeclareDocument)environment$/i.test(
          name,
        )
      ) {
        const at = space(source, source[end] === "*" ? end + 1 : end),
          declared = /^\{([A-Za-z][A-Za-z0-9@*:_-]{0,79})\}/.exec(
            source.slice(at, at + 84),
          );
        if (declared && !result.declared.includes(declared[1]))
          result.declared.push(declared[1]);
      }
      end = definitionEnd(source, end, name);
      result.opaque.push({ from: i, to: end });
      i = end;
      continue;
    }
    if (name === "begin" || name === "end") {
      const at = space(source, end),
        match = /^\{([A-Za-z][A-Za-z0-9@*:_-]{0,79})\}/.exec(
          source.slice(at, at + 84),
        );
      if (match) {
        end = at + match[0].length;
        const t = token(i, end, match[1], name);
        if (name === "begin" && raw.has(t.name)) {
          const escaped = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            close = new RegExp("\\\\end\\s*\\{" + escaped + "\\}", "g");
          close.lastIndex = end;
          const stop = close.exec(source);
          result.opaque.push({ from: end, to: stop?.index ?? source.length });
          if (stop) {
            token(stop.index, stop.index + stop[0].length, t.name, "end");
            i = stop.index + stop[0].length;
          } else i = source.length;
          continue;
        }
      }
    }
    i = end;
  }
  return result;
}
export function environmentAt(index: EnvironmentIndex, position: number) {
  // Prefer the token beginning here when two literal tokens touch.
  let lo = 0,
    hi = index.tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (index.tokens[mid].from <= position) lo = mid + 1;
    else hi = mid;
  }
  const token = index.tokens[lo - 1];
  return token && position <= token.to ? token : undefined;
}
export function environmentOpaque(index: EnvironmentIndex, position: number) {
  return (
    index.limited ||
    index.opaque.some((r) => position >= r.from && position < r.to)
  );
}
export function environmentBreak(
  source: string,
  position: number,
  unit: string,
  index = scanEnvironments(source),
) {
  if (index.limited || position < 0 || position > source.length) return null;
  const start = source.lastIndexOf("\n", position - 1) + 1,
    end = source.indexOf("\n", position),
    lineEnd = end < 0 ? source.length : end;
  if (source.slice(position, lineEnd).trim()) return null;
  const token = index.tokens.find(
    (t) => t.kind === "begin" && t.from >= start && t.to <= position,
  );
  if (
    !token ||
    token.mate !== undefined ||
    source.slice(start, token.from).trim()
  )
    return null;
  // Optional/mandatory environment arguments may precede Enter. Prose may not.
  let at = token.to;
  while (at < position) {
    while (at < position && /[ \t]/.test(source[at])) at++;
    if (at === position) break;
    if (!["{", "["].includes(source[at])) return null;
    const next = groupEnd(source, at);
    if (
      next > position ||
      source[next - 1] !== (source[at] === "{" ? "}" : "]")
    )
      return null;
    at = next;
  }
  const indent = source.slice(start, token.from),
    text = "\n" + indent + unit + "\n" + indent + "\\end{" + token.name + "}";
  return {
    from: position,
    to: lineEnd,
    text,
    cursor: position + 1 + indent.length + unit.length,
  };
}
export const commonEnvironments = [
  "document",
  "abstract",
  "itemize",
  "enumerate",
  "description",
  "quote",
  "quotation",
  "center",
  "flushleft",
  "flushright",
  "figure",
  "figure*",
  "table",
  "table*",
  "tabular",
  "tabular*",
  "tabularx",
  "equation",
  "equation*",
  "align",
  "align*",
  "aligned",
  "gather",
  "gather*",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "verbatim",
  "verbatim*",
  "minipage",
  "thebibliography",
  "proof",
  "theorem",
];
