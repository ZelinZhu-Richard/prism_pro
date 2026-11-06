import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { readZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";
import { defaultSearch, type SearchResult } from "../shared/search";
import type { CompileJob, Project, TextFile } from "../shared/types";
import type { DiskStatus } from "../shared/disk-status";
import type {
  LocalOpenResult,
  LocalOpenReview,
} from "../shared/local-projects";
import { offlineArchive, offlineWorkspace } from "./offline-fixture";

const root = path.resolve("data/verification/performance-" + randomUUID()),
  folder = path.join(root, "large-manuscript"),
  dist = path.resolve("dist"),
  browser = process.argv.includes("--browser"),
  host = "127.0.0.1:5173";
assert(
  fs.existsSync(path.join(dist, "index.html")),
  "Run npm run build first.",
);
const times: Record<string, number[]> = {};
const ms = (duration: number) => Math.round(duration * 100) / 100;
const idleWindowMs = 15000;
async function measure<T>(label: string, action: () => T | Promise<T>) {
  const start = performance.now();
  const result = await action();
  (times[label] ??= []).push(ms(performance.now() - start));
  return result;
}

const fixture = await measure("create fresh backend", () =>
  offlineWorkspace(path.join(root, "state"), dist),
);
const { app, store, compiler } = fixture;
const headers = { host, "x-prism-request": "1" };
async function request(
  url: string,
  method: "GET" | "PUT" | "POST" = "GET",
  payload?: object,
) {
  const response = await app.inject({ url, method, headers, payload });
  assert.equal(
    response.statusCode,
    200,
    `${method} ${url}: ${response.body.slice(0, 500)}`,
  );
  return response;
}
async function json<T>(
  url: string,
  method: "GET" | "PUT" | "POST" = "GET",
  payload?: object,
) {
  return (await request(url, method, payload)).json<T>();
}
async function idle(label: string) {
  const previous = fixture.evidence().requests.length;
  const start = performance.now(),
    cpu = process.cpuUsage();
  await delay(idleWindowMs);
  const elapsed = performance.now() - start,
    used = process.cpuUsage(cpu);
  const requests: Record<string, number> = {};
  for (const { method, url } of fixture.evidence().requests.slice(previous)) {
    const key = `${method} ${url.split("?")[0]}`;
    requests[key] = (requests[key] ?? 0) + 1;
  }
  return {
    label,
    targetMs: idleWindowMs,
    wallMs: ms(elapsed),
    comparable: elapsed <= idleWindowMs * 1.2,
    cpuMs: ms((used.user + used.system) / 1000),
    rssMiB: ms(process.memoryUsage.rss() / 2 ** 20),
    requests,
  };
}
async function finish(id: string, status: "succeeded" | "cancelled") {
  const until = performance.now() + 120000;
  for (;;) {
    const job = compiler.get(id)!;
    if (job.status !== "running" && job.status !== "queued") {
      assert.equal(job.status, status, job.log.slice(-3000));
      const identity = supervisorIdentity(compiler.dir(id));
      assert(identity);
      assert.deepEqual(processGroup(identity.pid), []);
      return job;
    }
    assert(performance.now() < until, "Performance fixture build timed out");
    await delay(25);
  }
}

try {
  await measure("Fastify ready", () => app.ready());
  times["fresh process to ready"] = [ms(process.uptime() * 1000)];
  if (browser) {
    await measure("loopback listener", () =>
      app.listen({ host: "127.0.0.1", port: 5173 }),
    );
  }
  const source = new Map<string, string | Buffer>();
  const image = (await readZip(offlineArchive(root))).find(
    (entry) => entry.path === "figures/local.png",
  )!.data;
  const chapters = Array.from({ length: 60 }, (_, i) =>
    String(i + 1).padStart(3, "0"),
  );
  const longPath = "sections/long-appendix.tex";
  const marker = "Performance leaf section 060 page 3";
  source.set(
    "main.tex",
    [
      String.raw`\documentclass{article}
\usepackage{amsmath,graphicx}
\usepackage[hidelinks]{hyperref}
\begin{document}
\section*{Leaf performance manuscript}
\clearpage`,
      ...chapters.map((chapter) => `\\input{sections/chapter-${chapter}}`),
      `\\input{${longPath}}`,
      String.raw`\bibliographystyle{plain}
\bibliography{references}
\end{document}`,
    ].join("\n") + "\n",
  );
  for (const chapter of chapters) {
    const pages = [1, 2, 3].map((page) =>
      [
        `\\section*{Performance leaf section ${chapter} page ${page}}`,
        ...Array.from(
          { length: 5 },
          (_, i) =>
            `Observation ${i + 1} records the effect of a synthetic analysis across a deliberately large manuscript. This paragraph is generated locally for a reproducible measurement.\\par`,
        ),
        page === 1
          ? `\\includegraphics[width=2cm]{figures/plot-${chapter}.png}\\par Study~\\cite{study${chapter}}.`
          : String.raw`\begin{equation}E = \sum_{i=1}^{n} x_i^2\end{equation}\begin{tabular}{lr} Method & Score\\ Synthetic & 1.0\end{tabular}`,
        "\\clearpage",
      ].join("\n"),
    );
    source.set(`sections/chapter-${chapter}.tex`, pages.join("\n") + "\n");
    source.set(`figures/plot-${chapter}.png`, image);
  }
  source.set(
    longPath,
    [
      "\\section{Large editable appendix}",
      "A final appendix is included as a long source fixture.",
      ...Array.from(
        { length: 4096 },
        (_, i) =>
          `% Local performance fixture row ${i + 1}. This long comment remains editable and produces no PDF output.`,
      ),
      "",
    ].join("\n"),
  );
  source.set(
    "references.bib",
    chapters
      .map(
        (chapter) =>
          `@article{study${chapter},author={Author, Ada},title={Synthetic study ${chapter}},journal={Local Methods},year={2026}}`,
      )
      .join("\n") + "\n",
  );
  for (let i = 1; i <= 240; i++) {
    const name = String(i).padStart(3, "0");
    source.set(
      `notes/note-${name}.txt`,
      `Search needle ${name}\n` +
        "Synthetic supporting notes for a large file tree.\n".repeat(30),
    );
  }
  for (const [name, data] of source) {
    const target = path.join(folder, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  const sourceBytes = [...source.values()].reduce(
    (sum, data) => sum + Buffer.byteLength(data),
    0,
  );
  const input = { mode: "folder", path: folder },
    review = await measure("review linked folder", () =>
      json<LocalOpenReview>("/api/local-projects/review", "POST", input),
    ),
    { project } = await measure("open linked folder", () =>
      json<LocalOpenResult>("/api/local-projects/open", "POST", {
        ...input,
        token: review.token,
        main: "main.tex",
      }),
    );
  assert.equal(project.storage?.folder, fs.realpathSync(folder));
  const base = `/api/projects/${project.id}`,
    query = `?path=${encodeURIComponent(longPath)}`;
  let editorFile: TextFile | undefined;
  for (let trial = 0; trial < 6; trial++) {
    const phase = trial === 0 ? "first" : "repeat";
    const state = await measure(`${phase} project metadata`, () =>
      json<Project>(base),
    );
    assert.equal(
      state.files.filter((file) => file.kind !== "directory").length,
      source.size,
    );
    editorFile = await measure(`${phase} large source load`, () =>
      json<TextFile>(base + "/file" + query),
    );
    assert.equal(editorFile.content, source.get(longPath));
    const disk = await measure(`${phase} disk check`, () =>
      json<DiskStatus>(base + "/disk/status"),
    );
    assert.equal(disk.changes.length, 0);
    const search = await measure(`${phase} project search`, () =>
      json<SearchResult>(base + "/search", "POST", {
        ...defaultSearch,
        query: "Search needle 042",
      }),
    );
    assert.equal(search.total, 1);
    assert.equal(search.files[0].path, "notes/note-042.txt");
  }

  async function compile(label: string, clean = false) {
    return measure(label, async () => {
      const job = await json<CompileJob>(base + "/compile", "POST", { clean });
      return finish(job.id, "succeeded");
    });
  }
  const initial = await compile("clean full build", true);
  const revised = editorFile!.content.replace(
    "A final appendix",
    "A revised appendix",
  );
  await measure("save large source", () =>
    request(base + "/file" + query, "PUT", {
      content: revised,
      revision: editorFile!.revision,
    }),
  );
  assert.equal(fs.readFileSync(path.join(folder, longPath), "utf8"), revised);
  const warm = await compile("incremental large-source rebuild");
  assert.equal(warm.incrementalFrom, initial.id);
  const pdfPath = compiler.pdfPath(warm.id);
  const info = spawnSync("pdfinfo", [pdfPath], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(info.status, 0, info.stderr || info.error?.message);
  const pages = Number(/^Pages:\s*(\d+)/m.exec(info.stdout)?.[1]);
  assert(pages >= 182, "Expected a large real PDF");
  const lastText = spawnSync("pdftotext", ["-f", "181", pdfPath, "-"], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(lastText.status, 0, lastText.stderr || lastText.error?.message);
  assert(lastText.stdout.includes(marker));
  assert(lastText.stdout.includes("A revised appendix"));

  const pending = await json<CompileJob>(base + "/compile", "POST", {
    clean: true,
  });
  const cancelDeadline = performance.now() + 10000;
  while (!compiler.get(pending.id)?.log.includes("Latexmk: applying rule")) {
    assert(
      compiler.get(pending.id)?.status === "running" &&
        performance.now() < cancelDeadline,
      "Expected an active TeX pass",
    );
    await delay(20);
  }
  await measure("stop active build and drain", async () => {
    await request(`/api/builds/${pending.id}/cancel`, "POST", {});
    await finish(pending.id, "cancelled");
  });
  assert.equal(compiler.latestPdf(project.id)?.id, warm.id);
  const zip = await measure(
    "export project ZIP",
    async () => (await request(base + "/export")).rawPayload,
  );
  const exported = await readZip(zip);
  for (const entry of exported.filter((entry) => !entry.directory))
    assert.deepEqual(
      entry.data,
      fs.readFileSync(path.join(folder, entry.path)),
    );
  assert.equal(
    exported.filter((entry) => !entry.directory).length,
    source.size,
  );
  assert.equal(store.project(project.id).storage?.writable, true);
  console.log(
    "Large linked project:",
    JSON.stringify({
      files: source.size,
      sourceBytes,
      pages,
      pdfBytes: fs.statSync(pdfPath).size,
    }),
  );
  console.log("Recorded timings in milliseconds:", JSON.stringify(times));
  const idleSamples = [await idle("no browser")];
  if (browser) {
    const lines = createInterface({ input: process.stdin });
    const events = lines[Symbol.asyncIterator]();
    const stop = () => lines.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      console.log(
        `Browser preview: http://${host}/?performance=${path.basename(root)}`,
      );
      console.log(
        "Press Enter with the project open to start a 15-second foreground idle sample.",
      );
      if (!(await events.next()).done) {
        idleSamples.push(await idle("project open in built-in browser"));
        console.log(
          "Foreground sample recorded. Press Enter to close the verifier.",
        );
        await events.next();
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      lines.close();
    }
  }
  const evidence = fixture.evidence();
  assert.deepEqual(evidence.blocked, []);
  assert.equal(evidence.generations, 0);
  const report = {
    machine: {
      os: os.type(),
      kernel: os.release(),
      macOS:
        process.platform === "darwin"
          ? spawnSync("/usr/bin/sw_vers", ["-productVersion"], {
              encoding: "utf8",
            }).stdout?.trim()
          : undefined,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model,
      logicalCores: os.cpus().length,
      memoryGiB: ms(os.totalmem() / 2 ** 30),
      node: process.version,
    },
    fixture: {
      files: source.size,
      sourceBytes,
      largeSourceBytes: Buffer.byteLength(revised),
      pages,
      pdfBytes: fs.statSync(pdfPath).size,
      zipBytes: zip.length,
      runtime: warm.runtime?.label,
      project: project.id,
    },
    timingsMs: times,
    idle: idleSamples,
    checks: {
      succeeded: [initial.id, warm.id],
      cancelled: pending.id,
      zipExact: true,
      aiRequests: evidence.generations,
      blockedOutboundFetches: evidence.blocked.length,
    },
  };
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Idle samples:", JSON.stringify(idleSamples));
  console.log("Report:", path.join(root, "report.json"));
} finally {
  await app.close();
  fixture.restoreFetch();
}
