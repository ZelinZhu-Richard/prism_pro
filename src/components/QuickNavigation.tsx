import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, Search, Terminal } from "lucide-react";
import { Modal } from "./Modal";
import { filterNavigation, type NavigationItem } from "../quick-navigation";
import "./quick-navigation.css";

export function QuickNavigation({
  mode,
  projectName,
  items,
  readOnly,
  onClose,
  onSelect,
}: {
  mode: "files" | "commands";
  projectName: string;
  items: NavigationItem[];
  readOnly: boolean;
  onClose: () => void;
  onSelect: (
    id: string,
    current: () => boolean,
  ) => Promise<boolean | void> | boolean | void;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null),
    selecting = useRef(false),
    mounted = useRef(true),
    id = useId();
  const matches = useMemo(() => filterNavigation(items, query), [items, query]),
    rows = matches.slice(0, 100),
    active = Math.min(index, Math.max(0, rows.length - 1));
  useEffect(() => {
    mounted.current = true;
    input.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  function close() {
    mounted.current = false;
    onClose();
  }
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, query]);
  async function select(item: NavigationItem) {
    if (item.disabled || selecting.current) return;
    selecting.current = true;
    setWorking(true);
    setError("");
    try {
      const result = await onSelect(item.id, () => mounted.current);
      if (!mounted.current) return;
      if (result === true) close();
      else if (result === false)
        if (mounted.current)
          setError(
            "That item is no longer available. Choose another result or close this window.",
          );
    } catch (e) {
      setError((e as Error).message || "Could not open this item. Try again.");
    } finally {
      selecting.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  return (
    <Modal
      title={mode === "files" ? "Open a file" : "Command palette"}
      onClose={close}
      className="quick-navigation"
    >
      <p className="quick-navigation-context">
        {projectName}
        {mode === "files" && readOnly
          ? " · Source is read-only while an operation is active"
          : ""}
      </p>
      <label className="field-label" htmlFor={id + "-query"}>
        {mode === "files" ? "Find a project file" : "Find a command"}
      </label>
      <div className="quick-navigation-search">
        <Search size={16} aria-hidden="true" />
        <input
          id={id + "-query"}
          ref={input}
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={id + "-results"}
          aria-activedescendant={rows[active] ? id + "-" + active : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          readOnly={working}
          placeholder={
            mode === "files"
              ? "Search names or paths…"
              : "Save, compile, search…"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || working) return;
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.altKey
            ) {
              // Home/End keep native text-caret behavior; use arrows for results.
              if (e.key === "Home" || e.key === "End") return;
              e.preventDefault();
              setIndex(
                rows.length
                  ? (active + (e.key === "ArrowDown" ? 1 : rows.length - 1)) %
                      rows.length
                  : 0,
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (rows[active]) void select(rows[active]);
            }
          }}
        />
      </div>
      <div
        className="quick-navigation-summary"
        role="status"
        aria-live="polite"
      >
        {working
          ? "Opening… Esc cancels navigation."
          : matches.length
            ? `${matches.length} ${mode === "files" ? (matches.length === 1 ? "file" : "files") : matches.length === 1 ? "command" : "commands"}${matches.length > rows.length ? " · showing first 100; refine your search" : ""}`
            : "No matches. Try a different name or path."}
      </div>
      <div
        id={id + "-results"}
        className="quick-navigation-results"
        role="listbox"
        tabIndex={-1}
        aria-label={
          mode === "files" ? "Project file results" : "Command results"
        }
        aria-busy={working}
        ref={list}
      >
        {rows.map((item, i) => (
          <div
            key={item.id}
            id={id + "-" + i}
            role="option"
            aria-selected={i === active}
            aria-disabled={!!item.disabled || working}
            className={i === active ? "selected" : ""}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void select(item)}
          >
            {mode === "files" ? (
              <FileText size={16} aria-hidden="true" />
            ) : (
              <Terminal size={16} aria-hidden="true" />
            )}
            <div>
              <strong>{item.label}</strong>
              <span>{item.disabled || item.detail}</span>
            </div>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="quick-navigation-error">
          {error}
        </p>
      )}
      <p className="quick-navigation-hint">
        ↑ ↓ to choose · Enter to open · Esc to close
      </p>
    </Modal>
  );
}
