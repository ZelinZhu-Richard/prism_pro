import { ChangeSet } from "@codemirror/state";
import { diffChars } from "diff";
export type CommentState = "open" | "resolved" | "trash";
export interface CommentAnchor {
  from: number;
  to: number;
  quote: string;
  status: "attached" | "changed" | "removed";
  contextBefore?: string;
  contextAfter?: string;
}
export interface CommentMessage {
  id: string;
  body: string;
  created: string;
  updated: string;
  deleted: boolean;
}
export interface CommentInfo {
  id: string;
  projectId: string;
  path: string;
  revision: number;
  created: string;
  updated: string;
  resolved: boolean;
  deleted: boolean;
  anchor: CommentAnchor;
  sourceRevision: number | null;
  unavailable: boolean;
  excerpt: string;
  messages: number;
}
export interface CommentMark {
  id: string;
  revision: number;
  from: number;
  to: number;
  status: CommentAnchor["status"];
  sourceRevision: number | null;
  unavailable: boolean;
}
export interface CommentThread extends CommentInfo {
  replies: CommentMessage[];
}
export interface CommentPage {
  items: CommentInfo[];
  total: number;
  nextOffset?: number;
}
export function commentChanges(before: string, after: string) {
  if (before === after) return ChangeSet.empty(before.length);
  // Trim unchanged edges before bounded diff work. The fallback remains exact,
  // but deliberately treats a very large rewrite as one changed passage.
  let from = 0,
    end = 0;
  while (
    from < Math.min(before.length, after.length) &&
    before[from] === after[from]
  )
    from++;
  while (
    end < Math.min(before.length, after.length) - from &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  const old = before.slice(from, before.length - end),
    next = after.slice(from, after.length - end);
  const parts = diffChars(old, next, { timeout: 30, maxEditLength: 10000 });
  if (!parts)
    return ChangeSet.of(
      { from, to: before.length - end, insert: next },
      before.length,
    );
  const changes: { from: number; to: number; insert: string }[] = [];
  let at = from;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      at += part.value.length;
      continue;
    }
    const start = at;
    let insert = "";
    while (i < parts.length && (parts[i].added || parts[i].removed)) {
      if (parts[i].removed) at += parts[i].value.length;
      else insert += parts[i].value;
      i++;
    }
    i--;
    changes.push({ from: start, to: at, insert });
  }
  return ChangeSet.of(changes, before.length);
}
export function captureCommentAnchor(
  source: string,
  from: number,
  to: number,
): CommentAnchor {
  return {
    from,
    to,
    quote: source.slice(from, to),
    status: "attached",
    contextBefore: source.slice(Math.max(0, from - 64), from),
    contextAfter: source.slice(to, to + 64),
  };
}
export function mapCommentAnchor(
  anchor: CommentAnchor,
  changes: ChangeSet,
  after: string,
): CommentAnchor {
  const a = changes.mapPos(anchor.from, anchor.status === "attached" ? 1 : -1),
    b = changes.mapPos(anchor.to, anchor.status === "attached" ? -1 : 1);
  let from = Math.min(a, b),
    to = Math.max(a, b);
  // Text-only snapshots can align repeated spaces to either side of a typing
  // insertion. Recover an exact original quote only in its mapped vicinity,
  // with the last attached neighbors when available, and never on ambiguity.
  if (after.slice(from, to) !== anchor.quote && anchor.quote) {
    const candidates = new Set<number>(),
      radius = anchor.quote.length + 64;
    let exhausted = false;
    for (const point of [from, to]) {
      const lo = Math.max(0, point - radius),
        hi = Math.min(after.length, point + radius),
        window = after.slice(lo, hi);
      let at = window.indexOf(anchor.quote),
        examined = 0;
      while (at >= 0 && examined++ < 100) {
        const start = lo + at,
          end = start + anchor.quote.length;
        const matchesBefore =
          anchor.contextBefore === undefined ||
          (anchor.contextBefore === ""
            ? start === 0
            : after.slice(
                Math.max(0, start - anchor.contextBefore.length),
                start,
              ) === anchor.contextBefore);
        const matchesAfter =
          anchor.contextAfter === undefined ||
          (anchor.contextAfter === ""
            ? end === after.length
            : after.slice(end, end + anchor.contextAfter.length) ===
              anchor.contextAfter);
        if (
          matchesBefore &&
          matchesAfter &&
          (anchor.contextBefore !== undefined || start === from || end === to)
        )
          candidates.add(start);
        at = window.indexOf(anchor.quote, at + 1);
      }
      if (at >= 0) exhausted = true;
    }
    if (!exhausted && candidates.size === 1) {
      from = [...candidates][0];
      to = from + anchor.quote.length;
    }
  }
  const status =
    after.slice(from, to) === anchor.quote
      ? "attached"
      : from === to
        ? "removed"
        : "changed";
  return {
    ...anchor,
    from,
    to,
    status,
    ...(status === "attached" && anchor.contextBefore !== undefined
      ? {
          contextBefore: after.slice(Math.max(0, from - 64), from),
          contextAfter: after.slice(to, to + 64),
        }
      : {}),
  };
}
export function commentRange(source: string, from: number, to: number) {
  const boundary = (at: number) =>
    !(
      at > 0 &&
      at < source.length &&
      /[\uD800-\uDBFF]/.test(source[at - 1]) &&
      /[\uDC00-\uDFFF]/.test(source[at])
    );
  return (
    Number.isSafeInteger(from) &&
    Number.isSafeInteger(to) &&
    from >= 0 &&
    to >= from &&
    to <= source.length &&
    to - from <= 10000 &&
    boundary(from) &&
    boundary(to)
  );
}
