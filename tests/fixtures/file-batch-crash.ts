import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store";
import { FileBatches } from "../../server/file-batches";
const [root, id, kind, phase] = process.argv.slice(2),
  store = new Store(root),
  batches = new FileBatches(store);
const rename = fs.renameSync,
  remove = fs.rmSync;
fs.renameSync = ((from: any, to: any) => {
  if (phase === "before" && String(from).endsWith("/files")) process.exit(71);
  rename(from, to);
  if (phase === "replaced" && String(from).includes("/file-stage-"))
    process.exit(72);
}) as typeof fs.renameSync;
fs.rmSync = ((target: any, options: any) => {
  if (phase === "committed" && String(target).includes("/file-backup-"))
    process.exit(73);
  return remove(target, options);
}) as typeof fs.rmSync;
if (kind === "trash")
  batches.state(id, "trash", {
    paths: ["folder"],
    generation: store.project(id).generation,
    requestId: randomUUID(),
  });
else {
  const review = batches.uploadPreview(id, {
    destination: "",
    entries: [{ path: "folder/paper.tex", size: 11 }],
  });
  batches.upload(
    id,
    { token: review.token, indices: [0], requestId: randomUUID() },
    new Map([[0, Buffer.from("Replacement")]]),
  );
}
process.exit(1);
