import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  TexRuntimes,
  runtimeSnapshot,
  runtimePath,
} from "../server/tex-runtimes";
import {
  Compiler,
  compileArguments,
  compilerEnvironment,
  sandboxProfile,
} from "../server/compiler";
import { TEX_TOOLS, requiredTexTools } from "../shared/tex-runtimes";
import { compileOptions, sameCompileOptions } from "../shared/compiler";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { api as clientApi } from "../src/api";

function fixture(t: any) {
  const root = path.resolve(
    "data/verification/tex-runtime-test-" + randomUUID(),
  );
  const tree = path.join(root, "texlive"),
    support = path.join(root, "support");
  fs.mkdirSync(support, { recursive: true });
  function script(file: string, text = "#!/bin/sh\nexit 0\n") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: 0o755 });
    fs.chmodSync(file, 0o755);
  }
  function install(year: string, includeSupport = false) {
    const prefix = path.join(tree, year),
      bin = path.join(prefix, "bin/universal-darwin");
    fs.mkdirSync(path.join(prefix, "texmf-dist"), { recursive: true });
    for (const name of TEX_TOOLS)
      if (includeSupport || !["gs", "ps2pdf"].includes(name))
        script(path.join(bin, name));
    script(
      path.join(bin, "pdftex"),
      `#!/bin/sh\n[ -z "$OPENAI_API_KEY$ANTHROPIC_API_KEY$TEXINPUTS$PERL5OPT" ] || exit 7\nprintf 'pdfTeX (TeX Live ${year})\\n'\n`,
    );
    return bin;
  }
  const first = install("2024"),
    second = install("2025");
  const system = path.join(root, "system");
  fs.symlinkSync(first, system);
  const runtimes = new TexRuntimes({
    systemBin: system,
    texLiveRoot: tree,
    extraBins: [],
    supportDirs: [support],
  });
  const store = new Store(path.join(root, "app")),
    compiler = new Compiler(store, runtimes);
  const p = store.create("Synthetic runtime", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\\begin{document}Synthetic.\\end{document}",
      ),
    },
  ]);
  let closed = false;
  const close = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  t.after(() => {
    close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    tree,
    support,
    first,
    second,
    system,
    runtimes,
    store,
    compiler,
    p,
    script,
    install,
    close,
  };
}
function neutral(s: ReturnType<typeof fixture>) {
  return JSON.stringify({
    project: s.store.project(s.p.id),
    files: s.store
      .exportFiles(s.p.id)
      .map((f) => [f.path, f.data.toString("base64"), f.directory]),
    history: s.store.checkpoints(s.p.id),
  });
}
test("installed catalog distinguishes System and pinned versions without duplicate aliases", (t) => {
  const s = fixture(t),
    c = s.runtimes.catalog();
  assert.equal(c.runtimes.length, 3);
  assert.deepEqual(c.problems, []);
  const system = s.runtimes.resolve();
  assert.equal(system.binDir, s.first);
  const pinned = c.runtimes.filter((r) => r.id !== "system");
  assert.equal(new Set(pinned.map((r) => r.binDir)).size, 2);
  assert.ok(pinned.some((r) => r.version === "TeX Live 2025"));
  assert.ok(!("commands" in c.runtimes[0]));
  assert.equal(JSON.stringify(c), JSON.stringify(s.runtimes.catalog()));
});
test("System follows an explicit refresh while a pinned version remains selected", (t) => {
  const s = fixture(t),
    old = s.runtimes
      .catalog()
      .runtimes.find((r) => r.id !== "system" && r.binDir === s.first)!;
  s.compiler.configure(s.p.id, {
    mode: "normal",
    errorHandling: "stop",
    runtimeId: old.id,
    revision: 0,
  });
  fs.unlinkSync(s.system);
  fs.symlinkSync(s.second, s.system);
  assert.equal(s.runtimes.resolve().binDir, s.first);
  s.runtimes.refresh();
  assert.equal(s.runtimes.resolve().binDir, s.second);
  assert.equal(
    s.runtimes.resolve(s.compiler.settings(s.p.id).runtimeId).binDir,
    s.first,
  );
  assert.equal(s.runtimes.forSnapshot(runtimeSnapshot(old)).binDir, s.first);
});
test("settings retain legacy defaults, enforce revisions and preserve runtime for old clients", (t) => {
  const s = fixture(t),
    before = neutral(s),
    id = s.runtimes.catalog().runtimes.find((r) => r.binDir === s.second)!.id;
  assert.deepEqual(s.compiler.settings(s.p.id), {
    mode: "normal",
    errorHandling: "stop",
    revision: 0,
  });
  const saved = s.compiler.configure(s.p.id, {
    mode: "draft",
    errorHandling: "stop",
    runtimeId: id,
    revision: 0,
  });
  assert.equal(saved.runtimeId, id);
  assert.equal(saved.revision, 1);
  assert.throws(
    () =>
      s.compiler.configure(s.p.id, {
        mode: "normal",
        errorHandling: "stop",
        runtimeId: "system",
        revision: 0,
      }),
    /changed in another/,
  );
  assert.deepEqual(
    s.compiler.configure(s.p.id, { ...saved, revision: 0 }),
    saved,
  );
  assert.equal(
    s.compiler.configure(s.p.id, {
      mode: "normal",
      errorHandling: "stop",
      revision: 1,
    }).runtimeId,
    id,
  );
  assert.equal(neutral(s), before);
  assert.ok(
    sameCompileOptions(undefined, {
      mode: "normal",
      errorHandling: "stop",
      runtimeId: "system",
    }),
  );
  assert.ok(
    !sameCompileOptions(undefined, {
      mode: "normal",
      errorHandling: "stop",
      runtimeId: id,
    }),
  );
  assert.deepEqual(compileOptions({ runtimeId: id }), {
    mode: "normal",
    errorHandling: "stop",
    runtimeId: id,
  });
});
test("restart retains a pinned choice and copied projects use System defaults", (t) => {
  const s = fixture(t),
    id = s.runtimes.catalog().runtimes.find((r) => r.binDir === s.second)!.id;
  const expected = s.compiler.configure(s.p.id, {
    mode: "draft",
    errorHandling: "continue",
    runtimeId: id,
    revision: 0,
  });
  const copy = s.store.copy(s.p.id, {
    name: "Copy",
    generation: s.store.project(s.p.id).generation,
    requestId: randomUUID(),
  });
  assert.equal(s.compiler.settings(copy.id).runtimeId, undefined);
  s.close();
  const reopened = new Store(path.join(s.root, "app"));
  try {
    assert.deepEqual(
      new Compiler(reopened, s.runtimes).settings(s.p.id),
      expected,
    );
  } finally {
    reopened.close();
  }
});
test("a removed selected runtime rejects compile without fallback or a created job", (t) => {
  const s = fixture(t),
    id = s.runtimes.catalog().runtimes.find((r) => r.binDir === s.second)!.id;
  s.compiler.configure(s.p.id, {
    mode: "normal",
    errorHandling: "stop",
    runtimeId: id,
    revision: 0,
  });
  const before = neutral(s);
  fs.rmSync(path.dirname(path.dirname(s.second)), { recursive: true });
  s.runtimes.refresh();
  assert.throws(() => s.compiler.start(s.p.id), /unavailable.*no fallback/i);
  assert.equal(s.compiler.jobs.size, 0);
  assert.equal(s.compiler.processes.size, 0);
  assert.equal(neutral(s), before);
});
test("changed executables and repointed tool symlinks require refreshed discovery", (t) => {
  const s = fixture(t),
    old = runtimeSnapshot(s.runtimes.resolve());
  s.script(path.join(s.first, "latexmk"), "#!/bin/sh\n# changed\nexit 0\n");
  assert.throws(() => s.runtimes.resolve(), /changed since discovery/);
  s.runtimes.refresh();
  assert.throws(() => s.runtimes.forSnapshot(old), /no longer available/);
  const fresh = s.runtimes.resolve();
  fs.unlinkSync(path.join(s.first, "pdflatex"));
  fs.symlinkSync(
    path.join(s.second, "pdflatex"),
    path.join(s.first, "pdflatex"),
  );
  assert.throws(() => s.runtimes.resolve(fresh.id), /changed since discovery/);
});
test("only Ghostscript support tools may be shared outside the chosen TeX installation", (t) => {
  const s = fixture(t);
  for (const name of ["gs", "ps2pdf", "biber", "xelatex"])
    s.script(path.join(s.support, name));
  fs.unlinkSync(path.join(s.second, "biber"));
  fs.unlinkSync(path.join(s.second, "xelatex"));
  s.runtimes.refresh();
  const chosen = s.runtimes
    .catalog()
    .runtimes.find((r) => r.binDir === s.second)!;
  assert.equal(chosen.tools.gs, true);
  assert.equal(chosen.tools.ps2pdf, true);
  assert.equal(chosen.tools.biber, false);
  assert.equal(chosen.tools.xelatex, false);
  assert.ok(
    runtimePath(s.runtimes.resolve(chosen.id)).startsWith(s.second + ":"),
  );
});
test("LaTeX pipeline requires latex/dvips/Ghostscript and preserves confinement flags", (t) => {
  const s = fixture(t),
    before = neutral(s);
  s.store.update(s.p.id, { engine: "latex" });
  assert.deepEqual(requiredTexTools("latex"), [
    "latexmk",
    "latex",
    "dvips",
    "ps2pdf",
    "gs",
  ]);
  assert.throws(
    () => s.compiler.start(s.p.id),
    /missing ps2pdf, gs.*Install Ghostscript/,
  );
  assert.equal(s.compiler.jobs.size, 0);
  for (const mode of ["normal", "draft"] as const)
    for (const errorHandling of ["stop", "continue"] as const) {
      const args = compileArguments("latex", { mode, errorHandling });
      assert.ok(args.includes("-pdfps"));
      assert.ok(args.includes("-norc"));
      assert.ok(args.includes("-no-shell-escape"));
      assert.equal(args.includes("-halt-on-error"), errorHandling === "stop");
    }
  assert.notEqual(neutral(s), before); // Only the explicit engine setting changed source metadata.
});
test("runtime environment excludes credentials and permits only read access to the selected installation", (t) => {
  const s = fixture(t),
    runtime = s.runtimes.resolve(),
    env = compilerEnvironment(path.join(s.root, "home"), runtime);
  assert.equal(env.GS_OPTIONS, "-dSAFER");
  assert.equal(env.shell_escape, "f");
  assert.ok(
    !Object.keys(env).some((n) =>
      /KEY|TOKEN|SECRET|TEXINPUTS|PERL5OPT/.test(n),
    ),
  );
  const build = path.join(s.root, "build");
  fs.mkdirSync(build);
  const profile = sandboxProfile(build, runtime);
  assert.ok(
    profile.includes(
      `(allow file-read* (subpath ${JSON.stringify(runtime.texRoot)}))`,
    ),
  );
  assert.ok(
    !profile.includes(
      `(allow file-write* (subpath ${JSON.stringify(runtime.texRoot)}`,
    ),
  );
  assert.doesNotMatch(profile, /allow network/);
});
test("runtime discovery probes cannot inherit provider or TeX configuration overrides", (t) => {
  const s = fixture(t),
    old = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = "synthetic-not-a-key";
    assert.equal(s.runtimes.resolve().available, true);
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
test("invalid custom directories remain explicit problems without replacing System", (t) => {
  const s = fixture(t),
    c = new TexRuntimes({
      systemBin: s.system,
      texLiveRoot: path.join(s.root, "absent"),
      extraBins: ["relative", s.support, path.join(s.root, "absent"), s.first],
      supportDirs: [],
    }).catalog();
  assert.equal(c.problems.length, 3);
  assert.equal(c.runtimes.length, 2);
  assert.equal(c.runtimes[0].id, "system");
  const unavailable = new TexRuntimes({
    systemBin: path.join(s.root, "absent"),
    texLiveRoot: path.join(s.root, "absent"),
    extraBins: [],
  }).catalog();
  assert.equal(unavailable.runtimes[0].available, false);
  assert.match(unavailable.runtimes[0].problem!, /Install TeX/);
});
test("unknown or malformed runtime requests cannot create jobs or overwrite settings", (t) => {
  const s = fixture(t),
    before = s.compiler.settings(s.p.id);
  for (const runtimeId of ["../bin", "tex-" + "f".repeat(24), 42, "", {}])
    assert.throws(() => s.compiler.configure(s.p.id, { ...before, runtimeId }));
  assert.deepEqual(s.compiler.settings(s.p.id), before);
  assert.equal(s.compiler.jobs.size, 0);
});
test("runtime choices obey active AI project locks", (t) => {
  const s = fixture(t);
  s.store.locks.set(s.p.id + "/main.tex", "synthetic-run");
  assert.throws(
    () =>
      s.compiler.configure(s.p.id, {
        mode: "draft",
        errorHandling: "stop",
        revision: 0,
      }),
    /typing|read-only|active/i,
  );
  assert.equal(s.compiler.settings(s.p.id).mode, "normal");
  s.store.locks.clear();
});
test("LaTeX engine is preserved in history and project copies", (t) => {
  const s = fixture(t);
  s.store.update(s.p.id, { engine: "latex" });
  const saved = s.store.checkpoint(s.p.id, "Classic engine");
  assert.equal(s.store.snapshot(s.p.id, saved.id).project.engine, "latex");
  const copy = s.store.copy(s.p.id, {
    name: "Classic copy",
    generation: s.store.project(s.p.id).generation,
    requestId: randomUUID(),
  });
  assert.equal(copy.engine, "latex");
  s.store.update(s.p.id, { engine: "pdflatex" });
  assert.equal(s.store.snapshot(s.p.id, saved.id).project.engine, "latex");
});
test("HTTP catalog refresh and pinned settings use the local request/origin guards", async (t) => {
  const s = fixture(t),
    { app, compiler } = await createApp(path.join(s.root, "http"), {
      seed: false,
      runtimes: s.runtimes,
    });
  t.after(() => app.close());
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const list = await app.inject({ url: "/api/tex-runtimes", headers });
  assert.equal(list.statusCode, 200);
  const id = list.json().runtimes.find((r: any) => r.binDir === s.second).id;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/tex-runtimes/refresh",
        headers: { host: headers.host },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/tex-runtimes/refresh",
        headers: { ...headers, origin: "https://example.com" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/tex-runtimes/refresh",
        headers,
      })
    ).statusCode,
    200,
  );
  assert.equal(compiler.jobs.size, 0);
  const unknown = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers,
    payload: { name: "HTTP" },
  });
  const projectId = unknown.json().id;
  const saved = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/compile-options`,
    headers,
    payload: {
      mode: "normal",
      errorHandling: "stop",
      runtimeId: id,
      revision: 0,
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const builds = await app.inject({
    url: `/api/projects/${projectId}/builds`,
    headers,
  });
  assert.equal(builds.json().runtime.binDir, s.second);
  assert.equal(builds.json().jobs.length, 0);
});
test("browser API helper can refresh runtimes without an empty JSON-body parser failure", async (t) => {
  const s = fixture(t),
    { app } = await createApp(path.join(s.root, "client-http"), {
      seed: false,
      runtimes: s.runtimes,
    });
  const original = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = original;
    await app.close();
  });
  const seen: any[] = [];
  globalThis.fetch = async (input, init) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    seen.push({ method: init?.method, headers, body: init?.body });
    const response = await app.inject({
      url: String(input),
      method: init?.method as "GET" | "POST",
      headers: { host: "127.0.0.1:4317", ...headers },
      payload: init?.body as string | undefined,
    });
    return new Response(response.body, { status: response.statusCode });
  };
  const result = await clientApi("/tex-runtimes/refresh", "POST");
  assert.equal(result.runtimes.length, 3);
  assert.equal(seen[0].headers["content-type"], undefined);
  const project = await clientApi("/projects", "POST", {
    name: "Synthetic client",
  });
  assert.equal(project.name, "Synthetic client");
  assert.equal(seen[1].headers["content-type"], "application/json");
});
