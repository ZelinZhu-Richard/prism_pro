import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { createApp } from "../server/app";

test("patched static plugin serves encoded assets and honors final-path denial", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-static-"));
  fs.mkdirSync(path.join(root, "public", "nested"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "public", "nested", "Café paper.txt"),
    "Synthetic asset",
  );
  fs.writeFileSync(path.join(root, "public", "private.txt"), "Denied sentinel");
  fs.writeFileSync(path.join(root, "outside.txt"), "Outside sentinel");
  const app = Fastify();
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  await app.register(staticFiles, {
    root: path.join(root, "public"),
    allowedPath: (name) => !name.includes("private.txt"),
  });
  assert.equal(
    (await app.inject({ url: "/nested/Caf%C3%A9%20paper.txt" })).body,
    "Synthetic asset",
  );
  for (const url of [
    "/private.txt",
    "/%70rivate.txt",
    "/nested%2f..%2fprivate.txt",
    "/%2e%2e/outside.txt",
    "/nested/%2e%2e/%2e%2e/outside.txt",
  ]) {
    const response = await app.inject({ url });
    assert.ok(response.statusCode >= 400, `${url}: ${response.statusCode}`);
    assert.doesNotMatch(response.body, /Denied sentinel|Outside sentinel/);
  }
});

test("scoped glob override preserves static route enumeration and Prism's loopback/API boundaries", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-static-glob-")),
    app = Fastify();
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "assets", "nested.txt"), "Enumerated asset");
  fs.writeFileSync(path.join(root, "index.html"), "Synthetic index");
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  await app.register(staticFiles, { root, wildcard: false });
  assert.equal(
    (await app.inject({ url: "/assets/nested.txt" })).body,
    "Enumerated asset",
  );
  assert.equal((await app.inject({ url: "/" })).body, "Synthetic index");
  const env = await createApp(path.join(root, "state"), { seed: false });
  t.after(() => env.app.close());
  const headers = { host: "127.0.0.1:4317" };
  assert.equal((await env.app.inject({ url: "/", headers })).statusCode, 200);
  assert.equal(
    (await env.app.inject({ url: "/api/not-an-endpoint", headers })).statusCode,
    404,
  );
  assert.equal(
    (
      await env.app.inject({
        url: "/",
        headers: { ...headers, origin: "https://outside.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await env.app.inject({
        url: "/api/health",
        headers: { host: "outside.invalid" },
      })
    ).statusCode,
    403,
  );
});
