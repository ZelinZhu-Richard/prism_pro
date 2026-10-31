import { maskTexComments } from "../shared/project-intelligence";

export interface SourceEdit {
  from: number;
  to: number;
  text: string;
  selection?: { anchor: number; head: number };
}
export type FormatAction =
  | "bold"
  | "italic"
  | "underline"
  | "code"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "itemize"
  | "enumerate"
  | "inline-math"
  | "display-math"
  | "comment";

function range(content: string, from: number, to: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > content.length
  )
    throw new Error("The source selection is no longer valid.");
}
function wholeLines(content: string, from: number, to: number) {
  range(content, from, to);
  const start = from === 0 ? 0 : content.lastIndexOf("\n", from - 1) + 1;
  const end =
    to > from && content[to - 1] === "\n" ? to - 1 : content.indexOf("\n", to);
  return { from: start, to: end < 0 ? content.length : end };
}
function wraps(text: string, left: string, right: string) {
  if (!text.startsWith(left) || !text.endsWith(right)) return false;
  // Only remove a complete matching group, never part of nested LaTeX.
  if (left.endsWith("{")) {
    let depth = 1;
    for (let i = left.length; i < text.length; i++) {
      if (text[i] === "\\") {
        i++;
        continue;
      }
      if (text[i] === "{") depth++;
      if (text[i] === "}" && --depth === 0) return i === text.length - 1;
    }
    return false;
  }
  return true;
}
function wrap(
  content: string,
  from: number,
  to: number,
  left: string,
  right: string,
  placeholder: string,
): SourceEdit {
  const selected = content.slice(from, to);
  if (wraps(selected, left, right)) {
    const text = selected.slice(left.length, -right.length);
    return {
      from,
      to,
      text,
      selection: { anchor: from, head: from + text.length },
    };
  }
  if (
    from >= left.length &&
    content.slice(from - left.length, from) === left &&
    content.slice(to, to + right.length) === right &&
    wraps(left + selected + right, left, right)
  )
    return {
      from: from - left.length,
      to: to + right.length,
      text: selected,
      selection: { anchor: from - left.length, head: to - left.length },
    };
  const body = selected || placeholder;
  return {
    from,
    to,
    text: left + body + right,
    selection: {
      anchor: from + left.length,
      head: from + left.length + body.length,
    },
  };
}
export function blockInsertion(
  content: string,
  from: number,
  to: number,
  source: string,
): SourceEdit {
  range(content, from, to);
  const before = from > 0 && content[from - 1] !== "\n" ? "\n" : "";
  const after = to < content.length && content[to] !== "\n" ? "\n" : "";
  return { from, to, text: before + source + after };
}
export function formatSource(
  content: string,
  from: number,
  to: number,
  action: FormatAction,
): SourceEdit {
  range(content, from, to);
  const wrappers: Partial<Record<FormatAction, [string, string, string]>> = {
    bold: ["\\textbf{", "}", "text"],
    italic: ["\\textit{", "}", "text"],
    underline: ["\\underline{", "}", "text"],
    code: ["\\texttt{", "}", "text"],
    "inline-math": ["\\(", "\\)", "x"],
    "display-math": ["\\[\n", "\n\\]", "x = y"],
  };
  const wrapper = wrappers[action];
  if (wrapper) return wrap(content, from, to, ...wrapper);
  const lines = wholeLines(content, from, to),
    source = content.slice(lines.from, lines.to);
  if (action === "comment") {
    const uncomment = source
      .split("\n")
      .filter((l) => l.trim())
      .every((l) => /^\s*%/.test(l));
    const text = source
      .split("\n")
      .map((l) =>
        !l.trim()
          ? l
          : uncomment
            ? l.replace(/^(\s*)% ?/, "$1")
            : l.replace(/^(\s*)/, "$1% "),
      )
      .join("\n");
    return {
      ...lines,
      text,
      selection: { anchor: lines.from, head: lines.from + text.length },
    };
  }
  if (action === "itemize" || action === "enumerate") {
    const existing =
      /^\s*\\begin\{(itemize|enumerate)\}\s*\n([\s\S]*?)\n\s*\\end\{\1\}\s*$/.exec(
        source,
      );
    if (existing?.[1] === action) {
      const text = existing[2]
        .split("\n")
        .map((l) => l.replace(/^\s*\\item\s?/, ""))
        .join("\n");
      return {
        ...lines,
        text,
        selection: { anchor: lines.from, head: lines.from + text.length },
      };
    }
    const items = source.trim()
      ? source
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.replace(/^\s*\\item\s?/, ""))
      : ["Item"];
    const text =
      `\\begin{${action}}\n` +
      items.map((l) => "  \\item " + l).join("\n") +
      `\n\\end{${action}}`;
    const anchor = lines.from + text.indexOf("\\item ") + 6;
    return {
      ...lines,
      text,
      selection: { anchor, head: anchor + items[0].length },
    };
  }
  const text = source
    .split("\n")
    .map((l) => {
      if (!l.trim() && source.trim()) return l;
      if (/^\s*%/.test(l)) return l;
      const old =
        /^(\s*)\\(?:section|subsection|subsubsection|paragraph)(?=\*?(?:\[|\{))/;
      if (old.test(l)) return l.replace(old, `$1\\${action}`);
      const indent = l.match(/^\s*/)?.[0] ?? "";
      return indent + `\\${action}{` + (l.trim() || "Heading") + "}";
    })
    .join("\n");
  const anchor = lines.from + text.indexOf("{") + 1;
  return {
    ...lines,
    text,
    selection: { anchor, head: anchor + (source.trim() ? 0 : 7) },
  };
}

export function escapeLatexText(value: string) {
  const replacements: Record<string, string> = {
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
  };
  return value
    .replace(/[\\{}%&#_$^~]/g, (c) => replacements[c])
    .replace(/\r?\n/g, " ");
}
export function validLabel(label: string) {
  return /^[A-Za-z0-9:._/-]*$/.test(label);
}
const placements = ["htbp", "h", "t", "b", "p"];
export interface TableOptions {
  cells: string[][];
  alignments: ("l" | "c" | "r")[];
  rules: "minimal" | "grid" | "none";
  header: boolean;
  raw: boolean;
  caption: string;
  label: string;
  placement: string;
  captionAbove: boolean;
}
export function tableSource(options: TableOptions) {
  const {
    cells,
    alignments,
    rules,
    header,
    raw,
    caption,
    label,
    placement,
    captionAbove,
  } = options;
  if (
    !cells.length ||
    cells.length > 30 ||
    !alignments.length ||
    alignments.length > 12 ||
    cells.some((r) => r.length !== alignments.length)
  )
    throw new Error("Use 1–30 rows with 1–12 cells in every row.");
  if (
    !alignments.every((a) => ["l", "c", "r"].includes(a)) ||
    !["minimal", "grid", "none"].includes(rules) ||
    !placements.includes(placement)
  )
    throw new Error(
      "Choose a valid column alignment, table style, and placement.",
    );
  if (!validLabel(label))
    throw new Error(
      "Use letters, numbers, :, ., _, /, or - in the reference label.",
    );
  if (label && !caption.trim())
    throw new Error("Add a caption before giving the table a reference label.");
  if (cells.flat().some((c) => c.length > 10000))
    throw new Error("A table cell is too long (maximum 10,000 characters).");
  const captionLines = caption.trim()
    ? [
        `\\caption{${escapeLatexText(caption)}}`,
        ...(label ? [`\\label{${label}}`] : []),
      ]
    : [];
  const spec =
    rules === "grid" ? "|" + alignments.join("|") + "|" : alignments.join("");
  return [
    `\\begin{table}[${placement}]`,
    "\\centering",
    ...(captionAbove ? captionLines : []),
    `\\begin{tabular}{${spec}}`,
    ...(rules !== "none" ? ["\\hline"] : []),
    ...cells.flatMap((row, i) => {
      const values = row.map((c) => {
        const text = raw ? c : escapeLatexText(c);
        return header && i === 0 ? `\\textbf{${text}}` : text;
      });
      return [
        values.join(" & ") + " " + "\\".repeat(2),
        ...(rules === "grid" ||
        (rules === "minimal" && (i === cells.length - 1 || (header && i === 0)))
          ? ["\\hline"]
          : []),
      ];
    }),
    "\\end{tabular}",
    ...(!captionAbove ? captionLines : []),
    "\\end{table}",
  ].join("\n");
}
export interface FigureOptions {
  path: string;
  width: number;
  caption: string;
  label: string;
  placement: string;
}
export function figureSource(options: FigureOptions) {
  const { path, width, caption, label, placement } = options;
  if (
    !path ||
    path.startsWith("/") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[{}%\\\r\n]/.test(path) ||
    !/\.(png|jpe?g|pdf)$/i.test(path)
  )
    throw new Error(
      "Choose a project PNG, JPEG, or PDF with no braces or percent signs in its filename.",
    );
  if (
    !Number.isFinite(width) ||
    width < 0.05 ||
    width > 1 ||
    !placements.includes(placement)
  )
    throw new Error(
      "Choose a figure width from 5% to 100% and a valid placement.",
    );
  if (!validLabel(label))
    throw new Error(
      "Use letters, numbers, :, ., _, /, or - in the reference label.",
    );
  if (label && !caption.trim())
    throw new Error(
      "Add a caption before giving the figure a reference label.",
    );
  return [
    `\\begin{figure}[${placement}]`,
    "\\centering",
    `\\includegraphics[width=${Number(width.toFixed(3))}\\linewidth]{\\detokenize{${path}}}`,
    ...(caption.trim() ? [`\\caption{${escapeLatexText(caption)}}`] : []),
    ...(label ? [`\\label{${label}}`] : []),
    "\\end{figure}",
  ].join("\n");
}
export function inMathMode(content: string, position: number) {
  const source = maskTexComments(content.slice(0, position)).replace(
    /\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?(?:\\end\{\1\}|$)/g,
    "",
  );
  let delimiter = "",
    environments = 0;
  const tokens =
    /\\(?:begin|end)\{(?:math|displaymath|equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|eqnarray\*?)\}|\\[()[\]]|\$\$?/g;
  for (const match of source.matchAll(tokens)) {
    let slashes = 0;
    for (let i = match.index! - 1; i >= 0 && source[i] === "\\"; i--) slashes++;
    if (slashes % 2) continue;
    const token = match[0];
    if (token.startsWith("\\begin")) environments++;
    else if (token.startsWith("\\end"))
      environments = Math.max(0, environments - 1);
    else if (["\\(", "\\[", "$", "$$"].includes(token))
      delimiter = delimiter === token ? "" : delimiter || token;
    else if (
      (token === "\\)" && delimiter === "\\(") ||
      (token === "\\]" && delimiter === "\\[")
    )
      delimiter = "";
  }
  return environments > 0 || !!delimiter;
}
