import {
  originalClipboard,
  type ClipboardPacket,
  type ClipboardFragment,
} from "./editor-clipboard";
import { htmlToLatex } from "./rich-clipboard";
import { escapeLatexText } from "./source-actions";
export async function prepareClipboard(
  packet: ClipboardPacket,
  lookup: (id: string) => Promise<ClipboardFragment> = originalClipboard,
) {
  if (packet.id) {
    try {
      const original = await lookup(packet.id);
      return {
        review: packet.visual && original.mode === "code",
        latex: original.latex,
        block: /\\(?:begin\{|(?:sub)*section\*?\{)|\n\s*\n/.test(
          original.latex,
        ),
        packet: { ...packet, original },
      };
    } catch (e) {
      return {
        review: true,
        latex: "",
        block: false,
        packet: { ...packet, lookupError: (e as Error).message },
      };
    }
  }
  try {
    const rich = packet.html ? htmlToLatex(packet.html) : null;
    if (
      packet.image &&
      (!rich || (rich.images <= 1 && !rich.hasText && !rich.tables))
    )
      return { review: true, latex: "", block: true, packet };
    if (packet.visual && rich)
      return {
        review: !!rich.warnings.length || !!rich.packages.length,
        latex: rich.latex,
        block: rich.block,
        packet,
      };
    return {
      review: !!packet.rawLatex,
      latex: packet.visual ? escapeLatexText(packet.plain) : packet.plain,
      block: false,
      packet,
    };
  } catch (e) {
    return { review: true, latex: "", block: false, packet };
  }
}
