import type { TextFile } from "../shared/types";

/** The typing destination is independent of the file currently being inspected. */
export class TypingDocument {
  file: TextFile;
  savedContent: string;
  readonly original: string;
  constructor(
    public projectId: string,
    file: TextFile,
    public from: number,
    public to: number,
  ) {
    this.file = { ...file };
    this.original = file.content;
    this.savedContent = file.content;
  }
  range(from: number, to: number) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < from ||
      to > this.original.length
    )
      throw new Error(
        "The typing range no longer matches the captured document.",
      );
    this.from = from;
    this.to = to;
  }
  reveal(visible: string) {
    this.file = {
      ...this.file,
      content:
        this.original.slice(0, this.from) +
        visible +
        this.original.slice(this.to),
    };
    return this.file;
  }
  acknowledge(saved: TextFile) {
    if (saved.path !== this.file.path || saved.revision < this.file.revision)
      throw new Error("Typing save returned an unexpected file or revision.");
    // A save can finish while more text is revealed. Keep the newer local text.
    this.file = { ...this.file, revision: saved.revision };
    this.savedContent = saved.content;
    return this.file;
  }
}

export function selectedPassage(
  file: TextFile | null,
  from: number,
  to: number,
) {
  if (!file || from < 0 || to <= from || to > file.content.length) return null;
  const text = file.content.slice(from, to);
  return {
    path: file.path,
    from,
    to,
    text,
    startLine: file.content.slice(0, from).split("\n").length,
    endLine: file.content.slice(0, to - 1).split("\n").length,
  };
}
export type SelectedPassage = NonNullable<ReturnType<typeof selectedPassage>>;
