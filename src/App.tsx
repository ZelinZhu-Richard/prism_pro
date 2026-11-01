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
  Copy,
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
import {
  TypingDocument,
  selectedPassage,
  type SelectedPassage,
} from "./typing-document";
import { ReferencesPanel } from "./components/ReferencesPanel";
import { WordCountPanel } from "./components/WordCountPanel";
import type { ProjectIntelligence } from "../shared/project-intelligence";
import { citationInsertion } from "./latex-completion";
import {
  visualProjection,
  visualSelectionBalanced,
  visualCaret,
} from "./visual-source";
import { SourceToolbar, type InsertTool } from "./components/SourceToolbar";
import {
  TableBuilder,
  FigureBuilder,
  SymbolPicker,
} from "./components/InsertTools";
import {
  blockInsertion,
  formatSource,
  inMathMode,
  type FormatAction,
} from "./source-actions";
import { HistoryPanel } from "./components/HistoryPanel";
import { ProjectSearch } from "./components/ProjectSearch";
import { FileTree } from "./components/FileTree";
import { movedPath, type MoveResult } from "../shared/file-moves";
import type { SearchFile, SearchMatch } from "../shared/search";
import { SelectionPreview } from "./components/SelectionPreview";
import {
  Editor,
  type EditorHandle,
  type EditorSnapshot,
} from "./components/Editor";
import { PdfPreview } from "./components/PdfPreview";
import { Modal } from "./components/Modal";
import { Settings, type SettingsSection } from "./components/Settings";
import { editorPreferences } from "../shared/editor-preferences";
import { PrismMark } from "./components/PrismMark";
import { ProjectHome } from "./components/ProjectHome";
import { CopyProject } from "./components/CopyProject";
import { ImportProject } from "./components/ImportProject";
import { ModelPicker } from "./components/ModelPicker";
import { connectedModels } from "../shared/model-options";
import { isCliProvider } from "../shared/types";
import type {
  Project,
  TextFile,
  Provider,
  EditMode,
  AiScope,
  CompileJob,
  AiRun,
  Conversation,
  Proposal,
  FileInfo,
  ProjectImport,
  SkippedArchiveEntry,
} from "../shared/types";

type Typing = {
  document: TypingDocument;
  savedVisible?: string;
  buffer: TypingBuffer;
  id: string;
  from: number;
  to: number;
  caret: number;
  first: boolean;
  editReady?: boolean;
  previewText?: string;
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
  const [copyTarget, setCopyTarget] = useState<{
    projectId: string;
    open: boolean;
  } | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState("");
  const [importSkipped, setImportSkipped] = useState<SkippedArchiveEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movingFiles, setMovingFiles] = useState(false);
  const movingFilesRef = useRef(false);
  function fileMoveBusy(value: boolean) {
    movingFilesRef.current = value;
    setMovingFiles(value);
    if (value) fileNavigation.current++;
  }
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
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("appearance");
  function openSettings(section: SettingsSection = "appearance") {
    setSettingsSection(section);
    setModal("settings");
  }
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
    [scope, setScope] = useState<AiScope>("document"),
    [refreshingModels, setRefreshingModels] = useState(false),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [activeRun, setActiveRun] = useState<AiRun | null>(null),
    [runText, setRunText] = useState(""),
    [freshConversation, setFreshConversation] = useState(false),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [conversationId, setConversationId] = useState(""),
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
  const [typingDraft, setTypingDraft] = useState<{
    text: string;
    suggestion: string;
    job?: CompileJob;
    compiling?: boolean;
    error?: string;
  } | null>(null);
  const [typingDoc, setTypingDoc] = useState<TextFile | null>(null);
  const [requestContext, setRequestContext] = useState<{
    path: string;
    selection: SelectedPassage | null;
  } | null>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]),
    [formValue, setFormValue] = useState(""),
    [menu, setMenu] = useState(false),
    [panelWidth, setPanelWidth] = useState(54),
    [sidebarWidth, setSidebarWidth] = useState(230),
    [composerHeight, setComposerHeight] = useState(360);
  const [intelligence, setIntelligence] = useState<ProjectIntelligence>();
  const [editorViewMode, setEditorViewMode] = useState<"code" | "visual">(
    "code",
  );
  const [sourceFragment, setSourceFragment] = useState<{
    project: string;
    file: TextFile;
    from: number;
    to: number;
    label: string;
    text: string;
  } | null>(null);
  const [intelligenceError, setIntelligenceError] = useState("");
  const [citationTarget, setCitationTarget] = useState<{
    file: TextFile;
    from: number;
    to: number;
  } | null>(null);
  const [insertionTarget, setInsertionTarget] = useState<{
    project: string;
    file: TextFile;
    from: number;
    to: number;
  } | null>(null);
  useEffect(() => {
    if (!project || busy) return;
    let stale = false;
    const timer = setTimeout(() => {
      void api<ProjectIntelligence>(`/projects/${project.id}/intelligence`)
        .then((data) => {
          if (!stale) {
            setIntelligence(data);
            setIntelligenceError("");
          }
        })
        .catch((e) => {
          if (!stale) setIntelligenceError(e.message);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [project?.id, project?.generation, busy]);
  const editorCache = useRef(
    new Map<string, { state: EditorSnapshot; revision: number }>(),
  );
  const moveUndoCache = useRef(
    new Map<string, Map<string, { state: EditorSnapshot; revision: number }>>(),
  );
  const editors = useRef(new Map<string, EditorHandle>()),
    fileNavigation = useRef(0),
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
    chatBody = useRef<HTMLDivElement>(null),
    chatPinned = useRef(true);
  projectRef.current = project;
  busyRef.current = busy;
  speedRef.current = speed;
  function setDoc(value: TextFile | null) {
    docRef.current = value;
    setDocState(value);
  }
  function currentEditor() {
    return docRef.current
      ? editors.current.get(docRef.current.path)
      : undefined;
  }
  function editingBlocked() {
    if (movingFilesRef.current) {
      setToast("Wait for the file move to finish.");
      return true;
    }
    if (
      !busyRef.current &&
      !runs.some((r) =>
        ["generating", "typing", "paused", "preview"].includes(r.status),
      )
    )
      return false;
    setToast(
      "Files are read-only while the assistant works. You can still switch files.",
    );
    return true;
  }
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const refreshSettings = useCallback(async () => {
    const s = await api("/settings");
    setSettings(s);
  }, []);
  const choices = connectedModels(settings?.providers);
  const choicesKey = choices
    .map((choice) => `${choice.provider}:${choice.id}`)
    .join("|");
  useEffect(() => {
    if (busy || !choices.length) return;
    if (
      !choices.some(
        (choice) =>
          choice.provider === provider && choice.id === reviewModels[provider],
      )
    ) {
      const same = choices.filter((choice) => choice.provider === provider);
      const choice =
        same.find((choice) => choice.isDefault) || same[0] || choices[0];
      setProvider(choice.provider);
      setReviewModels((current) => ({
        ...current,
        [choice.provider]: choice.id,
      }));
    }
  }, [choicesKey, busy]);
  async function refreshModels() {
    setRefreshingModels(true);
    try {
      await api("/providers/refresh", "POST", {});
      await refreshSettings();
    } catch (e) {
      report(e);
    } finally {
      setRefreshingModels(false);
    }
  }
  const refreshProject = useCallback(async () => {
    if (!projectRef.current) return;
    const p = await api<Project>("/projects/" + projectRef.current.id);
    setProject(p);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  }, []);
  useEffect(() => {
    if (chatPinned.current && chatBody.current)
      chatBody.current.scrollTop = chatBody.current.scrollHeight;
  }, [runText, conversationId, runs.length, busy, typingDraft]);
  async function refreshChats() {
    if (!projectRef.current) return;
    const c = await api("/projects/" + projectRef.current.id + "/chats");
    setRuns(c.runs);
    setConversations(c.conversations ?? []);
    setConversationId((current) =>
      c.conversations?.some((x: Conversation) => x.id === current)
        ? current
        : (c.conversations?.[0]?.id ?? ""),
    );
    setProposals(c.proposals);
    const undoable = c.runs
      .filter(
        (r: AiRun & { lastRevision?: number }) =>
          r.mode === "manual" &&
          r.visible !== undefined &&
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
        setScope(s.preferences.scope ?? "document");
        setReviewModels((m) => ({
          ...m,
          [s.preferences.provider ?? "openai"]:
            s.preferences.model ?? defaultModels.openai,
        }));
        setAutoCompile(!!s.preferences.autoCompile);
        setEditorViewMode(
          s.preferences.editorView === "visual" ? "visual" : "code",
        );
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
    const search = (e: KeyboardEvent) => {
      if (
        projectRef.current &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setSidebarTab("search");
        requestAnimationFrame(() =>
          document.getElementById("project-search-query")?.focus(),
        );
      }
    };
    window.addEventListener("keydown", search);
    return () => window.removeEventListener("keydown", search);
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
        scope,
      }).catch(report);
  }, [provider, reviewModels, scope]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        busyRef.current ||
        movingFilesRef.current ||
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
    if (!doc || busy || typing.current || doc.content === saved.current) return;
    setSaveStatus("Unsaved");
    const timer = setTimeout(() => void saveNow().catch(report), 600);
    return () => clearTimeout(timer);
  }, [doc?.content, doc?.path, busy, mode]);
  async function openFile(path: string, p = projectRef.current) {
    if (!p || movingFilesRef.current) return;
    const navigation = ++fileNavigation.current;
    try {
      await saveNow();
      const f = p.files.find((f) => f.path === path && !f.deleted);
      if (!f || f.kind === "directory" || navigation !== fileNavigation.current)
        return;
      let loaded: TextFile | null = null;
      if (f.kind === "text") {
        loaded =
          typing.current?.document.file.path === path
            ? typing.current.document.file
            : await api<TextFile>(
                `/projects/${p.id}/file?path=${encodeURIComponent(path)}`,
              );
      }
      if (
        navigation !== fileNavigation.current ||
        projectRef.current?.id !== p.id
      )
        return;
      // A pending GET must never replace newer visible typing progress.
      const target = typing.current?.document;
      const d = target?.file.path === path ? target.file : loaded;
      setActivePath(path);
      setTabs((t) => (t.includes(path) ? t : [...t, path]));
      setBinary(f.kind === "binary");
      setDoc(d);
      saved.current =
        target?.file.path === path ? target.savedContent : (d?.content ?? "");
      setSaveStatus(d && d.content !== saved.current ? "Saving…" : "Saved");
      setLastTyping(
        runs
          .filter(
            (r) =>
              r.mode === "manual" &&
              r.path === path &&
              r.visible !== undefined &&
              r.lastRevision === d?.revision &&
              ["completed", "stopped", "failed", "interrupted"].includes(
                r.status,
              ),
          )
          .at(-1)?.id ?? "",
      );
      setPosition({ line: 1, column: 1, from: 0, to: 0 });
    } catch (e) {
      if (navigation === fileNavigation.current) report(e);
    }
  }
  async function openProject(p: Project, updateUrl = true) {
    if (busyRef.current || movingFilesRef.current) {
      setToast("Finish the current AI request first.");
      return;
    }
    if (navigationPending.current) return;
    navigationPending.current = true;
    setLoadingProjects(true);
    try {
      await saveNow();
      p = await api<Project>("/projects/" + p.id);
      setIntelligence(undefined);
      setIntelligenceError("");
      setProject(p);
      projectRef.current = p;
      if (updateUrl)
        history.pushState(null, "", "/?project=" + encodeURIComponent(p.id));
      setTabs([]);
      setTypingDoc(null);
      setRequestContext(null);
      setDoc(null);
      setActivePath("");
      setBuilds([]);
      setPdfJob(null);
      setFreshConversation(false);
      setConversationId("");
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
    if (busyRef.current || movingFilesRef.current) {
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
      setConversations([]);
      setConversationId("");
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
    if (
      busyRef.current ||
      movingFilesRef.current ||
      navigationPending.current
    ) {
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
    if (
      !projectRef.current ||
      busyRef.current ||
      movingFilesRef.current ||
      runs.some((r) =>
        ["generating", "typing", "paused", "preview"].includes(r.status),
      )
    )
      return;
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
      busy ||
      movingFiles ||
      runs.some((r) =>
        ["generating", "typing", "paused", "preview"].includes(r.status),
      ) ||
      saveStatus !== "Saved" ||
      !doc ||
      running ||
      pdfJob?.generation === project.generation
    )
      return;
    const timer = setTimeout(() => void compile(), 1800);
    return () => clearTimeout(timer);
  }, [project?.generation, autoCompile, busy, movingFiles, saveStatus, runs]);
  async function toPdf() {
    if (!pdfJob || !doc || movingFilesRef.current) return;
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
    if (!pdfJob || movingFilesRef.current) return;
    const projectId = projectRef.current?.id;
    try {
      const result = await api(`/builds/${pdfJob.id}/sync`, "POST", {
        direction: "inverse",
        page,
        x,
        y,
      });
      if (projectRef.current?.id !== projectId) return;
      if (
        !projectRef.current?.files.some(
          (f) => !f.deleted && f.kind === "text" && f.path === result.path,
        )
      ) {
        setToast(
          "This PDF predates a file move. Recompile before jumping to the source.",
        );
        return;
      }
      if (result.path !== docRef.current?.path) await openFile(result.path);
      setTimeout(() => {
        if (
          projectRef.current?.id === projectId &&
          docRef.current?.path === result.path
        )
          currentEditor()?.jump(result.line);
      }, 30);
    } catch (e) {
      report(e);
    }
  }
  function requestFor(
    model: string,
    text = prompt,
    destination?: { file: TextFile; from: number; to: number },
  ) {
    const p = projectRef.current!,
      d = destination?.file ?? docRef.current!,
      selection = destination
        ? { from: destination.from, to: destination.to }
        : (currentEditor()?.selection() ?? { from: 0, to: 0 });
    return {
      projectId: p.id,
      conversationId: conversationId || undefined,
      previewFirst: mode === "manual",
      provider,
      model,
      mode,
      scope,
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
    scope,
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
    if (!t?.id || t.first) return;
    if (t.saving) {
      await t.saving;
      return persistTyping();
    }
    if (t.buffer.visible === t.savedVisible) return;
    const visible = t.buffer.visible,
      revision = t.document.file.revision;
    const promise = (async () => {
      const result = await api<TextFile>(`/ai/runs/${t.id}/progress`, "PUT", {
        visible,
        revision,
      });
      if (typing.current === t) {
        t.document.acknowledge(result);
        t.savedVisible = visible;
        setTypingDoc(t.document.file);
        if (docRef.current?.path === t.document.file.path) {
          saved.current = t.document.savedContent;
          setDoc(t.document.file);
          setSaveStatus(
            t.document.file.content === saved.current ? "Saved" : "Saving…",
          );
        }
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
      if (docRef.current?.path === t.document.file.path && !t.first)
        setLastTyping(t.id);
    } catch (e) {
      report(e);
      try {
        await api(`/ai/runs/${t.id}/stop`, "POST", {});
        await api(`/ai/runs/${t.id}/finish`, "POST", {});
      } catch {}
    } finally {
      editors.current.get(t.document.file.path)?.endTyping();
      typing.current = null;
      setTypingDoc(null);
      setTypingDraft(null);
      busyRef.current = false;
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
    if (
      chars ||
      (t.editReady && t.first && t.buffer.finished && !t.buffer.stopped)
    ) {
      const target = editors.current.get(t.document.file.path);
      if (!target) {
        t.buffer.stop();
        report(
          new Error(
            "The typing editor is no longer available. Saved progress is intact.",
          ),
        );
        void api(`/ai/runs/${t.id}/stop`, "POST", {}).finally(
          () => void finishTyping(),
        );
        return;
      }
      t.document.reveal(t.buffer.visible);
      target.type(t.caret, t.first ? t.to : t.caret, chars, t.first);
      setTypingDoc(t.document.file);
      if (docRef.current?.path === t.document.file.path)
        setDoc(t.document.file);
      t.caret += chars.length;
      t.first = false;
      if (docRef.current?.path === t.document.file.path)
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
  async function send(
    text = prompt,
    destination?: { file: TextFile; from: number; to: number },
    proposedReplacement?: string,
  ) {
    if (
      (!docRef.current && !destination) ||
      !projectRef.current ||
      busyRef.current ||
      movingFilesRef.current ||
      !text.trim()
    )
      return;
    const captured = { ...(destination?.file ?? docRef.current!) };
    try {
      const chosen = mode === "manual" ? manualModel : reviewModels[provider];
      if (
        !chosen ||
        !choices.some(
          (choice) => choice.provider === provider && choice.id === chosen,
        )
      )
        throw new Error(
          "Verify model access or choose a model in the composer.",
        );
      const request = {
        ...requestFor(chosen, text, destination),
        proposedReplacement,
      };
      busyRef.current = true;
      setBusy(true);
      setActiveRun(null);
      setRunText("");
      chatPinned.current = true;
      setToolStatus("Saving the selected document");
      setRequestContext({
        path: captured.path,
        selection: selectedPassage(captured, request.from, request.to),
      });
      if (mode === "manual") setTypingDoc(captured);
      await saveNow();
      const persisted = await api<TextFile>(
        `/projects/${request.projectId}/file?path=${encodeURIComponent(request.path)}`,
      );
      if (persisted.content !== captured.content)
        throw new Error(
          "The target file changed before the request started. Select it again and retry.",
        );
      request.revision = persisted.revision;
      setFreshConversation(false);
      setActiveRun(null);
      setRunText("");
      setToolStatus("Reading your context");
      setContextFiles([captured.path]);
      setPrompt("");
      setPaused(false);
      setError("");
      if (mode === "manual") {
        const buffer = new TypingBuffer();
        typing.current = {
          document: new TypingDocument(
            request.projectId,
            persisted,
            request.from,
            request.to,
          ),
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
            if (event.run.conversationId)
              setConversationId(event.run.conversationId);
            if (typing.current) {
              typing.current.id = event.run.id;
              if (!request.previewFirst) pumpTyping();
            }
          } else if (event.type === "text") {
            setRunText((t) => t + event.text);
          } else if (event.type === "typing") {
            const t = typing.current;
            if (t && !t.buffer.stopped) {
              t.document.range(event.from, event.to);
              t.from = event.from;
              t.to = event.to;
              t.caret = event.from;
              if (request.previewFirst) t.previewText = event.text;
              else {
                t.editReady = true;
                t.buffer.push(event.text);
              }
            }
          } else if (event.type === "tool")
            setToolStatus(
              event.name === "propose_edits"
                ? "Preparing changes"
                : event.name === "type_text"
                  ? "Typing in " + request.path
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
          if (
            request.previewFirst &&
            typing.current.previewText !== undefined &&
            !typing.current.buffer.stopped
          ) {
            setTypingDraft({
              text: typing.current.previewText,
              suggestion: "",
            });
            setModal("typing-preview");
            setToolStatus("Review the replacement before typing");
          } else {
            typing.current.buffer.complete();
            pumpTyping();
          }
        } else {
          typing.current = null;
          setTypingDoc(null);
          busyRef.current = false;
          setBusy(false);
        }
      } else {
        busyRef.current = false;
        setBusy(false);
        setToolStatus("");
        await refreshChats();
      }
    } catch (e) {
      report(e);
      setTypingDoc(null);
      setTypingDraft(null);
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function recoverDraft(run: AiRun) {
    try {
      await api(`/ai/runs/${run.id}/heartbeat`, "POST", {});
      const file = await api<TextFile>(
        `/projects/${run.projectId}/file?path=${encodeURIComponent(run.path)}`,
      );
      if (file.revision !== run.lastRevision)
        throw new Error(
          "This preview no longer matches the source. Stop it and request a new replacement.",
        );
      const buffer = new TypingBuffer();
      buffer.complete();
      typing.current = {
        document: new TypingDocument(run.projectId, file, run.from, run.to),
        buffer,
        id: run.id,
        from: run.from,
        to: run.to,
        caret: run.from,
        first: true,
        saving: null,
        finishing: false,
        previewText: run.insertion,
      };
      setTypingDoc(file);
      setMode("manual");
      setProvider(run.provider);
      setManualModel(run.model);
      setManualExplicit(true);
      setActiveRun(run);
      setConversationId(run.conversationId || "");
      setRunText(run.text);
      setRequestContext({
        path: run.path,
        selection: selectedPassage(file, run.from, run.to),
      });
      setTypingDraft({ text: run.insertion ?? "", suggestion: "" });
      busyRef.current = true;
      setBusy(true);
      setModal("typing-preview");
    } catch (e) {
      report(e);
    }
  }
  async function stopOtherRun(run: AiRun) {
    try {
      await api(`/ai/runs/${run.id}/stop`, "POST", {});
      if (run.mode === "manual")
        await api(`/ai/runs/${run.id}/finish`, "POST", {});
      await refreshChats();
      await refreshProject();
      if (docRef.current) await openFile(docRef.current.path);
    } catch (e) {
      report(e);
    }
  }
  async function startDraft() {
    const t = typing.current,
      draft = typingDraft;
    if (!t || !draft) return;
    try {
      const approved = await api(`/ai/runs/${t.id}/approve`, "POST", {
        text: draft.text,
      });
      t.buffer = new TypingBuffer();
      t.buffer.push(approved.text);
      t.buffer.complete();
      t.editReady = true;
      t.previewText = undefined;
      setTypingDraft(null);
      setModal("");
      setPaused(false);
      setToolStatus("Typing in " + t.document.file.path);
      pumpTyping();
    } catch (e) {
      setTypingDraft((d) =>
        d ? { ...d, error: e instanceof Error ? e.message : String(e) } : d,
      );
    }
  }
  async function reviseDraft() {
    const t = typing.current,
      draft = typingDraft;
    if (!t || !draft?.suggestion.trim()) return;
    const destination = { file: t.document.file, from: t.from, to: t.to };
    const question = `Revise the unapplied replacement in the same captured range. Requested changes: ${draft.suggestion}`;
    await stop();
    setModal("");
    await send(question, destination, draft.text);
  }
  async function compileDraft() {
    const t = typing.current,
      draft = typingDraft;
    if (!t || !draft || draft.compiling) return;
    setTypingDraft({
      ...draft,
      compiling: true,
      job: undefined,
      error: undefined,
    });
    try {
      let job = await api<CompileJob>(
        `/ai/runs/${t.id}/compile-preview`,
        "POST",
        { text: draft.text },
      );
      setTypingDraft((d) => (d ? { ...d, job } : d));
      while (
        ["queued", "running"].includes(job.status) &&
        typing.current === t
      ) {
        await new Promise((r) => setTimeout(r, 700));
        job = await api<CompileJob>(`/builds/${job.id}`);
        setTypingDraft((d) => (d ? { ...d, job } : d));
      }
    } catch (e) {
      setTypingDraft((d) =>
        d ? { ...d, error: e instanceof Error ? e.message : String(e) } : d,
      );
    } finally {
      setTypingDraft((d) => (d ? { ...d, compiling: false } : d));
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
    if (!lastTyping || !project || editingBlocked()) return;
    if (currentEditor()?.canUndo()) {
      currentEditor()?.undo();
      return;
    }
    const targetPath = docRef.current?.path;
    try {
      const result = await api(`/ai/runs/${lastTyping}/undo`, "POST", {});
      if (
        targetPath &&
        docRef.current?.path === targetPath &&
        projectRef.current?.id === project.id
      ) {
        saved.current = result.content;
        setDoc({
          path: targetPath,
          content: result.content,
          revision: result.revision,
        });
        // Restore source and selection atomically, before the controlled-content effect.
        editors.current
          .get(targetPath)
          ?.restore(result.content, result.selection);
        setSaveStatus("Saved");
        setLastTyping("");
      }
      await refreshProject();
      await refreshChats();
      setToast("Typing run undone");
    } catch (e) {
      report(e);
    }
  }
  async function proposalAction(p: Proposal, action: string) {
    if (editingBlocked()) return;
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
  async function openProjectCopy(p: Project, open = false) {
    if (editingBlocked()) return;
    try {
      await saveNow();
      if (open && projectRef.current?.id !== p.id) return;
      setMenu(false);
      setCopyTarget({ projectId: p.id, open });
    } catch (e) {
      report(e);
    }
  }
  function closeProjectCopy() {
    const sourceId = copyTarget?.projectId;
    setCopyTarget(null);
    requestAnimationFrame(() => {
      if (projectRef.current)
        document.querySelector<HTMLButtonElement>(".project-title")?.focus();
      else document.getElementById(`project-menu-${sourceId}`)?.focus();
    });
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
    if (!project || editingBlocked()) return;
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
  async function prepareFileMove(): Promise<Project> {
    const id = projectRef.current?.id;
    if (
      !id ||
      busyRef.current ||
      runs.some((r) =>
        ["generating", "typing", "paused", "preview"].includes(r.status),
      )
    )
      throw new Error("Finish the current AI request before moving files.");
    await saveNow();
    const latest = await api<Project>(`/projects/${id}`);
    if (projectRef.current?.id !== id)
      throw new Error("The project changed. Reopen the move dialog.");
    const current = docRef.current;
    if (
      current &&
      !latest.files.some(
        (f) =>
          !f.deleted &&
          f.path === current.path &&
          f.revision === current.revision,
      )
    )
      throw new Error(
        "The open file changed in another window. Reopen it before moving files.",
      );
    for (const [name, editor] of editors.current) {
      const state = editor.snapshot();
      const revision = latest.files.find(
        (f) => f.path === name && !f.deleted,
      )?.revision;
      if (state && revision !== undefined)
        editorCache.current.set(id + "/" + name, { state, revision });
    }
    projectRef.current = latest;
    setProject(latest);
    return latest;
  }
  async function fileMoved(result: MoveResult, before: Project) {
    if (projectRef.current?.id !== before.id) return;
    const after = result.project;
    const existing = (name: string) =>
      after.files.some(
        (f) => !f.deleted && f.kind !== "directory" && f.path === name,
      );
    const nextPath =
      [
        movedPath(activePath, result.moves),
        activePath,
        after.root,
        ...tabs.map((name) => movedPath(name, result.moves)),
      ].find(existing) ?? "";
    // Snapshots carry revisions: an old path must never donate history to a newly created file.
    const cached = [...editorCache.current.entries()].filter(([key]) =>
      key.startsWith(before.id + "/"),
    );
    if (!result.replayed && !result.undone && result.changedFiles?.length) {
      moveUndoCache.current.set(
        result.operationId,
        new Map(
          cached
            .filter(([key, value]) => {
              const name = key.slice(before.id.length + 1);
              return (
                result.changedFiles!.includes(movedPath(name, result.moves)) &&
                before.files.some(
                  (f) => f.path === name && f.revision === value.revision,
                )
              );
            })
            .map(([key, value]) => [key.slice(before.id.length + 1), value]),
        ),
      );
      if (moveUndoCache.current.size > 20)
        moveUndoCache.current.delete(
          moveUndoCache.current.keys().next().value!,
        );
    }
    for (const [key] of cached) editorCache.current.delete(key);
    for (const [key, value] of cached) {
      const name = key.slice(before.id.length + 1),
        oldFile = before.files.find((f) => f.path === name && !f.deleted);
      const nextName = movedPath(name, result.moves),
        nextFile = after.files.find((f) => f.path === nextName && !f.deleted);
      if (
        !result.replayed &&
        oldFile?.revision === value.revision &&
        nextFile &&
        !result.changedFiles?.includes(nextName)
      )
        editorCache.current.set(after.id + "/" + nextName, {
          state: value.state,
          revision: nextFile.revision,
        });
    }
    if (result.undone && !result.replayed)
      for (const [name, value] of moveUndoCache.current.get(
        result.operationId,
      ) ?? []) {
        const restored = after.files.find((f) => f.path === name && !f.deleted);
        if (restored)
          editorCache.current.set(after.id + "/" + name, {
            state: value.state,
            revision: restored.revision,
          });
      }
    if (result.undone) moveUndoCache.current.delete(result.operationId);
    fileNavigation.current++;
    projectRef.current = after;
    setProject(after);
    setTabs((old) => [
      ...new Set(
        old.map((name) => movedPath(name, result.moves)).filter(existing),
      ),
    ]);
    setCollapsed(
      (old) => new Set([...old].map((name) => movedPath(name, result.moves))),
    );
    setLastTyping("");
    setTypingDoc(null);
    setRequestContext(null);
    setDoc(null);
    saved.current = "";
    setSaveStatus("Saved");
    setActivePath(nextPath);
    const file = after.files.find((f) => f.path === nextPath && !f.deleted);
    setBinary(file?.kind === "binary");
    if (file?.kind === "text") {
      try {
        const loaded = await api<TextFile>(
          `/projects/${after.id}/file?path=${encodeURIComponent(nextPath)}`,
        );
        if (projectRef.current?.id === after.id) {
          saved.current = loaded.content;
          setDoc(loaded);
        }
      } catch (e) {
        report(e);
        setToast(
          "File locations were saved. Reopen the file to reload its contents.",
        );
      }
    }
    setTabs((old) =>
      nextPath && !old.includes(nextPath) ? [...old, nextPath] : old,
    );
    setToast(
      result.replayed
        ? "File locations refreshed"
        : "File locations saved · Undo is available in Files",
    );
  }
  async function formSubmit() {
    if (editingBlocked()) return;
    if (
      submitting ||
      !formValue.trim() ||
      (!project && modal !== "new-project")
    )
      return;
    setSubmitting(true);
    setError("");
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
      fileMoveBusy(false);
    }
  }
  async function deleteFile(file: string) {
    if (!project || editingBlocked()) return;
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
  async function refreshReferences() {
    const id = projectRef.current?.id;
    if (!id) return;
    try {
      const result = await api<ProjectIntelligence>(
        `/projects/${id}/intelligence`,
      );
      if (projectRef.current?.id === id) {
        setIntelligence(result);
        setIntelligenceError("");
      }
    } catch (e) {
      if (projectRef.current?.id === id)
        setIntelligenceError(e instanceof Error ? e.message : String(e));
    }
  }
  function formatCurrent(action: FormatAction) {
    if (editingBlocked()) return;
    const file = docRef.current,
      editor = currentEditor();
    if (!file || !editor || !/\.tex$/i.test(file.path)) return;
    try {
      const { from, to } = editor.selection();
      checkVisualSelection(editor.value(), from, to);
      editor.applySourceEdit(formatSource(editor.value(), from, to, action));
    } catch (e) {
      report(e);
    }
  }
  function openInsertion(tool: InsertTool) {
    if (editingBlocked()) return;
    const file = docRef.current,
      editor = currentEditor();
    if (!project || !file || !editor || !/\.tex$/i.test(file.path)) return;
    const selection = editor.selection();
    try {
      checkVisualSelection(editor.value(), selection.from, selection.to);
    } catch (e) {
      report(e);
      return;
    }
    setInsertionTarget({
      project: project.id,
      file: { ...file, content: editor.value() },
      ...editor.selection(),
    });
    setModal("insert-" + tool);
  }
  function checkVisualSelection(content: string, from: number, to: number) {
    if (
      editorViewMode === "visual" &&
      !visualSelectionBalanced(visualProjection(content), from, to)
    )
      throw new Error(
        "This selection crosses part of a LaTeX structure. Select one passage or edit the range in Code view.",
      );
  }
  function chooseEditorView(mode: "code" | "visual") {
    setEditorViewMode(mode);
    void api("/settings/preferences", "PUT", { editorView: mode }).catch(
      report,
    );
  }
  function findInDocument() {
    if (editorViewMode === "visual") chooseEditorView("code");
    requestAnimationFrame(() => currentEditor()?.search());
  }
  async function openSearchResult(file: SearchFile, match: SearchMatch) {
    const id = projectRef.current?.id;
    await openFile(file.path);
    const current = docRef.current;
    if (
      !id ||
      id !== projectRef.current?.id ||
      current?.path !== file.path ||
      current.revision !== file.revision
    )
      throw new Error(
        "This search location is out of date. Search again before jumping to it.",
      );
    if (editorViewMode === "visual") chooseEditorView("code");
    requestAnimationFrame(() => {
      if (
        projectRef.current?.id === id &&
        docRef.current?.path === file.path &&
        docRef.current.revision === file.revision
      )
        currentEditor()?.select(match.from, match.to);
    });
  }
  async function reloadReplacement(paths: string[]) {
    const id = projectRef.current?.id;
    if (!id) return;
    const p = await api<Project>(`/projects/${id}`);
    if (projectRef.current?.id !== id) return;
    setProject(p);
    projectRef.current = p;
    setProjects((items) => items.map((item) => (item.id === id ? p : item)));
    setTypingDoc(null);
    if (docRef.current && paths.includes(docRef.current.path))
      await openFile(docRef.current.path, p);
    await refreshChats();
  }
  function openVisualSource(from: number, to: number, label: string) {
    const file = docRef.current,
      editor = currentEditor(),
      project = projectRef.current;
    if (!file || !editor || !project) return;
    const content = editor.value();
    setSourceFragment({
      project: project.id,
      file: { ...file, content },
      from,
      to,
      label,
      text: content.slice(from, to),
    });
    setModal("visual-source");
  }
  function applyVisualSource() {
    if (editingBlocked() || !sourceFragment) return;
    const target = sourceFragment,
      editor = currentEditor();
    if (
      projectRef.current?.id !== target.project ||
      docRef.current?.path !== target.file.path ||
      editor?.value() !== target.file.content
    ) {
      report(
        new Error(
          "The source changed. Reopen this fragment before applying an edit.",
        ),
      );
      return;
    }
    const updated =
      target.file.content.slice(0, target.from) +
      target.text +
      target.file.content.slice(target.to);
    if (new TextEncoder().encode(updated).length > 2 * 1024 * 1024) {
      report(new Error("This edit would exceed the 2 MB editable-file limit."));
      return;
    }
    const caret = visualCaret(
      visualProjection(updated),
      target.from + target.text.length,
    );
    editor.applySourceEdit({
      from: target.from,
      to: target.to,
      text: target.text,
      selection: { anchor: caret, head: caret },
    });
    setModal("");
    requestAnimationFrame(() =>
      currentEditor()?.focusSource(target.label, target.from),
    );
  }
  function insertSource(source: string, block: boolean) {
    if (editingBlocked() || !insertionTarget) return;
    const file = docRef.current,
      editor = currentEditor(),
      target = insertionTarget;
    if (
      projectRef.current?.id !== target.project ||
      file?.path !== target.file.path ||
      !editor ||
      editor.value() !== target.file.content
    ) {
      report(
        new Error(
          "The source changed while this dialog was open. Reopen the insertion tool to capture a new selection.",
        ),
      );
      return;
    }
    const edit = block
      ? blockInsertion(editor.value(), target.from, target.to, source)
      : { from: target.from, to: target.to, text: source };
    editor.applySourceEdit(edit);
    setModal("");
    requestAnimationFrame(() => currentEditor()?.focus());
  }
  async function uploadFigure(file: File) {
    const id = projectRef.current?.id;
    if (!id || editingBlocked()) throw new Error("The project is read-only.");
    if (!/\.(png|jpe?g|pdf)$/i.test(file.name))
      throw new Error("Choose a PNG, JPEG, or PDF image.");
    await saveNow();
    const form = new FormData();
    form.append("file", file);
    const updated = await api<Project>(`/projects/${id}/upload`, "POST", form);
    if (projectRef.current?.id !== id)
      throw new Error("The active project changed during upload.");
    setProject(updated);
    return file.name;
  }
  async function openReferences() {
    try {
      await saveNow();
      const file = docRef.current,
        selection = currentEditor()?.selection();
      setCitationTarget(
        file && selection ? { file: { ...file }, ...selection } : null,
      );
      setModal("references");
      setMenu(false);
    } catch (e) {
      report(e);
    }
  }
  function insertCitation(key: string) {
    if (editingBlocked() || !citationTarget) return;
    const current = docRef.current;
    try {
      if (current)
        checkVisualSelection(
          current.content,
          citationTarget.from,
          citationTarget.to,
        );
    } catch (e) {
      report(e);
      return;
    }
    if (
      !current ||
      current.path !== citationTarget.file.path ||
      current.content !== citationTarget.file.content
    ) {
      report(
        new Error(
          "The citation target changed. Reopen References to capture a new cursor position.",
        ),
      );
      return;
    }
    const change = citationInsertion(
      current.content,
      citationTarget.from,
      citationTarget.to,
      key,
    );
    if (!change) {
      report(
        new Error(
          "Select only the citation key, or place the cursor inside its braces.",
        ),
      );
      return;
    }
    currentEditor()?.replaceSelection(change.from, change.to, change.text);
    setModal("");
    requestAnimationFrame(() => currentEditor()?.focus());
  }
  async function openWordCount() {
    try {
      await saveNow();
      setModal("word-count");
      setMenu(false);
    } catch (e) {
      report(e);
    }
  }
  async function openHistory() {
    if (!project) return;
    try {
      await saveNow();
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
  const conversationRuns = runs.filter(
    (r) => r.conversationId === conversationId,
  );
  const latest = builds[0],
    latestRun = conversationRuns.at(-1),
    currentProposal = proposals
      .filter(
        (p) =>
          p.runId === activeRun?.id ||
          conversationRuns.some((r) => r.id === p.runId),
      )
      .filter((p) => p.status === "pending" || p.status === "applied")
      .at(-1),
    shownText = freshConversation
      ? ""
      : busy
        ? runText
        : runText || activeRun?.text || latestRun?.text || "";
  const otherRun = !busy
    ? runs.find((r) =>
        ["generating", "typing", "paused", "preview"].includes(r.status),
      )
    : undefined;
  const sourceLocked = busy || !!otherRun || movingFiles;
  const workingPath = busy
    ? requestContext?.path || activeRun?.path || activePath
    : activePath;
  const selectionPreview = busy
    ? requestContext?.selection
    : selectedPassage(doc, position.from, position.to);
  const editorDocuments = [doc, typingDoc]
    .filter((f): f is TextFile => !!f)
    .filter(
      (f, i, files) => files.findIndex((other) => other.path === f.path) === i,
    );
  const model = mode === "manual" ? manualModel : reviewModels[provider];
  const selectedChoice = choices.find(
    (choice) => choice.provider === provider && choice.id === model,
  );
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
          onCopy={(p) => void openProjectCopy(p)}
          revealProject={copiedProjectId}
          onNew={() => {
            setProjectTemplate("blank");
            setFormValue("");
            setModal("new-project");
          }}
          onImport={() => setModal("import")}
          onSettings={() => openSettings()}
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
                onClick={() => openSettings()}
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
                    <button
                      disabled={sourceLocked}
                      onClick={() =>
                        project && void openProjectCopy(project, true)
                      }
                    >
                      <Copy size={14} />
                      Make a copy
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
                  className={
                    "icon-button search-toggle" +
                    (sidebarTab === "search" ? " active" : "")
                  }
                  aria-label="Search project files"
                  aria-pressed={sidebarTab === "search"}
                  title="Search project contents (⌘⇧F / Ctrl+Shift+F)"
                  onClick={() => {
                    setSidebarTab("search");
                    requestAnimationFrame(() =>
                      document.getElementById("project-search-query")?.focus(),
                    );
                  }}
                >
                  <Search size={15} />
                </button>
              </div>
              <ProjectSearch
                key={project.id}
                projectId={project.id}
                generation={project.generation}
                active={sidebarTab === "search"}
                locked={sourceLocked}
                prepare={saveNow}
                onOpen={openSearchResult}
                onChanged={reloadReplacement}
              />
              {sidebarTab === "chats" ? (
                <div className="chat-list">
                  {conversations.length ? (
                    conversations.map((c) => (
                      <button
                        key={c.id}
                        disabled={sourceLocked}
                        aria-pressed={conversationId === c.id}
                        onClick={() => {
                          chatPinned.current = true;
                          setConversationId(c.id);
                          setFreshConversation(false);
                          setActiveRun(null);
                          setRunText("");
                        }}
                      >
                        <MessageSquare size={15} />
                        <span>
                          {c.title}
                          <small>
                            {
                              runs.filter((r) => r.conversationId === c.id)
                                .length
                            }{" "}
                            messages
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
              ) : sidebarTab === "files" ? (
                <>
                  <div className="files-heading">
                    <span>PROJECT FILES</span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="New file"
                        disabled={sourceLocked}
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
                        disabled={sourceLocked}
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
                        disabled={sourceLocked}
                        title="Upload file"
                        onClick={() => upload.current?.click()}
                      >
                        <Upload size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="file-search">
                    <Search size={14} />
                    <input
                      aria-label="Filter files"
                      placeholder="Find a file…"
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                    />
                  </div>
                  {project && (
                    <FileTree
                      key={project.id}
                      project={project}
                      items={fileItems}
                      activePath={activePath}
                      collapsed={collapsed}
                      locked={sourceLocked}
                      onFolder={(name) =>
                        setCollapsed((old) => {
                          const next = new Set(old);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        })
                      }
                      onOpen={(name) => void openFile(name)}
                      onTrash={(name) => void deleteFile(name)}
                      prepare={prepareFileMove}
                      onMoved={fileMoved}
                      onBusy={fileMoveBusy}
                    />
                  )}
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
                          onClick={() => currentEditor()?.jump(o.line)}
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
              ) : null}
              <div className="sidebar-bottom">
                <button onClick={() => void openReferences()}>
                  <BookOpen size={15} />
                  References
                </button>
                <button onClick={() => void openWordCount()}>
                  <FileText size={15} />
                  Word count
                </button>
                <button onClick={() => void openHistory()}>
                  <History size={15} />
                  History
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
                        disabled={busy && t === workingPath}
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
                    onClick={findInDocument}
                  >
                    <Search size={15} />
                  </button>
                </div>
                <div className="source-toolbar">
                  <div>
                    <div
                      className="editor-view-toggle"
                      role="group"
                      aria-label="Editor view"
                    >
                      <button
                        aria-pressed={
                          editorViewMode === "code" ||
                          !/\.tex$/i.test(activePath)
                        }
                        onClick={() => chooseEditorView("code")}
                      >
                        Code
                      </button>
                      <button
                        aria-pressed={
                          editorViewMode === "visual" &&
                          /\.tex$/i.test(activePath)
                        }
                        disabled={!doc || binary || !/\.tex$/i.test(activePath)}
                        onClick={() => chooseEditorView("visual")}
                      >
                        Visual
                      </button>
                    </div>
                    {sourceLocked && (
                      <span className="read-only-badge">Read-only</span>
                    )}
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
                      disabled={sourceLocked}
                      onClick={() => {
                        if (currentEditor()?.canUndo()) currentEditor()?.undo();
                        else if (lastTyping) void undoTyping();
                      }}
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      aria-label="Redo"
                      title="Redo"
                      disabled={sourceLocked}
                      onClick={() => currentEditor()?.redo()}
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
                <SourceToolbar
                  disabled={
                    sourceLocked ||
                    loadingProjects ||
                    binary ||
                    !doc ||
                    !/\.tex$/i.test(activePath)
                  }
                  onFormat={formatCurrent}
                  onInsert={openInsertion}
                />
                <div className="editor-area">
                  {editorDocuments.map((file) => (
                    <div
                      className="editor-document"
                      key={project?.id + "/" + file.path}
                      hidden={file.path !== activePath || binary}
                    >
                      <Editor
                        ref={(handle) => {
                          if (handle) editors.current.set(file.path, handle);
                          else editors.current.delete(file.path);
                        }}
                        content={file.content}
                        visual={
                          editorViewMode === "visual" &&
                          /\.tex$/i.test(file.path)
                        }
                        projectId={project.id}
                        preferences={editorPreferences(
                          settings?.preferences?.editor,
                        )}
                        onSave={() => void saveNow().catch(report)}
                        onSource={openVisualSource}
                        onFind={findInDocument}
                        intelligence={intelligence}
                        cachedState={
                          editorCache.current.get(project.id + "/" + file.path)
                            ?.revision === file.revision
                            ? editorCache.current.get(
                                project.id + "/" + file.path,
                              )?.state
                            : undefined
                        }
                        onCache={(snapshot) => {
                          const key = project.id + "/" + file.path;
                          if (
                            (editorCache.current.get(key)?.revision ?? -1) <=
                            file.revision
                          )
                            editorCache.current.set(key, {
                              state: snapshot,
                              revision: file.revision,
                            });
                        }}
                        active={file.path === activePath && !binary}
                        readOnly={loadingProjects || sourceLocked}
                        onChange={(content) => {
                          if (docRef.current?.path === file.path) {
                            if (!busyRef.current) setLastTyping("");
                            setDoc({ ...docRef.current, content });
                          }
                        }}
                        onSelection={(line, column, from, to) => {
                          if (docRef.current?.path === file.path)
                            setPosition({ line, column, from, to });
                        }}
                        onCompile={() => compileRef.current()}
                        onToPdf={() => void toPdf()}
                        onFormat={formatCurrent}
                      />
                    </div>
                  ))}
                  {(!doc || binary) && (
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
                    {sourceLocked
                      ? movingFiles
                        ? " · Moving files · Read-only"
                        : " · Read-only while AI works"
                      : ""}
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
                      aria-label="New conversation"
                      disabled={sourceLocked}
                      onClick={() => {
                        chatPinned.current = true;
                        setFreshConversation(true);
                        setConversationId("");
                        setRunText("");
                        setActiveRun(null);
                        setPrompt("");
                        setContextFiles([]);
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {otherRun && (
                    <div className="recovery-banner" role="status">
                      <span>
                        {otherRun.status === "preview"
                          ? "A saved replacement preview is waiting."
                          : "An AI run is still active in another view."}
                      </span>
                      {otherRun.status === "preview" && (
                        <button onClick={() => void recoverDraft(otherRun)}>
                          Reopen replacement
                        </button>
                      )}
                      <button onClick={() => void stopOtherRun(otherRun)}>
                        Stop request
                      </button>
                    </div>
                  )}
                  {busy && (
                    <div className="working-file" role="status">
                      <span>
                        Working in <strong>{workingPath}</strong> · files are
                        read-only
                      </span>
                      {workingPath !== activePath && (
                        <button onClick={() => void openFile(workingPath)}>
                          View file
                        </button>
                      )}
                    </div>
                  )}
                  {busy && mode === "manual" && (
                    <div className="typing-status">
                      {typingDraft && (
                        <button
                          className="primary small"
                          onClick={() => setModal("typing-preview")}
                        >
                          Review replacement
                        </button>
                      )}
                      <span className="typing-cursor" />
                      <div>
                        <strong>
                          AI typing · {selectedChoice?.label || model}
                        </strong>
                        <small>
                          {typingDraft
                            ? "Replacement ready · source unchanged"
                            : paused
                              ? "Paused · generation may continue"
                              : typing.current?.editReady
                                ? "Writing directly into " + workingPath
                                : "Preparing an edit · replies stay in chat"}
                        </small>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={paused ? "Resume typing" : "Pause typing"}
                        disabled={!typing.current?.editReady}
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
                  )}

                  <div
                    className="assistant-content"
                    ref={chatBody}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      chatPinned.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 50;
                    }}
                  >
                    {!freshConversation &&
                      conversationRuns
                        .filter(
                          (r) =>
                            r.id !== activeRun?.id &&
                            (busy || r.id !== latestRun?.id),
                        )
                        .map((r) => (
                          <div className="conversation-turn" key={r.id}>
                            <p className="user-message">{r.prompt}</p>
                            <div className="answer-meta">
                              {r.model} · {r.status}
                            </div>
                            <div className="answer-text">
                              {r.text || "No reply was completed."}
                            </div>
                          </div>
                        ))}
                    {(activeRun || latestRun) && !freshConversation && (
                      <p className="user-message">
                        {activeRun?.prompt || latestRun?.prompt}
                      </p>
                    )}
                    {shownText ? (
                      <div className="assistant-answer">
                        <div className="answer-meta">
                          <Sparkles size={12} />
                          {activeRun?.model || latestRun?.model}
                          <span>
                            {busy && !typing.current?.editReady
                              ? "Thinking…"
                              : "Response"}
                          </span>
                        </div>
                        <div className="answer-text" role="status">
                          {shownText}
                        </div>
                      </div>
                    ) : (
                      !busy && (
                        <div className="assistant-welcome">
                          <h3>A clearer thought starts here.</h3>
                          <p>
                            Refine a paragraph, explore an equation, or work
                            through a tricky error.
                          </p>
                          <div className="suggestions">
                            <button
                              disabled={!doc || sourceLocked}
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
                              disabled={!doc || sourceLocked}
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
                      )
                    )}
                    {busy && (
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
                              disabled={sourceLocked}
                              onClick={() =>
                                void proposalAction(currentProposal, "apply")
                              }
                            >
                              Apply
                            </button>
                          ) : (
                            <button
                              disabled={sourceLocked}
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
                      <div
                        className="mode-switch"
                        role="group"
                        aria-label="Editing mode"
                      >
                        <button
                          disabled={sourceLocked}
                          aria-pressed={mode === "review"}
                          className={mode === "review" ? "selected" : ""}
                          onClick={() => setMode("review")}
                        >
                          <CheckCheck size={12} />
                          Review Edits
                        </button>
                        <button
                          disabled={sourceLocked}
                          aria-pressed={mode === "manual"}
                          className={mode === "manual" ? "selected" : ""}
                          onClick={() => {
                            setMode("manual");
                            setManualExplicit(false);
                            setManualModel("");
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
                    <div className="composer-scope">
                      <label htmlFor="ai-scope">Scope</label>
                      <select
                        id="ai-scope"
                        aria-label="AI scope"
                        value={scope}
                        disabled={sourceLocked}
                        onChange={(e) => {
                          setScope(e.target.value as AiScope);
                          setContextFiles([]);
                        }}
                      >
                        <option value="document">Document</option>
                        <option value="project">Whole Project</option>
                      </select>
                      <span title={workingPath}>
                        {scope === "document"
                          ? workingPath
                          : mode === "manual"
                            ? "Read all files · type in this document"
                            : "Read and edit across files"}
                      </span>
                    </div>
                    {selectionPreview && (
                      <SelectionPreview
                        selection={selectionPreview}
                        submitted={busy}
                      />
                    )}
                    <textarea
                      aria-label="Ask your AI assistant"
                      placeholder={
                        mode === "manual"
                          ? "Ask for an edit, or ask a question…"
                          : scope === "project"
                            ? "Ask anything about your project…"
                            : "Ask anything about this document…"
                      }
                      value={prompt}
                      disabled={!doc || sourceLocked}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-footer">
                      <ModelPicker
                        choices={choices}
                        provider={provider}
                        model={model}
                        disabled={sourceLocked}
                        refreshing={refreshingModels}
                        onConnect={() => openSettings("connections")}
                        onRefresh={() => void refreshModels()}
                        onChoose={(choice) => {
                          setProvider(choice.provider);
                          setQuote(null);
                          if (mode === "manual") {
                            setManualModel(choice.id);
                            setManualExplicit(true);
                          } else
                            setReviewModels((current) => ({
                              ...current,
                              [choice.provider]: choice.id,
                            }));
                        }}
                      />
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
                          disabled={
                            !doc ||
                            !prompt.trim() ||
                            !selectedChoice ||
                            refreshingModels
                          }
                          onClick={() => void send()}
                        >
                          <ArrowUp size={19} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className="context-caption"
                    title={contextFiles.join(", ") || workingPath}
                  >
                    <FileText size={10} />
                    <span
                      title={`${conversationRuns.length} saved turns in this conversation`}
                    >
                      {conversationRuns.length
                        ? `${conversationRuns.length} turns · `
                        : ""}
                    </span>
                    <span className="context-files">
                      {scope === "document"
                        ? `Document · ${workingPath}`
                        : `Whole Project · ${contextFiles.length || 1} file${contextFiles.length > 1 ? "s" : ""} read`}
                    </span>
                    {mode === "manual" && <span>Types in {workingPath}</span>}
                  </div>
                  {mode === "manual" && (
                    <div className="context-caption">
                      <Zap size={10} />
                      {isCliProvider(provider)
                        ? "CLI login · subscription usage limits apply"
                        : manualExplicit
                          ? "Selected model · API usage"
                          : quote?.model
                            ? `Initial response estimate · $${Number(quote.cost).toFixed(4)}`
                            : quote?.reason || "Choose a connected model"}
                    </div>
                  )}
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
                      disabled={sourceLocked || !project?.root}
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
                      disabled={!!running || sourceLocked}
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
                                  () => currentEditor()?.jump(d.line ?? 1),
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
                          disabled={sourceLocked}
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
          initialSection={settingsSection}
          onEditorSaved={(editor) =>
            setSettings((old: any) => ({
              ...old,
              preferences: { ...old?.preferences, editor },
            }))
          }
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
      {["new-project", "new-file", "new-folder", "checkpoint"].includes(
        modal,
      ) && (
        <Modal
          title={
            {
              "new-project": "New project",
              "new-file": "New file",
              "new-folder": "New folder",
              checkpoint: "Save a checkpoint",
            }[modal]!
          }
          onClose={() => setModal("")}
          dismissible={!submitting}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void formSubmit();
            }}
          >
            <label className="field-label" htmlFor="name-input">
              Name
            </label>
            <input
              className="text-input"
              id="name-input"
              disabled={submitting}
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
            {error && (
              <p className="inline-message" role="alert">
                {error}
              </p>
            )}
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
            <div className="form-actions">
              <button
                className="primary"
                type="submit"
                disabled={busy || submitting || !formValue.trim()}
              >
                {submitting ? "Saving…" : "Create"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModal("")}
              >
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
              disabled={sourceLocked}
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
              disabled={sourceLocked}
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
      {modal === "typing-preview" && typingDraft && (
        <Modal title="Replacement preview" wide onClose={() => setModal("")}>
          <p className="modal-intro">
            Edit this draft or request a revision. Your source and project
            history stay unchanged until you start typing.
          </p>
          <div className="draft-workspace">
            <div>
              <label htmlFor="replacement-draft">
                Replacement in {typing.current?.document.file.path}
              </label>
              <textarea
                id="replacement-draft"
                aria-label="Replacement LaTeX"
                value={typingDraft.text}
                disabled={typingDraft.compiling}
                onChange={(e) =>
                  setTypingDraft({
                    ...typingDraft,
                    text: e.target.value,
                    job: undefined,
                  })
                }
              />
              <label htmlFor="draft-suggestions">
                Suggestions for the assistant
              </label>
              <textarea
                id="draft-suggestions"
                aria-label="Replacement suggestions"
                value={typingDraft.suggestion}
                onChange={(e) =>
                  setTypingDraft({ ...typingDraft, suggestion: e.target.value })
                }
              />
              <button
                disabled={
                  !typingDraft.suggestion.trim() || typingDraft.compiling
                }
                onClick={() => void reviseDraft()}
              >
                Propose revised replacement
              </button>
            </div>
            <div className="draft-pdf">
              {typingDraft.job?.pdf ? (
                <PdfPreview
                  url={`/api/builds/${typingDraft.job.id}/pdf`}
                  stale={false}
                />
              ) : (
                <p>
                  {typingDraft.compiling
                    ? "Compiling a separate draft snapshot…"
                    : "Compile to check the replacement in the full document."}
                </p>
              )}
              {typingDraft.job?.status === "failed" && (
                <pre className="draft-log">{typingDraft.job.log}</pre>
              )}
            </div>
          </div>
          {typingDraft.error && (
            <p className="field-help" role="alert">
              {typingDraft.error}
            </p>
          )}
          <div className="draft-actions">
            <button
              disabled={typingDraft.compiling}
              onClick={() => void compileDraft()}
            >
              Compile preview
            </button>
            <button
              disabled={typingDraft.compiling}
              onClick={() => {
                setModal("");
                void stop();
              }}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={typingDraft.compiling}
              onClick={() => void startDraft()}
            >
              Start typing
            </button>
          </div>
        </Modal>
      )}
      {modal === "references" && project && (
        <Modal title="Project references" wide onClose={() => setModal("")}>
          <ReferencesPanel
            index={intelligence}
            error={intelligenceError}
            onRefresh={() => void refreshReferences()}
            canInsert={!sourceLocked && !!citationTarget}
            onInsert={insertCitation}
            onOpen={(path) => {
              setModal("");
              void openFile(path);
            }}
          />
        </Modal>
      )}
      {modal === "visual-source" && sourceFragment && (
        <Modal title={sourceFragment.label} wide onClose={() => setModal("")}>
          <p className="modal-intro">
            Edit this LaTeX fragment directly. Applying changes affects only
            this source range and can be undone once.
          </p>
          <label className="source-fragment-label">
            LaTeX source fragment
            <textarea
              aria-label="LaTeX source fragment"
              className="source-fragment-input"
              spellCheck={false}
              readOnly={sourceLocked}
              value={sourceFragment.text}
              onChange={(e) =>
                setSourceFragment({ ...sourceFragment, text: e.target.value })
              }
            />
          </label>
          {sourceLocked && (
            <p className="field-help">Read-only while the assistant works.</p>
          )}
          <div className="form-actions">
            <button
              onClick={() => {
                chooseEditorView("code");
                setModal("");
                requestAnimationFrame(() =>
                  currentEditor()?.select(
                    sourceFragment.from,
                    sourceFragment.to,
                  ),
                );
              }}
            >
              Show in Code
            </button>
            <button
              className="primary"
              disabled={
                sourceLocked ||
                sourceFragment.text ===
                  sourceFragment.file.content.slice(
                    sourceFragment.from,
                    sourceFragment.to,
                  )
              }
              onClick={applyVisualSource}
            >
              Apply source edit
            </button>
          </div>
        </Modal>
      )}
      {modal.startsWith("insert-") && project && insertionTarget && (
        <Modal
          className="insertion-modal"
          title={
            modal === "insert-table"
              ? "Insert table"
              : modal === "insert-figure"
                ? "Insert figure"
                : "Math symbols"
          }
          wide
          onClose={() => setModal("")}
        >
          {modal === "insert-table" && (
            <TableBuilder
              locked={sourceLocked}
              onInsert={(source) => insertSource(source, true)}
            />
          )}
          {modal === "insert-figure" && (
            <FigureBuilder
              files={project.files}
              locked={sourceLocked}
              onUpload={uploadFigure}
              onInsert={(source) => insertSource(source, true)}
            />
          )}
          {modal === "insert-symbols" && (
            <SymbolPicker
              locked={sourceLocked}
              inMath={inMathMode(
                insertionTarget.file.content,
                insertionTarget.from,
              )}
              nextCharacter={
                insertionTarget.file.content[insertionTarget.to] ?? ""
              }
              onInsert={(source) => insertSource(source, false)}
            />
          )}
        </Modal>
      )}
      {modal === "word-count" && project && (
        <Modal title="Word count" wide onClose={() => setModal("")}>
          <WordCountPanel
            projectId={project.id}
            generation={project.generation}
            locked={sourceLocked}
          />
        </Modal>
      )}
      {modal === "history" && project && (
        <Modal title="Project history" wide onClose={() => setModal("")}>
          <HistoryPanel
            project={project}
            versions={checkpoints}
            locked={sourceLocked}
            onCheckpoint={() => {
              setModal("checkpoint");
              setFormValue("");
            }}
            onRestored={async (p) => {
              setProject(p);
              projectRef.current = p;
              setTabs((t) =>
                t.filter((x) =>
                  p.files.some((f) => f.path === x && !f.deleted),
                ),
              );
              await openFile(
                p.files.some((f) => f.path === activePath && !f.deleted)
                  ? activePath
                  : p.root,
                p,
              );
              await refreshChats();
              setToast("Version restored; your previous state was backed up");
            }}
          />
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
                    disabled={sourceLocked}
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
                  disabled={sourceLocked}
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
      {copyTarget && (
        <CopyProject
          key={copyTarget.projectId}
          projectId={copyTarget.projectId}
          openCopy={copyTarget.open}
          locked={sourceLocked && project?.id === copyTarget.projectId}
          onClose={closeProjectCopy}
          onCreated={async (created) => {
            setProjects((items) => [
              created,
              ...items.filter((item) => item.id !== created.id),
            ]);
            if (copyTarget.open) {
              await openProject(created);
              requestAnimationFrame(() => currentEditor()?.focus());
            } else setCopiedProjectId(created.id);
            setCopyTarget(null);
            setToast(`Created ${created.name}`);
          }}
        />
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
            document edits separately from chat replies, using your provider’s
            cheapest verified eligible model. Pause affects typing; Stop cancels
            generation. All files are stored on this computer.
          </p>
          <p className="field-help">
            Independent software inspired by Prism. Not affiliated with OpenAI.
          </p>
        </Modal>
      )}
    </div>
  );
}
