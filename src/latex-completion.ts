import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
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
export function latexCompletions(
  context: CompletionContext,
  index?: ProjectIntelligence,
): CompletionResult | null {
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
  const command = /\\([A-Za-z]*)$/.exec(masked);
  if (!command || (!command[1] && !context.explicit)) return null;
  const suffix =
    context.state
      .sliceDoc(
        context.pos,
        Math.min(context.state.doc.length, context.pos + 1000),
      )
      .match(/^[A-Za-z]*/)?.[0] ?? "";
  const end = context.pos + suffix.length;
  const hasArguments = /^\s*[\[{]/.test(
    context.state.sliceDoc(end, Math.min(context.state.doc.length, end + 100)),
  );
  return {
    from: context.pos - command[0].length,
    to: end,
    options: commands.map(([label, template, detail]) =>
      hasArguments
        ? { label: "\\" + label, type: "keyword", detail, apply: "\\" + label }
        : snippetCompletion(template, {
            label: "\\" + label,
            type: "keyword",
            detail,
          }),
    ),
    validFor: /^\\[A-Za-z]*$/,
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
