import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { LayoutSession, type LayoutView } from "./workspace-layout";
import type {
  SavedWorkspaceLayout,
  WorkspaceLayout,
} from "../shared/workspace-layout";
export function useWorkspaceLayout(initial: unknown, ready: boolean) {
  const controller = useRef<LayoutSession | null>(null),
    [view, setView] = useState<LayoutView>();
  if (!controller.current)
    controller.current = new LayoutSession({
      read: (signal) =>
        api<SavedWorkspaceLayout>("/settings/layout", "GET", undefined, {
          signal,
        }),
      save: (value, signal) =>
        api<SavedWorkspaceLayout>("/settings/layout", "PUT", value, {
          signal,
          keepalive: true,
        }),
      notify: setView,
    });
  useEffect(() => {
    if (ready) controller.current!.load(initial);
  }, [ready]);
  useEffect(() => {
    const flush = () => void controller.current!.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      controller.current!.dispose();
    };
  }, []);
  return {
    latest: () => controller.current!.view.value,
    view: view ?? controller.current.view,
    edit: (patch: Partial<WorkspaceLayout>) => controller.current!.edit(patch),
    retry: (useSaved = false) => void controller.current!.retry(useSaved),
  };
}
