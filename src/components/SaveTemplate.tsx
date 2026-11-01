import "./templates.css";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import type { Project } from "../../shared/types";
import type {
  TemplateCapture,
  TemplateDetail,
  TemplateResult,
} from "../../shared/templates";
export function SaveTemplate({
  project,
  locked,
  onClose,
  onSaved,
}: {
  project: Project;
  locked: boolean;
  onClose: () => void;
  onSaved: (template: TemplateDetail) => void;
}) {
  const [preview, setPreview] = useState<TemplateCapture>(),
    [name, setName] = useState(project.name),
    [description, setDescription] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Record<string, unknown>>(),
    [page, setPage] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError("");
    setPreview(undefined);
    setPage(0);
    void api<TemplateCapture>(`/projects/${project.id}/template-preview`)
      .then((v) => {
        if (!stale) setPreview(v);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [project.id, refresh]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function save(request: Record<string, unknown>) {
    if (locked || working) return;
    setWorking(true);
    setPending(request);
    setError("");
    try {
      const result = await api<TemplateResult>(
        `/projects/${project.id}/templates`,
        "POST",
        request,
      );
      setPending(undefined);
      onSaved(result.template);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof ApiError && e.status < 500) setPending(undefined);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal
      title="Save as template"
      wide
      className="save-template-modal"
      onClose={onClose}
      dismissible={!working}
    >
      <p className="modal-intro">
        Save an independent snapshot of {preview?.projectName ?? project.name}.
        It stays on this computer and remains usable after the original project
        changes or moves to Trash.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (preview && name.trim() && !pending)
            void save({
              id: crypto.randomUUID(),
              name,
              description,
              expectedGeneration: preview.generation,
              hash: preview.hash,
            });
        }}
      >
        <div className="save-template-body">
          <label>
            Template name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={working || !!pending || locked}
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              disabled={working || !!pending || locked}
            />
          </label>
          {error && (
            <p
              role="alert"
              className="template-error"
              tabIndex={-1}
              ref={errorRef}
            >
              {error}
            </p>
          )}
          {pending && !working && (
            <div className="template-retry">
              <p>
                The save may already have completed. Retry the same request to
                recover it without creating another template.
              </p>
              <button
                type="button"
                disabled={locked}
                onClick={() => void save(pending)}
              >
                Retry save template
              </button>
            </div>
          )}
          <div className="template-snapshot-heading">
            <strong>Source snapshot</strong>
            <button
              type="button"
              disabled={loading || working || !!pending}
              onClick={() => setRefresh((n) => n + 1)}
            >
              Refresh snapshot
            </button>
          </div>
          {loading ? (
            <p role="status">Reading saved project files…</p>
          ) : (
            preview && (
              <>
                <p className="field-help">
                  Includes all{" "}
                  {preview.entries.filter((f) => f.kind !== "directory").length}{" "}
                  active files and empty folders ·{" "}
                  {Math.max(
                    1,
                    Math.ceil(preview.bytes / 1024),
                  ).toLocaleString()}{" "}
                  KiB. Main: {preview.root || "not selected"} · {preview.engine}
                  .
                </p>
                <ul
                  className="template-snapshot-files"
                  aria-label="Files included in template"
                >
                  {preview.entries
                    .slice(page * 100, (page + 1) * 100)
                    .map((f) => (
                      <li key={f.path}>
                        <span>
                          {f.path}
                          {f.kind === "directory" ? "/" : ""}
                        </span>
                        <small>
                          {f.kind === "directory"
                            ? "Folder"
                            : f.kind === "binary"
                              ? "Asset"
                              : "Source"}{" "}
                          · {f.size.toLocaleString()} bytes
                        </small>
                      </li>
                    ))}
                </ul>
                {preview.entries.length > 100 && (
                  <nav aria-label="Template snapshot pages">
                    <button
                      type="button"
                      disabled={!page}
                      onClick={() => setPage((n) => n - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {page * 100 + 1}–
                      {Math.min((page + 1) * 100, preview.entries.length)} of{" "}
                      {preview.entries.length}
                    </span>
                    <button
                      type="button"
                      disabled={(page + 1) * 100 >= preview.entries.length}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )
          )}
          <p className="field-help">
            Current text and supporting assets are preserved. File Trash,
            compiled output, chats, comments, review marks, history and
            credentials stay with the original project. Imported scripts are
            preserved as files and are not run.
          </p>
          {locked && (
            <p role="status" className="field-help">
              Read-only while an AI request or file operation owns the source.
              You can inspect this snapshot.
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            className="primary"
            disabled={
              working ||
              loading ||
              !preview ||
              !name.trim() ||
              !!pending ||
              locked
            }
          >
            {working ? "Saving template…" : "Save template"}
          </button>
          <button type="button" disabled={working} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
