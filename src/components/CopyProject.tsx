import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api";
import {
  copyProjectName,
  type CopyProjectRequest,
} from "../../shared/project-copy";
import type { Project } from "../../shared/types";

export function CopyProject({
  projectId,
  locked,
  openCopy,
  onCreated,
  onClose,
}: {
  projectId: string;
  locked: boolean;
  openCopy: boolean;
  onCreated: (project: Project) => Promise<void>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editedName = useRef(false),
    inFlight = useRef(false),
    requestId = useRef(crypto.randomUUID());
  const nameInput = useRef<HTMLInputElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError("");
    void api<Project>(`/projects/${projectId}/copy-preview`)
      .then((project) => {
        if (stale) return;
        setSource(project);
        if (!editedName.current) setName(copyProjectName(project.name));
        requestId.current = crypto.randomUUID();
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) {
          setLoading(false);
          requestAnimationFrame(() => {
            if (!stale) {
              nameInput.current?.focus();
              if (!editedName.current) nameInput.current?.select();
            }
          });
        }
      });
    return () => {
      stale = true;
    };
  }, [projectId, refresh]);
  const files =
    source?.files.filter(
      (file) => !file.deleted && file.kind !== "directory",
    ) ?? [];
  const bytes = files.reduce((total, file) => total + file.size, 0);
  const rootAvailable = files.some(
    (file) => file.path === source?.root && file.kind === "text",
  );
  const validName =
    !!name.trim() &&
    name.trim().length <= 120 &&
    !/[\u0000-\u001f\u007f]/u.test(name);
  async function copy() {
    if (!source || loading || locked || !validName || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const body: CopyProjectRequest = {
        name: name.trim(),
        generation: source.generation,
        requestId: requestId.current,
      };
      const created = await api<Project>(
        `/projects/${projectId}/copy`,
        "POST",
        body,
      );
      await onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      requestAnimationFrame(() => refreshButton.current?.focus());
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Copy project"
      className="copy-project-modal"
      dismissible={!saving}
      onClose={onClose}
    >
      <p className="modal-intro">
        Copy the saved source and assets into a separate project, with fresh
        history and chats.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void copy();
        }}
      >
        <label className="field-label" htmlFor="copied-project-name">
          Name of copy
        </label>
        <input
          ref={nameInput}
          className="text-input"
          id="copied-project-name"
          value={name}
          maxLength={120}
          disabled={loading || saving}
          required
          onChange={(e) => {
            editedName.current = true;
            setName(e.target.value);
            requestId.current = crypto.randomUUID();
            setError("");
          }}
        />
        {loading ? (
          <p className="field-help" role="status">
            Loading saved project…
          </p>
        ) : (
          source && (
            <dl className="copy-project-summary">
              <dt>Original</dt>
              <dd>{source.name}</dd>
              <dt>Files</dt>
              <dd>
                {files.length.toLocaleString()} ·{" "}
                {bytes < 1024
                  ? `${bytes} B`
                  : bytes < 1024 * 1024
                    ? `${(bytes / 1024).toFixed(1)} KB`
                    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`}
              </dd>
              <dt>Main document</dt>
              <dd>{rootAvailable ? source.root : "Choose after copying"}</dd>
              <dt>Compiler</dt>
              <dd>
                {
                  {
                    pdflatex: "pdfLaTeX",
                    latex: "LaTeX (DVI → PS → PDF)",
                    xelatex: "XeLaTeX",
                    lualatex: "LuaLaTeX",
                  }[source.engine]
                }
              </dd>
            </dl>
          )
        )}
        {error && (
          <p role="alert" className="field-help danger-text">
            {error}
          </p>
        )}
        {locked && (
          <p className="field-help" role="status">
            Finish or stop the active AI request before copying.
          </p>
        )}
        <div className="copy-project-refresh">
          <button
            ref={refreshButton}
            type="button"
            className="subtle"
            disabled={loading || saving}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh saved project
          </button>
        </div>
        <div className="form-actions">
          <button
            className="primary"
            disabled={loading || saving || locked || !source || !validName}
          >
            {saving ? (
              <>
                <LoaderCircle size={15} className="spin" />
                Creating copy…
              </>
            ) : openCopy ? (
              "Copy and open"
            ) : (
              "Create copy"
            )}
          </button>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
