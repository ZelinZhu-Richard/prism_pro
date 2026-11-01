import { Prec, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";
import { api } from "./api";
import {
  CLIP_MIME,
  CLIP_LIMIT,
  clipboardId,
  escapeHtml,
} from "./clipboard-formats";
import { clipboardPresentation, visualCopiedSource } from "./visual-clipboard";
import { visualInput, visualProjection } from "./visual-source";

export interface ClipboardPacket {
  source: string;
  from: number;
  to: number;
  visual: boolean;
  html: string;
  plain: string;
  rawLatex: string;
  id: string | null;
  image?: File;
  preview?: boolean;
  original?: ClipboardFragment;
  lookupError?: string;
}
export interface ClipboardFragment {
  latex: string;
  mode: "visual" | "code";
}
const local = new Map<string, ClipboardFragment>();
const registering = new Map<string, Promise<unknown>>();
export async function originalClipboard(id: string) {
  const here = local.get(id);
  if (here) return here;
  await registering.get(id)?.catch(() => {});
  return api<ClipboardFragment>(
    "/clipboard/fragments/" + encodeURIComponent(id),
  );
}
export function editorClipboard(options: {
  visual: () => boolean;
  onPaste: (data: ClipboardPacket) => void;
  onError: (message: string) => void;
}) {
  function copy(event: ClipboardEvent, view: EditorView) {
    if (!event.clipboardData) return false;
    const domSelection = view.dom.ownerDocument.getSelection();
    if (
      domSelection?.anchorNode &&
      !view.contentDOM.contains(domSelection.anchorNode)
    )
      return false;
    const source = view.state.doc.toString(),
      visual = options.visual();
    let ranges = view.state.selection.ranges
      .filter((r) => !r.empty)
      .map((r) => ({ from: r.from, to: r.to }));
    if (!visual && !ranges.length) return false; // Keep CodeMirror's linewise-copy semantics.
    if (!ranges.length) {
      ranges = view.state.selection.ranges.map((r) => {
        const l = view.state.doc.lineAt(r.head);
        return { from: l.from, to: l.to };
      });
      ranges = ranges.filter((r, i) => !i || r.from !== ranges[i - 1].from);
    }
    const fragments = ranges.map((r) =>
      visual
        ? visualCopiedSource(source, r.from, r.to)
        : { ...r, latex: source.slice(r.from, r.to) },
    );
    const latex = fragments.map((f) => f.latex).join("\n");
    if (new TextEncoder().encode(latex).length > CLIP_LIMIT) {
      if (!visual) return false;
      options.onError(
        "Copy up to 256 KB at once. Use source ZIP export for a larger document.",
      );
      event.preventDefault();
      return true;
    }
    const id = crypto.randomUUID(),
      presentation = visual
        ? clipboardPresentation(latex)
        : {
            html: "<pre><code>" + escapeHtml(latex) + "</code></pre>",
            plain: latex,
          };
    const data = event.clipboardData;
    data.clearData();
    data.setData("text/plain", presentation.plain);
    data.setData(
      "text/html",
      `<div data-prism-clip="${id}">${presentation.html}</div>`,
    );
    try {
      data.setData(CLIP_MIME, id);
      data.setData("text/x-tex", latex);
    } catch {
      /* HTML keeps the opaque identity on platforms that drop custom types. */
    }
    local.set(id, { latex, mode: visual ? "visual" : "code" });
    while (local.size > 64) local.delete(local.keys().next().value!);
    const promise = api("/clipboard/fragments", "POST", {
      id,
      latex,
      mode: visual ? "visual" : "code",
    });
    registering.set(id, promise);
    void promise.catch(() => {}).finally(() => registering.delete(id));
    if (event.type === "cut" && !view.state.readOnly) {
      if (visual) {
        const sorted = fragments.sort((a, b) => a.from - b.from),
          merged: { from: number; to: number; text: string }[] = [];
        for (const r of sorted) {
          const prior = merged.at(-1);
          if (prior && r.from <= prior.to) prior.to = Math.max(prior.to, r.to);
          else merged.push({ ...r, text: "" });
        }
        const spec = visualInput(source, visualProjection(source), merged);
        view.dispatch({
          ...spec,
          annotations: [
            Transaction.userEvent.of("delete.cut"),
            isolateHistory.of("full"),
          ],
        });
      } else
        view.dispatch({
          changes: ranges.map((r) => ({ ...r, insert: "" })),
          annotations: [
            Transaction.userEvent.of("delete.cut"),
            isolateHistory.of("full"),
          ],
        });
    }
    event.preventDefault();
    return true;
  }
  return Prec.high(
    EditorView.domEventHandlers({
      copy,
      cut: copy,
      paste(event, view) {
        if (view.state.readOnly) {
          event.preventDefault();
          return true;
        }
        const data = event.clipboardData;
        if (!data) return false;
        const html = data.getData("text/html"),
          plain = data.getData("text/plain"),
          rawLatex = data.getData("text/x-tex"),
          id = clipboardId(html, data.getData(CLIP_MIME)),
          visual = options.visual();
        const image =
          Array.from(data.items)
            .filter(
              (i) => i.kind === "file" && /^image\/(png|jpeg)$/.test(i.type),
            )
            .map((i) => i.getAsFile())
            .find(Boolean) ?? undefined;
        if (!image && !id && (!visual || (!html && !rawLatex))) return false;
        const s = view.state.selection.main;
        options.onPaste({
          source: view.state.doc.toString(),
          from: s.from,
          to: s.to,
          visual,
          html,
          plain,
          rawLatex,
          id,
          image,
        });
        event.preventDefault();
        return true;
      },
    }),
  );
}
