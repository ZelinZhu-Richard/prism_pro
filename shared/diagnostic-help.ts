import type { CompileJob, Diagnostic, Project } from "./types";
import { MISSING_BIBLIOGRAPHY_TOOL } from "./compiler";

export interface DiagnosticHelp {
  title: string;
  explanation: string;
  steps: string[];
}
const help = (
  title: string,
  explanation: string,
  ...steps: string[]
): DiagnosticHelp => ({ title, explanation, steps });
/** Conservative message recognition. Unknown output stays unexplained; no source is inferred. */
export function diagnosticHelp(d: Diagnostic): DiagnosticHelp | undefined {
  if (d.severity === "info") return undefined;
  const m = d.message;
  if (
    m === MISSING_BIBLIOGRAPHY_TOOL.biber ||
    m === MISSING_BIBLIOGRAPHY_TOOL.bibtex
  ) {
    const tool = m === MISSING_BIBLIOGRAPHY_TOOL.biber ? "Biber" : "BibTeX";
    return help(
      `${tool} is required for this build`,
      `The build requested ${tool}, which is missing from its selected TeX installation.`,
      `Install ${tool} in that installation using its trusted package manager.`,
      "Open Compile options, refresh the TeX runtimes, then compile again.",
    );
  }
  if (
    /^(?:LaTeX Error: |Package [\w@.-]+ Error: )?File [`'"].+['"`] (?:not found|not found:)/.test(
      m,
    )
  ) {
    const file = /File [`'"](.+?)['"`] (?:not found|not found:)/.exec(m)![1];
    return /\.(?:sty|cls)$/i.test(file)
      ? help(
          "Package or class file is missing",
          "TeX could not find the package or document class named in the compiler message.",
          "Check the literal package/class name and whether the file belongs in this project.",
          "If it is a distribution package, install it in the selected TeX installation using its trusted package manager, then compile again. Leaf does not install packages automatically.",
        )
      : help(
          "A project dependency is missing",
          "TeX could not find the named input, image or other supporting file.",
          "Check its spelling, capitalization and path relative to the project root.",
          "Add the required file or correct the source reference, then compile again.",
        );
  }
  if (
    /^(?:Package [\w@.-]+ Error: )?File [`'"].+['"`] not found/.test(m) ||
    /^I can't find file [`'"].+['"`]/.test(m)
  )
    return help(
      "A project dependency is missing",
      "The compiler could not open the named dependency.",
      "Check its path, spelling and capitalization, and add the file to the project if needed.",
    );
  if (/^(?:LaTeX Error: )?Undefined control sequence\b/.test(m))
    return help(
      "TeX does not recognize a command",
      "A command at or near this location has no definition in the current build.",
      "Inspect the command and nearby source. Check spelling and whether its definition or package is included.",
      "The message alone does not identify which package, if any, is needed.",
    );
  if (/^(?:LaTeX Error: )?Missing \$ inserted\b/.test(m))
    return help(
      "Check math delimiters",
      "TeX expected a math delimiter while reading this passage.",
      "Check paired $…$, \\(…\\), \\[…\\] and math environments near the reported line.",
      "Also check underscores or other math-only commands in ordinary text. Inspect the source before adding a delimiter.",
    );
  if (/^LaTeX Error: Unicode character .+\(U\+[\dA-Fa-f]+\)/.test(m))
    return help(
      "This Unicode character is unsupported",
      "The current LaTeX setup cannot typeset the character named in the message.",
      "Check the selected engine, input encoding and fonts. XeLaTeX or LuaLaTeX may support the character with an appropriate font.",
      "An engine change can affect packages and layout; review the resulting PDF.",
    );
  if (
    /^LaTeX Warning: Citation [`'"].+['"`] .*undefined\b/.test(m) ||
    /^BibTeX: I didn't find a database entry for /.test(m)
  )
    return help(
      "A citation key could not be resolved",
      "The final build still cannot resolve the citation named in this message.",
      "Compare the citation key with the key in the project bibliography, including capitalization.",
      "Check that the intended .bib file is included and that BibTeX/Biber completed without errors.",
    );
  if (/^LaTeX Warning: Reference [`'"].+['"`] .*undefined\b/.test(m))
    return help(
      "A reference label could not be resolved",
      "The final build has no resolved target for the named reference.",
      "Check the matching \\label name and whether its source file is included.",
      "Leaf already uses multipass compilation; inspect earlier errors and bibliography output if the warning persists.",
    );
  if (
    /^LaTeX Warning: (?:There were undefined references|Label\(s\) may have changed|There were multiply-defined labels|Label [`'"].+multiply defined)/.test(
      m,
    )
  )
    return help(
      "Check document references",
      "The compiler reports incomplete, changed or duplicate reference labels.",
      "Inspect the individual citation/reference warnings and earlier errors. Check label names and included files.",
      "If source is now correct, compile again and confirm the warning clears.",
    );
  if (/^Overfull \\[hv]box\b/.test(m))
    return help(
      "Content exceeds its layout box",
      "Some content extends beyond the space TeX allocated. This warning does not by itself mean compilation failed.",
      "Inspect the PDF near this passage for long text, equations, URLs or oversized figures.",
      "Adjust that content or its layout only after checking the rendered result.",
    );
  if (/^Underfull \\[hv]box\b/.test(m))
    return help(
      "TeX could not fill a layout box evenly",
      "TeX reports loose spacing in a line or page. This warning does not by itself mean compilation failed.",
      "Inspect the PDF before changing paragraph breaks, forced line breaks or layout.",
    );
  if (
    /^(?:LaTeX Error: )?(?:File ended while scanning use of |Paragraph ended before |Runaway argument\b)/.test(
      m,
    )
  )
    return help(
      "Check an unfinished argument",
      "TeX reached a boundary while still reading an argument. The cause may be before the reported location.",
      "Look for unclosed braces, environments or command arguments in the preceding source.",
    );
  if (/^LaTeX Error: \\begin\{.+\}.*ended by \\end\{/.test(m))
    return help(
      "Environment names do not match",
      "The compiler found an environment ending that does not match the open environment.",
      "Inspect the corresponding \\begin and \\end commands and any nested environments before this location.",
    );
  if (
    /^BibTeX: (?:I was expecting|You're missing|Repeated entry|Illegal,|You can't)/.test(
      m,
    )
  )
    return help(
      "Check bibliography syntax",
      "BibTeX could not read a bibliography construct.",
      "Inspect the named .bib record and nearby commas, braces, quotes and entry keys.",
      "Open the generated .blg file for the complete bibliography message.",
    );
  if (
    /^(?:Package [\w@.-]+ Warning: )?Shell escape feature is not enabled/.test(
      m,
    )
  )
    return help(
      "External commands are disabled",
      "Leaf compiles without shell escape; imported scripts and compiler configuration are not executed.",
      "If a figure or package needs a generated asset, prepare that asset separately and add it to the project.",
    );
  if (/^Build exceeded the configured time limit/.test(m))
    return help(
      "The configured build deadline was reached",
      "This build exceeded the optional local deadline. Leaf has no time limit by default.",
      "Inspect the log for a stalled tool or unusually long build. The trusted backend setting LEAF_COMPILE_TIMEOUT_MS controls this optional deadline.",
    );
  if (/^Build interrupted by server restart/.test(m))
    return help(
      "The backend stopped during compilation",
      "This build was interrupted when the local server stopped.",
      "Start a new compilation. The interrupted result does not replace the last successful PDF.",
    );
  if (
    /^The selected TeX installation changed|^Selected TeX installation changed|^selected TeX installation changed/.test(
      m,
    )
  )
    return help(
      "The selected TeX installation changed",
      "The installation no longer matches the captured build settings.",
      "Refresh the local TeX installations, select an available installation and start a new build.",
    );
  return undefined;
}
export type DiagnosticFilter =
  "problems" | "error" | "warning" | "info" | "all";
export function diagnosticCounts(items: readonly Diagnostic[]) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of items) counts[d.severity]++;
  return {
    ...counts,
    problems: counts.error + counts.warning,
    all: items.length,
  };
}
export function filterDiagnostics(
  items: readonly Diagnostic[],
  filter: DiagnosticFilter,
) {
  return items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        filter === "all" ||
        (filter === "problems"
          ? item.severity !== "info"
          : item.severity === filter),
    );
}
/** Compiler line markers require the exact current saved generation and a clean buffer. */
export function currentCompilerDiagnostics(
  job: CompileJob | undefined,
  project: Project | undefined,
  path: string,
  clean: boolean,
  uncertain: boolean,
): Diagnostic[] {
  if (
    !job ||
    !project ||
    job.projectId !== project.id ||
    job.generation !== project.generation ||
    ["queued", "running", "cancelled"].includes(job.status) ||
    !clean ||
    uncertain
  )
    return [];
  return job.diagnostics.filter(
    (d) => d.path === path && Number.isSafeInteger(d.line) && d.line! > 0,
  );
}
export function diagnosticRanges(source: string, items: readonly Diagnostic[]) {
  const starts = [0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") starts.push(i + 1);
  return items.flatMap((item) => {
    if (
      !Number.isSafeInteger(item.line) ||
      item.line! < 1 ||
      item.line! > starts.length
    )
      return [];
    const from = starts[item.line! - 1],
      end = item.line! < starts.length ? starts[item.line!] - 1 : source.length;
    return [{ from, to: Math.max(from, end), item }];
  });
}
