import {
  EditorSelection,
  EditorState,
  Prec,
  StateField,
  Transaction,
  findClusterBreak,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import katex from "katex";
import { tableResult } from "./table-source";
import { internalEdit, sourceEditTransaction } from "./editor-transactions";
import {
  visualInput,
  visualEnter,
  visualProjection,
  type VisualAtom,
  type VisualProjection,
} from "./visual-source";

export function safeMathHtml(source: string, display = false) {
  if (source.length > 10000) throw new Error("Equation preview is too large.");
  return katex.renderToString(source, {
    displayMode: display,
    throwOnError: true,
    trust: false,
    strict: "ignore",
    maxExpand: 1000,
    maxSize: 20,
    macros: {},
    output: "htmlAndMathml",
  });
}
function previewText(raw: string) {
  return raw
    .replace(/\\(?:textbf|textit|emph|texttt|underline)\{([^{}]*)\}/g, "$1")
    .replace(/\\([%&#_$])/g, "$1")
    .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, "")
    .trim();
}
export function tableCells(raw: string) {
  const parsed = tableResult(raw).table;
  if (!parsed) return [];
  return parsed.rows.map((row) =>
    row.cells.map((c) => ({
      from: c.contentFrom,
      to: c.contentTo,
      text: previewText(c.text),
      span: c.span,
      column: c.column,
    })),
  );
}
type Options = {
  projectId: string;
  onSource: (from: number, to: number, label: string) => void;
  onTable?: (from: number, to: number) => void;
};
class AtomWidget extends WidgetType {
  constructor(
    readonly atom: VisualAtom,
    readonly options: Options,
  ) {
    super();
  }
  eq(other: AtomWidget) {
    return (
      JSON.stringify(this.atom) === JSON.stringify(other.atom) &&
      this.options.projectId === other.options.projectId
    );
  }
  toDOM(view: EditorView) {
    const atom = this.atom,
      outer = document.createElement(
        atom.display || ["setup", "figure", "table"].includes(atom.kind)
          ? "div"
          : "span",
      );
    outer.className = "visual-atom visual-" + atom.kind;
    outer.contentEditable = "false";
    outer.dataset.visualFrom = String(atom.from);
    outer.dataset.visualTo = String(atom.to);
    if (atom.kind === "glyph") {
      outer.textContent = atom.value ?? atom.label;
      return outer;
    }
    const edit = (from = atom.from, to = atom.to, label = atom.label) =>
      this.options.onSource(from, to, label);
    if (atom.kind === "math") {
      const math = document.createElement("span");
      math.className = "visual-equation";
      try {
        math.innerHTML = safeMathHtml(atom.value ?? "", !!atom.display);
      } catch {
        math.textContent = atom.value ?? atom.label;
        math.classList.add("visual-equation-source");
      }
      outer.append(math);
    }
    if (atom.kind === "figure") {
      if (
        atom.asset &&
        /\.(png|jpe?g)$/i.test(atom.asset) &&
        !/[{}%\\]/.test(atom.asset)
      ) {
        const image = document.createElement("img");
        image.src = `/api/projects/${encodeURIComponent(this.options.projectId)}/raw?path=${encodeURIComponent(atom.asset)}`;
        image.alt = "Project figure: " + atom.asset;
        image.loading = "lazy";
        outer.append(image);
      }
      const path = document.createElement("small");
      path.textContent = atom.asset ?? "Custom figure source";
      outer.append(path);
      const caption = /\\caption\{([^{}]*)\}/.exec(atom.value ?? "");
      if (caption) {
        const p = document.createElement("p");
        p.textContent = previewText(caption[1]);
        outer.append(p);
      }
    }
    if (atom.kind === "table") {
      const rows = tableCells(atom.value ?? "");
      if (rows.length) {
        const table = document.createElement("table");
        table.className = "visual-table-grid";
        for (const [r, row] of rows.entries()) {
          const tr = document.createElement("tr");
          for (const cell of row) {
            const td = document.createElement("td"),
              button = document.createElement("button");
            td.colSpan = cell.span;
            button.textContent = cell.text || "Empty cell";
            button.setAttribute(
              "aria-label",
              `Edit table cell ${r + 1}, ${cell.column + 1}`,
            );
            button.onclick = (e) => {
              e.preventDefault();
              edit(
                atom.from + cell.from,
                atom.from + cell.to,
                `Table cell ${r + 1}, ${cell.column + 1}`,
              );
            };
            td.append(button);
            tr.append(td);
          }
          table.append(tr);
        }
        outer.append(table);
      }
      const tableEdit = document.createElement("button");
      tableEdit.type = "button";
      tableEdit.className = "visual-source-button";
      tableEdit.textContent = "Edit table";
      tableEdit.onclick = (e) => {
        e.preventDefault();
        this.options.onTable?.(atom.from, atom.to);
      };
      outer.append(tableEdit);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "visual-source-button";
    button.textContent =
      atom.kind === "source"
        ? atom.label
        : atom.kind === "setup"
          ? atom.label
          : `Edit ${atom.label.toLowerCase()} source`;
    button.setAttribute("aria-label", `Edit ${atom.label} source`);
    button.title = view.state.doc.sliceString(
      atom.from,
      Math.min(atom.to, atom.from + 500),
    );
    button.onclick = (e) => {
      e.preventDefault();
      edit();
    };
    outer.append(button);
    if (
      ["figure", "table"].includes(atom.kind) ||
      (atom.kind === "math" && atom.display)
    ) {
      const paragraph = document.createElement("button");
      paragraph.type = "button";
      paragraph.className = "visual-source-button visual-add-paragraph";
      paragraph.textContent = "Add paragraph";
      paragraph.setAttribute(
        "aria-label",
        `Add paragraph after ${atom.label.toLocaleLowerCase()}`,
      );
      paragraph.onclick = (e) => {
        e.preventDefault();
        if (view.state.readOnly) return;
        view.dispatch(
          sourceEditTransaction({
            from: atom.to,
            to: atom.to,
            text: "\n\n",
            selection: { anchor: atom.to + 2, head: atom.to + 2 },
          }),
        );
        view.focus();
      };
      outer.append(paragraph);
    }
    return outer;
  }
  ignoreEvent() {
    return true;
  }
}
export function visualEditor(options: Options): Extension {
  const projection = StateField.define<VisualProjection>({
    create: (s) => visualProjection(s.doc.toString()),
    update: (value, tr) =>
      tr.docChanged ? visualProjection(tr.newDoc.toString()) : value,
  });
  const decorations = StateField.define<DecorationSet>({
    create: (state) => decorate(state),
    update: (value, tr) => (tr.docChanged ? decorate(tr.state) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
  const atomic = StateField.define<DecorationSet>({
    create: (state) => atomicSet(state),
    update: (value, tr) => (tr.docChanged ? atomicSet(tr.state) : value),
  });
  function atomicSet(state: EditorState) {
    const p = state.field(projection);
    return Decoration.set(
      [...p.atoms, ...p.protected].map((r) =>
        Decoration.replace({}).range(r.from, r.to),
      ),
      true,
    );
  }
  function decorate(state: EditorState) {
    const p = state.field(projection),
      ranges: Range<Decoration>[] = [];
    let atomIndex = 0;
    for (const span of p.protected) {
      while (atomIndex < p.atoms.length && p.atoms[atomIndex].to <= span.from)
        atomIndex++;
      const atom = p.atoms[atomIndex];
      if (!atom || atom.from > span.from || atom.to < span.to)
        ranges.push(Decoration.replace({}).range(span.from, span.to));
    }
    for (const atom of p.atoms) {
      const block =
        !!(atom.display || ["setup", "figure", "table"].includes(atom.kind)) &&
        (atom.from === 0 ||
          state.doc.sliceString(atom.from - 1, atom.from) === "\n") &&
        (atom.to === state.doc.length ||
          state.doc.sliceString(atom.to, atom.to + 1) === "\n" ||
          state.doc.sliceString(atom.to - 1, atom.to) === "\n");
      ranges.push(
        Decoration.replace({
          widget: new AtomWidget(atom, options),
          block,
        }).range(atom.from, atom.to),
      );
    }
    for (const group of p.groups)
      if (group.innerFrom < group.innerTo)
        ranges.push(
          Decoration.mark({ class: "visual-mark visual-" + group.style }).range(
            group.innerFrom,
            group.innerTo,
          ),
        );
    for (const line of p.lines)
      ranges.push(
        Decoration.line({
          class: "visual-line visual-line-" + line.style,
          attributes:
            line.style === "list-item"
              ? { "data-marker": line.label ?? "•" }
              : {},
        }).range(state.doc.lineAt(line.from).from),
      );
    return Decoration.set(ranges, true);
  }
  function remove(view: EditorView, forward: boolean) {
    if (view.state.readOnly) return true;
    const selection = view.state.selection.main;
    if (!selection.empty) return false;
    const p = view.state.field(projection),
      source = view.state.doc.toString();
    let at = selection.head;
    for (let i = 0; i < p.protected.length + 1; i++) {
      const hidden = p.protected.find((r) =>
        forward ? at >= r.from && at < r.to : at > r.from && at <= r.to,
      );
      if (!hidden) break;
      at = forward ? hidden.to : hidden.from;
    }
    if (forward ? at >= p.body.to : at <= p.body.from) return true;
    const atom = p.atoms.find((a) =>
      forward ? a.from <= at && a.to > at : a.from < at && a.to >= at,
    );
    const boundary = findClusterBreak(source, at, forward, true);
    view.dispatch({
      changes: {
        from: atom?.from ?? Math.min(at, boundary),
        to: atom?.to ?? Math.max(at, boundary),
      },
      userEvent: forward ? "delete.forward" : "delete.backward",
      scrollIntoView: true,
    });
    return true;
  }
  return [
    projection,
    decorations,
    atomic,
    EditorView.editorAttributes.of({ class: "visual-document" }),
    EditorView.atomicRanges.of((view) => view.state.field(atomic)),
    EditorState.transactionFilter.of((tr) => {
      if (
        !tr.docChanged ||
        tr.annotation(internalEdit) ||
        tr.isUserEvent("input.format") ||
        tr.isUserEvent("input.reference") ||
        (!tr.isUserEvent("input") && !tr.isUserEvent("delete"))
      )
        return tr;
      const edits: { from: number; to: number; text: string }[] = [];
      tr.changes.iterChanges((from, to, _a, _b, text) =>
        edits.push({ from, to, text: text.toString() }),
      );
      const spec = visualInput(
        tr.startState.doc.toString(),
        tr.startState.field(projection),
        edits,
      );
      return {
        ...spec,
        userEvent: tr.annotation(Transaction.userEvent),
        annotations:
          tr.annotation(Transaction.addToHistory) !== undefined
            ? Transaction.addToHistory.of(
                tr.annotation(Transaction.addToHistory)!,
              )
            : [],
      };
    }),
    Prec.high(
      keymap.of([
        { key: "Backspace", run: (view) => remove(view, false) },
        { key: "Delete", run: (view) => remove(view, true) },
        {
          key: "Mod-a",
          run: (view) => {
            const p = view.state.field(projection);
            view.dispatch({
              selection: EditorSelection.range(p.body.from, p.body.to),
            });
            return true;
          },
        },
        {
          key: "Enter",
          run: (view) => {
            if (view.state.readOnly) return true;
            const p = view.state.field(projection),
              s = view.state.selection.main;
            const structural = visualEnter(
              view.state.doc.toString(),
              p,
              s.from,
              s.to,
            );
            if (structural) {
              view.dispatch(sourceEditTransaction(structural));
              return true;
            }
            view.dispatch({
              changes: { from: s.from, to: s.to, insert: "\n\n" },
              userEvent: "input.type",
              scrollIntoView: true,
            });
            return true;
          },
        },
      ]),
    ),
  ];
}
