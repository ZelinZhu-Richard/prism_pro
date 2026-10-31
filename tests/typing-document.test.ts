import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { TypingDocument, selectedPassage } from "../src/typing-document";
import { internalEdit, readOnlyTransactions } from "../src/editor-transactions";

test("background typing keeps its file, revision and selected replacement independent of inspected files", () => {
  const target = new TypingDocument(
    "project",
    { path: "main.tex", revision: 7, content: "Before OLD after" },
    7,
    10,
  );
  const inspected = {
    path: "section.tex",
    revision: 83,
    content: "Other source",
  };
  target.reveal("é");
  const pendingSave = { ...target.file, revision: 8 };
  target.reveal("é 👩🏽‍🔬");
  target.acknowledge(pendingSave);
  assert.equal(target.file.path, "main.tex");
  assert.equal(target.file.revision, 8);
  assert.equal(target.file.content, "Before é 👩🏽‍🔬 after");
  assert.equal(target.savedContent, "Before é after");
  assert.deepEqual(inspected, {
    path: "section.tex",
    revision: 83,
    content: "Other source",
  });
  assert.throws(() => target.acknowledge(inspected), /unexpected/);
  assert.throws(
    () => target.acknowledge({ ...target.file, revision: 6 }),
    /unexpected/,
  );
});

test("typing target validates range changes and retains exact source outside an edit", () => {
  const target = new TypingDocument(
    "project",
    { path: "main.tex", revision: 0, content: "abc ORIGINAL xyz" },
    0,
    0,
  );
  target.range(4, 12);
  assert.equal(target.reveal("").content, "abc  xyz");
  assert.equal(target.reveal("new").content, "abc new xyz");
  assert.throws(() => target.range(12, 4), /range/);
  assert.throws(() => target.range(0, 100), /range/);
});

test("selection preview preserves exact Unicode and whitespace and captures stable source coordinates", () => {
  const file = {
    path: "main.tex",
    revision: 0,
    content: "First\n  é 👩🏽‍🔬\nLast\n",
  };
  const selection = selectedPassage(file, 6, file.content.indexOf("Last"))!;
  assert.equal(selection.text, "  é 👩🏽‍🔬\n");
  assert.equal(selection.startLine, 2);
  assert.equal(selection.endLine, 2);
  file.content = "Changed after submission";
  assert.equal(selection.text, "  é 👩🏽‍🔬\n");
  assert.equal(selectedPassage(file, 0, 0), null);
  assert.equal(selectedPassage(file, -1, 1), null);
  assert.equal(selectedPassage(file, 0, 999), null);
});

test("read-only editors reject typing, paste, deletion and undo changes but permit selection and internal AI updates", () => {
  let state = EditorState.create({
    doc: "Original",
    extensions: [EditorState.readOnly.of(true), readOnlyTransactions],
  });
  for (const event of [
    "input.type",
    "input.paste",
    "delete.backward",
    "undo",
  ]) {
    state = state.update({
      changes: { from: 0, to: 8, insert: "Forbidden" },
      userEvent: event,
    }).state;
    assert.equal(state.doc.toString(), "Original");
  }
  state = state.update({ selection: { anchor: 0, head: 4 } }).state;
  assert.equal(state.selection.main.to, 4);
  state = state.update({
    changes: { from: 0, to: 8, insert: "AI edit" },
    annotations: internalEdit.of(true),
  }).state;
  assert.equal(state.doc.toString(), "AI edit");
  let editable = EditorState.create({
    doc: "Original",
    extensions: [readOnlyTransactions],
  });
  editable = editable.update({
    changes: { from: 0, insert: "Allowed " },
  }).state;
  assert.equal(editable.doc.toString(), "Allowed Original");
});
