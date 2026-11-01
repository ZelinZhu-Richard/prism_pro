import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store";
import { FileMoves } from "../../server/file-moves";
const [root, phase] = process.argv.slice(2),
  store = new Store(root);
const project = store.create("Crash fixture", [
  { path: "source/main.tex", data: Buffer.from("Exact source bytes.") },
  { path: "dest", directory: true, data: Buffer.alloc(0) },
]);
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({ id: project.id }),
);
store.update(project.id, { root: "source/main.tex" });
store.automaticCheckpoint(project.id);
const rename = fs.renameSync,
  remove = fs.rmSync;
fs.renameSync = ((from, to) => {
  if (
    String(from).includes("/file-stage-") &&
    String(to) === store.projectDir(project.id)
  ) {
    if (phase === "before-new-tree") process.exit(91);
    rename(from, to);
    if (phase === "after-new-tree") process.exit(91);
    return;
  }
  return rename(from, to);
}) as typeof fs.renameSync;
fs.rmSync = ((name, options) => {
  if (phase === "after-commit" && String(name).includes("/file-stage-"))
    process.exit(91);
  return remove(name, options);
}) as typeof fs.rmSync;
new FileMoves(store).apply(project.id, {
  paths: ["source"],
  destination: "dest",
  generation: store.project(project.id).generation,
  requestId: randomUUID(),
});
process.exit(92);
