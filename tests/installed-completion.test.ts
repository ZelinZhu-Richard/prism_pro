import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { latexCompletions } from "../src/latex-completion";
import {
  installedCompletions,
  type CompletionOwner,
} from "../src/installed-completion";
import type { TexPackageSearch } from "../shared/tex-packages";
const owner: CompletionOwner = {
  projectId: "A",
  runtimeId: "system",
  settingsRevision: 2,
};
function base(text = "\\usepackage{geo", pos = text.length) {
  return latexCompletions(
    new CompletionContext(EditorState.create({ doc: text }), pos, true),
    undefined,
    "main.tex",
  )!;
}
function result(query = "geo"): TexPackageSearch {
  return {
    projectId: "A",
    settingsRevision: 2,
    runtime: {
      id: "system",
      label: "System · Synthetic TeX",
      version: "TeX Live 2026",
      binDir: "/synthetic/bin",
      texRoot: "/synthetic",
      fingerprint: "a".repeat(64),
    },
    source: "texmf-dist/ls-R",
    status: "ready",
    checkedAt: "2026-11-02T00:00:00.000Z",
    fingerprint: "b".repeat(64),
    query,
    total: 2,
    limited: false,
    warnings: [],
    packages: [
      {
        name: "geometry",
        path: "tex/latex/geometry/geometry.sty",
        format: "sty",
      },
      {
        name: "geometry",
        path: "tex/latex/alternate/geometry.sty",
        format: "sty",
      },
    ],
  };
}
function fixture() {
  let current = true,
    reads = 0,
    signal: AbortSignal | undefined;
  const reports: string[] = [];
  const ports = {
    current: () => current,
    report: (s: string) => reports.push(s),
    read: async (q: string, s: AbortSignal) => {
      reads++;
      signal = s;
      return result(q);
    },
  };
  return {
    ports,
    reports,
    setCurrent: (v: boolean) => (current = v),
    reads: () => reads,
    signal: () => signal,
  };
}
function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test("installed package suggestions retain duplicate provenance and complete the full literal suffix", async () => {
  const text = "\\usepackage[options]{first, geometyr, keep}",
    b = base(text, text.indexOf("geometyr") + 2),
    f = fixture();
  assert.equal(b.packageQuery, "ge");
  assert.equal(text.slice(b.from, b.to), "geometyr");
  const c = await installedCompletions(b, owner, f.ports),
    option = c!.options.find((o) => o.label === "geometry")!;
  assert(option);
  assert.equal(option.detail, "Installed distribution");
  assert.match(option.info as string, /System · Synthetic TeX/);
  assert.match(option.info as string, /alternate/);
  assert.match(option.info as string, /dependencies/);
  assert.equal(
    text.slice(0, c!.from) + option.label + text.slice(c!.to!),
    "\\usepackage[options]{first, geometry, keep}",
  );
  assert.equal(f.reads(), 1);
  assert.deepEqual(f.reports, []);
});
test("project-local package wins while a used unverified name acquires installation provenance", async () => {
  const b = base(),
    local = {
      label: "geometry",
      detail: "Project package",
      info: "geometry.sty:1",
    };
  b.options = [local];
  const f = fixture();
  assert.equal(
    (await installedCompletions(b, owner, f.ports))!.options[0],
    local,
  );
  b.options = [
    {
      label: "geometry",
      detail: "Used in project · installation not checked",
      info: "main.tex:4",
    },
  ];
  const c = await installedCompletions(b, owner, f.ports);
  assert.equal(c!.options.length, 1);
  assert.equal(c!.options[0].detail, "Installed distribution");
  assert.match(c!.options[0].info as string, /main.tex:4/);
});
test("class files and path-only query matches are not offered as package basenames", async () => {
  const f = fixture();
  f.ports.read = async (q, s) => ({
    ...result(q),
    packages: [
      { name: "geoclass", path: "tex/latex/geo/geoclass.cls", format: "cls" },
      { name: "other", path: "tex/latex/geo/other.sty", format: "sty" },
    ],
  });
  assert.deepEqual(
    (await installedCompletions(base(), owner, f.ports))!.options,
    [],
  );
});
test("personal package suggestions keep separate provenance and project precedence", async () => {
  const f = fixture();
  const installed = result();
  installed.packages[0].origin = "personal";
  f.ports.read = async () => installed;
  const input = base();
  const completed = await installedCompletions(input, owner, f.ports);
  const option = completed?.options.find((entry) => entry.label === "geometry");
  assert.equal(option?.detail, "Personal TeX tree");
  assert.match(String(option?.info), /personal TeX tree/);
  assert.match(String(option?.info), /Indexed files in texmf-dist/);
  input.options = [{ label: "geometry", detail: "Project package" }];
  assert.equal((await installedCompletions(input, owner, f.ports))?.options[0], input.options[0]);
});
test("limited index/search notes remain in literal completion information", async () => {
  const f = fixture();
  f.ports.read = async (q, s) => ({
    ...result(q),
    limited: true,
    warnings: ["Synthetic index limit."],
  });
  const c = await installedCompletions(base(), owner, f.ports);
  assert.match(c!.options[0].info as string, /200 results/);
  assert.match(c!.options[0].info as string, /Synthetic index limit/);
});
test("other source contexts stay synchronous and never request installed metadata", async () => {
  const f = fixture(),
    b = base("\\sect");
  assert.equal(b.packageQuery, undefined);
  assert.equal(await installedCompletions(b, owner, f.ports), b);
  assert.equal(f.reads(), 0);
  for (const text of [
    "% \\usepackage{geo",
    String.raw`\\usepackage{geo`,
    String.raw`\verb|\usepackage{geo`,
    String.raw`\newcommand{\x}{\usepackage{geo`,
    String.raw`\begin{verbatim}\usepackage{geo`,
  ])
    assert.equal(base(text), null, text);
  assert.equal(
    latexCompletions(
      new CompletionContext(
        EditorState.create({
          doc: "\\usepackage{geo",
          extensions: EditorState.readOnly.of(true),
        }),
        15,
        true,
      ),
    ),
    null,
  );
});
test("unavailable catalogs and network errors retain project options with actionable retry guidance", async () => {
  for (const unavailable of [false, true]) {
    const f = fixture(),
      b = base();
    b.options = [{ label: "geolocal", detail: "Project package" }];
    f.ports.read = async (q, s) => {
      if (!unavailable) throw Error("Synthetic backend unavailable.");
      return {
        ...result(q),
        status: "unavailable",
        packages: [],
        total: 0,
        warnings: ["Database missing."],
      };
    };
    assert.equal(await installedCompletions(b, owner, f.ports), b);
    assert.equal(f.reports.length, 1);
    assert.match(f.reports[0], /Ctrl\+Space/);
    assert.match(f.reports[0], /Project package/);
  }
});
test("changed project/runtime/settings/query responses do not supply installed suggestions", async () => {
  for (const change of [
    { projectId: "B" },
    { settingsRevision: 3 },
    { runtime: { ...result().runtime, id: "other" } },
    { query: "other" },
  ]) {
    const f = fixture(),
      b = base();
    f.ports.read = async (q, s) => ({ ...result(q), ...change });
    assert.equal(await installedCompletions(b, owner, f.ports), b);
    assert.match(f.reports[0], /TeX selection or package response changed/);
  }
});
test("malformed or escaping package metadata is rejected before rendering suggestions", async () => {
  for (const change of [
    { path: "tex/../../outside.sty" },
    { name: "bad\\name" },
    { path: "tex/latex/\nfile.sty" },
    { format: "tex" },
  ]) {
    const f = fixture(),
      b = base();
    f.ports.read = async (q, s) =>
      ({
        ...result(q),
        packages: [{ ...result(q).packages[0], ...change }],
      }) as TexPackageSearch;
    assert.equal(await installedCompletions(b, owner, f.ports), b);
    assert.equal(f.reports.length, 1);
  }
});
test("file/runtime ownership changes ignore a late result and do not show an error", async () => {
  const f = fixture(),
    d = deferred<TexPackageSearch>();
  f.ports.read = () => d.promise;
  const p = installedCompletions(base(), owner, f.ports);
  f.setCurrent(false);
  d.resolve(result());
  assert.equal(await p, null);
  assert.deepEqual(f.reports, []);
});
test("cancellation aborts the local request and ignores an adapter's late response", async () => {
  const f = fixture(),
    abort = new AbortController(),
    d = deferred<TexPackageSearch>();
  let signal: AbortSignal | undefined;
  f.ports.read = (q, s) => {
    signal = s;
    return d.promise;
  };
  const p = installedCompletions(base(), owner, {
    ...f.ports,
    signal: abort.signal,
  });
  abort.abort();
  assert.equal(await p, null);
  assert(signal!.aborted);
  d.resolve(result());
  assert.deepEqual(f.reports, []);
  const before = fixture(),
    stopped = new AbortController();
  stopped.abort();
  assert.equal(
    await installedCompletions(base(), owner, {
      ...before.ports,
      signal: stopped.signal,
    }),
    null,
  );
  assert.equal(before.reads(), 0);
});
test("deadline returns local options, aborts pending work and allows a clean retry", async () => {
  const f = fixture(),
    b = base();
  let signal: AbortSignal | undefined;
  f.ports.read = (q, s) => {
    signal = s;
    return new Promise(() => {});
  };
  assert.equal(
    await installedCompletions(b, owner, { ...f.ports, deadlineMs: 5 }),
    b,
  );
  assert(signal!.aborted);
  assert.match(f.reports[0], /timed out/);
  f.ports.read = async (q, s) => result(q);
  assert(
    (await installedCompletions(b, owner, f.ports))!.options.some(
      (o) => o.label === "geometry",
    ),
  );
});
test("overlong package queries retain local completion without sending a request", async () => {
  const f = fixture(),
    b = base();
  b.packageQuery = "x".repeat(161);
  assert.equal(await installedCompletions(b, owner, f.ports), b);
  assert.equal(f.reads(), 0);
  assert.match(f.reports[0], /160 characters/);
});
