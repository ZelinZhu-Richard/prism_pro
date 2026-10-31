import { useState } from "react";
import { Check, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Modal } from "./Modal";
import { providerNames, models } from "../../shared/catalog";
import type { Provider, ProviderState } from "../../shared/types";
export function Settings({
  settings,
  onClose,
  onRefresh,
  onTheme,
}: {
  settings: any;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTheme: (theme: string) => void;
}) {
  const [provider, setProvider] = useState<Provider>("openai"),
    [key, setKey] = useState(""),
    [endpoint, setEndpoint] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const state = settings?.providers?.[provider] as ProviderState | undefined;
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
      await api("/providers/" + provider + "/verify", "POST", {});
      await onRefresh();
      setMessage("Connected. Available models have been verified.");
    } catch (e) {
      setMessage((e as Error).message);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Make Prism yours" onClose={onClose}>
      <p className="modal-intro">Your workspace. Your models. Your keys.</p>
      <div className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented">
          {["dark", "light", "system"].map((t) => (
            <button
              key={t}
              className={settings?.preferences?.theme === t ? "selected" : ""}
              onClick={() => onTheme(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <h3>AI providers</h3>
        <div className="provider-tabs">
          {(Object.keys(providerNames) as Provider[]).map((p) => (
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
          Keys entered here stay in server memory until Prism restarts. Save a
          persistent key in your terminal with{" "}
          <code>pnpm keys set {provider}</code>.
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
              Use the endpoint from the same region as your API key. Manual Type
              requires an explicit model choice until regional pricing is
              verified.
            </p>
          </>
        )}
        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || (!key && !state?.configured)}
            onClick={() => void save()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ShieldCheck size={15} />
            )}{" "}
            {busy ? "Verifying…" : key ? "Connect & verify" : "Verify access"}
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
        {state?.verifiedAt && (
          <div className="verified-note">
            <Check size={14} /> {state.models.length} models available ·
            verified{" "}
            {new Date(state.verifiedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        <div className="model-table">
          {models
            .filter((m) => m.provider === provider)
            .map((m) => (
              <div key={m.id}>
                <span>{m.label}</span>
                <small>
                  {state?.models.includes(m.id) ? "Available" : "Unverified"}
                </small>
              </div>
            ))}
        </div>
      </div>
      <div className="settings-note">
        <ShieldCheck size={17} />
        <p>
          Documents are stored locally. AI requests send the displayed project
          context to your selected provider.
        </p>
      </div>
    </Modal>
  );
}
