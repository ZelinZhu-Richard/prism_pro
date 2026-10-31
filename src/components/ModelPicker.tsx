import { RefreshCw, Settings2 } from "lucide-react";
import { modelKey, type ModelChoice } from "../../shared/model-options";
import type { Provider } from "../../shared/types";

export function ModelPicker({
  choices,
  provider,
  model,
  disabled,
  refreshing,
  onChoose,
  onRefresh,
  onConnect,
}: {
  choices: ModelChoice[];
  provider: Provider;
  model: string;
  disabled: boolean;
  refreshing: boolean;
  onChoose: (choice: ModelChoice) => void;
  onRefresh: () => void;
  onConnect: () => void;
}) {
  const value = modelKey(provider, model);
  const valid = choices.some(
    (choice) => modelKey(choice.provider, choice.id) === value,
  );
  return (
    <div className="model-selects connected-models">
      <select
        aria-label="AI model and connection"
        value={valid ? value : ""}
        disabled={disabled || refreshing}
        onChange={(e) => {
          const choice = choices.find(
            (item) => modelKey(item.provider, item.id) === e.target.value,
          );
          if (choice) onChoose(choice);
        }}
      >
        {!valid && (
          <option value="">
            {refreshing
              ? "Loading models…"
              : choices.length
                ? "Choose a model"
                : "Connect or refresh models"}
          </option>
        )}
        {[...new Set(choices.map((choice) => choice.connection))].map(
          (connection) => (
            <optgroup key={connection} label={connection}>
              {choices
                .filter((choice) => choice.connection === connection)
                .map((choice) => (
                  <option
                    key={modelKey(choice.provider, choice.id)}
                    value={modelKey(choice.provider, choice.id)}
                  >
                    {choice.label} · {connection}
                  </option>
                ))}
            </optgroup>
          ),
        )}
      </select>
      <button
        className="icon-button"
        aria-label="Refresh connected models"
        title="Refresh connected models"
        disabled={disabled || refreshing}
        onClick={onRefresh}
      >
        <RefreshCw size={13} className={refreshing ? "spin" : ""} />
      </button>
      <button
        className="icon-button"
        aria-label="Manage AI connections"
        title="Manage AI connections"
        disabled={disabled}
        onClick={onConnect}
      >
        <Settings2 size={13} />
      </button>
    </div>
  );
}
