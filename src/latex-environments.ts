import {
  EditorSelection,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import { completionStatus } from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import {
  scanEnvironments,
  environmentAt,
  environmentBreak,
  type EnvironmentIndex,
} from "../shared/latex-environments";
export const environmentIndex = StateField.define<EnvironmentIndex>({
  create: (state) => scanEnvironments(state.doc.toString()),
  update: (index, tr) =>
    tr.docChanged ? scanEnvironments(tr.newDoc.toString()) : index,
});
const matches = StateField.define<DecorationSet>({
  create: (state) => marks(state),
  update: (decorations, tr) =>
    tr.docChanged || tr.selection ? marks(tr.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});
function marks(state: EditorView["state"]) {
  const index = state.field(environmentIndex),
    found = new Map<number, { from: number; to: number; matched: boolean }>();
  for (const r of state.selection.ranges) {
    if (!r.empty) continue;
    const token = environmentAt(index, r.head);
    if (!token) continue;
    const matched = token.mate !== undefined;
    found.set(token.from, { ...token, matched });
    if (matched) {
      const mate = index.tokens[token.mate!];
      found.set(mate.from, { ...mate, matched: true });
    }
  }
  return Decoration.set(
    [...found.values()].map((t) =>
      Decoration.mark({
        class: t.matched ? "cm-environment-match" : "cm-environment-unmatched",
        attributes: {
          title: t.matched
            ? "Matching LaTeX environment"
            : "No matching environment in this file",
        },
      }).range(t.from, t.to),
    ),
    true,
  );
}
export function closeEnvironmentTransaction(state: EditorView["state"]) {
  if (state.readOnly || state.selection.ranges.some((r) => !r.empty))
    return null;
  const index =
      state.field(environmentIndex, false) ??
      scanEnvironments(state.doc.toString()),
    unit = state.facet(indentUnit);
  const edits = state.selection.ranges.map((r) =>
    environmentBreak(state.doc.toString(), r.head, unit, index),
  );
  if (edits.some((e) => !e)) return null;
  if (edits.some((e, i) => i > 0 && e!.from < edits[i - 1]!.to)) return null;
  let offset = 0;
  const ranges = edits.map((e) => {
    const change = e!;
    const range = EditorSelection.cursor(change.cursor + offset);
    offset += change.text.length - (change.to - change.from);
    return range;
  });
  return state.update({
    changes: edits.map((e) => ({ from: e!.from, to: e!.to, insert: e!.text })),
    selection: EditorSelection.create(ranges, state.selection.mainIndex),
    annotations: [
      Transaction.userEvent.of("input.environment"),
      isolateHistory.of("full"),
    ],
    scrollIntoView: true,
  });
}
export function goToMatchingEnvironment(view: EditorView) {
  const index = view.state.field(environmentIndex, false);
  if (!index) return false;
  const token = environmentAt(index, view.state.selection.main.head);
  if (token?.mate === undefined) return false;
  view.dispatch({
    selection: { anchor: index.tokens[token.mate].from },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
export function latexEnvironments(close = true): Extension {
  return [
    environmentIndex,
    matches,
    EditorView.baseTheme({
      ".cm-environment-match": {
        backgroundColor: "var(--selection)",
        textDecoration: "underline",
        textUnderlineOffset: "3px",
      },
      ".cm-environment-unmatched": {
        textDecoration: "underline wavy var(--danger)",
        textUnderlineOffset: "3px",
      },
    }),
    keymap.of([
      { key: "Shift-Mod-\\", run: goToMatchingEnvironment },
      ...(close
        ? [
            {
              key: "Enter",
              run: (view: EditorView) => {
                // A completed begin token can leave an asynchronous lookup
                // pending for one turn. Only a visible active list owns Enter.
                if (view.composing || completionStatus(view.state) === "active")
                  return false;
                const tr = closeEnvironmentTransaction(view.state);
                if (!tr) return false;
                view.dispatch(tr);
                return true;
              },
            },
          ]
        : []),
    ]),
  ];
}
