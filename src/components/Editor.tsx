import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
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
  historyKeymap,
  indentWithTab,
  undo,
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
import { stex } from "@codemirror/legacy-modes/mode/stex";

export interface EditorHandle {
  value: () => string;
  selection: () => { from: number; to: number };
  jump: (line: number) => void;
  undo: () => void;
  redo: () => void;
  search: () => void;
  type: (from: number, to: number, text: string, first: boolean) => void;
  endTyping: () => void;
  select: (from: number, to: number) => void;
}
interface Props {
  content: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSelection: (line: number, column: number, from: number, to: number) => void;
  onCompile: () => void;
  onToPdf: () => void;
}
export const Editor = forwardRef<EditorHandle, Props>(
  function Editor(props, ref) {
    const parent = useRef<HTMLDivElement>(null),
      view = useRef<EditorView | null>(null),
      callbacks = useRef(props),
      editable = useRef(new Compartment());
    callbacks.current = props;
    useEffect(() => {
      const v = new EditorView({
        parent: parent.current!,
        state: EditorState.create({
          doc: props.content,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            drawSelection(),
            highlightActiveLine(),
            rectangularSelection(),
            foldGutter(),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            highlightSelectionMatches(),
            history({
              newGroupDelay: 750,
              joinToEvent: (tr, adjacent) =>
                tr.isUserEvent("input.type.ai") || adjacent,
            }),
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
            autocompletion(),
            EditorView.lineWrapping,
            editable.current.of(EditorState.readOnly.of(props.readOnly)),
            keymap.of([
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
            EditorView.contentAttributes.of({
              "aria-label": "LaTeX source editor",
              spellcheck: "false",
            }),
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
              ".cm-activeLine": { backgroundColor: "var(--line)" },
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
        }),
      });
      view.current = v;
      return () => {
        v.destroy();
        view.current = null;
      };
    }, []);
    useEffect(() => {
      const v = view.current;
      if (v && v.state.doc.toString() !== props.content)
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: props.content },
          annotations: isolateHistory.of("full"),
        });
    }, [props.content]);
    useEffect(() => {
      view.current?.dispatch({
        effects: editable.current.reconfigure(
          EditorState.readOnly.of(props.readOnly),
        ),
      });
    }, [props.readOnly]);
    useImperativeHandle(
      ref,
      () => ({
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
        undo: () => {
          if (!callbacks.current.readOnly) undo(view.current!);
        },
        redo: () => {
          if (!callbacks.current.readOnly) redo(view.current!);
        },
        search: () => {
          openSearchPanel(view.current!);
          view.current!.focus();
        },
        // Composition transactions deliberately form one history event across pauses.
        type: (from, to, text, first) => {
          view.current!.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
            annotations: [
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
      }),
      [],
    );
    return <div className="code-editor" ref={parent} />;
  },
);
