import type { Project } from "../shared/types";
import { PDF_FIT_MODES, PDF_ZOOM_MAX, PDF_ZOOM_MIN } from "./pdf-layout";
import type { PdfReadingView } from "./pdf-view-history";

type SourceView = { tabs: string[]; active: string };
type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;
const maxTabs = 100;
const prefix = "leaf:workspace:v1:";

const browser: WorkspaceStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

function read(key: string, storage: WorkspaceStorage): unknown {
  try {
    const text = storage.getItem(prefix + key);
    return text && text.length <= 128 * 1024 ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: object, storage: WorkspaceStorage) {
  try {
    const json = JSON.stringify(value);
    if (storage.getItem(prefix + key) !== json)
      storage.setItem(prefix + key, json);
  } catch {
    // Workspace preferences are optional and independent of source recovery.
  }
}

export function sourceWorkspace(
  project: Pick<Project, "id" | "files">,
  storage = browser,
): SourceView | undefined {
  const value = read("source:" + project.id, storage) as Partial<SourceView>;
  if (
    !Array.isArray(value?.tabs) ||
    value.tabs.length > maxTabs ||
    typeof value.active !== "string"
  )
    return;
  const files = new Set(
    project.files
      .filter((file) => !file.deleted && file.kind !== "directory")
      .map((file) => file.path),
  );
  const tabs = [...new Set(value.tabs.filter((name) => files.has(name)))];
  if (!tabs.length && (value.tabs.length || value.active)) return;
  return {
    tabs,
    active: tabs.includes(value.active) ? value.active : (tabs[0] ?? ""),
  };
}

export function saveSourceWorkspace(
  project: string,
  { tabs, active }: SourceView,
  storage = browser,
) {
  const names = tabs.slice(0, maxTabs);
  if (names.length === maxTabs && tabs.includes(active) && !names.includes(active))
    names[maxTabs - 1] = active;
  write("source:" + project, { tabs: names, active }, storage);
}

export function pdfWorkspace(project: string, url: string, storage = browser) {
  const value = read("pdf:" + project, storage) as
    | { url: string; view: PdfReadingView }
    | undefined;
  const view = value?.view;
  if (
    value?.url !== url ||
    !view?.anchor ||
    !Number.isSafeInteger(view.anchor.page) ||
    view.anchor.page < 1 ||
    !Number.isFinite(view.anchor.fraction) ||
    view.anchor.fraction < 0 ||
    view.anchor.fraction > 1 ||
    !Number.isSafeInteger(view.preferred) ||
    view.preferred < 1 ||
    !Number.isFinite(view.horizontal) ||
    view.horizontal < 0 ||
    !(
      PDF_FIT_MODES.some((mode) => mode === view.zoom) ||
      (typeof view.zoom === "number" &&
        Number.isFinite(view.zoom) &&
        view.zoom >= PDF_ZOOM_MIN &&
        view.zoom <= PDF_ZOOM_MAX)
    )
  )
    return;
  return view;
}

export function savePdfWorkspace(
  project: string,
  url: string,
  view: PdfReadingView,
  storage = browser,
) {
  write("pdf:" + project, { url, view }, storage);
}
