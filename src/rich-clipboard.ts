import { parseDocument } from "htmlparser2";
import { escapeLatexText } from "./source-actions";

type Node = ReturnType<typeof parseDocument>["children"][number];
type Tag = Extract<Node, { attribs: Record<string, string> }>;
const tag = (node: Node): node is Tag => "attribs" in node;
const children = (node: Node) => ("children" in node ? node.children : []);
export interface RichPaste {
  latex: string;
  plain: string;
  block: boolean;
  warnings: string[];
  packages: string[];
  tables: number;
  images: number;
  hasText: boolean;
}
function textContent(node: Node): string {
  return node.type === "text"
    ? node.data
    : children(node).map(textContent).join("");
}
function styles(element: Tag) {
  const result: Record<string, string> = {};
  for (const declaration of (element.attribs.style ?? "")
    .slice(0, 4000)
    .split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0)
      result[declaration.slice(0, colon).trim().toLowerCase()] = declaration
        .slice(colon + 1)
        .trim()
        .toLowerCase();
  }
  return result;
}
function safeLink(value: string) {
  if (value.length > 2000 || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}
function urlSource(value: string) {
  return value
    .replace(/[{}]/g, (c) => (c === "{" ? "%7B" : "%7D"))
    .replace(/[%#&_$]/g, (c) => "\\" + c)
    .replace(/~/g, "\\string~");
}
export function htmlToLatex(html: string): RichPaste {
  if (html.length > 1024 * 1024)
    throw new Error("Paste up to 1 MB of formatted content at once.");
  const document = parseDocument(html, { decodeEntities: true }),
    warnings = new Set<string>(),
    packages = new Set<string>();
  let nodes = 0,
    tables = 0,
    images = 0,
    hasText = false,
    block = false;
  // The parser creates plain data nodes. No browser HTML, styles, URLs or scripts
  // are ever attached, evaluated or fetched.
  function inspect(items: Node[], depth: number) {
    if (depth > 64)
      throw new Error(
        "The clipboard is nested too deeply. Paste a smaller passage.",
      );
    for (const n of items) {
      if (++nodes > 20000)
        throw new Error(
          "The formatted clipboard is too complex. Paste a smaller passage.",
        );
      inspect(children(n), depth + 1);
    }
  }
  inspect(document.children, 0);
  const blocks = new Set([
    "p",
    "div",
    "section",
    "article",
    "blockquote",
    "pre",
    "ul",
    "ol",
    "dl",
    "table",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ]);
  const skip = new Set([
    "script",
    "style",
    "head",
    "iframe",
    "object",
    "embed",
    "template",
    "noscript",
    "svg",
    "canvas",
    "input",
    "textarea",
    "select",
    "button",
  ]);
  function render(items: Node[], cell = false, listDepth = 0): string {
    return items
      .map((n) => {
        if (n.type === "text") {
          if (n.data.trim()) hasText = true;
          return escapeLatexText(
            n.data.replace(/\s+/g, " ").replaceAll("\u00a0", " "),
          );
        }
        if (!tag(n)) return "";
        const name = n.name.toLowerCase(),
          css = styles(n);
        if (
          skip.has(name) ||
          n.attribs.hidden !== undefined ||
          css.display === "none" ||
          css.visibility === "hidden"
        )
          return "";
        if (name === "img") {
          images++;
          warnings.add(
            "Images in formatted text are not fetched. Paste an image itself or use the figure uploader.",
          );
          return escapeLatexText(n.attribs.alt ?? "");
        }
        if (name === "math") {
          hasText = true;
          warnings.add(
            "MathML is kept as text. Use LaTeX for editable equations.",
          );
          return escapeLatexText(textContent(n));
        }
        if (name === "table") {
          if (cell)
            throw new Error(
              "Nested tables need separate pastes or source editing.",
            );
          block = true;
          return table(n);
        }
        if (name === "br") return cell ? "\n" : "\\\\\n";
        if (name === "pre") {
          block = true;
          const code = textContent(n)
            .replaceAll("\t", "    ")
            .replace(/\r\n?/g, "\n");
          if (code.trim()) hasText = true;
          return (
            "\n\n\\begin{quote}\\ttfamily\\raggedright\n" +
            code
              .split("\n")
              .map((l) => escapeLatexText(l).replace(/ /g, "\\ "))
              .join("\\\\\n") +
            "\n\\end{quote}\n\n"
          );
        }
        if (name === "ul" || name === "ol") {
          if (listDepth >= 4)
            throw new Error(
              "Paste up to four list levels at once. Deeper lists need custom LaTeX numbering.",
            );
          block = true;
          const env = name === "ul" ? "itemize" : "enumerate";
          if (n.attribs.start && n.attribs.start !== "1")
            warnings.add(
              "Numbered lists restart at 1; review custom numbering in source.",
            );
          return (
            "\n\\begin{" +
            env +
            "}\n" +
            children(n)
              .filter((c) => tag(c) && c.name === "li")
              .map(
                (c) =>
                  "\\item " + render(children(c), false, listDepth + 1).trim(),
              )
              .join("\n") +
            "\n\\end{" +
            env +
            "}\n"
          );
        }
        if (name === "dl") {
          block = true;
          return (
            "\n\\begin{description}\n" +
            children(n)
              .map((c) =>
                tag(c) && c.name === "dt"
                  ? "\\item[{" + render(children(c)).trim() + "}] "
                  : tag(c) && c.name === "dd"
                    ? render(children(c)).trim() + "\n"
                    : "",
              )
              .join("") +
            "\\end{description}\n"
          );
        }
        let content = render(children(n), cell, listDepth);
        if (name === "a") {
          const link = safeLink(n.attribs.href ?? "");
          if (link) {
            packages.add("hyperref");
            content = "\\href{" + urlSource(link) + "}{" + content + "}";
          } else if (n.attribs.href)
            warnings.add("Unsupported or relative links are kept as text.");
        }
        if (
          ["b", "strong"].includes(name) ||
          /^(bold|bolder|[6-9]00)$/.test(css["font-weight"] ?? "")
        )
          content = "\\textbf{" + content + "}";
        if (["i", "em"].includes(name) || css["font-style"] === "italic")
          content = "\\textit{" + content + "}";
        if (
          name === "u" ||
          /\bunderline\b/.test(
            css["text-decoration"] ?? css["text-decoration-line"] ?? "",
          )
        )
          content = "\\underline{" + content + "}";
        if (
          ["s", "del", "strike"].includes(name) ||
          /line-through/.test(
            css["text-decoration"] ?? css["text-decoration-line"] ?? "",
          )
        ) {
          packages.add("ulem (normalem)");
          content = "\\sout{" + content + "}";
        }
        if (name === "code" || name === "kbd" || name === "samp")
          content = "\\texttt{" + content + "}";
        if (name === "sup") content = "\\textsuperscript{" + content + "}";
        if (name === "sub") content = "\\textsubscript{" + content + "}";
        if (/^h[1-6]$/.test(name)) {
          if (cell) return "\\textbf{" + content.trim() + "}";
          block = true;
          const heading = [
            "section",
            "subsection",
            "subsubsection",
            "paragraph",
            "subparagraph",
            "subparagraph",
          ][Number(name[1]) - 1];
          return "\n\n\\" + heading + "{" + content.trim() + "}\n\n";
        }
        if (name === "blockquote") {
          block = true;
          return "\n\\begin{quote}\n" + content.trim() + "\n\\end{quote}\n";
        }
        if (blocks.has(name))
          return cell
            ? content.trim() + "\n"
            : "\n\n" + content.trim() + "\n\n";
        return content;
      })
      .join("");
  }
  function table(element: Tag): string {
    tables++;
    const rows: Tag[] = [];
    const visit = (items: Node[]) => {
      for (const n of items)
        if (tag(n)) {
          if (n.name === "tr") rows.push(n);
          else if (["thead", "tbody", "tfoot"].includes(n.name))
            visit(children(n));
        }
    };
    visit(children(element));
    if (!rows.length || rows.length > 100)
      throw new Error("Pasted tables support 1–100 rows.");
    const grid: {
      latex: string;
      span: number;
      from: number;
      left: boolean;
      right: boolean;
      top: boolean;
      bottom: boolean;
      boxed?: boolean;
      alignment?: string;
      vertical?: number;
    }[][] = [];
    const widths: string[] = [],
      align: string[] = [],
      pending = new Map<
        number,
        { end: number; left: boolean; right: boolean; bottom: boolean }
      >();
    let count = 0;
    const tableCss = styles(element),
      allBorders =
        /[1-9]/.test(element.attribs.border ?? "") ||
        /(?:solid|dashed|dotted|double)/.test(tableCss.border ?? "");
    for (const [ri, row] of rows.entries()) {
      const cells: (typeof grid)[number] = [];
      let col = 0;
      const occupied = new Set<number>();
      for (const [c, value] of pending) if (value.end > ri) occupied.add(c);
      function fill() {
        while (occupied.has(col)) {
          const value = pending.get(col)!;
          cells.push({
            latex: "",
            span: 1,
            from: col,
            left: value.left,
            right: value.right,
            top: false,
            bottom: value.end === ri + 1 && value.bottom,
          });
          col++;
        }
      }
      for (const n of children(row)) {
        if (!tag(n) || !["td", "th"].includes(n.name)) continue;
        fill();
        const span = Number(n.attribs.colspan ?? 1),
          vertical = Number(n.attribs.rowspan ?? 1),
          css = styles(n);
        if (
          !Number.isInteger(span) ||
          span < 1 ||
          span > 24 ||
          !Number.isInteger(vertical) ||
          vertical < 1 ||
          ri + vertical > rows.length ||
          col + span > 24 ||
          Array.from({ length: span }, (_, i) => col + i).some((c) =>
            occupied.has(c),
          )
        )
          throw new Error(
            "The pasted table has unsupported or overlapping cell spans.",
          );
        let value = render(children(n), true).trim();
        const boxed = /\\begin\{(?:itemize|enumerate|description|quote)\}/.test(
            value,
          ),
          alignment = (
            { left: "l", center: "c", right: "r" } as Record<string, string>
          )[css["text-align"] ?? n.attribs.align];
        if (!boxed && value.includes("\n"))
          value = "\\shortstack[l]{" + value.replace(/\n+/g, " \\\\ ") + "}";
        if (n.name === "th")
          value = boxed
            ? "{\\bfseries " + value + "}"
            : "\\textbf{" + value + "}";
        const border = (side: string) =>
          allBorders ||
          /(?:solid|dashed|dotted|double)/.test(
            css["border-" + side] ?? css.border ?? "",
          );
        if (vertical > 1) {
          packages.add("multirow");
          for (let i = 0; i < span; i++)
            pending.set(col + i, {
              end: ri + vertical,
              left: i === 0 && border("left"),
              right: i === span - 1 && border("right"),
              bottom: border("bottom"),
            });
        }
        cells.push({
          latex: value,
          span,
          from: col,
          left: border("left"),
          right: border("right"),
          top: border("top"),
          bottom: vertical === 1 && border("bottom"),
          boxed,
          alignment,
          vertical,
        });
        if (span === 1) {
          align[col] ??=
            ({ left: "l", center: "c", right: "r" } as Record<string, string>)[
              css["text-align"] ?? n.attribs.align
            ] ?? "l";
          const width = css.width ?? n.attribs.width ?? "",
            match = /^(\d+(?:\.\d+)?)(%|cm|mm|in|pt|px)$/.exec(width);
          if (match && Number(match[1]) > 0 && Number(match[1]) <= 10000)
            widths[col] ??=
              match[2] === "%"
                ? (Math.min(100, Number(match[1])) / 100).toFixed(3) +
                  "\\linewidth"
                : Number(match[1]) * (match[2] === "px" ? 0.75 : 1) +
                  (match[2] === "px" ? "pt" : match[2]);
        }
        col += span;
      }
      fill();
      count = Math.max(count, col);
      grid.push(cells);
    }
    if (!count) throw new Error("The pasted table has no cells.");
    function columnSpec(index: number, alignment = align[index] ?? "l") {
      if (!widths[index]) return alignment;
      if (alignment === "l") return "p{" + widths[index] + "}";
      packages.add("array");
      return (
        ">{\\" +
        (alignment === "c" ? "centering" : "raggedleft") +
        "\\arraybackslash}p{" +
        widths[index] +
        "}"
      );
    }
    const preset = Array.from({ length: count }, (_, i) => columnSpec(i)).join(
      "",
    );
    const rule = (
      cells: (typeof grid)[number],
      side: "top" | "bottom",
      previous: (typeof grid)[number] = [],
    ) => {
      const marked = Array<boolean>(count).fill(false);
      for (const [items, edge] of [
        [cells, side],
        [previous, "bottom"],
      ] as const)
        for (const c of items)
          if (c[edge])
            for (let col = c.from; col < c.from + c.span; col++)
              marked[col] = true;
      const ranges: [number, number][] = [];
      for (let col = 0; col < count; col++)
        if (marked[col]) {
          const previous = ranges.at(-1);
          if (previous && previous[1] === col) previous[1]++;
          else ranges.push([col, col + 1]);
        }
      return ranges
        .map(([a, b]) =>
          a === 0 && b === count ? "\\hline\n" : `\\cline{${a + 1}-${b}}\n`,
        )
        .join("");
    };
    const body = grid
      .map((r, ri) => {
        let used = r.reduce((n, c) => n + c.span, 0);
        while (used < count) {
          r.push({
            latex: "",
            span: 1,
            from: used,
            left: allBorders,
            right: allBorders,
            top: false,
            bottom: allBorders,
          });
          used++;
        }
        return (
          rule(r, "top", grid[ri - 1]) +
          r
            .map((c, ci) => {
              const right = c.right || !!r[ci + 1]?.left,
                spec =
                  (c.from === 0 && c.left ? "|" : "") +
                  (c.span > 1
                    ? (c.alignment ?? align[c.from] ?? "l")
                    : columnSpec(c.from, c.alignment)) +
                  (right ? "|" : "");
              let content = c.boxed
                ? "\\begin{minipage}[t]{" +
                  (widths[c.from] ??
                    ((c.span / count) * 0.9).toFixed(3) + "\\linewidth") +
                  "}\n" +
                  c.latex +
                  "\n\\end{minipage}"
                : c.latex;
              if (c.vertical && c.vertical > 1)
                content = "\\multirow{" + c.vertical + "}{*}{" + content + "}";
              return c.span > 1 ||
                c.left ||
                right ||
                (!!c.alignment && c.alignment !== (align[c.from] ?? "l"))
                ? `\\multicolumn{${c.span}}{${spec}}{${content}}`
                : content || "{}";
            })
            .join(" & ") +
          " \\\\\n" +
          (ri === grid.length - 1 ? rule(r, "bottom") : "")
        );
      })
      .join("");
    const caption = children(element).find(
        (n) => tag(n) && n.name === "caption",
      ),
      captionSource = caption ? render(children(caption)).trim() : "";
    return (
      "\n\n" +
      (captionSource
        ? "\\begin{table}[htbp]\n\\centering\n\\caption{" +
          captionSource +
          "}\n"
        : "") +
      "\\begin{tabular}{" +
      preset +
      "}\n" +
      body +
      "\\end{tabular}" +
      (captionSource ? "\n\\end{table}" : "") +
      "\n\n"
    );
  }
  const latex = render(document.children)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (latex.length > 100000)
    throw new Error(
      "The generated LaTeX exceeds 100,000 characters. Paste a smaller passage.",
    );
  function plainNode(n: Node): string {
    if (n.type === "text") return n.data;
    if (!tag(n)) return "";
    const css = styles(n);
    if (
      skip.has(n.name) ||
      n.attribs.hidden !== undefined ||
      css.display === "none" ||
      css.visibility === "hidden"
    )
      return "";
    if (n.name === "img") return n.attribs.alt ?? "";
    if (n.name === "br") return "\n";
    if (n.name === "tr")
      return (
        children(n)
          .filter((c) => tag(c) && ["td", "th"].includes(c.name))
          .map((c) => children(c).map(plainNode).join("").trim())
          .join("\t") + "\n"
      );
    const value = children(n).map(plainNode).join("");
    return n.name === "li"
      ? "• " + value.trim() + "\n"
      : blocks.has(n.name)
        ? value.trim() + "\n\n"
        : value;
  }
  // Only promise the formatting we actually translate. Clipboard CSS is never
  // executed; explicit unsupported presentation needs review rather than silent loss.
  const formattingLoss =
    "Some clipboard formatting is not preserved (colors, fonts, spacing, or layout). Review the conversion before pasting.";
  function inspectFormatting(items: Node[]) {
    for (const n of items) {
      if (!tag(n)) continue;
      const css = styles(n),
        name = n.name.toLowerCase(),
        cell = ["td", "th"].includes(name);
      if (name === "head") {
        inspectFormatting(children(n));
        continue;
      }
      if (
        name === "style" ||
        (name === "link" && /\bstylesheet\b/i.test(n.attribs.rel ?? ""))
      ) {
        warnings.add(formattingLoss);
        continue;
      }
      if (
        skip.has(name) ||
        n.attribs.hidden !== undefined ||
        css.display === "none" ||
        css.visibility === "hidden"
      )
        continue;
      const unsupported = Object.entries(css).some(([key, value]) => {
        if (cell) {
          if (key === "text-align") return !/^(left|center|right)$/.test(value);
          if (key === "width")
            return !/^(\d+(?:\.\d+)?)(%|cm|mm|in|pt|px)$/.test(value);
          // Border presence is supported; CSS color, thickness and style are not exact.
          return true;
        }
        if (key === "font-weight")
          return !/^(bold|bolder|[6-9]00)$/.test(value);
        if (key === "font-style") return value !== "italic";
        if (["text-decoration", "text-decoration-line"].includes(key))
          return !/^(?:underline|line-through)(?:\s+(?:underline|line-through))*$/.test(
            value,
          );
        return true;
      });
      if (
        unsupported ||
        /^(font|center|small|big|mark)$/.test(name) ||
        ["align", "color", "bgcolor", "face", "size"].some(
          (a) =>
            n.attribs[a] !== undefined &&
            !(
              cell &&
              a === "align" &&
              /^(left|center|right)$/.test(n.attribs[a])
            ),
        ) ||
        n.attribs.class ||
        ((n.attribs.width || n.attribs.height) && !cell && name !== "img")
      )
        warnings.add(formattingLoss);
      inspectFormatting(children(n));
    }
  }
  inspectFormatting(document.children);
  const plain = document.children.map(plainNode).join("").trim();
  return {
    latex,
    plain,
    block: block || /\n\s*\n/.test(latex),
    warnings: [...warnings],
    packages: [...packages],
    tables,
    images,
    hasText,
  };
}
