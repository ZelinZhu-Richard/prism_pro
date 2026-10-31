import { AppError } from "./files";

/** Resolve one explicit, unambiguous edit against the captured source snapshot. */
export function typingEdit(
  args: any,
  before: string,
  selection: { from: number; to: number },
) {
  if (
    typeof args.text !== "string" ||
    Buffer.byteLength(args.text) > 200000 ||
    !(args.replace === null || typeof args.replace === "string")
  )
    throw new AppError(
      400,
      "Invalid typing edit. Supply text and an exact replacement or an empty string for the selection.",
    );
  let { from, to } = selection;
  if (args.replace !== null && args.replace !== "") {
    from = before.indexOf(args.replace);
    if (from < 0 || before.indexOf(args.replace, from + 1) >= 0)
      throw new AppError(
        409,
        "Replacement must match exactly once. Include more surrounding text.",
      );
    to = from + args.replace.length;
  }
  if (before.slice(from, to) === args.text)
    throw new AppError(400, "This edit does not change the document.");
  return { text: args.text as string, from, to };
}
