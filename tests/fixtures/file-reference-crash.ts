import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store";
import { FileMoves } from "../../server/file-moves";
const [root, phase] = process.argv.slice(2),
  store = new Store(root),
  moves = new FileMoves(store);
const project = store.create("Reference crash fixture", [
  {
    path: "main.tex",
    data: Buffer.from("\\documentclass{article}\n\\input{parts/a}\n"),
  },
  { path: "parts/a.tex", data: Buffer.from("Exact section bytes.\n") },
  { path: "archive", directory: true, data: Buffer.alloc(0) },
]);
const preview = moves.preview(project.id, {
  paths: ["parts"],
  destination: "archive",
});
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({ id: project.id }),
);
const rename = fs.renameSync,
  remove = fs.rmSync;
fs.renameSync = ((from, to) => {
  const swapping =
    String(from).includes("/file-stage-") &&
    String(to) === store.projectDir(project.id);
  if (swapping && phase === "before-new-tree") process.exit(91);
  const result = rename(from, to);
  if (swapping && phase === "after-new-tree") process.exit(91);
  return result;
}) as typeof rename;
fs.rmSync = ((target, options) => {
  if (phase === "after-commit" && String(target).includes("/file-stage-"))
    process.exit(91);
  return remove(target, options);
}) as typeof remove;
moves.apply(project.id, {
  paths: ["parts"],
  destination: "archive",
  generation: preview.generation,
  requestId: randomUUID(),
  updateReferences: true,
  referenceToken: preview.references!.token,
});
