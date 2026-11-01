import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { TrackingStatus, TrackingFile } from "../shared/tracking";
export function useTracking(
  projectId?: string,
  path?: string,
  revision?: number,
) {
  const [value, setValue] = useState<{
      project: string;
      status: TrackingStatus;
      file?: TrackingFile;
    }>(),
    [error, setError] = useState(""),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const n = ++sequence.current;
    try {
      const [status, file] = await Promise.all([
        api<TrackingStatus>(`/projects/${projectId}/tracking`),
        path
          ? api<TrackingFile>(
              `/projects/${projectId}/tracking/file?path=${encodeURIComponent(path)}`,
            )
          : Promise.resolve(undefined),
      ]);
      if (n !== sequence.current) return;
      setValue((old) =>
        old?.project === projectId &&
        JSON.stringify(old.status) === JSON.stringify(status) &&
        JSON.stringify(old.file) === JSON.stringify(file)
          ? old
          : { project: projectId, status, file },
      );
      setError("");
    } catch (e) {
      if (n === sequence.current)
        setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, path]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      ++sequence.current;
      clearInterval(timer);
    };
  }, [refresh, revision]);
  return {
    status: value && value.project === projectId ? value.status : undefined,
    file:
      value &&
      value.project === projectId &&
      value.file &&
      value.file.path === path &&
      value.file.sourceRevision === revision
        ? value.file
        : undefined,
    error,
    refresh,
  };
}
