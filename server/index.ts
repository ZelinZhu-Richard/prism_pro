import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { compilerLimitsFromEnvironment } from "./compile-policy";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const { app } = await createApp(path.join(root, "data"), {
  seed: true,
  dist: path.join(root, "dist"),
  compilerLimits: compilerLimitsFromEnvironment(process.env),
});
await app.listen({ host: "127.0.0.1", port: 4317 });
console.log(
  "Leaf is ready at http://127.0.0.1:4317 (development UI: http://127.0.0.1:5173)",
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
