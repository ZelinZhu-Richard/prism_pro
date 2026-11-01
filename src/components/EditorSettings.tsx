import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api";
import {
  defaultEditorPreferences,
  editorFonts,
  editorLineHeights,
  editorPreferences,
  type EditorPreferences,
} from "../../shared/editor-preferences";

export function EditorSettings({
  value,
  onSaved,
  onBusy,
}: {
  value: unknown;
  onSaved: (value: EditorPreferences) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(() => editorPreferences(value));
  const [draft, setDraft] = useState(baseline);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  function change<K extends keyof EditorPreferences>(
    key: K,
    next: EditorPreferences[K],
  ) {
    setDraft((old) => ({ ...old, [key]: next }));
    setError("");
    setSaved(false);
  }
  async function save() {
    onBusy(true);
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const patch = Object.fromEntries(
        Object.entries(draft).filter(
          ([key, next]) => next !== baseline[key as keyof EditorPreferences],
        ),
      );
      const result = await api<{ editor?: EditorPreferences }>(
        "/settings/preferences",
        "PUT",
        { editor: patch },
      );
      if (!result.editor)
        throw new Error(
          "Restart Prism to enable editor preferences, then try saving again.",
        );
      const next = editorPreferences(result.editor);
      setBaseline(next);
      setDraft(next);
      onSaved(next);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Editor preferences could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <section className="editor-settings" aria-label="Editor preferences">
      <p className="field-help">
        Applies to every project on this computer. Preview below, then save.
        Your LaTeX and PDF formatting stay unchanged.
      </p>
      <fieldset disabled={saving}>
        <legend>Text display</legend>
        <div className="editor-settings-grid">
          <label>
            Font size
            <select
              value={draft.fontSize}
              onChange={(e) => change("fontSize", Number(e.target.value))}
            >
              {Array.from({ length: 15 }, (_, i) => i + 10).map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
          <label>
            Code font
            <select
              value={draft.fontFamily}
              onChange={(e) =>
                change(
                  "fontFamily",
                  e.target.value as EditorPreferences["fontFamily"],
                )
              }
            >
              {Object.entries(editorFonts).map(([id, font]) => (
                <option key={id} value={id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Line spacing
            <select
              value={draft.lineHeight}
              onChange={(e) =>
                change(
                  "lineHeight",
                  e.target.value as EditorPreferences["lineHeight"],
                )
              }
            >
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="wide">Wide</option>
            </select>
          </label>
          <label>
            Keybindings · Code mode
            <select
              value={draft.keymap}
              onChange={(e) =>
                change("keymap", e.target.value as EditorPreferences["keymap"])
              }
            >
              <option value="default">Standard</option>
              <option value="vim">Vim</option>
              <option value="emacs">Emacs</option>
            </select>
          </label>
        </div>
        <pre
          className="editor-font-preview"
          aria-label="Editor font preview"
          style={{
            fontFamily: editorFonts[draft.fontFamily].family,
            fontSize: draft.fontSize,
            lineHeight: editorLineHeights[draft.lineHeight],
          }}
        >{String.raw`\section{A clearer thought}
Café, equations $x^2$, and ideas.
  Write at your own pace.`}</pre>
        <p className="field-help">
          Font size and spacing also apply to Visual mode. Vim/Emacs are
          emulations; browser shortcuts may take priority.
        </p>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>Code editing</legend>
        <div className="editor-settings-grid">
          <label>
            Indent width
            <select
              value={draft.tabSize}
              onChange={(e) =>
                change(
                  "tabSize",
                  Number(e.target.value) as EditorPreferences["tabSize"],
                )
              }
            >
              {[2, 4, 8].map((width) => (
                <option key={width} value={width}>
                  {width} columns
                </option>
              ))}
            </select>
          </label>
          <label>
            Indent using
            <select
              value={draft.indentWithTabs ? "tabs" : "spaces"}
              onChange={(e) =>
                change("indentWithTabs", e.target.value === "tabs")
              }
            >
              <option value="spaces">Spaces</option>
              <option value="tabs">Tabs</option>
            </select>
          </label>
        </div>
        <div className="editor-settings-checks">
          {(
            [
              ["lineWrapping", "Wrap long lines"],
              ["lineNumbers", "Show line numbers"],
              ["autoComplete", "Automatic completion"],
              ["closeBrackets", "Close brackets automatically"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => change(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="field-help">
          Indentation affects new edits; existing whitespace stays intact.
          Standard keys: Ctrl+Space opens completion. Press Escape then Tab to
          move keyboard focus out of the editor.
        </p>
      </fieldset>
      {error && (
        <p className="inline-message" role="alert">
          {error}
        </p>
      )}
      <div className="editor-settings-actions">
        <button
          className="primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving && <LoaderCircle size={15} className="spin" />}
          {saving ? "Saving…" : "Save editor settings"}
        </button>
        <button
          className="subtle"
          disabled={saving}
          onClick={() => {
            setDraft({ ...defaultEditorPreferences });
            setSaved(false);
            setError("");
          }}
        >
          Reset editor defaults
        </button>
        <span role="status">
          {saving
            ? ""
            : dirty
              ? "Unsaved preferences"
              : saved
                ? "Editor settings saved"
                : ""}
        </span>
      </div>
    </section>
  );
}
