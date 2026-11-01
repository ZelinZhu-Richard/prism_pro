import { useEffect, useRef, useState } from "react";
import { Upload, Folder, LoaderCircle, Check } from "lucide-react";
import { Modal } from "./Modal";
import { api, ApiError } from "../api";
import {
  selectedUploads,
  droppedUploads,
  sendUpload,
  type LocalUpload,
} from "../upload-files";
import { projectFolders } from "../../shared/file-moves";
import type { Project } from "../../shared/types";
import type { UploadReview, BatchResult } from "../../shared/file-batches";

export function UploadFiles({
  project,
  initialDestination,
  prepare,
  onChanged,
  onClose,
  onBusy,
  initialFiles,
}: {
  project: Project;
  initialDestination: string;
  prepare: () => Promise<Project>;
  onChanged: (result: BatchResult) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  initialFiles?: File[];
}) {
  const picker = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement | null>(null),
    pending = useRef(false);
  const [files, setFiles] = useState<LocalUpload[]>([]),
    [skipped, setSkipped] = useState<{ path: string; reason: string }[]>([]),
    [destination, setDestination] = useState(initialDestination),
    [review, setReview] = useState<UploadReview | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [error, setError] = useState(""),
    [phase, setPhase] = useState(""),
    [progress, setProgress] = useState(0),
    [dragging, setDragging] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const retry = useRef<{ id: string; form: FormData } | null>(null);
  async function inspect(local: LocalUpload[], to: string) {
    const latest = await prepare();
    const r = await api<UploadReview>(
      `/projects/${project.id}/uploads/preview`,
      "POST",
      { destination: to, entries: local.map(({ file, ...e }) => e) },
    );
    setReview(r);
    setSelected(
      r.entries.filter((e) => e.status === "add").map((e) => e.index),
    );
    return latest;
  }
  async function choose(
    source: () => Promise<ReturnType<typeof selectedUploads>>,
  ) {
    if (pending.current) return;
    pending.current = true;
    setPhase("Inspecting files…");
    setError("");
    setReview(null);
    setSelected([]);
    setFiles([]);
    setSkipped([]);
    retry.current = null;
    setUncertain(false);
    try {
      const result = await source();
      setFiles(result.files);
      setSkipped(result.skipped);
      setReview(null);
      if (result.files.length) await inspect(result.files, destination);
      else
        setError(
          "No uploadable files were selected. Hidden files and system metadata are skipped.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setPhase("");
    }
  }
  useEffect(() => {
    if (initialFiles?.length)
      void choose(async () => selectedUploads(initialFiles));
  }, []);
  async function changeDestination(to: string) {
    setDestination(to);
    setReview(null);
    setSelected([]);
    setError("");
    retry.current = null;
    if (!files.length) return;
    pending.current = true;
    setPhase("Reviewing destination…");
    try {
      await inspect(files, to);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setPhase("");
    }
  }
  async function apply() {
    if (pending.current || !review || !selected.length) return;
    pending.current = true;
    onBusy(true);
    setPhase("Uploading files…");
    setProgress(0);
    setError("");
    try {
      if (!retry.current) {
        await prepare();
        const id = crypto.randomUUID(),
          form = new FormData();
        form.append(
          "request",
          JSON.stringify({
            token: review.token,
            indices: selected,
            requestId: id,
          }),
        );
        for (const i of selected)
          if (files[i].file)
            form.append("file-" + i, files[i].file!, files[i].file!.name);
        retry.current = { id, form };
      }
      const result = await sendUpload(
        `/projects/${project.id}/uploads`,
        retry.current.form,
        setProgress,
      );
      await onChanged(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        retry.current = null;
        setUncertain(false);
        setReview(null);
      } else setUncertain(true);
    } finally {
      pending.current = false;
      setPhase("");
      onBusy(false);
    }
  }
  return (
    <Modal
      title={initialFiles ? "Upload clipboard image" : "Upload files"}
      onClose={onClose}
      dismissible={!phase}
      className="file-batch-modal"
    >
      <p className="modal-intro">
        {initialFiles
          ? "Review the image destination and any replacement before saving it to this project."
          : "Add files or a folder to this project. Review destination paths before uploading."}
      </p>
      <label className="field-label">
        Destination
        <select
          className="text-input"
          aria-label="Upload destination"
          value={destination}
          disabled={!!phase || uncertain}
          onChange={(e) => void changeDestination(e.target.value)}
        >
          <option value="">Project root</option>
          {projectFolders(project.files).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <input
        hidden
        ref={picker}
        multiple
        type="file"
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          e.target.value = "";
          if (selected.length)
            void choose(async () => selectedUploads(selected));
        }}
      />
      <input
        hidden
        ref={(node) => {
          folder.current = node;
          node?.setAttribute("webkitdirectory", "");
        }}
        multiple
        type="file"
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          e.target.value = "";
          if (selected.length)
            void choose(async () => selectedUploads(selected));
        }}
      />
      {!initialFiles && (
        <div
          className={"file-upload-drop" + (dragging ? " dragging" : "")}
          role="region"
          aria-label="Drop files or a folder"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = phase || uncertain ? "none" : "copy";
            if (!phase && !uncertain) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!phase && !uncertain) {
              const transfer = e.dataTransfer;
              void choose(() => droppedUploads(transfer));
            }
          }}
        >
          <Upload size={22} />
          <span>
            {dragging ? "Drop to review" : "Drop files or a folder here"}
          </span>
          <div>
            <button
              disabled={!!phase || uncertain}
              onClick={() => picker.current?.click()}
            >
              Choose files
            </button>
            <button
              disabled={!!phase || uncertain}
              onClick={() => folder.current?.click()}
            >
              <Folder size={14} />
              Choose folder
            </button>
          </div>
          <small>Up to 180 files · 50 MB · nested paths preserved</small>
        </div>
      )}
      {review && (
        <>
          <div className="file-batch-summary">
            <span>
              {selected.length} selected ·{" "}
              {(() => {
                const bytes = review.entries
                  .filter((e) => selected.includes(e.index))
                  .reduce((n, e) => n + e.size, 0);
                return bytes < 1024
                  ? `${bytes} B`
                  : `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
              })()}
            </span>
            <button
              disabled={!!phase || uncertain}
              onClick={() =>
                setSelected(
                  review.entries
                    .filter((e) => e.status === "add")
                    .map((e) => e.index),
                )
              }
            >
              Select new files
            </button>
          </div>
          <div
            className="file-batch-list"
            role="group"
            aria-label="Upload review"
          >
            {review.entries.map((e) => (
              <label key={e.index} className="file-batch-entry">
                <input
                  type="checkbox"
                  aria-label={`${e.status === "replace" ? "Replace" : "Upload"} ${e.target}`}
                  checked={selected.includes(e.index)}
                  disabled={
                    !!phase ||
                    uncertain ||
                    e.status === "blocked" ||
                    e.status === "merge"
                  }
                  onChange={(event) => {
                    retry.current = null;
                    setSelected((old) =>
                      event.target.checked
                        ? [...old, e.index]
                        : old.filter((i) => i !== e.index),
                    );
                  }}
                />
                <span>
                  <strong>{e.target}</strong>
                  <small>
                    {e.reason ||
                      (e.status === "replace"
                        ? "Replace existing file · previous version stays in History"
                        : e.status === "merge"
                          ? "Folder already exists · contents can be added"
                          : e.directory
                            ? "New empty folder"
                            : "New file")}
                  </small>
                </span>
                {selected.includes(e.index) && (
                  <Check size={13} aria-hidden="true" />
                )}
              </label>
            ))}
          </div>
        </>
      )}
      {!!skipped.length && (
        <details className="file-batch-skipped">
          <summary>
            {skipped.length} skipped{" "}
            {skipped.length === 1 ? "entry" : "entries"}
          </summary>
          <ul>
            {skipped.map((e, i) => (
              <li key={i}>
                {e.path} — {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {phase && (
        <div className="file-batch-progress" role="status">
          <LoaderCircle size={15} className="spin" />
          {phase === "Uploading files…"
            ? progress === 100
              ? "Saving files…"
              : `Uploading files… ${progress}%`
            : phase}
        </div>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {!review && files.length > 0 && !phase && !uncertain && (
        <button onClick={() => void changeDestination(destination)}>
          Refresh review
        </button>
      )}
      {uncertain && (
        <p className="field-help">
          Retry uses the same request so saved files are not applied twice.
          Close and reopen the dialog to choose a different upload.
        </p>
      )}
      <div className="form-actions">
        <button disabled={!!phase} onClick={onClose}>
          {uncertain ? "Close" : "Cancel"}
        </button>
        <button
          className="primary"
          disabled={!!phase || !review || !selected.length}
          onClick={() => void apply()}
        >
          {uncertain
            ? "Retry same upload"
            : `Upload ${selected.length || ""} ${selected.length === 1 ? "entry" : "entries"}`}
        </button>
      </div>
    </Modal>
  );
}
