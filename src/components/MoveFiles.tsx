import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  FolderInput,
  LoaderCircle,
} from "lucide-react";
import { api } from "../api";
import { Modal } from "./Modal";
import type { Project } from "../../shared/types";
import {
  projectFolders,
  coversPath,
  type MovePreview,
  type MoveResult,
} from "../../shared/file-moves";

export function MoveFiles({
  projectId,
  paths,
  initialDestination,
  rename = false,
  prepare,
  onMoved,
  onClose,
  onBusy,
}: {
  projectId: string;
  paths: string[];
  initialDestination?: string;
  rename?: boolean;
  prepare: () => Promise<Project>;
  onMoved: (result: MoveResult, before: Project) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [project, setProject] = useState<Project | null>(null),
    [destination, setDestination] = useState<string | null>(
      initialDestination ?? null,
    );
  const [name, setName] = useState(paths[0] ?? ""),
    [updateReferences, setUpdateReferences] = useState(true);
  const [preview, setPreview] = useState<MovePreview | null>(null),
    [loading, setLoading] = useState(true),
    [applying, setApplying] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0),
    requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true),
    refreshId = useRef(0);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const referenceCount =
    preview?.references?.files.reduce((sum, file) => sum + file.changes, 0) ??
    0;
  async function refresh() {
    const current = ++refreshId.current;
    revision.current++;
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const latest = await prepareRef.current();
      if (latest.id !== projectId)
        throw new Error("The project changed. Reopen this dialog.");
      if (mounted.current && current === refreshId.current) setProject(latest);
    } catch (e) {
      if (mounted.current && current === refreshId.current)
        setError((e as Error).message);
    } finally {
      if (mounted.current && current === refreshId.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, []);
  useEffect(() => {
    if (!project || (!rename && destination === null)) return;
    const current = ++revision.current;
    setLoading(true);
    setPreview(null);
    setError("");
    requestId.current = crypto.randomUUID();
    const timer = setTimeout(
      () =>
        void api<MovePreview>(
          `/projects/${projectId}/file-moves/${rename ? "rename/" : ""}preview`,
          "POST",
          rename ? { from: paths[0], to: name } : { paths, destination },
        )
          .then((result) => {
            if (current !== revision.current) return;
            if (result.generation !== project.generation)
              throw new Error(
                "The project changed. Refresh the preview before moving files.",
              );
            setPreview(result);
          })
          .catch((e) => {
            if (current === revision.current) setError(e.message);
          })
          .finally(() => {
            if (current === revision.current) setLoading(false);
          }),
      200,
    );
    return () => {
      clearTimeout(timer);
      revision.current++;
    };
  }, [project, destination, name]);
  async function move() {
    if (!preview || !project || loading || applying) return;
    setApplying(true);
    setError("");
    onBusy(true);
    try {
      const result = await api<MoveResult>(
        `/projects/${projectId}/file-moves${rename ? "/rename" : ""}`,
        "POST",
        {
          ...(rename ? { from: paths[0], to: name } : { paths, destination }),
          generation: preview.generation,
          requestId: requestId.current,
          updateReferences:
            !!preview.references &&
            !preview.references.unavailable &&
            updateReferences,
          referenceToken: preview.references?.token,
        },
      );
      await onMoved(result, project);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title={
        rename
          ? "Rename item"
          : `Move ${paths.length === 1 ? "item" : paths.length + " items"}`
      }
      onClose={onClose}
      dismissible={!applying}
      className="move-files-dialog"
      wide={!!preview?.references?.files.length}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void move();
        }}
      >
        <p className="modal-intro">
          {rename
            ? "Choose a name and review its references."
            : "Choose a folder and review the new locations."}{" "}
          Open tabs and the main document follow the change.
        </p>
        {rename ? (
          <label className="field-label">
            New name
            <input
              className="text-input"
              autoFocus
              value={name}
              disabled={applying}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : (
          <label className="field-label">
            Destination folder
            <select
              className="text-input"
              value={destination ?? "__choose__"}
              disabled={!project || applying}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="__choose__" disabled>
                Choose a destination…
              </option>
              <option value="">Project root</option>
              {projectFolders(project?.files ?? [])
                .filter(
                  (folder) => !paths.some((name) => coversPath(name, folder)),
                )
                .map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="move-file-list" aria-label="New file locations">
          {(preview?.moves ?? paths.map((from) => ({ from, to: "" }))).map(
            (move) => (
              <div key={move.from}>
                <span title={move.from}>{move.from}</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span title={move.to}>{move.to || "Choose a folder"}</span>
              </div>
            ),
          )}
        </div>
        {preview && (
          <p className="field-help">
            {preview.entries.filter((e) => e.kind !== "directory").length}{" "}
            {preview.entries.filter((e) => e.kind !== "directory").length === 1
              ? "file"
              : "files"}{" "}
            ·{" "}
            {preview.rootBefore !== preview.rootAfter
              ? `Main document becomes ${preview.rootAfter}. `
              : ""}
            {preview.references?.unavailable ||
              (!preview.references
                ? "Restart Leaf to enable reference review. File references will stay unchanged."
                : "Review supported reference changes below. Custom commands and package-specific paths may need manual adjustment.")}
          </p>
        )}
        {!!preview?.references?.files.length && (
          <section className="reference-review" aria-label="Reference changes">
            <label className="reference-update-toggle">
              <input
                type="checkbox"
                checked={updateReferences && !preview.references.unavailable}
                disabled={applying || !!preview.references.unavailable}
                onChange={(e) => {
                  setUpdateReferences(e.target.checked);
                  requestId.current = crypto.randomUUID();
                }}
              />
              Update supported file references
            </label>
            <p className="field-help">
              {referenceCount}{" "}
              {referenceCount === 1 ? "replacement" : "replacements"} in{" "}
              {preview.references.files.length}{" "}
              {preview.references.files.length === 1 ? "file" : "files"}.{" "}
              {updateReferences && !preview.references.unavailable
                ? "All shown edits will be applied with this operation. Undo restores the locations and reference text together."
                : "The proposed edits will not be applied."}
            </p>
            <div className="reference-diffs">
              {preview.references.files.map((file, index) => (
                <details key={file.path} open={index === 0}>
                  <summary>
                    <ChevronRight size={14} aria-hidden="true" />
                    {file.path}
                    {file.toPath !== file.path ? ` → ${file.toPath}` : ""}
                    <span>
                      {file.changes} {file.changes === 1 ? "change" : "changes"}
                    </span>
                  </summary>
                  <pre
                    tabIndex={0}
                    aria-label={`Reference diff for ${file.path}`}
                  >
                    {file.diff}
                  </pre>
                </details>
              ))}
            </div>
          </section>
        )}
        {preview?.references &&
          !preview.references.files.length &&
          !preview.references.unavailable && (
            <p className="field-help">
              No supported file references need updates.
            </p>
          )}
        {!!preview?.references?.warnings.length && (
          <details className="reference-warnings">
            <summary>
              Needs manual review ({preview.references.warnings.length})
            </summary>
            <ul>
              {preview.references.warnings.map((warning, index) => (
                <li key={index}>
                  {warning.path}
                  {warning.line ? `:${warning.line}` : ""} {warning.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {loading && (
          <p className="field-help" role="status">
            Preparing file locations…
          </p>
        )}
        {error && (
          <p className="inline-message" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="primary"
            type="submit"
            disabled={!preview || loading || applying}
          >
            {applying ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <FolderInput size={15} />
            )}{" "}
            {applying
              ? rename
                ? "Renaming…"
                : "Moving…"
              : (rename ? "Rename" : "Move files") +
                (preview?.references?.files.length &&
                updateReferences &&
                !preview.references.unavailable
                  ? " and update references"
                  : "")}
          </button>
          <button
            type="button"
            disabled={loading || applying}
            onClick={() => void refresh()}
          >
            Refresh preview
          </button>
          <button type="button" disabled={applying} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
