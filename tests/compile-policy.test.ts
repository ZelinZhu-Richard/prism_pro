import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  compileTimeout,
  compilerLimitsFromEnvironment,
  MAX_COMPILE_TIMEOUT_MS,
} from "../server/compile-policy";
import { createApp } from "../server/app";

test("local builds are unlimited by default and explicit zero disables elapsed-time expiry", () => {
  for (const value of [undefined, null, 0])
    assert.equal(compileTimeout(value), null);
  for (const environment of [
    {},
    { LEAF_COMPILE_TIMEOUT_MS: "" },
    { LEAF_COMPILE_TIMEOUT_MS: " 0 " },
  ])
    assert.deepEqual(compilerLimitsFromEnvironment(environment), {
      timeoutMs: null,
    });
});
test("trusted deadlines may exceed two minutes without exceeding Node's timer range", () => {
  for (const value of [100, 120000, 120001, 600000, MAX_COMPILE_TIMEOUT_MS])
    assert.equal(compileTimeout(value), value);
  assert.deepEqual(
    compilerLimitsFromEnvironment({ LEAF_COMPILE_TIMEOUT_MS: " 600000 " }),
    { timeoutMs: 600000 },
  );
});
test("invalid deadlines cannot overflow into an immediate timer or silently become unlimited", () => {
  for (const value of [
    -1,
    1,
    99,
    0.5,
    NaN,
    Infinity,
    MAX_COMPILE_TIMEOUT_MS + 1,
    "0",
    "100",
    true,
    {},
    [],
  ])
    assert.throws(() => compileTimeout(value), /deadline/);
  for (const value of [
    "no",
    "1e5",
    "Infinity",
    "100.0",
    "+100",
    "0100",
    "99",
    "-100",
    "2147483648",
    "9007199254740993",
    "100\n200",
  ])
    assert.throws(
      () => compilerLimitsFromEnvironment({ LEAF_COMPILE_TIMEOUT_MS: value }),
      /deadline|LEAF_COMPILE_TIMEOUT_MS/,
    );
});
for (const timeoutMs of [null, 600000] as const)
  test(`health reports ${timeoutMs ?? "unlimited"} policy and HTTP/project settings cannot change it`, async (t) => {
    const root = path.resolve(
      "data/verification/compile-policy-" + randomUUID(),
    );
    const f = await createApp(root, {
      seed: false,
      compilerLimits: { timeoutMs },
    });
    t.after(async () => {
      await f.app.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    const p = f.store.create("Synthetic policy", [
      {
        path: "main.tex",
        data: Buffer.from("% timeoutMs=100\n\\documentclass{article}"),
      },
    ]);
    const response = await f.app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:4317" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().compileTimeoutMs, timeoutMs);
    const options = f.compiler.configure(p.id, {
      mode: "normal",
      errorHandling: "stop",
      revision: 0,
      timeoutMs: 100,
    });
    assert.equal(f.compiler.timeoutMs, timeoutMs);
    assert.equal(Object.hasOwn(options, "timeoutMs"), false);
    assert.equal(f.store.readText(p.id, "main.tex").revision, 0);
  });
