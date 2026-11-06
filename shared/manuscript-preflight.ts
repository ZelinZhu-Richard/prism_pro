import type { Diagnostic } from "./types";

export const preflightCategories = {
  figure: "Figure",
  include: "Included source",
  bibliography: "Bibliography file",
  dependency: "Local file",
  citation: "Unresolved citation",
  reference: "Unresolved reference",
  layout: "Layout",
  build: "Compilation",
};

export type PreflightCategory = keyof typeof preflightCategories;

export interface PreflightFinding extends Diagnostic {
  category: PreflightCategory;
}

export interface ManuscriptPreflight {
  projectId: string;
  generation: number;
  root: string;
  checkedAt: number;
  disk: "current" | "changed" | "unavailable";
  scanned: number;
  findings: PreflightFinding[];
  notes: string[];
}

function diagnosticCategory(message: string): PreflightCategory {
  if (/^(?:Overfull|Underfull) \\[hv]box\b/.test(message)) return "layout";
  if (
    /\bCitation\b.*\bundefined\b/i.test(message) ||
    /^(?:BibTeX: I didn't find a database entry|(?:Package biblatex Warning: |Biber: )?(?:The following entry could not be found|I didn't find a database entry|Citation .* not found))/i.test(
      message,
    )
  )
    return "citation";
  if (/\b(?:Reference\b.*\bundefined\b|undefined references\b)/i.test(message))
    return "reference";
  if (
    /could(?:n't| not) open database file|(?:cannot|can't|could not) find .+\.bib\b/i.test(
      message,
    )
  )
    return "bibliography";
  if (
    /\b(?:file\b.+\bnot found\b|can't find file|Cannot determine size of graphic)/i.test(
      message,
    )
  ) {
    if (/\.(?:pdf|png|jpe?g|eps|ps|mps)\b/i.test(message)) return "figure";
    if (/\.bib\b/i.test(message)) return "bibliography";
    if (/\.tex\b/i.test(message)) return "include";
    return "dependency";
  }
  return "build";
}

export function buildPreflightFindings(items: readonly Diagnostic[]) {
  return items
    .filter(({ severity }) => severity !== "info")
    .map((item): PreflightFinding => ({
      ...item,
      category: diagnosticCategory(item.message),
    }))
    .sort(
      (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
    );
}
