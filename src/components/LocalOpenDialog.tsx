import { useEffect, useId, useRef, useState } from "react";
import { FileText, FolderOpen, LoaderCircle } from "lucide-react";
import type {
  LocalOpenMode,
  LocalOpenResult,
  LocalOpenReview,
} from "../../shared/local-projects";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import "./local-open.css";

const actionLabels = {
  create: "Open project",
  open: "Open project",
  restore: "Restore and open",
  relink: "Relink and open",
};

export function LocalOpenDialog({
  onClose,
  onOpen,
  projectId,
}: {
  onClose: () => void;
  onOpen: (result: LocalOpenResult) => void;
  projectId?: string;
}) {
  const [mode, setMode] = useState<LocalOpenMode>("folder");
  const [path, setPath] = useState("");
  const [review, setReview] = useState<LocalOpenReview>();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [main, setMain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pathInput = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const pathHelp = useId();
  useEffect(() => {
    if (review) summary.current?.focus();
    else pathInput.current?.focus();
  }, [review]);
  useEffect(() => {
    if (needsRefresh && !busy) submitButton.current?.focus();
  }, [needsRefresh, busy]);
  const opening = needsRefresh ? undefined : review;

  async function submit() {
    if (busy || !path.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (opening) {
        const result = await api<LocalOpenResult>(
          "/local-projects/open",
          "POST",
          {
            mode,
            path,
            projectId,
            token: opening.token,
            main,
          },
        );
        onOpen(result);
      } else {
        const captured = await api<LocalOpenReview>(
          "/local-projects/review",
          "POST",
          { mode, path, projectId },
        );
        setReview(captured);
        if (!review || (main && !captured.texFiles.includes(main)))
          setMain(captured.main);
        setNeedsRefresh(false);
      }
    } catch (e) {
      if (opening && e instanceof ApiError && e.status === 409)
        setNeedsRefresh(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={projectId ? "Locate project folder" : "Open local project"}
      onClose={onClose}
      dismissible={!busy}
      className="local-open-dialog"
    >
      <form
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {review ? (
          <section className="local-open-review" aria-label="Folder review">
            <div className="local-open-location">
              <FolderOpen size={19} aria-hidden="true" />
              <div>
                <h3 ref={summary} tabIndex={-1}>
                  {review.name}
                </h3>
                <p title={review.folder}>{review.folder}</p>
              </div>
            </div>
            {(review.file || review.action !== "create") && (
              <dl className="local-open-documents">
                {review.file && (
                  <>
                    <dt>File to open</dt>
                    <dd>{review.file}</dd>
                  </>
                )}
                {review.action !== "create" && (
                  <>
                    <dt>Main document</dt>
                    <dd>{review.main || "None selected"}</dd>
                  </>
                )}
              </dl>
            )}
            {review.writable === false && (
              <p className="local-open-readonly">
                <strong>Read-only folder.</strong> You can read, compile and
                export this project.
              </p>
            )}
            {review.action === "create" ? (
              <>
                {review.writable !== false && (
                  <p className="modal-intro">
                    Edits are saved directly to this folder.
                  </p>
                )}
                <label className="local-open-field">
                  Main document
                  <select
                    value={main}
                    onChange={(event) => setMain(event.target.value)}
                    disabled={busy || needsRefresh}
                  >
                    <option value="">Choose later</option>
                    {review.texFiles.map((name) => (
                      <option value={name} key={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <details
                  className="local-open-details"
                  open={review.files.length <= 8}
                >
                  <summary>
                    {review.files.length}{" "}
                    {review.files.length === 1 ? "entry" : "entries"} to open
                  </summary>
                  {review.files.length ? (
                    <ul aria-label="Reviewed project files">
                      {review.files.map((file) => (
                        <li key={file.path}>
                          {file.path}
                          {file.kind === "directory" ? "/" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>The folder is empty or has no supported entries.</p>
                  )}
                </details>
                {!!review.skipped.length && (
                  <details className="local-open-details">
                    <summary>
                      {review.skipped.length}{" "}
                      {review.skipped.length === 1 ? "entry" : "entries"} left
                      untouched
                    </summary>
                    <ul>
                      {review.skipped.map((entry, i) => (
                        <li key={i}>
                          {entry.path} · {entry.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="modal-intro">
                {review.action === "relink"
                  ? "This is the original folder for a saved Leaf project. Relink it to keep the project’s history and settings."
                  : review.action === "restore"
                    ? "This project is in Trash. Restore its Leaf entry and open the original folder."
                    : "This folder is already linked. Open its existing Leaf project."}
              </p>
            )}
          </section>
        ) : (
          <>
            {!projectId && (
              <div
                role="group"
                aria-label="Open type"
                className="local-open-modes"
              >
                <label>
                  <input
                    type="radio"
                    name="local-open-mode"
                    checked={mode === "folder"}
                    disabled={busy}
                    onChange={() => {
                      setMode("folder");
                      setError("");
                    }}
                  />
                  <FolderOpen size={16} aria-hidden="true" /> Project folder
                </label>
                <label>
                  <input
                    type="radio"
                    name="local-open-mode"
                    checked={mode === "file"}
                    disabled={busy}
                    onChange={() => {
                      setMode("file");
                      setError("");
                    }}
                  />
                  <FileText size={16} aria-hidden="true" /> .tex file
                </label>
              </div>
            )}
            <label className="local-open-field">
              {mode === "file" ? "Absolute file path" : "Absolute folder path"}
              <input
                ref={pathInput}
                value={path}
                onChange={(event) => {
                  setPath(event.target.value);
                  setError("");
                }}
                placeholder={
                  mode === "file"
                    ? "/Users/you/Documents/paper/main.tex"
                    : "/Users/you/Documents/paper"
                }
                disabled={busy}
                aria-describedby={pathHelp}
                aria-invalid={!!error}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
              />
            </label>
            <p className="modal-intro" id={pathHelp}>
              In Finder, select the item and press Option–Command–C to copy its
              path. Paste it here.{" "}
              {mode === "file"
                ? "Leaf reviews the containing folder so included files stay available."
                : "You’ll review the folder’s contents before opening it."}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="local-open-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            disabled={busy}
            onClick={
              review
                ? () => {
                    setReview(undefined);
                    setNeedsRefresh(false);
                    setError("");
                  }
                : onClose
            }
          >
            {review ? "Back" : "Cancel"}
          </button>
          <button
            className="primary"
            type="submit"
            ref={submitButton}
            disabled={busy || !path.trim()}
          >
            {busy && (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            )}
            {busy
              ? opening
                ? "Opening…"
                : "Checking…"
              : opening
                ? opening.action === "open" && opening.file
                  ? "Open file"
                  : actionLabels[opening.action]
                : needsRefresh
                  ? "Refresh review"
                  : "Review folder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
