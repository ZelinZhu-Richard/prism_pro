// Trusted application worker, launched without inherited Node flags or loaders.
// It owns the compiler's POSIX process group and its deadline independently of
// the API server. Project files can write only out/home, never this journal.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const [dir, token] = process.argv.slice(2);
if (
  !process.send ||
  !path.isAbsolute(dir ?? "") ||
  !/^[a-f0-9-]{36}$/.test(token ?? "")
)
  process.exit(2);
let child,
  started = false,
  closed = false,
  stopping = false,
  finished = false;
let reason = "exit",
  code = null,
  signal = null,
  escalated = false;
let logBytes = 0,
  deadlineTimer,
  escalationTimer,
  drainTimer;
const log = fs.openSync(path.join(dir, "compiler.log"), "w", 0o600);
const atomic = (value) => {
  const file = path.join(dir, "supervisor-result.json"),
    temporary = file + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
};
const journal = (drained) => {
  try {
    atomic({ token, reason, code, signal, drained, escalated });
    return true;
  } catch {
    // A failed disk write must never disable process termination.
    return false;
  }
};
function append(text, emit = true) {
  let bytes = Buffer.from(text);
  if (bytes.length > 1_000_000 - logBytes) {
    bytes = bytes.subarray(0, 1_000_000 - logBytes);
    // Do not end a bounded log in the middle of a UTF-8 character.
    const decoder = new StringDecoder("utf8");
    bytes = Buffer.from(decoder.write(bytes));
  }
  if (!bytes.length) return;
  fs.writeSync(log, bytes);
  logBytes += bytes.length;
  if (emit && process.connected)
    process.send({ type: "output", text: bytes.toString("utf8") }, () => {});
}
function others() {
  const p = spawnSync(
    "/bin/ps",
    ["-g", String(process.pid), "-o", "pid=,stat="],
    {
      encoding: "utf8",
      timeout: 500,
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
    },
  );
  if (
    p.error ||
    p.signal ||
    p.stderr.trim() ||
    (p.status !== 0 && p.status !== 1)
  )
    return null;
  const rows = p.stdout.trim().split("\n").filter(Boolean);
  if (rows.some((line) => !/^\s*\d+\s+\S+\s*$/.test(line))) return null;
  return rows
    .filter((line) => !/^\s*\d+\s+Z/.test(line))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((pid) => pid !== process.pid && pid !== p.pid);
}
function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(deadlineTimer);
  clearTimeout(escalationTimer);
  clearInterval(drainTimer);
  const recorded = journal(true);
  try {
    fs.closeSync(log);
  } finally {
    process.exit(recorded ? 0 : 1);
  }
}
function check() {
  const remaining = others();
  if (remaining?.length === 0 && (!child || closed)) finish();
  else if (!stopping && closed) stop("error");
}
function stop(why) {
  if (stopping || finished) return;
  stopping = true;
  reason = why;
  clearTimeout(deadlineTimer);
  escalationTimer = setTimeout(() => {
    escalated = true;
    journal(false);
    // Include this anchor: the group cannot be recycled between a leader's
    // exit and a delayed KILL. The backend confirms actual drain afterward.
    process.kill(-process.pid, "SIGKILL");
  }, 1000);
  drainTimer = setInterval(check, 30);
  // Arm cleanup before journaling. The supervisor catches TERM and remains
  // the group anchor even when a stopped launcher exits before its children.
  try {
    process.kill(-process.pid, "SIGTERM");
  } catch {}
  journal(false);
  check();
}
process.on("SIGTERM", () => {
  if (!stopping) stop("cancel");
});
process.on("SIGINT", () => stop("cancel"));
process.on("disconnect", () => stop("parent-lost"));
process.on("uncaughtException", () => stop("error"));
process.on("unhandledRejection", () => stop("error"));
deadlineTimer = setTimeout(() => stop("error"), 5000);
process.on("message", (message) => {
  if (!process.connected) {
    stop("parent-lost");
    return;
  }
  if (message?.type === "cancel") {
    stop("cancel");
    return;
  }
  if (
    started ||
    stopping ||
    message?.type !== "start" ||
    message.token !== token
  )
    return;
  const { command, args, cwd, env, timeoutMs, prefix } = message;
  if (
    !path.isAbsolute(command ?? "") ||
    !path.isAbsolute(cwd ?? "") ||
    !Array.isArray(args) ||
    !args.every((a) => typeof a === "string") ||
    !env ||
    typeof env !== "object" ||
    (timeoutMs !== null &&
      (!Number.isInteger(timeoutMs) ||
        timeoutMs < 100 ||
        timeoutMs > 2_147_483_647))
  ) {
    stop("error");
    return;
  }
  started = true;
  clearTimeout(deadlineTimer);
  append(typeof prefix === "string" ? prefix : "", false);
  // Unlimited compilation still retains the launch handshake, Stop, parent-loss
  // cleanup and termination escalation. Only elapsed-time expiry is optional.
  if (timeoutMs !== null)
    deadlineTimer = setTimeout(() => stop("timeout"), timeoutMs);
  child = spawn(command, args, {
    cwd,
    env,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder("utf8");
    stream.on("data", (bytes) => append(decoder.write(bytes)));
    stream.on("end", () => append(decoder.end()));
  }
  child.on("error", () => stop("error"));
  child.on("exit", (exitCode, exitSignal) => {
    code = exitCode;
    signal = exitSignal;
    const remaining = others();
    // Descendants left behind by a finished launcher are still owned work.
    if (remaining === null || remaining.length) stop("error");
  });
  child.on("close", () => {
    closed = true;
    check();
  });
});
if (!process.connected) stop("parent-lost");
