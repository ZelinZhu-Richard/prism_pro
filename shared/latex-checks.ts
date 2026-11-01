import {
  WRITING_CHARACTERS,
  WRITING_ISSUES,
  WRITING_WORDS,
  wordKey,
  type WritingIssue,
  type WritingResult,
} from "./writing-checks";
type Range = { from: number; to: number };
type Environment = {
  name: string;
  from: number;
  body: number;
  end: number;
  to: number;
};
export class WritingLimit extends Error {}
const rawEnvironments = new Set([
  "verbatim",
  "verbatim*",
  "Verbatim",
  "lstlisting",
  "minted",
  "comment",
  "tikzpicture",
  "pgfpicture",
  "filecontents",
  "filecontents*",
]);
const mathEnvironments = new Set([
  "math",
  "displaymath",
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "aligned",
  "alignedat",
  "gather",
  "gather*",
  "gathered",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "array",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
]);
const textCommands = new Set([
  "textbf",
  "textit",
  "emph",
  "underline",
  "textrm",
  "textsf",
  "textnormal",
  "textup",
  "textmd",
  "textsl",
  "textsc",
  "text",
  "mbox",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
  "chapter",
  "part",
  "title",
  "author",
  "caption",
  "captionof",
  "footnote",
  "footnotetext",
  "marginpar",
  "thanks",
  "enquote",
  "textsuperscript",
  "textsubscript",
  "MakeUppercase",
  "MakeLowercase",
]);
const mathCommands = new Set([
  "frac",
  "dfrac",
  "tfrac",
  "sqrt",
  "sum",
  "prod",
  "int",
  "iint",
  "oint",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "theta",
  "lambda",
  "mu",
  "sigma",
  "omega",
  "partial",
  "nabla",
  "times",
  "cdot",
  "leq",
  "geq",
  "neq",
  "infty",
  "mathbb",
  "mathcal",
  "mathbf",
  "mathrm",
  "overline",
  "vec",
]);
const structuralText = new Set([
  "section",
  "subsection",
  "subsubsection",
  "chapter",
  "paragraph",
  "caption",
  "item",
  "par",
]);
const definitions = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "newenvironment",
  "renewenvironment",
  "def",
  "gdef",
  "edef",
  "xdef",
]);
export function scanLatex(source: string, syntax = true) {
  if (source.length > WRITING_CHARACTERS)
    throw new WritingLimit(
      "Writing checks are limited to 1,000,000 source characters.",
    );
  const started = Date.now(),
    issues: WritingIssue[] = [],
    placements: { from: number; to: number; message: string }[] = [],
    pairs = new Map<number, number>(),
    opaque: Range[] = [],
    environments = new Map<number, Environment>(),
    braces: number[] = [],
    envs: {
      name: string;
      from: number;
      body: number;
      math: boolean;
      leftDepth: number;
    }[] = [];
  let ticks = 0,
    math: { token: string; from: number; leftDepth: number } | null = null,
    left: number[] = [],
    documentStart = -1,
    documentEnd = source.length,
    limited = false;
  const budget = () => {
    if (++ticks % 2048 === 0 && Date.now() - started > 2000)
      throw new WritingLimit(
        "LaTeX checks took too long. Compile for authoritative diagnostics.",
      );
  };
  const issue = (from: number, to: number, message: string) => {
    if (!syntax) return;
    if (issues.length >= WRITING_ISSUES) {
      limited = true;
      return;
    }
    issues.push({
      id: `syntax:${from}:${issues.length}`,
      kind: "syntax",
      from,
      to: Math.max(from + 1, to),
      message,
    });
  };
  function space(at: number) {
    while (at < source.length) {
      if (/\s/.test(source[at])) {
        at++;
        continue;
      }
      if (source[at] === "%") {
        const e = source.indexOf("\n", at);
        at = e < 0 ? source.length : e + 1;
        continue;
      }
      break;
    }
    return at;
  }
  function group(at: number): Range | null {
    at = space(at);
    const first = source[at];
    if (first !== "{" && first !== "[") return null;
    if (first === "{" && pairs.has(at))
      return { from: at, to: pairs.get(at)! + 1 };
    const stack = [first];
    for (let i = at + 1; i < source.length; i++) {
      budget();
      const c = source[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "%") {
        const e = source.indexOf("\n", i);
        if (e < 0) return null;
        i = e;
        continue;
      }
      if (c === "{" || (c === "[" && stack.at(-1) !== "{")) {
        if (stack.length >= 256)
          throw new WritingLimit(
            "Writing checks support at most 256 nested groups.",
          );
        stack.push(c);
      } else if (
        (c === "}" && stack.at(-1) === "{") ||
        (c === "]" && stack.at(-1) === "[")
      ) {
        stack.pop();
        if (!stack.length) return { from: at, to: i + 1 };
      }
    }
    return null;
  }
  function command(at: number) {
    const match = /^\\([A-Za-z@]+|[^\n])/u.exec(source.slice(at, at + 160));
    if (!match) return null;
    let to = at + match[0].length;
    if (source[to] === "*") to++;
    return { name: match[1], to };
  }
  function args(at: number) {
    let end = at;
    for (let n = 0; n < 16; n++) {
      const g = group(end);
      if (!g) break;
      end = g.to;
    }
    return end;
  }
  function definition(at: number, name: string, end: number) {
    let cursor = space(end),
      g = group(cursor);
    if (["def", "gdef", "edef", "xdef"].includes(name)) {
      const open = source.indexOf("{", cursor);
      if (open < 0 || open - cursor > 512) return end;
      g = group(open);
      if (!g) {
        issue(open, open + 1, "Unclosed group in a command definition.");
        return source.length;
      }
      return g.to;
    }
    if (g) {
      cursor = g.to;
    } else {
      const cmd = command(cursor);
      if (!cmd) return end;
      cursor = cmd.to;
    }
    for (let n = 0; n < 2; n++) {
      g = group(cursor);
      if (g && source[g.from] === "[") cursor = g.to;
    }
    const bodyAt = space(cursor);
    g = group(cursor);
    if (!g || source[g.from] !== "{") {
      if (source[bodyAt] === "{") {
        issue(bodyAt, bodyAt + 1, "Unclosed group in a command definition.");
        return source.length;
      }
      return end;
    }
    cursor = g.to;
    if (name.endsWith("environment")) {
      g = group(cursor);
      if (g) cursor = g.to;
      else if (source[space(cursor)] === "{") {
        issue(
          space(cursor),
          space(cursor) + 1,
          "Unclosed environment definition.",
        );
        return source.length;
      }
    }
    return cursor;
  }
  const inMath = () => !!math || envs.some((e) => e.math);
  const closeLeft = (depth = 0) => {
    for (const at of left.splice(depth))
      issue(
        at,
        at + 5,
        "This \\left has no matching \\right in its math scope.",
      );
  };
  for (let i = 0; i < source.length;) {
    budget();
    const c = source[i];
    if (c === "%") {
      const end = source.indexOf("\n", i),
        to = end < 0 ? source.length : end;
      opaque.push({ from: i, to });
      i = to;
      continue;
    }
    if (c === "\\") {
      const cmd = command(i);
      if (!cmd) {
        i++;
        continue;
      }
      const { name } = cmd;
      let end = cmd.to;
      if (definitions.has(name)) {
        const to = definition(i, name, end);
        opaque.push({ from: i, to });
        i = to;
        continue;
      }
      if (name === "verb") {
        const delimiter = source[end],
          stop =
            delimiter && !/\s/.test(delimiter)
              ? source.indexOf(delimiter, end + 1)
              : -1,
          line = source.indexOf("\n", end);
        if (stop < 0 || (line >= 0 && stop > line)) {
          issue(i, end, "Unclosed \\verb text.");
          end = line < 0 ? source.length : line;
        } else end = stop + 1;
        opaque.push({ from: i, to: end });
        i = end;
        continue;
      }
      if (name === "begin" || name === "end") {
        const g = group(end),
          env =
            g && source[g.from] === "{"
              ? source.slice(g.from + 1, g.to - 1)
              : "";
        if (env && env.length <= 80) {
          if (name === "begin" && rawEnvironments.has(env)) {
            const ending = `\\end{${env}}`,
              at = source.indexOf(ending, g!.to);
            if (at < 0) issue(i, g!.to, `Unclosed ${env} environment.`);
            const to = at < 0 ? source.length : at + ending.length;
            opaque.push({ from: i, to });
            i = to;
            continue;
          }
          if (name === "begin") {
            if (envs.length >= 256)
              throw new WritingLimit(
                "Writing checks support at most 256 nested environments.",
              );
            if (env === "document" && documentStart < 0) documentStart = g!.to;
            envs.push({
              name: env,
              from: i,
              body: g!.to,
              math: mathEnvironments.has(env),
              leftDepth: left.length,
            });
          } else {
            const top = envs.at(-1);
            if (!top || top.name !== env)
              issue(
                i,
                g!.to,
                top
                  ? `Expected \\end{${top.name}}, found \\end{${env}}.`
                  : `No matching \\begin{${env}}.`,
              );
            else {
              envs.pop();
              environments.set(top.from, { ...top, end: i, to: g!.to });
              if (top.math) {
                closeLeft(top.leftDepth);
                opaque.push({ from: top.from, to: g!.to });
              }
              if (env === "document") documentEnd = i;
            }
          }
          i = g!.to;
          continue;
        }
      }
      if (["(", "[", ")", "]"].includes(name)) {
        const opening = name === "(" || name === "[";
        if (opening) {
          if (math)
            issue(i, end, `Nested math delimiter; expected ${math.token}.`);
          else
            math = {
              token: name === "(" ? "\\)" : "\\]",
              from: i,
              leftDepth: left.length,
            };
        } else if (!math || math.token !== "\\" + name)
          issue(i, end, "This math delimiter has no matching opener.");
        else {
          opaque.push({ from: math.from, to: end });
          closeLeft(math.leftDepth);
          math = null;
        }
        i = end;
        continue;
      }
      if (name === "left" && inMath()) left.push(i);
      if (name === "right" && inMath()) {
        const depth = Math.max(
          math?.leftDepth ?? 0,
          ...envs.filter((e) => e.math).map((e) => e.leftDepth),
        );
        if (left.length > depth) left.pop();
        else issue(i, end, "This \\right has no matching \\left.");
      }
      if (mathCommands.has(name) && !inMath())
        placements.push({
          from: i,
          to: end,
          message: `\\${name} normally belongs in math mode.`,
        });
      if (structuralText.has(name) && inMath())
        placements.push({
          from: i,
          to: end,
          message: `\\${name} is a structural text command inside math mode.`,
        });
      i = end;
      continue;
    }
    if (c === "$") {
      const token = source[i + 1] === "$" ? "$$" : "$";
      if (!math) math = { token, from: i, leftDepth: left.length };
      else if (math.token === token) {
        opaque.push({ from: math.from, to: i + token.length });
        closeLeft(math.leftDepth);
        math = null;
      } else
        issue(
          i,
          i + token.length,
          `Mixed math delimiters; expected ${math.token}.`,
        );
      i += token.length;
      continue;
    }
    if (c === "{") {
      if (braces.length >= 256)
        throw new WritingLimit(
          "Writing checks support at most 256 nested groups.",
        );
      braces.push(i);
    } else if (c === "}") {
      const start = braces.pop();
      if (start === undefined) issue(i, i + 1, "Closing } has no matching {.");
      else pairs.set(start, i);
    }
    i++;
  }
  if (math) {
    issue(math.from, math.from + math.token.length, "Unclosed math delimiter.");
    opaque.push({ from: math.from, to: source.length });
  }
  for (const p of placements)
    if (documentStart < 0 || p.from >= documentStart)
      issue(p.from, p.to, p.message);
  closeLeft();
  for (const at of braces) issue(at, at + 1, "Opening { has no matching }.");
  for (const env of envs) {
    issue(env.from, env.body, `Unclosed ${env.name} environment.`);
    if (env.math) opaque.push({ from: env.from, to: source.length });
  }
  opaque.sort((a, b) => a.from - b.from || b.to - a.to);
  const merged: Range[] = [];
  for (const range of opaque) {
    const last = merged.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  const blocked = new Map(merged.map((r) => [r.from, r.to])),
    mask = new Uint8Array(source.length);
  function parse(from: number, to: number, plain: boolean, depth = 0) {
    if (depth > 128)
      throw new WritingLimit(
        "Prose checking supports at most 128 nested text groups.",
      );
    for (let i = from; i < to;) {
      budget();
      const hidden = blocked.get(i);
      if (hidden) {
        i = hidden;
        continue;
      }
      if (source[i] === "\\") {
        const cmd = command(i);
        if (!cmd) {
          i++;
          continue;
        }
        let end = cmd.to;
        const { name } = cmd;
        if (name === "begin") {
          const env = environments.get(i);
          if (env) {
            let body = env.body;
            const opt = group(body);
            if (opt && source[opt.from] === "[") body = opt.to;
            if (
              ["tabular", "tabular*", "tabularx", "minipage"].includes(env.name)
            ) {
              for (
                let n = 0;
                n < (["tabular*", "tabularx"].includes(env.name) ? 2 : 1);
                n++
              ) {
                const g = group(body);
                if (g) body = g.to;
              }
            }
            parse(
              body,
              env.end,
              env.name === "document"
                ? true
                : env.name === "figure" || env.name === "figure*"
                  ? false
                  : plain,
              depth + 1,
            );
            i = env.to;
            continue;
          }
        }
        if (textCommands.has(name)) {
          let g = group(end);
          if (g && source[g.from] === "[") {
            end = g.to;
            g = group(end);
          }
          if (name === "captionof" && g) {
            end = g.to;
            g = group(end);
          }
          if (g && source[g.from] === "{") {
            parse(g.from + 1, g.to - 1, true, depth + 1);
            i = g.to;
            continue;
          }
        }
        if (
          name === "href" ||
          name === "hyperref" ||
          name === "texorpdfstring"
        ) {
          const a = group(end),
            b = a && group(a.to);
          if (a && b) {
            const text = name === "texorpdfstring" ? a : b;
            parse(text.from + 1, text.to - 1, true, depth + 1);
            i = b.to;
            continue;
          }
        }
        if (
          [
            "'",
            "`",
            "^",
            '"',
            "~",
            "=",
            ".",
            "u",
            "v",
            "H",
            "c",
            "d",
            "b",
            "r",
            "k",
          ].includes(name)
        ) {
          // TeX accent macros interrupt source words. Avoid reporting their fragments.
          let start = i;
          while (start > from && /\p{L}/u.test(source[start - 1])) start--;
          end = args(end);
          if (end === cmd.to && /\p{L}/u.test(source[end] || "")) end++;
          while (end < to && /\p{L}/u.test(source[end])) end++;
          mask.fill(0, start, end);
          i = end;
          continue;
        }
        i = args(end);
        continue;
      }
      if (plain && source[i] !== "{" && source[i] !== "}") mask[i] = 1;
      i++;
    }
  }
  parse(0, source.length, documentStart < 0);
  // A document's closing material and preamble are not ordinary prose.
  if (documentStart >= 0) mask.fill(0, documentEnd, source.length);
  const spans: Range[] = [];
  for (let i = 0; i < mask.length;) {
    if (!mask[i]) {
      i++;
      continue;
    }
    const from = i;
    while (i < mask.length && mask[i]) i++;
    spans.push({ from, to: i });
  }
  return {
    issues,
    spans,
    notice: limited ? "Showing the first 500 LaTeX issues." : undefined,
  };
}

export function checkWriting(
  source: string,
  codeCheck: boolean,
  correct?: (word: string) => boolean,
  ignored: readonly string[] = [],
): WritingResult {
  const scan = scanLatex(source, codeCheck),
    issues = [...scan.issues],
    proseEnds = new Set(scan.spans.map((span) => span.to)),
    seen = new Map<string, boolean>(),
    ignore = new Set(ignored.map(wordKey));
  let words = 0,
    limited = false;
  const started = Date.now();
  if (correct)
    for (const span of scan.spans) {
      const text = source.slice(span.from, span.to),
        urls = [
          ...text.matchAll(/(?:https?:\/\/|mailto:|www\.)[^\s{}]+/gi),
        ].map((m) => ({ from: m.index!, to: m.index! + m[0].length }));
      for (const match of text.matchAll(
        /\p{Script=Latin}[\p{Script=Latin}\p{M}]*(?:['’-][\p{Script=Latin}\p{M}]+)*/gu,
      )) {
        if (++words > WRITING_WORDS)
          throw new WritingLimit(
            "Spelling checks are limited to 50,000 words per file.",
          );
        if (words % 256 === 0 && Date.now() - started > 2000)
          throw new WritingLimit(
            "Spelling checks took too long. Try a smaller file or disable checks for this file.",
          );
        const word = match[0],
          at = span.from + match.index!,
          end = at + word.length,
          key = wordKey(word);
        if (
          word.length < 2 ||
          word.length > 64 ||
          /^[A-Z]{2,}$/.test(word) ||
          ignore.has(key) ||
          urls.some((u) => match.index! >= u.from && match.index! < u.to)
        )
          continue;
        // Joined command fragments cannot be safely replaced as a contiguous word.
        if (
          /^\\(?:text(?:bf|it|rm|sf|normal|up|md|sl|sc)|emph|underline|enquote)\*?\{/.test(
            source.slice(end, end + 30),
          ) ||
          (source[end] === "}" && /\p{L}/u.test(source[end + 1] || "")) ||
          (source[at - 1] === "}" &&
            proseEnds.has(at - 1) &&
            /\p{L}/u.test(source[at - 2] || ""))
        )
          continue;
        let valid = seen.get(word);
        if (valid === undefined) {
          valid = correct(word.replaceAll("’", "'"));
          seen.set(word, valid);
        }
        if (!valid) {
          if (issues.length >= WRITING_ISSUES) {
            limited = true;
            continue;
          }
          issues.push({
            id: `spelling:${at}`,
            kind: "spelling",
            from: at,
            to: end,
            word,
            message: `Possible misspelling: ${word}`,
          });
        }
      }
    }
  issues.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    issues,
    words,
    notice: limited ? "Showing the first 500 writing issues." : scan.notice,
  };
}
