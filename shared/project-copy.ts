export interface CopyProjectRequest {
  name: string;
  generation: number;
  requestId: string;
}

export function copyProjectName(original: string) {
  const suffix = " (Copy)",
    limit = 120 - suffix.length;
  let prefix = "";
  const clean =
    original.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim() ||
    "Untitled project";
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(clean)) {
    if (prefix.length + segment.length > limit) break;
    prefix += segment;
  }
  return (prefix.trimEnd() || "Untitled project") + suffix;
}
