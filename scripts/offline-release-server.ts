import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import dgram from "node:dgram";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { offlineWorkspace } from "./offline-fixture";

const [directory, mode] = process.argv.slice(2);
const root = path.resolve(directory ?? "");
assert.equal(path.dirname(root), path.resolve("data/verification"));
assert.match(path.basename(root), /^offline-release-[A-Za-z0-9-]+$/);
assert(mode === "kernel" || mode === "workflow");

const state = path.join(root, mode + "-state");
const dist = path.join(root, "dist");
const socketAttempts: string[] = [];
const guard = (name: string) => () => {
  socketAttempts.push(name);
  throw new Error("Offline verifier blocked an outbound " + name + " socket");
};
if (mode === "workflow") {
  net.Socket.prototype.connect = guard("TCP");
  dgram.Socket.prototype.connect = guard("UDP connect");
  dgram.Socket.prototype.send = guard("UDP send");
  assert.throws(
    () => new net.Socket().connect(5173, "127.0.0.1"),
    /verifier blocked/,
  );
  const udp = dgram.createSocket("udp4");
  assert.throws(
    () => udp.send(Buffer.from("canary"), 5173, "127.0.0.1"),
    /verifier blocked/,
  );
  udp.close();
  assert.deepEqual(socketAttempts.splice(0), ["TCP", "UDP send"]);
}

const guarded =
  mode === "workflow" ? await offlineWorkspace(state, dist) : undefined;
const instance =
  guarded ??
  (await (
    await import("../server/app")
  ).createApp(state, { seed: false, dist }));
const { app } = instance;
const responses: {
  url: string;
  status: number;
  cache: unknown;
  bytes: unknown;
}[] = [];
app.addHook("onRequest", async (request) => {
  delete request.headers["if-none-match"];
  delete request.headers["if-modified-since"];
});
app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("Cache-Control", "no-store");
  return payload;
});
app.addHook("onResponse", async (request, reply) => {
  if (responses.length < 3000)
    responses.push({
      url: request.url,
      status: reply.statusCode,
      cache: reply.getHeader("cache-control"),
      bytes: reply.getHeader("content-length"),
    });
});

try {
  await app.listen({ host: "127.0.0.1", port: 5173 });
  let kernelDenied: string | undefined;
  let nested: { status: number | null; error: string } | undefined;
  if (mode === "kernel") {
    kernelDenied = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 5173 });
      socket.setTimeout(1000, () => {
        socket.destroy();
        reject(new Error("OS socket canary timed out"));
      });
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error("OS socket canary unexpectedly connected"));
      });
      socket.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EPERM" || error.code === "EACCES")
          resolve(error.code);
        else reject(error);
      });
    });
    const probe = spawnSync(
      "/usr/bin/sandbox-exec",
      ["-p", "(version 1)(allow default)(deny network*)", "/usr/bin/true"],
      { encoding: "utf8", timeout: 2000 },
    );
    nested = { status: probe.status, error: probe.stderr?.trim() ?? "" };
  }
  const stopped = new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve);
    process.once("SIGINT", resolve);
  });
  const ready = path.join(root, mode + "-ready.json");
  fs.writeFileSync(
    ready + ".tmp",
    JSON.stringify({
      pid: process.pid,
      mode,
      kernelDenied,
      nested,
    }),
  );
  fs.renameSync(ready + ".tmp", ready);
  await stopped;
} finally {
  await app.close();
  fs.writeFileSync(
    path.join(root, mode + "-server.json"),
    JSON.stringify(
      {
        socketAttempts,
        responses,
        appGuard: guarded?.evidence(),
      },
      null,
      2,
    ),
  );
  guarded?.restoreFetch();
}
