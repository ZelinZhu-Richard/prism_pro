import type { SelectedPassage } from "../typing-document";

export function SelectionPreview({
  selection,
  submitted,
}: {
  selection: SelectedPassage;
  submitted: boolean;
}) {
  return (
    <section
      className="selection-preview"
      aria-label={submitted ? "Selection sent to AI" : "Selected text"}
    >
      <div className="selection-preview-heading">
        <strong>{submitted ? "Selection sent" : "Selected text"}</strong>
        <span title={selection.path}>{selection.path}</span>
        <span>
          Line {selection.startLine}
          {selection.endLine !== selection.startLine
            ? `–${selection.endLine}`
            : ""}
        </span>
      </div>
      <pre tabIndex={0} aria-label="Selected passage">
        {selection.text}
      </pre>
    </section>
  );
}
