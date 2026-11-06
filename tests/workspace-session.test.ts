import test from "node:test";
import assert from "node:assert/strict";
import type { FileInfo } from "../shared/types";
import {
  pdfWorkspace,
  savePdfWorkspace,
  saveSourceWorkspace,
  sourceWorkspace,
} from "../src/workspace-session";
import type { PdfReadingView } from "../src/pdf-view-history";

const file = (path: string, kind: FileInfo["kind"] = "text"): FileInfo => ({
  path,
  kind,
  revision: 0,
  size: 0,
  deleted: false,
});
function fixture() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
  };
}

test("workspace restores tabs in order and skips deleted, missing, and directory paths", () => {
  const storage = fixture();
  const project = {
    id: "one",
    files: [
      file("main.tex"),
      file("figures", "directory"),
      file("figures/cover.png", "binary"),
      { ...file("old.tex"), deleted: true },
    ],
  };
  saveSourceWorkspace(
    project.id,
    {
      tabs: [
        "old.tex",
        "main.tex",
        "figures",
        "missing.tex",
        "figures/cover.png",
        "main.tex",
      ],
      active: "old.tex",
    },
    storage,
  );
  assert.deepEqual(sourceWorkspace(project, storage), {
    tabs: ["main.tex", "figures/cover.png"],
    active: "main.tex",
  });
  assert.equal(sourceWorkspace({ ...project, id: "two" }, storage), undefined);
});

test("the saved tab limit retains the selected tab", () => {
  const storage = fixture();
  const files = Array.from({ length: 120 }, (_, i) =>
    file(`section-${i}.tex`),
  );
  const active = files[119].path;
  saveSourceWorkspace(
    "one",
    { tabs: files.map((f) => f.path), active },
    storage,
  );
  const restored = sourceWorkspace({ id: "one", files }, storage);
  assert.equal(restored?.tabs.length, 100);
  assert.equal(restored.tabs[99], active);
  assert.equal(restored.active, active);
});

test("explicitly closing every tab is distinct from losing all saved paths", () => {
  const storage = fixture();
  const project = { id: "one", files: [file("main.tex")] };
  saveSourceWorkspace("one", { tabs: ["old.tex"], active: "old.tex" }, storage);
  assert.equal(sourceWorkspace(project, storage), undefined);
  saveSourceWorkspace("one", { tabs: [], active: "" }, storage);
  assert.deepEqual(sourceWorkspace(project, storage), { tabs: [], active: "" });
});

const reading: PdfReadingView = {
  anchor: { page: 2, fraction: 0.25 },
  horizontal: 144,
  preferred: 2,
  zoom: 1.25,
};
test("PDF reading metadata restores only for the matching project and build", () => {
  const storage = fixture();
  const url = "/api/builds/first/pdf";
  savePdfWorkspace("one", url, reading, storage);
  assert.deepEqual(pdfWorkspace("one", url, storage), reading);
  assert.equal(pdfWorkspace("one", "/api/builds/new/pdf", storage), undefined);
  assert.equal(pdfWorkspace("two", url, storage), undefined);
});

test("fitted PDF view modes round-trip through workspace storage", () => {
  const storage = fixture();
  const url = "/api/builds/first/pdf";
  for (const zoom of ["fit-width", "fit-height", "fit-page"] as const) {
    const view = { ...reading, zoom };
    savePdfWorkspace("one", url, view, storage);
    assert.deepEqual(pdfWorkspace("one", url, storage), view);
  }
});

test("invalid or unavailable workspace storage falls back without touching source state", () => {
  const storage = fixture();
  const url = "/api/builds/first/pdf";
  savePdfWorkspace("one", url, { ...reading, zoom: 5 }, storage);
  assert.equal(pdfWorkspace("one", url, storage), undefined);
  const key = [...storage.entries.keys()][0];
  storage.entries.set(key, "{invalid");
  assert.equal(pdfWorkspace("one", url, storage), undefined);
  const unavailable = {
    getItem: () => {
      throw Error("Browser storage is disabled");
    },
    setItem: () => {
      throw Error("Browser storage is disabled");
    },
  };
  assert.equal(sourceWorkspace({ id: "one", files: [] }, unavailable), undefined);
  assert.doesNotThrow(() => savePdfWorkspace("one", url, reading, unavailable));
});
