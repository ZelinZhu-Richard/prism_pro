import { useState } from "react";
import type { DraftView } from "../chat-drafts";
import { Modal } from "./Modal";
import "./chat-draft.css";
export function DraftStatus({
  view,
  locked,
  onRetry,
  onReview,
}: {
  view: DraftView;
  locked: boolean;
  onRetry: () => void;
  onReview: () => void;
}) {
  const problem = view.status === "error" || view.status === "conflict";
  if (!problem && !view.text && view.status !== "loading")
    return (
      <span id="chat-draft-status" className="chat-draft-empty">
        No unsent draft
      </span>
    );
  return (
    <div
      id="chat-draft-status"
      className={"chat-draft-status" + (problem ? " problem" : "")}
    >
      <span role={problem ? "alert" : "status"}>
        {problem
          ? view.error
          : view.status === "loading"
            ? "Loading draft…"
            : view.status === "saving"
              ? "Saving draft…"
              : view.status === "unsaved"
                ? "Draft not saved yet"
                : "Draft saved locally"}
      </span>
      {problem && (
        <button
          type="button"
          disabled={locked}
          onClick={view.status === "conflict" ? onReview : onRetry}
        >
          {view.status === "conflict" ? "Review drafts" : "Retry draft"}
        </button>
      )}
    </div>
  );
}
export function DraftRecovery({
  view,
  onResolve,
  onClose,
}: {
  view: DraftView;
  onResolve: (choice: "local" | "saved") => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function choose(choice: "local" | "saved") {
    setPending(true);
    setError("");
    try {
      await onResolve(choice);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The draft could not be confirmed. Both versions are kept.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="Choose a chat draft"
      className="chat-draft-dialog"
      dismissible={!pending}
      onClose={onClose}
    >
      <div className="chat-draft-body">
        <p>
          Another window saved a different draft for this conversation. Review
          both versions before choosing. This does not send an AI request.
        </p>
        <label>
          Your text in this window
          <textarea
            aria-label="Your local chat draft"
            readOnly
            value={view.text}
          />
        </label>
        <label>
          Saved draft from the other window
          <textarea
            aria-label="Saved chat draft"
            readOnly
            value={view.remote?.text ?? ""}
          />
        </label>
        {error && (
          <p role="alert" className="chat-draft-error">
            {error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button disabled={pending} onClick={onClose}>
          Keep reviewing
        </button>
        <button disabled={pending} onClick={() => void choose("saved")}>
          Use saved draft
        </button>
        <button
          className="primary"
          disabled={pending}
          onClick={() => void choose("local")}
        >
          {pending ? "Saving…" : "Save my draft"}
        </button>
      </div>
    </Modal>
  );
}
