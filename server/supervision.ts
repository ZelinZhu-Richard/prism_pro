import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const supervisorPath = fileURLToPath(
  new URL("./compiler-supervisor.mjs", import.meta.url),
);
export interface SupervisorIdentity {
  version: 1;
  token: string;
  pid: number;
}
export interface SupervisorResult {
  token: string;
  reason: "exit" | "cancel" | "timeout" | "parent-lost" | "error";
  code: number | null;
  signal: string | null;
  drained: boolean;
  escalated: boolean;
}
export function atomicJson(file: string, value: unknown) {
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function read(file: string, limit: number) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) return null;
    return fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}
export function supervisorIdentity(dir: string): SupervisorIdentity | null {
  try {
    const value = JSON.parse(read(path.join(dir, "supervisor.json"), 4096)!);
    return value?.version === 1 &&
      /^[a-f0-9-]{36}$/.test(value.token) &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 1
      ? value
      : null;
  } catch {
    return null;
  }
}
export function supervisorResult(dir: string, identity: SupervisorIdentity) {
  try {
    const value = JSON.parse(
      read(path.join(dir, "supervisor-result.json"), 4096)!,
    );
    return value?.token === identity.token &&
      ["exit", "cancel", "timeout", "parent-lost", "error"].includes(
        value.reason,
      ) &&
      (value.code === null || Number.isInteger(value.code)) &&
      (value.signal === null || typeof value.signal === "string") &&
      typeof value.drained === "boolean" &&
      typeof value.escalated === "boolean"
      ? (value as SupervisorResult)
      : null;
  } catch {
    return null;
  }
}
export function compilerLog(dir: string) {
  try {
    return read(path.join(dir, "compiler.log"), 1_000_000);
  } catch {
    return null;
  }
}
/** Read-only observation. Persisted process IDs are never used as signal targets. */
export function processGroup(pid: number): number[] | null {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  const result = spawnSync("/bin/ps", ["-g", String(pid), "-o", "pid=,stat="], {
    encoding: "utf8",
    timeout: 1000,
    env: { PATH: "/usr/bin:/bin", LANG: "C" },
  });
  if (
    result.error ||
    result.signal ||
    result.stderr.trim() ||
    (result.status !== 0 && result.status !== 1)
  )
    return null;
  const rows = result.stdout.trim().split("\n").filter(Boolean);
  if (rows.some((line) => !/^\s*\d+\s+\S+\s*$/.test(line))) return null;
  return rows
    .filter((line) => !/^\s*\d+\s+Z/.test(line))
    .map((line) => Number(line.trim().split(/\s+/)[0]));
}
