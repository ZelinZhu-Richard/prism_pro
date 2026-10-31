import { useRef, useState } from "react";
import { FileArchive, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "./Modal";
import { droppedArchives, validateArchiveSelection } from "../import-project";

export function ImportProject({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState("");
  const [error, setError] = useState("");

  async function choose(files: File[]) {
    if (pending.current) return;
    const problem = validateArchiveSelection(files);
    setError(problem || "");
    if (problem) return;
    pending.current = true;
    setImporting(files[0].name);
    try {
      await onImport(files[0]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import failed. Try choosing the ZIP again.",
      );
    } finally {
      pending.current = false;
      setImporting("");
    }
  }

  return (
    <Modal title="Import a project" onClose={onClose} dismissible={!importing}>
      <p className="modal-intro">
        Bring your work from Prism, Overleaf, or another LaTeX editor.
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) void choose(files);
        }}
      />
      <div
        className={"import-dropzone" + (dragging ? " dragging" : "")}
        role="region"
        aria-label="Drop a project ZIP"
        aria-busy={!!importing}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          if (!pending.current) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = pending.current ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (--dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          dragDepth.current = 0;
          setDragging(false);
          void choose(droppedArchives(e));
        }}
      >
        <div className="import-file-icon" aria-hidden="true">
          {importing ? (
            <LoaderCircle size={26} className="spin" />
          ) : (
            <FileArchive size={26} strokeWidth={1.4} />
          )}
        </div>
        <strong>
          {importing
            ? "Importing your project…"
            : dragging
              ? "Drop to import"
              : "Drop your ZIP here"}
        </strong>
        <p role="status">
          {importing || "One project, with all its files and folders."}
        </p>
        <button
          className="primary"
          disabled={!!importing}
          autoFocus
          onClick={() => input.current?.click()}
        >
          <Upload size={14} aria-hidden="true" /> Choose ZIP file
        </button>
        <small>.zip files · up to 100 MB</small>
      </div>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      <p className="import-note">
        Hidden files and system metadata are skipped. You’ll see a list of
        anything left out.
      </p>
    </Modal>
  );
}
