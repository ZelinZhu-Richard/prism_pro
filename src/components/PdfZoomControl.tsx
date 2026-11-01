import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { parsePdfZoom, type PdfZoom } from "../pdf-layout";

export function PdfZoomControl({
  zoom,
  percent,
  disabled,
  onChange,
}: {
  zoom: PdfZoom;
  percent: number;
  disabled: boolean;
  onChange: (zoom: PdfZoom) => void;
}) {
  const root = useRef<HTMLDetailsElement>(null),
    trigger = useRef<HTMLElement>(null);
  const [custom, setCustom] = useState("100"),
    [error, setError] = useState("");
  const [popoverHeight, setPopoverHeight] = useState(320);
  function measure() {
    const toolbar = root.current?.closest(".pdf-toolbar"),
      viewer = root.current?.closest(".pdf-viewer");
    if (toolbar && viewer)
      setPopoverHeight(
        Math.max(
          40,
          viewer.getBoundingClientRect().bottom -
            toolbar.getBoundingClientRect().bottom -
            10,
        ),
      );
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    const observer = new ResizeObserver(() => {
      if (root.current?.open) measure();
    });
    const viewer = root.current?.closest(".pdf-viewer"),
      toolbar = root.current?.closest(".pdf-toolbar");
    if (viewer) observer.observe(viewer);
    if (toolbar) observer.observe(toolbar);
    return () => {
      document.removeEventListener("pointerdown", outside);
      observer.disconnect();
    };
  }, []);
  function choose(value: PdfZoom) {
    onChange(value);
    root.current!.open = false;
    trigger.current?.focus();
  }
  return (
    <details
      className="pdf-zoom-control"
      ref={root}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setCustom(String(percent));
          setError("");
          measure();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          root.current!.open = false;
          trigger.current?.focus();
        }
      }}
    >
      <summary
        ref={trigger}
        aria-label={`PDF zoom: ${zoom === "fit-width" ? "fit width, " : zoom === "fit-height" ? "fit height, " : ""}${percent}%`}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        {zoom === "fit-width"
          ? "Fit width"
          : zoom === "fit-height"
            ? "Fit height"
            : `${percent}%`}
        <ChevronDown size={12} />
      </summary>
      <div
        className="pdf-zoom-popover"
        style={{ maxHeight: popoverHeight }}
        role="group"
        aria-label="PDF zoom options"
      >
        {(["fit-width", "fit-height", 0.5, 0.75, 1, 1.5, 2, 4] as const).map(
          (value) => (
            <button type="button" key={value} onClick={() => choose(value)}>
              <span>
                {value === "fit-width"
                  ? "Fit to width"
                  : value === "fit-height"
                    ? "Fit to height"
                    : `${value * 100}%`}
              </span>
              {zoom === value && <Check size={14} />}
            </button>
          ),
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = parsePdfZoom(custom);
            if (value === null) setError("Enter 10–400%.");
            else choose(value);
          }}
        >
          <label>
            Custom zoom
            <input
              aria-label="Custom PDF zoom percentage"
              value={custom}
              onChange={(event) => {
                setCustom(event.target.value);
                setError("");
              }}
              inputMode="decimal"
              maxLength={12}
            />
          </label>
          <button type="submit">Set</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
