import { isUtf8 } from "node:buffer";
import { AppError } from "./files";

/** Editable source must round-trip; raw import/export/compilation keep original bytes. */
export function decodeSource(
  name: string,
  bytes: Uint8Array,
  context: "file" | "history" = "file",
): string {
  if (!isUtf8(bytes))
    throw new AppError(
      415,
      `${name}: This file is not valid UTF-8. Its original bytes are preserved. ${context === "history" ? "Use Download version ZIP in History to inspect the original source." : "Download it from Files, convert a copy explicitly to UTF-8, then upload it with replacement review before editing."}`,
    );
  return (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).toString("utf8");
}
export function validateSourceInput(content: string) {
  if (Buffer.from(content).toString("utf8") !== content)
    throw new AppError(
      400,
      "Source contains an incomplete Unicode character. Keep your draft and correct it before saving.",
    );
}
