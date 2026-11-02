import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const [mode, dir] = process.argv.slice(2);
if (mode === "unicode") {
  const bytes = Buffer.from("Café · 中文 👩🏽‍💻\n");
  for (let i = 0; i < bytes.length; i++) {
    process.stdout.write(bytes.subarray(i, i + 1));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
} else if (mode === "environment") {
  console.log(JSON.stringify({ env: process.env, args: process.execArgv }));
} else if (mode === "tree" || mode === "orphan") {
  const child = spawn(process.execPath, [process.argv[1], "ignore-term", dir], {
    env: process.env,
    stdio: "inherit",
  });
  while (!fs.existsSync(path.join(dir, "ready-" + child.pid)))
    await new Promise((resolve) => setTimeout(resolve, 10));
  console.log("TREE READY");
  if (mode === "orphan") process.exit(0);
  setInterval(() => {}, 1000);
} else if (mode === "ignore-term") {
  process.on("SIGTERM", () => {});
  fs.writeFileSync(path.join(dir, "ready-" + process.pid), String(process.pid));
  console.log("READY");
  setInterval(() => {}, 1000);
} else throw new Error("Unknown fixture");
