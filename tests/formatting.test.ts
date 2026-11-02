import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { TexRuntimes } from "../server/tex-runtimes";
import { supervisorIdentity, processGroup } from "../server/supervision";
import type { FormatJob } from "../shared/formatting";
const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
const supported = process.platform === "darwin";
const source =
  "\\documentclass{article}\n\\newcommand{\\custom}[1]{#1}\n\\begin{document}\nText Café 新文本 👩🏽‍💻 é $x^2$.\\custom{Exact}\n\\end{document}\n";
const expected = source.replace("\nText", "\n  Text");
async function until(check: () => boolean, label: string, ms = 8000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw Error("Timed out: " + label);
    await new Promise((r) => setTimeout(r, 15));
  }
}
async function fixture(t: any, installed = true) {
  const root = path.resolve("data/verification/format-test-" + randomUUID()),
    tex = path.join(root, "texlive"),
    bin = path.join(tex, "2026/bin/universal-darwin");
  fs.mkdirSync(path.join(tex, "2026/texmf-dist"), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  const script = (name: string, text: string) => {
    fs.writeFileSync(path.join(bin, name), text, { mode: 0o755 });
    fs.chmodSync(path.join(bin, name), 0o755);
  };
  script("pdftex", "#!/bin/sh\nprintf 'pdfTeX (TeX Live 2026)\\n'\n");
  script("latexmk", "#!/bin/sh\nexit 0\n");
  if (installed)
    script(
      "latexindent",
      `#!/bin/sh
[ "$#" -eq 5 ] && [ "$1" = '-d' ] && [ "$2" = '-s' ] && [ "$5" = 'input.tex' ] || exit 31
[ -z "$OPENAI_API_KEY$ANTHROPIC_API_KEY$DEEPSEEK_API_KEY$GEMINI_API_KEY$QWEN_API_KEY$PERL5OPT$NODE_OPTIONS$TEXINPUTS" ] || exit 32
[ ! -e localSettings.yaml ] && [ ! -e build.sh ] && [ ! -e "$HOME/.indentconfig.yaml" ] || exit 33
dest="\${4#-o=}"
printf '%s\\n' "$@" > ../out/argv.txt
if /usr/bin/grep -q 'BLOCK' input.tex; then echo started > ../out/started; while :; do /bin/sleep 1; done; fi
if /usr/bin/grep -q 'SLOW' input.tex; then echo started > ../out/started; while [ ! -f ../out/release ]; do /bin/sleep 0.1; done; fi
if /usr/bin/grep -q 'FAIL' input.tex; then echo 'Synthetic Perl dependency failure.' >&2; exit 7; fi
if /usr/bin/grep -q 'EMPTY' input.tex; then : > "$dest"; exit 0; fi
if /usr/bin/grep -q 'INVALID' input.tex; then printf '\\377' > "$dest"; exit 0; fi
if /usr/bin/grep -q 'LINK' input.tex; then /bin/ln -s /usr/share/dict/words "$dest"; exit 0; fi
if /usr/bin/grep -q 'OVERSIZE' input.tex; then /bin/dd if=/dev/zero of="$dest" bs=1048576 count=3 2>/dev/null; exit 0; fi
/usr/bin/sed 's/^Text/  Text/' input.tex > "$dest"
`,
    );
  const runtimes = new TexRuntimes({
      systemBin: bin,
      texLiveRoot: tex,
      extraBins: [],
      supportDirs: [],
    }),
    app = await createApp(path.join(root, "app"), { seed: false, runtimes });
  const p = app.store.create("Formatter fixture", [
    { path: "main.tex", data: Buffer.from(source) },
    {
      path: "localSettings.yaml",
      data: Buffer.from("arbitrary project config is inert"),
    },
    { path: "build.sh", data: Buffer.from("exit 99") },
  ]);
  t.after(async () => {
    await app.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const neutral = () =>
    JSON.stringify({
      p: app.store.project(p.id),
      files: app.store
        .exportFiles(p.id)
        .map((f) => ({ path: f.path, data: f.data.toString("base64") })),
      history: app.store.checkpoints(p.id),
    });
  const start = (content = source, revision = 0) =>
    app.formatting.start(p.id, { path: "main.tex", content, revision });
  const finish = async (job: FormatJob) => {
    await until(() => job.status !== "running", "format finish");
    const identity = supervisorIdentity(
      path.join(root, "app/formatting", job.id),
    );
    assert.ok(identity);
    assert.deepEqual(processGroup(identity.pid), []);
    return job;
  };
  return { ...app, root, bin, p, script, neutral, start, finish };
}
test("formatter reports absent tool and rejects invalid/stale input without source/history writes", async (t) => {
  const s = await fixture(t, false),
    before = s.neutral();
  assert.equal(s.formatting.status(s.p.id).available, false);
  const response = await s.app.inject({
    method: "POST",
    url: `/api/projects/${s.p.id}/format`,
    headers,
    payload: { path: "main.tex", content: source, revision: 0 },
  });
  assert.equal(response.statusCode, 503);
  assert.match(response.json().error, /latexindent.*missing/);
  for (const payload of [
    { path: "../main.tex", content: source, revision: 0 },
    { path: "main.tex", content: source, revision: 9 },
    { path: "main.tex", content: "\0", revision: 0 },
    { path: "main.tex", content: "x".repeat(2 * 1024 * 1024 + 1), revision: 0 },
    { path: "main.tex", content: "\ud800", revision: 0 },
  ]) {
    const r = await s.app.inject({
      method: "POST",
      url: `/api/projects/${s.p.id}/format`,
      headers,
      payload,
    });
    assert.ok([400, 409].includes(r.statusCode), r.body);
  }
  assert.equal(s.neutral(), before);
});
test(
  "confined default-only formatter uses one immutable source and returns Unicode/custom source without changing history",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      before = s.neutral(),
      job = await s.finish(s.start());
    assert.equal(job.status, "succeeded", job.error + job.log);
    assert.equal(job.text, expected);
    assert.equal(s.neutral(), before);
    const dir = path.join(s.root, "app/formatting", job.id);
    assert.deepEqual(fs.readdirSync(path.join(dir, "source")), ["input.tex"]);
    assert.match(
      fs.readFileSync(path.join(dir, "out/argv.txt"), "utf8"),
      /^-d\n-s\n-c=.*\n-o=.*\ninput.tex\n$/,
    );
    const result = s.formatting.validate(s.p.id, job.id, { content: source });
    assert.equal(result.text, expected);
    assert.equal(s.neutral(), before);
    const other = s.store.create("Other", [
      { path: "main.tex", data: Buffer.from(source) },
    ]);
    assert.throws(
      () => s.formatting.get(other.id, job.id),
      /no longer available/,
    );
  },
);
test(
  "format validation rejects newer editor text, saved revisions and external disk bytes",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      job = await s.finish(s.start());
    assert.equal(job.status, "succeeded", job.log);
    assert.throws(
      () =>
        s.formatting.validate(s.p.id, job.id, { content: source + "% new" }),
      /editor text changed/,
    );
    const current = s.store.readText(s.p.id, "main.tex");
    s.store.save(s.p.id, "main.tex", source + "% saved", current.revision);
    assert.throws(
      () => s.formatting.validate(s.p.id, job.id, { content: source }),
      /file changed/,
    );
    const next = await s.finish(s.start(source + "% saved", 1));
    assert.equal(next.status, "succeeded", next.log);
    fs.writeFileSync(
      path.join(s.store.projectDir(s.p.id), "main.tex"),
      "External source remains.",
    );
    assert.throws(
      () =>
        s.formatting.validate(s.p.id, next.id, { content: source + "% saved" }),
      /file changed/,
    );
    assert.equal(
      fs.readFileSync(
        path.join(s.store.projectDir(s.p.id), "main.tex"),
        "utf8",
      ),
      "External source remains.",
    );
  },
);
test(
  "tool failures and empty, invalid, symlinked and oversized output never become source replacements",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      before = s.neutral();
    for (const marker of ["FAIL", "EMPTY", "INVALID", "LINK", "OVERSIZE"]) {
      const job = await s.finish(s.start(source + "% " + marker));
      assert.equal(job.status, "failed", marker);
      assert.equal(job.text, undefined);
      assert.ok(job.error);
      assert.equal(s.neutral(), before);
    }
  },
);
test(
  "cancel and app shutdown wait for formatter groups to drain, including a trashed project",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      before = s.neutral(),
      job = s.start(source + "% BLOCK"),
      dir = path.join(s.root, "app/formatting", job.id);
    await until(
      () => fs.existsSync(path.join(dir, "out/started")),
      "formatter start",
    );
    assert.throws(() => s.start(), /still running/);
    s.formatting.cancel(s.p.id, job.id);
    await s.finish(job);
    assert.equal(job.status, "cancelled");
    assert.equal(s.neutral(), before);
    const next = s.start(source + "% BLOCK");
    await until(
      () =>
        fs.existsSync(
          path.join(s.root, "app/formatting", next.id, "out/started"),
        ),
      "second formatter start",
    );
    s.store.trashProject(s.p.id);
    await s.formatting.shutdown();
    await s.finish(next);
    assert.equal(next.status, "cancelled");
  },
);
test(
  "changed formatter executable invalidates a completed result rather than promoting it",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      job = s.start(source + "% SLOW"),
      dir = path.join(s.root, "app/formatting", job.id);
    await until(
      () => fs.existsSync(path.join(dir, "out/started")),
      "formatter start",
    );
    const now = new Date(Date.now() + 2000);
    fs.utimesSync(path.join(s.bin, "latexindent"), now, now);
    fs.writeFileSync(path.join(dir, "out/release"), "continue");
    await s.finish(job);
    assert.equal(job.status, "failed");
    assert.match(job.error!, /formatter installation changed/);
    assert.equal(job.text, undefined);
  },
);
test(
  "request identifiers make retries idempotent and a pre-launch Stop prevents a delayed tool start",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      before = s.neutral(),
      stopped = randomUUID();
    const cancel = await s.app.inject({
      method: "POST",
      url: `/api/projects/${s.p.id}/format/${stopped}/cancel`,
      headers,
      payload: {},
    });
    assert.equal(cancel.statusCode, 200);
    assert.throws(
      () =>
        s.formatting.start(s.p.id, {
          path: "main.tex",
          content: source,
          revision: 0,
          requestId: stopped,
        }),
      /stopped before launch/,
    );
    assert.equal(s.formatting.jobs.size, 0);
    assert.equal(s.neutral(), before);
    const requestId = randomUUID(),
      request = { path: "main.tex", content: source, revision: 0, requestId },
      job = s.formatting.start(s.p.id, request);
    assert.equal(s.formatting.start(s.p.id, request), job);
    assert.throws(
      () =>
        s.formatting.start(s.p.id, {
          ...request,
          content: source + "different",
        }),
      /another request/,
    );
    await s.finish(job);
    assert.equal(job.status, "succeeded", job.log);
    assert.equal(s.formatting.jobs.size, 1);
    assert.equal(s.neutral(), before);
    const other = s.store.create("Other", [
      { path: "main.tex", data: Buffer.from(source) },
    ]);
    assert.throws(
      () => s.formatting.cancel(other.id, job.id),
      /no longer available/,
    );
  },
);
test(
  "formatter deadline fails the proposal only after the real process group drains",
  { skip: !supported },
  async (t) => {
    const s = await fixture(t),
      before = s.neutral(),
      job = s.start(source + "% BLOCK");
    await until(
      () => job.status !== "running",
      "formatter 15-second deadline",
      22000,
    );
    await s.finish(job);
    assert.equal(job.status, "failed");
    assert.match(job.error!, /exceeded 15 seconds/);
    assert.equal(s.neutral(), before);
  },
);
