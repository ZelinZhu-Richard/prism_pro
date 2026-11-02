import {
  sourceDeclarations,
  type CommandDeclaration,
  type PackageDeclaration,
} from "./latex-declarations";

export interface SourceText {
  path: string;
  content: string;
}
export interface CitationEntry {
  key: string;
  type: string;
  title: string;
  author: string;
  year: string;
  journal: string;
  path: string;
  line: number;
}
export interface LabelEntry {
  key: string;
  path: string;
  line: number;
}
export interface ProjectIntelligence {
  generation: number;
  citations: CitationEntry[];
  labels: LabelEntry[];
  warnings: string[];
  commands?: CommandDeclaration[];
  packages?: PackageDeclaration[];
}
export function maskTexComments(text: string) {
  return text.replace(/(^|\n)([^\n]*)/g, (_all, start, line: string) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\") {
        i++;
        continue;
      }
      if (line[i] === "%")
        return start + line.slice(0, i) + " ".repeat(line.length - i);
    }
    return start + line;
  });
}
function lineCounter(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") starts.push(i + 1);
  return (offset: number) => {
    let lo = 0,
      hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}
function recordEnd(text: string, start: number, open: string) {
  let braces = open === "{" ? 1 : 0,
    parens = open === "(" ? 1 : 0,
    quoted = false;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"' && braces === (open === "{" ? 1 : 0)) {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (c === "{") braces++;
    else if (c === "}") {
      braces--;
      if (open === "{" && braces === 0) return i;
    } else if (open === "(" && braces === 0) {
      if (c === "(") parens++;
      else if (c === ")" && --parens === 0) return i;
    }
  }
  return text.length;
}
function balanced(text: string, start: number, open = "{", close = "}") {
  let level = 0,
    quoted = false;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (open === "(" && text[i] === '"') quoted = !quoted;
    if (quoted) continue;
    if (text[i] === open) level++;
    else if (text[i] === close && --level === 0) return i;
  }
  return text.length;
}
function plain(value: string) {
  return value
    .replace(/\\(LaTeX|TeX|BibTeX)\b/g, "$1")
    .replace(
      /\\(?:["'`^~=.]|[uvHckbdtr](?![A-Za-z]))\s*\{?([A-Za-z])\}?/g,
      "$1",
    )
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function fields(body: string, strings: Map<string, string>) {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < body.length) {
    const m = /([a-z][a-z\d_-]*)\s*=\s*/gi;
    m.lastIndex = at;
    const hit = m.exec(body);
    if (!hit) break;
    let i = m.lastIndex,
      parts: string[] = [];
    while (i < body.length) {
      while (/\s/.test(body[i] || "") && i < body.length) i++;
      if (body[i] === "{") {
        const end = balanced(body, i);
        parts.push(body.slice(i + 1, end));
        i = end + 1;
      } else if (body[i] === '"') {
        let end = i + 1;
        for (; end < body.length; end++) {
          if (body[end] === "\\") end++;
          else if (body[end] === '"') break;
        }
        parts.push(body.slice(i + 1, end));
        i = end + 1;
      } else {
        const start = i;
        while (i < body.length && !/[,#\s]/.test(body[i])) i++;
        const value = body.slice(start, i);
        parts.push(strings.get(value.toLowerCase()) ?? value);
      }
      while (i < body.length && /\s/.test(body[i])) i++;
      if (body[i] === "#") {
        i++;
        continue;
      }
      break;
    }
    out[hit[1].toLowerCase()] = plain(parts.join(""));
    at = Math.max(i + 1, m.lastIndex);
  }
  return out;
}
export function parseBibtex(
  source: SourceText,
  warnings: string[] = [],
): CitationEntry[] {
  const text = maskTexComments(source.content),
    lineAt = lineCounter(text),
    strings = new Map<string, string>(),
    records: { type: string; body: string; offset: number }[] = [];
  const pattern = /@([A-Za-z]+)\s*([{(])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const end = recordEnd(text, pattern.lastIndex - 1, match[2]);
    if (end === text.length)
      warnings.push(
        `Incomplete BibTeX entry in ${source.path}:${lineAt(match.index)}.`,
      );
    records.push({
      type: match[1].toLowerCase(),
      body: text.slice(pattern.lastIndex, end),
      offset: match.index,
    });
    pattern.lastIndex = end + 1;
  }
  for (const r of records)
    if (r.type === "string") {
      for (const [k, v] of Object.entries(fields(r.body, strings)))
        strings.set(k, v);
    }
  const entries: CitationEntry[] = [];
  for (const r of records) {
    if (["comment", "preamble", "string", "xdata"].includes(r.type)) continue;
    const comma = r.body.indexOf(",");
    if (comma < 0) continue;
    const key = r.body.slice(0, comma).trim();
    if (!validKey(key)) continue;
    const f = fields(r.body.slice(comma + 1), strings);
    entries.push({
      key,
      type: r.type,
      title: f.title || "",
      author: f.author || f.editor || "",
      year: f.year || f.date || "",
      journal: f.journal || f.journaltitle || f.booktitle || "",
      path: source.path,
      line: lineAt(r.offset),
    });
  }
  return entries;
}
export function validKey(key: string) {
  return !!key && /^[^\s{},\\#%]+$/u.test(key) && key.length <= 300;
}
export function texSymbols(source: SourceText) {
  const text = maskTexComments(source.content).replace(
    /\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}/g,
    (m) => m.replace(/[^\n]/g, " "),
  );
  const lineAt = lineCounter(text);
  const labels: LabelEntry[] = [],
    citations: CitationEntry[] = [];
  for (const m of text.matchAll(/\\label\s*\{([^{}]+)\}/g))
    if (validKey(m[1]))
      labels.push({
        key: m[1],
        path: source.path,
        line: lineAt(m.index!),
      });
  for (const m of text.matchAll(
    /\\(?:bibitem(?:\s*\[[^\]]*\])?|entry)\s*\{([^{}]+)\}/g,
  ))
    if (validKey(m[1])) {
      const biblatex = m[0].startsWith("\\entry");
      const end = text.indexOf(
        biblatex ? "\\endentry" : "\\bibitem",
        m.index! + m[0].length,
      );
      const body = text.slice(
        m.index! + m[0].length,
        end < 0 ? Math.min(text.length, m.index! + 2000) : end,
      );
      const metadata: Record<string, string> = {};
      if (biblatex)
        for (const field of body.matchAll(
          /\\field\{(title|year|date|journaltitle|booktitle)\}\s*\{/g,
        )) {
          const from = field.index! + field[0].length;
          metadata[field[1]] = plain(
            body.slice(from, balanced(body, from - 1)),
          );
        }
      const names: string[] = [];
      if (biblatex)
        for (const field of body.matchAll(/\\namepart(?:family|given)\s*\{/g)) {
          const from = field.index! + field[0].length;
          names.push(plain(body.slice(from, balanced(body, from - 1))));
        }
      citations.push({
        key: m[1],
        type: biblatex ? "biblatex" : "bibliography",
        title: biblatex
          ? metadata.title || ""
          : plain(body.replace(/\\end\{thebibliography\}[\s\S]*/, "")),
        author: names.join(" "),
        year: metadata.year || metadata.date || "",
        journal: metadata.journaltitle || metadata.booktitle || "",
        path: source.path,
        line: lineAt(m.index!),
      });
    }
  return { labels, citations };
}
export function indexSources(
  sources: SourceText[],
  generation = 0,
): ProjectIntelligence {
  const citations: CitationEntry[] = [],
    labels: LabelEntry[] = [],
    commands: CommandDeclaration[] = [],
    packages: PackageDeclaration[] = [],
    warnings: string[] = [];
  for (const source of sources) {
    if (/\.bib$/i.test(source.path))
      citations.push(...parseBibtex(source, warnings));
    else {
      const result = texSymbols(source);
      labels.push(...result.labels);
      citations.push(...result.citations);
      if (/\.(?:tex|sty|cls)$/i.test(source.path)) {
        const declarations = sourceDeclarations(source);
        commands.push(
          ...declarations.commands.slice(
            0,
            Math.max(0, 10000 - commands.length),
          ),
        );
        packages.push(
          ...declarations.packages.slice(
            0,
            Math.max(0, 10000 - packages.length),
          ),
        );
        if (
          declarations.limited ||
          commands.length === 10000 ||
          packages.length === 10000
        )
          warnings.push(
            `Local declaration index reached its limit in ${source.path}. Some suggestions are unavailable.`,
          );
      }
    }
  }
  const ordered = [...citations].sort(
    (a, b) =>
      Number(!/\.bib$/i.test(a.path)) - Number(!/\.bib$/i.test(b.path)) ||
      a.key.localeCompare(b.key),
  );
  const byKey = new Map<string, CitationEntry>();
  for (const entry of ordered) {
    if (byKey.has(entry.key)) {
      if (
        byKey.get(entry.key)!.path !== entry.path &&
        /\.bib$/i.test(entry.path)
      )
        warnings.push(`Duplicate citation key ${entry.key} in ${entry.path}.`);
    } else byKey.set(entry.key, entry);
  }
  const labelKeys = new Set<string>();
  for (const label of labels) {
    if (labelKeys.has(label.key))
      warnings.push(`Duplicate label ${label.key} in ${label.path}.`);
    labelKeys.add(label.key);
  }
  return {
    generation,
    citations: [...byKey.values()],
    labels,
    commands,
    packages,
    warnings,
  };
}
export function searchCitations(entries: CitationEntry[], query: string) {
  const normalize = (value: string) =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const text = normalize(
      [entry.key, entry.title, entry.author, entry.year, entry.journal].join(
        " ",
      ),
    );
    return words.every((word) => text.includes(word));
  });
}
