import "./templates.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import type {
  TemplateInfo,
  TemplateDetail,
  TemplateSource,
  TemplateProjectResult,
  TemplateResult,
} from "../../shared/templates";
import type { CompileJob, Engine, Project } from "../../shared/types";
const PdfPreview = lazy(() =>
  import("./PdfPreview").then((m) => ({ default: m.PdfPreview })),
);
interface Pending {
  kind: "create" | "metadata";
  url: string;
  body: Record<string, unknown>;
}
export function TemplateBrowser({
  initialId = "",
  locked,
  onClose,
  onCreated,
}: {
  initialId?: string;
  locked: boolean;
  onClose: () => void;
  onCreated: (project: Project) => Promise<void>;
}) {
  const [scope, setScope] = useState(initialId ? "mine" : "builtin"),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<TemplateInfo[]>([]),
    [selected, setSelected] = useState(initialId || "builtin-blank"),
    [detail, setDetail] = useState<TemplateDetail>(),
    [source, setSource] = useState<TemplateSource>(),
    [file, setFile] = useState(""),
    [projectName, setProjectName] = useState(""),
    [root, setRoot] = useState(""),
    [engine, setEngine] = useState<Engine>("pdflatex"),
    [tab, setTab] = useState("source"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<Pending>(),
    [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState(false),
    [editName, setEditName] = useState(""),
    [description, setDescription] = useState(""),
    [job, setJob] = useState<CompileJob>(),
    [pdf, setPdf] = useState<CompileJob>(),
    [compilePending, setCompilePending] = useState(false);
  const alive = useRef(true),
    configuration = useRef(""),
    nameTouched = useRef(false),
    jobRef = useRef<CompileJob | undefined>(undefined),
    keyRef = useRef(""),
    errorRef = useRef<HTMLParagraphElement>(null);
  const selectionKey =
    detail && !detail.deletedAt
      ? [detail.id, detail.hash, root, engine].join("|")
      : "";
  keyRef.current = selectionKey;
  jobRef.current = job;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const j = jobRef.current;
      if (j && ["queued", "running"].includes(j.status))
        void api(`/builds/${j.id}/cancel`, "POST", {}).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    void api<TemplateInfo[]>(`/templates${scope === "trash" ? "?trash=1" : ""}`)
      .then((v) => {
        if (!stale) setItems(v);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [scope, refresh]);
  useEffect(() => {
    let stale = false;
    setDetail(undefined);
    setSource(undefined);
    if (!selected) return;
    void api<TemplateDetail>(`/templates/${encodeURIComponent(selected)}`)
      .then((v) => {
        if (stale) return;
        setDetail(v);
        const k = v.id + "|" + v.hash;
        if (configuration.current !== k) {
          configuration.current = k;
          setRoot(v.root || (v.roots.length === 1 ? v.roots[0] : ""));
          setEngine(v.engine);
          setFile(
            v.root ||
              v.entries.find((f) => f.kind === "text")?.path ||
              v.entries[0]?.path ||
              "",
          );
          setEditing(false);
          if (!nameTouched.current)
            setProjectName(v.id === "builtin-blank" ? "" : v.name);
        }
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [selected, refresh]);
  useEffect(() => {
    let stale = false;
    setSource(undefined);
    if (!detail || detail.deletedAt || !file) return;
    void api<TemplateSource>(
      `/templates/${detail.id}/file?path=${encodeURIComponent(file)}`,
    )
      .then((v) => {
        if (!stale) setSource(v);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [detail?.id, detail?.hash, detail?.deletedAt, file]);
  useEffect(() => {
    setJob(undefined);
    setPdf(undefined);
    return () => {
      const j = jobRef.current;
      if (j && ["queued", "running"].includes(j.status))
        void api(`/builds/${j.id}/cancel`, "POST", {}).catch(() => {});
    };
  }, [selectionKey]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    let stale = false;
    const timer = setInterval(
      () =>
        void api<CompileJob>(`/builds/${job.id}`)
          .then((v) => {
            if (!stale && keyRef.current === selectionKey) {
              setJob(v);
              if (v.status === "succeeded" && v.pdf) setPdf(v);
            }
          })
          .catch((e) => {
            if (!stale) setError(e.message);
          }),
      500,
    );
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  const running = !!job && ["queued", "running"].includes(job.status),
    disabled = working || !!pending,
    visible = items
      .filter((t) => (scope === "builtin" ? t.builtin : !t.builtin))
      .filter((t) => (scope === "trash" ? !!t.deletedAt : !t.deletedAt))
      .filter((t) =>
        (t.name + " " + t.description + " " + t.category)
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .includes(
            query.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase(),
          ),
      );
  async function execute(request: Pending) {
    if (working || (request.kind === "create" && locked)) return;
    setWorking(true);
    setPending(request);
    setError("");
    setNotice("");
    try {
      if (request.kind === "create") {
        const result = await api<TemplateProjectResult>(
          request.url,
          "POST",
          request.body,
        );
        await onCreated(result.project);
      } else {
        const result = await api<TemplateResult>(
          request.url,
          "POST",
          request.body,
        );
        setDetail(result.template);
        setItems((all) =>
          all.map((v) => (v.id === result.template.id ? result.template : v)),
        );
        setEditing(false);
        setNotice(
          request.body.action === "trash"
            ? "Template moved to Trash. Its source is recoverable."
            : request.body.action === "restore"
              ? "Template restored."
              : "Template details saved.",
        );
      }
      setPending(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof ApiError && e.status < 500) setPending(undefined);
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  async function compile() {
    if (
      !detail ||
      detail.id !== selected ||
      running ||
      compilePending ||
      detail.deletedAt ||
      !root
    )
      return;
    const key = selectionKey;
    setCompilePending(true);
    setError("");
    try {
      const next = await api<CompileJob>(
        `/templates/${detail.id}/compile`,
        "POST",
        { hash: detail.hash, expectedRevision: detail.revision, root, engine },
      );
      if (!alive.current || keyRef.current !== key) {
        void api(`/builds/${next.id}/cancel`, "POST", {});
        return;
      }
      setJob(next);
      setTab("pdf");
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setCompilePending(false);
    }
  }
  function metadata(action: string) {
    if (!detail) return;
    void execute({
      kind: "metadata",
      url: `/templates/${detail.id}/change`,
      body: {
        id: crypto.randomUUID(),
        action,
        expectedRevision: detail.revision,
        ...(action === "rename" ? { name: editName, description } : {}),
      },
    });
  }
  return (
    <Modal
      title="New project"
      wide
      className="template-modal"
      onClose={onClose}
      dismissible={!working}
    >
      <p className="template-intro">
        Start with a local template, inspect its source, or compile a separate
        PDF preview. Your original projects stay unchanged.
      </p>
      <div className="template-filters">
        <div role="group" aria-label="Template collection">
          {[
            ["builtin", "Built-in"],
            ["mine", "My templates"],
            ["trash", "Template Trash"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={scope === value}
              disabled={disabled}
              onClick={() => {
                setScope(value);
                setSelected("");
                setDetail(undefined);
                setSource(undefined);
                setQuery("");
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates…"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          disabled={disabled}
          onClick={() => {
            setError("");
            setRefresh((n) => n + 1);
          }}
        >
          Refresh templates
        </button>
      </div>
      {error && (
        <p className="template-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {pending && !working && (
        <div className="template-retry">
          <span>
            The action may already be saved. Retry the same request safely.
          </span>
          <button
            disabled={pending.kind === "create" && locked}
            onClick={() => void execute(pending)}
          >
            Retry {pending.kind === "create" ? "creation" : "template change"}
          </button>
        </div>
      )}
      {notice && (
        <p className="template-notice" role="status">
          {notice}
        </p>
      )}
      <div className="template-grid">
        <nav className="template-list" aria-label="Available templates">
          {loading ? (
            <p role="status">Loading templates…</p>
          ) : visible.length ? (
            visible.map((t) => (
              <button
                key={t.id}
                aria-pressed={selected === t.id}
                disabled={disabled}
                onClick={() => {
                  if (selected !== t.id) {
                    setDetail(undefined);
                    setSource(undefined);
                  }
                  setSelected(t.id);
                  setError("");
                  setNotice("");
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.description}</span>
                <small>
                  {t.category} · {t.files} {t.files === 1 ? "file" : "files"}
                </small>
              </button>
            ))
          ) : (
            <p className="field-help">
              {query
                ? "No matching templates."
                : scope === "mine"
                  ? "Save a project as a template from its project actions menu."
                  : scope === "trash"
                    ? "No templates in Trash."
                    : "No templates found."}
            </p>
          )}
        </nav>
        <section className="template-detail" aria-label="Template details">
          {detail ? (
            <>
              <h3>{detail.name}</h3>
              <p className="template-description">{detail.description}</p>
              <p className="field-help">
                {detail.builtin
                  ? "Prism built-in · generic starter"
                  : "Personal snapshot · stored on this computer"}{" "}
                · {detail.files} {detail.files === 1 ? "file" : "files"} ·{" "}
                {Math.max(1, Math.ceil(detail.bytes / 1024)).toLocaleString()}{" "}
                KiB
              </p>
              {!visible.some((v) => v.id === detail.id) && (
                <p className="field-help">
                  The selected template is outside this filter. Its name and
                  source remain shown here.
                </p>
              )}
              {!detail.builtin && (
                <div className="template-manage">
                  {!editing && (
                    <button
                      disabled={disabled}
                      onClick={() => {
                        setEditName(detail.name);
                        setDescription(detail.description);
                        setEditing(true);
                      }}
                    >
                      Edit details
                    </button>
                  )}
                  <button
                    disabled={disabled}
                    onClick={() =>
                      metadata(detail.deletedAt ? "restore" : "trash")
                    }
                  >
                    {detail.deletedAt
                      ? "Restore template"
                      : "Move template to Trash"}
                  </button>
                </div>
              )}
              {editing && (
                <form
                  className="template-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    metadata("rename");
                  }}
                >
                  <label>
                    Template name
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={120}
                      disabled={disabled}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      disabled={disabled}
                    />
                  </label>
                  <div>
                    <button disabled={disabled || !editName.trim()}>
                      Save details
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setEditing(false)}
                    >
                      Cancel details
                    </button>
                  </div>
                </form>
              )}
              {detail.deletedAt ? (
                <p className="template-empty">
                  This template is in Trash. Restore it before using, compiling
                  or downloading its source.
                </p>
              ) : (
                <>
                  <div className="template-preview-tools">
                    <div role="group" aria-label="Template preview">
                      <button
                        aria-pressed={tab === "source"}
                        onClick={() => setTab("source")}
                      >
                        Source
                      </button>
                      <button
                        aria-pressed={tab === "pdf"}
                        onClick={() => setTab("pdf")}
                      >
                        PDF preview
                      </button>
                    </div>
                    <button
                      disabled={
                        !root || compilePending || detail.id === "builtin-blank"
                      }
                      onClick={() =>
                        running
                          ? void api(`/builds/${job!.id}/cancel`, "POST", {})
                              .then((next) => {
                                if (
                                  alive.current &&
                                  keyRef.current === selectionKey
                                )
                                  setJob(next);
                              })
                              .catch((e) => {
                                if (alive.current) setError(e.message);
                              })
                          : void compile()
                      }
                    >
                      {running
                        ? "Stop preview"
                        : compilePending
                          ? "Starting preview…"
                          : "Compile preview"}
                    </button>
                    <a href={`/api/templates/${detail.id}/export`} download>
                      Download source ZIP
                    </a>
                  </div>
                  {tab === "source" ? (
                    <div className="template-source">
                      <label>
                        Preview file
                        <select
                          value={file}
                          onChange={(e) => setFile(e.target.value)}
                          aria-label="Template preview file"
                        >
                          {detail.entries.map((f) => (
                            <option key={f.path} value={f.path}>
                              {f.path}
                              {f.kind === "directory" ? "/" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {source?.content !== undefined ? (
                        <textarea
                          aria-label="Template source"
                          readOnly
                          spellCheck={false}
                          value={source.content}
                        />
                      ) : (
                        <p className="field-help">
                          {source?.reason ?? "Loading source…"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="template-pdf">
                      {pdf ? (
                        <Suspense fallback={<p>Loading PDF reader…</p>}>
                          <PdfPreview
                            url={`/api/builds/${pdf.id}/pdf`}
                            stale={running || job?.status === "failed"}
                          />
                        </Suspense>
                      ) : (
                        <p className="template-empty">
                          {running
                            ? "Compiling a separate snapshot…"
                            : detail.id === "builtin-blank"
                              ? "This starter is intentionally empty. Create a project and add content before compiling."
                              : "Choose Compile preview to build this template with your installed TeX tools."}
                        </p>
                      )}
                    </div>
                  )}
                  {job && (
                    <details
                      className="template-build-log"
                      open={job.status === "failed"}
                    >
                      <summary>
                        Preview build · {job.status}
                        {pdf && job.id !== pdf.id
                          ? " · showing last successful preview"
                          : ""}
                      </summary>
                      <pre>{job.log || "Waiting for compiler output…"}</pre>
                    </details>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="template-empty">
              {selected
                ? "Loading template…"
                : "Choose a template to inspect its source and create an independent project."}
            </p>
          )}
        </section>
      </div>
      <form
        className="template-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            detail &&
            detail.id === selected &&
            !detail.deletedAt &&
            !disabled &&
            !locked &&
            projectName.trim() &&
            (!detail.roots.length || root)
          )
            void execute({
              kind: "create",
              url: `/templates/${detail.id}/projects`,
              body: {
                id: crypto.randomUUID(),
                name: projectName,
                expectedRevision: detail.revision,
                hash: detail.hash,
                root,
                engine,
              },
            });
        }}
      >
        <label className="template-project-name">
          Project name
          <input
            autoFocus
            value={projectName}
            onChange={(e) => {
              nameTouched.current = true;
              setProjectName(e.target.value);
            }}
            maxLength={120}
            disabled={disabled || locked}
          />
        </label>
        <label>
          Main document
          <select
            aria-label="Template main document"
            value={root}
            disabled={disabled || !detail || !!detail.deletedAt}
            onChange={(e) => {
              setRoot(e.target.value);
              if (e.target.value) setFile(e.target.value);
            }}
          >
            {!detail?.roots.length ? (
              <option value="">No .tex document yet</option>
            ) : (
              <>
                <option value="">Choose main document…</option>
                {detail.roots.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <label>
          Compiler
          <select
            value={engine}
            aria-label="Template compiler"
            disabled={disabled || !detail || !!detail.deletedAt}
            onChange={(e) => setEngine(e.target.value as Engine)}
          >
            <option value="pdflatex">pdfLaTeX</option>
            <option value="latex">LaTeX (DVI → PS → PDF)</option>
            <option value="xelatex">XeLaTeX</option>
            <option value="lualatex">LuaLaTeX</option>
          </select>
        </label>
        <div className="template-create-actions">
          <button
            className="primary"
            disabled={
              disabled ||
              locked ||
              !detail ||
              !!detail.deletedAt ||
              !projectName.trim() ||
              (!!detail.roots.length && !root)
            }
          >
            {working ? "Saving…" : "Create project"}
          </button>
          <button type="button" disabled={working} onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="field-help">
          {locked
            ? "Finish the current AI request or file operation before creating a project."
            : detail?.roots.length === 0
              ? "Add a main .tex document after creating this project."
              : "Creates fresh files and history. Chats, comments, review marks and Trash are not copied."}
        </p>
      </form>
    </Modal>
  );
}
