import type { AiScope, Diagnostic, EditMode } from "../shared/types";
import { DRAFT_LIMIT } from "../shared/chat-drafts";
export interface DiagnosticFix {
  projectId: string;
  buildId: string;
  target: string;
  line?: number;
  diagnostic: Diagnostic;
}
export interface DiagnosticContext {
  projectId: string;
  conversationId: string;
  scope: AiScope;
  mode: EditMode;
  prompt: string;
  navigation: number;
  path?: string;
  content?: string;
  locked: boolean;
  ready: boolean;
}
export interface DiagnosticActionView {
  phase: "idle" | "review" | "preparing" | "error";
  request?: DiagnosticFix;
  conversationId?: string;
  existing: string;
  proposed: string;
  reviewing: boolean;
  error?: string;
}
export interface DiagnosticOpened {
  path: string;
  valid: () => boolean;
}
interface Ports {
  context: () => DiagnosticContext;
  flush: () => Promise<void>;
  open: (
    request: DiagnosticFix,
    initial: DiagnosticContext,
    current: () => boolean,
  ) => Promise<DiagnosticOpened>;
  commit: (
    request: DiagnosticFix,
    prompt: string,
    opened: DiagnosticOpened,
  ) => void;
  notify: (view: DiagnosticActionView) => void;
}
export function diagnosticPrompt(request: DiagnosticFix) {
  const d = request.diagnostic;
  return `Help fix this LaTeX ${d.severity} in ${request.target}${request.line ? ` at line ${request.line}` : ""}: ${d.message}`;
}
function sameContext(
  a: DiagnosticContext,
  b: DiagnosticContext,
  editor: boolean,
) {
  return (
    a.projectId === b.projectId &&
    a.conversationId === b.conversationId &&
    a.scope === b.scope &&
    a.mode === b.mode &&
    a.prompt === b.prompt &&
    b.ready &&
    !b.locked &&
    (!editor ||
      (a.navigation === b.navigation &&
        a.path === b.path &&
        a.content === b.content))
  );
}
/** Prepare an explicit local request. No provider or source-write port exists. */
export class DiagnosticActionController {
  view: DiagnosticActionView = {
    phase: "idle",
    existing: "",
    proposed: "",
    reviewing: false,
  };
  private serial = 0;
  private initial?: DiagnosticContext;
  constructor(private ports: Ports) {}
  private emit(change: Partial<DiagnosticActionView>) {
    this.view = { ...this.view, ...change };
    this.ports.notify(this.view);
  }
  cancel() {
    this.serial++;
    this.initial = undefined;
    this.view = { phase: "idle", existing: "", proposed: "", reviewing: false };
    this.ports.notify(this.view);
  }
  dispose() {
    this.serial++;
    this.initial = undefined;
  }
  dismissOtherConversation() {
    if (
      this.view.request &&
      (this.view.request.projectId !== this.ports.context().projectId ||
        this.view.conversationId !== this.ports.context().conversationId)
    )
      this.cancel();
  }
  begin(request: DiagnosticFix) {
    if (this.view.phase === "preparing") return;
    this.cancel();
    const context = this.ports.context();
    if (
      context.projectId !== request.projectId ||
      context.locked ||
      !context.ready
    )
      return;
    this.initial = { ...context };
    const proposed = diagnosticPrompt(request);
    this.emit({
      request: { ...request, diagnostic: { ...request.diagnostic } },
      conversationId: context.conversationId,
      existing: context.prompt,
      proposed,
      reviewing: !!context.prompt && context.prompt !== proposed,
      phase: context.prompt && context.prompt !== proposed ? "review" : "idle",
    });
    if (!this.view.reviewing) void this.choose("replace");
  }
  retry() {
    const request = this.view.request;
    if (request) this.begin(request);
  }
  async choose(choice: "replace" | "append") {
    if (!this.initial || !this.view.request || this.view.phase === "preparing")
      return;
    const initial = this.initial,
      request = this.view.request,
      serial = ++this.serial;
    const current = () =>
      serial === this.serial &&
      sameContext(initial, this.ports.context(), false);
    const text =
      choice === "append" && initial.prompt
        ? initial.prompt + "\n\n" + this.view.proposed
        : this.view.proposed;
    try {
      if (!sameContext(initial, this.ports.context(), true))
        throw new Error(
          "The draft or editor changed. Prepare this fix again to review the current context.",
        );
      if (text.length > DRAFT_LIMIT)
        throw new Error(
          "The request exceeds 16,000 characters. Shorten the draft or use a shorter diagnostic request.",
        );
      this.emit({ phase: "preparing", error: undefined });
      await this.ports.flush();
      if (serial !== this.serial) return;
      if (!sameContext(initial, this.ports.context(), true))
        throw new Error("The draft or editor changed. Prepare this fix again.");
      const opened = await this.ports.open(request, initial, current);
      if (serial !== this.serial) return;
      if (!current() || !opened.valid() || opened.path !== request.target)
        throw new Error(
          "The source changed before the request was ready. Prepare this fix again.",
        );
      this.ports.commit(request, text, opened);
      this.cancel();
    } catch (e) {
      if (serial !== this.serial) return;
      const now = this.ports.context();
      if (
        now.projectId !== initial.projectId ||
        now.conversationId !== initial.conversationId
      ) {
        this.cancel();
        return;
      }
      this.emit({
        phase: "error",
        error:
          e instanceof Error
            ? e.message
            : "The fix request could not be prepared. Your prompt is unchanged.",
      });
    }
  }
}
