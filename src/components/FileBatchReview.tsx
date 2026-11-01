import { useEffect, useRef, useState } from "react";
import { LoaderCircle, FileText, Folder } from "lucide-react";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import type { Project, FileInfo } from "../../shared/types";
import type { BatchResult } from "../../shared/file-batches";
type Review = {
  generation: number;
  paths: string[];
  files: FileInfo[];
  rootIncluded: boolean;
};
export function FileBatchReview({
  project,
  paths,
  kind,
  prepare,
  onChanged,
  onClose,
  onBusy,
}: {
  project: Project;
  paths: string[];
  kind: "trash" | "restore";
  prepare: () => Promise<Project>;
  onChanged: (result: BatchResult) => Promise<void>;
  onClose: () => void;
  onBusy: (value: boolean) => void;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [applying, setApplying] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef(false),
    request = useRef<{
      paths: string[];
      generation: number;
      requestId: string;
    } | null>(null),
    alive = useRef(true);
  async function inspect() {
    setLoading(true);
    setError("");
    setReview(null);
    request.current = null;
    setUncertain(false);
    try {
      await prepare();
      const r = await api<Review>(
        `/projects/${project.id}/files/${kind}/preview`,
        "POST",
        { paths },
      );
      if (alive.current) setReview(r);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void inspect();
    return () => {
      alive.current = false;
    };
  }, []);
  async function apply() {
    if (pending.current || !review) return;
    pending.current = true;
    setApplying(true);
    onBusy(true);
    setError("");
    try {
      request.current ??= {
        paths: review.paths,
        generation: review.generation,
        requestId: crypto.randomUUID(),
      };
      const result = await api<BatchResult>(
        `/projects/${project.id}/files/${kind}`,
        "POST",
        request.current,
      );
      await onChanged(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setReview(null);
        request.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      pending.current = false;
      setApplying(false);
      onBusy(false);
    }
  }
  const count = review?.files.filter((f) => f.kind !== "directory").length ?? 0;
  return (
    <Modal
      title={kind === "trash" ? "Move to Trash" : "Restore files"}
      onClose={onClose}
      dismissible={!applying}
      className="file-batch-modal"
    >
      <p className="modal-intro">
        {kind === "trash"
          ? "These files stay recoverable in Trash and project History."
          : "Restore these files to their original paths. Existing file and folder conflicts will stop the operation."}
      </p>
      {loading ? (
        <p className="file-batch-progress" role="status">
          <LoaderCircle size={15} className="spin" />
          Reviewing selected files…
        </p>
      ) : (
        review && (
          <>
            <p>
              {count} {count === 1 ? "file" : "files"}
              {review.files.some((f) => f.kind === "directory")
                ? " and folders"
                : ""}
            </p>
            {review.rootIncluded && (
              <p className="field-help">
                {kind === "trash"
                  ? "This includes the root document. Compilation will need a valid root after this change."
                  : "This includes the root document."}
              </p>
            )}
            <ul className="file-batch-list file-batch-paths">
              {review.files.map((f) => (
                <li key={f.path}>
                  {f.kind === "directory" ? (
                    <Folder size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span>{f.path}</span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <p className="field-help">
          Retry checks the same saved operation and never applies it twice.
        </p>
      )}
      <div className="form-actions">
        <button disabled={applying} onClick={onClose}>
          Cancel
        </button>
        {!review && !loading && (
          <button onClick={() => void inspect()}>Refresh review</button>
        )}
        <button
          className="primary"
          disabled={loading || applying || !review?.files.length}
          onClick={() => void apply()}
        >
          {applying
            ? "Saving…"
            : uncertain
              ? "Retry same operation"
              : kind === "trash"
                ? "Move to Trash"
                : "Restore selected"}
        </button>
      </div>
    </Modal>
  );
}
