import {
  AlignLeft,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Table2,
  Image,
  Sigma,
  MessageSquareCode,
  Code2,
  ClipboardPaste,
  MessageSquarePlus,
} from "lucide-react";
import type { FormatAction } from "../source-actions";
export type InsertTool = "table" | "figure" | "symbols";
export function SourceToolbar({
  disabled,
  onFormat,
  onInsert,
  onPaste,
  onComment,
  onFormatDocument,
}: {
  disabled: boolean;
  onFormat: (action: FormatAction) => void;
  onInsert: (tool: InsertTool) => void;
  onPaste?: () => void;
  onComment?: () => void;
  onFormatDocument?: () => void;
}) {
  return (
    <div
      className="formatting-toolbar"
      role="group"
      aria-label="Source formatting"
    >
      <button
        disabled={disabled}
        aria-label="Bold"
        title="Bold (⌘B)"
        onClick={() => onFormat("bold")}
      >
        <Bold size={14} />
      </button>
      <button
        disabled={disabled}
        aria-label="Italic"
        title="Italic (⌘I)"
        onClick={() => onFormat("italic")}
      >
        <Italic size={14} />
      </button>
      <button
        disabled={disabled}
        aria-label="Underline"
        title="Underline"
        onClick={() => onFormat("underline")}
      >
        <Underline size={14} />
      </button>
      <button
        disabled={disabled}
        aria-label="Typewriter text"
        title="Typewriter text"
        onClick={() => onFormat("code")}
      >
        <Code2 size={14} />
      </button>
      <select
        aria-label="Insert heading"
        disabled={disabled}
        value=""
        onChange={(e) => {
          if (e.target.value) onFormat(e.target.value as FormatAction);
        }}
      >
        <option value="">Heading</option>
        <option value="section">Section</option>
        <option value="subsection">Subsection</option>
        <option value="subsubsection">Subsubsection</option>
        <option value="paragraph">Paragraph heading</option>
      </select>
      {onFormatDocument && (
        <button
          disabled={disabled}
          onClick={onFormatDocument}
          title="Review local LaTeX formatting before applying"
        >
          <AlignLeft size={14} aria-hidden="true" />
          Format source
        </button>
      )}
      <span className="toolbar-divider" />
      {onComment && (
        <button
          disabled={disabled}
          onClick={onComment}
          title="Comment on the selection or current line"
        >
          <MessageSquarePlus size={14} />
          Comment
        </button>
      )}
      {onPaste && (
        <button
          disabled={disabled}
          onClick={onPaste}
          title="Review clipboard formats before pasting"
        >
          <ClipboardPaste size={14} aria-hidden="true" />
          Paste Preview
        </button>
      )}
      <button
        disabled={disabled}
        aria-label="Bulleted list"
        title="Bulleted list"
        onClick={() => onFormat("itemize")}
      >
        <List size={15} />
      </button>
      <button
        disabled={disabled}
        aria-label="Numbered list"
        title="Numbered list"
        onClick={() => onFormat("enumerate")}
      >
        <ListOrdered size={15} />
      </button>
      <button
        disabled={disabled}
        aria-label="Inline equation"
        title="Inline equation"
        onClick={() => onFormat("inline-math")}
      >
        <span aria-hidden="true">x²</span>
      </button>
      <button
        disabled={disabled}
        aria-label="Displayed equation"
        title="Displayed equation"
        onClick={() => onFormat("display-math")}
      >
        <span aria-hidden="true">[x]</span>
      </button>
      <button
        disabled={disabled}
        aria-label="Toggle comment"
        title="Toggle LaTeX comment (⌘/)"
        onClick={() => onFormat("comment")}
      >
        <MessageSquareCode size={14} />
      </button>
      <span className="toolbar-divider" />
      <button
        disabled={disabled}
        onClick={() => onInsert("table")}
        title="Edit table at cursor, or insert a table"
      >
        <Table2 size={14} aria-hidden="true" />
        Table
      </button>
      <button
        disabled={disabled}
        onClick={() => onInsert("figure")}
        title="Insert figure"
      >
        <Image size={14} aria-hidden="true" />
        Figure
      </button>
      <button
        disabled={disabled}
        onClick={() => onInsert("symbols")}
        title="Insert math symbol"
      >
        <Sigma size={14} aria-hidden="true" />
        Symbols
      </button>
    </div>
  );
}
