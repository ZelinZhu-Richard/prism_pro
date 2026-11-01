import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { Vim, vim } from "@replit/codemirror-vim";
import { emacs } from "@replit/codemirror-emacs";
import {
  editorFonts,
  editorLineHeights,
  type EditorPreferences,
} from "../shared/editor-preferences";
const saveHandlers = new WeakMap<EditorView, () => void>();
Vim.defineEx("write", "w", (cm) => {
  saveHandlers.get(cm.cm6)?.();
});
export function registerEditorSave(view: EditorView, save: () => void) {
  saveHandlers.set(view, save);
  return () => {
    saveHandlers.delete(view);
  };
}
export const editorKeyboardAccess = ViewPlugin.fromClass(
  class {
    private escapeUntil = 0;
    private observer: MutationObserver;
    private keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.escapeUntil = Date.now() + 2000;
      else if (event.key === "Tab" && Date.now() < this.escapeUntil) {
        // Leave native Tab focus navigation available even in modal keybindings.
        this.escapeUntil = 0;
        event.stopImmediatePropagation();
      }
    };
    constructor(private view: EditorView) {
      view.dom.addEventListener("keydown", this.keydown, true);
      const label = () => {
        for (const input of view.dom.querySelectorAll<HTMLInputElement>(
          ".cm-vim-panel input",
        ))
          if (!input.hasAttribute("aria-label"))
            input.setAttribute("aria-label", "Vim command");
      };
      this.observer = new MutationObserver(label);
      this.observer.observe(view.dom, { childList: true, subtree: true });
      label();
    }
    destroy() {
      this.observer.disconnect();
      this.view.dom.removeEventListener("keydown", this.keydown, true);
    }
  },
);

export function editorDisplay(
  preferences: EditorPreferences,
  visual = false,
): Extension {
  return [
    EditorState.tabSize.of(preferences.tabSize),
    indentUnit.of(
      preferences.indentWithTabs ? "\t" : " ".repeat(preferences.tabSize),
    ),
    visual || preferences.lineWrapping ? EditorView.lineWrapping : [],
    EditorView.theme({
      "&": { fontSize: preferences.fontSize + "px" },
      ".cm-scroller": {
        fontFamily: editorFonts[preferences.fontFamily].family,
        lineHeight: String(editorLineHeights[preferences.lineHeight]),
      },
      "&.visual-document .cm-content": {
        fontSize: preferences.fontSize + "px",
        lineHeight: String(editorLineHeights[preferences.lineHeight]),
      },
    }),
  ];
}
export function editorKeymap(
  preferences: EditorPreferences,
  visual = false,
): Extension {
  if (visual) return [];
  return Prec.high(
    preferences.keymap === "vim"
      ? vim({ status: true })
      : preferences.keymap === "emacs"
        ? emacs()
        : [],
  );
}
