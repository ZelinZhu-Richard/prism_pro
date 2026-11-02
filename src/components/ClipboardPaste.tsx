import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { UploadFiles } from "./UploadFiles";
import { api } from "../api";
import { originalClipboard, type ClipboardPacket } from "../editor-clipboard";
import { htmlToLatex } from "../rich-clipboard";
import { clipboardPresentation, clipboardHasSetup } from "../visual-clipboard";
import { escapeLatexText, figureSource } from "../source-actions";
import type { Project } from "../../shared/types";
import type { BatchResult } from "../../shared/file-batches";

export function ClipboardPaste({
  packet,
  project,
  path,
  locked,
  onApply,
  onClose,
  onUploaded,
  onBusy,
  prepare,
}: {
  packet: ClipboardPacket;
  project: Project;
  path: string;
  locked: boolean;
  onApply: (latex: string, block: boolean) => Promise<void>;
  onClose: () => void;
  onUploaded: (result: BatchResult) => Promise<void>;
  onBusy: (value: boolean) => void;
  prepare: () => Promise<Project>;
}) {
  const [kind, setKind] = useState<"format" | "plain" | "source">(
      packet.original
        ? "source"
        : packet.visual && packet.html
          ? "format"
          : "plain",
    ),
    [original, setOriginal] = useState<string | null>(
      packet.original?.latex ?? null,
    ),
    [loading, setLoading] = useState(
      !!packet.id && !packet.original && !packet.lookupError,
    ),
    [lookupError, setLookupError] = useState(packet.lookupError ?? ""),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [applying, setApplying] = useState(false);
  useEffect(() => {
    if (!packet.id || packet.original || packet.lookupError) return;
    let stale = false;
    void originalClipboard(packet.id)
      .then((value) => {
        if (!stale) {
          setOriginal(value.latex);
          setKind("source");
        }
      })
      .catch((e) => {
        if (!stale) setLookupError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [packet.id]);
  const rich = useMemo(() => {
    try {
      return {
        value: packet.html ? htmlToLatex(packet.html) : null,
        error: "",
      };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [packet.html]);
  const plain = packet.plain || rich.value?.plain || "";
  const latex =
    kind === "source"
      ? (original ?? (packet.rawLatex || plain))
      : kind === "format"
        ? (rich.value?.latex ?? "")
        : packet.visual
          ? escapeLatexText(plain)
          : plain;
  const presentation = useMemo(() => clipboardPresentation(latex), [latex]);
  const hasSetup =
    packet.visual && kind === "source" && clipboardHasSetup(latex);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorElement.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => setCopied(false), [latex]);
  const [asImage, setAsImage] = useState(
    !!packet.image &&
      (!packet.html ||
        (!!rich.value &&
          rich.value.images <= 1 &&
          !rich.value.hasText &&
          !rich.value.tables)),
  );
  if (asImage)
    return (
      <ClipboardImage
        packet={packet}
        project={project}
        path={path}
        locked={locked}
        onApply={onApply}
        onClose={onClose}
        onUploaded={onUploaded}
        onBusy={onBusy}
        prepare={prepare}
        onBack={
          packet.html || packet.plain ? () => setAsImage(false) : undefined
        }
      />
    );
  async function apply() {
    setApplying(true);
    setError("");
    try {
      await onApply(
        latex,
        kind === "format"
          ? !!rich.value?.block
          : /\\(?:begin\{|(?:sub)*section\*?\{)|\n\s*\n/.test(latex),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }
  return (
    <Modal
      title="Paste into document"
      wide
      className="insertion-modal clipboard-modal"
      onClose={onClose}
      dismissible={!applying}
    >
      <div className="clipboard-content">
        <p className="modal-intro">
          Review the clipboard for <strong>{path}</strong>. Source and history
          change only when you paste.
        </p>
        <ClipboardTarget packet={packet} />
        {hasSetup && (
          <p className="notice">
            This copy includes document setup. Switch to Code view or Document
            setup to paste the original LaTeX, or choose plain text here.
          </p>
        )}
        {loading && <p role="status">Finding the original Leaf copy…</p>}
        {lookupError && (
          <p className="notice">
            {lookupError}{" "}
            {packet.rawLatex
              ? "Review the generated text, or explicitly choose clipboard LaTeX."
              : "Choose formatted or plain text, or copy again from the original Leaf document."}
          </p>
        )}
        {packet.image && (
          <button
            className="subtle"
            disabled={locked || applying}
            onClick={() => setAsImage(true)}
          >
            Use clipboard image instead
          </button>
        )}
        <fieldset
          className="clipboard-formats"
          disabled={locked || applying || loading}
        >
          <legend>Paste format</legend>
          {packet.html && (
            <label>
              <input
                type="radio"
                checked={kind === "format"}
                onChange={() => setKind("format")}
                disabled={!rich.value}
              />
              Keep formatting
            </label>
          )}
          <label>
            <input
              type="radio"
              checked={kind === "plain"}
              onChange={() => setKind("plain")}
            />
            Plain text
          </label>
          {(original !== null || packet.rawLatex) && (
            <label>
              <input
                type="radio"
                checked={kind === "source"}
                onChange={() => setKind("source")}
              />
              {original !== null ? "Original Leaf LaTeX" : "Clipboard LaTeX"}
            </label>
          )}
        </fieldset>
        {rich.error && (
          <p className="danger-text" role="alert">
            {rich.error} Choose plain text or paste a smaller passage.
          </p>
        )}
        {kind === "format" && !!rich.value?.warnings.length && (
          <ul className="clipboard-notices">
            {rich.value.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {kind === "format" && !!rich.value?.packages.length && (
          <p className="field-help">
            Required preamble packages: {rich.value.packages.join(", ")}.
            Packages are not added or installed automatically.
          </p>
        )}
        <div
          className="clipboard-preview"
          tabIndex={0}
          role="region"
          aria-label="Pasted content preview"
          dangerouslySetInnerHTML={{ __html: presentation.html }}
        />
        <details className="insertion-preview">
          <summary>Review pasted LaTeX</summary>
          <pre tabIndex={0} aria-label="Pasted LaTeX source">
            {latex}
          </pre>
        </details>
        {error && (
          <p ref={errorElement} className="danger-text" role="alert">
            {error}
          </p>
        )}
        {locked && (
          <p className="notice">
            Read-only while the assistant or a file operation owns the source.
          </p>
        )}
        <div className="clipboard-footer">
          <div className="clipboard-recovery">
            <span>One paste · one Undo</span>
            <button
              disabled={!latex || loading}
              onClick={() =>
                void navigator.clipboard
                  .writeText(latex)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      "Clipboard access failed. Copy the complete text from Review pasted LaTeX before closing.",
                    ),
                  )
              }
            >
              {copied ? "LaTeX copied" : "Copy pasted LaTeX"}
            </button>
          </div>
          <button
            className="primary"
            disabled={
              locked ||
              hasSetup ||
              applying ||
              loading ||
              !latex ||
              (kind === "format" && !rich.value)
            }
            onClick={() => void apply()}
          >
            {applying ? "Pasting…" : "Paste into document"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ClipboardImage({
  packet,
  project,
  path,
  locked,
  onApply,
  onClose,
  onUploaded,
  onBusy,
  prepare,
  onBack,
}: Parameters<typeof ClipboardPaste>[0] & { onBack?: () => void }) {
  const file = packet.image!,
    [name, setName] = useState(
      file.type === "image/jpeg" ? "clipboard.jpg" : "clipboard.png",
    ),
    [imagePath, setImagePath] = useState(""),
    [width, setWidth] = useState(80),
    [caption, setCaption] = useState(""),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [upload, setUpload] = useState<File[] | null>(null),
    [applying, setApplying] = useState(false);
  const [url, setUrl] = useState("");
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorElement.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    const local = URL.createObjectURL(file);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);
  let source = "",
    issue = "";
  try {
    source = figureSource({
      path: imagePath,
      width: width / 100,
      caption,
      label,
      placement: "htbp",
    });
  } catch (e) {
    issue = (e as Error).message;
  }
  function reviewUpload() {
    if (file.size > 50 * 1024 * 1024) {
      setError("Paste an image smaller than 50 MB.");
      return;
    }
    const extension = file.type === "image/jpeg" ? /\.jpe?g$/i : /\.png$/i;
    if (
      !name ||
      /[\\/{}%\x00-\x1f]/.test(name) ||
      name.startsWith(".") ||
      !extension.test(name)
    ) {
      setError("Use a plain filename with the original PNG or JPEG extension.");
      return;
    }
    setError("");
    setUpload([new File([file], name, { type: file.type })]);
  }
  return (
    <>
      <Modal
        title="Paste image"
        wide
        className="insertion-modal clipboard-modal"
        onClose={onClose}
        dismissible={!applying && !upload}
      >
        <div className="clipboard-content">
          <p className="modal-intro">
            Save the clipboard image to this project, then insert a figure in{" "}
            <strong>{path}</strong>.
          </p>
          <ClipboardTarget packet={packet} />
          {locked && (
            <p className="notice">
              Read-only while the assistant or a file operation owns the source.
            </p>
          )}
          {onBack && (
            <button
              className="subtle"
              disabled={locked || applying || !!upload}
              onClick={onBack}
            >
              Use clipboard text instead
            </button>
          )}
          {url && (
            <img
              className="clipboard-image-preview"
              src={
                imagePath
                  ? `/api/projects/${project.id}/raw?path=${encodeURIComponent(imagePath)}`
                  : url
              }
              alt="Clipboard image preview"
            />
          )}
          <fieldset
            className="clipboard-image-fields"
            disabled={locked || applying || !!upload}
          >
            {!imagePath ? (
              <>
                <label>
                  Image filename
                  <input
                    value={name}
                    maxLength={150}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button onClick={reviewUpload}>Review image upload</button>
              </>
            ) : (
              <p>
                Saved as <strong>{imagePath}</strong>. Cancelling leaves the
                uploaded asset available; Files offers upload Undo.
              </p>
            )}
            <label>
              Width (% of line)
              <input
                type="number"
                min={5}
                max={100}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <label>
              Caption
              <input
                value={caption}
                maxLength={2000}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            <label>
              Reference label
              <input
                value={label}
                maxLength={120}
                placeholder="fig:example"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="field-help">
            The root document needs <code>\usepackage&#123;graphicx&#125;</code>
            . Destination and replacement consent are reviewed before upload.
          </p>
          {(error || (imagePath && issue)) && (
            <p ref={errorElement} role="alert" className="danger-text">
              {error || (imagePath && issue)}
            </p>
          )}
          <details className="insertion-preview">
            <summary>Review figure LaTeX</summary>
            <pre>{source}</pre>
          </details>
          <div className="clipboard-footer">
            <span>Source insertion is one Undo</span>
            <button
              className="primary"
              disabled={locked || applying || !imagePath || !!issue}
              onClick={() => {
                setApplying(true);
                setError("");
                void onApply(source, true)
                  .catch((e) => setError(e.message))
                  .finally(() => setApplying(false));
              }}
            >
              Insert pasted figure
            </button>
          </div>
        </div>
      </Modal>
      {upload && (
        <UploadFiles
          project={project}
          initialDestination=""
          initialFiles={upload}
          prepare={prepare}
          onBusy={onBusy}
          onClose={() => setUpload(null)}
          onChanged={async (result) => {
            await onUploaded(result);
            setImagePath(result.changedFiles[0] ?? "");
          }}
        />
      )}
    </>
  );
}

function ClipboardTarget({ packet }: { packet: ClipboardPacket }) {
  const line = packet.source.slice(0, packet.from).split("\n").length;
  const selected = packet.source.slice(packet.from, packet.to);
  return (
    <div className="clipboard-target">
      <p>
        {selected ? "Replace selected text" : "Insert at cursor"} · line {line}
      </p>
      {selected && (
        <details className="insertion-preview">
          <summary>Selected text to replace</summary>
          <pre tabIndex={0}>{selected.slice(0, 4000)}</pre>
          {selected.length > 4000 && (
            <p className="field-help">
              Showing the first 4,000 source characters. The full captured
              selection will be replaced.
            </p>
          )}
        </details>
      )}
    </div>
  );
}
