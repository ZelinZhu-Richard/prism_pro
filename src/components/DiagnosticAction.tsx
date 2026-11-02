import type { DiagnosticActionView } from "../diagnostic-actions";
import { Modal } from "./Modal";
import "./chat-draft.css";
import "./diagnostic-action.css";
export function DiagnosticActionNotice({
  view,
  onRetry,
  onCancel,
}: {
  view: DiagnosticActionView;
  onRetry: () => void;
  onCancel: () => void;
}) {
  if (!view.request || view.reviewing || view.phase === "idle") return null;
  return (
    <div
      className="diagnostic-action-notice"
      aria-busy={view.phase === "preparing"}
    >
      <p role={view.phase === "error" ? "alert" : "status"}>
        {view.phase === "error" ? (
          <>
            Request for <code>{view.request.target}</code>: {view.error}
          </>
        ) : (
          <>
            Preparing request for <code>{view.request.target}</code>…
          </>
        )}
      </p>
      <div>
        {view.phase === "error" && (
          <button onClick={onRetry}>Prepare again</button>
        )}
        <button onClick={onCancel}>
          {view.phase === "preparing" ? "Cancel preparation" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
export function DiagnosticDraftReview({
  view,
  onChoose,
  onRetry,
  onCancel,
}: {
  view: DiagnosticActionView;
  onChoose: (choice: "replace" | "append") => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  if (!view.request || !view.reviewing) return null;
  const pending = view.phase === "preparing",
    failed = view.phase === "error";
  return (
    <Modal
      title="Prepare an AI fix"
      className="chat-draft-dialog diagnostic-request-dialog"
      onClose={onCancel}
    >
      <div className="chat-draft-body">
        <p>
          Keep your draft, append this diagnostic, or replace it with the
          prepared request. Preparing opens the source file; you review the
          composer before sending.
        </p>
        <p className="diagnostic-request-target">
          Source file <code>{view.request.target}</code>
          {view.request.line ? ` · line ${view.request.line}` : ""}
        </p>
        <label>
          Your unsent prompt
          <textarea
            aria-label="Existing unsent prompt"
            readOnly
            value={view.existing}
          />
        </label>
        <label>
          Prepared diagnostic request
          <textarea
            aria-label="Prepared diagnostic request"
            readOnly
            value={view.proposed}
          />
        </label>
        {pending && (
          <p role="status">Opening source and preparing your request…</p>
        )}
        {failed && (
          <p role="alert" className="chat-draft-error">
            {view.error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button onClick={onCancel}>
          {pending ? "Cancel preparation" : "Keep draft"}
        </button>
        {failed ? (
          <button className="primary" onClick={onRetry}>
            Review current draft
          </button>
        ) : (
          <>
            <button disabled={pending} onClick={() => onChoose("append")}>
              Append diagnostic
            </button>
            <button
              className="primary"
              disabled={pending}
              onClick={() => onChoose("replace")}
            >
              Replace draft
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
