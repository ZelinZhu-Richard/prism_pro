import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { api, ApiError } from "../api";
import type { CompileJob, Engine } from "../../shared/types";
import {
  requiredTexTools,
  type TexRuntimeCatalog,
} from "../../shared/tex-runtimes";
import {
  compileOptions,
  type CompileSettings,
  type BuildFiles,
  type BuildExportPlan,
  type BuildDownload,
} from "../../shared/compiler";
import { Modal } from "./Modal";
import "./build-tools.css";

const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "The request failed. Try again; your selection is kept.";
const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${Math.ceil(n / 1024)} KiB`
      : `${(n / 1024 / 1024).toFixed(1)} MiB`;

export function CompileOptionsDialog({
  projectId,
  engine,
  locked,
  onClose,
  onSaved,
}: {
  projectId: string;
  engine: Engine;
  locked: boolean;
  onClose: () => void;
  onSaved: (s: CompileSettings) => void;
}) {
  const [settings, setSettings] = useState<CompileSettings | null>(null),
    [draft, setDraft] = useState(compileOptions()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [catalog, setCatalog] = useState<TexRuntimeCatalog | null>(null);
  const runtime = catalog?.runtimes.find(
    (r) => r.id === (draft.runtimeId ?? "system"),
  );
  const missing = runtime
    ? requiredTexTools(engine).filter((tool) => !runtime.tools[tool])
    : [];
  const alive = useRef(true),
    version = useRef(0),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    alive.current = true;
    void load(true);
    return () => {
      alive.current = false;
      version.current++;
    };
  }, [projectId]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function load(initial = false, refresh = false) {
    const serial = ++version.current;
    setBusy(true);
    setError("");
    try {
      const [s, c] = await Promise.all([
        api<CompileSettings>(`/projects/${projectId}/compile-options`),
        api<TexRuntimeCatalog>(
          `/tex-runtimes${refresh ? "/refresh" : ""}`,
          refresh ? "POST" : "GET",
        ),
      ]);
      if (!alive.current || serial !== version.current) return;
      setSettings(s);
      setCatalog(c);
      if (initial) setDraft(compileOptions(s));
    } catch (e) {
      if (alive.current && serial === version.current) setError(message(e));
    } finally {
      if (alive.current && serial === version.current) setBusy(false);
    }
  }
  async function save() {
    if (!settings || locked) return;
    const serial = ++version.current;
    setBusy(true);
    setError("");
    try {
      const s = await api<CompileSettings>(
        `/projects/${projectId}/compile-options`,
        "PUT",
        { ...draft, revision: settings.revision },
      );
      if (alive.current && serial === version.current) {
        setSettings(s);
        onSaved(s);
        onClose();
      }
    } catch (e) {
      if (alive.current && serial === version.current) setError(message(e));
    } finally {
      if (alive.current && serial === version.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="Compile options"
      onClose={onClose}
      dismissible={!busy}
      className="compile-options-dialog"
    >
      {locked && (
        <p className="compile-options-lock" role="status">
          Runtime and compile options are read-only while the assistant works.
          Save after it finishes or stops.
        </p>
      )}
      {error && (
        <p
          className="build-tool-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}
      <div className="compile-options-body">
        <p>
          Saved for this project. Changes apply to the next build; existing
          build snapshots keep their options.
        </p>
        <label>
          TeX runtime
          <select
            aria-label="TeX runtime"
            value={draft.runtimeId ?? "system"}
            disabled={busy || !settings || locked || !catalog}
            onChange={(e) => setDraft({ ...draft, runtimeId: e.target.value })}
          >
            {!runtime && (
              <option value={draft.runtimeId ?? "system"}>
                Selected runtime · unavailable
              </option>
            )}
            {catalog?.runtimes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <p className="build-runtime-path">{runtime?.binDir}</p>
        <p>
          System follows your Mac’s TeX selection when runtimes are refreshed.
          Choose a named version to pin its installation. No runtime is
          installed or substituted automatically.
        </p>
        {catalog && (!runtime?.available || missing.length > 0) && (
          <p role="status">
            {!runtime?.available
              ? (runtime?.problem ??
                "The selected installation is missing. Refresh runtimes or choose another installed version.")
              : `Missing for ${engine === "latex" ? "LaTeX → DVI → PS → PDF" : engine}: ${missing.join(", ")}.`}
            {missing.some((n) => n === "gs" || n === "ps2pdf")
              ? " Install Ghostscript (brew install ghostscript), then refresh runtimes."
              : ""}
          </p>
        )}
        {catalog?.problems.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {catalog?.personalTex?.kind === "ready" && (
          <p role="status">
            Personal TeX tree ready · {catalog.personalTex.files} files
          </p>
        )}
        {catalog?.personalTex?.kind === "unavailable" && (
          <p role="status">{catalog.personalTex.problem}</p>
        )}
        <button
          className="build-runtime-refresh"
          disabled={busy}
          onClick={() => void load(false, true)}
        >
          Refresh runtimes
        </button>
        <label>
          Compile mode
          <select
            aria-label="Compile mode"
            value={draft.mode}
            disabled={busy || !settings || locked}
            onChange={(e) =>
              setDraft({ ...draft, mode: e.target.value as "normal" | "draft" })
            }
          >
            <option value="normal">Normal</option>
            <option value="draft">Fast draft — graphics as boxes</option>
          </select>
        </label>
        <p>
          Fast draft skips standard image rendering. Custom graphics and
          explicit per-image overrides can behave differently.
        </p>
        <label>
          Error handling
          <select
            aria-label="Compile error handling"
            value={draft.errorHandling}
            disabled={busy || !settings || locked}
            onChange={(e) =>
              setDraft({
                ...draft,
                errorHandling: e.target.value as "stop" | "continue",
              })
            }
          >
            <option value="stop">Stop on first error</option>
            <option value="continue">Continue after errors</option>
          </select>
        </label>
        <p>
          Continue may produce a PDF with errors. It is labeled explicitly and
          never becomes the last successful build.
        </p>
        {!settings && !error && <p role="status">Loading compile options…</p>}
      </div>
      <footer className="build-tool-actions">
        <button
          className="primary"
          disabled={busy || !settings || locked || !runtime?.available}
          onClick={() => void save()}
        >
          {busy ? "Working…" : "Save options"}
        </button>
        <button disabled={busy} onClick={() => void load()}>
          Refresh options
        </button>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </footer>
    </Modal>
  );
}

export function GeneratedFiles({
  jobs,
  initialBuildId,
  onClose,
}: {
  jobs: CompileJob[];
  initialBuildId: string;
  onClose: () => void;
}) {
  const finished = jobs.filter(
    (j) => !["queued", "running"].includes(j.status),
  );
  const [id, setId] = useState(initialBuildId),
    [data, setData] = useState<BuildFiles | null>(null),
    [selection, setSelection] = useState<Set<string>>(new Set()),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(200),
    [includeSource, setIncludeSource] = useState(false),
    [active, setActive] = useState(""),
    [text, setText] = useState<{
      text: string | null;
      reason: string | null;
    } | null>(null),
    [plan, setPlan] = useState<BuildExportPlan | null>(null),
    [allowReplace, setAllowReplace] = useState(false),
    [download, setDownload] = useState<BuildDownload | null>(null),
    [requested, setRequested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    version = useRef(0),
    previewVersion = useRef(0),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      version.current++;
      previewVersion.current++;
    };
  }, []);
  useEffect(() => {
    setData(null);
    setSelection(new Set());
    setActive("");
    setText(null);
    setIncludeSource(false);
    setQuery("");
    setPlan(null);
    setDownload(null);
    setAllowReplace(false);
    setRequested(false);
    setLimit(200);
    void load(true);
  }, [id]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function load(initial = false) {
    const n = ++version.current;
    previewVersion.current++;
    setActive("");
    setText(null);
    setBusy(true);
    setError("");
    setPlan(null);
    setDownload(null);
    setRequested(false);
    try {
      const result = await api<BuildFiles>(`/builds/${id}/files`);
      if (!alive.current || n !== version.current) return;
      setData(result);
      setSelection(
        (old) =>
          new Set(
            result.files
              .filter((f) => initial || old.has(f.path))
              .map((f) => f.path),
          ),
      );
    } catch (e) {
      if (alive.current && n === version.current) setError(message(e));
    } finally {
      if (alive.current && n === version.current) setBusy(false);
    }
  }
  async function inspect(p: string) {
    const n = ++previewVersion.current;
    setActive(p);
    setText(null);
    try {
      const result = await api<{ text: string | null; reason: string | null }>(
        `/builds/${id}/files/text?path=${encodeURIComponent(p)}`,
      );
      if (alive.current && n === previewVersion.current) setText(result);
    } catch (e) {
      if (alive.current && n === previewVersion.current)
        setText({ text: null, reason: message(e) });
    }
  }
  function invalidate() {
    setPlan(null);
    setDownload(null);
    setRequested(false);
    setAllowReplace(false);
    setError("");
  }
  function toggle(p: string) {
    invalidate();
    setSelection((old) => {
      const next = new Set(old);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }
  async function review() {
    const n = ++version.current;
    setBusy(true);
    setError("");
    setDownload(null);
    setRequested(false);
    setAllowReplace(false);
    try {
      const result = await api<BuildExportPlan>(
        `/builds/${id}/exports/preview`,
        "POST",
        { paths: [...selection], includeSource },
      );
      if (alive.current && n === version.current) {
        setPlan(result);
        setLimit(200);
      }
    } catch (e) {
      if (alive.current && n === version.current) setError(message(e));
    } finally {
      if (alive.current && n === version.current) setBusy(false);
    }
  }
  async function prepare() {
    if (!plan) return;
    const n = ++version.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<BuildDownload>(`/builds/${id}/exports`, "POST", {
        paths: plan.paths,
        includeSource: plan.includeSource,
        hash: plan.hash,
        allowReplace,
      });
      if (alive.current && n === version.current) {
        setDownload(result);
        setRequested(false);
      }
    } catch (e) {
      if (alive.current && n === version.current) {
        setError(message(e));
        if (e instanceof ApiError && e.status === 409) {
          setPlan(null);
          setDownload(null);
        }
      }
    } finally {
      if (alive.current && n === version.current) setBusy(false);
    }
  }
  const filtered =
      data?.files.filter((f) =>
        f.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ) ?? [],
    chosen = data?.files.filter((f) => selection.has(f.path)) ?? [],
    current = jobs.find((j) => j.id === id);
  return (
    <Modal
      title={plan ? "Review build ZIP" : "Generated files"}
      onClose={onClose}
      dismissible={!busy}
      wide
      className="build-files-dialog"
    >
      <div className="build-files-context">
        <label>
          Build
          <select
            aria-label="Generated files build"
            value={id}
            disabled={busy}
            onChange={(e) => setId(e.target.value)}
          >
            {finished.map((j) => (
              <option value={j.id} key={j.id}>
                {new Date(j.started).toLocaleString()} · {j.status} ·{" "}
                {compileOptions(j.options).mode === "draft"
                  ? "Fast draft"
                  : "Normal"}{" "}
                · {j.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <p>
          {data
            ? `${data.root} · ${data.engine} · ${data.preview ? "isolated preview" : "source version " + data.generation}`
            : current?.root}{" "}
          · Build {id.slice(0, 8)}
        </p>
        <p title={data?.runtime?.binDir}>
          {data?.runtime?.label ?? "Runtime not recorded for this older build."}
        </p>
        <p>
          Files belong to this finished build. Its source snapshot can differ
          from the current editor.{" "}
          {data && data.status !== "succeeded"
            ? "Unsuccessful builds may have incomplete files."
            : ""}
        </p>
      </div>
      {error && (
        <p
          className="build-tool-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}
      {download && (
        <div className="build-download-status" role="status">
          <strong>{requested ? "Download requested" : "ZIP prepared"}</strong>
          <p>
            {size(download.bytes)}.{" "}
            {requested
              ? "Check your browser’s downloads. If no file appears, use the link again or prepare another ZIP."
              : "Select Download ZIP to request a browser save; this review stays open."}{" "}
            Links expire after 15 minutes or Leaf restart.
          </p>
        </div>
      )}
      {plan ? (
        <div className="build-zip-review">
          <h3>
            {plan.includeSource
              ? "Source snapshot and selected output"
              : "Selected generated files"}
          </h3>
          <p>
            {plan.files.length} entries · {size(plan.bytes)} before compression.
            Your project files, history and conversation stay unchanged.
          </p>
          {plan.collisions.length > 0 && (
            <fieldset className="build-collision-review">
              <legend>Source files replaced inside this ZIP</legend>
              <ul>
                {plan.collisions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={allowReplace}
                  disabled={busy || !!download}
                  onChange={(e) => setAllowReplace(e.target.checked)}
                />
                Use the generated versions for these source files in the ZIP
              </label>
            </fieldset>
          )}
          <ul
            className="build-export-entries"
            aria-label="Reviewed ZIP entries"
          >
            {plan.files.slice(0, limit).map((f) => (
              <li key={f.path}>
                <span>{f.path}</span>
                <small>{size(f.bytes)}</small>
              </li>
            ))}
          </ul>
          {plan.files.length > limit && (
            <button onClick={() => setLimit((n) => n + 200)}>
              Show 200 more ZIP entries
            </button>
          )}
          {plan.includeSource && (
            <p>
              This combines the build’s source and selected outputs at their
              recorded paths. Check your publisher’s file requirements before
              submission.
            </p>
          )}
        </div>
      ) : (
        <div className="build-file-workspace">
          <section
            className="build-file-list"
            aria-label="Generated file selection"
          >
            <div className="build-file-controls">
              <label>
                Find a generated file
                <input
                  aria-label="Find generated files"
                  value={query}
                  disabled={busy}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(200);
                  }}
                />
              </label>
              <div className="build-file-selection">
                <button
                  disabled={!data || busy}
                  onClick={() => {
                    invalidate();
                    setSelection(new Set(data!.files.map((f) => f.path)));
                  }}
                >
                  Select all
                </button>
                <button
                  disabled={!selection.size || busy}
                  onClick={() => {
                    invalidate();
                    setSelection(new Set());
                  }}
                >
                  Clear
                </button>
                <span role="status">
                  {selection.size} selected ·{" "}
                  {size(chosen.reduce((n, f) => n + f.bytes, 0))}
                </span>
              </div>
            </div>
            <div className="build-file-rows">
              <ul aria-label="Generated files">
                {filtered.slice(0, limit).map((f) => (
                  <li key={f.path}>
                    <input
                      type="checkbox"
                      aria-label={`Include output ${f.path}`}
                      checked={selection.has(f.path)}
                      disabled={busy}
                      onChange={() => toggle(f.path)}
                    />
                    <button
                      className={active === f.path ? "active" : ""}
                      onClick={() => void inspect(f.path)}
                      aria-label={`Inspect ${f.path}`}
                    >
                      <span>{f.path}</span>
                      <small>{size(f.bytes)}</small>
                    </button>
                    <a
                      href={`/api/builds/${id}/files/download?path=${encodeURIComponent(f.path)}`}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Download ${f.path}`}
                      title={`Download ${f.path}`}
                    >
                      <ArrowDownToLine size={14} />
                    </a>
                  </li>
                ))}
              </ul>
              {filtered.length > limit && (
                <button onClick={() => setLimit((n) => n + 200)}>
                  Show 200 more files
                </button>
              )}
              {!data && !error && <p role="status">Loading generated files…</p>}
              {data && !filtered.length && (
                <p>
                  {data.files.length
                    ? "No generated files match this search."
                    : "This build produced no generated files."}
                </p>
              )}
            </div>
          </section>
          <section
            className="build-file-text"
            aria-label="Generated file inspection"
          >
            <h3>{active || "Inspect a generated file"}</h3>
            {active && !text ? (
              <p role="status">Reading file…</p>
            ) : text?.text !== null && text ? (
              <textarea
                aria-label="Generated text preview"
                readOnly
                value={text.text}
                spellCheck={false}
              />
            ) : (
              <p>
                {text?.reason ||
                  "Select a file name to read its text. Use its download action for binary or large files."}
              </p>
            )}
          </section>
        </div>
      )}
      {!plan && (
        <div className="build-source-option">
          <label>
            <input
              type="checkbox"
              checked={includeSource}
              disabled={busy || !data}
              onChange={(e) => {
                invalidate();
                setIncludeSource(e.target.checked);
              }}
            />
            Include this build’s source snapshot
          </label>
          <p>
            {data
              ? `${data.sourceFiles} source files/folders · ${size(data.sourceBytes)}. `
              : ""}
            Review any generated files that replace source paths. ZIPs are
            limited to 100 MiB; text previews to 512 KiB.
          </p>
        </div>
      )}
      <footer className="build-tool-actions">
        {download ? (
          <>
            <a
              className="primary"
              href={download.url}
              download={download.filename}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setRequested(true)}
            >
              Download ZIP
            </a>
            <button disabled={busy} onClick={() => void prepare()}>
              Prepare ZIP again
            </button>
          </>
        ) : plan ? (
          <button
            className="primary"
            disabled={busy || (!!plan.collisions.length && !allowReplace)}
            onClick={() => void prepare()}
          >
            {busy ? "Preparing…" : "Prepare ZIP"}
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy || !data || (!selection.size && !includeSource)}
            onClick={() => void review()}
          >
            {busy ? "Working…" : "Review ZIP"}
          </button>
        )}
        {plan ? (
          <button
            disabled={busy}
            onClick={() => {
              invalidate();
              setLimit(200);
            }}
          >
            Change selection
          </button>
        ) : (
          <button disabled={busy} onClick={() => void load()}>
            Refresh files
          </button>
        )}
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </footer>
    </Modal>
  );
}
