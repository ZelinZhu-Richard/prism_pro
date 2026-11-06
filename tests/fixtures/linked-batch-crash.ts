import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileBatches } from "../../server/file-batches";
import { captureDirectory } from "../../server/project-directories";
import { Store } from "../../server/store";

const [root, phase] = process.argv.slice(2);
if (
  !path
    .resolve(root)
    .startsWith(path.resolve("data/verification/linked-batch-crash-"))
)
  throw Error("Use the owned synthetic fixture prefix.");
const source = path.join(root, "ordinary"),
  state = path.join(root, "state");
fs.mkdirSync(source, { recursive: true });
fs.writeFileSync(path.join(source, "main.tex"), "Original.\n");
fs.writeFileSync(path.join(source, "unindexed.bin"), Buffer.from([0, 1, 255]));
const store = new Store(state),
  project = store.createLinked(
    "Synthetic linked batch",
    captureDirectory(source),
    [{ path: "main.tex", data: Buffer.from("Original.\n") }],
  ),
  batches = new FileBatches(store),
  replacement = Buffer.from("Replacement.\n"),
  asset = Buffer.from([0, 42, 255]),
  review = batches.uploadPreview(project.id, {
    destination: "",
    entries: [
      { path: "main.tex", size: replacement.length },
      { path: "nested/figure.bin", size: asset.length },
    ],
  }),
  input = { requestId: randomUUID(), token: review.token, indices: [0, 1] };
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({
    id: project.id,
    source,
    state,
    input,
    identity: captureDirectory(source),
  }),
);
const die = () => process.kill(process.pid, "SIGKILL");
if (phase === "before-metadata-commit") {
  const checkpoint = store.checkpoint.bind(store);
  store.checkpoint = (...args) => {
    const result = checkpoint(...args);
    if (args[1] === "Uploaded 2 entries") die();
    return result;
  };
} else if (phase === "after-metadata-commit") {
  store.linkedBatches.recover = () => {
    die();
  };
} else if (phase === "after-first-write") {
  const acknowledge = store.disk.acknowledge.bind(store.disk);
  store.disk.acknowledge = (...args) => {
    if (args[1] === "main.tex" && args[3] === 1) die();
    acknowledge(...args);
  };
} else throw Error("Unknown crash phase.");
batches.upload(
  project.id,
  input,
  new Map([
    [0, replacement],
    [1, asset],
  ]),
);
throw Error("Fixture did not reach its crash boundary.");
