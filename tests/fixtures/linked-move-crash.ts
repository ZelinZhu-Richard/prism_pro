import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store";
import { FileMoves } from "../../server/file-moves";
import { captureDirectory } from "../../server/project-directories";

const [root, phase] = process.argv.slice(2);
if (
  !path
    .resolve(root)
    .startsWith(path.resolve("data/verification/linked-move-crash-"))
)
  throw Error("Use the owned synthetic fixture prefix.");
const source = path.join(root, "ordinary"),
  state = path.join(root, "state");
fs.mkdirSync(path.join(source, "sections"), { recursive: true });
const main =
  "\\documentclass{article}\n\\begin{document}\n\\input{sections/one}\n\\end{document}\n";
fs.writeFileSync(path.join(source, "main.tex"), main);
fs.writeFileSync(path.join(source, "sections/one.tex"), "Content.\n");
fs.writeFileSync(
  path.join(source, "sections/unindexed.bin"),
  Buffer.from([0, 1, 255]),
);
const store = new Store(state),
  moves = new FileMoves(store),
  project = store.createLinked(
    "Synthetic linked move",
    captureDirectory(source),
    [
      { path: "main.tex", data: Buffer.from(main) },
      { path: "sections/one.tex", data: Buffer.from("Content.\n") },
    ],
  ),
  from = "sections",
  to = phase === "after-case-stage" ? "Sections" : "parts",
  review = moves.previewRename(project.id, from, to),
  request = {
    requestId: randomUUID(),
    generation: review.generation,
    updateReferences: true,
    referenceToken: review.references?.token,
  };
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({
    source,
    state,
    id: project.id,
    from,
    to,
    request,
    main,
    identity: captureDirectory(source),
    inode: fs.statSync(path.join(source, "sections/unindexed.bin")).ino,
  }),
);
const die = () => process.kill(process.pid, "SIGKILL");
if (phase === "before-metadata-commit") {
  const checkpoint = store.checkpoint.bind(store);
  store.checkpoint = (...args) => {
    const result = checkpoint(...args);
    if (args[1] === "Moved 1 item") die();
    return result;
  };
} else if (phase === "after-metadata-commit") {
  store.linkedMoves.recover = () => {
    die();
  };
} else if (
  phase === "after-case-stage" ||
  phase === "after-rename" ||
  phase === "after-reference"
) {
  const rename = fs.renameSync;
  fs.renameSync = (a, b) => {
    rename(a, b);
    const expected =
      phase === "after-case-stage"
        ? String(b).endsWith(".prism-tmp")
        : String(b) ===
          path.join(source, phase === "after-reference" ? "main.tex" : to);
    if (expected) die();
  };
} else throw Error("Unknown crash phase.");
moves.renameResult(project.id, from, to, request);
throw Error("Fixture did not reach its crash boundary.");
