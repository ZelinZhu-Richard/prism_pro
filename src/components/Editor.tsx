import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorState,
  Compartment,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  indentWithTab,
  undo,
  undoDepth,
  redo,
  isolateHistory,
} from "@codemirror/commands";
import {
  searchKeymap,
  highlightSelectionMatches,
  openSearchPanel,
} from "@codemirror/search";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { visualEditor } from "../visual-editor";
import { visualProjection, visualCaret } from "../visual-source";
import "katex/dist/katex.min.css";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { latexCompletions } from "../latex-completion";
import type { ProjectIntelligence } from "../../shared/project-intelligence";
import {
  internalEdit,
  readOnlyTransactions,
  sourceEditTransaction,
} from "../editor-transactions";
import type { FormatAction, SourceEdit } from "../source-actions";

export type EditorSnapshot = ReturnType<EditorState["toJSON"]>;
export interface EditorHandle {
  focus: () => void;
  focusSource: (label: string, at?: number) => void;
  value: () => string;
  selection: () => { from: number; to: number };
  jump: (line: number) => void;
  undo: () => void;
  canUndo: () => boolean;
  redo: () => void;
  search: () => void;
  type: (from: number, to: number, text: string, first: boolean) => void;
  endTyping: () => void;
  select: (from: number, to: number) => void;
  replaceSelection: (from: number, to: number, text: string) => void;
  applySourceEdit: (edit: SourceEdit) => void;
  restore: (content: string, selection: { from: number; to: number }) => void;
}
interface Props {
  content: string;
  cachedState?: EditorSnapshot;
  onCache?: (state: EditorSnapshot) => void;
  readOnly: boolean;
  active?: boolean;
  intelligence?: ProjectIntelligence;
  onChange: (value: string) => void;
  onSelection: (line: number, column: number, from: number, to: number) => void;
  onCompile: () => void;
  onToPdf: () => void;
  onFormat: (action: FormatAction) => void;
  visual?: boolean;
  projectId?: string;
  onSource?: (from: number, to: number, label: string) => void;
  onFind?: () => void;
}
export const Editor = forwardRef<EditorHandle, Props>(
  function Editor(props, ref) {
    const parent = useRef<HTMLDivElement>(null),
      view = useRef<EditorView | null>(null),
      callbacks = useRef(props),
      editable = useRef(new Compartment()),
      attributes = useRef(new Compartment()),
      presentation = useRef(new Compartment()),
      modeExtensions = useRef<() => Extension[]>(() => []);
    callbacks.current = props;
    useEffect(() => {
      const codeExtensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        StreamLanguage.define(stex),
        syntaxHighlighting(
          HighlightStyle.define([
            {
              tag: [tags.keyword, tags.tagName],
              color: "var(--syntax-keyword)",
            },
            {
              tag: [tags.atom, tags.number, tags.attributeName],
              color: "var(--syntax-number)",
            },
            {
              tag: [tags.string, tags.labelName],
              color: "var(--syntax-string)",
            },
            {
              tag: tags.comment,
              color: "var(--muted)",
              fontStyle: "italic",
            },
            { tag: tags.bracket, color: "var(--text)" },
          ]),
        ),
        autocompletion({
          override: [
            (context) =>
              latexCompletions(context, callbacks.current.intelligence),
          ],
        }),
      ];
      modeExtensions.current = () =>
        callbacks.current.visual
          ? [
              visualEditor({
                projectId: callbacks.current.projectId ?? "",
                onSource: (from, to, label) =>
                  callbacks.current.onSource?.(from, to, label),
              }),
            ]
          : codeExtensions;
      const config = {
        doc: props.content,
        extensions: [
          drawSelection(),
          rectangularSelection(),
          highlightSelectionMatches(),
          history({
            newGroupDelay: 750,
            joinToEvent: (tr, adjacent) =>
              tr.isUserEvent("input.type.ai") || adjacent,
          }),
          presentation.current.of(modeExtensions.current()),
          EditorView.lineWrapping,
          editable.current.of(EditorState.readOnly.of(props.readOnly)),
          readOnlyTransactions,
          keymap.of([
            {
              key: "Mod-f",
              run: () => {
                if (!callbacks.current.visual || !callbacks.current.onFind)
                  return false;
                callbacks.current.onFind();
                return true;
              },
            },
            ...(
              [
                ["Mod-b", "bold"],
                ["Mod-i", "italic"],
                ["Mod-/", "comment"],
              ] as const
            ).map(([key, action]) => ({
              key,
              run: () => {
                if (callbacks.current.readOnly) return false;
                callbacks.current.onFormat(action);
                return true;
              },
            })),
            {
              key: "Mod-Enter",
              run: () => {
                callbacks.current.onCompile();
                return true;
              },
            },
            {
              key: "Mod-Shift-j",
              run: () => {
                callbacks.current.onToPdf();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          attributes.current.of(
            EditorView.contentAttributes.of({
              "aria-label": "LaTeX source editor",
              "aria-readonly": String(props.readOnly),
              spellcheck: "false",
            }),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const s = update.state.selection.main,
                line = update.state.doc.lineAt(s.head);
              callbacks.current.onSelection(
                line.number,
                s.head - line.from + 1,
                s.from,
                s.to,
              );
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "13px",
              backgroundColor: "var(--editor)",
              color: "var(--text)",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily:
                '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
              lineHeight: "1.85",
            },
            ".cm-content": { padding: "22px 0 100px" },
            ".cm-line": { padding: "0 22px 0 10px" },
            ".cm-gutters": {
              backgroundColor: "var(--editor)",
              color: "var(--muted)",
              border: "none",
              padding: "0 10px 0 8px",
            },
            // CodeMirror draws selections beneath lines; an opaque fill hides them.
            ".cm-activeLine": {
              backgroundColor:
                "color-mix(in srgb, var(--line) 45%, transparent)",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
              color: "var(--text)",
            },
            ".cm-cursor": { borderLeftColor: "var(--accent)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
              { backgroundColor: "var(--selection) !important" },
            ".cm-panels": {
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              borderColor: "var(--border)",
            },
            ".cm-search input": {
              background: "var(--editor)",
              color: "var(--text)",
            },
            ".cm-tooltip": {
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              borderColor: "var(--border)",
            },
          }),
        ],
      };
      const state =
        props.cachedState?.doc === props.content
          ? EditorState.fromJSON(props.cachedState, config, {
              history: historyField,
            })
          : EditorState.create(config);
      const v = new EditorView({ parent: parent.current!, state });
      view.current = v;
      return () => {
        callbacks.current.onCache?.(v.state.toJSON({ history: historyField }));
        v.destroy();
        view.current = null;
      };
    }, []);
    useEffect(() => {
      view.current?.dispatch({
        effects: presentation.current.reconfigure(modeExtensions.current()),
      });
      if (props.visual && view.current?.state.selection.main.empty) {
        const v = view.current,
          at = visualCaret(
            visualProjection(v.state.doc.toString()),
            v.state.selection.main.head,
          );
        v.dispatch({ selection: { anchor: at } });
      }
      view.current?.requestMeasure();
    }, [props.visual]);
    useEffect(() => {
      const v = view.current;
      if (v && v.state.doc.toString() !== props.content)
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: props.content },
          annotations: [isolateHistory.of("full"), internalEdit.of(true)],
        });
    }, [props.content]);
    useEffect(() => {
      view.current?.dispatch({
        effects: [
          editable.current.reconfigure(EditorState.readOnly.of(props.readOnly)),
          attributes.current.reconfigure(
            EditorView.contentAttributes.of({
              "aria-label":
                props.active === false
                  ? "Background typing editor"
                  : props.visual
                    ? "Visual document editor"
                    : "LaTeX source editor",
              "aria-readonly": String(props.readOnly),
              spellcheck: "false",
            }),
          ),
        ],
      });
      if (props.active !== false && view.current) {
        const s = view.current.state.selection.main,
          line = view.current.state.doc.lineAt(s.head);
        callbacks.current.onSelection(
          line.number,
          s.head - line.from + 1,
          s.from,
          s.to,
        );
        view.current.requestMeasure();
      }
    }, [props.readOnly, props.active, props.visual]);
    useImperativeHandle(
      ref,
      () => ({
        focus: () => view.current?.focus(),
        focusSource: (label, at) => {
          const v = view.current;
          const wanted = [`Edit ${label} source`, `Edit ${label}`].map((s) =>
            s.toLocaleLowerCase(),
          );
          const button = [
            ...(v?.dom.querySelectorAll<HTMLButtonElement>(
              "button[aria-label]",
            ) ?? []),
          ].find((b) =>
            wanted.includes(
              (b.getAttribute("aria-label") ?? "").toLocaleLowerCase(),
            ),
          );
          if (button) {
            button.focus();
            return;
          }
          const owner =
            at === undefined
              ? undefined
              : [
                  ...(v?.dom.querySelectorAll<HTMLElement>(
                    "[data-visual-from]",
                  ) ?? []),
                ].find(
                  (e) =>
                    Number(e.dataset.visualFrom) <= at &&
                    Number(e.dataset.visualTo) > at,
                );
          const fallback = owner?.querySelector<HTMLButtonElement>(
            ".visual-source-button",
          );
          if (fallback) fallback.focus();
          else v?.focus();
        },
        value: () => view.current?.state.doc.toString() ?? "",
        selection: () => {
          const s = view.current!.state.selection.main;
          return { from: s.from, to: s.to };
        },
        jump: (n) => {
          const v = view.current!;
          const line = v.state.doc.line(
            Math.max(1, Math.min(n, v.state.doc.lines)),
          );
          v.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: "center" }),
          });
          v.focus();
        },
        canUndo: () => !!view.current && undoDepth(view.current.state) > 0,
        undo: () => {
          if (!callbacks.current.readOnly) undo(view.current!);
        },
        redo: () => {
          if (!callbacks.current.readOnly) redo(view.current!);
        },
        search: () => {
          openSearchPanel(view.current!);
        },
        replaceSelection: (from, to, text) => {
          const v = view.current!;
          if (callbacks.current.readOnly) return;
          v.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
            annotations: [
              Transaction.userEvent.of("input.reference"),
              isolateHistory.of("full"),
            ],
          });
          v.focus();
        },
        applySourceEdit: (edit) => {
          if (callbacks.current.readOnly) return;
          const v = view.current!;
          v.dispatch(sourceEditTransaction(edit));
          v.focus();
        },
        // Composition transactions deliberately form one history event across pauses.
        type: (from, to, text, first) => {
          view.current!.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
            annotations: [
              internalEdit.of(true),
              Transaction.userEvent.of(
                first ? "input.type.ai" : "input.type.compose",
              ),
              ...(first ? [isolateHistory.of("before")] : []),
            ],
          });
        },
        endTyping: () =>
          view.current?.dispatch({ annotations: isolateHistory.of("after") }),
        select: (from, to) => {
          const v = view.current!;
          v.dispatch({
            selection: {
              anchor: Math.min(from, v.state.doc.length),
              head: Math.min(to, v.state.doc.length),
            },
          });
          v.focus();
        },
        restore: (content, selection) => {
          const v = view.current!;
          v.dispatch({
            changes: { from: 0, to: v.state.doc.length, insert: content },
            selection: { anchor: selection.from, head: selection.to },
            annotations: [
              isolateHistory.of("full"),
              internalEdit.of(true),
              Transaction.addToHistory.of(false),
            ],
          });
          v.focus();
        },
      }),
      [],
    );
    return <div className="code-editor" ref={parent} />;
  },
);
