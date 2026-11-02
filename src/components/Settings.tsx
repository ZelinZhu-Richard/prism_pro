import { useId, useState } from "react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { api } from "../api";
import { Modal } from "./Modal";
import { providerNames } from "../../shared/catalog";
import { connectedModels } from "../../shared/model-options";
import type { Provider, ProviderState } from "../../shared/types";
import { isCliProvider, apiProviders, cliProviders } from "../../shared/types";
import { EditorSettings } from "./EditorSettings";
import type { EditorPreferences } from "../../shared/editor-preferences";
export type SettingsSection = "appearance" | "editor" | "connections";
const sections = ["appearance", "editor", "connections"] as const;
export function Settings({
  settings,
  onClose,
  onRefresh,
  onTheme,
  initialSection = "appearance",
  onEditorSaved,
}: {
  settings: any;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTheme: (theme: string) => void;
  initialSection?: SettingsSection;
  onEditorSaved: (preferences: EditorPreferences) => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [editorSaving, setEditorSaving] = useState(false);
  const id = useId();
  const [provider, setProvider] = useState<Provider>("openai"),
    [key, setKey] = useState(""),
    [endpoint, setEndpoint] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const state = settings?.providers?.[provider] as ProviderState | undefined;
  const local = isCliProvider(provider);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      if (key || (provider === "qwen" && endpoint !== null)) {
        await api("/providers/" + provider + "/key", "PUT", {
          ...(key ? { key } : {}),
          ...(provider === "qwen" && endpoint !== null
            ? { baseUrl: endpoint }
            : {}),
        });
        setKey("");
      }
      const result = await api<ProviderState>(
        "/providers/" + provider + "/verify",
        "POST",
        {},
      );
      await onRefresh();
      setMessage(
        local
          ? result.configured
            ? result.modelError ||
              (result.modelSource === "aliases"
                ? "Connected. Choose Sonnet, Opus, or Haiku in the model picker. Your plan controls access."
                : `Connected. ${result.models.length} Codex models loaded into the picker.`)
            : result.error || "Sign in from your terminal, then check again."
          : "Connected. Available models have been verified.",
      );
    } catch (e) {
      setMessage((e as Error).message);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Make Leaf yours"
      onClose={onClose}
      className="settings-dialog"
      dismissible={!editorSaving && !busy}
    >
      <p className="modal-intro">Your workspace. Your models. Your choice.</p>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={(e) => {
          const at = sections.indexOf(section);
          const next =
            e.key === "ArrowRight"
              ? (at + 1) % sections.length
              : e.key === "ArrowLeft"
                ? (at + sections.length - 1) % sections.length
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? sections.length - 1
                    : -1;
          if (next < 0) return;
          e.preventDefault();
          setSection(sections[next]);
          e.currentTarget
            .querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [next]?.focus();
        }}
      >
        {sections.map((name) => (
          <button
            key={name}
            id={`${id}-${name}`}
            role="tab"
            disabled={editorSaving || busy}
            aria-selected={section === name}
            aria-controls={`${id}-${name}-panel`}
            tabIndex={section === name ? 0 : -1}
            onClick={() => setSection(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-appearance-panel`}
        aria-labelledby={`${id}-appearance`}
        hidden={section !== "appearance"}
        className="settings-section"
      >
        <h3>Appearance</h3>
        <div className="segmented">
          {["dark", "light", "system"].map((t) => (
            <button
              key={t}
              className={settings?.preferences?.theme === t ? "selected" : ""}
              aria-pressed={settings?.preferences?.theme === t}
              onClick={() => onTheme(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${id}-editor-panel`}
        aria-labelledby={`${id}-editor`}
        hidden={section !== "editor"}
      >
        <EditorSettings
          value={settings?.preferences?.editor}
          onSaved={onEditorSaved}
          onBusy={setEditorSaving}
        />
      </div>
      <div
        role="tabpanel"
        id={`${id}-connections-panel`}
        aria-labelledby={`${id}-connections`}
        hidden={section !== "connections"}
        className="settings-section"
      >
        <h3>AI providers</h3>
        {(
          [
            { label: "API keys", items: apiProviders },
            { label: "Local CLI login", items: cliProviders },
          ] as const
        ).map((group) => (
          <div key={group.label}>
            <p className="field-label">{group.label}</p>
            <div
              className="provider-tabs"
              role="group"
              aria-label={group.label}
            >
              {group.items.map((p) => (
                <button
                  key={p}
                  disabled={busy}
                  aria-pressed={provider === p}
                  onClick={() => {
                    setProvider(p);
                    setKey("");
                    setMessage("");
                    setEndpoint(null);
                  }}
                  className={provider === p ? "active" : ""}
                >
                  {providerNames[p]}
                  {settings?.providers?.[p]?.configured && (
                    <span className="status-dot" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {local ? (
          <div className="cli-settings">
            <p className="field-help">
              Use {providerNames[provider]} installed on this computer with your
              existing subscription login. No API key is needed here.
            </p>
            <div className="key-input">
              <Terminal size={16} />
              <code>
                {provider === "codex" ? "codex login" : "claude auth login"}
              </code>
            </div>
            <p className="field-help">
              Already signed in? Check your login below, then choose{" "}
              {providerNames[provider]} in the editor’s assistant. Runs use your
              subscription limits. Review Edits shows a diff; Manual Type types
              document edits while explanations stay in chat.
            </p>
            {state?.version && (
              <p className="field-help">Installed version {state.version}</p>
            )}
          </div>
        ) : (
          <>
            <label className="field-label" htmlFor="api-key">
              {providerNames[provider]} API key
            </label>
            <div className="key-input">
              <KeyRound size={16} />
              <input
                id="api-key"
                disabled={busy}
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                placeholder={
                  state?.configured
                    ? "A key is connected — enter to replace"
                    : "Paste your API key"
                }
              />
            </div>
            <p className="field-help">
              Keys entered here stay in server memory until Leaf restarts. Save
              a persistent key in your terminal with{" "}
              <code>npm run keys -- set {provider}</code>.
            </p>
            {provider === "qwen" && (
              <>
                <label className="field-label" htmlFor="qwen-endpoint">
                  Alibaba Cloud endpoint
                </label>
                <input
                  id="qwen-endpoint"
                  className="endpoint-input"
                  type="url"
                  disabled={busy}
                  value={endpoint ?? state?.baseUrl ?? ""}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://your-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
                />
                <p className="field-help">
                  Use the endpoint from the same region as your API key. Manual
                  Type requires an explicit model choice until regional pricing
                  is verified.
                </p>
              </>
            )}
          </>
        )}
        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || (!local && !key && !state?.configured)}
            onClick={() => void save()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ShieldCheck size={15} />
            )}{" "}
            {busy
              ? "Checking…"
              : local
                ? "Check CLI login"
                : key
                  ? "Connect & verify"
                  : "Verify access"}
          </button>
          {state?.source === "session" && (
            <button
              className="subtle"
              disabled={busy}
              onClick={async () => {
                await api("/providers/" + provider + "/key", "PUT", {
                  key: "",
                });
                await onRefresh();
              }}
            >
              Clear session key
            </button>
          )}
        </div>
        {message && (
          <p className="inline-message" role="status">
            {message}
          </p>
        )}
        {!message && state?.error && (
          <p className="inline-message" role="status">
            {state.error}
          </p>
        )}
        {!message && state?.modelError && (
          <p className="inline-message" role="status">
            {state.modelError}
          </p>
        )}
        {state?.verifiedAt && (
          <div className="verified-note">
            <Check size={14} />{" "}
            {local
              ? "Saved CLI login found"
              : `${state.models.length} models available`}{" "}
            · verified{" "}
            {new Date(state.verifiedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        <div className="model-table">
          {connectedModels(settings?.providers)
            .filter((m) => m.provider === provider)
            .map((m) => (
              <div key={m.id}>
                <span>{m.label}</span>
                <small>
                  {local
                    ? state?.modelSource === "aliases"
                      ? "CLI alias · plan access applies"
                      : "Listed by Codex CLI"
                    : state?.models.includes(m.id)
                      ? "Available"
                      : "Unverified"}
                </small>
              </div>
            ))}
        </div>
        <p className="field-help">
          All connected API and CLI models appear together in the editor’s model
          picker. Refresh access to update the list.
        </p>
      </div>
      <div className="settings-note" hidden={section !== "connections"}>
        <ShieldCheck size={17} />
        <p>
          Documents are stored locally. AI requests send the displayed project
          context to your selected provider.
        </p>
      </div>
    </Modal>
  );
}
