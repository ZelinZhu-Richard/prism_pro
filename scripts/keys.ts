import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";
import { providers, isProvider } from "../shared/types";
import { keyStatus, updateKeyFile } from "../server/key-file";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const help = `Prism API keys

  pnpm keys set <provider>                 Read a key with hidden input
  pnpm keys set <provider> --stdin         Read a key from a pipe
  pnpm keys set qwen --base-url <url>      Also save an Alibaba regional endpoint
  pnpm keys status [provider]              Show configuration, never key values
  pnpm keys remove <provider>              Remove local key and its aliases

Providers: ${providers.join(", ")}
Keys are saved in Prism's gitignored .env with owner-only permissions.
Restart Prism after changes. Session keys are managed separately in Settings.
Never pass a key as a command-line argument.`;

async function hiddenKey() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error(
      "Use --stdin for piped input, or run this command in a terminal.",
    );
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write("API key (hidden): ");
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const clean = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (data: Buffer) => {
      for (const char of data.toString("utf8")) {
        if (char === "\u0003" || char === "\u0004") {
          clean();
          reject(new Error("Cancelled. No key saved."));
          return;
        }
        if (char === "\r" || char === "\n") {
          clean();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && char <= "~") value += char;
        if (value.length > 1000) {
          clean();
          reject(new Error("API key is too long."));
          return;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function pipedKey() {
  let value = "";
  for await (const chunk of stdin) {
    value += chunk.toString();
    if (value.length > 1002) throw new Error("API key is too long.");
  }
  return value.replace(/\r?\n$/, "");
}

async function main() {
  const args = process.argv
    .slice(2)
    .filter((arg, i) => !(i === 0 && arg === "--"));
  if (!args.length || args[0] === "--help" || args[0] === "help") {
    console.log(help);
    return;
  }
  const [command, selected, ...options] = args;
  if (command === "status") {
    if (options.length || (selected && !isProvider(selected)))
      throw new Error("Use pnpm keys status [provider].");
    for (const row of keyStatus(root).filter(
      (row) => !selected || row.provider === selected,
    ))
      console.log(
        `${row.provider.padEnd(10)} ${row.configured ? "configured" : "not configured"} (${row.source})`,
      );
    return;
  }
  if (!isProvider(selected) || !["set", "remove"].includes(command))
    throw new Error("Unknown command or provider. Run pnpm keys --help.");
  let pipe = false,
    endpoint: string | undefined;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === "--stdin" && !pipe && command === "set") pipe = true;
    else if (
      options[i] === "--base-url" &&
      endpoint === undefined &&
      selected === "qwen" &&
      command === "set" &&
      options[i + 1]
    )
      endpoint = options[++i];
    else
      throw new Error(
        "Unsupported option. Run pnpm keys --help. Keys must use hidden input or --stdin.",
      );
  }
  const key =
    command === "remove" ? null : pipe ? await pipedKey() : await hiddenKey();
  updateKeyFile(root, selected, key, endpoint);
  console.log(
    `${selected}: ${key === null ? "local key removed" : "key saved"}. Restart Prism to apply. Existing environment or session keys may still be active.`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Key configuration failed.");
  process.exitCode = 1;
});
