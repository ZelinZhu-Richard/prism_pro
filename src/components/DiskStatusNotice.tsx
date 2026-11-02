import type { DiskChange } from "../../shared/disk-status";
import "./disk-status.css";
export function DiskStatusNotice({
  changes,
  activePath,
  error,
  checking,
  onReview,
  onCheck,
  onRetry,
}: {
  changes: DiskChange[];
  activePath: string;
  error?: string;
  checking?: boolean;
  onReview: () => void;
  onCheck: () => void;
  onRetry: () => void;
}) {
  if (!changes.length && !error) return null;
  const active = changes.find((c) => c.path === activePath);
  return (
    <div
      className="source-notice disk-status-notice"
      role="status"
      aria-label="Live disk changes"
    >
      <p>
        {changes.length
          ? `${changes.length} project ${changes.length === 1 ? "file needs" : "files need"} disk review. Your editor text is kept.`
          : "Live disk checks are unavailable. Your editor text is kept."}
      </p>
      {error && <p>{error}</p>}
      {active && active.change !== "unsafe" && (
        <button onClick={onReview}>Review {active.path}</button>
      )}
      <button onClick={onCheck}>Check disk files</button>
      {error && (
        <button disabled={checking} onClick={onRetry}>
          {checking ? "Checking disk files…" : "Retry disk check"}
        </button>
      )}
    </div>
  );
}
