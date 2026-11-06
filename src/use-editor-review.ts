import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorReview } from "../shared/editor-review";
import { api } from "./api";

interface ReviewScope {
  projectId: string;
  path?: string;
  request?: AbortController;
}

export function useEditorReview(
  projectId: string | undefined,
  path: string | undefined,
  revision: number | undefined,
  source: string,
) {
  const active = useRef<ReviewScope | undefined>(undefined);
  const [value, setValue] = useState<{
    projectId: string;
    path?: string;
    data: EditorReview;
  }>();
  const [failure, setFailure] = useState<{
    projectId: string;
    path?: string;
    message: string;
  }>();

  const refresh = useCallback(async () => {
    const scope = active.current;
    if (!scope) return;
    scope.request?.abort();
    const request = new AbortController();
    scope.request = request;
    try {
      const query = scope.path ? `?path=${encodeURIComponent(scope.path)}` : "";
      const data = await api<EditorReview>(
        `/projects/${scope.projectId}/editor-review${query}`,
        "GET",
        undefined,
        {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        },
      );
      if (request.signal.aborted) return;
      setValue((old) =>
        old?.projectId === scope.projectId &&
        old.path === scope.path &&
        JSON.stringify(old.data) === JSON.stringify(data)
          ? old
          : { projectId: scope.projectId, path: scope.path, data },
      );
      setFailure(undefined);
    } catch (error) {
      if (request.signal.aborted) return;
      setFailure({
        projectId: scope.projectId,
        path: scope.path,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      if (scope.request === request) scope.request = undefined;
    }
  }, []);
  const refreshTracking = useCallback(
    () => refresh().catch(() => {}),
    [refresh],
  );
  useEffect(() => {
    if (!projectId) return;
    const scope: ReviewScope = { projectId, path };
    active.current = scope;
    void refreshTracking();
    const timer = setInterval(() => {
      if (!scope.request) void refreshTracking();
    }, 3000);
    return () => {
      active.current = undefined;
      scope.request?.abort();
      clearInterval(timer);
    };
  }, [projectId, path, revision, refreshTracking]);

  const projectData = value?.projectId === projectId ? value?.data : undefined;
  const fileData = value?.path === path ? projectData : undefined;
  const file = fileData?.file;
  const comments = useMemo(
    () => ({
      source,
      marks:
        fileData?.marks.filter((mark) => mark.sourceRevision === revision) ??
        [],
    }),
    [fileData?.marks, source, revision],
  );
  return {
    tracking: {
      status: projectData?.status,
      file:
        file?.path === path && file?.sourceRevision === revision
          ? file
          : undefined,
      error:
        failure?.projectId === projectId && failure?.path === path
          ? (failure?.message ?? "")
          : (fileData?.fileError ?? ""),
      refresh: refreshTracking,
    },
    comments,
    refresh,
  };
}
