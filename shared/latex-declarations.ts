import { scanEnvironments } from "./latex-environments";
import type { SourceText } from "./project-intelligence";
import { maskTexComments } from "./tex-comments";

export interface CommandDeclaration {
  name: string;
  path: string;
  line: number;
  from: number;
  to: number;
}
export interface PackageDeclaration {
  name: string;
  path: string;
  line: number;
  local: boolean;
  from?: number;
  to?: number;
}
const commandKinds = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "NewDocumentCommand",
  "RenewDocumentCommand",
  "ProvideDocumentCommand",
  "DeclareDocumentCommand",
  "def",
  "gdef",
  "edef",
  "xdef",
]);
function space(text: string, at: number) {
  while (at < text.length) {
    if (/\s/.test(text[at])) at++;
    else if (text[at] === "%") {
      const end = text.indexOf("\n", at);
      at = end < 0 ? text.length : end + 1;
    } else break;
  }
  return at;
}
/** Literal declarations only; the shared scanner excludes comments, raw text and nested definition bodies. */
export function sourceDeclarations(source: SourceText) {
  const scan = scanEnvironments(source.content),
    commands: CommandDeclaration[] = [],
    packages: PackageDeclaration[] = [];
  if (scan.limited)
    return { commands, packages, opaque: scan.opaque, limited: true };
  const starts = [0];
  for (let i = 0; i < source.content.length; i++)
    if (source.content[i] === "\n") starts.push(i + 1);
  const lineAt = (at: number) => {
    let lo = 0,
      hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let limited = false;
  for (const range of scan.opaque) {
    if (!range.declaration || !commandKinds.has(range.declaration)) continue;
    let at = space(source.content, range.from + range.declaration.length + 1);
    const primitive = /^(?:def|gdef|edef|xdef)$/.test(range.declaration);
    if (primitive && (source.content[at] === "*" || source.content[at] === "{"))
      continue;
    if (source.content[at] === "*") at = space(source.content, at + 1);
    const braced = source.content[at] === "{";
    if (braced) at = space(source.content, at + 1);
    const match = /^\\([A-Za-z@]{1,128})(?![A-Za-z@])/.exec(
      source.content.slice(at, at + 132),
    );
    if (
      !match ||
      (braced &&
        source.content[space(source.content, at + match[0].length)] !== "}")
    )
      continue;
    // The common expandafter/def/csname idiom defines a computed name. A direct
    // def of csname itself is still a literal definition, so retain that case.
    if (
      primitive &&
      match[1] === "csname" &&
      /(?:^|[^\\])(?:\\\\)*\\expandafter\s*$/.test(
        maskTexComments(
          source.content.slice(Math.max(0, range.from - 4000), range.from),
        ),
      )
    )
      continue;
    const targetEnd = braced
      ? space(source.content, at + match[0].length) + 1
      : at + match[0].length;
    if (
      !primitive &&
      !["{", "["].includes(source.content[space(source.content, targetEnd)])
    )
      continue;
    if (commands.length >= 2000) {
      limited = true;
      break;
    }
    commands.push({
      name: match[1],
      path: source.path,
      line: lineAt(range.from),
      from: at,
      to: at + match[0].length,
    });
  }
  const pieces: string[] = [];
  let at = 0;
  for (const range of scan.opaque) {
    pieces.push(
      source.content.slice(at, range.from),
      source.content.slice(range.from, range.to).replace(/[^\n]/g, " "),
    );
    at = range.to;
  }
  pieces.push(source.content.slice(at));
  const visible = pieces.join("");
  for (const match of visible.matchAll(
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{([^{}]*)\}/g,
  )) {
    // A doubled slash is a literal line break followed by text, not a package load.
    let slashes = 0;
    for (let i = match.index! - 1; i >= 0 && visible[i] === "\\"; i--)
      slashes++;
    if (slashes % 2) continue;
    for (const name of match[1].split(",").map((n) => n.trim())) {
      if (
        !/^[A-Za-z0-9@_./-]{1,200}$/.test(name) ||
        name.split("/").some((s) => !s || s === "." || s === "..")
      )
        continue;
      if (packages.length >= 2000) {
        limited = true;
        break;
      }
      packages.push({
        name,
        path: source.path,
        line: lineAt(match.index!),
        local: false,
        from: match.index!,
        to: match.index! + match[0].length,
      });
    }
  }
  if (/\.sty$/i.test(source.path))
    packages.unshift({
      name: source.path.slice(0, -4),
      path: source.path,
      line: 1,
      local: true,
    });
  return { commands, packages, opaque: scan.opaque, limited };
}
