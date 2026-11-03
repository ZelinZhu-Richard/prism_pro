import fs from "node:fs";
import path from "node:path";
import { Store } from "../../server/store";
import { captureDirectory } from "../../server/project-directories";
const [root, phase] = process.argv.slice(2);
if (
  !path
    .resolve(root)
    .startsWith(path.resolve("data/verification/linked-crash-"))
)
  throw Error("Use the owned synthetic fixture prefix.");
const source = path.join(root, "ordinary"),
  data = path.join(root, "state");
fs.mkdirSync(source, { recursive: true });
fs.writeFileSync(path.join(source, "main.tex"), "Original ordinary source.\n");
const store = new Store(data),
  p = store.createLinked("Synthetic linked crash", captureDirectory(source), [
    { path: "main.tex", data: Buffer.from("Original ordinary source.\n") },
  ]);
fs.writeFileSync(
  path.join(root, "fixture.json"),
  JSON.stringify({ id: p.id, source, data, phase }),
);
const die = () => process.kill(process.pid, "SIGKILL");
if (phase === "before-commit") {
  const insert = store.insert.bind(store);
  store.insert = (...args) => {
    insert(...args);
    die();
  };
} else if (phase === "after-rename") {
  const ack = store.disk.acknowledge.bind(store.disk);
  store.disk.acknowledge = (...args) => {
    if (args[3] === 1) die();
    ack(...args);
  };
} else
  store.materializeFile = () => {
    if (phase === "external-after-commit")
      fs.writeFileSync(
        path.join(source, "main.tex"),
        "External after linked crash.\n",
      );
    if (phase === "root-replaced-after-commit") {
      fs.renameSync(source, source + " original");
      fs.mkdirSync(source);
      fs.writeFileSync(
        path.join(source, "main.tex"),
        "Replacement folder bytes.\n",
      );
    }
    die();
  };
store.save(p.id, "main.tex", "Latest ordinary app version.\n", 0);
throw Error("Fixture did not reach its crash boundary.");
