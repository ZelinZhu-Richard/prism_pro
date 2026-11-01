import { ChangeSet, EditorSelection, Text } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { Transaction } from "@codemirror/state";
import { escapeHtml } from "./clipboard-formats";
import { parseTable, tableCaption } from "./table-source";
import {
  visualProjection,
  visualInput,
  visualCaret,
  type VisualGroup,
  type VisualProjection,
  type Span,
} from "./visual-source";

function outerGroups(p: VisualProjection, start: number, end: number) {
  const groups = p.groups
    .filter((g) => g.from >= start && g.to <= end)
    .sort((a, b) => a.from - b.from || b.to - a.to);
  const outer: VisualGroup[] = [];
  for (const g of groups)
    if (!outer.length || g.from >= outer.at(-1)!.to) outer.push(g);
  return outer;
}
export function visualCopiedSource(source: string, from: number, to: number) {
  const p = visualProjection(source);
  from = Math.min(p.body.to, Math.max(p.body.from, from));
  to = Math.max(from, Math.min(p.body.to, to));
  for (const a of p.atoms)
    if (a.kind !== "setup" && from < a.to && to > a.from) {
      from = Math.min(from, a.from);
      to = Math.max(to, a.to);
    }
  function extract(lo: number, hi: number, start: number, end: number): string {
    let at = lo,
      text = "";
    for (const g of outerGroups(p, start, end)) {
      if (g.to <= lo || g.from >= hi) continue;
      if (g.from > at) text += source.slice(at, Math.min(g.from, hi));
      if (lo <= g.from && hi >= g.to) text += source.slice(g.from, g.to);
      else {
        const a = Math.max(lo, g.innerFrom),
          b = Math.min(hi, g.innerTo);
        if (b > a) {
          let inner = extract(a, b, g.innerFrom, g.innerTo);
          if (/^environment-(itemize|enumerate)$/.test(g.style)) {
            if (/\\item\b/.test(inner)) {
              if (!/^\s*\\item\b/.test(inner)) inner = "\\item " + inner;
              text +=
                source.slice(g.from, g.innerFrom) +
                inner +
                source.slice(g.innerTo, g.to);
            } else text += inner;
          } else
            text +=
              source.slice(g.from, g.innerFrom) +
              inner +
              source.slice(g.innerTo, g.to);
        }
      }
      at = Math.max(at, g.to);
    }
    if (at < hi) text += source.slice(at, hi);
    return text;
  }
  const latex = to <= from ? "" : extract(from, to, p.body.from, p.body.to);
  return {
    latex: /(^|[^\\])(?:\\\\)*%[^\n]*$/.test(latex) ? latex + "\n" : latex,
    from,
    to,
  };
}
export function clipboardPresentation(source: string): {
  html: string;
  plain: string;
} {
  const p = visualProjection(source);
  function render(start: number, end: number): { html: string; plain: string } {
    const groups = outerGroups(p, start, end),
      events: (
        | ({ kind: "group"; group: VisualGroup } & Span)
        | ({ kind: "atom"; atom: VisualProjection["atoms"][number] } & Span)
        | ({ kind: "hidden" } & Span)
      )[] = groups.map((g) => ({
        kind: "group",
        group: g,
        from: g.from,
        to: g.to,
      }));
    const outside = (r: Span) =>
      !groups.some((g) => r.from >= g.from && r.to <= g.to);
    for (const a of p.atoms)
      if (a.from >= start && a.to <= end && outside(a))
        events.push({ kind: "atom", atom: a, from: a.from, to: a.to });
    for (const h of p.protected)
      if (
        h.from >= start &&
        h.to <= end &&
        outside(h) &&
        !events.some((e) => h.from >= e.from && h.to <= e.to)
      )
        events.push({ kind: "hidden", ...h });
    events.sort((a, b) => a.from - b.from || b.to - a.to);
    let at = start,
      html = "",
      plain = "";
    const raw = (text: string) => {
      html += escapeHtml(text)
        .replace(/\n\s*\n/g, "<br><br>")
        .replace(/\n/g, " ");
      plain += text;
    };
    for (const event of events) {
      if (event.from < at) continue;
      raw(source.slice(at, event.from));
      at = event.to;
      if (event.kind === "hidden") continue;
      if (event.kind === "group") {
        const g = event.group,
          value = render(g.innerFrom, g.innerTo),
          tag =
            (
              {
                bold: "strong",
                italic: "em",
                underline: "u",
                code: "code",
                "heading-1": "h1",
                "heading-2": "h2",
                "heading-3": "h3",
                "heading-4": "h4",
              } as Record<string, string>
            )[g.style] ?? "span";
        if (/^environment-(itemize|enumerate)$/.test(g.style)) {
          const nested = p.groups.filter(
            (n) =>
              n !== g &&
              n.style.startsWith("environment-") &&
              n.from >= g.innerFrom &&
              n.to <= g.innerTo,
          );
          const items = p.lines.filter(
            (l) =>
              l.style === "list-item" &&
              l.from >= g.innerFrom &&
              l.from < g.innerTo &&
              !nested.some((n) => l.from >= n.from && l.from < n.to),
          );
          const pieces = items.map((item, i) =>
            render(
              p.protected.find((h) => h.from === item.from)?.to ?? item.from,
              items[i + 1]?.from ?? g.innerTo,
            ),
          );
          const list = g.style.endsWith("enumerate") ? "ol" : "ul";
          html +=
            `<${list}>` +
            pieces.map((v) => "<li>" + v.html + "</li>").join("") +
            `</${list}>`;
          plain +=
            pieces
              .map(
                (v, i) =>
                  (list === "ol" ? `${i + 1}. ` : "• ") + v.plain.trim(),
              )
              .join("\n") + "\n";
        } else if (
          g.style === "environment-quote" &&
          /^\\ttfamily\\raggedright\s*\n/.test(
            source.slice(g.innerFrom, g.innerTo),
          )
        ) {
          const prefix = /^\\ttfamily\\raggedright\s*\n/.exec(
            source.slice(g.innerFrom, g.innerTo),
          )![0];
          const code = render(
            g.innerFrom + prefix.length,
            g.innerTo,
          ).plain.replace(/\n$/, "");
          html += "<pre><code>" + escapeHtml(code) + "</code></pre>";
          plain += code;
        } else {
          const element =
            g.style === "environment-quote" ||
            g.style === "environment-quotation"
              ? "blockquote"
              : tag;
          html += `<${element}>${value.html}</${element}>`;
          plain += value.plain;
        }
      } else {
        const a = event.atom,
          raw = source.slice(a.from, a.to);
        if (a.kind === "setup") continue;
        if (a.kind === "glyph") {
          const text = a.value ?? raw;
          html += text === "↵" ? "<br>" : escapeHtml(text);
          plain += text === "↵" ? "\n" : text;
          if (text === "↵" && source[at] === "\n") at++;
        } else if (a.kind === "table") {
          try {
            const table = parseTable(raw),
              rows = table.rows.map((r) =>
                r.cells.map((c) => ({
                  value: clipboardPresentation(c.text),
                  span: c.span,
                })),
              );
            const caption = tableCaption(table);
            const title = caption ? clipboardPresentation(caption.text) : null;
            html +=
              '<table border="1">' +
              (title ? "<caption>" + title.html + "</caption>" : "") +
              rows
                .map(
                  (r) =>
                    "<tr>" +
                    r
                      .map(
                        (c) => `<td colspan="${c.span}">${c.value.html}</td>`,
                      )
                      .join("") +
                    "</tr>",
                )
                .join("") +
              "</table>";
            plain +=
              (title ? title.plain + "\n" : "") +
              rows
                .map((r) => r.map((c) => c.value.plain).join("\t"))
                .join("\n");
          } catch {
            html += "<pre><code>" + escapeHtml(raw) + "</code></pre>";
            plain += raw;
          }
        } else {
          html += "<code>" + escapeHtml(raw) + "</code>";
          plain += raw;
        }
      }
    }
    raw(source.slice(at, end));
    html = html
      .replace(/(?:<br>\s*)+(<(?:h[1-6]|ul|ol|table|pre|blockquote)\b)/g, "$1")
      .replace(
        /(<\/(?:h[1-6]|ul|ol|table|pre|blockquote)>)(?:\s*<br>)+/g,
        "$1",
      );
    return { html, plain };
  }
  return render(p.body.from, p.body.to);
}
export function clipboardHasSetup(latex: string) {
  return visualProjection(latex).atoms.some(
    (a) =>
      a.kind === "setup" ||
      (a.kind === "source" &&
        /^\\(?:documentclass|usepackage|RequirePackage|documentstyle)$/.test(
          a.label,
        )),
  );
}
export function visualPasteTransaction(
  source: string,
  from: number,
  to: number,
  latex: string,
  block: boolean,
) {
  if (clipboardHasSetup(latex))
    throw new Error(
      "Visual pastes document content. Use Code view or Document setup to paste a preamble or full document.",
    );
  const p = visualProjection(source),
    deleted = visualInput(source, p, [{ from, to, text: "" }]),
    clean = ChangeSet.of(deleted.changes ?? [], source.length),
    updated = clean.apply(Text.of(source.split("\n"))).toString(),
    next = visualProjection(updated);
  let at = visualCaret(
    next,
    deleted.selection instanceof EditorSelection
      ? deleted.selection.main.head
      : clean.mapPos(from, -1),
  );
  const changes: { from: number; to?: number; insert: string }[] = [];
  let prefix = "",
    suffix = "";
  if (block) {
    const active = next.groups
        .filter(
          (g) =>
            at >= g.innerFrom &&
            at <= g.innerTo &&
            !g.style.startsWith("environment-"),
        )
        .sort((a, b) => a.from - b.from),
      outer = active[0];
    if (outer && at === outer.innerFrom) at = outer.from;
    else if (outer && at === outer.innerTo) at = outer.to;
    else if (active.length) {
      prefix = [...active]
        .reverse()
        .map((g) => updated.slice(g.innerTo, g.to))
        .join("");
      const heading = active.find(
        (g) =>
          g.style.startsWith("heading") ||
          ["title", "author", "caption"].includes(g.style),
      );
      suffix = active
        .filter((g) => g !== heading)
        .map((g) => updated.slice(g.from, g.innerFrom))
        .join("");
      if (heading)
        changes.push({ from: heading.innerTo, to: heading.to, insert: "" });
    }
    prefix += "\n\n";
    suffix = "\n\n" + suffix;
  }
  changes.push({ from: at, to: at, insert: prefix + latex + suffix });
  const inserted = ChangeSet.of(changes, updated.length),
    final = clean.compose(inserted),
    position = inserted.mapPos(at, 1) - suffix.length;
  return {
    changes: final,
    selection: EditorSelection.cursor(position),
    scrollIntoView: true,
    annotations: [
      Transaction.userEvent.of("input.format"),
      isolateHistory.of("full"),
    ],
  };
}
