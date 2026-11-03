import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, LayoutPanelLeft } from "lucide-react";
import {
  defaultWorkspaceLayout,
  workspacePreset,
  type WorkspaceLayout,
  type WorkspacePreset,
} from "../../shared/workspace-layout";
import type { LayoutView } from "../workspace-layout";
import "./workspace-layout.css";
export function WorkspaceLayoutMenu({
  view,
  onChange,
  onRetry,
  onFocusSource,
}: {
  view: LayoutView;
  onChange: (patch: Partial<WorkspaceLayout>) => void;
  onRetry: (useSaved?: boolean) => void;
  onFocusSource: () => void;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    first = useRef<HTMLInputElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [open]);
  function apply(preset: WorkspacePreset) {
    onChange(workspacePreset(view.value, preset));
    setOpen(false);
    requestAnimationFrame(onFocusSource);
  }
  return (
    <div
      className="workspace-layout-control"
      ref={root}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="layout-trigger"
        aria-label="Workspace layout"
        title={
          view.phase === "error"
            ? "Layout not saved · open to retry"
            : "Workspace layout"
        }
        aria-describedby={id + "-status"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <LayoutPanelLeft size={16} />
        <span>Layout</span>
        {view.phase === "error" && (
          <CircleAlert
            size={14}
            className="layout-unsaved-icon"
            aria-hidden="true"
          />
        )}
      </button>
      <span
        id={id + "-status"}
        className="layout-status-announcement"
        role="status"
      >
        {view.phase === "error"
          ? "Layout not saved. Open Layout to retry."
          : ""}
      </span>
      {open && (
        <section
          id={id}
          className="workspace-layout-menu"
          aria-label="Workspace layout settings"
        >
          <fieldset disabled={!view.ready}>
            <legend>Panels</legend>
            {(
              [
                ["sidebar", "Files and outline"],
                ["assistant", "AI assistant"],
                ["preview", "PDF and logs"],
              ] as const
            ).map(([key, label], i) => (
              <label key={key}>
                <input
                  ref={i === 0 ? first : undefined}
                  type="checkbox"
                  checked={view.value[key]}
                  onChange={(e) => onChange({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset disabled={!view.ready}>
            <legend>Layouts</legend>
            {(
              [
                ["full", "Full workspace"],
                ["write", "Write"],
                ["source-pdf", "Source and PDF"],
              ] as const
            ).map(([preset, label]) => {
              const candidate = workspacePreset(view.value, preset);
              return (
                <button
                  key={preset}
                  aria-pressed={
                    candidate.sidebar === view.value.sidebar &&
                    candidate.assistant === view.value.assistant &&
                    candidate.preview === view.value.preview
                  }
                  onClick={() => apply(preset)}
                >
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => {
                onChange({ ...defaultWorkspaceLayout });
                setOpen(false);
                requestAnimationFrame(onFocusSource);
              }}
            >
              Reset workspace
            </button>
          </fieldset>
          <p
            className={
              view.phase === "error"
                ? "layout-save-error"
                : "layout-save-status"
            }
            role={view.phase === "error" ? "alert" : "status"}
          >
            {!view.ready
              ? "Loading view settings…"
              : (view.error ??
                (view.phase === "saved"
                  ? "Layout saved locally"
                  : view.phase === "saving"
                    ? "Saving layout…"
                    : "Layout changes pending…"))}
          </p>
          {view.phase === "error" && (
            <div className="layout-save-actions">
              <button
                onClick={() => {
                  first.current?.focus();
                  onRetry();
                }}
              >
                Retry saving this layout
              </button>
              <button
                onClick={() => {
                  first.current?.focus();
                  onRetry(true);
                }}
              >
                Load saved layout
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
