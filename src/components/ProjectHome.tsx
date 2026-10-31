import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpRight,
  Clock3,
  Copy,
  FileText,
  FolderOpen,
  Grid3X3,
  HelpCircle,
  List,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import type { CompileJob, Project } from "../../shared/types";
import { api } from "../api";
import { PrismMark } from "./PrismMark";
import { Modal } from "./Modal";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./project-home.css";

// Only render saved output. Opening the library never starts a compilation.
function ProjectThumbnail({ project }: { project: Project }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let dispose = () => {};
    setReady(false);
    void (async () => {
      const { lastSuccessful } = await api<{
        lastSuccessful: CompileJob | null;
      }>(`/projects/${project.id}/builds`);
      if (cancelled || !lastSuccessful) return;
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      if (cancelled) return;
      GlobalWorkerOptions.workerSrc = workerUrl;
      const task = getDocument({
        url: `/api/builds/${lastSuccessful.id}/pdf`,
        disableAutoFetch: true,
      });
      dispose = () => {
        void task.destroy();
      };
      const pdf = await task.promise;
      if (cancelled) return;
      const page = await pdf.getPage(1);
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({
        scale: 280 / page.getViewport({ scale: 1 }).width,
      });
      const element = canvas.current;
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      const render = page.render({
        canvas: element,
        canvasContext: element.getContext("2d")!,
        viewport,
      });
      dispose = () => {
        render.cancel();
        void task.destroy();
      };
      await render.promise;
      if (!cancelled) setReady(true);
    })().catch(() => {
      /* A missing preview never prevents opening a project. */
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [project.id, project.generation, visible]);
  return (
    <span
      ref={holder}
      className={"project-thumbnail " + (ready ? "has-preview" : "")}
      aria-hidden="true"
    >
      <canvas ref={canvas} />
      {!ready && (
        <span className="project-paper-placeholder">
          <FileText size={21} strokeWidth={1.25} />
        </span>
      )}
    </span>
  );
}

function relativeDate(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 86400000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Props {
  projects: Project[];
  trashedProjects: Project[];
  loading: boolean;
  onOpen: (project: Project) => void;
  onNew: () => void;
  onImport: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onRename: (project: Project, name: string) => Promise<void>;
  onTrash: (project: Project) => Promise<void>;
  onRestore: (project: Project) => Promise<void>;
  onCopy: (project: Project) => void;
  revealProject: string;
}

export function ProjectHome({
  projects,
  trashedProjects,
  loading,
  onOpen,
  onNew,
  onImport,
  onSettings,
  onHelp,
  onRename,
  onTrash,
  onRestore,
  onCopy,
  revealProject,
}: Props) {
  const [view, setView] = useState<"list" | "grid">("list");
  const [section, setSection] = useState<"all" | "recent" | "trash">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "updated">("updated");
  const [ascending, setAscending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingProject, setPendingProject] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const menuRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revealProject) return;
    setSection("all");
    setQuery("");
    requestAnimationFrame(() => {
      const link = document.getElementById(`open-project-${revealProject}`);
      link?.focus();
      link?.scrollIntoView({ block: "nearest" });
    });
  }, [revealProject]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRegion.current?.contains(event.target as Node)) setMenu("");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.getElementById(`project-menu-${menu}`)?.focus();
        setMenu("");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const recent = [...projects]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 10);
  const inTrash = section === "trash";
  const projectDate = (p: Project) =>
    inTrash ? (p.deletedAt ?? p.updated) : p.updated;
  const filtered = (
    inTrash ? trashedProjects : section === "recent" ? recent : projects
  )
    .filter((p) =>
      p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === "name"
          ? a.name.localeCompare(b.name, undefined, { numeric: true })
          : projectDate(a).localeCompare(projectDate(b))) *
        (ascending ? 1 : -1),
    );
  async function changeTrash(project: Project, restore = false) {
    if (pendingProject) return;
    setPendingProject(project.id);
    setActionError("");
    setMenu("");
    try {
      await (restore ? onRestore(project) : onTrash(project));
      document.getElementById("home-trash")?.focus();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingProject("");
    }
  }
  function changeSort(next: "name" | "updated") {
    setSort(next);
    setAscending(next === sort ? !ascending : next === "name");
  }
  function open(event: React.MouseEvent<HTMLAnchorElement>, project: Project) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (!loading) onOpen(project);
  }
  const SortArrow = ascending ? ArrowUp : ArrowDown;
  return (
    <div
      className={"project-home " + (collapsed ? "home-sidebar-collapsed" : "")}
    >
      <a className="skip-link" href="#project-library">
        Skip to projects
      </a>
      <aside className="home-sidebar" aria-label="Workspace navigation">
        <div className="home-brand-row">
          <a className="brand home-brand" href="/" aria-label="Prism home">
            <PrismMark />
            <span>
              prism<span className="brand-dot">.</span>
            </span>
          </a>
          <button
            className="icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <nav className="home-nav">
          <button
            className={section === "all" ? "selected" : ""}
            aria-current={section === "all" ? "page" : undefined}
            title="Your projects"
            onClick={() => {
              setSection("all");
              setQuery("");
            }}
          >
            <FolderOpen size={17} />
            <span>Your projects</span>
          </button>
          <button
            className={section === "recent" ? "selected" : ""}
            aria-current={section === "recent" ? "page" : undefined}
            title="Recently edited"
            onClick={() => {
              setSection("recent");
              setQuery("");
            }}
          >
            <Clock3 size={17} />
            <span>Recently edited</span>
          </button>
          <button
            id="home-trash"
            className={inTrash ? "selected" : ""}
            aria-current={inTrash ? "page" : undefined}
            aria-label={`Trash${trashedProjects.length ? `, ${trashedProjects.length} ${trashedProjects.length === 1 ? "project" : "projects"}` : ""}`}
            title="Trash"
            onClick={() => {
              setSection("trash");
              setQuery("");
              setMenu("");
            }}
          >
            <Trash2 size={17} />
            <span>Trash</span>
            {!!trashedProjects.length && (
              <span className="home-trash-count" aria-hidden="true">
                {trashedProjects.length}
              </span>
            )}
          </button>
        </nav>
        <div className="home-sidebar-bottom">
          <button
            className="home-utility"
            title="Settings"
            onClick={onSettings}
          >
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button
            className="home-utility"
            title="Help & shortcuts"
            onClick={onHelp}
          >
            <HelpCircle size={17} />
            <span>Help & shortcuts</span>
          </button>
          <button
            className="home-account"
            title="Workspace settings"
            onClick={onSettings}
          >
            <span className="avatar">P</span>
            <span>
              <strong>Local workspace</strong>
              <small>On this computer</small>
            </span>
          </button>
        </div>
      </aside>
      <main
        className="project-library"
        id="project-library"
        tabIndex={-1}
        aria-busy={loading}
      >
        <header className="library-toolbar">
          <h1>
            {inTrash
              ? "Trash"
              : section === "all"
                ? "Your projects"
                : "Recently edited"}
          </h1>
          <div className="library-controls">
            <div className="project-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={search}
                aria-label={
                  inTrash ? "Search trashed projects" : "Search projects"
                }
                placeholder={inTrash ? "Search Trash" : "Search"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    search.current?.focus();
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div
              className="home-view-switch"
              role="group"
              aria-label="Project view"
            >
              <button
                title="List view"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={17} />
              </button>
              <button
                title="Grid view"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <Grid3X3 size={16} />
              </button>
            </div>
            {!inTrash && (
              <>
                <button
                  className="home-import"
                  disabled={loading}
                  onClick={onImport}
                >
                  <ArrowDownToLine size={16} />
                  <span>Import</span>
                </button>
                <button
                  className="primary home-new"
                  disabled={loading}
                  onClick={onNew}
                >
                  <Plus size={17} />
                  New
                </button>
              </>
            )}
          </div>
        </header>
        {inTrash && (
          <p className="project-trash-note">
            Projects stay here until you restore them. Your files and history
            are kept.
          </p>
        )}
        {actionError && (
          <div className="project-action-error" role="alert">
            <span>{actionError}</span>
            <button
              className="icon-button"
              aria-label="Dismiss project error"
              onClick={() => setActionError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="project-columns">
          <button
            className={sort === "name" ? "is-sorted" : ""}
            onClick={() => changeSort("name")}
            aria-label={`Sort by name${sort === "name" ? (ascending ? ", ascending" : ", descending") : ""}`}
          >
            Name{sort === "name" && <SortArrow size={12} />}
          </button>
          <button
            className={sort === "updated" ? "is-sorted" : ""}
            onClick={() => changeSort("updated")}
            aria-label={`Sort by ${inTrash ? "date deleted" : "last edited"}${sort === "updated" ? (ascending ? ", ascending" : ", descending") : ""}`}
          >
            {inTrash ? "Date deleted" : "Last edited"}
            {sort === "updated" && <SortArrow size={12} />}
          </button>
        </div>
        <div className="project-library-scroll">
          {loading ? (
            <div className="library-empty" role="status">
              <LoaderCircle size={24} className="spin" />
              <h2>Opening your workspace…</h2>
            </div>
          ) : filtered.length ? (
            <ul
              className={"project-collection " + view + "-view"}
              aria-label={inTrash ? "Trashed projects" : "Projects"}
            >
              {filtered.map((p) => (
                <li key={p.id} className="project-item">
                  {inTrash ? (
                    <div className="project-open trashed-project">
                      <ProjectThumbnail project={p} />
                      <span className="project-item-name" title={p.name}>
                        {p.name}
                      </span>
                      <time
                        dateTime={projectDate(p)}
                        title={new Date(projectDate(p)).toLocaleString()}
                      >
                        {relativeDate(projectDate(p))}
                      </time>
                    </div>
                  ) : (
                    <a
                      className="project-open"
                      id={`open-project-${p.id}`}
                      href={`/?project=${encodeURIComponent(p.id)}`}
                      onClick={(e) => open(e, p)}
                      aria-label={`Open ${p.name}`}
                    >
                      <ProjectThumbnail project={p} />
                      <span className="project-item-name" title={p.name}>
                        {p.name}
                      </span>
                      <time
                        dateTime={p.updated}
                        title={new Date(p.updated).toLocaleString()}
                      >
                        {relativeDate(p.updated)}
                      </time>
                    </a>
                  )}
                  {inTrash ? (
                    <button
                      className="project-restore"
                      disabled={!!pendingProject}
                      aria-label={`Restore ${p.name}`}
                      onClick={() => void changeTrash(p, true)}
                    >
                      {pendingProject === p.id ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <RotateCcw size={14} />
                      )}{" "}
                      Restore
                    </button>
                  ) : (
                    <div
                      className="project-actions"
                      ref={menu === p.id ? menuRegion : undefined}
                    >
                      <button
                        className="icon-button"
                        disabled={!!pendingProject}
                        id={`project-menu-${p.id}`}
                        aria-label={`Actions for ${p.name}`}
                        aria-expanded={menu === p.id}
                        aria-controls={
                          menu === p.id ? `actions-${p.id}` : undefined
                        }
                        onClick={() => setMenu(menu === p.id ? "" : p.id)}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menu === p.id && (
                        <div
                          className="project-action-menu"
                          id={`actions-${p.id}`}
                        >
                          <button
                            onClick={() => {
                              setMenu("");
                              onOpen(p);
                            }}
                          >
                            <ArrowUpRight size={15} />
                            Open project
                          </button>
                          <button
                            onClick={() => {
                              setMenu("");
                              setRenaming(p);
                              setName(p.name);
                              setError("");
                            }}
                          >
                            <Pencil size={15} />
                            Rename
                          </button>
                          <a
                            href={`/api/projects/${p.id}/export`}
                            download
                            onClick={() => setMenu("")}
                          >
                            <ArrowDownToLine size={15} />
                            Download source
                          </a>
                          <button
                            onClick={() => {
                              setMenu("");
                              onCopy(p);
                            }}
                          >
                            <Copy size={15} />
                            Make a copy
                          </button>
                          <button
                            className="project-trash-action"
                            onClick={() => void changeTrash(p)}
                          >
                            <Trash2 size={15} />
                            Move to Trash
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="library-empty">
              {query ? (
                <Search size={27} strokeWidth={1.4} />
              ) : inTrash ? (
                <Trash2 size={30} strokeWidth={1.4} />
              ) : (
                <FolderOpen size={30} strokeWidth={1.4} />
              )}
              <h2>
                {query
                  ? "No matching projects"
                  : inTrash
                    ? "Trash is empty"
                    : "A place for your next idea"}
              </h2>
              <p>
                {query
                  ? "Try a different name, or clear your search."
                  : inTrash
                    ? "Projects you move to Trash will appear here, ready to restore."
                    : "Start a LaTeX project or bring in one you’ve already begun."}
              </p>
              <button
                className="subtle"
                onClick={
                  query
                    ? () => {
                        setQuery("");
                        search.current?.focus();
                      }
                    : inTrash
                      ? () => setSection("all")
                      : onNew
                }
              >
                {query
                  ? "Clear search"
                  : inTrash
                    ? "Back to projects"
                    : "Create a project"}
              </button>
            </div>
          )}
        </div>
        <footer className="library-footer">
          <span aria-live="polite">
            {loading
              ? "Loading projects"
              : `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}${query ? " found" : ""}`}
          </span>
          <span>Private by default. Yours to keep.</span>
        </footer>
      </main>
      {renaming && (
        <Modal
          title="Rename project"
          onClose={() => {
            if (!saving) setRenaming(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saving || !name.trim()) return;
              setSaving(true);
              setError("");
              void onRename(renaming, name.trim())
                .then(() => setRenaming(null))
                .catch((e) => setError(e.message))
                .finally(() => setSaving(false));
            }}
          >
            <label className="field-label" htmlFor="rename-project">
              Project name
            </label>
            <input
              className="text-input"
              id="rename-project"
              required
              autoFocus
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {error && (
              <p className="field-help danger-text" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="primary" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save name"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
