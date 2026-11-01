import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommentMark } from "../shared/comments";
import { api } from "./api";
export function useCommentMarks(
  projectId: string | undefined,
  path: string | undefined,
  revision: number | undefined,
  source: string,
) {
  const [value, setValue] = useState<{
      project: string;
      path: string;
      marks: CommentMark[];
    } | null>(null),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!projectId || !path) return;
    const n = ++sequence.current,
      marks = await api<CommentMark[]>(
        `/projects/${projectId}/comments/anchors?path=${encodeURIComponent(path)}`,
      );
    if (n !== sequence.current) return;
    setValue((old) =>
      old?.project === projectId &&
      old.path === path &&
      JSON.stringify(old.marks) === JSON.stringify(marks)
        ? old
        : { project: projectId, path, marks },
    );
  }, [projectId, path]);
  useEffect(() => {
    if (!projectId || !path) return;
    void refresh().catch(() => {});
    const timer = setInterval(() => void refresh().catch(() => {}), 3000);
    return () => {
      ++sequence.current;
      clearInterval(timer);
    };
  }, [refresh, revision]);
  const comments = useMemo(
    () => ({
      source,
      marks:
        value && value.project === projectId && value.path === path
          ? value.marks.filter((m) => m.sourceRevision === revision)
          : [],
    }),
    [value, source, projectId, path, revision],
  );
  return { comments, refresh };
}
