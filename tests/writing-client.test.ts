import test from "node:test";
import assert from "node:assert/strict";
import { WritingClient, type WritingWorker } from "../src/writing-client";
import type { WritingRequest, WritingResponse } from "../src/writing-protocol";
class FakeWorker implements WritingWorker {
  onmessage: WritingWorker["onmessage"] = null;
  onerror: WritingWorker["onerror"] = null;
  sent: (WritingRequest & { id: number })[] = [];
  terminated = false;
  postMessage(data: WritingRequest & { id: number }) {
    this.sent.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: WritingResponse) {
    this.onmessage?.({ data } as MessageEvent<WritingResponse>);
  }
}
const request: WritingRequest = {
  type: "analyze",
  input: {
    source: "synthetic prose",
    language: "en-US",
    codeCheck: false,
    words: [],
    ignored: [],
  },
};
test("writing worker client coalesces queued checks and discards cancelled and out-of-order responses", async () => {
  const worker = new FakeWorker(),
    client = new WritingClient(() => worker),
    abort = new AbortController();
  const first = client.run(request, abort.signal);
  const rejected = assert.rejects(first, { name: "AbortError" });
  abort.abort();
  const second = client.run(request);
  const superseded = assert.rejects(second, { name: "AbortError" });
  const third = client.run({
    ...request,
    input: { ...request.input, source: "latest" },
  });
  assert.equal(worker.sent.length, 1);
  worker.reply({ id: 999, result: [] });
  assert.equal(worker.sent.length, 1);
  worker.reply({ id: worker.sent[0].id, result: [] });
  assert.equal(worker.sent.length, 2);
  worker.reply({ id: worker.sent[0].id, result: ["stale"] });
  worker.reply({ id: worker.sent[1].id, result: ["latest"] });
  assert.deepEqual(await third, ["latest"]);
  await rejected;
  await superseded;
  client.reset();
});
test("writing worker timeout recreates the worker, and reset rejects work without resuming it", async () => {
  const workers: FakeWorker[] = [],
    client = new WritingClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }, 20);
  await assert.rejects(client.run(request), /timed out/);
  assert.equal(workers[0].terminated, true);
  const second = client.run(request);
  const cancelled = assert.rejects(second, { name: "AbortError" });
  client.reset();
  await cancelled;
  assert.equal(workers[1].terminated, true);
  const next = client.run(request);
  workers[1].reply({ id: workers[1].sent[0].id, result: ["old"] });
  workers[2].reply({ id: workers[2].sent[0].id, result: [] });
  assert.deepEqual(await next, []);
  client.reset();
});
test("writing worker errors, dictionary errors and unavailable Worker leave callers with recoverable errors", async () => {
  const worker = new FakeWorker(),
    client = new WritingClient(() => worker);
  const first = client.run(request);
  worker.reply({ id: worker.sent[0].id, error: "Dictionary missing" });
  await assert.rejects(first, /Dictionary missing/);
  const next = client.run(request);
  worker.onerror?.({} as ErrorEvent);
  await assert.rejects(next, /stopped/);
  assert.equal(worker.terminated, true);
  client.reset();
  const unavailable = new WritingClient(() => {
    throw new Error("Worker unavailable");
  });
  await assert.rejects(unavailable.run(request), /Worker unavailable/);
  unavailable.reset();
});
test("aborted queued requests are removed and an already-aborted signal creates no worker", async () => {
  const worker = new FakeWorker(),
    client = new WritingClient(() => worker),
    abort = new AbortController();
  abort.abort();
  await assert.rejects(client.run(request, abort.signal), {
    name: "AbortError",
  });
  assert.equal(worker.sent.length, 0);
  const first = client.run(request),
    queuedAbort = new AbortController(),
    queued = client.run(request, queuedAbort.signal),
    rejected = assert.rejects(queued, { name: "AbortError" });
  queuedAbort.abort();
  worker.reply({ id: worker.sent[0].id, result: [] });
  await first;
  await rejected;
  assert.equal(worker.sent.length, 1);
  client.reset();
});
