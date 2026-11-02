import type { FileInfo } from "../shared/types";

export interface NavigationItem {
  id: string;
  label: string;
  detail: string;
  keywords?: string;
  shortcut?: string;
  disabled?: string;
}
export function projectCommands(state: {
  source: boolean;
  tex: boolean;
  locked: boolean;
  compileReady: boolean;
  running: boolean;
  stopping: boolean;
  pdf: boolean;
}): NavigationItem[] {
  const source = state.source ? undefined : "Open a text file first",
    edit = state.locked
      ? "Source is read-only while an operation is active"
      : source;
  return [
    {
      id: "files",
      label: "Open a file",
      detail: "Search project names and paths",
      shortcut: "⌘/Ctrl P",
    },
    {
      id: "save",
      label: "Save file",
      detail: "Save the current source",
      shortcut: "⌘/Ctrl S",
      disabled: edit,
    },
    {
      id: "find",
      label: "Find in document",
      detail: "Search and replace in the active source",
      shortcut: "⌘/Ctrl F",
      disabled: source,
    },
    {
      id: "search",
      label: "Search project",
      detail: "Search text across project files",
      shortcut: "⌘/Ctrl ⇧ F",
    },
    state.running
      ? {
          id: "stop",
          label: "Stop compilation",
          detail: "Cancel the active local build",
          disabled: state.stopping ? "Stopping the build…" : undefined,
        }
      : {
          id: "compile",
          label: "Compile document",
          detail: "Save source and build the PDF",
          shortcut: "⌘/Ctrl Enter",
          disabled: state.locked
            ? "Finish the current operation first"
            : state.compileReady
              ? undefined
              : "Select a root document and compiler first",
        },
    {
      id: "pdf",
      label: "Go to PDF from source",
      detail: "Navigate using SyncTeX",
      shortcut: "⌘/Ctrl ⇧ J",
      disabled: source || (!state.pdf ? "Compile a PDF first" : undefined),
    },
    {
      id: "format",
      label: "Format LaTeX source",
      detail: "Preview local latexindent changes before applying",
      disabled: state.locked
        ? "Finish the current operation first"
        : state.tex
          ? undefined
          : "Open a .tex file first",
    },
    {
      id: "code",
      label: "Switch to Code view",
      detail: "Inspect and edit LaTeX source",
      disabled: source,
    },
    {
      id: "visual",
      label: "Switch to Visual view",
      detail: "Source-backed writing and math",
      disabled: state.tex ? undefined : "Open a .tex file first",
    },
    {
      id: "references",
      label: "Search bibliography",
      detail: "Find local citation keys, titles and authors",
    },
    {
      id: "word-count",
      label: "Word count",
      detail: "Count the saved root document and included source",
    },
    {
      id: "writing",
      label: "Writing checks",
      detail: "Local spelling and LaTeX hints",
      disabled: source,
    },
    {
      id: "history",
      label: "Project history",
      detail: "Compare versions and restore files",
    },
    {
      id: "versions",
      label: "Compare file versions",
      detail: "Review editor, disk and recoverable drafts",
      disabled: source,
    },
    {
      id: "settings",
      label: "Editor settings",
      detail: "Font, keyboard, autosave and build timing",
    },
    {
      id: "help",
      label: "Help and shortcuts",
      detail: "Discover Leaf's local writing controls",
    },
  ];
}
const normalized = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
function match(value: string, token: string): number | undefined {
  if (value === token) return 0;
  if (value.startsWith(token)) return 1;
  const at = value.indexOf(token);
  if (at >= 0) return 2 + at / (value.length + 1);
  let previous = -1,
    gaps = 0;
  for (const character of token) {
    const next = value.indexOf(character, previous + 1);
    if (next < 0) return;
    gaps += next - previous - 1;
    previous = next;
  }
  return 4 + gaps / (value.length + 1);
}
export function filterNavigation<T extends NavigationItem>(
  items: T[],
  query: string,
): T[] {
  const tokens = normalized(query.trim()).split(/\s+/).filter(Boolean);
  if (!tokens.length) return items;
  return items
    .map((item, index) => {
      const label = normalized(item.label),
        context = normalized(item.detail + " " + (item.keywords ?? ""));
      let score = 0;
      for (const token of tokens) {
        const a = match(label, token),
          b = match(context, token),
          best = Math.min(a ?? Infinity, b === undefined ? Infinity : b + 3);
        if (!Number.isFinite(best)) return null;
        score += best;
      }
      return { item, index, score };
    })
    .filter((v) => v !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((v) => v.item);
}
export function fileNavigationItems(
  files: FileInfo[],
  tabs: string[],
  active: string,
): NavigationItem[] {
  const recent = [...tabs].reverse();
  return files
    .filter((f) => !f.deleted && f.kind !== "directory")
    .sort((a, b) => {
      const rank = (path: string) =>
        path === active
          ? -1
          : recent.includes(path)
            ? recent.indexOf(path)
            : Infinity;
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
    })
    .map((file) => ({
      id: file.path,
      label: file.path.split("/").at(-1)!,
      detail: file.path,
      keywords:
        file.path === active
          ? "current file"
          : tabs.includes(file.path)
            ? "open file"
            : "",
      shortcut:
        file.path === active
          ? "Current"
          : file.kind === "binary"
            ? "Asset"
            : undefined,
    }));
}

// Do not steal print shortcuts from a settings/review dialog or an IME session.
export function navigationShortcut(
  e: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "shiftKey"
    | "altKey"
    | "isComposing"
    | "defaultPrevented"
  >,
): "files" | "commands" | undefined {
  if (
    e.defaultPrevented ||
    e.isComposing ||
    e.altKey ||
    !(e.metaKey || e.ctrlKey) ||
    e.key.toLowerCase() !== "p"
  )
    return;
  return e.shiftKey ? "commands" : "files";
}
