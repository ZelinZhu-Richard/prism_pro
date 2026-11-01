import { useEffect, useRef, useState } from "react";
import { ArrowRight, FolderInput, LoaderCircle } from "lucide-react";
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
  prepare,
  onMoved,
  onClose,
  onBusy,
}: {
  projectId: string;
  paths: string[];
  initialDestination?: string;
  prepare: () => Promise<Project>;
  onMoved: (result: MoveResult, before: Project) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [project, setProject] = useState<Project | null>(null),
    [destination, setDestination] = useState<string | null>(
      initialDestination ?? null,
    );
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
    if (!project || destination === null) return;
    const current = ++revision.current;
    setLoading(true);
    setPreview(null);
    setError("");
    requestId.current = crypto.randomUUID();
    void api<MovePreview>(`/projects/${projectId}/file-moves/preview`, "POST", {
      paths,
      destination,
    })
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
      });
  }, [project, destination]);
  async function move() {
    if (!preview || !project) return;
    setApplying(true);
    setError("");
    onBusy(true);
    try {
      const result = await api<MoveResult>(
        `/projects/${projectId}/file-moves`,
        "POST",
        {
          paths,
          destination,
          generation: preview.generation,
          requestId: requestId.current,
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
      title={`Move ${paths.length === 1 ? "item" : paths.length + " items"}`}
      onClose={onClose}
      dismissible={!applying}
      className="move-files-dialog"
    >
      <p className="modal-intro">
        Choose a folder and review the new locations. Open tabs and the main
        document follow the move.
      </p>
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
            .filter((folder) => !paths.some((name) => coversPath(name, folder)))
            .map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
        </select>
      </label>
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
          LaTeX reference text stays unchanged. Adjust file references if
          needed.
        </p>
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
          disabled={!preview || loading || applying}
          onClick={() => void move()}
        >
          {applying ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <FolderInput size={15} />
          )}{" "}
          {applying ? "Moving…" : "Move files"}
        </button>
        <button disabled={loading || applying} onClick={() => void refresh()}>
          Refresh preview
        </button>
        <button disabled={applying} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
