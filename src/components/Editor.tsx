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
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { CheckedWriting } from "../use-writing-checks";
import type { CommentMark } from "../../shared/comments";
import {
  trackingMarkers,
  setTrackingMarks,
  type TrackingMark,
} from "../tracking-markers";
import { commentMarkers, setCommentMarks } from "../comment-markers";
import { visualEditor } from "../visual-editor";
import { editorClipboard, type ClipboardPacket } from "../editor-clipboard";
import { visualPasteTransaction } from "../visual-clipboard";
import { visualProjection, visualCaret } from "../visual-source";
import "katex/dist/katex.min.css";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { latexCompletions } from "../latex-completion";
import {
  latexEnvironments,
  goToMatchingEnvironment,
} from "../latex-environments";
import type { ProjectIntelligence } from "../../shared/project-intelligence";
import {
  internalEdit,
  readOnlyTransactions,
  sourceEditTransaction,
} from "../editor-transactions";
import type { FormatAction, SourceEdit } from "../source-actions";
import {
  editorPreferences,
  type EditorPreferences,
} from "../../shared/editor-preferences";
import {
  editorDisplay,
  editorKeymap,
  registerEditorSave,
  editorKeyboardAccess,
} from "../editor-preferences";

export type EditorSnapshot = ReturnType<EditorState["toJSON"]>;
export interface EditorHandle {
  focus: () => void;
  snapshot: () => EditorSnapshot | undefined;
  focusSource: (label: string, at?: number) => void;
  value: () => string;
  selection: () => { from: number; to: number };
  jump: (line: number) => void;
  undo: () => void;
  canUndo: () => boolean;
  redo: () => void;
  search: () => void;
  matchEnvironment: () => boolean;
  type: (from: number, to: number, text: string, first: boolean) => void;
  endTyping: () => void;
  select: (from: number, to: number) => void;
  replaceSelection: (from: number, to: number, text: string) => void;
  applySourceEdit: (edit: SourceEdit) => void;
  pasteSource: (
    from: number,
    to: number,
    latex: string,
    block: boolean,
  ) => void;
  restore: (content: string, selection: { from: number; to: number }) => void;
}
interface Props {
  onReady?: () => void;
  content: string;
  latex?: boolean;
  cachedState?: EditorSnapshot;
  onCache?: (state: EditorSnapshot) => void;
  readOnly: boolean;
  active?: boolean;
  intelligence?: ProjectIntelligence;
  sourcePath?: string;
  onChange: (value: string) => void;
  onSelection: (line: number, column: number, from: number, to: number) => void;
  onCompile: () => void;
  onToPdf: () => void;
  onSave: () => void;
  onFormat: (action: FormatAction) => void;
  visual?: boolean;
  projectId?: string;
  onSource?: (from: number, to: number, label: string) => void;
  onTable?: (from: number, to: number) => void;
  onClipboard?: (data: ClipboardPacket) => void;
  onClipboardError?: (message: string) => void;
  onFind?: () => void;
  comments?: { source: string; marks: CommentMark[] };
  onComment?: (id?: string) => void;
  tracking?: { source: string; marks: TrackingMark[] };
  onTracking?: (id?: number) => void;
  preferences?: EditorPreferences;
  writing?: CheckedWriting;
  writingEnabled?: boolean;
  onWriting?: (issueId: string) => void;
}
export const Editor = forwardRef<EditorHandle, Props>(
  function Editor(props, ref) {
    const parent = useRef<HTMLDivElement>(null),
      view = useRef<EditorView | null>(null),
      callbacks = useRef(props),
      editable = useRef(new Compartment()),
      attributes = useRef(new Compartment()),
      presentation = useRef(new Compartment()),
      display = useRef(new Compartment()),
      keyboard = useRef(new Compartment()),
      completion = useRef(new Compartment()),
      writingGutter = useRef(new Compartment()),
      modeExtensions = useRef<() => Extension[]>(() => []);
    callbacks.current = props;
    useEffect(() => {
      const codeExtensions = [
        highlightActiveLineGutter(),
        highlightActiveLine(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
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
      ];
      modeExtensions.current = () =>
        callbacks.current.visual
          ? [
              visualEditor({
                projectId: callbacks.current.projectId ?? "",
                onSource: (from, to, label) =>
                  callbacks.current.onSource?.(from, to, label),
                onTable: (from, to) => callbacks.current.onTable?.(from, to),
              }),
            ]
          : codeExtensions;
      const config = {
        doc: props.content,
        extensions: [
          commentMarkers((id) => callbacks.current.onComment?.(id)),
          trackingMarkers((id) => callbacks.current.onTracking?.(id)),
          editorClipboard({
            visual: () => !!callbacks.current.visual,
            onPaste: (packet) => callbacks.current.onClipboard?.(packet),
            onError: (message) => callbacks.current.onClipboardError?.(message),
          }),
          drawSelection(),
          editorKeyboardAccess,
          rectangularSelection(),
          highlightSelectionMatches(),
          history({
            newGroupDelay: 750,
            joinToEvent: (tr, adjacent) =>
              tr.isUserEvent("input.type.ai") || adjacent,
          }),
          presentation.current.of(modeExtensions.current()),
          display.current.of(
            editorDisplay(editorPreferences(props.preferences), props.visual),
          ),
          keyboard.current.of(
            editorKeymap(editorPreferences(props.preferences), props.visual),
          ),
          completion.current.of([]),
          writingGutter.current.of([]),
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
              key: "Mod-s",
              run: () => {
                callbacks.current.onSave();
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
              backgroundColor: "var(--editor)",
              color: "var(--text)",
            },
            ".cm-scroller": {
              overflow: "auto",
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
            '.cm-tooltip-autocomplete > ul > li[aria-selected="true"]': {
              backgroundColor: "var(--selection) !important",
              color: "var(--text) !important",
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
      const unregisterSave = registerEditorSave(v, () =>
        callbacks.current.onSave(),
      );
      view.current = v;
      callbacks.current.onReady?.();
      return () => {
        unregisterSave();
        callbacks.current.onCache?.(v.state.toJSON({ history: historyField }));
        v.destroy();
        view.current = null;
      };
    }, []);
    const preferences = editorPreferences(props.preferences);
    useEffect(() => {
      const v = view.current;
      if (!v) return;
      const enabled =
        props.writingEnabled &&
        !props.visual &&
        !props.readOnly &&
        props.active !== false;
      v.dispatch({
        effects: writingGutter.current.reconfigure(enabled ? lintGutter() : []),
      });
      const issues =
        enabled &&
        props.writing?.source === props.content &&
        props.content === v.state.doc.toString()
          ? props.writing.issues
          : [];
      v.dispatch(
        setDiagnostics(
          v.state,
          issues.map((issue) => ({
            from: issue.from,
            to: Math.min(issue.to, v.state.doc.length),
            severity: "warning" as const,
            source: issue.kind === "spelling" ? "Spelling" : "LaTeX hint",
            message: issue.message,
            actions: [
              {
                name: "Writing checks",
                apply: () => callbacks.current.onWriting?.(issue.id),
              },
            ],
          })),
        ),
      );
    }, [
      props.writing,
      props.writingEnabled,
      props.visual,
      props.readOnly,
      props.active,
      props.content,
    ]);
    useEffect(() => {
      const v = view.current;
      view.current?.dispatch({
        effects: display.current.reconfigure(
          editorDisplay(preferences, props.visual),
        ),
      });
      view.current?.requestMeasure();
      const family =
        preferences.fontFamily === "source"
          ? "Source Code Pro"
          : preferences.fontFamily === "dyslexic"
            ? "OpenDyslexic Mono"
            : null;
      if (family && document.fonts)
        void document.fonts
          .load(`${preferences.fontSize}px "${family}"`)
          .then(() => {
            if (v === view.current) v?.requestMeasure();
          })
          .catch(() => {});
    }, [
      preferences.fontSize,
      preferences.fontFamily,
      preferences.lineHeight,
      preferences.tabSize,
      preferences.indentWithTabs,
      preferences.lineWrapping,
      props.visual,
    ]);
    useEffect(() => {
      view.current?.dispatch({
        effects: keyboard.current.reconfigure(
          editorKeymap(preferences, props.visual),
        ),
      });
    }, [preferences.keymap, props.visual]);
    useEffect(() => {
      view.current?.dispatch({
        effects: completion.current.reconfigure(
          props.visual
            ? []
            : [
                preferences.lineNumbers ? lineNumbers() : [],
                preferences.closeBrackets ? closeBrackets() : [],
                props.latex === false
                  ? []
                  : latexEnvironments(preferences.closeEnvironments),
                autocompletion({
                  activateOnTyping: preferences.autoComplete,
                  override: [
                    (context) =>
                      latexCompletions(
                        context,
                        callbacks.current.intelligence,
                        callbacks.current.sourcePath,
                      ),
                  ],
                }),
              ],
        ),
      });
    }, [
      preferences.lineNumbers,
      preferences.closeBrackets,
      preferences.closeEnvironments,
      preferences.autoComplete,
      props.latex,
      props.visual,
    ]);
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
    useEffect(() => {
      if (view.current)
        view.current.dispatch({
          effects: setCommentMarks.of(
            props.comments ?? {
              source: view.current.state.doc.toString(),
              marks: [],
            },
          ),
        });
    }, [props.comments]);
    useEffect(() => {
      view.current?.dispatch({
        effects: setTrackingMarks.of(
          props.tracking ?? {
            source: view.current.state.doc.toString(),
            marks: [],
          },
        ),
      });
    }, [props.tracking]);
    useImperativeHandle(
      ref,
      () => ({
        focus: () => view.current?.focus(),
        snapshot: () => view.current?.state.toJSON({ history: historyField }),
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
        matchEnvironment: () =>
          view.current ? goToMatchingEnvironment(view.current) : false,
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
        pasteSource: (from, to, latex, block) => {
          if (callbacks.current.readOnly)
            throw new Error("The file is read-only.");
          const v = view.current!,
            spec = callbacks.current.visual
              ? visualPasteTransaction(
                  v.state.doc.toString(),
                  from,
                  to,
                  latex,
                  block,
                )
              : sourceEditTransaction({ from, to, text: latex });
          const transaction = v.state.update(spec);
          if (
            new TextEncoder().encode(transaction.newDoc.toString()).length >
            2 * 1024 * 1024
          )
            throw new Error(
              "This paste would exceed the 2 MB editable-file limit.",
            );
          v.dispatch(transaction);
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
