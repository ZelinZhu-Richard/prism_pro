import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { Undo2, Redo2 } from "lucide-react";
import {
  tableResult,
  parseTable,
  tableSelection,
  editTableCell,
  tableRow,
  tableColumn,
  tableColumnStyle,
  mergeTableCells,
  unmergeTableCell,
  tableBorders,
  tableCaption,
  editTableCaption,
} from "../table-source";

export function TableEditor({
  source,
  locked,
  onApply,
  onSource,
}: {
  source: string;
  locked: boolean;
  onApply: (source: string) => Promise<void>;
  onSource: () => void;
}) {
  const [history, setHistory] = useState([source]),
    [index, setIndex] = useState(0);
  const draft = history[index],
    result = useMemo(() => tableResult(draft), [draft]),
    t = result.table;
  const [selected, setSelected] = useState({ row: 0, first: 0, last: 0 });
  const row = Math.min(selected.row, (t?.rows.length ?? 1) - 1),
    first = Math.min(selected.first, (t?.rows[row]?.cells.length ?? 1) - 1),
    last = Math.min(selected.last, (t?.rows[row]?.cells.length ?? 1) - 1),
    cell = t?.rows[row]?.cells[first],
    col = cell?.column ?? 0;
  const [editing, setEditing] = useState<"cell" | "caption" | null>(null),
    [text, setText] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [applying, setApplying] = useState(false);
  const disabled = locked || applying,
    pending = editing !== null;
  const input = useRef<HTMLTextAreaElement>(null),
    grid = useRef<HTMLTableElement>(null),
    errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorElement.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  function change(make: () => string) {
    if (disabled) return;
    try {
      const next = make();
      if (next !== draft) {
        const items = [...history.slice(0, index + 1), next].slice(-51);
        setHistory(items);
        setIndex(items.length - 1);
        setSelected(tableSelection(parseTable(next), row, col));
      }
      setError("");
      setEditing(null);
      setNotice("Draft updated. The document is unchanged until Apply.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function moveHistory(at: number) {
    setSelected(tableSelection(parseTable(history[at]), row, col));
    setIndex(at);
    setError("");
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setNotice(
        "Complete draft LaTeX copied. It is safe to close or reload this draft.",
      );
    } catch {
      setError(
        "Clipboard access failed. Open Complete draft LaTeX below and copy all of it before closing or reloading.",
      );
    }
  }
  function choose(r: number, c: number, extend = false) {
    if (pending) {
      setError("Update or cancel the cell edit before changing the selection.");
      return;
    }
    setSelected(
      extend && r === row
        ? { row, first: Math.min(first, c), last: Math.max(first, c) }
        : { row: r, first: c, last: c },
    );
    setError("");
  }
  function edit(kind: "cell" | "caption") {
    if (!t || disabled) return;
    setEditing(kind);
    setText(
      kind === "cell" ? (cell?.text ?? "") : (tableCaption(t)?.text ?? ""),
    );
    setError("");
    requestAnimationFrame(() => input.current?.focus());
  }
  async function apply() {
    setApplying(true);
    setError("");
    try {
      await onApply(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }
  const caption = t && tableCaption(t),
    column = t?.columns[col];
  return (
    <div className="insertion-tool table-editor">
      <p className="modal-intro">
        Edit a draft, review its LaTeX, then apply once. Column widths take
        effect in the compiled PDF.
      </p>
      {locked && (
        <p className="notice">
          Read-only while the assistant works. You can inspect the table.
        </p>
      )}
      {result.error && (
        <div className="notice">
          <p>{result.error}</p>
          <button onClick={onSource}>Open source editor</button>
        </div>
      )}
      {t && (
        <>
          <div className="table-edit-heading">
            <span>
              {t.rows.length} rows · {t.columns.length} columns
            </span>
            <div
              className="table-draft-history"
              role="group"
              aria-label="Table draft history"
            >
              <button
                disabled={disabled || pending || index === 0}
                aria-label="Undo table draft"
                onClick={() => moveHistory(index - 1)}
              >
                <Undo2 size={14} />
              </button>
              <button
                disabled={disabled || pending || index + 1 === history.length}
                aria-label="Redo table draft"
                onClick={() => moveHistory(index + 1)}
              >
                <Redo2 size={14} />
              </button>
            </div>
          </div>
          <p className="table-grid-help" id="table-grid-help">
            Select a cell; Shift-click selects adjacent cells in that row. Arrow
            keys move, Enter edits.
          </p>
          <div
            className="table-edit-scroll"
            tabIndex={0}
            role="region"
            aria-label="Table draft grid"
          >
            <table
              ref={grid}
              className="table-edit-grid"
              aria-describedby="table-grid-help"
            >
              <caption className="sr-only">Editable table draft</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  {t.columns.map((_, c) => (
                    <th scope="col" key={c}>
                      {c + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri}>
                    <th scope="row">{ri + 1}</th>
                    {r.cells.map((c, ci) => (
                      <td
                        key={ci}
                        colSpan={c.span}
                        data-selected={
                          (ri === row && ci >= first && ci <= last) || undefined
                        }
                      >
                        <button
                          type="button"
                          aria-label={`Row ${ri + 1}, column ${c.column + 1}${c.span > 1 ? `, spans ${c.span} columns` : ""}`}
                          aria-pressed={ri === row && ci >= first && ci <= last}
                          tabIndex={ri === row && ci === first ? 0 : -1}
                          onClick={(e) => choose(ri, ci, e.shiftKey)}
                          onDoubleClick={() => {
                            choose(ri, ci);
                            if (ri === row && ci === first) edit("cell");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !pending) {
                              e.preventDefault();
                              edit("cell");
                            }
                            const dr =
                                e.key === "ArrowDown"
                                  ? 1
                                  : e.key === "ArrowUp"
                                    ? -1
                                    : 0,
                              dc =
                                e.key === "ArrowRight"
                                  ? 1
                                  : e.key === "ArrowLeft"
                                    ? -1
                                    : 0;
                            if ((!dr && !dc) || pending) return;
                            e.preventDefault();
                            const nr = Math.max(
                                0,
                                Math.min(t.rows.length - 1, ri + dr),
                              ),
                              nc = Math.max(
                                0,
                                Math.min(t.rows[nr].cells.length - 1, ci + dc),
                              );
                            choose(nr, nc, e.shiftKey && !dr);
                            requestAnimationFrame(() =>
                              grid.current
                                ?.querySelector<HTMLButtonElement>(
                                  `tbody tr:nth-child(${nr + 1}) td:nth-of-type(${nc + 1}) button`,
                                )
                                ?.focus(),
                            );
                          }}
                        >
                          {c.text || (
                            <span className="table-empty-cell">Empty</span>
                          )}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-selection" aria-live="polite">
            Row {row + 1} · Column {col + 1}
            {last > first
              ? `–${t.rows[row].cells[last].column + t.rows[row].cells[last].span}`
              : cell && cell.span > 1
                ? `–${col + cell.span}`
                : ""}
          </p>
          <fieldset disabled={disabled || pending}>
            <div
              className="table-edit-actions"
              role="group"
              aria-label="Table selection actions"
            >
              <button onClick={() => edit("cell")}>Edit cell</button>
              <button
                disabled={last === first}
                onClick={() =>
                  change(() => mergeTableCells(t, row, first, last))
                }
              >
                Merge cells
              </button>
              <button
                disabled={!cell || cell.span === 1}
                onClick={() => change(() => unmergeTableCell(t, row, first))}
              >
                Unmerge cell
              </button>
              {caption && (
                <button onClick={() => edit("caption")}>Edit caption</button>
              )}
              <label className="table-action-select">
                <span>Row actions</span>
                <select
                  aria-label="Row actions"
                  value=""
                  onChange={(e) =>
                    change(() =>
                      tableRow(
                        t,
                        row,
                        e.target.value as "before" | "after" | "delete",
                      ),
                    )
                  }
                >
                  <option value="" disabled>
                    Row actions…
                  </option>
                  <option value="before">Insert row above</option>
                  <option value="after">Insert row below</option>
                  <option value="delete">Delete row</option>
                </select>
              </label>
              <label className="table-action-select">
                <span>Column actions</span>
                <select
                  aria-label="Column actions"
                  value=""
                  onChange={(e) =>
                    change(() =>
                      tableColumn(
                        t,
                        col,
                        e.target.value as "before" | "after" | "delete",
                      ),
                    )
                  }
                >
                  <option value="" disabled>
                    Column actions…
                  </option>
                  <option value="before">Insert column before</option>
                  <option value="after">Insert column after</option>
                  <option value="delete">Delete column</option>
                </select>
              </label>
            </div>
            <div className="table-column-controls">
              <label>
                Column {col + 1} alignment
                <select
                  aria-label="Column alignment"
                  value={column?.kind ?? "l"}
                  onChange={(e) =>
                    change(() =>
                      tableColumnStyle(
                        t,
                        col,
                        e.target.value,
                        column?.width || "3cm",
                      ),
                    )
                  }
                >
                  <option value="l">Left</option>
                  <option value="c">Center</option>
                  <option value="r">Right</option>
                  <option value="p">Fixed width · top</option>
                  <option value="m">Fixed width · middle</option>
                  <option value="b">Fixed width · bottom</option>
                </select>
              </label>
              {column && "pmb".includes(column.kind) && (
                <WidthField
                  key={draft + col}
                  value={column.width}
                  onApply={(v) =>
                    change(() => tableColumnStyle(t, col, column.kind, v))
                  }
                />
              )}
              <label>
                Border preset
                <select
                  aria-label="Border preset"
                  value=""
                  onChange={(e) => {
                    const style = e.target.value as
                      "none" | "grid" | "booktabs";
                    change(() => tableBorders(t, style));
                    if (style === "booktabs")
                      setNotice(
                        "Booktabs requires \\usepackage{booktabs} in the preamble. Review the draft before Apply.",
                      );
                  }}
                >
                  <option value="" disabled>
                    Keep current borders
                  </option>
                  <option value="none">No borders</option>
                  <option value="grid">All borders</option>
                  <option value="booktabs">Booktabs</option>
                </select>
              </label>
            </div>
          </fieldset>
          {pending && (
            <div className="table-cell-editor">
              <label>
                {editing === "cell"
                  ? `Cell LaTeX · row ${row + 1}, column ${col + 1}`
                  : "Caption LaTeX"}
                <textarea
                  ref={input}
                  value={text}
                  readOnly={disabled}
                  maxLength={10000}
                  rows={5}
                  spellCheck={false}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="table-edit-actions">
                <button
                  disabled={disabled}
                  onClick={() =>
                    change(() =>
                      editing === "cell"
                        ? editTableCell(t, row, first, text)
                        : editTableCaption(t, text),
                    )
                  }
                >
                  Update draft
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setError("");
                  }}
                >
                  Cancel cell edit
                </button>
              </div>
            </div>
          )}
          <p className="table-source-hint">
            Cells contain LaTeX. Custom commands stay in source. Middle/bottom
            fixed-width columns and custom declarations may require the array
            package.
          </p>
        </>
      )}
      {error && (
        <p ref={errorElement} className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="table-edit-notice" role="status">
        {notice}
      </p>
      <details className="insertion-preview">
        <summary>
          Review LaTeX{draft !== source ? " changes" : " source"}
        </summary>
        <pre>
          {draft === source
            ? draft
            : diffLines(source, draft).map((p, i) => (
                <span
                  key={i}
                  className={
                    p.added ? "diff-added" : p.removed ? "diff-removed" : ""
                  }
                >
                  {p.added ? "+ " : p.removed ? "− " : "  "}
                  {p.value}
                </span>
              ))}
        </pre>
      </details>
      <details className="insertion-preview">
        <summary>Complete draft LaTeX</summary>
        <pre tabIndex={0} aria-label="Complete table draft">
          {draft}
        </pre>
      </details>
      <div className="insertion-footer">
        <div className="table-draft-recovery">
          <span>One document edit · one Undo</span>
          <button onClick={() => void copyDraft()}>Copy draft LaTeX</button>
        </div>
        <button
          className="primary"
          disabled={disabled || pending || !t || draft === source}
          onClick={() => void apply()}
        >
          {applying ? "Applying…" : "Apply table changes"}
        </button>
      </div>
    </div>
  );
}
function WidthField({
  value,
  onApply,
}: {
  value: string;
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="table-width-field">
      <label>
        Column width
        <input
          aria-label="Column width"
          value={draft}
          maxLength={200}
          placeholder="3cm or .25\\linewidth"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply(draft);
            }
          }}
        />
      </label>
      <button disabled={draft === value} onClick={() => onApply(draft)}>
        Set width
      </button>
    </div>
  );
}
