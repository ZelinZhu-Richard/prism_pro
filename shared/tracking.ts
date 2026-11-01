import { diffArrays } from "diff";
import { ChangeSet, Text } from "@codemirror/state";

export interface TrackedHunk {
  id: number;
  oldFrom: number;
  oldTo: number;
  from: number;
  to: number;
  before: string;
  after: string;
  line: number;
}
export interface TrackingStatus {
  enabled: boolean;
  revision: number;
  files: {
    path: string;
    count: number;
    limited: boolean;
    unavailable: boolean;
  }[];
  undo?: { id: string; path: string; action: string };
}
export interface TrackingFile {
  path: string;
  sourceRevision: number;
  reviewRevision: number;
  token: string;
  hunks: TrackedHunk[];
  limited: boolean;
}
export interface TrackingResult {
  id: string;
  action: string;
  path: string;
  file: { path: string; revision: number; content: string };
}
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export function sourceLineCursor(text: string) {
  let offset = 0,
    line = 1;
  return (position: number) => {
    // Normal hunk positions advance. The grouped fallback can rewind once.
    if (position < offset) {
      offset = 0;
      line = 1;
    }
    while (offset < position) {
      if (text.charCodeAt(offset) === 10) line++;
      offset++;
    }
    return line;
  };
}
function boundary(text: string, at: number, end: boolean) {
  if (at === 0 || at === text.length) return at;
  const start = Math.max(0, at - 256),
    offset = at - start;
  for (const s of segmenter.segment(text.slice(start, at + 256))) {
    if (s.index <= offset && s.index + s.segment.length > offset) {
      if (s.index === 0 && start > 0) return end ? text.length : 0;
      return offset === s.index
        ? at
        : start + s.index + (end ? s.segment.length : 0);
    }
  }
  return end ? text.length : 0;
}
// Work is bounded; a large rewrite becomes one explicitly grouped change.
// Even the fallback preserves exact source and whole Unicode graphemes.
export function trackedDiff(
  base: string,
  current: string,
): { hunks: TrackedHunk[]; limited: boolean } {
  if (base === current) return { hunks: [], limited: false };
  let prefix = 0,
    suffix = 0;
  while (
    prefix < Math.min(base.length, current.length) &&
    base[prefix] === current[prefix]
  )
    prefix++;
  prefix = Math.min(
    boundary(base, prefix, false),
    boundary(current, prefix, false),
  );
  while (
    suffix < Math.min(base.length, current.length) - prefix &&
    base[base.length - suffix - 1] === current[current.length - suffix - 1]
  )
    suffix++;
  const oldTo = boundary(base, base.length - suffix, true),
    to = boundary(current, current.length - suffix, true);
  const old = base.slice(prefix, oldTo),
    next = current.slice(prefix, to);
  let limited = old.length + next.length > 200000;
  const parts = limited
    ? undefined
    : diffArrays(
        Array.from(segmenter.segment(old), (s) => s.segment),
        Array.from(segmenter.segment(next), (s) => s.segment),
        { timeout: 40, maxEditLength: 20000 },
      );
  const hunks: TrackedHunk[] = [];
  const lineAt = sourceLineCursor(current);
  const push = (a: number, b: number, c: number, d: number) =>
    hunks.push({
      id: hunks.length,
      oldFrom: a,
      oldTo: b,
      from: c,
      to: d,
      before: base.slice(a, b),
      after: current.slice(c, d),
      line: lineAt(c),
    });
  if (!parts) {
    push(prefix, oldTo, prefix, to);
    return { hunks, limited: true };
  }
  let a = prefix,
    b = prefix;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].added && !parts[i].removed) {
      const n = parts[i].value.join("").length;
      a += n;
      b += n;
      continue;
    }
    const fromA = a,
      fromB = b;
    while (i < parts.length && (parts[i].added || parts[i].removed)) {
      const n = parts[i].value.join("").length;
      if (parts[i].removed) a += n;
      else b += n;
      i++;
    }
    i--;
    push(fromA, a, fromB, b);
    if (hunks.length > 1000) {
      hunks.length = 0;
      push(prefix, oldTo, prefix, to);
      limited = true;
      break;
    }
  }
  const passages: TrackedHunk[] = [];
  for (const h of hunks) {
    const last = passages.at(-1),
      gap = last ? current.slice(last.to, h.from) : "";
    // Nearby character edits in one phrase are reviewed together. Never bridge
    // a line break or a long unchanged passage merely to reduce the row count.
    if (
      last &&
      gap.length <= 12 &&
      !/[\r\n]/u.test(gap) &&
      base.slice(last.oldTo, h.oldFrom) === gap
    ) {
      last.oldTo = h.oldTo;
      last.to = h.to;
      last.before = base.slice(last.oldFrom, last.oldTo);
      last.after = current.slice(last.from, last.to);
    } else passages.push({ ...h, id: passages.length });
  }
  return { hunks: passages, limited };
}
export function reviewText(
  text: string,
  hunks: TrackedHunk[],
  accept: boolean,
) {
  return ChangeSet.of(
    hunks.map((h) => ({
      from: accept ? h.oldFrom : h.from,
      to: accept ? h.oldTo : h.to,
      insert: accept ? h.after : h.before,
    })),
    text.length,
  )
    .apply(Text.of(text.split("\n")))
    .toString();
}
export function selectedTracked(h: TrackedHunk, from: number, to: number) {
  return (
    from < to &&
    (h.from === h.to
      ? h.from >= from && h.from <= to
      : h.from < to && h.to > from)
  );
}
// Edits made with tracking off update accepted text only outside pending passages.
// Touching an existing pending passage continues that passage instead of silently accepting it.
export function untrackedBase(base: string, previous: string, next: string) {
  const pending = trackedDiff(base, previous).hunks;
  if (!pending.length) return next;
  const inverse = ChangeSet.of(
    pending.map((h) => ({ from: h.oldFrom, to: h.oldTo, insert: h.after })),
    base.length,
  ).invert(Text.of(base.split("\n")));
  const edits = trackedDiff(previous, next).hunks.filter(
    (e) =>
      !pending.some((h) =>
        e.oldFrom === e.oldTo
          ? e.oldFrom >= h.from && e.oldFrom <= h.to
          : h.from === h.to
            ? h.from >= e.oldFrom && h.from <= e.oldTo
            : e.oldFrom < h.to && e.oldTo > h.from,
      ),
  );
  return ChangeSet.of(
    edits.map((e) => ({
      from: inverse.mapPos(e.oldFrom, 1),
      to: inverse.mapPos(e.oldTo, -1),
      insert: e.after,
    })),
    base.length,
  )
    .apply(Text.of(base.split("\n")))
    .toString();
}
