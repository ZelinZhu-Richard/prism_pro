import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderPlus,
  History,
  Keyboard,
  LayoutPanelLeft,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { diffLines } from "diff";
import { api, aiStream } from "./api";
import { TypingBuffer, typingDelay } from "./typing";
import { Editor, type EditorHandle } from "./components/Editor";
import { PdfPreview } from "./components/PdfPreview";
import { Modal } from "./components/Modal";
import { Settings } from "./components/Settings";
import { PrismMark } from "./components/PrismMark";
import { ProjectHome } from "./components/ProjectHome";
import { ImportProject } from "./components/ImportProject";
import { models, providerNames } from "../shared/catalog";
import { isCliProvider, apiProviders, cliProviders } from "../shared/types";
import type {
  Project,
  TextFile,
  Provider,
  EditMode,
  CompileJob,
  AiRun,
  Proposal,
  FileInfo,
  ProjectImport,
  SkippedArchiveEntry,
} from "../shared/types";

type Typing = {
  buffer: TypingBuffer;
  id: string;
  from: number;
  to: number;
  caret: number;
  first: boolean;
  timer?: ReturnType<typeof setTimeout>;
  saving: Promise<void> | null;
  finishing: boolean;
};
const defaultModels: Record<Provider, string> = {
  openai: "gpt-6.1-sol",
  anthropic: "claude-sonnet-5-5",
  deepseek: "deepseek-v4-pro",
  gemini: "gemini-3.8-flash",
  qwen: "qwen3.8-flash",
  codex: "default",
  "claude-code": "default",
};
export default function App() {
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectTemplate, setProjectTemplate] = useState("blank");
  const [importSkipped, setImportSkipped] = useState<SkippedArchiveEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const navigationPending = useRef(false);
  const routeHandler = useRef<() => void>(() => {});
  const [projects, setProjects] = useState<Project[]>([]),
    [trashedProjects, setTrashedProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [doc, setDocState] = useState<TextFile | null>(null),
    [activePath, setActivePath] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [binary, setBinary] = useState(false);
  const [settings, setSettings] = useState<any>(null),
    [health, setHealth] = useState<any>(null),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved"),
    [position, setPosition] = useState({ line: 1, column: 1, from: 0, to: 0 }),
    [sidebarTab, setSidebarTab] = useState("files"),
    [fileSearch, setFileSearch] = useState(""),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [builds, setBuilds] = useState<CompileJob[]>([]),
    [pdfJob, setPdfJob] = useState<CompileJob | null>(null),
    [rightTab, setRightTab] = useState("preview"),
    [targetPage, setTargetPage] = useState(1),
    [pdfLocation, setPdfLocation] = useState<
      { page: number; x: number; y: number; nonce: number } | undefined
    >(),
    [autoCompile, setAutoCompile] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai"),
    [reviewModels, setReviewModels] = useState(defaultModels),
    [mode, setMode] = useState<EditMode>("review"),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [activeRun, setActiveRun] = useState<AiRun | null>(null),
    [runText, setRunText] = useState(""),
    [freshConversation, setFreshConversation] = useState(false),
    [toolStatus, setToolStatus] = useState(""),
    [contextFiles, setContextFiles] = useState<string[]>([]);
  const [runs, setRuns] = useState<AiRun[]>([]),
    [proposals, setProposals] = useState<Proposal[]>([]),
    [quote, setQuote] = useState<any>(null),
    [manualModel, setManualModel] = useState(""),
    [manualExplicit, setManualExplicit] = useState(false),
    [speed, setSpeed] = useState(1),
    [paused, setPaused] = useState(false),
    [lastTyping, setLastTyping] = useState("");
  const [checkpoints, setCheckpoints] = useState<any[]>([]),
    [renameTarget, setRenameTarget] = useState(""),
    [formValue, setFormValue] = useState(""),
    [menu, setMenu] = useState(false),
    [panelWidth, setPanelWidth] = useState(54),
    [sidebarWidth, setSidebarWidth] = useState(230),
    [composerHeight, setComposerHeight] = useState(255);
  const editor = useRef<EditorHandle>(null),
    docRef = useRef<TextFile | null>(null),
    projectRef = useRef<Project | null>(null),
    saved = useRef(""),
    savePromise = useRef<Promise<void> | null>(null),
    typing = useRef<Typing | null>(null),
    speedRef = useRef(1),
    busyRef = useRef(false),
    compileRef = useRef<() => void>(() => {}),
    upload = useRef<HTMLInputElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    chatBody = useRef<HTMLDivElement>(null);
  projectRef.current = project;
  busyRef.current = busy;
  speedRef.current = speed;
  function setDoc(value: TextFile | null) {
    docRef.current = value;
    setDocState(value);
  }
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const refreshSettings = useCallback(async () => {
    const s = await api("/settings");
    setSettings(s);
  }, []);
  const refreshProject = useCallback(async () => {
    if (!projectRef.current) return;
    const p = await api<Project>("/projects/" + projectRef.current.id);
    setProject(p);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  }, []);
  async function refreshChats() {
    if (!projectRef.current) return;
    const c = await api("/projects/" + projectRef.current.id + "/chats");
    setRuns(c.runs);
    setProposals(c.proposals);
    const undoable = c.runs
      .filter(
        (r: AiRun & { lastRevision?: number }) =>
          r.mode === "manual" &&
          r.path === docRef.current?.path &&
          r.lastRevision === docRef.current?.revision &&
          ["completed", "stopped", "failed", "interrupted"].includes(r.status),
      )
      .at(-1);
    setLastTyping(undoable?.id ?? "");
  }
  async function fetchBuilds(id: string) {
    const b = await api("/projects/" + id + "/builds");
    if (projectRef.current?.id === id) {
      setBuilds(b.jobs);
      setPdfJob(b.lastSuccessful);
    }
  }
  useEffect(() => {
    void Promise.all([
      api<Project[]>("/projects"),
      api("/settings"),
      api("/health"),
      api<Project[]>("/projects/trash"),
    ])
      .then(([p, s, h, trash]) => {
        setProjects(p);
        setTrashedProjects(trash);
        setSettings(s);
        setHealth(h);
        setProvider(s.preferences.provider ?? "openai");
        setReviewModels((m) => ({
          ...m,
          [s.preferences.provider ?? "openai"]:
            s.preferences.model ?? defaultModels.openai,
        }));
        setAutoCompile(!!s.preferences.autoCompile);
        const id = new URLSearchParams(window.location.search).get("project");
        const target = p.find((item) => item.id === id);
        if (target) return openProject(target, false);
        if (id) {
          history.replaceState(null, "", "/");
          setError(
            trash.some((item) => item.id === id)
              ? "This project is in Trash. Open Trash to restore it."
              : "That project is no longer available. Choose one from your workspace.",
          );
        }
      })
      .catch(report)
      .finally(() => setLoadingProjects(false));
  }, []);
  useEffect(() => {
    const navigate = () => routeHandler.current();
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    const theme = settings?.preferences?.theme ?? "dark";
    document.documentElement.dataset.theme =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (theme === "system")
        document.documentElement.dataset.theme = media.matches
          ? "dark"
          : "light";
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [settings?.preferences?.theme]);
  useEffect(() => {
    if (settings)
      void api("/settings/preferences", "PUT", {
        provider,
        model: reviewModels[provider],
      }).catch(report);
  }, [provider, reviewModels]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        busyRef.current ||
        (docRef.current && docRef.current.content !== saved.current)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  async function saveNow(): Promise<void> {
    if (typing.current) return;
    if (savePromise.current) {
      await savePromise.current;
      if (docRef.current && docRef.current.content !== saved.current)
        return saveNow();
      return;
    }
    const d = docRef.current,
      p = projectRef.current;
    if (!d || !p || d.content === saved.current) return;
    setSaveStatus("Saving…");
    const snapshot = d.content;
    const promise = (async () => {
      try {
        const result = await api<TextFile>(
          `/projects/${p.id}/file?path=${encodeURIComponent(d.path)}`,
          "PUT",
          { content: snapshot, revision: d.revision },
        );
        if (
          docRef.current?.path === d.path &&
          projectRef.current?.id === p.id
        ) {
          saved.current = snapshot;
          setDoc({ ...docRef.current, revision: result.revision });
          setSaveStatus(
            docRef.current?.content === snapshot ? "Saved" : "Unsaved",
          );
        }
        await refreshProject();
      } catch (e) {
        setSaveStatus("Save failed");
        throw e;
      }
    })();
    savePromise.current = promise;
    try {
      await promise;
    } finally {
      savePromise.current = null;
    }
  }
  useEffect(() => {
    if (
      !doc ||
      (busy && mode === "manual") ||
      typing.current ||
      doc.content === saved.current
    )
      return;
    setSaveStatus("Unsaved");
    const timer = setTimeout(() => void saveNow().catch(report), 600);
    return () => clearTimeout(timer);
  }, [doc?.content, doc?.path, busy, mode]);
  async function openFile(path: string, p = projectRef.current) {
    if (!p) return;
    if (typing.current) {
      setToast("Stop Manual Type before switching files.");
      return;
    }
    try {
      await saveNow();
      const f = p.files.find((f) => f.path === path && !f.deleted);
      if (!f || f.kind === "directory") return;
      setActivePath(path);
      setTabs((t) => (t.includes(path) ? t : [...t, path]));
      setBinary(f.kind === "binary");
      setLastTyping("");
      if (f.kind === "binary") {
        setDoc(null);
        return;
      }
      const d = await api<TextFile>(
        `/projects/${p.id}/file?path=${encodeURIComponent(path)}`,
      );
      saved.current = d.content;
      setDoc(d);
      setSaveStatus("Saved");
      setPosition({ line: 1, column: 1, from: 0, to: 0 });
    } catch (e) {
      report(e);
    }
  }
  async function openProject(p: Project, updateUrl = true) {
    if (busyRef.current) {
      setToast("Finish the current AI request first.");
      return;
    }
    if (navigationPending.current) return;
    navigationPending.current = true;
    setLoadingProjects(true);
    try {
      await saveNow();
      p = await api<Project>("/projects/" + p.id);
      setProject(p);
      projectRef.current = p;
      if (updateUrl)
        history.pushState(null, "", "/?project=" + encodeURIComponent(p.id));
      setTabs([]);
      setDoc(null);
      setActivePath("");
      setBuilds([]);
      setPdfJob(null);
      setFreshConversation(false);
      setRunText("");
      setActiveRun(null);
      setContextFiles([]);
      setMenu(false);
      setCollapsed(new Set());
      const first =
        p.root || p.files.find((f) => f.kind === "text" && !f.deleted)?.path;
      if (first) await openFile(first, p);
      await fetchBuilds(p.id);
      await refreshChats();
    } catch (e) {
      report(e);
    } finally {
      navigationPending.current = false;
      setLoadingProjects(false);
    }
  }
  async function goHome(updateUrl = true) {
    if (busyRef.current) {
      setToast("Finish the current AI request before returning home.");
      return;
    }
    if (navigationPending.current) return;
    navigationPending.current = true;
    setLoadingProjects(true);
    try {
      await saveNow();
      const [items, trash] = await Promise.all([
        api<Project[]>("/projects"),
        api<Project[]>("/projects/trash"),
      ]);
      setProjects(items);
      setTrashedProjects(trash);
      setDoc(null);
      saved.current = "";
      projectRef.current = null;
      setProject(null);
      setMenu(false);
      setModal("");
      setRuns([]);
      setProposals([]);
      setBuilds([]);
      setPdfJob(null);
      if (updateUrl) history.pushState(null, "", "/");
    } catch (e) {
      report(e);
    } finally {
      navigationPending.current = false;
      setLoadingProjects(false);
    }
  }
  routeHandler.current = () => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (busyRef.current || navigationPending.current) {
      history.replaceState(
        null,
        "",
        projectRef.current
          ? "/?project=" + encodeURIComponent(projectRef.current.id)
          : "/",
      );
      setToast("Finish the current operation before changing projects.");
      return;
    }
    if (id === projectRef.current?.id) return;
    const target = projects.find((p) => p.id === id);
    if (target) void openProject(target, false);
    else void goHome(false);
  };
  const running = builds.find((j) => j.status === "running");
  useEffect(() => {
    if (!running || !project) return;
    const timer = setInterval(
      () => void fetchBuilds(project.id).catch(report),
      800,
    );
    return () => clearInterval(timer);
  }, [running?.id, project?.id]);
  async function compile(clean = false) {
    if (!projectRef.current || typing.current) return;
    try {
      await saveNow();
      const job = await api<CompileJob>(
        "/projects/" + projectRef.current.id + "/compile",
        "POST",
        { clean },
      );
      setBuilds((b) => [job, ...b]);
      setRightTab("preview");
    } catch (e) {
      report(e);
    }
  }
  compileRef.current = () => void compile();
  useEffect(() => {
    if (
      !autoCompile ||
      !project ||
      typing.current ||
      (busy && mode === "manual") ||
      saveStatus !== "Saved" ||
      !doc ||
      running ||
      pdfJob?.generation === project.generation
    )
      return;
    const timer = setTimeout(() => void compile(), 1800);
    return () => clearTimeout(timer);
  }, [project?.generation, autoCompile, busy, saveStatus]);
  async function toPdf() {
    if (!pdfJob || !doc) return;
    try {
      const target = await api(`/builds/${pdfJob.id}/sync`, "POST", {
        direction: "forward",
        path: doc.path,
        line: position.line,
      });
      setTargetPage(target.page);
      setPdfLocation({ ...target, nonce: Date.now() });
      setRightTab("preview");
    } catch (e) {
      report(e);
    }
  }
  async function fromPdf(page: number, x: number, y: number) {
    if (!pdfJob) return;
    try {
      const result = await api(`/builds/${pdfJob.id}/sync`, "POST", {
        direction: "inverse",
        page,
        x,
        y,
      });
      if (result.path !== activePath) await openFile(result.path);
      setTimeout(() => editor.current?.jump(result.line), 30);
    } catch (e) {
      report(e);
    }
  }
  function requestFor(model: string, text = prompt) {
    const p = projectRef.current!,
      d = docRef.current!,
      selection = editor.current?.selection() ?? { from: 0, to: 0 };
    return {
      projectId: p.id,
      provider,
      model,
      mode,
      prompt: text,
      path: d.path,
      revision: d.revision,
      ...selection,
      explicitModel: manualExplicit,
    };
  }
  useEffect(() => {
    if (mode !== "manual" || !doc || busy || saveStatus !== "Saved") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api(
        "/ai/quote",
        "POST",
        requestFor(
          manualModel ||
            (isCliProvider(provider) ? reviewModels[provider] : ""),
          prompt || "Continue at the cursor.",
        ),
      )
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            if (!manualExplicit) setManualModel(q.model ?? "");
          }
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    mode,
    provider,
    prompt,
    doc?.revision,
    settings,
    manualExplicit,
    busy,
    position.from,
    position.to,
    saveStatus,
  ]);
  async function persistTyping() {
    const t = typing.current;
    if (!t?.id || !docRef.current || t.first) return;
    if (t.saving) {
      await t.saving;
      return persistTyping();
    }
    if (t.buffer.visible === (t as any).savedVisible) return;
    const visible = t.buffer.visible,
      revision = docRef.current.revision;
    const promise = (async () => {
      const result = await api<TextFile>(`/ai/runs/${t.id}/progress`, "PUT", {
        visible,
        revision,
      });
      if (typing.current === t && docRef.current) {
        saved.current = result.content;
        setDoc({ ...docRef.current, revision: result.revision });
        (t as any).savedVisible = visible;
        setSaveStatus(
          docRef.current.content === result.content ? "Saved" : "Saving…",
        );
      }
    })();
    t.saving = promise;
    try {
      await promise;
    } finally {
      t.saving = null;
    }
  }
  async function finishTyping() {
    const t = typing.current;
    if (!t || t.finishing) return;
    t.finishing = true;
    clearTimeout(t.timer);
    try {
      await persistTyping();
      await api(`/ai/runs/${t.id}/finish`, "POST", {});
      setLastTyping(t.id);
    } catch (e) {
      report(e);
      try {
        await api(`/ai/runs/${t.id}/stop`, "POST", {});
        await api(`/ai/runs/${t.id}/finish`, "POST", {});
      } catch {}
    } finally {
      editor.current?.endTyping();
      typing.current = null;
      setBusy(false);
      setPaused(false);
      setToolStatus("");
      await refreshProject();
      await refreshChats();
    }
  }
  function pumpTyping() {
    const t = typing.current;
    if (!t || t.finishing) return;
    clearTimeout(t.timer);
    const chars = t.buffer.take(speedRef.current === 0);
    if (chars) {
      editor.current?.type(t.caret, t.first ? t.to : t.caret, chars, t.first);
      t.caret += chars.length;
      t.first = false;
      setSaveStatus("Saving…");
    }
    if (t.buffer.finished) {
      void finishTyping();
      return;
    }
    t.timer = setTimeout(
      pumpTyping,
      chars ? typingDelay(chars.at(-1)!, speedRef.current) : 60,
    );
  }
  useEffect(() => {
    if (!busy || mode !== "manual") return;
    const timer = setInterval(() => {
      const t = typing.current;
      if (!t?.id) return;
      void persistTyping().catch((e) => {
        report(e);
        t.buffer.stop();
        void api(`/ai/runs/${t.id}/stop`, "POST", {}).finally(
          () => void finishTyping(),
        );
      });
      void api(`/ai/runs/${t.id}/heartbeat`, "POST", {}).catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [busy, mode]);
  async function send(text = prompt) {
    if (!doc || !project || busy || !text.trim()) return;
    try {
      await saveNow();
      const chosen = mode === "manual" ? manualModel : reviewModels[provider];
      if (!chosen)
        throw new Error(
          "Verify model access or choose a model in the composer.",
        );
      const request = requestFor(chosen, text);
      setBusy(true);
      setFreshConversation(false);
      setActiveRun(null);
      setRunText("");
      setToolStatus("Reading your context");
      setContextFiles([doc.path]);
      setPrompt("");
      setPaused(false);
      setError("");
      if (mode === "manual") {
        const buffer = new TypingBuffer();
        typing.current = {
          buffer,
          id: "",
          from: request.from,
          to: request.to,
          caret: request.from,
          first: true,
          saving: null,
          finishing: false,
        };
      }
      try {
        await aiStream(request, (event) => {
          if (event.type === "run") {
            setActiveRun(event.run);
            if (typing.current) {
              typing.current.id = event.run.id;
              pumpTyping();
            }
          } else if (event.type === "text") {
            if (mode === "manual") typing.current?.buffer.push(event.text);
            else setRunText((t) => t + event.text);
          } else if (event.type === "tool")
            setToolStatus(
              event.name === "propose_edits"
                ? "Preparing changes"
                : event.name === "read_file"
                  ? "Reading " + event.path
                  : event.name.replaceAll("_", " "),
            );
          else if (event.type === "context") setContextFiles(event.files);
          else if (event.type === "proposal")
            setProposals((ps) => [...ps, event.proposal]);
          else if (event.type === "error") {
            setError(event.message);
            typing.current?.buffer.stop();
          } else if (event.type === "done") typing.current?.buffer.complete();
        });
      } catch (e) {
        report(e);
        typing.current?.buffer.stop();
      }
      if (mode === "manual") {
        if (typing.current?.id) {
          typing.current.buffer.complete();
          pumpTyping();
        } else {
          typing.current = null;
          setBusy(false);
        }
      } else {
        setBusy(false);
        setToolStatus("");
        await refreshChats();
      }
    } catch (e) {
      report(e);
      setBusy(false);
    }
  }
  async function stop() {
    const id = typing.current?.id || activeRun?.id;
    if (!id) return;
    try {
      typing.current?.buffer.stop();
      await api(`/ai/runs/${id}/stop`, "POST", {});
      if (typing.current) await finishTyping();
    } catch (e) {
      report(e);
    }
  }
  async function undoTyping() {
    if (!lastTyping || !project) return;
    try {
      const result = await api(`/ai/runs/${lastTyping}/undo`, "POST", {});
      saved.current = result.content;
      setDoc({
        path: doc!.path,
        content: result.content,
        revision: result.revision,
      });
      setLastTyping("");
      setTimeout(
        () =>
          editor.current?.select(result.selection.from, result.selection.to),
        0,
      );
      await refreshProject();
      await refreshChats();
      setToast("Typing run undone");
    } catch (e) {
      report(e);
    }
  }
  async function proposalAction(p: Proposal, action: string) {
    try {
      await saveNow();
      await api(`/proposals/${p.id}/${action}`, "POST", {});
      await refreshProject();
      if (activePath) await openFile(activePath);
      await refreshChats();
      setToast(
        action === "apply"
          ? "Changes applied"
          : action === "undo"
            ? "Changes undone"
            : "Proposal dismissed",
      );
    } catch (e) {
      report(e);
    }
  }
  async function chooseTheme(theme: string) {
    await api("/settings/preferences", "PUT", { theme });
    await refreshSettings();
  }
  async function importZip(file: File) {
    setLoadingProjects(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { skippedEntries = [], ...p } = await api<ProjectImport>(
        "/import",
        "POST",
        form,
      );
      setProjects((ps) => [p, ...ps]);
      await openProject(p);
      setImportSkipped(skippedEntries);
      setModal(skippedEntries.length ? "import-summary" : "");
      setToast("Project imported");
    } finally {
      setLoadingProjects(false);
    }
  }
  async function uploadFile(file: File) {
    if (!project) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const p = await api<Project>(
        `/projects/${project.id}/upload`,
        "POST",
        form,
      );
      setProject(p);
      setToast("File added");
    } catch (e) {
      report(e);
    }
  }
  async function formSubmit() {
    if (
      submitting ||
      !formValue.trim() ||
      (!project && modal !== "new-project")
    )
      return;
    setSubmitting(true);
    try {
      if (modal === "new-project") {
        const p = await api<Project>("/projects", "POST", {
          name: formValue,
          blank: projectTemplate === "blank",
        });
        setProjects((ps) => [p, ...ps]);
        await openProject(p);
      } else if (project && (modal === "new-file" || modal === "new-folder")) {
        const p = await api<Project>(
          `/projects/${project.id}/file?path=${encodeURIComponent(formValue)}`,
          "POST",
          { content: "", directory: modal === "new-folder" },
        );
        setProject(p);
        if (modal === "new-file") await openFile(formValue, p);
      } else if (project && modal === "rename") {
        await saveNow();
        const p = await api<Project>(`/projects/${project.id}/rename`, "POST", {
          from: renameTarget,
          to: formValue,
        });
        setProject(p);
        setTabs((t) =>
          t.map((x) =>
            x === renameTarget || x.startsWith(renameTarget + "/")
              ? formValue + x.slice(renameTarget.length)
              : x,
          ),
        );
        if (
          activePath === renameTarget ||
          activePath.startsWith(renameTarget + "/")
        )
          await openFile(formValue + activePath.slice(renameTarget.length), p);
      } else if (project && modal === "checkpoint") {
        await saveNow();
        await api(`/projects/${project.id}/checkpoints`, "POST", {
          name: formValue,
        });
        setToast("Checkpoint saved");
      }
      setModal("");
      setFormValue("");
    } catch (e) {
      report(e);
    } finally {
      setSubmitting(false);
    }
  }
  async function deleteFile(file: string) {
    if (!project) return;
    try {
      await saveNow();
      const p = await api<Project>(
        `/projects/${project.id}/file?path=${encodeURIComponent(file)}`,
        "DELETE",
      );
      setProject(p);
      setTabs((ts) =>
        ts.filter((t) => t !== file && !t.startsWith(file + "/")),
      );
      if (activePath === file || activePath.startsWith(file + "/")) {
        setDoc(null);
        setActivePath("");
      }
      setToast("Moved to Trash");
    } catch (e) {
      report(e);
    }
  }
  async function openHistory() {
    if (!project) return;
    try {
      setCheckpoints(await api(`/projects/${project.id}/checkpoints`));
      setModal("history");
    } catch (e) {
      report(e);
    }
  }
  function resize(
    event: React.PointerEvent,
    kind: "sidebar" | "split" | "composer",
  ) {
    event.preventDefault();
    const startX = event.clientX,
      startY = event.clientY,
      old =
        kind === "sidebar"
          ? sidebarWidth
          : kind === "composer"
            ? composerHeight
            : panelWidth;
    const move = (e: PointerEvent) => {
      if (kind === "sidebar")
        setSidebarWidth(Math.max(180, Math.min(330, old + e.clientX - startX)));
      else if (kind === "composer")
        setComposerHeight(
          Math.max(180, Math.min(550, old + startY - e.clientY)),
        );
      else
        setPanelWidth(
          Math.max(
            30,
            Math.min(
              75,
              old +
                ((e.clientX - startX) /
                  (workspace.current?.clientWidth ?? 1000)) *
                  100,
            ),
          ),
        );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  const outline = doc
    ? [
        ...doc.content.matchAll(
          /\\(part|chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^}]+)\}/g,
        ),
      ].map((m) => ({
        title: m[2],
        level: m[1] === "subsection" ? 1 : m[1] === "subsubsection" ? 2 : 0,
        line: doc.content.slice(0, m.index).split("\n").length,
      }))
    : [];
  const fileItems: FileInfo[] = (() => {
    const map = new Map<string, FileInfo>();
    for (const f of project?.files.filter((f) => !f.deleted) ?? []) {
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join("/");
        if (!map.has(prefix))
          map.set(prefix, {
            path: prefix,
            kind: "directory",
            size: 0,
            revision: 0,
            deleted: false,
          });
      }
      map.set(f.path, f);
    }
    return [...map.values()]
      .filter(
        (f) =>
          f.path.toLowerCase().includes(fileSearch.toLowerCase()) &&
          !f.path
            .split("/")
            .slice(0, -1)
            .some((_, i, a) => collapsed.has(a.slice(0, i + 1).join("/"))),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  })();
  const latest = builds[0],
    latestRun = runs.at(-1),
    currentProposal = proposals
      .filter((p) => p.status === "pending" || p.status === "applied")
      .at(-1),
    shownText = freshConversation
      ? ""
      : runText || activeRun?.text || latestRun?.text || "";
  const model = mode === "manual" ? manualModel : reviewModels[provider];
  return (
    <div className={"app-shell" + (!project ? " home-shell" : "")}>
      <input
        ref={upload}
        hidden
        type="file"
        onChange={(e) => {
          if (e.target.files?.[0]) void uploadFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {!project ? (
        <ProjectHome
          projects={projects}
          trashedProjects={trashedProjects}
          loading={loadingProjects}
          onOpen={(p) => void openProject(p)}
          onNew={() => {
            setProjectTemplate("blank");
            setFormValue("");
            setModal("new-project");
          }}
          onImport={() => setModal("import")}
          onSettings={() => setModal("settings")}
          onHelp={() => setModal("help")}
          onTrash={async (p) => {
            const deleted = await api<Project>(
              `/projects/${p.id}/trash`,
              "POST",
              {},
            );
            setProjects((ps) => ps.filter((item) => item.id !== p.id));
            setTrashedProjects((ps) => [
              deleted,
              ...ps.filter((item) => item.id !== p.id),
            ]);
            setToast("Project moved to Trash. You can restore it anytime.");
          }}
          onRestore={async (p) => {
            const restored = await api<Project>(
              `/projects/${p.id}/restore-project`,
              "POST",
              {},
            );
            setTrashedProjects((ps) => ps.filter((item) => item.id !== p.id));
            setProjects((ps) => [
              restored,
              ...ps.filter((item) => item.id !== p.id),
            ]);
            setToast("Project restored to Your projects");
          }}
          onRename={async (p, name) => {
            const updated = await api<Project>(`/projects/${p.id}`, "PATCH", {
              name,
            });
            setProjects((ps) =>
              ps.map((item) => (item.id === p.id ? updated : item)),
            );
            setToast("Project renamed");
          }}
        />
      ) : (
        <>
          <header className="app-header">
            <button
              className="brand"
              aria-label="Back to projects"
              title="Back to projects"
              onClick={() => void goHome()}
            >
              <PrismMark />
              <span>
                prism<span className="brand-dot">.</span>
              </span>
              <span className="local-badge">
                <span />
                LOCAL
              </span>
            </button>
            <div className="breadcrumb">
              <button onClick={() => void goHome()}>Workspace</button>
              <ChevronRight size={13} />
              <strong>{project?.name ?? "Your projects"}</strong>
            </div>
            <div className="header-right">
              <span className="private-note">
                <span className="status-dot" />
                Stored on your computer
              </span>
              <button
                className="icon-button"
                title="Settings"
                aria-label="Open settings"
                onClick={() => setModal("settings")}
              >
                <Settings2 size={17} />
              </button>
              <button
                className="avatar"
                title="Local workspace"
                onClick={() => setModal("help")}
              >
                P
              </button>
            </div>
          </header>
          <div className="main-layout">
            <aside className="sidebar" style={{ width: sidebarWidth }}>
              <div className="project-switcher">
                <button
                  className="project-title"
                  onClick={() => setMenu(!menu)}
                >
                  <BookOpen size={17} />
                  <span>{project?.name ?? "Select a project"}</span>
                  <ChevronDown size={14} />
                </button>
                {menu && (
                  <div className="project-menu">
                    {projects.map((p) => (
                      <button key={p.id} onClick={() => void openProject(p)}>
                        <FileText size={14} />
                        <span>{p.name}</span>
                        {p.id === project?.id && <Check size={14} />}
                      </button>
                    ))}
                    <hr />
                    <button
                      onClick={() => {
                        setModal("new-project");
                        setFormValue("");
                        setMenu(false);
                      }}
                    >
                      <Plus size={14} />
                      New project
                    </button>
                    <button
                      onClick={() => {
                        setModal("import");
                        setMenu(false);
                      }}
                    >
                      <Upload size={14} />
                      Import project ZIP
                    </button>
                    {project && (
                      <a href={`/api/projects/${project.id}/export`} download>
                        <ArrowDownToLine size={14} />
                        Export project ZIP
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setModal("project-settings");
                        setMenu(false);
                      }}
                    >
                      <Settings2 size={14} />
                      Project settings
                    </button>
                  </div>
                )}
              </div>
              <div className="sidebar-tabs">
                <button
                  className={sidebarTab === "files" ? "active" : ""}
                  onClick={() => setSidebarTab("files")}
                >
                  <Files size={14} />
                  Files
                </button>
                <button
                  className={sidebarTab === "chats" ? "active" : ""}
                  onClick={() => setSidebarTab("chats")}
                >
                  <MessageSquare size={14} />
                  Chats
                </button>
                <button
                  className="icon-button search-toggle"
                  aria-label="Search project files"
                  onClick={() => {
                    setSidebarTab("search");
                  }}
                >
                  <Search size={15} />
                </button>
              </div>
              {sidebarTab === "chats" ? (
                <div className="chat-list">
                  {runs.length ? (
                    runs
                      .slice()
                      .reverse()
                      .map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setFreshConversation(false);
                            setActiveRun(r);
                            if (r.mode === "manual" && r.path === doc?.path)
                              setLastTyping(r.id);
                            setRunText(r.text);
                            setContextFiles(r.contextFiles);
                          }}
                        >
                          <MessageSquare size={15} />
                          <span>
                            {r.prompt}
                            <small>
                              {r.mode === "manual"
                                ? "Manual Type"
                                : "Review Edits"}{" "}
                              · {r.status}
                            </small>
                          </span>
                        </button>
                      ))
                  ) : (
                    <div className="sidebar-empty">
                      Your conversations will appear here.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="files-heading">
                    <span>PROJECT FILES</span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="New file"
                        title="New file"
                        onClick={() => {
                          setModal("new-file");
                          setFormValue("");
                        }}
                      >
                        <FilePlus2 size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="New folder"
                        title="New folder"
                        onClick={() => {
                          setModal("new-folder");
                          setFormValue("");
                        }}
                      >
                        <FolderPlus size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Upload file"
                        title="Upload file"
                        onClick={() => upload.current?.click()}
                      >
                        <Upload size={14} />
                      </button>
                    </div>
                  </div>
                  {sidebarTab === "search" && (
                    <div className="file-search">
                      <Search size={14} />
                      <input
                        aria-label="Filter files"
                        autoFocus
                        placeholder="Find a file…"
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="file-tree">
                    {fileItems.map((f) => (
                      <div
                        key={f.path}
                        className={
                          "file-row " +
                          (f.path === activePath ? "selected" : "")
                        }
                        style={{
                          paddingLeft: 12 + (f.path.split("/").length - 1) * 14,
                        }}
                      >
                        <button
                          className="file-main"
                          onClick={() => {
                            if (f.kind === "directory")
                              setCollapsed((s) => {
                                const n = new Set(s);
                                if (n.has(f.path)) n.delete(f.path);
                                else n.add(f.path);
                                return n;
                              });
                            else void openFile(f.path);
                          }}
                          title={f.path}
                        >
                          {f.kind === "directory" ? (
                            <>
                              {collapsed.has(f.path) ? (
                                <ChevronRight size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                              <Folder size={14} />
                            </>
                          ) : f.path.endsWith(".bib") ? (
                            <BookOpen size={15} />
                          ) : (
                            <FileText size={15} />
                          )}
                          <span>{f.path.split("/").at(-1)}</span>
                          {f.path === project?.root && (
                            <span
                              className="main-indicator"
                              title="Root document"
                            />
                          )}
                        </button>
                        <div className="file-row-actions">
                          <button
                            aria-label={`Rename ${f.path}`}
                            onClick={() => {
                              setRenameTarget(f.path);
                              setFormValue(f.path);
                              setModal("rename");
                            }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            aria-label={`Move ${f.path} to Trash`}
                            onClick={() => void deleteFile(f.path)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="outline-heading">
                    <ChevronDown size={13} />
                    Outline<span>{outline.length}</span>
                  </div>
                  <div className="outline">
                    {outline.length ? (
                      outline.map((o, i) => (
                        <button
                          key={i}
                          style={{ paddingLeft: 17 + o.level * 12 }}
                          onClick={() => editor.current?.jump(o.line)}
                        >
                          <span className="outline-index">
                            {o.level ? "·" : i + 1}
                          </span>
                          <span>{o.title}</span>
                        </button>
                      ))
                    ) : (
                      <p className="sidebar-empty">
                        Sections appear as you write.
                      </p>
                    )}
                  </div>
                </>
              )}
              <div className="sidebar-bottom">
                <button onClick={() => void openHistory()}>
                  <History size={15} />
                  Checkpoints
                </button>
                <button onClick={() => setModal("trash")}>
                  <Trash2 size={15} />
                  Trash
                  <span>
                    {project?.files.filter(
                      (f) => f.deleted && f.kind !== "directory",
                    ).length || ""}
                  </span>
                </button>
                <div className="sidebar-signature">
                  <PrismMark size={18} />
                  <span>A little space to think.</span>
                </div>
              </div>
            </aside>
            <div
              className="resize-handle sidebar-resizer"
              role="separator"
              aria-label="Sidebar width"
              aria-orientation="vertical"
              aria-valuemin={180}
              aria-valuemax={330}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={(e) => resize(e, "sidebar")}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft")
                  setSidebarWidth((s) => Math.max(180, s - 10));
                if (e.key === "ArrowRight")
                  setSidebarWidth((s) => Math.min(330, s + 10));
              }}
            />
            <div className="workbench" ref={workspace}>
              <section
                className="source-panel"
                style={{ width: `${panelWidth}%` }}
              >
                <div className="editor-tabs">
                  {tabs.map((t) => (
                    <div
                      key={t}
                      className={
                        "editor-tab " + (t === activePath ? "active" : "")
                      }
                    >
                      <button onClick={() => void openFile(t)}>
                        <Code2 size={14} />
                        {t.split("/").at(-1)}
                      </button>
                      <button
                        className="tab-close"
                        aria-label={`Close ${t}`}
                        disabled={busy && mode === "manual"}
                        onClick={() => {
                          if (t === activePath && tabs.length > 1)
                            void openFile(tabs.find((x) => x !== t)!);
                          if (t === activePath && tabs.length === 1) {
                            void saveNow().then(() => {
                              setDoc(null);
                              setActivePath("");
                            });
                          }
                          setTabs((ts) => ts.filter((x) => x !== t));
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="editor-tab-spacer" />
                  <button
                    className="icon-button"
                    aria-label="Find in document"
                    title="Find in document (⌘F)"
                    onClick={() => editor.current?.search()}
                  >
                    <Search size={15} />
                  </button>
                </div>
                <div className="source-toolbar">
                  <div>
                    <span className="source-label">
                      {activePath || "SOURCE"}
                    </span>
                    {project?.root === activePath && (
                      <span className="root-label">main</span>
                    )}
                  </div>
                  <div>
                    <button
                      aria-label="Undo"
                      title="Undo"
                      disabled={!!typing.current}
                      onClick={() =>
                        lastTyping ? void undoTyping() : editor.current?.undo()
                      }
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      aria-label="Redo"
                      title="Redo"
                      disabled={!!typing.current}
                      onClick={() => editor.current?.redo()}
                    >
                      <Redo2 size={14} />
                    </button>
                    <span className="toolbar-divider" />
                    <button
                      className="source-sync"
                      onClick={() => void toPdf()}
                      disabled={!pdfJob}
                    >
                      <ArrowUp size={12} className="rotate-right" />
                      Go to PDF
                    </button>
                  </div>
                </div>
                <div className="editor-area">
                  {doc && !binary ? (
                    <Editor
                      key={project?.id + "/" + activePath}
                      ref={editor}
                      content={doc.content}
                      readOnly={loadingProjects || (busy && mode === "manual")}
                      onChange={(content) => {
                        if (docRef.current)
                          setDoc({ ...docRef.current, content });
                      }}
                      onSelection={(line, column, from, to) =>
                        setPosition({ line, column, from, to })
                      }
                      onCompile={() => compileRef.current()}
                      onToPdf={() => void toPdf()}
                    />
                  ) : (
                    <div className="editor-empty">
                      <FileText size={30} strokeWidth={1} />
                      <p>
                        {binary
                          ? "This asset is preserved in your project."
                          : "Open a source file to begin."}
                      </p>
                      {binary && (
                        <a
                          className="subtle"
                          href={`/api/projects/${project?.id}/raw?path=${encodeURIComponent(activePath)}`}
                          download
                        >
                          Download {activePath.split("/").at(-1)}
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <div className="editor-status">
                  <span
                    className={
                      saveStatus === "Save failed" ? "danger-text" : ""
                    }
                  >
                    {saveStatus === "Saved" ? (
                      <CheckCheck size={12} />
                    ) : (
                      <span className="status-dot amber" />
                    )}
                    {saveStatus}
                  </span>
                  <span>
                    Ln {position.line}, Col {position.column}
                    <i />
                    UTF-8
                    <i />
                    LaTeX
                  </span>
                </div>
                <div
                  className="composer-resize"
                  role="separator"
                  aria-label="Assistant panel height"
                  aria-orientation="horizontal"
                  aria-valuemin={180}
                  aria-valuemax={550}
                  aria-valuenow={composerHeight}
                  tabIndex={0}
                  onPointerDown={(e) => resize(e, "composer")}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp")
                      setComposerHeight((h) => Math.min(550, h + 20));
                    if (e.key === "ArrowDown")
                      setComposerHeight((h) => Math.max(180, h - 20));
                  }}
                >
                  <span />
                </div>
                <section
                  className="assistant-panel"
                  style={{ height: composerHeight }}
                  aria-label="AI assistant"
                >
                  <div className="assistant-heading">
                    <div>
                      <Sparkles size={15} />
                      <span>Your writing companion</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="New conversation view"
                      onClick={() => {
                        setFreshConversation(true);
                        setRunText("");
                        setActiveRun(null);
                        setPrompt("");
                        setContextFiles([]);
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="assistant-content" ref={chatBody}>
                    {busy && mode === "manual" ? (
                      <div className="typing-status">
                        <span className="typing-cursor" />
                        <div>
                          <strong>
                            AI typing ·{" "}
                            {models.find(
                              (m) => m.id === model && m.provider === provider,
                            )?.label || model}
                          </strong>
                          <small>
                            {paused
                              ? "Paused · generation may continue"
                              : "Writing directly into " + activePath}
                          </small>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={paused ? "Resume typing" : "Pause typing"}
                          onClick={() => {
                            const t = typing.current;
                            if (t) {
                              t.buffer.paused = !t.buffer.paused;
                              setPaused(t.buffer.paused);
                              void api(`/ai/runs/${t.id}/heartbeat`, "POST", {
                                paused: t.buffer.paused,
                              }).catch(report);
                            }
                          }}
                        >
                          {paused ? <Play size={16} /> : <Pause size={16} />}
                        </button>
                      </div>
                    ) : shownText ? (
                      <div className="assistant-answer">
                        <div className="answer-meta">
                          <Sparkles size={12} />
                          {activeRun?.model || latestRun?.model}
                          <span>{busy ? "Thinking…" : "Response"}</span>
                        </div>
                        <div className="answer-text">{shownText}</div>
                      </div>
                    ) : (
                      <div className="assistant-welcome">
                        <h3>A clearer thought starts here.</h3>
                        <p>
                          Refine a paragraph, explore an equation, or work
                          through a tricky error.
                        </p>
                        <div className="suggestions">
                          <button
                            disabled={!doc || busy}
                            onClick={() =>
                              setPrompt(
                                "Help me make the selected passage clearer while preserving its meaning.",
                              )
                            }
                          >
                            <Pencil size={12} />
                            Refine writing
                          </button>
                          <button
                            disabled={!doc || busy}
                            onClick={() =>
                              setPrompt(
                                "Explain the mathematics in this document.",
                              )
                            }
                          >
                            <CircleHelp size={12} />
                            Explain an equation
                          </button>
                        </div>
                      </div>
                    )}
                    {busy && mode === "review" && (
                      <div className="tool-status">
                        <LoaderCircle className="spin" size={12} />
                        {toolStatus || "Thinking…"}
                      </div>
                    )}
                    {currentProposal && (
                      <div className="proposal-card">
                        <div>
                          <Check size={15} />
                          <strong>
                            {currentProposal.files.length}{" "}
                            {currentProposal.files.length === 1
                              ? "file"
                              : "files"}{" "}
                            ·{" "}
                            {currentProposal.status === "pending"
                              ? "changes ready"
                              : "changes applied"}
                          </strong>
                        </div>
                        <p>{currentProposal.summary}</p>
                        <div>
                          <button onClick={() => setModal("diff")}>
                            Review changes
                          </button>
                          {currentProposal.status === "pending" ? (
                            <button
                              className="primary small"
                              onClick={() =>
                                void proposalAction(currentProposal, "apply")
                              }
                            >
                              Apply
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                void proposalAction(currentProposal, "undo")
                              }
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {latestRun?.status === "interrupted" && !busy && (
                      <p className="field-help" role="status">
                        Typing was interrupted. Your saved partial text is
                        intact; no request was resumed.
                      </p>
                    )}
                    {lastTyping && !busy && (
                      <button
                        className="undo-typing"
                        onClick={() => void undoTyping()}
                      >
                        <Undo2 size={13} />
                        Undo last typing run
                      </button>
                    )}
                  </div>
                  <div className="composer">
                    <div className="composer-mode">
                      <div className="mode-switch">
                        <button
                          disabled={busy}
                          className={mode === "review" ? "selected" : ""}
                          onClick={() => setMode("review")}
                        >
                          <CheckCheck size={12} />
                          Review Edits
                        </button>
                        <button
                          disabled={busy}
                          className={mode === "manual" ? "selected" : ""}
                          onClick={() => {
                            setMode("manual");
                            setManualExplicit(false);
                            setQuote(null);
                          }}
                        >
                          <Keyboard size={12} />
                          Manual Type
                        </button>
                      </div>
                      {mode === "manual" && (
                        <select
                          aria-label="Typing speed"
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                        >
                          <option value={0.5}>0.5×</option>
                          <option value={1}>1×</option>
                          <option value={2}>2×</option>
                          <option value={0}>Instant</option>
                        </select>
                      )}
                    </div>
                    <textarea
                      aria-label="Ask your AI assistant"
                      placeholder={
                        mode === "manual"
                          ? "What should I type at your cursor?"
                          : "Ask anything about your document…"
                      }
                      value={prompt}
                      disabled={!doc || busy}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-footer">
                      <div className="model-selects">
                        <select
                          aria-label="AI provider"
                          value={provider}
                          disabled={busy}
                          onChange={(e) => {
                            setProvider(e.target.value as Provider);
                            setManualExplicit(false);
                            setQuote(null);
                            setManualModel("");
                          }}
                        >
                          {(
                            [
                              { label: "API keys", items: apiProviders },
                              { label: "Local CLI login", items: cliProviders },
                            ] as const
                          ).map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.items.map((p) => (
                                <option key={p} value={p}>
                                  {providerNames[p]}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <span className="model-divider" />
                        <select
                          aria-label="AI model"
                          value={model}
                          disabled={busy}
                          onChange={(e) => {
                            if (e.target.value === "custom") {
                              setModal("custom-model");
                              setFormValue(model);
                              return;
                            }
                            if (mode === "manual") {
                              setManualModel(e.target.value);
                              setManualExplicit(true);
                            } else
                              setReviewModels((m) => ({
                                ...m,
                                [provider]: e.target.value,
                              }));
                          }}
                        >
                          {mode === "manual" && !model && (
                            <option value="">Choose a model</option>
                          )}
                          {models
                            .filter((m) => m.provider === provider)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          {model && !models.some((m) => m.id === model) && (
                            <option value={model}>{model}</option>
                          )}
                          <option value="custom">Custom model…</option>
                        </select>
                      </div>
                      {busy ? (
                        <button
                          className="send-button stop"
                          aria-label="Stop AI generation"
                          onClick={() => void stop()}
                        >
                          <Square size={14} fill="currentColor" />
                        </button>
                      ) : (
                        <button
                          className="send-button"
                          aria-label="Send to AI"
                          title="Send (⌘Enter)"
                          disabled={!doc || !prompt.trim() || !model}
                          onClick={() => void send()}
                        >
                          <ArrowUp size={19} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="context-caption">
                    {mode === "manual" ? (
                      <>
                        <Zap size={10} />
                        {isCliProvider(provider)
                          ? "CLI login · subscription usage limits apply"
                          : manualExplicit
                            ? "Explicit model selection"
                            : quote?.model
                              ? `Lowest estimated cost · ≤ $${Number(quote.cost).toFixed(4)}`
                              : quote?.reason || "Checking model access…"}
                      </>
                    ) : (
                      <>
                        <FileText size={10} />
                        {position.from !== position.to ? "Selection + " : ""}
                        {contextFiles.length
                          ? contextFiles.join(", ")
                          : activePath || "No document selected"}
                        <span>⌘ ↵ to send</span>
                      </>
                    )}
                  </div>
                </section>
              </section>
              <div
                className="resize-handle panel-resizer"
                role="separator"
                aria-label="Editor and preview split"
                aria-orientation="vertical"
                aria-valuemin={30}
                aria-valuemax={75}
                aria-valuenow={panelWidth}
                tabIndex={0}
                onPointerDown={(e) => resize(e, "split")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft")
                    setPanelWidth((w) => Math.max(30, w - 2));
                  if (e.key === "ArrowRight")
                    setPanelWidth((w) => Math.min(75, w + 2));
                }}
              />
              <section className="preview-panel">
                <div className="preview-heading">
                  <div className="preview-tabs">
                    <button
                      className={rightTab === "preview" ? "active" : ""}
                      onClick={() => setRightTab("preview")}
                    >
                      Preview
                    </button>
                    <button
                      className={rightTab === "logs" ? "active" : ""}
                      onClick={() => setRightTab("logs")}
                    >
                      Logs
                      {latest?.diagnostics.length ? (
                        <span>{latest.diagnostics.length}</span>
                      ) : null}
                    </button>
                  </div>
                  <div className="compile-controls">
                    <button
                      className={"auto-toggle " + (autoCompile ? "on" : "")}
                      title="Automatic compilation"
                      aria-label="Automatic compilation"
                      aria-pressed={autoCompile}
                      onClick={() => {
                        setAutoCompile((a) => !a);
                        void api("/settings/preferences", "PUT", {
                          autoCompile: !autoCompile,
                        });
                      }}
                    >
                      <Zap size={14} />
                    </button>
                    <button
                      className="compile-button"
                      disabled={!!typing.current || !project?.root}
                      onClick={() =>
                        running
                          ? void api(
                              `/builds/${running.id}/cancel`,
                              "POST",
                              {},
                            ).then(() => fetchBuilds(project!.id))
                          : void compile()
                      }
                    >
                      {running ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                      {running ? "Stop build" : "Compile"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Clean rebuild"
                      title="Clean rebuild"
                      disabled={!!running || !!typing.current}
                      onClick={() => void compile(true)}
                    >
                      <Redo2 size={14} />
                    </button>
                  </div>
                </div>
                {rightTab === "preview" ? (
                  <PdfPreview
                    url={pdfJob ? `/api/builds/${pdfJob.id}/pdf` : undefined}
                    stale={
                      !!pdfJob &&
                      (pdfJob.generation !== project?.generation ||
                        saveStatus !== "Saved")
                    }
                    onInverse={(p, x, y) => void fromPdf(p, x, y)}
                    targetPage={targetPage}
                    targetLocation={pdfLocation}
                  />
                ) : (
                  <div className="logs-panel">
                    <div className="build-summary">
                      <span className={"build-dot " + (latest?.status ?? "")} />
                      <h3>
                        {latest
                          ? latest.status[0].toUpperCase() +
                            latest.status.slice(1)
                          : "No builds yet"}
                      </h3>
                      {latest && <span>{latest.engine}</span>}
                    </div>
                    {latest?.diagnostics.map((d, i) => (
                      <div className={"diagnostic " + d.severity} key={i}>
                        <button
                          onClick={() => {
                            if (
                              d.path &&
                              project?.files.some((f) => f.path === d.path)
                            ) {
                              void openFile(d.path).then(() =>
                                setTimeout(
                                  () => editor.current?.jump(d.line ?? 1),
                                  20,
                                ),
                              );
                            }
                          }}
                        >
                          <strong>
                            {d.severity === "error" ? "Error" : "Warning"}
                            {d.line ? ` · ${d.path}:${d.line}` : ""}
                          </strong>
                          <p>{d.message}</p>
                        </button>
                        <button
                          className="fix-ai"
                          disabled={busy}
                          onClick={() => {
                            setMode("review");
                            setPrompt(
                              `Help fix this LaTeX ${d.severity} in ${d.path ?? project?.root}${d.line ? ` at line ${d.line}` : ""}: ${d.message}`,
                            );
                          }}
                        >
                          <Sparkles size={12} />
                          Fix with AI
                        </button>
                      </div>
                    ))}
                    <details open={!latest?.diagnostics.length}>
                      <summary>Full compile log</summary>
                      <pre>
                        {latest?.log ||
                          "Compile your document to see diagnostics here."}
                      </pre>
                    </details>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {modal === "settings" && (
        <Settings
          settings={settings}
          onClose={() => setModal("")}
          onRefresh={refreshSettings}
          onTheme={(t) => void chooseTheme(t)}
        />
      )}
      {modal === "import" && (
        <ImportProject onClose={() => setModal("")} onImport={importZip} />
      )}
      {modal === "import-summary" && (
        <Modal title="Project imported" onClose={() => setModal("")}>
          <p className="modal-intro">
            Your project is ready. {importSkipped.length} hidden or system{" "}
            {importSkipped.length === 1 ? "entry was" : "entries were"} left out
            of the import.
          </p>
          <div
            className="import-skipped"
            role="region"
            aria-label="Skipped ZIP entries"
            tabIndex={0}
          >
            <ul>
              {importSkipped.map((entry, i) => (
                <li key={i}>
                  <code>{entry.path}</code>
                  <small>
                    {entry.reason === "metadata"
                      ? "System metadata"
                      : "Hidden file or folder"}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          <p className="import-note">
            If your document depends on a hidden source file, give it a visible
            name, update its references, and import again. Your original ZIP is
            unchanged.
          </p>
          <div className="form-actions">
            <button className="primary" onClick={() => setModal("")}>
              Continue to project
            </button>
          </div>
        </Modal>
      )}
      {[
        "new-project",
        "new-file",
        "new-folder",
        "rename",
        "checkpoint",
        "custom-model",
      ].includes(modal) && (
        <Modal
          title={
            {
              "new-project": "New project",
              "new-file": "New file",
              "new-folder": "New folder",
              rename: "Rename",
              checkpoint: "Save a checkpoint",
              "custom-model": "Choose a model",
            }[modal]!
          }
          onClose={() => setModal("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (modal === "custom-model") {
                if (mode === "manual") {
                  setManualModel(formValue.trim());
                  setManualExplicit(true);
                } else
                  setReviewModels((m) => ({
                    ...m,
                    [provider]: formValue.trim(),
                  }));
                setModal("");
              } else void formSubmit();
            }}
          >
            <label className="field-label" htmlFor="name-input">
              {modal === "custom-model" ? "Exact model identifier" : "Name"}
            </label>
            <input
              className="text-input"
              id="name-input"
              autoFocus
              required
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={
                modal === "new-file"
                  ? "sections/introduction.tex"
                  : modal === "checkpoint"
                    ? "Before revising the introduction"
                    : ""
              }
            />
            {modal === "new-project" && (
              <label className="field-label new-project-template">
                Start with
                <select
                  className="text-input"
                  value={projectTemplate}
                  onChange={(e) => setProjectTemplate(e.target.value)}
                >
                  <option value="blank">Blank document</option>
                  <option value="example">Example paper</option>
                </select>
              </label>
            )}
            {modal === "custom-model" && (
              <p className="field-help">
                This explicitly selects a model. Its pricing may not be in the
                catalog; your provider will validate access when you send.
              </p>
            )}
            <div className="form-actions">
              <button
                className="primary"
                type="submit"
                disabled={submitting || !formValue.trim()}
              >
                {submitting
                  ? "Creating…"
                  : modal === "rename"
                    ? "Rename"
                    : modal === "custom-model"
                      ? "Use model"
                      : "Create"}
              </button>
              <button type="button" onClick={() => setModal("")}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "project-settings" && project && (
        <Modal title="Project settings" onClose={() => setModal("")}>
          <label className="field-label">
            Project name
            <input
              className="text-input"
              defaultValue={project.name}
              maxLength={120}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== project.name)
                  void api<Project>(`/projects/${project.id}`, "PATCH", {
                    name: e.target.value,
                  })
                    .then((p) => {
                      setProject(p);
                      setProjects((ps) =>
                        ps.map((x) => (x.id === p.id ? p : x)),
                      );
                    })
                    .catch(report);
              }}
            />
          </label>
          <label className="field-label">
            Root document
            <select
              className="text-input"
              value={project.root}
              onChange={(e) =>
                void api<Project>(`/projects/${project.id}`, "PATCH", {
                  root: e.target.value,
                })
                  .then(setProject)
                  .catch(report)
              }
            >
              {project.files
                .filter((f) => !f.deleted && f.path.endsWith(".tex"))
                .map((f) => (
                  <option key={f.path}>{f.path}</option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Compiler
            <select
              className="text-input"
              value={project.engine}
              onChange={(e) =>
                void api<Project>(`/projects/${project.id}`, "PATCH", {
                  engine: e.target.value,
                })
                  .then(setProject)
                  .catch(report)
              }
            >
              <option value="pdflatex">pdfLaTeX</option>
              <option value="xelatex">XeLaTeX</option>
              <option value="lualatex">LuaLaTeX</option>
            </select>
          </label>
          <div className="dependency-list">
            {Object.entries(health?.toolchain ?? {}).map(
              ([name, available]) => (
                <div key={name}>
                  <span>{name}</span>
                  <span className={available ? "available" : "muted"}>
                    {available ? "Installed" : "Not installed"}
                  </span>
                </div>
              ),
            )}
          </div>
          {!health?.toolchain?.biber && (
            <p className="field-help">
              Projects using biblatex’s default backend need Biber. Install it
              through your TeX distribution when needed.
            </p>
          )}
          <button
            className="subtle"
            onClick={() => {
              setModal("checkpoint");
              setFormValue("");
            }}
          >
            <History size={14} />
            Save checkpoint
          </button>
        </Modal>
      )}
      {modal === "history" && project && (
        <Modal title="Checkpoints" onClose={() => setModal("")}>
          <p className="modal-intro">A safe place to return to.</p>
          <button
            className="primary"
            onClick={() => {
              setModal("checkpoint");
              setFormValue("");
            }}
          >
            <Plus size={14} />
            Save current version
          </button>
          <div className="history-list">
            {checkpoints.length ? (
              checkpoints.map((c) => (
                <div key={c.id}>
                  <Clock3 size={16} />
                  <div>
                    <strong>{c.name}</strong>
                    <small>{new Date(c.created).toLocaleString()}</small>
                  </div>
                  <button
                    onClick={() =>
                      void saveNow()
                        .then(() =>
                          api(
                            `/projects/${project.id}/checkpoints/${c.id}/restore`,
                            "POST",
                            {},
                          ),
                        )
                        .then(async (p) => {
                          setProject(p);
                          setTabs((t) =>
                            t.filter((x) =>
                              p.files.some(
                                (f: FileInfo) => f.path === x && !f.deleted,
                              ),
                            ),
                          );
                          await openFile(
                            p.files.some(
                              (f: FileInfo) =>
                                f.path === activePath && !f.deleted,
                            )
                              ? activePath
                              : p.root,
                            p,
                          );
                          setModal("");
                          setToast(
                            "Checkpoint restored; previous state was backed up",
                          );
                        })
                        .catch(report)
                    }
                  >
                    Restore
                  </button>
                </div>
              ))
            ) : (
              <p className="field-help">
                Save your first checkpoint before a bigger revision.
              </p>
            )}
          </div>
        </Modal>
      )}
      {modal === "trash" && project && (
        <Modal title="Trash" onClose={() => setModal("")}>
          <p className="modal-intro">
            Deleted files stay here until you restore them.
          </p>
          <div className="history-list">
            {project.files
              .filter((f) => f.deleted && f.kind !== "directory")
              .map((f) => (
                <div key={f.path}>
                  <FileText size={16} />
                  <span>{f.path}</span>
                  <button
                    onClick={() =>
                      void api<Project>(
                        `/projects/${project.id}/restore`,
                        "POST",
                        { path: f.path },
                      )
                        .then(setProject)
                        .catch(report)
                    }
                  >
                    Restore
                  </button>
                </div>
              ))}
            {!project.files.some((f) => f.deleted) && (
              <p className="field-help">Nothing in Trash.</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "diff" && currentProposal && (
        <Modal title="Review changes" wide onClose={() => setModal("")}>
          <p className="modal-intro">{currentProposal.summary}</p>
          <div className="diff-files">
            {currentProposal.files.map((f) => (
              <section key={f.path}>
                <h3>
                  <FileText size={15} />
                  {f.path}
                  <span>revision {f.baseRevision}</span>
                </h3>
                <pre>
                  {diffLines(f.before, f.after).map((part, i) => (
                    <span
                      key={i}
                      className={
                        part.added ? "added" : part.removed ? "removed" : ""
                      }
                    >
                      {part.value
                        .split("\n")
                        .filter((s, j, a) => j < a.length - 1 || s)
                        .map((line, j) => (
                          <span className="diff-line" key={j}>
                            <b>{part.added ? "+" : part.removed ? "−" : " "}</b>
                            {line}
                            {"\n"}
                          </span>
                        ))}
                    </span>
                  ))}
                </pre>
              </section>
            ))}
          </div>
          <div className="form-actions">
            {currentProposal.status === "pending" ? (
              <>
                <button
                  className="primary"
                  onClick={() =>
                    void proposalAction(currentProposal, "apply").then(() =>
                      setModal(""),
                    )
                  }
                >
                  Apply changes
                </button>
                <button
                  onClick={() =>
                    void proposalAction(currentProposal, "reject").then(() =>
                      setModal(""),
                    )
                  }
                >
                  Reject
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  void proposalAction(currentProposal, "undo").then(() =>
                    setModal(""),
                  )
                }
              >
                Undo changes
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="A little space to think" onClose={() => setModal("")}>
          <p className="modal-intro">
            Prism is your local LaTeX workspace. Start with your own project
            ZIP, or explore this sample.
          </p>
          <div className="help-shortcuts">
            <div>
              <span>Compile document</span>
              <kbd>⌘ Enter</kbd>
            </div>
            <div>
              <span>Find in source</span>
              <kbd>⌘ F</kbd>
            </div>
            <div>
              <span>Go to PDF from source</span>
              <kbd>⌘ ⇧ J</kbd>
            </div>
            <div>
              <span>Find source from PDF</span>
              <kbd>Double-click</kbd>
            </div>
          </div>
          <p className="field-help">
            Review Edits proposes changes for you to accept. Manual Type inserts
            at the cursor using your provider’s cheapest verified eligible
            model. Pause affects typing; Stop cancels generation. All files are
            stored on this computer.
          </p>
          <p className="field-help">
            Independent software inspired by Prism. Not affiliated with OpenAI.
          </p>
        </Modal>
      )}
    </div>
  );
}
