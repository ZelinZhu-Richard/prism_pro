import test from "node:test";
import assert from "node:assert/strict";
import {
  fileNavigationItems,
  filterNavigation,
  navigationShortcut,
  projectCommands,
} from "../src/quick-navigation";
import type { FileInfo } from "../shared/types";
const file = (
  path: string,
  kind: FileInfo["kind"] = "text",
  deleted = false,
): FileInfo => ({ path, kind, deleted, revision: 1, size: 1 });
test("quick-open keeps full duplicate paths, binary assets and recent tabs while excluding directories/Trash", () => {
  const rows = fileNavigationItems(
    [
      file("sections/main.tex"),
      file("main.tex"),
      file("figures/a.png", "binary"),
      file("notes", "directory"),
      file("removed.tex", "text", true),
      file("references.bib"),
    ],
    ["references.bib", "sections/main.tex", "main.tex"],
    "main.tex",
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["main.tex", "sections/main.tex", "references.bib", "figures/a.png"],
  );
  assert.equal(rows[3].shortcut, "Asset");
  assert.equal(rows[1].detail, "sections/main.tex");
});
test("quick-open ranks exact names before subsequences and supports nested paths, multi-token and Unicode queries", () => {
  const rows = fileNavigationItems(
    [
      file("main-notes.tex"),
      file("sections/main.tex"),
      file("main.tex"),
      file("notes/Café 新文本.tex"),
      file("references.bib"),
    ],
    [],
    "",
  );
  assert.equal(filterNavigation(rows, "main.tex")[0].id, "main.tex");
  assert.deepEqual(
    filterNavigation(rows, "sections main").map((r) => r.id),
    ["sections/main.tex"],
  );
  assert.equal(
    filterNavigation(rows, "cafe 新文本")[0].id,
    "notes/Café 新文本.tex",
  );
  assert.equal(filterNavigation(rows, "rfbib")[0].id, "references.bib");
  assert.deepEqual(filterNavigation(rows, "nonexistent"), []);
  assert.deepEqual(filterNavigation(rows, "  "), rows);
});
test("navigation shortcuts preserve IME, already handled and non-navigation modifier input", () => {
  const event = {
    key: "p",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  };
  assert.equal(navigationShortcut(event), "files");
  assert.equal(navigationShortcut({ ...event, shiftKey: true }), "commands");
  assert.equal(
    navigationShortcut({ ...event, metaKey: false, ctrlKey: true }),
    "files",
  );
  for (const patch of [
    { isComposing: true },
    { defaultPrevented: true },
    { altKey: true },
    { metaKey: false },
    { key: "f" },
  ])
    assert.equal(navigationShortcut({ ...event, ...patch }), undefined);
});
test("command eligibility retains read-only inspection and cancellation but prevents source saves/new builds under a lock", () => {
  const state = {
    source: true,
    tex: true,
    locked: true,
    compileReady: true,
    running: false,
    stopping: false,
    pdf: true,
  };
  const commands = projectCommands(state),
    byId = (id: string) => commands.find((c) => c.id === id)!;
  assert.ok(byId("save").disabled);
  assert.ok(byId("compile").disabled);
  assert.ok(byId("format").disabled);
  for (const id of [
    "files",
    "find",
    "search",
    "code",
    "visual",
    "references",
    "history",
    "versions",
    "settings",
  ])
    assert.equal(byId(id).disabled, undefined);
  const running = projectCommands({ ...state, running: true });
  assert.ok(!running.some((c) => c.id === "compile"));
  assert.equal(running.find((c) => c.id === "stop")!.disabled, undefined);
  assert.ok(
    projectCommands({ ...state, running: true, stopping: true }).find(
      (c) => c.id === "stop",
    )!.disabled,
  );
  const empty = projectCommands({
    ...state,
    locked: false,
    source: false,
    tex: false,
    pdf: false,
    compileReady: false,
  });
  for (const id of [
    "save",
    "find",
    "pdf",
    "visual",
    "writing",
    "versions",
    "compile",
  ])
    assert.ok(empty.find((c) => c.id === id)?.disabled);
  assert.ok(commands.every((c) => !/^(?:ai|delete|purge|send)/i.test(c.id)));
});
