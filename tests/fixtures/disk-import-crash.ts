import fs from "node:fs";
import path from "node:path";
import { Store } from "../../server/store";
import { DiskDiscovery } from "../../server/disk-discovery";
const [root, id, mode] = process.argv.slice(2),
  store = new Store(root),
  request = JSON.parse(
    fs.readFileSync(path.join(root, "import-request.json"), "utf8"),
  );
if (mode === "during") {
  const insert = store.insert.bind(store);
  let count = 0;
  store.insert = (...args: Parameters<Store["insert"]>) => {
    const result = insert(...args);
    if (++count === 1) {
      fs.writeFileSync(path.join(root, "crash-point"), "during");
      process.kill(process.pid, "SIGKILL");
    }
    return result;
  };
}
new DiskDiscovery(store).apply(id, request);
fs.writeFileSync(path.join(root, "crash-point"), "after");
process.kill(process.pid, "SIGKILL");
