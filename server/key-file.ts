import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { providerConfig, environmentKey, qwenBaseUrl } from "./provider-config";
import {
  apiProviders as providers,
  type ApiProvider as Provider,
} from "../shared/types";

export function readKeyFile(root: string) {
  const file = path.join(root, ".env");
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw new Error(
      "Cannot read .env safely. It must be a regular file, not a symlink.",
    );
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024)
      throw new Error(
        "The .env file must be a regular, unlinked file smaller than 1 MB.",
      );
    return fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

// Consume whole assignments, including quoted multiline values, so an API_KEY
// line inside another variable's value is never accidentally removed.
const assignment =
  /^[\t ]*(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*(?:"(?:[^"\\]|\\.)*"|'[^']*'|`[^`]*`|[^\r\n]*)(?:[\t ]*#[^\r\n]*)?(?:\r?\n|$)/gm;

export function updateKeyFile(
  root: string,
  provider: Provider,
  key: string | null,
  endpoint?: string,
) {
  if (
    key !== null &&
    (!key.trim() ||
      key.trim().length > 1000 ||
      !/^[\x21-\x7e]+$/.test(key.trim()) ||
      /["'`\\]/.test(key.trim()))
  )
    throw new Error(
      "API keys must be one line of printable characters (up to 1,000 characters).",
    );
  if (endpoint !== undefined && provider !== "qwen")
    throw new Error("--base-url is only supported for Qwen.");
  const normalized = endpoint === undefined ? undefined : qwenBaseUrl(endpoint);
  const file = path.join(root, ".env"),
    lock = path.join(root, ".env.lock");
  let lockFd: number;
  try {
    lockFd = fs.openSync(lock, "wx", 0o600);
  } catch {
    throw new Error("Another key update is in progress (.env.lock exists).");
  }
  const temporary = path.join(root, ".env." + randomUUID() + ".tmp");
  try {
    const before = readKeyFile(root),
      config = providerConfig[provider];
    const remove = new Set([config.env, ...(config.aliases ?? [])]);
    if (normalized !== undefined) {
      remove.add("QWEN_BASE_URL");
      remove.add("DASHSCOPE_BASE_URL");
    }
    let next = before.replace(assignment, (line, name: string) =>
      remove.has(name) ? "" : line,
    );
    if (next && !next.endsWith("\n")) next += "\n";
    if (key !== null) next += `${config.env}='${key.trim()}'\n`;
    if (normalized !== undefined) next += `QWEN_BASE_URL='${normalized}'\n`;
    // Re-parse before writing; malformed existing quoting must not swallow a key.
    const parsed = parseEnv(next);
    if (key !== null && parsed[config.env] !== key.trim())
      throw new Error("Fix the existing .env quoting before saving a key.");
    if (key === null && [...remove].some((name) => parsed[name] !== undefined))
      throw new Error("Could not safely remove this key from .env.");
    if (normalized !== undefined && parsed.QWEN_BASE_URL !== normalized)
      throw new Error("Could not safely save the endpoint.");
    fs.writeFileSync(temporary, next, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

export function keyStatus(root: string, env: NodeJS.ProcessEnv = process.env) {
  const local = parseEnv(readKeyFile(root));
  // Node's loadEnvFile leaves existing process environment values intact.
  const effective = { ...local, ...env };
  return providers.map((provider) => ({
    provider,
    configured: !!environmentKey(provider, effective),
    source: environmentKey(provider, env)
      ? "environment"
      : environmentKey(provider, local)
        ? ".env"
        : "none",
  }));
}
