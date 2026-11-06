import path from "node:path";
import { createHash } from "node:crypto";
import { structuredPatch } from "diff";
import { maskTexComments } from "../shared/project-intelligence";
import {
  movedPath,
  type FileMove,
  type ReferenceReview,
} from "../shared/file-moves";

export interface ReferenceSource {
  path: string;
  revision: number;
  content: string;
}
export interface ReferenceChange {
  from: string;
  to: string;
  before: string;
  after: string;
  revision: number;
  changes: number;
}
type Argument = { from: number; to: number; value: string };
type Reference = Argument & {
  command: string;
  line: number;
  extensions: string[];
  graphics?: boolean;
};
type Warning = ReferenceReview["warnings"][number];
type Scan = {
  references: Reference[];
  graphics: Argument[];
  warnings: Warning[];
  imports: string[];
  dynamicGraphics: boolean;
  unavailable?: string;
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const extensions: Record<string, string[]> = {
  input: [".tex"],
  include: [".tex"],
  includeonly: [".tex"],
  subfile: [".tex"],
  includegraphics: [".pdf", ".png", ".jpg", ".jpeg", ".eps", ".ps", ".mps"],
  bibliography: [".bib"],
  addbibresource: [".bib"],
  bibliographystyle: [".bst"],
  usepackage: [".sty"],
  RequirePackage: [".sty"],
  documentclass: [".cls"],
  LoadClass: [".cls"],
  includepdf: [".pdf"],
  verbatiminput: [],
  VerbatimInput: [],
  lstinputlisting: [],
  IfFileExists: [".tex"],
  InputIfFileExists: [".tex"],
};
const lists = new Set([
  "bibliography",
  "includeonly",
  "usepackage",
  "RequirePackage",
]);
const normalize = (name: string) => {
  if (!name || /[\\{}#$%~^&"\0\r\n]/u.test(name) || name.includes(":"))
    return null;
  const clean = path.posix.normalize(name);
  return clean === ".." || clean.startsWith("../") || clean.startsWith("/")
    ? null
    : clean.replace(/\/$/, "");
};
export function scanLatexFileReferences(source: ReferenceSource): Scan {
  const text = maskTexComments(source.content),
    result: Scan = {
      references: [],
      graphics: [],
      warnings: [],
      imports: [],
      dynamicGraphics: false,
    };
  const pairs = new Map<number, number>(),
    braces: number[] = [],
    brackets: { at: number; depth: number }[] = [],
    lines = [0];
  for (const match of text.matchAll(/\n/g)) lines.push(match.index! + 1);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") braces.push(i);
    if (text[i] === "}" && braces.length) {
      pairs.set(braces.pop()!, i);
      while (brackets.length && brackets.at(-1)!.depth > braces.length)
        brackets.pop();
    }
    if (text[i] === "[") brackets.push({ at: i, depth: braces.length });
    if (text[i] === "]" && brackets.at(-1)?.depth === braces.length)
      pairs.set(brackets.pop()!.at, i);
    if (pairs.size > 100000 || braces.length > 64) {
      result.unavailable =
        "A source file is too structurally complex for reference review.";
      return result;
    }
  }
  const line = (at: number) => {
    let lo = 0,
      hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (lines[mid] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const warn = (at: number, message: string) => {
    if (result.warnings.length < 49)
      result.warnings.push({ path: source.path, line: line(at), message });
    else if (result.warnings.length === 49)
      result.warnings.push({
        path: source.path,
        line: line(at),
        message:
          "Additional unresolved reference notes are omitted; review custom paths manually.",
      });
  };
  const space = (at: number) => {
    while (at < text.length && /\s/.test(text[at])) at++;
    return at;
  };
  function group(at: number, open = "{"): Argument | null {
    at = space(at);
    if (text[at] !== open) return null;
    const end = pairs.get(at);
    return end === undefined
      ? null
      : { from: at + 1, to: end, value: source.content.slice(at + 1, end) };
  }
  function literal(arg: Argument): Argument | null {
    const leading = arg.value.length - arg.value.trimStart().length,
      trimmed = arg.value.trim();
    const detokenized = /^\\detokenize\s*\{([^{}]+)\}$/.exec(trimmed);
    const quoted =
      trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1;
    const value = detokenized
      ? detokenized[1]
      : quoted
        ? trimmed.slice(1, -1)
        : trimmed;
    if (normalize(value) === null || value.includes('"')) return null;
    const from =
      arg.from +
      leading +
      (detokenized ? trimmed.indexOf("{") + 1 : Number(quoted));
    return {
      from,
      to: from + value.length,
      value,
    };
  }
  function definition(at: number, name: string) {
    let end = space(at),
      groups = /environment/i.test(name) ? 2 : 1;
    if (text[end] === "*") end = space(end + 1);
    const head = group(end);
    if (head) end = space(head.to + 1);
    else {
      const token = /^\\[A-Za-z@]+/.exec(text.slice(end, end + 200));
      if (token) end = space(end + token[0].length);
      else return at;
    }
    if (/Document/.test(name)) {
      const spec = group(end);
      if (!spec) return at;
      end = space(spec.to + 1);
    } else
      for (let n = 0; n < 2; n++) {
        const option = group(end, "[");
        if (!option) break;
        end = space(option.to + 1);
      }
    for (let n = 0; n < groups; n++) {
      const body = group(end);
      if (!body) return end;
      if (
        /\\(?:input|include|includegraphics|bibliography|addbibresource)\b/.test(
          body.value,
        )
      )
        warn(
          body.from,
          "File references inside command definitions need manual review.",
        );
      end = space(body.to + 1);
    }
    return end;
  }
  for (let i = 0; i < text.length;) {
    if (result.references.length + result.graphics.length > 10000) {
      result.unavailable =
        "A source file has too many references for one review.";
      break;
    }
    if (text[i] !== "\\") {
      i++;
      continue;
    }
    const command = /^\\([A-Za-z@]+|[^\r\n])/.exec(text.slice(i, i + 200));
    if (!command) {
      i++;
      continue;
    }
    const name = command[1],
      start = i;
    i += command[0].length;
    if (["string", "noexpand"].includes(name)) {
      i = space(i);
      const token = /^\\(?:[A-Za-z@]+|.)/.exec(text.slice(i, i + 200));
      i += token?.[0].length ?? 1;
      continue;
    }
    if (
      [
        "detokenize",
        "unexpanded",
        "scantokens",
        "url",
        "nolinkurl",
        "path",
      ].includes(name)
    ) {
      const body = group(i);
      if (body) i = body.to + 1;
      continue;
    }
    if (["verb", "Verb", "lstinline", "mintinline"].includes(name)) {
      if (text[i] === "*") i++;
      const option = group(i, "[");
      if (option) i = option.to + 1;
      if (name === "mintinline") {
        const language = group(i);
        if (language) i = language.to + 1;
      }
      if (text[i] === "{") {
        const value = group(i);
        i = value ? value.to + 1 : text.length;
        continue;
      }
      const delimiter = text[i];
      if (delimiter && !/[A-Za-z\s]/.test(delimiter)) {
        const end = text.indexOf(delimiter, i + 1);
        i = end < 0 ? text.length : end + 1;
      }
      continue;
    }
    if (name === "begin") {
      const env = group(i);
      if (
        env &&
        /^(?:verbatim\*?|Verbatim\*?|lstlisting|minted|comment|filecontents\*?)$/.test(
          env.value,
        )
      ) {
        const ending = `\\end{${env.value}}`,
          end = text.indexOf(ending, env.to + 1);
        i = end < 0 ? text.length : end + ending.length;
        continue;
      }
    }
    if (
      /^(?:(?:renew|provide|new)command|DeclareRobustCommand|(?:renew|new)environment|(?:New|Renew|Provide|Declare)Document(?:Command|Environment))$/.test(
        name,
      )
    ) {
      i = definition(i, name);
      continue;
    }
    if (/^(?:e|g|x)?def$/.test(name)) {
      const bodyStart = text.indexOf("{", i),
        body = bodyStart >= 0 ? group(bodyStart) : null;
      if (body) {
        if (
          /\\(?:input|include|includegraphics|bibliography|addbibresource)\b/.test(
            body.value,
          )
        )
          warn(
            body.from,
            "File references inside command definitions need manual review.",
          );
        i = body.to + 1;
      } else i = text.length;
      continue;
    }
    if (name === "catcode" || name === "ExplSyntaxOn") {
      warn(
        start,
        "Custom TeX token syntax needs manual reference review after this point.",
      );
      break;
    }
    if (
      [
        "import",
        "subimport",
        "inputfrom",
        "subinputfrom",
        "includefrom",
        "subincludefrom",
      ].includes(name)
    ) {
      const dir = group(i);
      const value = dir && literal(dir);
      if (value) result.imports.push(normalize(value.value)!);
      warn(
        start,
        "Import-package paths and their source files need manual review.",
      );
      if (dir) i = dir.to + 1;
      continue;
    }
    if (name === "graphicspath") {
      const outer = group(i);
      if (!outer) {
        result.dynamicGraphics = true;
        warn(start, "A graphics search path could not be resolved literally.");
        continue;
      }
      let cursor = space(outer.from),
        valid = true;
      while (cursor < outer.to) {
        const inner = group(cursor),
          value = inner && literal(inner);
        if (!value) {
          valid = false;
          break;
        }
        result.graphics.push(value);
        cursor = space(inner!.to + 1);
      }
      if (!valid) {
        result.dynamicGraphics = true;
        warn(start, "Dynamic graphics search paths need manual review.");
      }
      i = outer.to + 1;
      continue;
    }
    if (!Object.hasOwn(extensions, name)) continue;
    if (text[i] === "*") i++;
    for (let n = 0; n < 2; n++) {
      const option = group(i, "[");
      if (!option) break;
      i = option.to + 1;
    }
    let arg = group(i);
    if (!arg && name === "input") {
      const from = space(i),
        value = /^[^\s\\{}%#$]+/.exec(text.slice(from));
      if (value) arg = { from, to: from + value[0].length, value: value[0] };
    }
    if (!arg) {
      warn(start, `\\${name} has no supported literal filename.`);
      continue;
    }
    const args: Argument[] = [];
    if (lists.has(name)) {
      let offset = 0;
      for (const value of arg.value.split(",")) {
        args.push({
          from: arg.from + offset,
          to: arg.from + offset + value.length,
          value,
        });
        offset += value.length + 1;
      }
    } else args.push(arg);
    for (const part of args) {
      const value = literal(part);
      if (value)
        result.references.push({
          ...value,
          command: name,
          line: line(value.from),
          extensions: extensions[name],
          graphics: name === "includegraphics",
        });
      else if (part.value.trim())
        warn(part.from, `Dynamic \\${name} paths are unchanged.`);
    }
    if (name === "subfile") {
      const value = literal(arg);
      if (value)
        result.imports.push(path.posix.dirname(normalize(value.value)!));
      warn(
        start,
        "Subfiles can use a different base directory; review their nested references manually.",
      );
    }
    i = arg.to + (text[arg.to] === "}" ? 1 : 0);
  }
  return result;
}

export function matchingProjectFiles(
  value: string,
  exts: string[],
  files: Set<string>,
  dirs = [""],
) {
  const clean = normalize(value);
  if (clean === null) return [];
  return [
    ...new Set(
      dirs.flatMap((dir) => {
        const base = path.posix.join(dir, clean);
        return files.has(base)
          ? [base]
          : exts.map((ext) => base + ext).filter((f) => files.has(f));
      }),
    ),
  ];
}

export function planReferenceUpdates(
  projectId: string,
  generation: number,
  moves: FileMove[],
  sources: ReferenceSource[],
  filePaths: string[],
  { diffTimeout = 1000, diffMaxEditLength = 20000 } = {},
) {
  const deadline = Date.now() + 5000;
  const review: ReferenceReview = {
    token: "",
    files: [],
    warnings: [],
    scannedFiles: sources.length,
  };
  const changes: ReferenceChange[] = [];
  if (
    sources.reduce((sum, s) => sum + Buffer.byteLength(s.content), 0) >
    32 * 1024 * 1024
  ) {
    review.unavailable =
      "The source exceeds the 32 MB reference-review limit. Move without updates or split the operation.";
    return { review, changes };
  }
  const scans = sources.map((source) => ({
      source,
      scan: scanLatexFileReferences(source),
    })),
    oldFiles = new Set(filePaths),
    newFiles = new Set(filePaths.map((f) => movedPath(f, moves)));
  const oldDirs = [
      ...new Set(
        scans.flatMap(({ scan }) =>
          scan.graphics.map((g) => normalize(g.value)!),
        ),
      ),
    ],
    newDirs = oldDirs.map((d) => (d === "." ? d : movedPath(d, moves)));
  if (oldDirs.length > 256) {
    review.unavailable =
      "Too many graphics search paths for one reference review. Move without updates or reduce the search paths.";
    return { review, changes };
  }
  if (newDirs.some((dir) => normalize(dir) === null))
    review.unavailable =
      "A moved graphics search path needs TeX escaping. Move without updates and adjust that path manually.";
  const imports = scans.flatMap(({ scan }) => scan.imports),
    dynamicGraphics = scans.some(({ scan }) => scan.dynamicGraphics);
  for (const { source, scan: parsed } of scans) {
    if (Date.now() > deadline) {
      review.unavailable =
        "Reference analysis took too long. Move without updates or move fewer items.";
      break;
    }
    if (parsed.unavailable) {
      review.unavailable = parsed.unavailable;
      continue;
    }
    review.warnings.push(...parsed.warnings);
    const uncertain = imports.some(
      (dir) =>
        dir !== "." &&
        (source.path === dir || source.path.startsWith(dir + "/")),
    );
    if (uncertain) {
      review.warnings.push({
        path: source.path,
        line: 1,
        message:
          "This file may be read through an import/subfiles base directory; its references are unchanged.",
      });
      continue;
    }
    const edits: { from: number; to: number; insert: string }[] = [];
    const add = (arg: Argument, target: string) => {
      const prefix = arg.value.startsWith("./") ? "./" : "";
      const insert = prefix + target;
      if (insert !== arg.value)
        edits.push({ from: arg.from, to: arg.to, insert });
    };
    for (const dir of parsed.graphics) {
      const clean = normalize(dir.value)!;
      if (clean !== ".") {
        const target = movedPath(clean, moves);
        if (target !== clean)
          add(dir, target + (dir.value.endsWith("/") ? "/" : ""));
      }
    }
    let checkedReferences = 0;
    for (const ref of parsed.references) {
      if ((checkedReferences++ & 127) === 0 && Date.now() > deadline) {
        review.unavailable =
          "Reference analysis took too long. Move without updates or move fewer items.";
        review.files = [];
        return { review, changes: [] };
      }
      if (ref.graphics && dynamicGraphics) continue;
      const dirs = ref.graphics ? ["", ...oldDirs] : [""],
        nextDirs = ref.graphics ? ["", ...newDirs] : [""];
      const found = matchingProjectFiles(
          ref.value,
          ref.extensions,
          oldFiles,
          dirs,
        ),
        affected = found.filter((f) => movedPath(f, moves) !== f);
      if (!affected.length) continue;
      const warning = (message: string) =>
        review.warnings.push({
          path: source.path,
          line: ref.line,
          message,
        });
      if (found.length !== 1) {
        warning(
          `Ambiguous \\${ref.command} filename is unchanged: ${ref.value}`,
        );
        continue;
      }
      const before = found[0],
        after = movedPath(before, moves),
        still = matchingProjectFiles(
          ref.value,
          ref.extensions,
          newFiles,
          nextDirs,
        );
      if (still.length === 1 && still[0] === after) continue;
      let target = after;
      const oldExtension = ref.extensions.find(
        (ext) =>
          before === normalize(ref.value)! + ext ||
          before.endsWith("/" + normalize(ref.value)! + ext),
      );
      if (oldExtension && after.endsWith(oldExtension))
        target = after.slice(0, -oldExtension.length);
      const predicted = matchingProjectFiles(
        target,
        ref.extensions,
        newFiles,
        nextDirs,
      );
      if (
        (lists.has(ref.command) ||
          ref.command === "documentclass" ||
          ref.command === "LoadClass") &&
        target.includes(",")
      ) {
        warning(
          `The new \\${ref.command} filename contains a comma; adjust it manually.`,
        );
        continue;
      }
      if (predicted.length !== 1 || predicted[0] !== after) {
        warning(
          `The new \\${ref.command} filename has multiple resolutions; adjust it manually.`,
        );
        continue;
      }
      add(ref, target);
    }
    if (!edits.length) continue;
    edits.sort((a, b) => a.from - b.from);
    const chunks: string[] = [];
    let cursor = 0;
    for (const edit of edits) {
      chunks.push(source.content.slice(cursor, edit.from), edit.insert);
      cursor = edit.to;
    }
    chunks.push(source.content.slice(cursor));
    const after = chunks.join("");
    if (Buffer.byteLength(after) > 2 * 1024 * 1024) {
      review.unavailable =
        "A proposed source file exceeds the 2 MB editing limit. Move without updates and adjust it manually.";
      continue;
    }
    const to = movedPath(source.path, moves),
      patch = structuredPatch(source.path, to, source.content, after, "", "", {
        context: 3,
        timeout: diffTimeout,
        maxEditLength: diffMaxEditLength,
      });
    if (!patch) {
      review.unavailable =
        "The reference diff exceeds its computation limit. Move without updates or move fewer items.";
      continue;
    }
    const diff =
      [
        `--- ${source.path}`,
        `+++ ${to}`,
        ...patch.hunks.flatMap((hunk) => [
          `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          ...hunk.lines,
        ]),
      ].join("\n") + "\n";
    changes.push({
      from: source.path,
      to,
      before: source.content,
      after,
      revision: source.revision,
      changes: edits.length,
    });
    review.files.push({
      path: source.path,
      toPath: to,
      revision: source.revision,
      changes: edits.length,
      diff,
    });
  }
  if (
    review.files.reduce((sum, f) => sum + Buffer.byteLength(f.diff), 0) >
    2 * 1024 * 1024
  ) {
    review.unavailable =
      "The reference diff exceeds 2 MB. Move without updates or move fewer items.";
    review.files = [];
  }
  if (review.warnings.length > 200) {
    review.warnings = review.warnings.slice(0, 199);
    review.warnings.push({
      path: "",
      line: 0,
      message:
        "Additional unresolved references are omitted; review custom paths manually.",
    });
  }
  review.token = hash(
    JSON.stringify({
      projectId,
      generation,
      moves,
      changes: changes.map((c) => ({
        from: c.from,
        to: c.to,
        revision: c.revision,
        before: hash(c.before),
        after: hash(c.after),
      })),
    }),
  );
  return { review, changes };
}
