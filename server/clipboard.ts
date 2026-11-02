import { AppError } from "./files";

// Short-lived local copy records. Clipboard IDs grant access only to an exact
// fragment that this backend received; HTML never supplies trusted LaTeX.
export class ClipboardFragments {
  private entries = new Map<
    string,
    { latex: string; mode: "code" | "visual"; expires: number }
  >();
  static ttl = 30 * 60 * 1000;
  constructor(private now = () => Date.now()) {}
  private prune() {
    for (const [id, entry] of this.entries)
      if (entry.expires <= this.now()) this.entries.delete(id);
  }
  set(input: unknown) {
    const b = input as Record<string, unknown>;
    if (
      !b ||
      typeof b.id !== "string" ||
      !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(b.id) ||
      typeof b.latex !== "string" ||
      !["code", "visual"].includes(String(b.mode)) ||
      Buffer.byteLength(b.latex) > 256 * 1024
    )
      throw new AppError(400, "Copy up to 256 KB of source at once.");
    this.prune();
    if (this.entries.has(b.id))
      throw new AppError(409, "This clipboard fragment is already registered.");
    this.entries.set(b.id, {
      latex: b.latex,
      mode: b.mode as "code" | "visual",
      expires: this.now() + ClipboardFragments.ttl,
    });
    let bytes = [...this.entries.values()].reduce(
      (n, e) => n + Buffer.byteLength(e.latex),
      0,
    );
    while (this.entries.size > 64 || bytes > 4 * 1024 * 1024) {
      const first = this.entries.entries().next().value!;
      bytes -= Buffer.byteLength(first[1].latex);
      this.entries.delete(first[0]);
    }
    return { id: b.id };
  }
  get(id: string) {
    this.prune();
    const entry = this.entries.get(id);
    if (!entry)
      throw new AppError(
        404,
        "The original Leaf copy expired or the server restarted. Choose a paste format after reviewing the clipboard.",
      );
    return { latex: entry.latex, mode: entry.mode };
  }
}
