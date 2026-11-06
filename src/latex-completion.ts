import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import {
  maskTexComments,
  searchCitations,
  texSymbols,
  type ProjectIntelligence,
} from "../shared/project-intelligence";
import {
  scanEnvironments,
  environmentOpaque,
  commonEnvironments,
} from "../shared/latex-environments";
import {
  sourceDeclarations,
  type CommandDeclaration,
} from "../shared/latex-declarations";
const declarationCache = new Map<
  object,
  { path: string; value: ReturnType<typeof sourceDeclarations> }
>();
function currentDeclarations(context: CompletionContext, path: string) {
  const old = declarationCache.get(context.state.doc);
  if (old?.path === path) return old.value;
  const value = sourceDeclarations({
    path,
    content: context.state.doc.toString(),
  });
  declarationCache.set(context.state.doc, { path, value });
  if (declarationCache.size > 4)
    declarationCache.delete(declarationCache.keys().next().value!);
  return value;
}
const commands = [
  ["section", "\\section{${Title}}", "Section heading"],
  ["subsection", "\\subsection{${Title}}", "Subsection heading"],
  ["subsubsection", "\\subsubsection{${Title}}", "Subsubsection heading"],
  ["textbf", "\\textbf{${text}}", "Bold text"],
  ["textit", "\\textit{${text}}", "Italic text"],
  ["emph", "\\emph{${text}}", "Emphasis"],
  ["cite", "\\cite{${key}}", "Citation"],
  ["citep", "\\citep{${key}}", "Parenthetical citation (natbib)"],
  ["citet", "\\citet{${key}}", "Textual citation (natbib)"],
  ["autocite", "\\autocite{${key}}", "Automatic citation (biblatex)"],
  ["ref", "\\ref{${label}}", "Cross-reference"],
  ["eqref", "\\eqref{${label}}", "Equation reference"],
  ["href", "\\href{${https://example.com}}{${Link text}}", "Link (hyperref)"],
  ["url", "\\url{${https://example.com}}", "URL (url or hyperref)"],
  ["label", "\\label{${name}}", "Define a reference label"],
  ["input", "\\input{${file}}", "Include a source file"],
  [
    "includegraphics",
    "\\includegraphics[width=\\linewidth]{${file}}",
    "Insert a figure asset",
  ],
  ["frac", "\\frac{${numerator}}{${denominator}}", "Fraction"],
  [
    "begin",
    "\\begin{${environment}}\n${}\n\\end{${environment}}",
    "Environment",
  ],
  ["item", "\\item ${text}", "List item"],
  ["footnote", "\\footnote{${text}}", "Footnote"],
  ["caption", "\\caption{${text}}", "Figure or table caption"],
  ["title", "\\title{${Title}}", "Document title"],
  ["author", "\\author{${Author}}", "Document author"],
  ["bibliography", "\\bibliography{${references}}", "BibTeX bibliography"],
  [
    "addbibresource",
    "\\addbibresource{${references.bib}}",
    "Biblatex bibliography",
  ],
  ["usepackage", "\\usepackage{${package}}", "Load a package"],
  ["documentclass", "\\documentclass{${article}}", "Document class"],
];
function keyEnd(context: CompletionContext) {
  const tail = context.state.sliceDoc(
    context.pos,
    Math.min(context.state.doc.length, context.pos + 4000),
  );
  const stop = tail.search(/[,}%\n]/);
  return context.pos + (stop < 0 ? tail.length : stop);
}
function matchesCommandPrefix(label: string, query: string) {
  let at = 0;
  for (const c of query.toLowerCase()) {
    const found = label.toLowerCase().indexOf(c, at);
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
}
export interface LatexCompletionResult extends CompletionResult {
  packageQuery?: string;
}
export function latexCompletions(
  context: CompletionContext,
  index?: ProjectIntelligence,
  sourcePath = "Current document",
): LatexCompletionResult | null {
  if (context.state.readOnly) return null;
  const environment = /\\(begin|end)\s*\{([A-Za-z0-9@*:_-]*)$/.exec(
    context.state.sliceDoc(Math.max(0, context.pos - 200), context.pos),
  );
  if (environment) {
    const source = context.state.doc.toString(),
      index = scanEnvironments(source),
      from = context.pos - environment[0].length;
    let slashes = 0;
    for (let i = from - 1; i >= 0 && source[i] === "\\"; i--) slashes++;
    if (slashes % 2 || environmentOpaque(index, Math.max(0, context.pos - 1)))
      return null;
    const names =
      environment[1] === "end"
        ? index.tokens
            .filter(
              (t) =>
                t.kind === "begin" &&
                t.to <= from &&
                (t.mate === undefined || index.tokens[t.mate].from >= from),
            )
            .reverse()
            .map((t) => t.name)
        : [
            ...commonEnvironments,
            ...index.declared,
            ...index.tokens
              .filter((t) => t.kind === "begin" && t.from !== from)
              .map((t) => t.name),
          ];
    const tail = /^[A-Za-z0-9@*:_-]*/.exec(
      source.slice(context.pos, context.pos + 80),
    )![0];
    return {
      from: context.pos - environment[2].length,
      to: context.pos + tail.length,
      options: [...new Set(names)].map((name) => ({
        label: name,
        type: "type",
        detail:
          environment[1] === "end"
            ? "Open environment in this file"
            : "LaTeX environment · package may be required",
      })),
      validFor: /^[A-Za-z0-9@*:_-]*$/,
    };
  }
  const start = Math.max(0, context.pos - 4000),
    before = context.state.sliceDoc(start, context.pos),
    masked = maskTexComments(before);
  if (masked.endsWith(" ") && before.at(-1) !== " ") return null;
  if (
    /\\begin\{(verbatim\*?|lstlisting|minted|comment)\}(?:(?!\\end\{\1\})[\s\S])*$/.test(
      masked,
    )
  )
    return null;
  const packageContext =
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{([^{}]*)$/.exec(
      masked,
    );
  if (packageContext) {
    const head = start + packageContext.index;
    let slashes = 0;
    for (
      let at = head - 1;
      at >= 0 && context.state.sliceDoc(at, at + 1) === "\\";
      at--
    )
      slashes++;
    if (slashes % 2) return null;
    const local = currentDeclarations(context, sourcePath),
      query = packageContext[1].split(",").at(-1)!.trimStart(),
      names = new Map<
        string,
        { name: string; path: string; line: number; local: boolean }
      >();
    for (const entry of [
      ...(index?.packages ?? []).filter((p) => p.path !== sourcePath),
      ...local.packages.filter(
        (p) =>
          p.from === undefined || context.pos < p.from || context.pos > p.to!,
      ),
    ]) {
      if (!names.has(entry.name) || entry.local) names.set(entry.name, entry);
    }
    if (
      local.limited ||
      local.opaque.some(
        (r) => r.from <= context.pos - 1 && context.pos - 1 < r.to,
      )
    )
      return null;
    const tail = /^[A-Za-z0-9@_./-]*/.exec(
      context.state.sliceDoc(context.pos, context.pos + 400),
    )![0];
    return {
      from: context.pos - query.length,
      to: context.pos + tail.length,
      filter: false,
      packageQuery: query,
      options: [...names.values()]
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .sort(
          (a, b) =>
            Number(b.local) - Number(a.local) || a.name.localeCompare(b.name),
        )
        .slice(0, 200)
        .map((p) => ({
          label: p.name,
          type: "module",
          detail: p.local
            ? "Project package"
            : "Used in project · installation not checked",
          info: `${p.path}:${p.line}`,
        })),
    };
  }
  const citation =
    /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^{}]*)$/i.exec(
      masked,
    );
  if (citation) {
    const current = citation[1].split(",").at(-1)!,
      query = current.trimStart(),
      from = context.pos - query.length;
    return {
      from,
      to: keyEnd(context),
      filter: false,
      options: searchCitations(index?.citations ?? [], query)
        .slice(0, 100)
        .map((entry) => ({
          label: entry.key,
          type: "constant",
          detail: [entry.author, entry.year].filter(Boolean).join(" · "),
          info: [entry.title, entry.journal, `${entry.path}:${entry.line}`]
            .filter(Boolean)
            .join("\n"),
        })),
    };
  }
  const reference =
    /\\(?:[aA]utoref|[cC]ref|[vV]ref|[eE]qref|[pP]ageref|ref|nameref|[cC]pageref)\*?\s*\{([^{}]*)$/i.exec(
      masked,
    );
  if (reference) {
    const query = reference[1].split(",").at(-1)!.trimStart();
    const local = texSymbols({
      path: "Current document",
      content: context.state.doc.toString(),
    }).labels;
    const keys = new Map(
      [...(index?.labels ?? []), ...local].map((l) => [l.key, l]),
    );
    return {
      from: context.pos - query.length,
      to: keyEnd(context),
      filter: false,
      options: [...keys.values()]
        .filter((l) =>
          l.key.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .slice(0, 100)
        .map((l) => ({
          label: l.key,
          type: "variable",
          detail: `${l.path}:${l.line}`,
        })),
    };
  }
  const command = /\\([A-Za-z@]*)$/.exec(masked);
  if (!command || (!command[1] && !context.explicit)) return null;
  const suffix =
    context.state
      .sliceDoc(
        context.pos,
        Math.min(context.state.doc.length, context.pos + 1000),
      )
      .match(/^[A-Za-z@]*/)?.[0] ?? "";
  const end = context.pos + suffix.length;
  const hasArguments = /^\s*[\[{]/.test(
    context.state.sliceDoc(end, Math.min(context.state.doc.length, end + 100)),
  );
  const local = currentDeclarations(context, sourcePath);
  if (
    local.opaque.some(
      (r) =>
        !r.declaration && r.from <= context.pos - 1 && context.pos - 1 < r.to,
    )
  )
    return null;
  const declared = new Map<string, CommandDeclaration[]>();
  for (const entry of local.limited
    ? []
    : [
        ...(index?.commands ?? []).filter((c) => c.path !== sourcePath),
        ...local.commands.filter(
          (c) => context.pos < c.from || context.pos > c.to,
        ),
      ]) {
    const entries = declared.get(entry.name) ?? [];
    entries.push(entry);
    declared.set(entry.name, entries);
  }
  const custom: Completion[] = [...declared.entries()]
    .filter(([name]) => name.toLowerCase().includes(command[1].toLowerCase()))
    .slice(0, 200)
    .map(([name, entries]) => ({
      label: "\\" + name,
      type: "function",
      apply: "\\" + name,
      detail: "Local command declaration",
      info: entries.map((e) => `${e.path}:${e.line}`).join("\n"),
    }));
  const options = [
    ...custom,
    ...commands
      .filter(([label]) => !declared.has(label))
      .map(([label, template, detail]) =>
        hasArguments
          ? {
              label: "\\" + label,
              type: "keyword",
              detail,
              apply: "\\" + label,
            }
          : snippetCompletion(template, {
              label: "\\" + label,
              type: "keyword",
              detail,
            }),
      ),
  ];
  const midName = end > context.pos;
  return {
    from: context.pos - command[0].length,
    to: end,
    // CM filters through result.to; an existing typo after the caret must not
    // hide candidates that match the typed prefix before it.
    options: midName
      ? options.filter((o) => matchesCommandPrefix(o.label, command[0]))
      : options,
    filter: midName ? false : undefined,
    validFor: midName || declared.size ? undefined : /^\\[A-Za-z@]*$/,
  };
}
export function citationInsertion(
  content: string,
  from: number,
  to: number,
  key: string,
) {
  const before = maskTexComments(content.slice(Math.max(0, from - 4000), from));
  const within =
    /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^{}]*)$/i.exec(
      before,
    );
  if (within && /[{},%\n]/.test(content.slice(from, to))) return null;
  if (within) {
    const fragment = within[1].split(",").at(-1)!;
    let end = to;
    while (end < content.length && !/[,}%\n]/.test(content[end])) end++;
    const query = fragment.trimStart();
    return { from: from - query.length, to: end, text: key };
  }
  return { from, to, text: `\\cite{${key}}` };
}
