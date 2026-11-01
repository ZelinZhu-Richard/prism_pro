import {
  RangeSet,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  keymap,
} from "@codemirror/view";
import { commentChanges, type CommentMark } from "../shared/comments";
export const setCommentMarks = StateEffect.define<{
  source: string;
  marks: CommentMark[];
}>();
export function commentMarkers(onOpen: (id: string) => void): Extension {
  const field = StateField.define<CommentMark[]>({
    create: () => [],
    update(items, tr) {
      let changes = tr.changes;
      if (tr.docChanged && items.length)
        tr.changes.iterChangedRanges((from, to) => {
          if (from === 0 && to === tr.startState.doc.length)
            changes = commentChanges(
              tr.startState.doc.toString(),
              tr.newDoc.toString(),
            );
        });
      let marks = tr.docChanged
        ? items.map((a) => {
            const left = changes.mapPos(
                a.from,
                a.status === "attached" ? 1 : -1,
              ),
              right = changes.mapPos(a.to, a.status === "attached" ? -1 : 1),
              from = Math.min(left, right),
              to = Math.max(left, right);
            const status =
              a.status === "attached" &&
              tr.startState.doc.sliceString(a.from, a.to) !==
                tr.newDoc.sliceString(from, to)
                ? from === to
                  ? "removed"
                  : "changed"
                : a.status;
            return { ...a, from, to, status } as CommentMark;
          })
        : items;
      for (const e of tr.effects)
        if (e.is(setCommentMarks)) {
          const source = tr.newDoc.toString(),
            map = commentChanges(e.value.source, source);
          marks = e.value.marks
            .filter(
              (a) =>
                !a.unavailable &&
                a.from <= e.value.source.length &&
                a.to <= e.value.source.length,
            )
            .map((a) => {
              const from = map.mapPos(a.from, 1),
                to = map.mapPos(a.to, -1);
              return { ...a, from: Math.min(from, to), to: Math.max(from, to) };
            });
        }
      return marks;
    },
    provide: (f) =>
      EditorView.decorations.from(f, (items) => {
        const spans: { from: number; to: number }[] = [];
        for (const a of [...items]
          .filter((a) => a.to > a.from)
          .sort((a, b) => a.from - b.from || a.to - b.to)) {
          const last = spans.at(-1);
          if (last && a.from <= last.to) last.to = Math.max(last.to, a.to);
          else spans.push({ from: a.from, to: a.to });
        }
        return Decoration.set(
          spans.map((a) =>
            Decoration.mark({
              class: "comment-passage",
              attributes: { title: "Comment on this passage" },
            }).range(a.from, a.to),
          ),
          true,
        );
      }),
  });
  class Marker extends GutterMarker {
    constructor(
      readonly ids: string[],
      readonly line: number,
    ) {
      super();
    }
    eq(other: Marker) {
      return this.line === other.line && this.ids.join() === other.ids.join();
    }
    toDOM() {
      const b = document.createElement("button");
      b.className = "comment-gutter-button";
      b.type = "button";
      // CodeMirror hides gutters from assistive technology. The same action is
      // available through Alt+Enter and the Review list, without hidden tab stops.
      b.tabIndex = -1;
      b.setAttribute(
        "aria-label",
        `${this.ids.length === 1 ? "Open comment" : "Open first of " + this.ids.length + " comments"} on line ${this.line}`,
      );
      b.title = `${this.ids.length} ${this.ids.length === 1 ? "comment" : "comments"} on line ${this.line} · Alt+Enter at the passage`;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        p = document.createElementNS(svg.namespaceURI, "path");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "13");
      svg.setAttribute("height", "13");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.5");
      svg.setAttribute("aria-hidden", "true");
      p.setAttribute(
        "d",
        "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      );
      svg.append(p);
      b.append(svg);
      b.onclick = (e) => {
        e.preventDefault();
        onOpen(this.ids[0]);
      };
      return b;
    }
  }
  return [
    field,
    keymap.of([
      {
        key: "Alt-Enter",
        run: (view) => {
          const s = view.state.selection.main,
            mark = view.state
              .field(field)
              .find((a) => a.from <= s.to && a.to >= s.from);
          if (!mark) return false;
          onOpen(mark.id);
          return true;
        },
      },
    ]),
    gutter({
      class: "comment-gutter",
      markers: (view) => {
        const lines = new Map<number, string[]>();
        for (const a of view.state.field(field)) {
          const line = view.state.doc.lineAt(a.from).from;
          lines.set(line, [...(lines.get(line) ?? []), a.id]);
        }
        return RangeSet.of(
          [...lines].map(([at, ids]) =>
            new Marker(ids, view.state.doc.lineAt(at).number).range(at),
          ),
          true,
        );
      },
    }),
  ];
}
