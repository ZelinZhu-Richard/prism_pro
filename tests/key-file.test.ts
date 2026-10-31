import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { keyStatus, readKeyFile, updateKeyFile } from "../server/key-file";
import { providers } from "../shared/types";
import { providerConfig } from "../server/provider-config";
import { createApp } from "../server/app";

function directory(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-keys-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("key updates persist every provider, keep unrelated multiline settings, and hide status values", (t) => {
  const root = directory(t);
  const original =
    '# Keep this comment\nPORT=4317\nNOTE="first\nQWEN_API_KEY=not-an-assignment\nlast"\n';
  fs.writeFileSync(path.join(root, ".env"), original);
  for (const provider of providers) {
    updateKeyFile(root, provider, "fixture-secret-" + provider);
    assert.equal(
      parseEnv(readKeyFile(root))[providerConfig[provider].env],
      "fixture-secret-" + provider,
    );
  }
  assert.ok(readKeyFile(root).startsWith(original));
  assert.equal(fs.statSync(path.join(root, ".env")).mode & 0o777, 0o600);
  const states = keyStatus(root, {});
  assert.ok(states.every((s) => s.configured && s.source === ".env"));
  assert.ok(!JSON.stringify(states).includes("fixture-secret"));
  for (const provider of providers) updateKeyFile(root, provider, null);
  assert.equal(readKeyFile(root), original);
  assert.ok(keyStatus(root, {}).every((s) => !s.configured));
});
test("CLI key-file updates reject injection, symlinks and overlapping writes without losing configuration", (t) => {
  const root = directory(t),
    file = path.join(root, ".env");
  const original = "KEEP=yes\n";
  fs.writeFileSync(file, original);
  for (const key of [
    "",
    "one\nOPENAI_API_KEY=injected",
    "nul\x00",
    "x".repeat(1001),
    "unclosed'quote",
  ])
    assert.throws(() => updateKeyFile(root, "gemini", key), /API keys/);
  assert.equal(readKeyFile(root), original);
  fs.writeFileSync(path.join(root, ".env.lock"), "fixture");
  assert.throws(() => updateKeyFile(root, "gemini", "secret"), /in progress/);
  fs.unlinkSync(path.join(root, ".env.lock"));
  fs.renameSync(file, path.join(root, "target"));
  fs.symlinkSync(path.join(root, "target"), file);
  assert.throws(() => updateKeyFile(root, "gemini", "secret"), /symlink/);
  assert.equal(fs.readFileSync(path.join(root, "target"), "utf8"), original);
});
test("aliases, endpoint validation, environment precedence and local removal", (t) => {
  const root = directory(t),
    file = path.join(root, ".env");
  fs.writeFileSync(file, "DASHSCOPE_API_KEY=old\nGOOGLE_API_KEY=google\n");
  const endpoint =
    "https://my-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
  updateKeyFile(root, "qwen", "new", endpoint);
  const values = parseEnv(readKeyFile(root));
  assert.equal(values.DASHSCOPE_API_KEY, undefined);
  assert.equal(values.QWEN_BASE_URL, endpoint);
  assert.equal(
    keyStatus(root, { QWEN_API_KEY: "shell" }).find(
      (s) => s.provider === "qwen",
    )?.source,
    "environment",
  );
  const before = readKeyFile(root);
  assert.throws(
    () =>
      updateKeyFile(
        root,
        "qwen",
        "new",
        "https://evil.test/compatible-mode/v1",
      ),
    /official Alibaba/,
  );
  assert.equal(readKeyFile(root), before);
  updateKeyFile(root, "gemini", null);
  assert.equal(parseEnv(readKeyFile(root)).GOOGLE_API_KEY, undefined);
});
test("CLI help and usage never echo a mistakenly supplied key argument", () => {
  const help = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/keys.ts", "--help"],
    { encoding: "utf8" },
  );
  assert.equal(help.status, 0);
  for (const provider of providers)
    assert.match(help.stdout, new RegExp(provider));
  const rejected = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/keys.ts", "set", "gemini", "argument-secret"],
    { encoding: "utf8" },
  );
  assert.equal(rejected.status, 1);
  assert.ok(!(rejected.stdout + rejected.stderr).includes("argument-secret"));
});
test("new providers are accepted by local settings APIs; endpoint-only updates retain a session key", async (t) => {
  const { app, keys } = await createApp(directory(t), { seed: false });
  t.after(() => app.close());
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  for (const provider of ["gemini", "qwen"]) {
    const saved = await app.inject({
      method: "PUT",
      url: `/api/providers/${provider}/key`,
      headers,
      payload: { key: "fixture-secret" },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().configured, true);
    assert.ok(!saved.body.includes("fixture-secret"));
    const preference = await app.inject({
      method: "PUT",
      url: "/api/settings/preferences",
      headers,
      payload: { provider },
    });
    assert.equal(preference.statusCode, 200);
    const settings = await app.inject({ url: "/api/settings", headers });
    assert.equal(settings.json().preferences.provider, provider);
  }
  const changed = await app.inject({
    method: "PUT",
    url: "/api/providers/qwen/key",
    headers,
    payload: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(keys.key("qwen"), "fixture-secret");
  const denied = await app.inject({
    method: "PUT",
    url: "/api/providers/qwen/key",
    headers,
    payload: { baseUrl: "https://evil.test/compatible-mode/v1", key: "new" },
  });
  assert.equal(denied.statusCode, 400);
  assert.equal(keys.key("qwen"), "fixture-secret");
});
test("CLI stdin, status and removal work end to end without printing credentials", (t) => {
  const root = directory(t);
  for (const file of [
    "scripts/keys.ts",
    "server/key-file.ts",
    "server/provider-config.ts",
    "shared/types.ts",
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"));
  const run = (args: string[], input?: string) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/keys.ts", ...args],
      { cwd: root, encoding: "utf8", input },
    );
  const saved = run(["set", "gemini", "--stdin"], "cli-fixture-secret\n");
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(
    parseEnv(readKeyFile(root)).GEMINI_API_KEY,
    "cli-fixture-secret",
  );
  assert.ok(!(saved.stdout + saved.stderr).includes("cli-fixture-secret"));
  const status = run(["status", "gemini"]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /configured/);
  assert.ok(!status.stdout.includes("cli-fixture-secret"));
  assert.equal(run(["remove", "gemini"]).status, 0);
  assert.equal(parseEnv(readKeyFile(root)).GEMINI_API_KEY, undefined);
});
