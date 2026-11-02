import fs from "node:fs";
import path from "node:path";
import { Store } from "../../server/store";
const [root, phase] = process.argv.slice(2),
  store = new Store(root);
const p = store.create("Synthetic process-crash recovery", [
  { path: "main.tex", data: Buffer.from("Original committed source.\n") },
]);
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({ id: p.id, phase }),
);
if (phase === "before-commit") {
  const insert = store.insert.bind(store);
  store.insert = (...args) => {
    insert(...args);
    process.exit(91);
  };
} else if (phase === "after-rename") {
  const acknowledge = store.disk.acknowledge.bind(store.disk);
  store.disk.acknowledge = (...args) => {
    if (args[3] === 1) process.exit(91);
    acknowledge(...args);
  };
} else {
  store.materializeFile = () => {
    if (phase === "external-after-commit")
      fs.writeFileSync(
        path.join(store.projectDir(p.id), "main.tex"),
        "External version after crash.\n",
      );
    process.exit(91);
  };
}
if (phase === "new-file")
  store.add(p.id, "added.tex", Buffer.from("Committed new file.\n"));
else if (phase === "delete") store.trash(p.id, "main.tex");
else store.save(p.id, "main.tex", "Latest committed app version.\n", 0);
throw new Error("Fixture failed to reach its intended crash boundary.");
