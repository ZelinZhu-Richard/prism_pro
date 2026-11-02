import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { DiskMonitor, type DiskMonitorView } from "./disk-status";
import type { DiskStatus } from "../shared/disk-status";

export function useDiskStatus(projectId?: string, generation = 0) {
  const monitor = useRef<DiskMonitor | null>(null),
    [observed, setObserved] = useState<{
      projectId?: string;
      view: DiskMonitorView;
    }>({ view: {} }),
    currentGeneration = useRef(generation);
  currentGeneration.current = generation;
  useEffect(() => {
    setObserved({ projectId, view: {} });
    if (!projectId) return;
    const controller = new DiskMonitor(projectId, currentGeneration.current, {
      read: (signal) =>
        api<DiskStatus>(
          `/projects/${projectId}/disk/status`,
          "GET",
          undefined,
          { signal },
        ),
      notify: (view) => setObserved({ projectId, view }),
    });
    monitor.current = controller;
    const refresh = () => {
      if (document.visibilityState !== "hidden") void controller.check(true);
      else controller.pause();
    };
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void controller.check();
    }, 5000);
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.dispose();
      monitor.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [projectId]);
  useEffect(() => {
    monitor.current?.updateGeneration(generation);
    if (document.visibilityState !== "hidden")
      void monitor.current?.check(true);
  }, [projectId, generation]);
  const view = observed.projectId === projectId ? observed.view : {};
  return {
    status: view.status?.projectId === projectId ? view.status : undefined,
    error: view.error,
    checking: view.checking,
    retry: () => void monitor.current?.check(true),
    resolved: (path: string) => monitor.current?.resolved(path),
  };
}
