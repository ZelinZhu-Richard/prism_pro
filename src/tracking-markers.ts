import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap } from "@codemirror/view";
import { commentChanges } from "../shared/comments";
export interface TrackingMark {
  id: number;
  from: number;
  to: number;
  removed: boolean;
}
export const setTrackingMarks = StateEffect.define<{
  source: string;
  marks: TrackingMark[];
}>();
export function trackingMarkers(open: (id: number) => void): Extension {
  class Deletion extends WidgetType {
    constructor(readonly id: number) {
      super();
    }
    eq(other: Deletion) {
      return other.id === this.id;
    }
    toDOM() {
      const b = document.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.className = "tracking-deletion";
      b.textContent = "Deletion";
      b.title = "Review removed source · Alt+Shift+Enter";
      b.setAttribute("aria-label", "Review deleted text");
      b.onclick = (e) => {
        e.preventDefault();
        open(this.id);
      };
      return b;
    }
    ignoreEvent() {
      return true;
    }
  }
  const field = StateField.define<TrackingMark[]>({
    create: () => [],
    update(marks, tr) {
      if (tr.docChanged)
        marks = marks.map((m) => ({
          ...m,
          from: tr.changes.mapPos(m.from, -1),
          to: tr.changes.mapPos(m.to, 1),
        }));
      for (const e of tr.effects)
        if (e.is(setTrackingMarks)) {
          const map = commentChanges(e.value.source, tr.newDoc.toString());
          marks = e.value.marks.map((m) => ({
            ...m,
            from: map.mapPos(m.from, -1),
            to: map.mapPos(m.to, 1),
          }));
        }
      return marks;
    },
    provide: (f) =>
      EditorView.decorations.from(f, (marks) =>
        Decoration.set(
          marks.flatMap((m) => [
            ...(m.from < m.to
              ? [
                  Decoration.mark({
                    class: "tracking-insertion",
                    attributes: { title: "Inserted source pending review" },
                  }).range(m.from, m.to),
                ]
              : []),
            ...(m.removed
              ? [
                  Decoration.widget({
                    widget: new Deletion(m.id),
                    side: -1,
                  }).range(m.from),
                ]
              : []),
          ]),
          true,
        ),
      ),
  });
  return [
    field,
    keymap.of([
      {
        key: "Alt-Shift-Enter",
        run: (view) => {
          const s = view.state.selection.main,
            m = view.state
              .field(field)
              .find((m) => m.from <= s.to && m.to >= s.from);
          if (!m) return false;
          open(m.id);
          return true;
        },
      },
    ]),
  ];
}
