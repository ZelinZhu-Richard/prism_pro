import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
} from "react";
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
  Command,
  Copy,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderPlus,
  History,
  Keyboard,
  LayoutPanelLeft,
  Maximize2,
  Minimize2,
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
  SpellCheck,
  Square,
  Trash2,
  Undo2,
  Upload,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { diffLines } from "diff";
import { api, aiStream, ApiError } from "./api";
import {
  SourceDrafts,
  browserDraftStorage,
  DraftPersistenceError,
  visibleSource,
} from "./source-drafts";
import type {
  SourceDraft,
  DiskReview,
  DiskResolution,
} from "../shared/source-recovery";
import { SourceRecoveryDialog } from "./components/SourceRecovery";
import { TypingBuffer, typingDelay } from "./typing";
import {
  TypingDocument,
  selectedPassage,
  type SelectedPassage,
} from "./typing-document";
import {
  latestTypingUndo,
  TypingUndoRecovery,
  type TypingUndoResult,
} from "./typing-undo";
import { ReferencesPanel } from "./components/ReferencesPanel";
import { TrackingPanel } from "./components/TrackingPanel";
import { useTracking } from "./use-tracking";
import type {
  TrackingFile,
  TrackingResult,
  TrackedHunk,
} from "../shared/tracking";
import { CommentsPanel, type CommentTarget } from "./components/CommentsPanel";
import type { CommentInfo, CommentThread } from "../shared/comments";
import { commentRange } from "../shared/comments";
import { useCommentMarks } from "./use-comments";
import { ConversationList } from "./components/ConversationList";
import { ChatTranscript } from "./components/ChatTranscript";
import type {
  ChatState,
  ProjectActivity,
  ActivityRun,
  ConversationInfo,
  ProposalSummary,
} from "../shared/chats";
import { WordCountPanel } from "./components/WordCountPanel";
import { WritingChecksPanel } from "./components/WritingChecksPanel";
import { useWritingChecks, type CheckedWriting } from "./use-writing-checks";
import {
  writingSettings,
  type WritingIssue,
  type WritingSettings,
} from "../shared/writing-checks";
import type { ProjectIntelligence } from "../shared/project-intelligence";
import { citationInsertion } from "./latex-completion";
import {
  visualProjection,
  visualSelectionBalanced,
  visualCaret,
} from "./visual-source";
import { SourceToolbar, type InsertTool } from "./components/SourceToolbar";
import type { ClipboardPacket } from "./editor-clipboard";
import { clipboardId, CLIP_MIME } from "./clipboard-formats";

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
import {
  movedPath,
  projectFolders,
  type MoveResult,
} from "../shared/file-moves";
import { UploadFiles } from "./components/UploadFiles";
import { ProjectTrash } from "./components/ProjectTrash";
import type { BatchResult } from "../shared/file-batches";
import type { SearchFile, SearchMatch } from "../shared/search";
import { SelectionPreview } from "./components/SelectionPreview";
import {
  Editor,
  type EditorHandle,
  type EditorSnapshot,
} from "./components/Editor";
import { PdfPreview } from "./components/PdfPreview";
import { Modal } from "./components/Modal";
import { QuickNavigation } from "./components/QuickNavigation";
import { DiskDiscovery } from "./components/DiskDiscovery";
import { FormatPreviewDialog } from "./components/FormatPreviewDialog";
import { checkedFormatEdit, type FormatTarget } from "./format-preview";
import type { FormatJob } from "../shared/formatting";
import {
  fileNavigationItems,
  navigationShortcut,
  projectCommands,
} from "./quick-navigation";
import { DraftController, type DraftView } from "./chat-drafts";
import { DraftRecovery, DraftStatus } from "./components/ChatDraft";
import {
  DiagnosticDraftReview,
  DiagnosticActionNotice,
} from "./components/DiagnosticAction";
import {
  DiagnosticActionController,
  type DiagnosticActionView,
  type DiagnosticFix,
} from "./diagnostic-actions";
import type { ChatDraft } from "../shared/chat-drafts";
import {
  PreviewCompileController,
  previewCompileBusy,
  previewTextHash,
  type PreviewCompileView,
} from "./preview-compile";
import type { PreviewBuildState } from "../shared/preview-builds";
import "./components/preview-build.css";
import { Settings, type SettingsSection } from "./components/Settings";
import { editorPreferences } from "../shared/editor-preferences";
import { afterEditorIdle } from "./editor-workflow";
import {
  compileOptions,
  sameCompileOptions,
  type CompileSettings,
} from "../shared/compiler";
import "./components/build-tools.css";
import { LeafMark } from "./components/LeafMark";
import { ProjectHome } from "./components/ProjectHome";
const TemplateBrowser = lazy(() =>
  import("./components/TemplateBrowser").then((m) => ({
    default: m.TemplateBrowser,
  })),
);
const SaveTemplate = lazy(() =>
  import("./components/SaveTemplate").then((m) => ({
    default: m.SaveTemplate,
  })),
);
const CompileOptionsDialog = lazy(() =>
  import("./components/BuildTools").then((m) => ({
    default: m.CompileOptionsDialog,
  })),
);
const GeneratedFiles = lazy(() =>
  import("./components/BuildTools").then((m) => ({
    default: m.GeneratedFiles,
  })),
);
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
  AiRequest,
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
const TableEditor = lazy(() =>
  import("./components/TableEditor").then((m) => ({ default: m.TableEditor })),
);
const ClipboardPaste = lazy(() =>
  import("./components/ClipboardPaste").then((m) => ({
    default: m.ClipboardPaste,
  })),
);

export default function App() {
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [initialTemplate, setInitialTemplate] = useState("");
  const [templateOrigin, setTemplateOrigin] = useState<Project | null>(null);
  const [copyTarget, setCopyTarget] = useState<{
    projectId: string;
    open: boolean;
  } | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState("");
  const [importSkipped, setImportSkipped] = useState<SkippedArchiveEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movingFiles, setMovingFiles] = useState(false);
  const [uploadDestination, setUploadDestination] = useState("");
  const destinationProject = useRef("");
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
  const [formatTarget, setFormatTarget] = useState<FormatTarget | null>(null);
  const preparingFormat = useRef(false);
  const [settings, setSettings] = useState<any>(null),
    [health, setHealth] = useState<any>(null),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [quickNavigation, setQuickNavigation] = useState<
    "files" | "commands" | null
  >(null);
  useEffect(() => setQuickNavigation(null), [project?.id]);
  const workflowPreferences = editorPreferences(settings?.preferences?.editor);
  const workflowRef = useRef(workflowPreferences);
  workflowRef.current = workflowPreferences;
  const [saveStatus, setSaveStatus] = useState("Saved"),
    [position, setPosition] = useState({ line: 1, column: 1, from: 0, to: 0 }),
    [sidebarTab, setSidebarTab] = useState("files"),
    [fileSearch, setFileSearch] = useState(""),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sourceRecovery, setSourceRecovery] = useState<{
      projectId: string;
      path: string;
      text: string;
      draft?: SourceDraft;
    } | null>(null),
    [sourceDrafts, setSourceDrafts] = useState<SourceDraft[]>([]),
    [draftWarning, setDraftWarning] = useState(""),
    [fileConflicts, setFileConflicts] = useState<Set<string>>(new Set());
  const sourceJournal = useRef<SourceDrafts | null>(null),
    mirroredDrafts = useRef(new Map<string, SourceDraft>());
  if (!sourceJournal.current)
    sourceJournal.current = new SourceDrafts(
      browserDraftStorage,
      crypto.randomUUID(),
    );
  function refreshSourceDrafts(projectId: string) {
    if (projectRef.current?.id !== projectId) return;
    try {
      const records = new Map<string, SourceDraft>();
      for (const d of [
        ...sourceJournal.current!.list(projectId),
        ...mirroredDrafts.current.values(),
      ].filter((d) => d.project === projectId))
        if (!records.has(d.id) || records.get(d.id)!.sequence <= d.sequence)
          records.set(d.id, d);
      setSourceDrafts(
        [...records.values()]
          .filter((d) => !d.cleared)
          .sort((a, b) => b.updated - a.updated),
      );
    } catch (e) {
      setDraftWarning((e as Error).message);
    }
  }
  function mirrorSourceDraft(draft: SourceDraft) {
    const old = mirroredDrafts.current.get(draft.id);
    if (!old || old.sequence <= draft.sequence)
      mirroredDrafts.current.set(draft.id, draft);
    refreshSourceDrafts(draft.project);
    void api<SourceDraft>(
      `/projects/${draft.project}/source-drafts`,
      "PUT",
      draft,
    )
      .then((result) => {
        const current = mirroredDrafts.current.get(result.id);
        if (!current || result.sequence >= current.sequence)
          mirroredDrafts.current.set(result.id, result);
      })
      .catch(() => {
        if (projectRef.current?.id === draft.project)
          setDraftWarning(
            "The backend recovery copy could not be saved. Your browser draft is kept; keep this tab open if browser storage is unavailable.",
          );
      });
  }
  function keepSourceDraft(
    p: string,
    file: TextFile,
    baseline = saved.current,
  ) {
    try {
      mirrorSourceDraft(
        sourceJournal.current!.write(
          p,
          file.path,
          file.revision,
          file.content,
          baseline,
        ),
      );
    } catch (e) {
      if (e instanceof DraftPersistenceError) mirrorSourceDraft(e.draft);
      setDraftWarning((e as Error).message);
    }
  }
  function markFileConflict(projectId: string, path: string) {
    setFileConflicts((current) => new Set(current).add(projectId + "/" + path));
  }
  async function reviewSource(draft?: SourceDraft) {
    const p = projectRef.current,
      d = docRef.current;
    if (!p || (draft && draft.project !== p.id)) return;
    const navigation = fileNavigation.current;
    if (draft && draft.path !== d?.path) {
      try {
        await saveNow();
      } catch {
        return;
      }
      if (
        projectRef.current?.id !== p.id ||
        fileNavigation.current !== navigation ||
        (docRef.current && docRef.current.content !== saved.current)
      )
        return;
    }
    const path = draft?.path ?? d?.path;
    if (path)
      setSourceRecovery({
        projectId: p.id,
        path,
        text: draft?.text ?? d?.content ?? "",
        draft,
      });
  }
  async function reviewDiscoveredPath(path: string) {
    const owner = projectRef.current?.id,
      navigation = fileNavigation.current;
    if (!owner) return;
    const versions = await api<DiskReview>(
      `/projects/${owner}/disk?path=${encodeURIComponent(path)}`,
    );
    if (
      projectRef.current?.id !== owner ||
      fileNavigation.current !== navigation
    )
      throw Error("The project or open file changed. Check disk files again.");
    const current = docRef.current;
    const text =
      current?.path === path
        ? (currentEditor()?.value() ?? current.content)
        : (versions.saved.content ?? versions.disk.content ?? "");
    setModal("");
    requestAnimationFrame(() => {
      if (
        projectRef.current?.id === owner &&
        fileNavigation.current === navigation
      )
        setSourceRecovery({ projectId: owner, path, text });
    });
  }
  async function appliedSource(result: DiskResolution, consumed?: SourceDraft) {
    const recovery = sourceRecovery;
    if (!recovery || projectRef.current?.id !== recovery.projectId) return;
    if (consumed) {
      try {
        const cleared = sourceJournal.current!.discard(consumed);
        if (cleared) mirrorSourceDraft(cleared);
      } catch (e) {
        setDraftWarning((e as Error).message);
      }
    }
    setProject(result.project);
    projectRef.current = result.project;
    setFileConflicts((current) => {
      const next = new Set(current);
      next.delete(recovery.projectId + "/" + recovery.path);
      return next;
    });
    setError((current) =>
      current.startsWith(recovery.path + ":") &&
      current.includes("Disk files were preserved.")
        ? ""
        : current,
    );
    if (docRef.current?.path === recovery.path || consumed) {
      const current = result.file;
      if (current) {
        try {
          const cleared = sourceJournal.current!.saved(
            recovery.projectId,
            current.path,
            current.content,
            current.revision,
          );
          if (cleared) mirrorSourceDraft(cleared);
        } catch (e) {
          setDraftWarning((e as Error).message);
        }
      }
      saved.current = current?.content ?? "";
      editorCache.current.delete(recovery.projectId + "/" + recovery.path);
      const key = recovery.projectId + "/" + recovery.path;
      setEditorEpochs((e) => ({ ...e, [key]: (e[key] ?? 0) + 1 }));
      setDoc(current);
      setActivePath(recovery.path);
      setBinary(
        !current &&
          result.project.files.some(
            (f) => f.path === recovery.path && !f.deleted,
          ),
      );
      setTabs((t) => (t.includes(recovery.path) ? t : [...t, recovery.path]));
      setSaveStatus("Saved");
    }
    setSourceRecovery(null);
    refreshSourceDrafts(recovery.projectId);
  }
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("appearance");
  const [reviewPane, setReviewPane] = useState("comments"),
    [reviewBusy, setReviewBusy] = useState(false),
    reviewBusyRef = useRef(false);
  const [trackingRequest, setTrackingRequest] = useState<{
    projectId: string;
    path: string;
    id?: number;
    nonce: number;
  }>();
  function requestTracking(id?: number) {
    const path = docRef.current?.path;
    if (!path) return;
    setReviewPane("changes");
    setSidebarTab("review");
    setTrackingRequest((old) => ({
      projectId: projectRef.current!.id,
      path,
      id,
      nonce: (old?.nonce ?? 0) + 1,
    }));
  }
  function setReviewWorking(value: boolean) {
    reviewBusyRef.current = value;
    setReviewBusy(value);
  }
  const [commentRequest, setCommentRequest] = useState<{
    projectId: string;
    id?: string;
    nonce: number;
  }>();
  function requestComment(id?: string) {
    const projectId = projectRef.current?.id;
    if (!projectId) return;
    setSidebarTab("review");
    setReviewPane("comments");
    setCommentRequest((previous) => ({
      projectId,
      id,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }
  const [writingIssue, setWritingIssue] = useState("");
  function openWriting(issueId = "") {
    setWritingIssue(issueId);
    setModal("writing");
  }
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
  const autoCompileRef = useRef(autoCompile);
  autoCompileRef.current = autoCompile;
  const [compileSettings, setCompileSettings] =
    useState<CompileSettings | null>(null);
  const [runtimeFingerprint, setRuntimeFingerprint] = useState<
    string | undefined
  >();
  const buildFetch = useRef(0);
  const [provider, setProvider] = useState<Provider>("openai"),
    [reviewModels, setReviewModels] = useState(defaultModels),
    [mode, setMode] = useState<EditMode>("review"),
    [scope, setScope] = useState<AiScope>("document"),
    [refreshingModels, setRefreshingModels] = useState(false),
    [prompt, setPromptState] = useState(""),
    [busy, setBusy] = useState(false),
    [activeRun, setActiveRun] = useState<AiRun | null>(null),
    [runText, setRunText] = useState(""),
    [freshConversation, setFreshConversation] = useState(false),
    [conversations, setConversations] = useState<ConversationInfo[]>([]),
    [conversationId, setConversationId] = useState(""),
    [chatMatch, setChatMatch] = useState<{
      conversationId: string;
      runId: string;
      nonce: number;
    }>(),
    [toolStatus, setToolStatus] = useState(""),
    [contextFiles, setContextFiles] = useState<string[]>([]);
  const [chatSelecting, setChatSelecting] = useState(false),
    [reviewedProposal, setReviewedProposal] = useState<Proposal | null>(null);
  const conversationRef = useRef(""),
    chatSelectionPending = useRef(false);
  conversationRef.current = conversationId;
  const refreshSequence = useRef({ project: 0, chats: 0 });
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const [draftView, setDraftView] = useState<DraftView>({
      text: "",
      status: "loading",
    }),
    [draftRecovery, setDraftRecovery] = useState(false);
  const chatDrafts = useRef<DraftController | null>(null);
  if (!chatDrafts.current)
    chatDrafts.current = new DraftController({
      load: (key) =>
        api<ChatDraft>(
          `/projects/${key.projectId}/chat-draft?conversation=${encodeURIComponent(key.conversationId ?? "")}`,
        ),
      save: (key, write) =>
        api<ChatDraft>(
          `/projects/${key.projectId}/chat-draft?conversation=${encodeURIComponent(key.conversationId ?? "")}`,
          "PUT",
          write,
          { keepalive: true },
        ),
      requestId: () => crypto.randomUUID(),
      notify: (view) => {
        promptRef.current = view.text;
        setPromptState(view.text);
        setDraftView(view);
      },
    });
  function setPrompt(text: string) {
    chatDrafts.current!.edit(text);
  }
  useEffect(() => {
    if (!draftView.remote) setDraftRecovery(false);
  }, [draftView.remote]);
  const [proposalError, setProposalError] = useState("");
  const [runs, setRuns] = useState<AiRun[]>([]),
    [proposals, setProposals] = useState<ProposalSummary[]>([]),
    [quote, setQuote] = useState<any>(null),
    [manualModel, setManualModel] = useState(""),
    [manualExplicit, setManualExplicit] = useState(false),
    [speed, setSpeed] = useState(1),
    [paused, setPaused] = useState(false),
    [lastTyping, setLastTyping] = useState("");
  const [typingUndoState, setTypingUndoState] = useState<{
    run: AiRun;
    working: boolean;
    error?: string;
  } | null>(null);
  const typingUndoRecovery = useRef(new TypingUndoRecovery());
  const [editorEpochs, setEditorEpochs] = useState<Record<string, number>>({});
  const typingUndoErrorRef = useRef<HTMLParagraphElement>(null);
  const typingUndoFocus = useRef<{ projectId: string; path: string } | null>(
    null,
  );
  useEffect(() => {
    if (typingUndoState?.error) typingUndoErrorRef.current?.focus();
  }, [typingUndoState?.error]);
  const [typingDraft, setTypingDraft] = useState<{
    text: string;
    suggestion: string;
    job?: CompileJob;
    compiling?: boolean;
    error?: string;
  } | null>(null);
  const [typingDoc, setTypingDoc] = useState<TextFile | null>(null);
  const [previewBuildView, setPreviewBuildView] = useState<PreviewCompileView>({
    runId: "",
    phase: "idle",
  });
  const [stoppingBuildId, setStoppingBuildId] = useState("");
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
  const [tableTarget, setTableTarget] = useState<{
    project: string;
    file: TextFile;
    from: number;
    to: number;
  } | null>(null);
  const [clipboardTarget, setClipboardTarget] = useState<{
    project: string;
    file: TextFile;
    packet: ClipboardPacket;
  } | null>(null);
  const clipboardRequest = useRef(0),
    modalRef = useRef(modal);
  modalRef.current = modal;
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
    workspace = useRef<HTMLDivElement>(null);
  projectRef.current = project;
  busyRef.current = busy;
  speedRef.current = speed;
  const previewCompiler = useRef<PreviewCompileController | null>(null);
  if (!previewCompiler.current)
    previewCompiler.current = new PreviewCompileController({
      start: (id, text, requestId) =>
        api<CompileJob>(`/ai/runs/${id}/compile-preview`, "POST", {
          text,
          requestId,
        }),
      read: (id, request) =>
        api<PreviewBuildState>(
          `/ai/runs/${id}/compile-preview${request ? "?request=" + encodeURIComponent(request) : ""}`,
        ),
      cancel: (id, requestId) =>
        api<PreviewBuildState>(
          `/ai/runs/${id}/compile-preview/cancel`,
          "POST",
          { requestId },
        ),
      hash: previewTextHash,
      requestId: () => crypto.randomUUID(),
      notify: (view) => {
        setPreviewBuildView(view);
        if (typing.current?.id === view.runId)
          setTypingDraft((d) =>
            d
              ? { ...d, job: view.job, compiling: previewCompileBusy(view) }
              : d,
          );
      },
    });
  useEffect(() => () => previewCompiler.current?.dispose(), []);
  function setDoc(value: TextFile | null) {
    docRef.current = value;
    setDocState(value);
  }
  function currentEditor() {
    return docRef.current
      ? editors.current.get(docRef.current.path)
      : undefined;
  }
  const [activity, setActivity] = useState<ProjectActivity | null>(null);
  const activityRef = useRef(activity),
    activityEpoch = useRef(0);
  activityRef.current = activity;
  function activeProjectRuns() {
    const id = projectRef.current?.id;
    return activityRef.current && activityRef.current.projectId === id
      ? activityRef.current.activeRuns
      : runs.filter(
          (r) =>
            r.projectId === id &&
            ["generating", "typing", "paused", "preview"].includes(r.status),
        );
  }
  useEffect(() => {
    const id = project?.id;
    if (!id) return;
    let stale = false,
      pending = false;
    const refresh = async () => {
      if (stale || pending) return;
      pending = true;
      const epoch = activityEpoch.current;
      try {
        const value = await api<ProjectActivity>(`/projects/${id}/activity`);
        if (
          !stale &&
          projectRef.current?.id === id &&
          epoch === activityEpoch.current
        ) {
          const ended =
            activityRef.current?.projectId === id &&
            activityRef.current.activeRuns.length > 0 &&
            !value.activeRuns.length;
          activityRef.current = value;
          setActivity(value);
          if (ended && !busyRef.current) {
            await refreshProject();
            if (docRef.current && docRef.current.content === saved.current)
              await openFile(docRef.current.path);
            await refreshChats();
          }
        }
      } catch {
        /* Offline writes still fail through the existing save/revision guards. */
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1200);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      stale = true;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [project?.id]);
  function editingBlocked() {
    if (typingUndoRecovery.current.working) {
      setToast("Wait for typing Undo to finish.");
      return true;
    }
    if (reviewBusyRef.current) {
      setToast("Wait for the review action to finish.");
      return true;
    }
    if (movingFilesRef.current) {
      setToast("Wait for the file move to finish.");
      return true;
    }
    if (!busyRef.current && !activeProjectRuns().length) return false;
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
    const id = projectRef.current.id,
      sequence = ++refreshSequence.current.project;
    const p = await api<Project>("/projects/" + id);
    if (
      projectRef.current?.id !== id ||
      sequence !== refreshSequence.current.project
    )
      return;
    setProject(p);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  }, []);
  async function refreshChats() {
    const id = projectRef.current?.id;
    if (!id) return;
    const sequence = ++refreshSequence.current.chats;
    const c = await api<ChatState>(`/projects/${id}/chats?summary=1`);
    if (
      projectRef.current?.id !== id ||
      sequence !== refreshSequence.current.chats
    )
      return;
    ++activityEpoch.current;
    const currentActivity = {
      projectId: id,
      activeRuns: c.runs
        .filter((r) =>
          ["generating", "typing", "paused", "preview"].includes(r.status),
        )
        .map(({ id, projectId, conversationId, path, mode, status }) => ({
          id,
          projectId,
          conversationId,
          path,
          mode,
          status,
        })),
    };
    activityRef.current = currentActivity;
    setActivity(currentActivity);
    setRuns(c.runs);
    setConversations(c.conversations);
    const selected = c.conversations.some(
      (x) => x.id === conversationRef.current && !x.archivedAt,
    )
      ? conversationRef.current
      : (c.activeConversationId ?? "");
    if (
      selected !== conversationRef.current ||
      !chatDrafts.current!.isActive({
        projectId: id,
        conversationId: selected || null,
      })
    ) {
      await chatDrafts.current!.flush();
      if (
        projectRef.current?.id !== id ||
        sequence !== refreshSequence.current.chats
      )
        return;
      conversationRef.current = selected;
      setConversationId(selected);
      await chatDrafts
        .current!.open({
          projectId: id,
          conversationId: selected || null,
        })
        .catch(() => {});
      if (
        projectRef.current?.id !== id ||
        sequence !== refreshSequence.current.chats ||
        conversationRef.current !== selected
      )
        return;
    }
    conversationRef.current = selected;
    setConversationId(selected);
    setFreshConversation(!selected);
    setProposals(c.proposals);
    const undoable = latestTypingUndo(
      c.runs,
      projectRef.current?.files ?? [],
      id,
      docRef.current
        ? {
            file: docRef.current,
            dirty: docRef.current.content !== saved.current,
          }
        : undefined,
    );
    setLastTyping(undoable?.id ?? "");
  }
  async function chooseConversation(id: string | null, runId?: string) {
    if (editingBlocked() || chatSelectionPending.current || !projectRef.current)
      return;
    const projectId = projectRef.current.id;
    chatSelectionPending.current = true;
    setChatSelecting(true);
    try {
      await chatDrafts.current!.flush();
      await api(`/projects/${projectId}/active-conversation`, "PUT", { id });
      if (projectRef.current?.id !== projectId) return;
      conversationRef.current = id ?? "";
      setConversationId(id ?? "");
      setFreshConversation(!id);
      setChatMatch(
        id && runId
          ? { conversationId: id, runId, nonce: Date.now() }
          : undefined,
      );
      setActiveRun(null);
      setRunText("");
      setContextFiles([]);
      await chatDrafts
        .current!.open({ projectId, conversationId: id })
        .catch(() => {});
      setReviewedProposal(null);
    } catch (e) {
      report(e);
    } finally {
      chatSelectionPending.current = false;
      setChatSelecting(false);
    }
  }
  async function editConversation(
    item: Conversation,
    change: { title?: string; archived?: boolean },
  ) {
    const projectId = projectRef.current?.id;
    if (!projectId || item.projectId !== projectId)
      throw new Error("The active project changed.");
    await api(`/projects/${projectId}/conversations/${item.id}`, "PATCH", {
      revision: item.revision ?? 0,
      ...change,
    });
    if (projectRef.current?.id === projectId) await refreshChats();
  }
  async function reviewProposal(proposal: ProposalSummary) {
    const projectId = projectRef.current?.id;
    if (!projectId || proposal.projectId !== projectId) return;
    try {
      const full = await api<Proposal>(
        `/projects/${projectId}/proposals/${proposal.id}`,
      );
      if (projectRef.current?.id !== projectId) return;
      setProposalError("");
      setReviewedProposal(full);
      setModal("diff");
    } catch (e) {
      report(e);
    }
  }
  async function fetchBuilds(id: string) {
    const serial = ++buildFetch.current;
    const b = await api("/projects/" + id + "/builds");
    if (projectRef.current?.id === id && serial === buildFetch.current) {
      setBuilds(b.jobs);
      setPdfJob(b.previewPdf ?? b.lastSuccessful);
      setCompileSettings(b.options ?? { ...compileOptions(), revision: 0 });
      setRuntimeFingerprint(b.runtime?.fingerprint || undefined);
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
      if (!projectRef.current || document.querySelector("dialog[open]")) return;
      const navigation = navigationShortcut(e);
      if (navigation) {
        e.preventDefault();
        setQuickNavigation(navigation);
        return;
      }
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
    const theme = settings?.preferences?.theme ?? "light";
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
        chatDrafts.current!.unsaved() ||
        (docRef.current && docRef.current.content !== saved.current)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    const saveDraft = () => void chatDrafts.current!.flush().catch(() => {}),
      refreshDraft = () => void chatDrafts.current!.refresh().catch(() => {});
    window.addEventListener("pagehide", saveDraft);
    window.addEventListener("focus", refreshDraft);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", saveDraft);
      window.removeEventListener("focus", refreshDraft);
      chatDrafts.current!.dispose();
    };
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
    if (fileConflicts.has(p.id + "/" + d.path)) {
      setSourceRecovery({ projectId: p.id, path: d.path, text: d.content });
      throw new ApiError(
        "Review the changed file versions before saving. Your draft is kept.",
        409,
      );
    }
    keepSourceDraft(p.id, d);
    setSaveStatus("Saving…");
    const snapshot = d.content;
    const promise = (async () => {
      try {
        const result = await api<TextFile>(
          `/projects/${p.id}/file?path=${encodeURIComponent(d.path)}`,
          "PUT",
          { content: snapshot, revision: d.revision },
        );
        try {
          const cleared = sourceJournal.current!.saved(
            p.id,
            d.path,
            snapshot,
            result.revision,
          );
          if (cleared) mirrorSourceDraft(cleared);
        } catch (e) {
          setDraftWarning((e as Error).message);
        }
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
        if (e instanceof ApiError && e.status === 409) {
          markFileConflict(p.id, d.path);
          if (
            projectRef.current?.id === p.id &&
            docRef.current?.path === d.path
          )
            setSourceRecovery({
              projectId: p.id,
              path: d.path,
              text: docRef.current.content,
            });
        }
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
      busy ||
      movingFiles ||
      reviewBusy ||
      typing.current ||
      sourceRecovery?.projectId === project?.id ||
      (project && fileConflicts.has(project.id + "/" + doc.path))
    )
      return;
    if (doc.content === saved.current) {
      if (!savePromise.current) setSaveStatus("Saved");
      return;
    }
    setSaveStatus("Unsaved");
    if (project) keepSourceDraft(project.id, doc);
    if (!workflowPreferences.autoSave || !project) return;
    const id = project.id,
      captured = doc;
    return afterEditorIdle(
      workflowPreferences.autoSaveDelayMs,
      () =>
        workflowRef.current.autoSave &&
        projectRef.current?.id === id &&
        docRef.current?.path === captured.path &&
        docRef.current.revision === captured.revision &&
        docRef.current.content === captured.content &&
        !sourceLockedRef.current &&
        !typing.current,
      () => void saveNow().catch(report),
    );
  }, [
    doc?.content,
    doc?.path,
    doc?.revision,
    busy,
    movingFiles,
    reviewBusy,
    activity?.activeRuns.length,
    mode,
    sourceRecovery,
    fileConflicts,
    workflowPreferences.autoSave,
    workflowPreferences.autoSaveDelayMs,
  ]);
  useEffect(() => {
    if (!project?.id) return;
    const id = project.id;
    let stale = false;
    refreshSourceDrafts(id);
    void api<SourceDraft[]>(`/projects/${id}/source-drafts`)
      .then((records) => {
        if (stale || projectRef.current?.id !== id) return;
        for (const d of records) {
          const old = mirroredDrafts.current.get(d.id);
          if (!old || old.sequence <= d.sequence)
            mirroredDrafts.current.set(d.id, d);
        }
        refreshSourceDrafts(id);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [project?.id]);
  useEffect(() => {
    const inspect = () => {
      const p = projectRef.current,
        d = docRef.current;
      if (!p || !d || busyRef.current || typing.current || savePromise.current)
        return;
      void api<DiskReview>(
        `/projects/${p.id}/disk?path=${encodeURIComponent(d.path)}`,
      )
        .then((v) => {
          if (
            projectRef.current?.id === p.id &&
            docRef.current?.path === d.path &&
            !savePromise.current &&
            (v.changed || v.revision !== docRef.current.revision)
          )
            markFileConflict(p.id, d.path);
        })
        .catch(() => {});
    };
    window.addEventListener("focus", inspect);
    return () => window.removeEventListener("focus", inspect);
  }, []);
  async function openFile(
    path: string,
    p = projectRef.current,
    options?: {
      allowed?: (candidate?: TextFile | null) => boolean;
      onError?: (error: unknown) => void;
    },
  ) {
    if (!p || movingFilesRef.current || options?.allowed?.() === false) return;
    const navigation = ++fileNavigation.current;
    try {
      try {
        await saveNow();
      } catch (e) {
        const current = docRef.current;
        if (!(
          e instanceof ApiError &&
          e.status === 409 &&
          current &&
          sourceJournal
            .current!.list(p.id, current.path)
            .some((d) => d.text === current.content)
        ))
          throw e;
        setSourceRecovery(null);
      }
      const f = p.files.find((f) => f.path === path && !f.deleted);
      if (
        !f ||
        f.kind === "directory" ||
        navigation !== fileNavigation.current ||
        options?.allowed?.() === false
      )
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
        projectRef.current?.id !== p.id ||
        options?.allowed?.(loaded) === false
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
      if (d && !typing.current && !busyRef.current)
        void api<DiskReview>(
          `/projects/${p.id}/disk?path=${encodeURIComponent(path)}`,
        )
          .then((v) => {
            if (
              projectRef.current?.id === p.id &&
              docRef.current?.path === path &&
              (v.changed || v.revision !== docRef.current.revision)
            )
              markFileConflict(p.id, path);
          })
          .catch(() => {});
      setLastTyping(
        latestTypingUndo(
          runs,
          p.files,
          p.id,
          d ? { file: d, dirty: d.content !== saved.current } : undefined,
        )?.id ?? "",
      );
      setPosition({ line: 1, column: 1, from: 0, to: 0 });
      return d;
    } catch (e) {
      if (navigation === fileNavigation.current) {
        if (options?.onError) options.onError(e);
        else report(e);
      }
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
      await chatDrafts.current!.flush();
      setIntelligence(undefined);
      setIntelligenceError("");
      setProject(p);
      projectRef.current = p;
      setSourceRecovery(null);
      setSourceDrafts([]);
      setDraftWarning("");
      typingUndoRecovery.current.reset();
      setTypingUndoState(null);
      typingUndoFocus.current = null;
      if (updateUrl)
        history.pushState(null, "", "/?project=" + encodeURIComponent(p.id));
      setTabs([]);
      setTypingDoc(null);
      setRequestContext(null);
      setDoc(null);
      setActivePath("");
      setBuilds([]);
      setCompileSettings(null);
      setRuntimeFingerprint(undefined);
      buildFetch.current++;
      setPdfJob(null);
      setFreshConversation(false);
      conversationRef.current = "";
      setConversationId("");
      await chatDrafts.current!.open();
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
      await chatDrafts.current!.flush();
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
      setSourceRecovery(null);
      setSourceDrafts([]);
      setDraftWarning("");
      setMenu(false);
      setModal("");
      setRuns([]);
      setConversations([]);
      setConversationId("");
      conversationRef.current = "";
      await chatDrafts.current!.open();
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
  const running = builds.find((j) => ["queued", "running"].includes(j.status)),
    compileRunLocked = activeProjectRuns().length > 0;
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
      activeProjectRuns().length
    )
      return;
    const projectId = projectRef.current.id;
    try {
      await saveNow();
      if (projectRef.current?.id !== projectId) return;
      buildFetch.current++;
      const job = await api<CompileJob>(
        "/projects/" + projectId + "/compile",
        "POST",
        { clean, optionsRevision: compileSettings?.revision },
      );
      if (projectRef.current?.id !== projectId) return;
      buildFetch.current++;
      setBuilds((b) => [job, ...b]);
      setRightTab("preview");
    } catch (e) {
      report(e);
    }
  }
  compileRef.current = () => void compile();
  async function cancelBuild() {
    if (!running || stoppingBuildId) return;
    const job = running;
    setStoppingBuildId(job.id);
    try {
      await api(`/builds/${job.id}/cancel`, "POST", {});
      if (projectRef.current?.id === job.projectId)
        await fetchBuilds(job.projectId);
    } catch (e) {
      report(e);
    } finally {
      setStoppingBuildId("");
    }
  }
  useEffect(() => {
    if (
      !autoCompile ||
      !compileSettings ||
      !project ||
      typing.current ||
      busy ||
      movingFiles ||
      compileRunLocked ||
      saveStatus !== "Saved" ||
      !project.root ||
      running ||
      (builds[0]?.generation === project.generation &&
        sameCompileOptions(builds[0]?.options, compileSettings) &&
        builds[0]?.runtime?.fingerprint === runtimeFingerprint)
    )
      return;
    const id = project.id;
    return afterEditorIdle(
      workflowPreferences.autoCompileDelayMs,
      () =>
        autoCompileRef.current &&
        projectRef.current?.id === id &&
        !sourceLockedRef.current &&
        !typing.current &&
        (!docRef.current || docRef.current.content === saved.current),
      () => compileRef.current(),
    );
  }, [
    project?.id,
    project?.generation,
    autoCompile,
    busy,
    movingFiles,
    saveStatus,
    compileRunLocked,
    compileSettings?.mode,
    compileSettings?.errorHandling,
    compileSettings?.revision,
    compileSettings?.runtimeId,
    runtimeFingerprint,
    running?.id,
    builds[0]?.id,
    workflowPreferences.autoCompileDelayMs,
    sourceRecovery?.projectId,
  ]);
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
      if (!t.first) setLastTyping(t.id);
    } catch (e) {
      report(e);
      try {
        await api(`/ai/runs/${t.id}/stop`, "POST", {});
        await api(`/ai/runs/${t.id}/finish`, "POST", {});
      } catch {}
    } finally {
      editors.current.get(t.document.file.path)?.endTyping();
      typing.current = null;
      previewCompiler.current?.clear();
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
      chatSelectionPending.current ||
      diagnosticActions.current?.view.phase === "preparing" ||
      diagnosticActions.current?.view.reviewing ||
      !text.trim()
    )
      return;
    const captured = { ...(destination?.file ?? docRef.current!) };
    const submittedDraft = chatDrafts.current!.active;
    const consumeDraft =
      !destination &&
      text === promptRef.current &&
      submittedDraft?.projectId === projectRef.current?.id &&
      submittedDraft?.conversationId === (conversationRef.current || null);
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
      const request: AiRequest = {
        ...requestFor(chosen, text, destination),
        proposedReplacement,
      };
      busyRef.current = true;
      setBusy(true);
      setActiveRun(null);
      setRunText("");
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
      const savedDraft = await chatDrafts.current!.flush();
      if (consumeDraft && savedDraft)
        request.draftRevision = savedDraft.revision;
      setFreshConversation(false);
      setActiveRun(null);
      setRunText("");
      setToolStatus("Reading your context");
      setContextFiles([captured.path]);
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
            if (
              consumeDraft &&
              submittedDraft &&
              event.run.consumedDraftRevision !== undefined
            )
              chatDrafts.current!.acknowledge(
                submittedDraft,
                text,
                event.run.consumedDraftRevision,
              );
            setActiveRun(event.run);
            if (event.run.conversationId) {
              conversationRef.current = event.run.conversationId;
              setConversationId(event.run.conversationId);
              if (
                !chatDrafts.current!.isActive({
                  projectId: request.projectId,
                  conversationId: event.run.conversationId,
                })
              )
                void chatDrafts
                  .current!.open({
                    projectId: request.projectId,
                    conversationId: event.run.conversationId,
                  })
                  .catch(report);
            }
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
          } else if (event.type === "done") {
            if (event.run) setActiveRun(event.run);
            typing.current?.buffer.complete();
          }
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
            void previewCompiler.current!.open(
              typing.current.id,
              typing.current.previewText,
            );
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
          await refreshChats();
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
  async function recoverDraft(summary: ActivityRun) {
    try {
      const run = await api<AiRun>(
        `/projects/${summary.projectId}/runs/${summary.id}`,
      );
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
      void previewCompiler.current!.open(run.id, run.insertion ?? "");
      busyRef.current = true;
      setBusy(true);
      setModal("typing-preview");
    } catch (e) {
      report(e);
    }
  }
  async function stopOtherRun(run: ActivityRun) {
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
    if (!t || !draft || previewCompileBusy(previewCompiler.current!.view))
      return;
    try {
      const approved = await api(`/ai/runs/${t.id}/approve`, "POST", {
        text: draft.text,
      });
      t.buffer = new TypingBuffer();
      t.buffer.push(approved.text);
      t.buffer.complete();
      t.editReady = true;
      t.previewText = undefined;
      previewCompiler.current?.clear();
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
    setTypingDraft({ ...draft, error: undefined });
    await previewCompiler.current!.begin(t.id, draft.text);
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
    const run = typingUndoState?.run ?? runs.find((r) => r.id === lastTyping);
    if (!run || run.projectId !== projectRef.current?.id || editingBlocked())
      return;
    try {
      const restored = await typingUndoRecovery.current.restore(run, {
        projectId: () => projectRef.current?.id,
        lock: (working) => {
          fileMoveBusy(working);
          setTypingUndoState({ run, working });
        },
        saveInspected: saveNow,
        readTarget: (path) =>
          api<TextFile>(
            `/projects/${run.projectId}/file?path=${encodeURIComponent(path)}`,
          ),
        snapshotTarget: (path, revision) =>
          editors.current.get(path)?.snapshot() ??
          (editorCache.current.get(run.projectId + "/" + path)?.revision ===
          revision
            ? editorCache.current.get(run.projectId + "/" + path)?.state
            : undefined),
        undoRun: (id) =>
          api<TypingUndoResult>(`/ai/runs/${id}/undo`, "POST", {}),
        applyTarget: (result, snapshot) => {
          const known = projectRef.current?.files.find(
            (f) => f.path === result.path,
          );
          if (known && known.revision > result.revision)
            throw new Error(
              "The target changed after Undo. Inspect its latest source; later edits were kept.",
            );
          const key = run.projectId + "/" + result.path;
          editorCache.current.set(key, {
            state: snapshot,
            revision: result.revision,
          });
          typingUndoFocus.current = {
            projectId: run.projectId,
            path: result.path,
          };
          setEditorEpochs((e) => ({ ...e, [key]: (e[key] ?? 0) + 1 }));
          saved.current = result.content;
          setDoc({
            path: result.path,
            content: result.content,
            revision: result.revision,
          });
          setActivePath(result.path);
          setBinary(false);
          setTabs((t) => (t.includes(result.path) ? t : [...t, result.path]));
          const head = result.content.slice(0, result.selection.to),
            lines = head.split("\n");
          setPosition({
            line: lines.length,
            column: lines.at(-1)!.length + 1,
            ...result.selection,
          });
          setProject((p) =>
            p?.id === run.projectId
              ? {
                  ...p,
                  generation: Math.max(p.generation, result.projectGeneration),
                  files: p.files.map((f) =>
                    f.path === result.path && f.revision <= result.revision
                      ? {
                          ...f,
                          revision: result.revision,
                          size: new TextEncoder().encode(result.content).length,
                        }
                      : f,
                  ),
                }
              : p,
          );
          setSaveStatus("Saved");
        },
      });
      if (!restored) return;
      setTypingUndoState(null);
      setLastTyping("");
      setToast("Typing undone in " + run.path);
      try {
        await refreshProject();
        await refreshChats();
      } catch {
        report(
          new Error(
            "Typing was restored. Refresh the project to update its history and conversation details.",
          ),
        );
      }
    } catch (e) {
      setTypingUndoState({
        run,
        working: false,
        error:
          e instanceof Error
            ? e.message
            : "Undo could not be confirmed. Retry safely.",
      });
    }
  }
  async function proposalAction(p: ProposalSummary, action: string) {
    if (editingBlocked()) return false;
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
      return true;
    } catch (e) {
      setProposalError(e instanceof Error ? e.message : String(e));
      return false;
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
  async function prepareFileMove(): Promise<Project> {
    const id = projectRef.current?.id;
    if (!id || busyRef.current || activeProjectRuns().length)
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
  async function filesChanged(result: BatchResult) {
    const before = projectRef.current;
    if (!before || before.id !== result.project.id) return;
    await fileMoved({ ...result, moves: [] }, before);
    setToast(
      result.undone
        ? "File operation undone"
        : result.replayed
          ? "Saved file operation refreshed"
          : "Files saved · Undo is available in Files",
    );
  }
  async function prepareTemplate(p: Project) {
    try {
      if (projectRef.current?.id === p.id) {
        if (editingBlocked()) return;
        await saveNow();
      }
      setTemplateOrigin(p);
      setModal("save-template");
      setMenu(false);
    } catch (e) {
      report(e);
    }
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
      if (project && (modal === "new-file" || modal === "new-folder")) {
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
  async function openFormatter() {
    if (preparingFormat.current || editingBlocked()) return;
    const projectId = projectRef.current?.id,
      file = docRef.current,
      editor = currentEditor();
    if (!projectId || !file || !editor || !/\.tex$/i.test(file.path)) return;
    const content = editor.value(),
      selection = editor.selection();
    preparingFormat.current = true;
    try {
      await saveNow();
      const current = docRef.current;
      if (
        projectRef.current?.id !== projectId ||
        current?.path !== file.path ||
        currentEditor()?.value() !== content ||
        sourceLockedRef.current
      )
        throw Error(
          "The source changed while preparing formatting. Your text is kept; choose Format source again.",
        );
      setFormatTarget({
        projectId,
        path: current.path,
        revision: current.revision,
        content,
        ...selection,
      });
      setModal("format-source");
    } catch (e) {
      report(e);
    } finally {
      preparingFormat.current = false;
    }
  }
  async function applyFormatting(job: FormatJob) {
    const target = formatTarget;
    if (!target)
      throw Error("Open a fresh formatting preview before applying changes.");
    const check = () =>
      checkedFormatEdit(target, job, {
        projectId: projectRef.current?.id,
        path: docRef.current?.path,
        revision: docRef.current?.revision,
        content: currentEditor()?.value(),
        locked:
          sourceLockedRef.current ||
          busyRef.current ||
          movingFilesRef.current ||
          reviewBusyRef.current ||
          activeProjectRuns().length > 0,
      });
    check();
    const result = await api<{
      text: string;
      revision: number;
      path: string;
      sourceHash: string;
    }>(`/projects/${target.projectId}/format/${job.id}/validate`, "POST", {
      content: target.content,
    });
    const edit = check();
    if (
      result.text !== job.text ||
      result.sourceHash !== job.sourceHash ||
      result.revision !== target.revision ||
      result.path !== target.path
    )
      throw Error(
        "The formatting response changed. Keep this source and start a new preview.",
      );
    const editor = currentEditor();
    if (!editor)
      throw Error("Open the original source file before applying formatting.");
    editor.applySourceEdit(edit);
    if (editor.value() !== result.text)
      throw Error(
        "The source could not be updated. Finish the active operation, then try applying again.",
      );
    setToast("Formatting applied · Undo is available in the editor");
    requestAnimationFrame(() => currentEditor()?.focus());
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
    if (tool === "table") {
      const existing = visualProjection(editor.value()).atoms.find(
        (a) =>
          (a.kind === "table" ||
            (a.kind === "source" &&
              /^(?:table\*|tabular\*|tabularx|longtable)$/.test(a.label))) &&
          selection.from >= a.from &&
          selection.to <= a.to,
      );
      if (existing) {
        openTable(existing.from, existing.to);
        return;
      }
    }
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
  async function captureComment(): Promise<CommentTarget> {
    if (editingBlocked())
      throw new Error("Add the comment after the assistant finishes.");
    const p = projectRef.current,
      file = docRef.current,
      editor = currentEditor();
    if (!p || !file || !editor)
      throw new Error("Open a text file before adding a comment.");
    const source = editor.value();
    let { from, to } = editor.selection();
    if (editorViewMode === "visual") {
      const projection = visualProjection(source);
      from = Math.max(projection.body.from, Math.min(from, projection.body.to));
      to = Math.max(from, Math.min(to, projection.body.to));
      if (from === to) from = to = visualCaret(projection, from);
    }
    if (from === to) {
      from = from === 0 ? 0 : source.lastIndexOf("\n", from - 1) + 1;
      const end = source.indexOf("\n", to);
      to = end < 0 ? source.length : end;
    }
    if (editorViewMode === "visual") {
      const bounds = visualProjection(source).body;
      from = Math.max(bounds.from, from);
      to = Math.max(from, Math.min(to, bounds.to));
    }
    if (!commentRange(source, from, to))
      throw new Error("Select a passage of up to 10,000 source characters.");
    await saveNow();
    const latest = await api<TextFile>(
      `/projects/${p.id}/file?path=${encodeURIComponent(file.path)}`,
    );
    if (
      projectRef.current?.id !== p.id ||
      docRef.current?.path !== file.path ||
      currentEditor()?.value() !== source ||
      latest.content !== source ||
      latest.readOnly
    )
      throw new Error(
        "The source changed or became read-only. Select the passage again; your comment draft is kept.",
      );
    if (docRef.current?.revision !== latest.revision) {
      setDoc(latest);
      saved.current = source;
    }
    return {
      path: file.path,
      revision: latest.revision,
      from,
      to,
      quote: source.slice(from, to),
      line: source.slice(0, from).split("\n").length,
    };
  }
  async function navigateComment(thread: CommentInfo) {
    if (projectRef.current?.id !== thread.projectId) return;
    await saveNow();
    const current = await api<CommentThread>(
      `/projects/${thread.projectId}/comments/${thread.id}`,
    );
    if (current.unavailable)
      throw new Error(
        "Restore this file in Files before returning to the passage.",
      );
    if (projectRef.current?.id !== thread.projectId) return;
    const latestProject = await api<Project>(`/projects/${thread.projectId}`);
    if (projectRef.current?.id !== thread.projectId) return;
    setProject(latestProject);
    await openFile(current.path, latestProject);
    if (
      docRef.current?.path !== current.path ||
      docRef.current.revision !== current.sourceRevision
    )
      throw new Error(
        "The passage changed while opening it. Refresh comments and try again.",
      );
    requestAnimationFrame(() => {
      if (
        projectRef.current?.id === thread.projectId &&
        docRef.current?.path === current.path &&
        docRef.current.revision === current.sourceRevision
      )
        currentEditor()?.select(current.anchor.from, current.anchor.to);
    });
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
  function openTable(from: number, to: number) {
    const file = docRef.current,
      editor = currentEditor(),
      p = projectRef.current;
    if (!file || !editor || !p) return;
    setTableTarget({
      project: p.id,
      file: { ...file, content: editor.value() },
      from,
      to,
    });
    setModal("edit-table");
  }
  async function openClipboard(packet: ClipboardPacket) {
    if (editingBlocked()) return;
    const p = projectRef.current,
      file = docRef.current,
      editor = currentEditor();
    if (!p || !file || !editor || editor.value() !== packet.source) return;
    if (packet.image && !packet.html && !/\.(tex|ltx)$/i.test(file.path)) {
      report(new Error("Open a LaTeX file before pasting a figure."));
      return;
    }
    if (packet.visual) {
      const projection = visualProjection(packet.source);
      let from = Math.max(
        projection.body.from,
        Math.min(packet.from, projection.body.to),
      );
      let to = Math.max(from, Math.min(packet.to, projection.body.to));
      if (from === to) from = to = visualCaret(projection, from);
      else
        for (const atom of projection.atoms) {
          if (atom.kind !== "setup" && from < atom.to && to > atom.from) {
            from = Math.min(from, atom.from);
            to = Math.max(to, atom.to);
          }
        }
      packet = { ...packet, from, to };
    }
    const target = {
        project: p.id,
        file: { ...file, content: packet.source },
        packet,
      },
      request = ++clipboardRequest.current;
    if (
      packet.preview ||
      editorPreferences(settings?.preferences?.editor).previewPaste
    ) {
      setClipboardTarget(target);
      setModal("clipboard-paste");
      return;
    }
    try {
      const { prepareClipboard } = await import("./prepare-clipboard"),
        prepared = await prepareClipboard(packet);
      if (request !== clipboardRequest.current) return;
      if (modalRef.current)
        throw new Error(
          "Close the current dialog, then paste again. The clipboard is unchanged.",
        );
      if (prepared.review) {
        setClipboardTarget({ ...target, packet: prepared.packet });
        setModal("clipboard-paste");
      } else {
        await applyClipboard(prepared.latex, prepared.block, target, false);
        setToast("Pasted · Undo is available in the editor");
      }
    } catch (e) {
      report(e);
    }
  }
  async function previewClipboard() {
    if (editingBlocked()) return;
    const editor = currentEditor(),
      file = docRef.current,
      p = projectRef.current;
    if (!editor || !file || !p) return;
    const source = editor.value(),
      selection = editor.selection();
    try {
      const items = await navigator.clipboard.read();
      const data = async (type: string) => {
        const item = items.find((i) => i.types.includes(type));
        return item ? (await item.getType(type)).text() : "";
      };
      const [html, plain, rawLatex, custom] = await Promise.all([
        data("text/html"),
        data("text/plain"),
        data("text/x-tex"),
        data(CLIP_MIME),
      ]);
      const imageItem = items.find((i) =>
          i.types.some((t) => /^image\/(png|jpeg)$/.test(t)),
        ),
        imageType = imageItem?.types.find((t) => /^image\/(png|jpeg)$/.test(t)),
        blob = imageType ? await imageItem!.getType(imageType) : null;
      if (
        projectRef.current?.id !== p.id ||
        docRef.current?.path !== file.path ||
        currentEditor()?.value() !== source
      )
        throw new Error(
          "The target changed while reading the clipboard. Try Paste Preview again.",
        );
      await openClipboard({
        source,
        ...selection,
        visual: editorViewMode === "visual",
        html,
        plain,
        rawLatex,
        id: clipboardId(html, custom),
        image: blob
          ? new File(
              [blob],
              imageType === "image/jpeg" ? "clipboard.jpg" : "clipboard.png",
              { type: imageType },
            )
          : undefined,
        preview: true,
      });
    } catch (e) {
      report(
        new Error(
          "Clipboard preview was unavailable. Paste with the keyboard, or enable preview in Settings → Editor. " +
            (e as Error).message,
        ),
      );
    }
  }
  async function applyClipboard(
    latex: string,
    block: boolean,
    t = clipboardTarget,
    close = true,
  ) {
    if (!t || editingBlocked())
      throw new Error(
        "The file is read-only. Paste after the assistant finishes.",
      );
    const valid = () =>
      projectRef.current?.id === t.project &&
      docRef.current?.path === t.file.path &&
      currentEditor()?.value() === t.file.content;
    if (!valid())
      throw new Error(
        "The target changed. Keep the clipboard, close this preview, and paste again at the new cursor.",
      );
    await saveNow();
    const latest = await api<TextFile>(
      `/projects/${t.project}/file?path=${encodeURIComponent(t.file.path)}`,
    );
    if (
      !valid() ||
      latest.content !== t.file.content ||
      latest.revision !== docRef.current?.revision
    )
      throw new Error(
        "The file changed in another view. Your clipboard is intact. Reload the file, then paste again.",
      );
    if (latest.readOnly || editingBlocked())
      throw new Error(
        "The file became read-only. Paste after the assistant finishes.",
      );
    currentEditor()!.pasteSource(t.packet.from, t.packet.to, latex, block);
    if (close) {
      setModal("");
      setClipboardTarget(null);
    }
  }
  async function applyTable(source: string) {
    const target = tableTarget;
    if (!target || editingBlocked())
      throw new Error(
        "Files are read-only while the assistant works. Apply after it finishes.",
      );
    const valid = () =>
      projectRef.current?.id === target.project &&
      docRef.current?.path === target.file.path &&
      currentEditor()?.value() === target.file.content;
    if (!valid())
      throw new Error(
        "The source changed. Copy draft LaTeX before closing or reloading; this dialog keeps its draft only in memory. Then reopen the table.",
      );
    await saveNow();
    const latest = await api<TextFile>(
      `/projects/${target.project}/file?path=${encodeURIComponent(target.file.path)}`,
    );
    if (
      !valid() ||
      latest.content !== target.file.content ||
      latest.revision !== docRef.current?.revision
    )
      throw new Error(
        "The source changed in another view. Copy draft LaTeX before closing or reloading; this dialog keeps its draft only in memory. Then reload the file and reopen the table.",
      );
    if (editingBlocked())
      throw new Error(
        "Files became read-only. Apply after the assistant finishes.",
      );
    const updated =
      target.file.content.slice(0, target.from) +
      source +
      target.file.content.slice(target.to);
    if (new TextEncoder().encode(updated).length > 2 * 1024 * 1024)
      throw new Error("This edit would exceed the 2 MB editable-file limit.");
    const caret = visualCaret(
      visualProjection(updated),
      target.from + source.length,
    );
    currentEditor()!.applySourceEdit({
      from: target.from,
      to: target.to,
      text: source,
      selection: { anchor: caret, head: caret },
    });
    setModal("");
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
    currentProposal = reviewedProposal;
  const otherRun = !busy ? activeProjectRuns()[0] : undefined;
  const sourceLocked =
    busy ||
    !!otherRun ||
    movingFiles ||
    reviewBusy ||
    (sourceRecovery?.projectId === project?.id && !!project);
  const availableSourceDrafts = sourceDrafts.filter(
    (d) =>
      d.project === project?.id &&
      (!sourceJournal.current!.owns(d) ||
        d.path !== activePath ||
        d.text !== doc?.content),
  );
  const undoTarget =
    typingUndoState?.run ?? runs.find((r) => r.id === lastTyping);
  const sourceLockedRef = useRef(sourceLocked);
  sourceLockedRef.current = sourceLocked;
  const navigationCommands = projectCommands({
    source: !!doc && !binary,
    tex: !!doc && /\.tex$/i.test(doc.path),
    locked: sourceLocked,
    compileReady: !!project?.root && !!compileSettings,
    running: !!running,
    stopping: !!running?.cancelRequested || stoppingBuildId === running?.id,
    pdf: !!pdfJob,
  });
  async function selectNavigationCommand(id: string) {
    if (
      !projectRef.current ||
      !navigationCommands.some((c) => c.id === id && !c.disabled)
    )
      return false;
    // These actions use the same source/preflight/revision guards as their controls.
    setQuickNavigation(null);
    try {
      switch (id) {
        case "files":
          setQuickNavigation("files");
          break;
        case "disk-files":
          setModal("disk-discovery");
          break;
        case "save":
          if (!sourceLockedRef.current) await saveNow();
          break;
        case "find":
          findInDocument();
          break;
        case "search":
          setSidebarTab("search");
          requestAnimationFrame(() =>
            document.getElementById("project-search-query")?.focus(),
          );
          break;
        case "compile":
          await compile();
          break;
        case "stop":
          await cancelBuild();
          break;
        case "pdf":
          await toPdf();
          break;
        case "format":
          await openFormatter();
          break;
        case "match-environment":
          // Let the native palette close before focusing its source target.
          {
            const owner = projectRef.current?.id,
              path = docRef.current?.path;
            requestAnimationFrame(() => {
              if (
                projectRef.current?.id === owner &&
                docRef.current?.path === path &&
                !currentEditor()?.matchEnvironment()
              )
                setToast(
                  "In Code view, place the caret in a matching begin/end command",
                );
            });
          }
          break;
        case "code":
          chooseEditorView("code");
          requestAnimationFrame(() => currentEditor()?.focus());
          break;
        case "visual":
          chooseEditorView("visual");
          requestAnimationFrame(() => currentEditor()?.focus());
          break;
        case "references":
          await openReferences();
          break;
        case "word-count":
          setModal("word-count");
          break;
        case "writing":
          openWriting();
          break;
        case "history":
          setModal("history");
          break;
        case "versions":
          await reviewSource();
          break;
        case "settings":
          openSettings("editor");
          break;
        case "help":
          setModal("help");
          break;
      }
    } catch (e) {
      report(e);
    }
    // The chosen action owns its next dialog; no further close is needed.
  }
  const [diagnosticView, setDiagnosticView] = useState<DiagnosticActionView>({
    phase: "idle",
    existing: "",
    proposed: "",
    reviewing: false,
  });
  const diagnosticConfig = useRef({
    scope,
    mode,
    draftStatus: draftView.status,
  });
  diagnosticConfig.current = { scope, mode, draftStatus: draftView.status };
  const diagnosticFocus = useRef<{
    request: DiagnosticFix;
    valid: () => boolean;
    conversationId: string;
  } | null>(null);
  const diagnosticActions = useRef<DiagnosticActionController | null>(null);
  if (!diagnosticActions.current)
    diagnosticActions.current = new DiagnosticActionController({
      context: () => ({
        projectId: projectRef.current?.id ?? "",
        conversationId: conversationRef.current,
        scope: diagnosticConfig.current.scope,
        mode: diagnosticConfig.current.mode,
        prompt: promptRef.current,
        navigation: fileNavigation.current,
        path: docRef.current?.path,
        content: docRef.current?.content,
        locked:
          sourceLockedRef.current ||
          busyRef.current ||
          activeProjectRuns().length > 0 ||
          chatSelectionPending.current ||
          typingUndoRecovery.current.working,
        ready:
          diagnosticConfig.current.draftStatus !== "loading" &&
          !!projectRef.current &&
          chatDrafts.current!.isActive({
            projectId: projectRef.current.id,
            conversationId: conversationRef.current || null,
          }),
      }),
      flush: async () => {
        await chatDrafts.current!.flush();
      },
      open: async (request, initial, current) => {
        const editorUnchanged = () =>
          fileNavigation.current === initial.navigation &&
          docRef.current?.path === initial.path &&
          docRef.current?.content === initial.content;
        await saveNow();
        if (!current() || !editorUnchanged())
          throw new Error(
            "The editor changed. Prepare this fix again; your prompt is unchanged.",
          );
        const fresh = await api<Project>("/projects/" + request.projectId);
        if (!current() || !editorUnchanged())
          throw new Error("The editor changed. Prepare this fix again.");
        const target = fresh.files.find(
          (f) => f.path === request.target && !f.deleted && f.kind === "text",
        );
        if (!target)
          throw new Error(
            "The diagnostic source was removed, renamed or is not editable text. Recompile to refresh the diagnostic.",
          );
        const ownNavigation = initial.navigation + 1;
        let problem =
          "The source could not be opened. Your prompt is unchanged.";
        const loaded = await openFile(request.target, fresh, {
          allowed: (candidate) => {
            if (
              !current() ||
              ![initial.navigation, ownNavigation].includes(
                fileNavigation.current,
              ) ||
              docRef.current?.path !== initial.path ||
              docRef.current?.content !== initial.content
            )
              return false;
            if (candidate?.readOnly) {
              problem =
                "The source is read-only while an assistant works. Wait for it to finish, then prepare again.";
              return false;
            }
            if (candidate && candidate.revision !== target.revision) {
              problem =
                "The target file changed while opening. Prepare again to inspect its current source.";
              return false;
            }
            return true;
          },
          onError: (error) => {
            problem = error instanceof Error ? error.message : problem;
          },
        });
        if (!loaded) throw new Error(problem);
        return {
          path: loaded.path,
          valid: () =>
            fileNavigation.current === ownNavigation &&
            projectRef.current?.id === request.projectId &&
            docRef.current?.path === loaded.path &&
            docRef.current?.revision === loaded.revision &&
            docRef.current?.content === loaded.content,
        };
      },
      commit: (request, text, opened) => {
        diagnosticFocus.current = {
          request,
          valid: opened.valid,
          conversationId: conversationRef.current,
        };
        setMode("review");
        setRequestContext(null);
        setContextFiles([]);
        setPrompt(text);
        requestAnimationFrame(focusDiagnosticComposer);
      },
      notify: setDiagnosticView,
    });
  useEffect(() => {
    diagnosticActions.current?.dismissOtherConversation();
  }, [project?.id, conversationId]);
  useEffect(() => () => diagnosticActions.current?.dispose(), []);
  function focusDiagnosticComposer() {
    const pending = diagnosticFocus.current;
    if (!pending) return;
    if (
      !pending.valid() ||
      sourceLockedRef.current ||
      conversationRef.current !== pending.conversationId
    ) {
      diagnosticFocus.current = null;
      return;
    }
    const editor = currentEditor();
    if (!editor) return;
    diagnosticFocus.current = null;
    editor.jump(pending.request.line ?? 1);
    document
      .querySelector<HTMLTextAreaElement>(
        '[aria-label="Ask your AI assistant"]',
      )
      ?.focus();
  }
  function prepareDiagnostic(
    diagnostic: import("../shared/types").Diagnostic,
    job: CompileJob,
  ) {
    diagnosticActions.current!.begin({
      projectId: job.projectId,
      buildId: job.id,
      target: diagnostic.path ?? job.root,
      line: diagnostic.path ? diagnostic.line : undefined,
      diagnostic,
    });
  }
  const diagnosticPending = diagnosticView.phase === "preparing";
  const visibleDiagnostic =
    diagnosticView.request?.projectId === project?.id &&
    diagnosticView.conversationId === conversationId;
  const tracking = useTracking(project?.id, doc?.path, doc?.revision);
  const trackingMarks = useMemo(
    () => ({
      source: saved.current,
      marks: (tracking.file?.hunks ?? []).map((h) => ({
        id: h.id,
        from: h.from,
        to: h.to,
        removed: !!h.before,
      })),
    }),
    [tracking.file, doc?.revision],
  );
  async function changeSourceMode(enabled: boolean) {
    const id = projectRef.current?.id;
    if (!id || editingBlocked()) return;
    setReviewWorking(true);
    try {
      await saveNow();
      const status = await api<import("../shared/tracking").TrackingStatus>(
        `/projects/${id}/tracking`,
      );
      await api(`/projects/${id}/tracking`, "PUT", {
        enabled,
        revision: status.revision,
      });
      await tracking.refresh();
      if (enabled) {
        setReviewPane("changes");
        setSidebarTab("review");
      }
    } catch (e) {
      report(e);
      await tracking.refresh();
    } finally {
      setReviewWorking(false);
    }
  }
  async function reviewedSource(result: TrackingResult) {
    if (projectRef.current?.id !== project?.id) return;
    if (docRef.current?.path === result.path) {
      if (docRef.current.content !== saved.current)
        throw new Error(
          "The review was saved, but local text changed during the request. Your local text is retained; reload before saving.",
        );
      saved.current = result.file.content;
      setDoc(result.file);
      setSaveStatus("Saved");
    }
    await refreshProject();
    await commentMarks.refresh();
  }
  async function navigateTracked(file: TrackingFile, hunk: TrackedHunk) {
    const id = projectRef.current?.id;
    if (!id) return;
    await saveNow();
    const p = await api<Project>(`/projects/${id}`);
    if (projectRef.current?.id !== id) return;
    setProject(p);
    await openFile(file.path, p);
    if (
      docRef.current?.path !== file.path ||
      docRef.current.revision !== file.sourceRevision
    )
      throw new Error("The source changed. Refresh review before navigating.");
    requestAnimationFrame(() => {
      if (
        projectRef.current?.id === id &&
        docRef.current?.path === file.path &&
        docRef.current.revision === file.sourceRevision
      )
        currentEditor()?.select(hunk.from, hunk.to);
    });
  }
  const commentMarks = useCommentMarks(
    project?.id,
    doc?.path,
    doc?.revision,
    saved.current,
  );
  const writing = useWritingChecks(
    project?.id,
    doc?.path,
    doc?.content,
    settings?.writing,
    sourceLocked,
  );
  function writingSaved(value: WritingSettings) {
    setSettings((old: any) => ({ ...old, writing: value }));
  }
  async function replaceWriting(
    result: CheckedWriting,
    issue: WritingIssue,
    replacement: string,
  ) {
    const check = () => {
      const file = docRef.current;
      if (sourceLockedRef.current || busyRef.current || movingFilesRef.current)
        throw new Error(
          "Source is read-only while an assistant or file operation is active.",
        );
      if (
        projectRef.current?.id !== result.projectId ||
        file?.path !== result.path ||
        file.content !== result.source ||
        currentEditor()?.value() !== result.source
      )
        throw new Error(
          "The source changed. Retry the checks before applying a correction.",
        );
      if (
        issue.kind !== "spelling" ||
        !issue.word ||
        result.source.slice(issue.from, issue.to) !== issue.word ||
        !result.issues.some((i) => i.id === issue.id)
      )
        throw new Error(
          "This spelling finding is no longer valid. Retry the checks.",
        );
      return file;
    };
    check();
    await saveNow();
    const file = check();
    const stored = await api<TextFile>(
      `/projects/${result.projectId}/file?path=${encodeURIComponent(result.path)}`,
    );
    check();
    if (stored.revision !== file.revision || stored.content !== result.source)
      throw new Error(
        "The saved file changed in another session. Reopen it before correcting its spelling.",
      );
    currentEditor()?.applySourceEdit({
      from: issue.from,
      to: issue.to,
      text: replacement,
    });
  }
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
  useEffect(() => {
    if (destinationProject.current !== project?.id) {
      destinationProject.current = project?.id || "";
      setUploadDestination("");
    } else
      setUploadDestination((old) =>
        project && projectFolders(project.files).includes(old) ? old : "",
      );
  }, [project?.id, project?.generation]);
  const selectedChoice = choices.find(
    (choice) => choice.provider === provider && choice.id === model,
  );
  return (
    <div className={"app-shell" + (!project ? " home-shell" : "")}>
      {!project ? (
        <ProjectHome
          projects={projects}
          trashedProjects={trashedProjects}
          loading={loadingProjects}
          onOpen={(p) => void openProject(p)}
          onCopy={(p) => void openProjectCopy(p)}
          onTemplate={(p) => void prepareTemplate(p)}
          revealProject={copiedProjectId}
          onNew={() => {
            setInitialTemplate("");
            setFormValue("");
            setModal("new-project");
          }}
          onImport={() => setModal("import")}
          onSettings={() => openSettings()}
          onHelp={() => setModal("help")}
          onReload={async () => {
            const [active, trash] = await Promise.all([
              api<Project[]>("/projects"),
              api<Project[]>("/projects/trash"),
            ]);
            setProjects(active);
            setTrashedProjects(trash);
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
              <LeafMark />
              <span>
                leaf<span className="brand-dot">.</span>
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
                title="Help & shortcuts"
                aria-label="Help & shortcuts"
                onClick={() => setModal("help")}
              >
                L
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
                        setInitialTemplate("");
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
                    <button
                      disabled={sourceLocked}
                      onClick={() => project && void prepareTemplate(project)}
                    >
                      <FileText size={14} />
                      Save as template
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
                  className={sidebarTab === "review" ? "active" : ""}
                  onClick={() => setSidebarTab("review")}
                >
                  <MessageSquare size={14} />
                  Review
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
              <div
                className="review-sections"
                role="group"
                aria-label="Review tools"
                hidden={sidebarTab !== "review"}
              >
                <button
                  aria-pressed={reviewPane === "comments"}
                  onClick={() => setReviewPane("comments")}
                >
                  Comments
                </button>
                <button
                  aria-pressed={reviewPane === "changes"}
                  onClick={() => setReviewPane("changes")}
                >
                  Changes
                </button>
              </div>
              <TrackingPanel
                key={project.id + "/tracking"}
                projectId={project.id}
                active={sidebarTab === "review" && reviewPane === "changes"}
                activePath={activePath}
                status={tracking.status}
                current={tracking.file}
                error={tracking.error}
                locked={sourceLocked}
                selection={position}
                request={
                  trackingRequest?.projectId === project.id
                    ? trackingRequest
                    : undefined
                }
                prepare={saveNow}
                refresh={tracking.refresh}
                onBusy={setReviewWorking}
                onChanged={reviewedSource}
                onNavigate={navigateTracked}
              />
              <CommentsPanel
                key={project.id + "/comments"}
                projectId={project.id}
                active={sidebarTab === "review" && reviewPane === "comments"}
                activePath={activePath}
                generation={project.generation}
                locked={sourceLocked}
                canCreate={!!doc && !binary}
                request={
                  commentRequest?.projectId === project.id
                    ? commentRequest
                    : undefined
                }
                onCapture={captureComment}
                onNavigate={navigateComment}
                onChanged={() => void commentMarks.refresh().catch(report)}
              />
              {sidebarTab === "chats" ? (
                <ConversationList
                  key={project!.id}
                  projectId={project!.id}
                  items={conversations}
                  activeId={conversationId}
                  locked={sourceLocked || chatSelecting}
                  onSelect={(id, runId) => void chooseConversation(id, runId)}
                  onEdit={editConversation}
                  onRefresh={refreshChats}
                />
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
                          setFormValue(
                            uploadDestination ? uploadDestination + "/" : "",
                          );
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
                          setFormValue(
                            uploadDestination ? uploadDestination + "/" : "",
                          );
                        }}
                      >
                        <FolderPlus size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Upload files"
                        disabled={sourceLocked}
                        title="Upload files"
                        onClick={() => setModal("upload-files")}
                      >
                        <Upload size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Check disk files"
                        title="Check disk files"
                        onClick={() => setModal("disk-discovery")}
                      >
                        <RefreshCw size={14} />
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
                      uploadDestination={uploadDestination}
                      onRoot={() => setUploadDestination("")}
                      onFolder={(name) => {
                        setUploadDestination(name);
                        setCollapsed((old) => {
                          const next = new Set(old);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        });
                      }}
                      onOpen={(name) => void openFile(name)}
                      onChanged={filesChanged}
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
              <div className="sidebar-bottom" hidden={sidebarTab === "review"}>
                <button onClick={() => void openReferences()}>
                  <BookOpen size={15} />
                  References
                </button>
                <button onClick={() => void openWordCount()}>
                  <FileText size={15} />
                  Word count
                </button>
                <button onClick={() => openWriting()}>
                  <SpellCheck size={15} />
                  Writing checks
                </button>
                <button onClick={() => void openHistory()}>
                  <History size={15} />
                  History
                </button>
                <button onClick={() => setModal("trash")}>
                  <Trash2 size={15} />
                  Trash
                  <span>
                    {project?.files.filter((f) => f.deleted).length || ""}
                  </span>
                </button>
                <div className="sidebar-signature">
                  <LeafMark size={18} />
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
                  <div className="editor-tab-actions">
                    <button
                      className="icon-button"
                      aria-label="Open a file"
                      title="Open a file (⌘/Ctrl P)"
                      onClick={() => setQuickNavigation("files")}
                    >
                      <Files size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Command palette"
                      title="Command palette (⌘/Ctrl Shift P)"
                      onClick={() => setQuickNavigation("commands")}
                    >
                      <Command size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Find in document"
                      title="Find in document (⌘F)"
                      onClick={findInDocument}
                    >
                      <Search size={15} />
                    </button>
                  </div>
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
                    <select
                      className="source-mode"
                      aria-label="Source editing mode"
                      title="Reviewing tracks source edits; current text compiles and exports"
                      value={tracking.status?.enabled ? "reviewing" : "editing"}
                      disabled={sourceLocked || !tracking.status}
                      onChange={(e) =>
                        void changeSourceMode(e.target.value === "reviewing")
                      }
                    >
                      <option value="editing">Editing</option>
                      <option value="reviewing">Reviewing</option>
                    </select>
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
                        else if (
                          runs.find((r) => r.id === lastTyping)?.path ===
                          activePath
                        )
                          void undoTyping();
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
                  onFormatDocument={() => void openFormatter()}
                  onPaste={() => void previewClipboard()}
                  onComment={() => requestComment()}
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
                {(draftWarning ||
                  fileConflicts.has(project.id + "/" + activePath) ||
                  availableSourceDrafts.length > 0) && (
                  <div className="source-notice" role="status">
                    <p>
                      {draftWarning ||
                        (fileConflicts.has(project.id + "/" + activePath)
                          ? "This file changed outside this editor. Your writing is kept."
                          : "Unsaved writing is available to recover.")}
                    </p>
                    {fileConflicts.has(project.id + "/" + activePath) && (
                      <button onClick={() => void reviewSource()}>
                        Review file versions
                      </button>
                    )}
                    {availableSourceDrafts.length > 0 && (
                      <label>
                        Recover draft{" "}
                        <select
                          aria-label="Choose a draft to recover"
                          value=""
                          onChange={(e) => {
                            const d = availableSourceDrafts.find(
                              (d) => d.id === e.target.value,
                            );
                            if (d) void reviewSource(d);
                          }}
                        >
                          <option value="">Choose a file…</option>
                          {availableSourceDrafts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.path} · {new Date(d.updated).toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                <div className="editor-area">
                  {editorDocuments.map((file) => (
                    <div
                      className="editor-document"
                      key={
                        project?.id +
                        "/" +
                        file.path +
                        ":" +
                        (editorEpochs[project.id + "/" + file.path] ?? 0)
                      }
                      hidden={file.path !== activePath || binary}
                    >
                      <Editor
                        ref={(handle) => {
                          if (handle) editors.current.set(file.path, handle);
                          else editors.current.delete(file.path);
                        }}
                        content={file.content}
                        latex={/\.(tex|sty|cls)$/i.test(file.path)}
                        onReady={() => {
                          focusDiagnosticComposer();
                          const pending = typingUndoFocus.current;
                          if (
                            pending?.projectId === project.id &&
                            pending.path === file.path
                          ) {
                            typingUndoFocus.current = null;
                            if (
                              projectRef.current?.id === project.id &&
                              docRef.current?.path === file.path
                            )
                              editors.current.get(file.path)?.focus();
                          }
                        }}
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
                        onTable={openTable}
                        onClipboard={openClipboard}
                        comments={
                          file.path === activePath
                            ? commentMarks.comments
                            : undefined
                        }
                        onComment={requestComment}
                        tracking={
                          file.path === activePath ? trackingMarks : undefined
                        }
                        onTracking={requestTracking}
                        onClipboardError={(message) =>
                          report(new Error(message))
                        }
                        onFind={findInDocument}
                        intelligence={intelligence}
                        writing={
                          file.path === activePath ? writing.result : undefined
                        }
                        writingEnabled={
                          file.path === activePath &&
                          writing.enabled &&
                          !writing.excluded
                        }
                        onWriting={openWriting}
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
                          const current = visibleSource(
                            project.id,
                            file.path,
                            projectRef.current?.id,
                            docRef.current,
                          );
                          if (current) {
                            if (
                              !busyRef.current &&
                              runs.find((r) => r.id === lastTyping)?.path ===
                                file.path
                            )
                              setLastTyping("");
                            const changed = { ...current, content };
                            if (!busyRef.current && !typing.current)
                              keepSourceDraft(project.id, changed);
                            setDoc(changed);
                          }
                        }}
                        onSelection={(line, column, from, to) => {
                          if (
                            visibleSource(
                              project.id,
                              file.path,
                              projectRef.current?.id,
                              docRef.current,
                            )
                          )
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
                    {!workflowPreferences.autoSave && " · Autosave off"}
                    {sourceLocked
                      ? typingUndoState?.working
                        ? " · Restoring typing · Read-only"
                        : movingFiles
                          ? " · Moving files · Read-only"
                          : sourceRecovery
                            ? " · Reviewing file versions · Read-only"
                            : reviewBusy
                              ? " · Saving review · Read-only"
                              : " · Read-only while AI works"
                      : ""}
                  </span>
                  {doc && !workflowPreferences.autoSave && (
                    <button
                      className="subtle"
                      title="Save source (⌘/Ctrl S)"
                      disabled={
                        sourceLocked ||
                        loadingProjects ||
                        doc.content === saved.current
                      }
                      onClick={() => void saveNow().catch(report)}
                    >
                      Save
                    </button>
                  )}
                  {doc && (
                    <button
                      className="subtle"
                      onClick={() => void reviewSource()}
                      title="Compare editor and disk versions"
                    >
                      File versions
                    </button>
                  )}
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
                      <span
                        title={
                          conversations.find((c) => c.id === conversationId)
                            ?.title
                        }
                      >
                        {conversations.find((c) => c.id === conversationId)
                          ?.title ?? "New conversation"}
                      </span>
                    </div>
                    <div className="assistant-heading-actions">
                      <button
                        className="icon-button"
                        aria-label={
                          composerHeight >= 500
                            ? "Compact assistant"
                            : "Expand assistant"
                        }
                        onClick={() =>
                          setComposerHeight((h) => (h >= 500 ? 360 : 550))
                        }
                      >
                        {composerHeight >= 500 ? (
                          <Minimize2 size={14} />
                        ) : (
                          <Maximize2 size={14} />
                        )}
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Browse conversations"
                        onClick={() => setSidebarTab("chats")}
                      >
                        <MessageSquare size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="New conversation"
                        disabled={sourceLocked || chatSelecting}
                        onClick={() => void chooseConversation(null)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
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

                  <ChatTranscript
                    key={
                      project!.id +
                      ":" +
                      (freshConversation ? "new" : conversationId)
                    }
                    projectId={project!.id}
                    conversationId={freshConversation ? "" : conversationId}
                    target={
                      chatMatch?.conversationId === conversationId
                        ? chatMatch
                        : undefined
                    }
                    revision={conversationRuns
                      .map((r) => r.id + ":" + r.status + ":" + r.lastRevision)
                      .join("|")}
                    live={activeRun}
                    text={runText}
                    busy={busy}
                    draft={!!typingDraft}
                    typing={!!typing.current?.editReady}
                    paused={paused}
                    proposals={proposals}
                    onReview={(p) => void reviewProposal(p)}
                    onReuse={(text) => {
                      setPrompt(text);
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLTextAreaElement>(
                            '[aria-label="Ask your AI assistant"]',
                          )
                          ?.focus(),
                      );
                    }}
                    onFile={(path) => void openFile(path)}
                    welcome={
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
                    }
                  >
                    {busy &&
                      !typingDraft &&
                      !paused &&
                      !typing.current?.editReady && (
                        <div className="tool-status" role="status">
                          <LoaderCircle className="spin" size={12} />
                          {toolStatus || "Waiting for the assistant…"}
                        </div>
                      )}
                    {undoTarget?.projectId === project.id && !busy && (
                      <div className="typing-undo-recovery">
                        {typingUndoState?.error && (
                          <p
                            role="alert"
                            tabIndex={-1}
                            ref={typingUndoErrorRef}
                          >
                            Undo in {undoTarget.path} could not be confirmed.{" "}
                            {typingUndoState.error}
                          </p>
                        )}
                        <div className="typing-undo-actions">
                          <button
                            className="undo-typing"
                            disabled={sourceLocked}
                            onClick={() => void undoTyping()}
                          >
                            <Undo2 size={14} />
                            <span>
                              {typingUndoState?.working
                                ? "Restoring typing in "
                                : typingUndoState?.error
                                  ? "Retry Undo in "
                                  : "Undo typing in "}
                              <code>{undoTarget.path}</code>
                            </span>
                          </button>
                          {typingUndoState?.error && (
                            <button
                              disabled={sourceLocked}
                              onClick={() => {
                                typingUndoRecovery.current.reset();
                                setTypingUndoState(null);
                              }}
                            >
                              Dismiss Undo recovery
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </ChatTranscript>
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
                      aria-describedby="chat-draft-status"
                      maxLength={16000}
                      placeholder={
                        mode === "manual"
                          ? "Ask for an edit, or ask a question…"
                          : scope === "project"
                            ? "Ask anything about your project…"
                            : "Ask anything about this document…"
                      }
                      value={prompt}
                      disabled={
                        !doc ||
                        sourceLocked ||
                        chatSelecting ||
                        draftView.status === "loading"
                      }
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <DraftStatus
                      view={draftView}
                      locked={busy || chatSelecting}
                      onRetry={() =>
                        void chatDrafts.current!.flush().catch(() => {})
                      }
                      onReview={() => setDraftRecovery(true)}
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
                            draftView.status === "loading" ||
                            draftView.status === "conflict" ||
                            !doc ||
                            !prompt.trim() ||
                            !selectedChoice ||
                            refreshingModels ||
                            diagnosticPending ||
                            chatSelecting
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
                      title={`${conversationRuns.length} saved turns. API context includes up to 20 recent turns in the current scope, bounded to 32 KB. Native CLI context also depends on its saved session.`}
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
                      disabled={
                        running
                          ? !!running.cancelRequested ||
                            stoppingBuildId === running.id
                          : sourceLocked || !project?.root || !compileSettings
                      }
                      onClick={() =>
                        running ? void cancelBuild() : void compile()
                      }
                    >
                      {running ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                      {running
                        ? running.cancelRequested ||
                          stoppingBuildId === running.id
                          ? "Stopping build…"
                          : "Stop build"
                        : "Compile"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Compile options"
                      aria-haspopup="dialog"
                      title={`Compile options: ${compileSettings?.mode === "draft" ? "Fast draft" : "Normal"} · ${compileSettings?.errorHandling === "continue" ? "Continue after errors" : "Stop on first error"}`}
                      disabled={!project}
                      onClick={() => setModal("compile-options")}
                    >
                      <Settings2 size={14} />
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
                  <>
                    {pdfJob &&
                      (compileOptions(pdfJob.options).mode === "draft" ||
                        pdfJob.status === "failed" ||
                        !!pdfJob.runtime) && (
                        <div
                          className={
                            "compile-notice " +
                            (pdfJob.status === "failed" ? "has-errors" : "")
                          }
                          role="status"
                        >
                          {pdfJob.runtime && (
                            <span title={pdfJob.runtime.binDir}>
                              {pdfJob.runtime.label}
                            </span>
                          )}
                          {compileOptions(pdfJob.options).mode === "draft" && (
                            <span>
                              Fast draft · standard graphics are boxes
                            </span>
                          )}
                          {pdfJob.status === "failed" && (
                            <>
                              <span>
                                PDF with errors · this build did not succeed
                              </span>
                              {builds.find(
                                (j) => j.pdf && j.status === "succeeded",
                              ) && (
                                <button
                                  onClick={() =>
                                    setPdfJob(
                                      builds.find(
                                        (j) =>
                                          j.pdf && j.status === "succeeded",
                                      )!,
                                    )
                                  }
                                >
                                  Show last successful PDF
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    <PdfPreview
                      url={pdfJob ? `/api/builds/${pdfJob.id}/pdf` : undefined}
                      staleLabel="Preview is out of date · compile to refresh"
                      stale={
                        !!pdfJob &&
                        (pdfJob.generation !== project?.generation ||
                          saveStatus !== "Saved" ||
                          typing.current?.first === false ||
                          !sameCompileOptions(
                            pdfJob.options,
                            compileSettings,
                          ) ||
                          (!!runtimeFingerprint &&
                            pdfJob.runtime?.fingerprint !==
                              runtimeFingerprint) ||
                          (!!latest &&
                            ["failed", "cancelled"].includes(latest.status) &&
                            latest.id !== pdfJob.id))
                      }
                      onInverse={(p, x, y) => void fromPdf(p, x, y)}
                      targetPage={targetPage}
                      targetLocation={pdfLocation}
                    />
                  </>
                ) : (
                  <div className="logs-panel">
                    <div className="build-summary">
                      <span className={"build-dot " + (latest?.status ?? "")} />
                      <h3>
                        {latest
                          ? latest.status === "failed" && latest.pdf
                            ? "PDF with errors"
                            : latest.status[0].toUpperCase() +
                              latest.status.slice(1)
                          : "No builds yet"}
                      </h3>
                      {latest && <span>{latest.engine}</span>}
                    </div>
                    {latest && (
                      <p
                        className="build-runtime-meta"
                        title={latest.runtime?.binDir}
                      >
                        {latest.runtime?.label ??
                          "Runtime not recorded for this older build."}
                      </p>
                    )}
                    <div className="build-log-actions">
                      <button
                        disabled={
                          !builds.some(
                            (j) => !["queued", "running"].includes(j.status),
                          )
                        }
                        onClick={() => setModal("build-files")}
                      >
                        Generated files
                      </button>
                      {latest && (
                        <span>
                          {compileOptions(latest.options).mode === "draft"
                            ? "Fast draft"
                            : "Normal"}{" "}
                          ·{" "}
                          {compileOptions(latest.options).errorHandling ===
                          "stop"
                            ? "Stop on first error"
                            : "Continue after errors"}
                        </span>
                      )}
                      {latest?.pdf && (
                        <button
                          onClick={() => {
                            setPdfJob(latest);
                            setRightTab("preview");
                          }}
                        >
                          Show this build’s PDF
                        </button>
                      )}
                    </div>
                    {visibleDiagnostic && (
                      <DiagnosticActionNotice
                        view={diagnosticView}
                        onRetry={() => diagnosticActions.current!.retry()}
                        onCancel={() => diagnosticActions.current!.cancel()}
                      />
                    )}
                    {latest?.diagnostics.map((d, i) => (
                      <div className={"diagnostic " + d.severity} key={i}>
                        <button
                          onClick={() => {
                            if (
                              d.path &&
                              project?.files.some((f) => f.path === d.path)
                            ) {
                              void openFile(d.path).then((loaded) => {
                                if (
                                  loaded &&
                                  docRef.current?.path === loaded.path
                                )
                                  requestAnimationFrame(() => {
                                    if (docRef.current?.path === loaded.path)
                                      currentEditor()?.jump(d.line ?? 1);
                                  });
                              });
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
                          disabled={
                            sourceLocked ||
                            diagnosticPending ||
                            chatSelecting ||
                            draftView.status === "loading"
                          }
                          onClick={() => latest && prepareDiagnostic(d, latest)}
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
      {visibleDiagnostic && (
        <DiagnosticDraftReview
          view={diagnosticView}
          onChoose={(choice) => void diagnosticActions.current!.choose(choice)}
          onRetry={() => diagnosticActions.current!.retry()}
          onCancel={() => diagnosticActions.current!.cancel()}
        />
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
      {draftRecovery && draftView.remote && (
        <DraftRecovery
          view={draftView}
          onClose={() => setDraftRecovery(false)}
          onResolve={(choice) => chatDrafts.current!.resolve(choice)}
        />
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
      {modal === "compile-options" && project && (
        <Suspense
          fallback={
            <Modal title="Compile options" onClose={() => setModal("")}>
              <p>Opening compile options…</p>
            </Modal>
          }
        >
          <CompileOptionsDialog
            engine={project.engine}
            key={project.id}
            projectId={project.id}
            locked={sourceLocked}
            onClose={() => setModal("")}
            onSaved={(s) => {
              buildFetch.current++;
              setCompileSettings(s);
            }}
          />
        </Suspense>
      )}
      {modal === "build-files" && project && (
        <Suspense
          fallback={
            <Modal title="Generated files" onClose={() => setModal("")}>
              <p>Opening generated files…</p>
            </Modal>
          }
        >
          <GeneratedFiles
            key={project.id}
            jobs={builds}
            initialBuildId={
              builds.find((j) => !["queued", "running"].includes(j.status))
                ?.id ?? ""
            }
            onClose={() => setModal("")}
          />
        </Suspense>
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
      {modal === "new-project" && (
        <Suspense
          fallback={
            <Modal title="New project" onClose={() => setModal("")}>
              <p>Opening templates…</p>
            </Modal>
          }
        >
          <TemplateBrowser
            initialId={initialTemplate}
            locked={sourceLocked}
            onClose={() => setModal("")}
            onCreated={async (p) => {
              setModal("");
              if (p.deletedAt) {
                setTrashedProjects((all) => [
                  p,
                  ...all.filter((v) => v.id !== p.id),
                ]);
                setToast(
                  "The created project is in Trash. Restore it from the project library.",
                );
                return;
              }
              setProjects((all) => [p, ...all.filter((v) => v.id !== p.id)]);
              if (sourceLockedRef.current) {
                setToast(
                  "Project created. Open it from the library after the current operation finishes.",
                );
                return;
              }
              await openProject(p);
            }}
          />
        </Suspense>
      )}
      {modal === "save-template" && templateOrigin && (
        <Suspense
          fallback={
            <Modal title="Save as template" onClose={() => setModal("")}>
              <p>Reading template tools…</p>
            </Modal>
          }
        >
          <SaveTemplate
            project={templateOrigin}
            locked={templateOrigin.id === project?.id && sourceLocked}
            onClose={() => setModal("")}
            onSaved={(t) => {
              setInitialTemplate(t.id);
              setModal("new-project");
              setToast("Template saved on this computer");
            }}
          />
        </Suspense>
      )}
      {["new-file", "new-folder", "checkpoint"].includes(modal) && (
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
              maxLength={modal === "checkpoint" ? 120 : undefined}
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
              <option value="latex">LaTeX (DVI → PS → PDF)</option>
              <option value="xelatex">XeLaTeX</option>
              <option value="lualatex">LuaLaTeX</option>
            </select>
          </label>
          <div className="dependency-list">
            <button
              onClick={() => setModal("compile-options")}
              disabled={sourceLocked}
              className="build-runtime-refresh"
            >
              TeX runtime and compile options
            </button>
            <p className="field-help">Tools in the system installation:</p>
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
        <Modal
          title="Replacement preview"
          wide
          className="replacement-preview-modal"
          onClose={() => setModal("")}
        >
          <p className="modal-intro">
            Edit this draft or request a revision. Your source and project
            history stay unchanged until you start typing.
          </p>
          <div className="replacement-preview-body">
            <div className="preview-build-status">
              <div>
                <p role="status">
                  {previewBuildView.phase === "restoring"
                    ? "Checking saved preview status…"
                    : previewBuildView.phase === "starting"
                      ? "Starting a separate preview build…"
                      : previewBuildView.phase === "stopping"
                        ? "Stopping preview build · waiting for the compiler to exit…"
                        : previewBuildView.phase === "running"
                          ? "Preview build running"
                          : previewBuildView.phase === "uncertain"
                            ? "Preview status not confirmed"
                            : typingDraft.job?.status === "cancelled" ||
                                (previewBuildView.cancelled && !typingDraft.job)
                              ? "Preview build stopped · replacement kept"
                              : typingDraft.job?.status === "succeeded"
                                ? "Preview build complete"
                                : typingDraft.job?.status === "failed"
                                  ? "Preview build failed · replacement kept"
                                  : "Compile preview checks a separate copy of your project."}
                </p>
                {typingDraft.job && (
                  <small>
                    Build {typingDraft.job.id.slice(0, 8)} ·{" "}
                    {typingDraft.job.engine}
                    {previewBuildView.stale ? " · earlier replacement" : ""}
                  </small>
                )}
                {previewBuildView.stale && (
                  <p>
                    This preview result is from an earlier replacement. Compile
                    preview to check the current text.
                  </p>
                )}
                {previewBuildView.error && (
                  <p className="preview-build-error" role="alert">
                    {previewBuildView.error}
                  </p>
                )}
              </div>
              {previewBuildView.phase === "uncertain" && (
                <button onClick={() => void previewCompiler.current!.retry()}>
                  Retry preview status
                </button>
              )}
              {previewCompileBusy(previewBuildView) && (
                <button
                  disabled={previewBuildView.phase === "stopping"}
                  onClick={() => void previewCompiler.current!.stop()}
                >
                  Stop preview build
                </button>
              )}
            </div>
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
                  onChange={(e) => {
                    previewCompiler.current!.clear();
                    setTypingDraft({
                      ...typingDraft,
                      text: e.target.value,
                      job: undefined,
                    });
                  }}
                />
                <label htmlFor="draft-suggestions">
                  Suggestions for the assistant
                </label>
                <textarea
                  id="draft-suggestions"
                  aria-label="Replacement suggestions"
                  value={typingDraft.suggestion}
                  onChange={(e) =>
                    setTypingDraft({
                      ...typingDraft,
                      suggestion: e.target.value,
                    })
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
                {typingDraft.job?.pdf &&
                  (compileOptions(typingDraft.job.options).mode === "draft" ||
                    typingDraft.job.status === "failed" ||
                    !!typingDraft.job.runtime) && (
                    <div
                      className={
                        "compile-notice " +
                        (typingDraft.job.status === "failed"
                          ? "has-errors"
                          : "")
                      }
                      role="status"
                    >
                      {typingDraft.job.runtime && (
                        <span title={typingDraft.job.runtime.binDir}>
                          {typingDraft.job.runtime.label}
                        </span>
                      )}
                      {compileOptions(typingDraft.job.options).mode ===
                        "draft" && (
                        <span>Fast draft · standard graphics are boxes</span>
                      )}
                      {typingDraft.job.status === "failed" && (
                        <span>
                          PDF with errors · this draft did not compile
                          successfully
                        </span>
                      )}
                    </div>
                  )}
                {typingDraft.job?.pdf ? (
                  <PdfPreview
                    url={`/api/builds/${typingDraft.job.id}/pdf`}
                    stale={!!previewBuildView.stale}
                  />
                ) : (
                  <p>
                    {previewBuildView.phase === "uncertain"
                      ? "Retry preview status to confirm the build's result."
                      : previewBuildView.phase === "stopping"
                        ? "Stopping the separate preview. Your replacement is kept."
                        : typingDraft.compiling
                          ? "Compiling a separate draft snapshot…"
                          : typingDraft.job?.status === "cancelled" ||
                              previewBuildView.cancelled
                            ? "Preview stopped. Edit the replacement or compile again."
                            : typingDraft.job?.status === "failed"
                              ? "The preview did not compile. Its log is below."
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
          </div>
          <div className="draft-actions">
            <button
              disabled={typingDraft.compiling}
              onClick={() => void compileDraft()}
            >
              Compile preview
            </button>
            <button
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
      {modal === "edit-table" && tableTarget && (
        <Modal
          className="insertion-modal"
          title="Edit table"
          wide
          onClose={() => setModal("")}
        >
          <Suspense
            fallback={<p className="modal-intro">Loading table editor…</p>}
          >
            <TableEditor
              source={tableTarget.file.content.slice(
                tableTarget.from,
                tableTarget.to,
              )}
              locked={sourceLocked}
              onApply={applyTable}
              onSource={() => {
                if (currentEditor()?.value() !== tableTarget.file.content) {
                  report(new Error("The source changed. Reopen the table."));
                  return;
                }
                openVisualSource(tableTarget.from, tableTarget.to, "Table");
              }}
            />
          </Suspense>
        </Modal>
      )}
      {modal === "clipboard-paste" && clipboardTarget && project && (
        <Suspense
          fallback={
            <Modal
              title="Paste into document"
              onClose={() => {
                setModal("");
                setClipboardTarget(null);
              }}
            >
              <p>Loading clipboard preview…</p>
            </Modal>
          }
        >
          <ClipboardPaste
            packet={clipboardTarget.packet}
            path={clipboardTarget.file.path}
            project={project}
            locked={sourceLocked}
            onApply={applyClipboard}
            onClose={() => {
              setModal("");
              setClipboardTarget(null);
            }}
            prepare={prepareFileMove}
            onBusy={fileMoveBusy}
            onUploaded={async (result) => {
              if (projectRef.current?.id !== result.project.id)
                throw new Error("The project changed during upload.");
              projectRef.current = result.project;
              setProject(result.project);
              setToast("Image saved · upload Undo is available in Files");
            }}
          />
        </Suspense>
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
      {modal === "writing" && project && (
        <Modal
          title="Writing checks"
          wide
          className="writing-dialog"
          onClose={() => setModal("")}
        >
          <WritingChecksPanel
            settings={writingSettings(settings?.writing)}
            projectId={project.id}
            path={doc?.path}
            source={doc?.content}
            eligible={writing.eligible}
            excluded={writing.excluded}
            result={writing.result}
            status={writing.status}
            locked={sourceLocked}
            initialIssue={writingIssue}
            onSaved={writingSaved}
            onRetry={writing.retry}
            onIgnore={writing.ignore}
            onSuggest={writing.suggest}
            onReplace={replaceWriting}
            onLocate={(issue) => {
              if (writing.result?.source !== docRef.current?.content) return;
              setEditorViewMode("code");
              setModal("");
              requestAnimationFrame(() => {
                currentEditor()?.select(issue.from, issue.to);
                currentEditor()?.focus();
              });
            }}
            onAsk={(issue) => {
              setPrompt(
                `Please explain this LaTeX hint in ${doc?.path}, line ${doc!.content.slice(0, issue.from).split("\n").length}: ${issue.message}`,
              );
              setMode("review");
              setScope("document");
              setModal("");
            }}
          />
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
        <Modal
          title="Project history"
          wide
          className="history-modal"
          onClose={() => setModal("")}
        >
          <HistoryPanel
            project={project}
            versions={checkpoints}
            prepare={saveNow}
            onBusy={setReviewWorking}
            locked={sourceLocked}
            onCheckpoint={() => {
              setModal("checkpoint");
              setFormValue("");
            }}
            onRestored={async (p) => {
              if (projectRef.current?.id !== p.id) return;
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
      {modal === "upload-files" && project && (
        <UploadFiles
          key={project.id}
          project={project}
          initialDestination={uploadDestination}
          prepare={prepareFileMove}
          onChanged={filesChanged}
          onClose={() => setModal("")}
          onBusy={fileMoveBusy}
        />
      )}
      {modal === "trash" && project && (
        <ProjectTrash
          project={project}
          locked={sourceLocked}
          prepare={prepareFileMove}
          onChanged={filesChanged}
          onClose={() => setModal("")}
          onBusy={fileMoveBusy}
        />
      )}
      {sourceRecovery && project?.id === sourceRecovery.projectId && (
        <SourceRecoveryDialog
          key={
            sourceRecovery.projectId +
            "/" +
            sourceRecovery.path +
            "/" +
            (sourceRecovery.draft?.id ?? "current")
          }
          {...sourceRecovery}
          locked={busy || !!otherRun || movingFiles || reviewBusy}
          mirror={mirrorSourceDraft}
          onApplied={appliedSource}
          onClose={() => {
            setSourceRecovery(null);
            refreshSourceDrafts(sourceRecovery.projectId);
          }}
        />
      )}
      {modal === "diff" && currentProposal && (
        <Modal title="Review changes" wide onClose={() => setModal("")}>
          <p className="modal-intro">{currentProposal.summary}</p>
          {proposalError && (
            <p className="history-error" role="alert">
              {proposalError}
            </p>
          )}
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
                    void proposalAction(currentProposal, "apply").then(
                      (ok) => ok && setModal(""),
                    )
                  }
                >
                  Apply changes
                </button>
                <button
                  onClick={() =>
                    void proposalAction(currentProposal, "reject").then(
                      (ok) => ok && setModal(""),
                    )
                  }
                >
                  Reject
                </button>
              </>
            ) : currentProposal.status === "applied" ? (
              <button
                disabled={sourceLocked}
                onClick={() =>
                  void proposalAction(currentProposal, "undo").then(
                    (ok) => ok && setModal(""),
                  )
                }
              >
                Undo changes
              </button>
            ) : (
              <button onClick={() => setModal("")}>Close review</button>
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
      {modal === "format-source" &&
        formatTarget &&
        project?.id === formatTarget.projectId && (
          <FormatPreviewDialog
            key={formatTarget.projectId + formatTarget.path}
            target={formatTarget}
            locked={sourceLocked}
            onApply={applyFormatting}
            onClose={() => {
              setModal("");
              setFormatTarget(null);
            }}
          />
        )}
      {modal === "disk-discovery" && project && (
        <DiskDiscovery
          key={project.id}
          projectId={project.id}
          locked={sourceLocked}
          onImported={async (result) => {
            if (projectRef.current?.id === result.project.id)
              await refreshProject();
          }}
          onReview={reviewDiscoveredPath}
          onClose={() => {
            setModal("");
            void refreshProject().catch(report);
          }}
        />
      )}
      {project && quickNavigation && (
        <QuickNavigation
          key={project.id + quickNavigation}
          mode={quickNavigation}
          projectName={project.name}
          readOnly={sourceLocked}
          items={
            quickNavigation === "files"
              ? fileNavigationItems(project.files, tabs, activePath)
              : navigationCommands
          }
          onClose={() => setQuickNavigation(null)}
          onSelect={
            quickNavigation === "commands"
              ? selectNavigationCommand
              : async (path, current) => {
                  const id = project.id;
                  const result = await openFile(path, project, {
                    allowed: () => current() && projectRef.current?.id === id,
                    onError: (e) => {
                      throw e;
                    },
                  });
                  if (result === undefined) return false;
                  requestAnimationFrame(() => currentEditor()?.focus());
                  return true;
                }
          }
        />
      )}
      {modal === "help" && (
        <Modal title="A little space to think" onClose={() => setModal("")}>
          <p className="modal-intro">
            Leaf is your local LaTeX workspace. Start with your own project ZIP,
            or explore this sample.
          </p>
          <div className="help-shortcuts">
            <div>
              <span>Open a project file</span>
              <kbd>⌘/Ctrl P</kbd>
            </div>
            <div>
              <span>Command palette</span>
              <kbd>⌘/Ctrl ⇧ P</kbd>
            </div>
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
              <span>Matching environment (Code)</span>
              <kbd>{"⌘/Ctrl ⇧ \\"}</kbd>
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
