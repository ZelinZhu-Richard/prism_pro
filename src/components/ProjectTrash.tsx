import { useState } from "react";
import { FileText, Folder } from "lucide-react";
import { Modal } from "./Modal";
import { FileBatchReview } from "./FileBatchReview";
import type { Project } from "../../shared/types";
import type { BatchResult } from "../../shared/file-batches";
export function ProjectTrash({
  project,
  locked,
  prepare,
  onChanged,
  onClose,
  onBusy,
}: {
  project: Project;
  locked: boolean;
  prepare: () => Promise<Project>;
  onChanged: (r: BatchResult) => Promise<void>;
  onClose: () => void;
  onBusy: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [restore, setRestore] = useState<string[] | null>(null),
    files = project.files.filter((f) => f.deleted);
  return (
    <Modal title="Trash" onClose={onClose} className="file-batch-modal">
      <p className="modal-intro">
        Deleted files and empty folders stay here until restored. Select several
        to restore them together.
      </p>
      {files.length > 0 ? (
        <>
          <div className="file-batch-summary">
            <button
              disabled={locked}
              onClick={() => setSelected(files.map((f) => f.path))}
            >
              Select all
            </button>
            <button onClick={() => setSelected([])}>Clear</button>
            <span>
              {selected.filter((s) => files.some((f) => f.path === s)).length}{" "}
              selected
            </span>
            <button
              disabled={locked || !selected.length}
              onClick={() => setRestore(selected)}
            >
              Restore selected
            </button>
          </div>
          <div
            className="file-batch-list"
            role="group"
            aria-label="Deleted files"
          >
            {files.map((f) => (
              <div className="file-batch-entry" key={f.path}>
                <input
                  type="checkbox"
                  aria-label={`Select deleted ${f.path}`}
                  checked={selected.includes(f.path)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, f.path]
                        : old.filter((s) => s !== f.path),
                    )
                  }
                />
                {f.kind === "directory" ? (
                  <Folder size={14} />
                ) : (
                  <FileText size={14} />
                )}
                <span>{f.path}</span>
                <button
                  disabled={locked}
                  aria-label={`Restore ${f.path}`}
                  onClick={() => setRestore([f.path])}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="field-help">Nothing in Trash.</p>
      )}
      {restore && (
        <FileBatchReview
          project={project}
          paths={restore}
          kind="restore"
          prepare={prepare}
          onChanged={async (r) => {
            await onChanged(r);
            setSelected([]);
          }}
          onClose={() => setRestore(null)}
          onBusy={onBusy}
        />
      )}
    </Modal>
  );
}
