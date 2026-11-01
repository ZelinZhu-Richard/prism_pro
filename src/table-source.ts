// A bounded, lossless editor for literal tabular structures. TeX macros are
// deliberately not expanded: unfamiliar structure remains available as source.
export interface TableCell {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  column: number;
  span: number;
  text: string;
}
interface Column {
  from: number;
  to: number;
  coreFrom: number;
  coreTo: number;
  kind: string;
  width: string;
}
interface Row {
  from: number;
  to: number;
  end: number;
  cells: TableCell[];
}
interface Rule {
  from: number;
  to: number;
  name: string;
}
export interface ParsedTable {
  source: string;
  columns: Column[];
  rows: Row[];
  specFrom: number;
  specTo: number;
  bodyFrom: number;
  bodyTo: number;
  rules: Rule[];
  structural: boolean;
}
type Edit = { from: number; to: number; text: string };
function fail(reason: string): never {
  throw new Error(reason + " Use Edit source for this table.");
}
function command(s: string, i: number) {
  const match = /^\\(?:[a-zA-Z@]+\*?|[^\r\n])/u.exec(s.slice(i));
  return match ? { name: match[0].slice(1), end: i + match[0].length } : null;
}
function trivia(s: string, i: number) {
  while (i < s.length) {
    if (/\s/.test(s[i])) i++;
    else if (s[i] === "%") {
      const end = s.indexOf("\n", i);
      i = end < 0 ? s.length : end + 1;
    } else break;
  }
  return i;
}
function group(s: string, i: number, opening = "{") {
  i = trivia(s, i);
  if (s[i] !== opening) return null;
  const closing = opening === "{" ? "}" : "]",
    from = i;
  let depth = 1;
  for (i++; i < s.length; i++) {
    if (s[i] === "%") {
      const end = s.indexOf("\n", i);
      if (end < 0) return null;
      i = end;
    } else if (s[i] === "\\") {
      const c = command(s, i);
      if (c) i = c.end - 1;
    } else if (s[i] === opening) depth++;
    else if (s[i] === closing && --depth === 0)
      return { from, to: i + 1, value: s.slice(from + 1, i) };
  }
  return null;
}
function columns(s: string, from: number, to: number): Column[] {
  const result: Column[] = [];
  for (let i = from; i < to;) {
    i = trivia(s, i);
    if (i >= to) break;
    if (/\s|\|/.test(s[i])) {
      i++;
      continue;
    }
    const start = i;
    while (s[i] === ">") {
      const g = group(s, i + 1);
      if (!g) fail("Incomplete column declaration.");
      i = trivia(s, g.to);
    }
    const coreFrom = i,
      kind = s[i++];
    if (!"lcrpmb".includes(kind))
      fail("This table uses a custom or repeated column declaration.");
    let width = "";
    if ("pmb".includes(kind)) {
      const g = group(s, i);
      if (!g) fail("Incomplete column width.");
      width = g.value;
      i = g.to;
    }
    const coreTo = i;
    let next = trivia(s, i);
    while (s[next] === "<") {
      const g = group(s, next + 1);
      if (!g) fail("Incomplete column declaration.");
      i = g.to;
      next = trivia(s, i);
    }
    result.push({ from: start, to: i, coreFrom, coreTo, kind, width });
    i = next;
  }
  if (!result.length || result.length > 24)
    fail("The grid supports 1–24 columns.");
  return result;
}
function trimCell(s: string, from: number, to: number) {
  from = trivia(s, from);
  // A newline ending a comment is significant: never let an appended separator
  // become part of a trailing comment.
  let end = to;
  while (end > from && /\s/.test(s[end - 1])) end--;
  const line = s.slice(from, end).split("\n").at(-1) ?? "";
  if (/(^|[^\\])(?:\\\\)*%/.test(line) && s.slice(end, to).includes("\n"))
    end = to;
  return { from, to: end };
}
function cell(
  s: string,
  start: number,
  end: number,
  column: number,
): TableCell {
  const { from, to } = trimCell(s, start, end);
  let contentFrom = from,
    contentTo = to,
    span = 1;
  const c = command(s, from);
  if (c?.name === "multicolumn") {
    const count = group(s, c.end),
      spec = count && group(s, count.to),
      body = spec && group(s, spec.to);
    if (
      !count ||
      !spec ||
      !body ||
      trivia(s, body.to) !== end ||
      !/^\d{1,2}$/.test(count.value)
    )
      fail("The merged cell has an unfamiliar structure.");
    span = Number(count.value);
    if (span < 1 || span > 24)
      fail("The merged-cell span is outside the supported range.");
    contentFrom = body.from + 1;
    contentTo = body.to - 1;
  }
  return {
    from,
    to,
    contentFrom,
    contentTo,
    column,
    span,
    text: s.slice(contentFrom, contentTo),
  };
}
export function parseTable(source: string): ParsedTable {
  if (source.length > 100000) fail("The table is too large for the grid.");
  let begin = -1,
    spec: ReturnType<typeof group> = null,
    bodyTo = -1;
  // Skip comments and complete command arguments while locating the real table.
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "%") {
      i = trivia(source, i) - 1;
      continue;
    }
    if (source[i] === "{") {
      const g = group(source, i);
      if (!g) fail("Unbalanced source.");
      i = g.to - 1;
      continue;
    }
    if (source[i] !== "\\") continue;
    const c = command(source, i);
    if (!c) continue;
    if (c.name === "begin") {
      const env = group(source, c.end);
      if (env?.value === "tabular") {
        if (begin >= 0)
          fail("Nested or multiple tabular environments need source editing.");
        begin = i;
        const optional = group(source, env.to, "[");
        spec = group(source, optional?.to ?? env.to);
        if (!spec) fail("The table has no literal column declaration.");
        i = spec.to - 1;
        continue;
      }
      if (env && /^(?:tabular\*|tabularx|longtable|array)$/.test(env.value))
        fail("This table environment needs source editing.");
      if (env) {
        i = env.to - 1;
        continue;
      }
    }
    if (c.name === "end") {
      const env = group(source, c.end);
      if (env?.value === "tabular") {
        bodyTo = i;
        break;
      }
    }
    if (
      ["multirow", "verb", "verb*", "catcode", "def", "newcommand"].includes(
        c.name,
      )
    )
      fail("This table contains custom structure.");
    i = c.end - 1;
  }
  if (begin < 0 || !spec || bodyTo < 0)
    fail("No supported tabular environment was found.");
  const cols = columns(source, spec.from + 1, spec.to - 1),
    rows: Row[] = [],
    rules: Rule[] = [];
  let start = spec.to,
    cells: TableCell[] = [],
    depth = 0,
    rowStart = start,
    column = 0;
  function boundary(i: number) {
    while (i < bodyTo) {
      i = trivia(source, i);
      const c = command(source, i);
      if (
        !c ||
        ![
          "hline",
          "toprule",
          "midrule",
          "bottomrule",
          "cline",
          "cmidrule",
          "addlinespace",
        ].includes(c.name)
      )
        break;
      let end = c.end;
      if (source[end] === "(") {
        const stop = source.indexOf(")", end);
        if (stop < 0 || stop - end > 16) fail("Unfamiliar rule trimming.");
        end = stop + 1;
      }
      const opt = group(source, end, "[");
      if (opt) end = opt.to;
      if (["cline", "cmidrule"].includes(c.name)) {
        const g = group(source, end);
        if (!g) fail("Incomplete table rule.");
        end = g.to;
      }
      rules.push({ from: i, to: end, name: c.name });
      i = end;
    }
    return i;
  }
  rowStart = start = boundary(start);
  function finish(to: number, end: number) {
    const last = cell(source, start, to, column);
    if (!cells.length && !last.text && last.from >= last.to) return;
    cells.push(last);
    if (cells.reduce((n, c) => n + c.span, 0) !== cols.length)
      fail("Rows do not match the literal column count.");
    rows.push({ from: rowStart, to, end, cells });
    if (rows.length > 100) fail("The grid supports up to 100 rows.");
    cells = [];
    column = 0;
  }
  for (let i = start; i < bodyTo; i++) {
    if (source[i] === "%") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? bodyTo : end;
      continue;
    }
    if (source[i] === "\\") {
      const c = command(source, i);
      if (!c) continue;
      if (
        ["begin", "end", "multirow", "verb", "verb*", "catcode"].includes(
          c.name,
        )
      )
        fail(
          "Nested environments or custom cell structure need source editing.",
        );
      if (depth === 0 && ["\\", "tabularnewline"].includes(c.name)) {
        let end = c.end;
        if (source[end] === "*") end++;
        const opt = group(source, end, "[");
        if (opt) end = opt.to;
        finish(i, end);
        rowStart = start = boundary(end);
        i = start - 1;
        continue;
      }
      i = c.end - 1;
      continue;
    }
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth < 0) fail("Unbalanced table cells.");
    if (source[i] === "&" && depth === 0) {
      const next = cell(source, start, i, column);
      cells.push(next);
      column += next.span;
      start = i + 1;
    }
  }
  if (depth) fail("Unbalanced table cells.");
  finish(bodyTo, bodyTo);
  if (!rows.length) fail("The table has no editable rows.");
  return {
    source,
    columns: cols,
    rows,
    rules,
    specFrom: spec.from + 1,
    specTo: spec.to - 1,
    bodyFrom: spec.to,
    bodyTo,
    structural: !rules.some((r) => ["cline", "cmidrule"].includes(r.name)),
  };
}
export function tableResult(source: string) {
  try {
    return { table: parseTable(source), error: "" };
  } catch (e) {
    return { table: null, error: e instanceof Error ? e.message : String(e) };
  }
}
export function tableSelection(t: ParsedTable, row: number, column: number) {
  row = Math.max(0, Math.min(row, t.rows.length - 1));
  const cells = t.rows[row].cells;
  let first = cells.findIndex(
    (c) => column >= c.column && column < c.column + c.span,
  );
  if (first < 0) first = cells.length - 1;
  return { row, first, last: first };
}
function edits(source: string, changes: Edit[]) {
  let result = source,
    previous = source.length + 1;
  for (const edit of changes.sort((a, b) => b.from - a.from)) {
    if (edit.to > previous || edit.from < 0 || edit.to < edit.from)
      throw new Error("Overlapping table changes.");
    result = result.slice(0, edit.from) + edit.text + result.slice(edit.to);
    previous = edit.from;
  }
  parseTable(result); // Every structural operation must remain parseable.
  return result;
}
export function editTableCell(
  t: ParsedTable,
  row: number,
  col: number,
  text: string,
) {
  if (text.length > 10000)
    throw new Error("Use up to 10,000 characters per cell.");
  const c = t.rows[row]?.cells[col];
  if (!c) throw new Error("Choose a cell.");
  // Reparse the whole draft; separators and unbalanced groups are never accepted
  // as a cell edit. A trailing comment must end before the existing separator.
  if (/(^|[^\\])(?:\\\\)*%[^\n]*$/.test(text)) text += "\n";
  let next: string;
  try {
    next = edits(t.source, [{ from: c.contentFrom, to: c.contentTo, text }]);
  } catch {
    throw new Error(
      "Keep braces balanced and use \\& for a literal ampersand. Add rows or columns with the table controls.",
    );
  }
  const p = parseTable(next);
  if (
    p.rows.length !== t.rows.length ||
    p.columns.length !== t.columns.length ||
    p.rows.some(
      (r, i) =>
        r.cells.length !== t.rows[i].cells.length ||
        r.cells.some((c, j) => c.span !== t.rows[i].cells[j].span),
    )
  )
    throw new Error(
      "A cell cannot add rows, columns or merged cells. Use the table controls.",
    );
  return next;
}
export function tableRow(
  t: ParsedTable,
  row: number,
  action: "before" | "after" | "delete",
) {
  if (!t.rows[row]) throw new Error("Choose a row.");
  if (action === "delete") {
    if (t.rows.length === 1)
      throw new Error("Keep at least one row, or delete the table in source.");
    return edits(t.source, [
      { from: t.rows[row].from, to: t.rows[row].end, text: "" },
    ]);
  }
  if (t.rows.length === 100)
    throw new Error("The grid supports up to 100 rows.");
  const eol = t.source.includes("\r\n") ? "\r\n" : "\n",
    content = Array(t.columns.length).fill("{}").join(" & ") + " \\\\" + eol;
  if (action === "before" || row + 1 < t.rows.length) {
    const at = t.rows[action === "before" ? row : row + 1].from;
    return edits(t.source, [{ from: at, to: at, text: content }]);
  }
  const last = t.rows[row],
    at = last.end;
  return edits(t.source, [
    {
      from: at,
      to: at,
      text: (last.end === last.to ? " \\\\" : "") + eol + content,
    },
  ]);
}
export function tableColumn(
  t: ParsedTable,
  col: number,
  action: "before" | "after" | "delete",
) {
  if (!t.columns[col]) throw new Error("Choose a column.");
  if (!t.structural)
    throw new Error(
      "Partial-width rules need source editing before changing columns.",
    );
  if (t.rows.some((r) => r.cells.some((c) => c.span !== 1)))
    throw new Error("Unmerge cells before changing columns.");
  if (action === "delete" && t.columns.length === 1)
    throw new Error("Keep at least one column.");
  if (action !== "delete" && t.columns.length === 24)
    throw new Error("The grid supports up to 24 columns.");
  const c = t.columns[col],
    changes: Edit[] = [];
  if (action === "delete") {
    changes.push({ from: c.from, to: c.to, text: "" });
    for (const row of t.rows) {
      const cell = row.cells[col];
      changes.push(
        col + 1 < row.cells.length
          ? { from: cell.from, to: row.cells[col + 1].from, text: "" }
          : { from: row.cells[col - 1].to, to: cell.to, text: "" },
      );
    }
  } else {
    const at = action === "before" ? c.from : c.to;
    changes.push({ from: at, to: at, text: " l " });
    for (const row of t.rows) {
      const cell = row.cells[col],
        at = action === "before" ? cell.from : cell.to;
      changes.push({
        from: at,
        to: at,
        text: action === "before" ? "{} & " : " & {}",
      });
    }
  }
  return edits(t.source, changes);
}
export function tableColumnStyle(
  t: ParsedTable,
  col: number,
  kind: string,
  width: string,
) {
  const c = t.columns[col];
  if (!c || !/^[lcrpmb]$/.test(kind))
    throw new Error("Choose a supported column alignment.");
  const length = "{" + width + "}",
    parsed = group(length, 0);
  if (
    "pmb".includes(kind) &&
    (!width.trim() ||
      width.length > 200 ||
      /[\r\n%&]/.test(width) ||
      parsed?.to !== length.length)
  )
    throw new Error(
      "Enter a balanced LaTeX length, such as 3cm or .25\\linewidth.",
    );
  const changes: Edit[] = [];
  function style(column: Column) {
    let prefix = t.source.slice(column.from, column.coreFrom);
    if ("lcr".includes(kind)) {
      let at = column.from,
        kept = "";
      while (at < column.coreFrom && t.source[at] === ">") {
        const declaration = group(t.source, at + 1)!;
        const next = trivia(t.source, declaration.to);
        if (
          !/^\\(?:centering|raggedleft|raggedright)\s*\\arraybackslash$/.test(
            declaration.value.trim(),
          )
        )
          kept += t.source.slice(at, next);
        at = next;
      }
      prefix = kept + t.source.slice(at, column.coreFrom);
    }
    changes.push({
      from: column.from,
      to: column.to,
      text:
        prefix +
        kind +
        ("pmb".includes(kind) ? "{" + width.trim() + "}" : "") +
        t.source.slice(column.coreTo, column.to),
    });
  }
  style(c);
  // HTML paste uses one-column multicolumn declarations for individual borders.
  // Their alignment overrides the preamble, so keep both in sync atomically.
  for (const row of t.rows)
    for (const cell of row.cells) {
      if (cell.column !== col || cell.span !== 1) continue;
      const cmd = command(t.source, cell.from);
      if (cmd?.name !== "multicolumn") continue;
      const count = group(t.source, cmd.end)!,
        spec = group(t.source, count.to)!;
      const local = columns(t.source, spec.from + 1, spec.to - 1);
      if (local.length !== 1) fail("This cell has a custom column format.");
      style(local[0]);
    }
  return edits(t.source, changes);
}
export function mergeTableCells(
  t: ParsedTable,
  row: number,
  first: number,
  last: number,
) {
  const cells = t.rows[row]?.cells.slice(first, last + 1);
  if (!cells || cells.length < 2)
    throw new Error("Select adjacent cells in one row with Shift-click.");
  if (cells.some((c) => c.span !== 1))
    throw new Error("Unmerge the selected cells first.");
  const firstColumn = cells[0].column,
    lastColumn = cells.at(-1)!.column,
    kind = t.columns[firstColumn].kind;
  if (!"lcr".includes(kind))
    throw new Error(
      "Set the first column to left, center or right before merging.",
    );
  if (
    t.columns
      .slice(firstColumn, lastColumn + 1)
      .some((c) => c.from !== c.coreFrom || c.to !== c.coreTo)
  )
    throw new Error(
      "These columns have custom declarations. Merge them in source to preserve their formatting.",
    );
  const left = t.source
      .slice(
        firstColumn ? t.columns[firstColumn - 1].to : t.specFrom,
        t.columns[firstColumn].from,
      )
      .includes("|")
      ? "|"
      : "",
    right = t.source
      .slice(
        t.columns[lastColumn].to,
        t.columns[lastColumn + 1]?.from ?? t.specTo,
      )
      .includes("|")
      ? "|"
      : "";
  const content = cells.map((c) => c.text).join(" ");
  return edits(t.source, [
    {
      from: cells[0].from,
      to: cells.at(-1)!.to,
      text: `\\multicolumn{${cells.length}}{${left}${kind}${right}}{${content}}`,
    },
  ]);
}
export function unmergeTableCell(t: ParsedTable, row: number, col: number) {
  const c = t.rows[row]?.cells[col];
  if (!c || c.span === 1) throw new Error("Choose a merged cell.");
  return edits(t.source, [
    {
      from: c.from,
      to: c.to,
      text:
        c.text +
        Array(c.span - 1)
          .fill(" & {}")
          .join(""),
    },
  ]);
}
export function tableBorders(
  t: ParsedTable,
  style: "none" | "grid" | "booktabs",
) {
  if (!t.structural)
    throw new Error(
      "Partial-width rules are preserved. Edit them in source before choosing a border preset.",
    );
  if (t.rows.some((r) => r.cells.some((c) => c.span > 1)))
    throw new Error("Unmerge cells before choosing a border preset.");
  const changes: Edit[] = t.rules
    .filter((r) => r.name !== "addlinespace")
    .map((r) => ({ ...r, text: "" }));
  // Only literal separators between column declarations are changed. Bars in
  // custom declaration groups remain untouched.
  let spec = "";
  for (let i = 0; i <= t.columns.length; i++) {
    const from = i ? t.columns[i - 1].to : t.specFrom,
      to = t.columns[i]?.from ?? t.specTo,
      gap = t.source.slice(from, to);
    let clean = "";
    for (let j = 0; j < gap.length; j++) {
      if (gap[j] === "%") {
        const end = gap.indexOf("\n", j),
          stop = end < 0 ? gap.length : end + 1;
        clean += gap.slice(j, stop);
        j = stop - 1;
      } else if (gap[j] !== "|") clean += gap[j];
    }
    spec += (style === "grid" ? "|" : "") + clean;
    if (i < t.columns.length)
      spec += t.source.slice(t.columns[i].from, t.columns[i].to);
  }
  changes.push({ from: t.specFrom, to: t.specTo, text: spec });
  if (style !== "none") {
    const rule = style === "grid" ? "\\hline" : "\\toprule";
    changes.push({
      from: t.rows[0].from,
      to: t.rows[0].from,
      text: rule + "\n",
    });
    if (style === "grid")
      for (const row of t.rows.slice(1))
        changes.push({ from: row.from, to: row.from, text: "\\hline\n" });
    else if (t.rows.length > 1)
      changes.push({
        from: t.rows[1].from,
        to: t.rows[1].from,
        text: "\\midrule\n",
      });
    const last = t.rows.at(-1)!;
    changes.push({
      from: last.end,
      to: last.end,
      text:
        (last.to === last.end ? " \\\\" : "") +
        "\n" +
        (style === "grid" ? "\\hline" : "\\bottomrule") +
        "\n",
    });
  }
  return edits(t.source, changes);
}
export function tableCaption(t: ParsedTable) {
  const captions: {
    from: number;
    to: number;
    textFrom: number;
    textTo: number;
  }[] = [];
  let wrapper = false,
    nested = false;
  for (let i = 0; i < t.source.length;) {
    if (i === t.bodyFrom) {
      i = t.bodyTo;
      continue;
    }
    if (t.source[i] === "%") {
      i = trivia(t.source, i);
      continue;
    }
    if (t.source[i] === "{") {
      const g = group(t.source, i);
      if (!g) break;
      i = g.to;
      continue;
    }
    const c = command(t.source, i);
    if (!c) {
      i++;
      continue;
    }
    if (c.name === "begin") {
      const g = group(t.source, c.end);
      if (g) {
        if (/^table\*?$/.test(g.value)) wrapper = true;
        else if (g.value !== "tabular") nested = true;
        i = g.to;
        continue;
      }
    }
    if (c.name === "caption" || c.name === "caption*") {
      const opt = group(t.source, c.end, "["),
        g = group(t.source, opt?.to ?? c.end);
      if (g) {
        captions.push({
          from: i,
          to: g.to,
          textFrom: g.from + 1,
          textTo: g.to - 1,
        });
        i = g.to;
        continue;
      }
    }
    i = c.end;
  }
  return wrapper && !nested && captions.length === 1
    ? {
        ...captions[0],
        text: t.source.slice(captions[0].textFrom, captions[0].textTo),
      }
    : null;
}
export function editTableCaption(t: ParsedTable, text: string) {
  const caption = tableCaption(t);
  if (!caption) throw new Error("Edit this caption in source.");
  const value = "{" + text + "}",
    g = group(value, 0);
  if (text.length > 10000 || g?.to !== value.length)
    throw new Error("Use a balanced LaTeX caption of up to 10,000 characters.");
  return edits(t.source, [
    { from: caption.textFrom, to: caption.textTo, text },
  ]);
}
