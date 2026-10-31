import {
  ChangeSet,
  EditorSelection,
  Text,
  type TransactionSpec,
} from "@codemirror/state";
import { maskTexComments } from "../shared/project-intelligence";
import type { SourceEdit } from "./source-actions";

export interface Span {
  from: number;
  to: number;
}
export interface VisualAtom extends Span {
  kind: "source" | "setup" | "math" | "glyph" | "figure" | "table";
  label: string;
  value?: string;
  display?: boolean;
  asset?: string;
}
export interface VisualGroup extends Span {
  innerFrom: number;
  innerTo: number;
  style: string;
}
export interface VisualProjection {
  atoms: VisualAtom[];
  protected: Span[];
  groups: VisualGroup[];
  lines: { from: number; style: string; label?: string }[];
  body: Span;
}
export function visualProjection(source: string): VisualProjection {
  const result: VisualProjection = {
    atoms: [],
    protected: [],
    groups: [],
    lines: [],
    body: { from: 0, to: source.length },
  };
  const braces = new Map<number, number>(),
    stack: number[] = [];
  let documentBegin: { index: number; length: number } | undefined;
  const documentEnds: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      if (
        !stack.length &&
        source.startsWith("\\begin{document}", i) &&
        !documentBegin
      )
        documentBegin = { index: i, length: 16 };
      if (!stack.length && source.startsWith("\\end{document}", i))
        documentEnds.push(i);
      const verb = /^\\verb\*?([^A-Za-z\s])/.exec(source.slice(i, i + 8));
      if (verb) {
        const end = source.indexOf(verb[1], i + verb[0].length);
        if (end >= 0) i = end;
        else
          i =
            source.indexOf("\n", i) < 0
              ? source.length
              : source.indexOf("\n", i);
        continue;
      }
      const literal =
        /^\\begin\{(verbatim\*?|lstlisting|minted|comment)\}/.exec(
          source.slice(i, i + 40),
        );
      if (literal) {
        const end = source.indexOf(
          `\\end{${literal[1]}}`,
          i + literal[0].length,
        );
        if (end >= 0) i = end + literal[1].length + 5;
        else i = source.length;
        continue;
      }
      i++;
      continue;
    }
    if (source[i] === "%") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (source[i] === "{") stack.push(i);
    if (source[i] === "}" && stack.length) braces.set(stack.pop()!, i);
  }
  const atom = (
    from: number,
    to: number,
    kind: VisualAtom["kind"],
    label: string,
    other: Partial<VisualAtom> = {},
  ) => {
    if (to > from) result.atoms.push({ from, to, kind, label, ...other });
  };
  const protect = (from: number, to: number) => {
    if (to > from) result.protected.push({ from, to });
  };
  function whitespace(at: number) {
    while (/[ \t]/.test(source[at] ?? "")) at++;
    return at;
  }
  function group(at: number): Span | null {
    at = whitespace(at);
    if (source[at] === "{" && braces.has(at))
      return { from: at, to: braces.get(at)! + 1 };
    if (source[at] !== "[") return null;
    let depth = 1;
    for (let i = at + 1; i < source.length; i++) {
      if (source[i] === "\\") {
        i++;
        continue;
      }
      if (source[i] === "{" && braces.has(i)) {
        i = braces.get(i)!;
        continue;
      }
      if (source[i] === "[") depth++;
      if (source[i] === "]" && --depth === 0) return { from: at, to: i + 1 };
    }
    return null;
  }
  function argumentsEnd(at: number) {
    let end = at;
    for (let n = 0; n < 12; n++) {
      const g = group(end);
      if (!g) break;
      end = g.to;
    }
    return end;
  }
  function environmentEnd(at: number, name: string) {
    const begin = `\\begin{${name}}`,
      end = `\\end{${name}}`;
    const searchable = /^(verbatim\*?|lstlisting|minted|comment)$/.test(name)
      ? source
      : masked;
    let depth = 1,
      position = at;
    while (position < source.length) {
      const nextBegin = searchable.indexOf(begin, position),
        nextEnd = searchable.indexOf(end, position);
      if (nextEnd < 0) return null;
      if (nextBegin >= 0 && nextBegin < nextEnd) {
        depth++;
        position = nextBegin + begin.length;
      } else {
        if (--depth === 0) return { from: nextEnd, to: nextEnd + end.length };
        position = nextEnd + end.length;
      }
    }
    return null;
  }
  const masked = maskTexComments(source);
  if (documentBegin) {
    const at = documentBegin.index + documentBegin.length;
    result.body.from = source[at] === "\n" ? at + 1 : at;
    const end = documentEnds.find((e) => e >= result.body.from) ?? -1;
    if (end >= result.body.from) result.body.to = end;
    atom(0, result.body.from, "setup", "Document setup");
    protect(0, result.body.from);
    atom(result.body.to, source.length, "setup", "Document end");
    protect(result.body.to, source.length);
  }
  const styles: Record<string, string> = {
    textbf: "bold",
    textit: "italic",
    emph: "italic",
    underline: "underline",
    texttt: "code",
    textrm: "roman",
    textsf: "sans",
    textnormal: "roman",
    mbox: "roman",
    section: "heading-1",
    subsection: "heading-2",
    subsubsection: "heading-3",
    paragraph: "heading-4",
    chapter: "heading-1",
    part: "heading-1",
    title: "title",
    author: "author",
    caption: "caption",
  };
  const glyphs: Record<string, string> = {
    "%": "%",
    "&": "&",
    $: "$",
    _: "_",
    "#": "#",
    "{": "{",
    "}": "}",
    textbackslash: "\\",
    textasciitilde: "~",
    textasciicircum: "^",
    LaTeX: "LaTeX",
    TeX: "TeX",
    ldots: "…",
    dots: "…",
    quad: "\u2003",
    qquad: "\u2003\u2003",
    ",": "\u2009",
    " ": " ",
    "\\": "↵",
  };
  function parse(from: number, to: number, depth = 0, list = "") {
    if (depth > 64) {
      atom(from, to, "source", "Nested LaTeX");
      return;
    }
    let ordinal = 0;
    for (let i = from; i < to;) {
      if (source[i] === "%") {
        const end = source.indexOf("\n", i);
        const stop = end < 0 ? to : Math.min(end, to);
        atom(i, stop, "source", "Comment");
        i = stop;
        continue;
      }
      if (source[i] === "~") {
        atom(i, i + 1, "glyph", "Nonbreaking space", { value: "\u00a0" });
        i++;
        continue;
      }
      if (source[i] === "$") {
        const delimiter = source[i + 1] === "$" ? "$$" : "$";
        let end = i + delimiter.length;
        while (end < to) {
          if (source[end] === "\\") {
            end += 2;
            continue;
          }
          if (source.startsWith(delimiter, end)) break;
          end++;
        }
        if (end < to) {
          atom(i, end + delimiter.length, "math", "Equation", {
            value: source.slice(i + delimiter.length, end),
            display: delimiter === "$$",
          });
          i = end + delimiter.length;
          continue;
        }
      }
      if (source[i] !== "\\") {
        i++;
        continue;
      }
      const command = /^\\([A-Za-z@]+|[^\n])/u.exec(source.slice(i, i + 150));
      if (!command) {
        i++;
        continue;
      }
      const name = command[1];
      let end = i + command[0].length;
      if (source[end] === "*") end++;
      if (name === "(" || name === "[") {
        const close = name === "(" ? "\\)" : "\\]",
          stop = source.indexOf(close, end);
        if (stop >= 0 && stop < to) {
          atom(i, stop + 2, "math", "Equation", {
            value: source.slice(end, stop),
            display: name === "[",
          });
          i = stop + 2;
          continue;
        }
      }
      if (name === "begin") {
        const env = group(end),
          environment = env ? source.slice(env.from + 1, env.to - 1) : "",
          close = env ? environmentEnd(env.to, environment) : null;
        if (env && close && close.to <= to) {
          if (
            [
              "itemize",
              "enumerate",
              "quote",
              "quotation",
              "abstract",
              "center",
              "flushleft",
              "flushright",
            ].includes(environment)
          ) {
            protect(i, env.to);
            protect(close.from, close.to);
            result.groups.push({
              from: i,
              to: close.to,
              innerFrom: env.to,
              innerTo: close.from,
              style: "environment-" + environment,
            });
            if (environment === "abstract")
              result.lines.push({
                from: env.to,
                style: "abstract",
                label: "Abstract",
              });
            parse(
              env.to,
              close.from,
              depth + 1,
              ["itemize", "enumerate"].includes(environment)
                ? environment
                : list,
            );
            i = close.to;
            continue;
          }
          const raw = source.slice(i, close.to);
          if (
            /^(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|displaymath|math)$/.test(
              environment,
            )
          )
            atom(i, close.to, "math", "Equation", {
              value: environment.startsWith("align")
                ? `\\begin{aligned}${source.slice(env.to, close.from)}\\end{aligned}`
                : source.slice(env.to, close.from),
              display: environment !== "math",
            });
          else if (environment === "figure" || environment === "figure*") {
            const graphic =
              /\\includegraphics(?:\[[^\]]*\])?\s*\{(?:\\detokenize\{([^{}]+)\}|([^{}]+))\}/.exec(
                raw,
              );
            atom(i, close.to, "figure", "Figure", {
              asset: graphic?.[1] ?? graphic?.[2],
              value: raw,
            });
          } else
            atom(
              i,
              close.to,
              environment === "table" || environment === "tabular"
                ? "table"
                : "source",
              environment === "table" || environment === "tabular"
                ? "Table"
                : environment,
              { value: raw },
            );
          i = close.to;
          continue;
        }
      }
      if (name === "item" && list) {
        const optional = group(end);
        if (optional && source[optional.from] === "[") end = optional.to;
        const content = whitespace(end);
        protect(i, content);
        result.lines.push({
          from: i,
          style: "list-item",
          label: list === "enumerate" ? `${++ordinal}.` : "•",
        });
        i = content;
        continue;
      }
      if (Object.hasOwn(styles, name)) {
        let g = group(end);
        if (g && source[g.from] === "[") g = group(g.to);
        if (g && source[g.from] === "{" && g.to <= to) {
          const innerFrom = g.from + 1,
            innerTo = g.to - 1,
            style = styles[name];
          protect(i, innerFrom);
          protect(innerTo, g.to);
          result.groups.push({ from: i, to: g.to, innerFrom, innerTo, style });
          if (
            style.startsWith("heading") ||
            ["title", "author", "caption"].includes(style)
          )
            result.lines.push({ from: i, style });
          parse(innerFrom, innerTo, depth + 1, list);
          i = g.to;
          continue;
        }
      }
      if (Object.hasOwn(glyphs, name)) {
        const empty = group(end);
        if (empty && empty.to === empty.from + 2) end = empty.to;
        atom(i, end, "glyph", name, { value: glyphs[name] });
        i = end;
        continue;
      }
      if (name === "verb") {
        const delimiter = source[end],
          stop = delimiter ? source.indexOf(delimiter, end + 1) : -1;
        if (stop >= 0 && stop < to) {
          atom(i, stop + 1, "source", "Verbatim", {
            value: source.slice(end + 1, stop),
          });
          i = stop + 1;
          continue;
        }
      }
      end = Math.min(to, argumentsEnd(end));
      atom(i, end, "source", `\\${name}`, { value: source.slice(i, end) });
      i = end;
    }
  }
  parse(result.body.from, result.body.to);
  result.atoms.sort((a, b) => a.from - b.from);
  result.protected.sort((a, b) => a.from - b.from);
  return result;
}
export function visualSelectionBalanced(
  projection: VisualProjection,
  from: number,
  to: number,
) {
  return projection.groups.every(
    (g) =>
      from === to ||
      !(
        (from > g.from && from < g.to && to >= g.to) ||
        (to > g.from && to < g.to && from <= g.from)
      ),
  );
}
export function visualCaret(projection: VisualProjection, position: number) {
  let at = Math.max(
    projection.body.from,
    Math.min(position, projection.body.to),
  );
  const atom = projection.atoms.find((a) => a.from < at && a.to > at);
  if (atom) at = atom.to;
  const hidden = projection.protected.find((p) => p.from <= at && p.to > at);
  if (hidden) at = hidden.to;
  return Math.max(projection.body.from, Math.min(at, projection.body.to));
}
export function visualInput(
  source: string,
  projection: VisualProjection,
  edits: { from: number; to: number; text: string }[],
): TransactionSpec {
  const ranges: { from: number; to: number; insert?: string }[] = [];
  let caret = 0;
  const escape = (text: string) =>
    text.replace(
      /[\\{}%&#_$^~]/g,
      (c) =>
        ({
          "\\": "\\textbackslash{}",
          "{": "\\{",
          "}": "\\}",
          "%": "\\%",
          "&": "\\&",
          "#": "\\#",
          _: "\\_",
          $: "\\$",
          "^": "\\textasciicircum{}",
          "~": "\\textasciitilde{}",
        })[c]!,
    );
  for (const original of edits) {
    const edit = { ...original };
    for (const atom of projection.atoms)
      if (
        atom.kind !== "setup" &&
        edit.from !== edit.to &&
        edit.from < atom.to &&
        edit.to > atom.from
      ) {
        edit.from = Math.min(edit.from, atom.from);
        edit.to = Math.max(edit.to, atom.to);
      }
    const removed: Span[] = [];
    if (edit.from !== edit.to)
      for (const group of projection.groups) {
        if (edit.from > group.from || edit.to < group.to) continue;
        const last = removed.at(-1);
        if (last && group.from <= last.to)
          last.to = Math.max(last.to, group.to);
        else removed.push({ from: group.from, to: group.to });
      }
    let owner = 0;
    const guards = removed.length
      ? projection.protected.filter((p) => {
          while (owner < removed.length && removed[owner].to <= p.from) owner++;
          const group = removed[owner];
          return !group || p.from < group.from || p.to > group.to;
        })
      : projection.protected;
    let at = edit.from;
    for (const p of guards) {
      if (p.to <= at || p.from >= edit.to) continue;
      if (p.from > at) ranges.push({ from: at, to: Math.min(p.from, edit.to) });
      at = Math.max(at, p.to);
      if (at >= edit.to) break;
    }
    if (at < edit.to) ranges.push({ from: at, to: edit.to });
    let insertAt = Math.max(
      projection.body.from,
      Math.min(edit.from, projection.body.to),
    );
    const opaque = projection.atoms.find(
      (a) => a.kind !== "setup" && a.from < insertAt && a.to > insertAt,
    );
    if (opaque) insertAt = opaque.to;
    const protectedRange = guards.find(
      (p) => p.from <= insertAt && p.to > insertAt,
    );
    if (protectedRange)
      insertAt = Math.min(protectedRange.to, projection.body.to);
    if (edit.text)
      ranges.push({ from: insertAt, to: insertAt, insert: escape(edit.text) });
    caret = insertAt;
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const changes = ChangeSet.of(ranges, source.length);
  return {
    changes,
    selection: EditorSelection.cursor(changes.mapPos(caret, 1)),
    scrollIntoView: true,
  };
}

export function visualEnter(
  source: string,
  projection: VisualProjection,
  from: number,
  to: number,
): SourceEdit | null {
  const heading = projection.groups.find(
    (g) =>
      g.style.startsWith("heading") && from >= g.innerFrom && to <= g.innerTo,
  );
  const lineFrom = from === 0 ? 0 : source.lastIndexOf("\n", from - 1) + 1;
  const newline = source.indexOf("\n", from),
    lineTo = newline < 0 ? source.length : newline;
  const item = projection.lines.find(
    (l) => l.style === "list-item" && l.from >= lineFrom && l.from <= lineTo,
  );
  if (!heading && (!item || to > lineTo)) return null;
  const clean = visualInput(source, projection, [{ from, to, text: "" }]);
  const changes = ChangeSet.of(clean.changes ?? [], source.length),
    updated = changes.apply(Text.of(source.split("\n"))).toString();
  let caret = changes.mapPos(from, 1);
  const p = visualProjection(updated);
  if (
    p.atoms.some(
      (a) => a.label === "Comment" && a.from < caret && a.to === caret,
    ) &&
    updated[caret] === "\n"
  )
    caret++;
  const owner = heading
    ? p.groups.find((g) => g.from === heading.from && g.style === heading.style)
    : undefined;
  const active = p.groups
    .filter(
      (g) =>
        ["bold", "italic", "underline", "code", "roman", "sans"].includes(
          g.style,
        ) &&
        caret >= g.innerFrom &&
        caret <= g.innerTo,
    )
    .sort((a, b) => a.from - b.from);
  const close = [...active]
    .reverse()
    .map((g) => updated.slice(g.innerTo, g.to))
    .join("");
  const reopen = active.map((g) => updated.slice(g.from, g.innerFrom)).join("");
  if (heading && owner) {
    const first =
      updated.slice(owner.from, caret) +
      close +
      updated.slice(owner.innerTo, owner.to) +
      "\n\n" +
      reopen;
    return {
      from: heading.from,
      to: heading.to,
      text: first + updated.slice(caret, owner.innerTo),
      selection: {
        anchor: heading.from + first.length,
        head: heading.from + first.length,
      },
    };
  }
  const end = updated.indexOf("\n", caret),
    stop = end < 0 ? updated.length : end;
  const indent = source.slice(lineFrom, item!.from),
    first =
      updated.slice(lineFrom, caret) +
      close +
      "\n" +
      indent +
      "\\item " +
      reopen;
  return {
    from: lineFrom,
    to: lineTo,
    text: first + updated.slice(caret, stop),
    selection: {
      anchor: lineFrom + first.length,
      head: lineFrom + first.length,
    },
  };
}
