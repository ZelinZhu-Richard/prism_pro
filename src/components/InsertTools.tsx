import { useMemo, useRef, useState } from "react";
import type { FileInfo } from "../../shared/types";
import {
  figureSource,
  tableSource,
  type TableOptions,
} from "../source-actions";
import {
  mathSymbols,
  searchSymbols,
  symbolSource,
  type MathSymbol,
} from "../math-symbols";

function SourcePreview({ source }: { source: string }) {
  return (
    <details className="insertion-preview">
      <summary>LaTeX preview</summary>
      <pre>{source}</pre>
    </details>
  );
}
function Placement({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      Placement
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="htbp">Flexible (here, top, bottom, page)</option>
        <option value="h">Near the insertion point</option>
        <option value="t">Top of page</option>
        <option value="b">Bottom of page</option>
        <option value="p">Separate float page</option>
      </select>
    </label>
  );
}
function generated(make: () => string) {
  try {
    return { source: make(), error: "" };
  } catch (e) {
    return { source: "", error: e instanceof Error ? e.message : String(e) };
  }
}
export function TableBuilder({
  locked,
  onInsert,
}: {
  locked: boolean;
  onInsert: (source: string) => void;
}) {
  const [options, setOptions] = useState<TableOptions>({
    cells: [
      ["Heading 1", "Heading 2", "Heading 3"],
      ["", "", ""],
      ["", "", ""],
    ],
    alignments: ["l", "l", "l"],
    rules: "minimal",
    header: true,
    raw: false,
    caption: "",
    label: "",
    placement: "htbp",
    captionAbove: true,
  });
  const [notice, setNotice] = useState("");
  const count = options.alignments.length;
  const result = useMemo(
    () => generated(() => tableSource(options)),
    [options],
  );
  function set<K extends keyof TableOptions>(key: K, value: TableOptions[K]) {
    setOptions((o) => ({ ...o, [key]: value }));
  }
  function resize(rows: number, cols: number) {
    setOptions((o) => ({
      ...o,
      cells: Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => o.cells[r]?.[c] ?? ""),
      ),
      alignments: Array.from(
        { length: cols },
        (_, c) => o.alignments[c] ?? "l",
      ),
    }));
  }
  function paste(value: string, row: number, col: number) {
    const pasted = value
      .replace(/\r\n?/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.split("\t"));
    const rows = Math.max(options.cells.length, row + pasted.length),
      cols = Math.max(count, col + Math.max(...pasted.map((r) => r.length)));
    if (rows > 30 || cols > 12) {
      setNotice("Paste is too large. Use up to 30 rows and 12 columns.");
      return;
    }
    setOptions((o) => ({
      ...o,
      cells: Array.from({ length: rows }, (_, r) =>
        Array.from(
          { length: cols },
          (_, c) => pasted[r - row]?.[c - col] ?? o.cells[r]?.[c] ?? "",
        ),
      ),
      alignments: Array.from(
        { length: cols },
        (_, c) => o.alignments[c] ?? "l",
      ),
    }));
    setNotice("Pasted cells into the table.");
  }
  return (
    <div className="insertion-tool">
      <p className="modal-intro">
        Build a table, or paste tab-separated cells from a spreadsheet.
        Insertion replaces the captured selection and can be undone once.
      </p>
      <fieldset disabled={locked}>
        <div className="insertion-fields">
          <label>
            Rows
            <input
              type="number"
              min={1}
              max={30}
              value={options.cells.length}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 30) resize(n, count);
              }}
            />
          </label>
          <label>
            Columns
            <input
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 12)
                  resize(options.cells.length, n);
              }}
            />
          </label>
          <label>
            Rules
            <select
              value={options.rules}
              onChange={(e) =>
                set("rules", e.target.value as TableOptions["rules"])
              }
            >
              <option value="minimal">Minimal horizontal rules</option>
              <option value="grid">Grid</option>
              <option value="none">No rules</option>
            </select>
          </label>
          <label>
            Cell content
            <select
              value={options.raw ? "latex" : "plain"}
              onChange={(e) => set("raw", e.target.value === "latex")}
            >
              <option value="plain">Plain text</option>
              <option value="latex">LaTeX source</option>
            </select>
          </label>
        </div>
        <div className="table-grid-scroll">
          <table className="table-builder-grid">
            <caption>Table cells</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                {options.alignments.map((a, c) => (
                  <th key={c} scope="col">
                    <label>
                      Column {c + 1}
                      <select
                        aria-label={`Column ${c + 1} alignment`}
                        value={a}
                        onChange={(e) =>
                          set(
                            "alignments",
                            options.alignments.map((old, i) =>
                              i === c
                                ? (e.target.value as "l" | "c" | "r")
                                : old,
                            ),
                          )
                        }
                      >
                        <option value="l">Left</option>
                        <option value="c">Center</option>
                        <option value="r">Right</option>
                      </select>
                    </label>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.cells.map((row, r) => (
                <tr key={r}>
                  <th scope="row">{r + 1}</th>
                  {row.map((value, c) => (
                    <td key={c}>
                      <input
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        value={value}
                        maxLength={10000}
                        onChange={(e) =>
                          set(
                            "cells",
                            options.cells.map((old, i) =>
                              i === r
                                ? old.map((cell, j) =>
                                    j === c ? e.target.value : cell,
                                  )
                                : old,
                            ),
                          )
                        }
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text/plain");
                          if (/[\t\n\r]/.test(text)) {
                            e.preventDefault();
                            paste(text, r, c);
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notice && (
          <p role="status" className="field-help">
            {notice}
          </p>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            checked={options.header}
            onChange={(e) => set("header", e.target.checked)}
          />
          First row is a heading
        </label>
        <div className="insertion-fields">
          <label>
            Caption
            <input
              value={options.caption}
              maxLength={2000}
              onChange={(e) => set("caption", e.target.value)}
              placeholder="Describe the table"
            />
          </label>
          <label>
            Reference label
            <input
              value={options.label}
              maxLength={120}
              onChange={(e) => set("label", e.target.value)}
              placeholder="tab:results"
            />
          </label>
          <Placement
            value={options.placement}
            onChange={(v) => set("placement", v)}
          />
          <label>
            Caption position
            <select
              value={options.captionAbove ? "above" : "below"}
              onChange={(e) => set("captionAbove", e.target.value === "above")}
            >
              <option value="above">Above table</option>
              <option value="below">Below table</option>
            </select>
          </label>
        </div>
      </fieldset>
      {result.error && (
        <p role="alert" className="danger-text">
          {result.error}
        </p>
      )}
      <SourcePreview source={result.source} />
      <div className="insertion-footer">
        <span className="field-help">
          Plain text escapes %, &amp;, $, and other LaTeX characters.
        </span>
        <button
          className="primary"
          disabled={locked || !!result.error}
          onClick={() => onInsert(result.source)}
        >
          Insert table
        </button>
      </div>
    </div>
  );
}

export function FigureBuilder({
  files,
  locked,
  onUpload,
  onInsert,
}: {
  files: FileInfo[];
  locked: boolean;
  onUpload: (file: File) => Promise<string>;
  onInsert: (source: string) => void;
}) {
  const assets = files.filter(
    (f) => !f.deleted && /\.(png|jpe?g|pdf)$/i.test(f.path),
  );
  const [path, setPath] = useState(assets[0]?.path ?? ""),
    [width, setWidth] = useState(80),
    [caption, setCaption] = useState(""),
    [label, setLabel] = useState(""),
    [placement, setPlacement] = useState("htbp"),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const result = generated(() =>
    figureSource({ path, width: width / 100, caption, label, placement }),
  );
  const selectedExists = assets.some((a) => a.path === path);
  return (
    <div className="insertion-tool">
      <p className="modal-intro">
        Choose an image already in this project or upload one. The figure is
        inserted at your captured cursor or selection.
      </p>
      <fieldset disabled={locked || uploading}>
        <label>
          Project image
          <select value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="">Choose a PNG, JPEG, or PDF…</option>
            {assets.map((a) => (
              <option key={a.path} value={a.path}>
                {a.path}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            setError("");
            void onUpload(file)
              .then(setPath)
              .catch((e) => setError(e.message))
              .finally(() => setUploading(false));
          }}
        />
        <button className="subtle" onClick={() => input.current?.click()}>
          {uploading ? "Uploading…" : "Upload image"}
        </button>
        <div className="insertion-fields">
          <label>
            Width (% of line)
            <input
              type="number"
              min={5}
              max={100}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <Placement value={placement} onChange={setPlacement} />
          <label>
            Caption
            <input
              value={caption}
              maxLength={2000}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Describe the figure"
            />
          </label>
          <label>
            Reference label
            <input
              value={label}
              maxLength={120}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="fig:example"
            />
          </label>
        </div>
      </fieldset>
      <p className="field-help">
        The root document must load <code>\usepackage&#123;graphicx&#125;</code>
        . Uploading adds the image to your project; cancelling this dialog
        leaves the uploaded file available.
      </p>
      {(error || (path && result.error)) && (
        <p role="alert" className="danger-text">
          {error || result.error}
        </p>
      )}
      <SourcePreview source={result.source} />
      <div className="insertion-footer">
        <span className="field-help">
          Paths are relative to the project root.
        </span>
        <button
          className="primary"
          disabled={locked || uploading || !!result.error || !selectedExists}
          onClick={() => onInsert(result.source)}
        >
          Insert figure
        </button>
      </div>
    </div>
  );
}

export function SymbolPicker({
  locked,
  inMath,
  nextCharacter,
  onInsert,
}: {
  locked: boolean;
  inMath: boolean;
  nextCharacter: string;
  onInsert: (source: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [symbol, setSymbol] = useState<MathSymbol>(mathSymbols[0]),
    [wrap, setWrap] = useState(!inMath);
  const results = searchSymbols(query, category),
    selected = results.find((s) => s.command === symbol.command) ?? results[0],
    source = selected ? symbolSource(selected, wrap, nextCharacter) : "";
  return (
    <div className="insertion-tool">
      <p className="modal-intro">
        Find a mathematical symbol by name, LaTeX command, or alias. Choose
        whether to add inline math delimiters.
      </p>
      <div className="insertion-fields">
        <label>
          Search symbols
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Greek, infinity, less equal…"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["All", ...new Set(mathSymbols.map((s) => s.category))].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <p role="status" className="field-help">
        {results.length} {results.length === 1 ? "symbol" : "symbols"}
      </p>
      <div className="symbol-grid" role="group" aria-label="Math symbols">
        {results.map((s) => (
          <button
            key={s.command}
            aria-label={`${s.name} (${s.command})`}
            aria-pressed={selected?.command === s.command}
            title={`${s.name} · ${s.command}`}
            onClick={() => setSymbol(s)}
          >
            <span aria-hidden="true">{s.glyph}</span>
            <small>{s.name}</small>
          </button>
        ))}
      </div>
      {!results.length && (
        <p className="field-help">
          No matching symbols. Try another name or category.
        </p>
      )}
      {selected && (
        <div className="symbol-selection">
          <strong>
            {selected.glyph} · {selected.name}
          </strong>
          <code>{source}</code>
          {selected.package && (
            <p className="field-help">
              Requires <code>\usepackage&#123;{selected.package}&#125;</code> in
              the root preamble.
            </p>
          )}
        </div>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(e) => setWrap(e.target.checked)}
        />
        Wrap in inline math <code>\(…\)</code>
      </label>
      <div className="insertion-footer">
        <span className="field-help">
          {inMath
            ? "A standard math delimiter or environment was detected."
            : "Inline delimiters are recommended in ordinary text."}{" "}
          Custom math macros may need a manual choice.
        </span>
        <button
          className="primary"
          disabled={locked || !selected}
          onClick={() => onInsert(source)}
        >
          Insert symbol
        </button>
      </div>
    </div>
  );
}
