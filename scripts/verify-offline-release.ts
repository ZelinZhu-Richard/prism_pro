import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readZip } from "../server/files";
import { processGroup, supervisorIdentity } from "../server/supervision";
import { defaultSearch } from "../shared/search";
import type { CompileJob, Project, TextFile } from "../shared/types";
import type {
  LocalOpenReview,
  LocalOpenResult,
} from "../shared/local-projects";
import type {
  DiskResolution,
  DiskReview,
  SourceDraft,
} from "../shared/source-recovery";
import { offlineArchive } from "./offline-fixture";

assert.equal(
  process.platform,
  "darwin",
  "The verifier needs the macOS sandbox.",
);
const nonce = randomUUID(),
  root = path.resolve("data/verification/offline-release-" + nonce),
  dist = path.join(root, "dist"),
  assetPrefix = "assets-" + nonce,
  url = "http://127.0.0.1:5173",
  profile = path.join(root, "loopback-listener.sb");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  profile,
  `(version 1)
(allow default)
(deny network*)
(allow network-bind (local tcp "localhost:5173"))
(allow network-inbound (local tcp "localhost:5173"))
`,
);
const built = spawnSync(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "build",
    "--outDir",
    dist,
    "--assetsDir",
    assetPrefix,
  ],
  { encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
);
fs.writeFileSync(
  path.join(root, "build.log"),
  (built.stdout ?? "") + (built.stderr ?? ""),
);
assert.equal(built.status, 0, built.stderr || built.error?.message);
console.log("Verification directory:", root);

const entries = await readZip(offlineArchive(root)),
  file = "sections/introduction.tex",
  query = "?path=" + encodeURIComponent(file),
  checks: string[] = [];
type Mode = "kernel" | "workflow";
type Ready = {
  mode: Mode;
  pid: number;
  kernelDenied?: string;
  nested?: { status: number | null; error: string };
};
type Evidence = {
  socketAttempts: string[];
  appGuard?: { generations: number; blocked: unknown[] };
};

function launch(mode: Mode, label: string) {
  const ready = path.join(root, mode + "-ready.json"),
    home = path.join(root, label + "-home");
  fs.rmSync(ready, { force: true });
  fs.mkdirSync(home, { mode: 0o700 });
  const args = [
    "--import",
    "tsx",
    path.resolve("scripts/offline-release-server.ts"),
    root,
    mode,
  ];
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: home,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    PRISM_CODEX_BIN: path.join(home, "absent-codex"),
    PRISM_CLAUDE_BIN: path.join(home, "absent-claude"),
  };
  const log = fs.openSync(path.join(root, label + ".log"), "w");
  const worker =
    mode === "kernel"
      ? spawn(
          "/usr/bin/sandbox-exec",
          ["-f", profile, process.execPath, ...args],
          { env, stdio: ["ignore", log, log] },
        )
      : spawn(process.execPath, args, { env, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  let terminal = false;
  const ended = new Promise<number | null>((resolve) => {
    worker.once("error", () => {
      terminal = true;
      resolve(null);
    });
    worker.once("exit", (code) => {
      terminal = true;
      resolve(code);
    });
  });
  return {
    async ready(): Promise<Ready> {
      const deadline = Date.now() + 15_000;
      while (!terminal && Date.now() < deadline) {
        if (fs.existsSync(ready)) {
          const value = JSON.parse(fs.readFileSync(ready, "utf8")) as Ready;
          assert.equal(value.pid, worker.pid);
          assert.equal(value.mode, mode);
          return value;
        }
        await delay(30);
      }
      throw new Error(
        "Isolated Leaf did not listen. See " + path.join(root, label + ".log"),
      );
    },
    async stop(): Promise<Evidence> {
      if (!terminal) worker.kill("SIGTERM");
      const code = await ended;
      assert.equal(code, 0, "Isolated Leaf did not close cleanly: " + label);
      const report = fs.readFileSync(
        path.join(root, mode + "-server.json"),
        "utf8",
      );
      fs.writeFileSync(path.join(root, label + "-evidence.json"), report);
      return JSON.parse(report);
    },
  };
}

async function request(
  endpoint: string,
  method = "GET",
  payload?: object,
  status = 200,
) {
  const response = await fetch(url + endpoint, {
    method,
    headers: {
      connection: "close",
      "x-prism-request": "1",
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== status)
    throw new Error(
      endpoint +
        " returned " +
        response.status +
        ": " +
        (await response.text()).slice(0, 300),
    );
  assert.equal(response.headers.get("cache-control"), "no-store", endpoint);
  return response;
}
async function json<T>(endpoint: string, method = "GET", payload?: object) {
  return (await request(endpoint, method, payload)).json() as Promise<T>;
}
function pass(message: string) {
  checks.push(message);
  console.log("PASS", message);
}
async function checkLaunch() {
  const html = await (await request("/?offlineCheck=" + nonce)).text(),
    script = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
  assert(script && script.startsWith("/" + assetPrefix + "/"));
  assert((await (await request(script)).arrayBuffer()).byteLength > 1000);
  const settings = await json<{
    providers: Record<string, { configured: boolean }>;
  }>("/api/settings");
  assert(
    Object.values(settings.providers).every((provider) => !provider.configured),
  );
}
async function open(mode: Mode) {
  const folder = path.join(root, mode + "-paper");
  for (const entry of entries) {
    const target = path.join(folder, entry.path);
    if (entry.directory) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.data);
    }
  }
  fs.writeFileSync(
    path.join(folder, ".latexmkrc"),
    "die 'HIDDEN CONFIG MUST STAY INERT';\n",
  );
  const input = { path: folder, mode: "folder" },
    review = await json<LocalOpenReview>(
      "/api/local-projects/review",
      "POST",
      input,
    ),
    { project } = await json<LocalOpenResult>(
      "/api/local-projects/open",
      "POST",
      { ...input, token: review.token, main: "main.tex" },
    );
  assert.equal(project.storage?.folder, fs.realpathSync(folder));
  assert(review.skipped.some((entry) => entry.reason.includes("Hidden")));
  return { folder, project, base: "/api/projects/" + project.id };
}
async function verifyExport(base: string, folder: string, mode: Mode) {
  const bytes = Buffer.from(
      await (await request(base + "/export")).arrayBuffer(),
    ),
    round = await readZip(bytes);
  assert.deepEqual(
    round.map((entry) => entry.path).sort(),
    entries.map((entry) => entry.path).sort(),
  );
  for (const entry of round)
    if (!entry.directory)
      assert.deepEqual(
        entry.data,
        fs.readFileSync(path.join(folder, entry.path)),
      );
  fs.writeFileSync(path.join(root, mode + "-source.zip"), bytes);
}
async function compile(project: Project) {
  let job = await json<CompileJob>(
    "/api/projects/" + project.id + "/compile",
    "POST",
    {},
  );
  const deadline = Date.now() + 45_000;
  while (["running", "queued"].includes(job.status)) {
    assert(
      Date.now() < deadline,
      "Build did not complete before the verification deadline",
    );
    await delay(30);
    job = await json<CompileJob>("/api/builds/" + job.id);
  }
  assert.equal(job.status, "succeeded", job.log.slice(-2400));
  const supervisor = supervisorIdentity(
    path.join(root, "workflow-state", "builds", job.id),
  );
  assert(supervisor);
  assert.deepEqual(processGroup(supervisor.pid), []);
  return job;
}

let active: ReturnType<typeof launch> | undefined;
try {
  active = launch("kernel", "kernel-first");
  const kernelProbe = await active.ready();
  assert.match(kernelProbe.kernelDenied ?? "", /^(EPERM|EACCES)$/);
  await checkLaunch();
  pass(
    "Fresh production assets and local settings load under macOS outbound socket denial",
  );
  const kernel = await open("kernel"),
    original = await json<TextFile>(kernel.base + "/file" + query);
  const saved = await json<TextFile>(kernel.base + "/file" + query, "PUT", {
    revision: original.revision,
    content: original.content.replace(
      "Offline writing",
      "Kernel-isolated writing",
    ),
  });
  const draft: SourceDraft = {
    id: "prism:source-draft:v1:" + randomUUID(),
    project: kernel.project.id,
    path: file,
    revision: saved.revision,
    text: saved.content + "\n% Unsaved kernel verification draft.",
    sequence: 1,
    updated: Date.now(),
  };
  await json(kernel.base + "/source-drafts", "PUT", draft);
  await verifyExport(kernel.base, kernel.folder, "kernel");
  pass(
    "Linked opening, source saving, draft mirroring and exact ZIP export work under OS socket denial",
  );
  await active.stop();
  active = undefined;

  const external = saved.content.replace(
    "Kernel-isolated writing",
    "External offline writing",
  );
  fs.writeFileSync(path.join(kernel.folder, file), external);
  active = launch("kernel", "kernel-restart");
  await active.ready();
  assert.equal(
    (await json<TextFile>(kernel.base + "/file" + query)).content,
    external,
  );
  assert.equal(
    fs.readFileSync(path.join(kernel.folder, file), "utf8"),
    external,
  );
  assert(
    (await json<SourceDraft[]>(kernel.base + "/source-drafts")).some(
      (item) => item.id === draft.id && item.text === draft.text,
    ),
  );
  pass(
    "A fresh OS-restricted process preserves an outside edit and the exact unsaved draft",
  );
  await active.stop();
  active = undefined;

  active = launch("workflow", "workflow");
  await active.ready();
  await checkLaunch();
  const linked = await open("workflow"),
    first = await compile(linked.project),
    firstPdf = "/api/builds/" + first.id + "/pdf";
  const originalPdf = Buffer.from(
    await (await request(firstPdf)).arrayBuffer(),
  );
  assert.equal(originalPdf.subarray(0, 5).toString(), "%PDF-");
  const firstSource = await json<TextFile>(linked.base + "/file" + query),
    disk = firstSource.content.replace(
      "Offline writing",
      "Offline external writing",
    );
  fs.writeFileSync(path.join(linked.folder, file), disk);
  await request(
    linked.base + "/file" + query,
    "PUT",
    {
      revision: firstSource.revision,
      content: "Stale attempted write.",
    },
    409,
  );
  assert.equal(fs.readFileSync(path.join(linked.folder, file), "utf8"), disk);
  const review = await json<DiskReview>(linked.base + "/disk" + query);
  assert.equal(review.disk.content, disk);
  assert.equal(review.saved.content, firstSource.content);
  const resolved = await json<DiskResolution>(
    linked.base + "/disk/resolve",
    "POST",
    { path: file, token: review.token, action: "disk" },
  );
  assert.equal(resolved.file?.content, disk);
  const build = await compile(resolved.project);
  assert.equal(build.incrementalFrom, first.id);
  assert.deepEqual(
    Buffer.from(await (await request(firstPdf)).arrayBuffer()),
    originalPdf,
  );
  pass(
    "Real compilation, linked-file conflict review and incremental rebuild preserve the earlier PDF",
  );

  const sync = "/api/builds/" + build.id + "/sync";
  const point = await json<{ page: number; x: number; y: number }>(
    sync,
    "POST",
    {
      direction: "forward",
      path: "sections/results.tex",
      line: 2,
    },
  );
  const inverse = await json<{ path: string }>(sync, "POST", {
    direction: "inverse",
    ...point,
  });
  assert.equal(inverse.path, "sections/results.tex");
  assert.equal(point.page, 2);
  const bibliography = await json<{ citations: { key: string }[] }>(
    linked.base + "/intelligence",
  );
  assert(bibliography.citations.some((entry) => entry.key === "local2026"));
  assert(
    (await json<{ text: number }>(linked.base + "/word-count", "POST", {}))
      .text > 20,
  );
  const search = await json<{ files: { path: string }[] }>(
    linked.base + "/search",
    "POST",
    { ...defaultSearch, query: "Offline external" },
  );
  assert(search.files.some((entry) => entry.path === file));
  for (const language of ["en-US", "en-GB"])
    for (const part of ["aff", "dic"])
      assert(
        (
          await (
            await request(`/api/writing/dictionary/${language}/${part}`)
          ).text()
        ).length > 1000,
      );
  await verifyExport(linked.base, linked.folder, "workflow");
  assert(!fs.existsSync(path.join(root, "imported-script-ran")));
  assert(!fs.existsSync(path.join(root, "imported-config-ran")));
  pass(
    "SyncTeX, references, search, TeXcount, both dictionaries and exact ZIP export work with backend socket dials blocked",
  );

  if (process.argv.includes("--browser")) {
    console.log("Browser preview:", url + "/?offlineCheck=" + nonce);
    console.log("Press Enter to close the verifier and save its report.");
    await new Promise<void>((resolve) => {
      const stop = () => {
        process.stdin.off("data", stop);
        process.stdin.pause();
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        resolve();
      };
      process.stdin.once("data", stop);
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }
  const evidence = await active.stop();
  active = undefined;
  assert.deepEqual(evidence.socketAttempts, []);
  assert.deepEqual(evidence.appGuard?.blocked, []);
  assert.equal(evidence.appGuard?.generations, 0);
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        root,
        assetPrefix,
        checks,
        kernelProbe,
        linked: linked.project.id,
        jobs: [first.id, build.id],
        workflowEvidence: evidence,
      },
      null,
      2,
    ),
  );
  console.log("Report:", path.join(root, "report.json"));
} finally {
  if (active)
    await active.stop().catch((error: Error) => console.error(error.message));
}
