import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { QuickNavigation } from "./QuickNavigation";
import { Modal } from "./Modal";
import {
  SourceNavigationQuery,
  locationItems,
  locationId,
  type NavigationCapture,
  type SourceNavigationView,
} from "../source-navigation";
import type {
  InstalledDefinitionPreview,
  SourceLocation,
  SourceNavigationResult,
} from "../../shared/source-navigation";

export function SourceLocations({
  capture,
  projectName,
  readOnly,
  refreshCapture,
  onSelect,
  onClose,
}: {
  capture: NavigationCapture;
  projectName: string;
  readOnly: boolean;
  refreshCapture: () => NavigationCapture | undefined;
  onSelect: (
    location: SourceLocation,
    capture: NavigationCapture,
    current: () => boolean,
    signal: AbortSignal,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const [view, setView] = useState<SourceNavigationView>({ loading: true }),
    currentCapture = useRef(capture),
    pending = useRef<AbortController | undefined>(undefined),
    controller = useRef<SourceNavigationQuery | null>(null);
  useEffect(() => {
    const query = new SourceNavigationQuery({
      read: (c, signal) =>
        api<SourceNavigationResult>(
          `/projects/${c.projectId}/source-locations`,
          "POST",
          c.request,
          { signal },
        ),
      notify: setView,
    });
    controller.current = query;
    void query.load(capture);
    return () => {
      query.dispose();
      pending.current?.abort(Error("Source navigation was canceled."));
    };
  }, []);
  const symbol =
    (capture.request.kind === "command" ? "\\" : "") + capture.request.name;
  return (
    <QuickNavigation
      mode="locations"
      heading={
        capture.request.mode === "definitions"
          ? "Go to definition"
          : "Find references"
      }
      projectName={`${projectName} · ${capture.request.kind} ${symbol}`}
      description={
        capture.request.mode === "definitions" &&
        ["command", "environment"].includes(capture.request.kind)
          ? "Searches project source, the active draft, and packages recorded by the last successful build. Installed results open read-only."
          : "Matches in local project source, including the active file’s unsaved text."
      }
      readOnly={readOnly}
      items={locationItems(view.result)}
      loading={view.loading}
      loadError={view.error}
      warnings={view.result?.warnings}
      locationMode={capture.request.mode}
      onClose={onClose}
      onRefresh={() => {
        const fresh = refreshCapture();
        if (fresh) {
          currentCapture.current = fresh;
          void controller.current!.load(fresh);
        }
      }}
      onSelect={async (id, current) => {
        const location = view.result?.locations.find(
          (l) => locationId(l) === id,
        );
        if (!location || view.loading || view.error) return false;
        const abort = new AbortController();
        pending.current = abort;
        try {
          return await onSelect(
            location,
            currentCapture.current,
            current,
            abort.signal,
          );
        } finally {
          if (pending.current === abort) pending.current = undefined;
        }
      }}
    />
  );
}

export function InstalledDefinition({
  source,
  onClose,
}: {
  source: InstalledDefinitionPreview;
  onClose: () => void;
}) {
  return (
    <Modal title="Installed TeX definition" onClose={onClose} wide>
      <p className="quick-navigation-context">
        {source.runtime} ·{" "}
        {source.origin === "personal" ? "Personal TeX snapshot · " : ""}
        Read-only excerpt
      </p>
      <p className="installed-definition-location">
        <code>
          {source.path}:{source.line}
        </code>
      </p>
      <pre
        className="installed-definition-source"
        role="region"
        aria-label="Read-only TeX source"
        tabIndex={0}
      >
        <code>
          {source.before}
          <mark>{source.symbol}</mark>
          {source.after}
        </code>
      </pre>
    </Modal>
  );
}
