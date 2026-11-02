import fs from "node:fs";
import path from "node:path";
import type { Diagnostic } from "../shared/types";
import { within } from "./files";

export const DIAGNOSTICS_VERSION = 2;
const LOG_BYTES = 1_000_000,
  TOTAL_BYTES = 4_000_000;
const LIMITED =
  "Diagnostics were limited. Inspect the generated logs for additional messages.";
const key = (s: string) => s.normalize("NFC").replace(/^\.\//, "");
export function finalizeDiagnostics(diagnostics: Diagnostic[]) {
  const seen = new Set<string>();
  const sorted = diagnostics
    .filter((d) => {
      d.message = d.message.replace(/\s+/g, " ").trim().slice(0, 1600);
      if (!d.message) return false;
      const id = JSON.stringify([d.severity, d.path, d.line, d.message]);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
    );
  return sorted.length > 150
    ? [
        ...sorted.slice(0, 149).filter((d) => d.message !== LIMITED),
        { severity: "warning" as const, message: LIMITED },
      ]
    : sorted;
}
type Context = { source?: string; files?: string[]; truncated?: boolean };
type Trie = { children: Map<string, Trie>; file?: string };
class Locations {
  private aliases = new Map<string, string>();
  private frames: { file: boolean; path?: string }[] = [];
  private trie: Trie = { children: new Map() };
  constructor(
    private root: string,
    private context: Context,
  ) {
    for (const file of context.files ?? [root]) {
      const canonical = key(file);
      for (const alias of [
        canonical,
        "./" + canonical,
        ...(context.source ? [path.join(context.source, canonical)] : []),
      ]) {
        this.aliases.set(key(alias).toLowerCase(), canonical);
        let node = this.trie;
        for (const char of alias.normalize("NFC").split("")) {
          if (!node.children.has(char))
            node.children.set(char, { children: new Map() });
          node = node.children.get(char)!;
        }
        node.file = canonical;
      }
    }
  }
  resolve(raw: string) {
    const clean = raw.trim().replace(/^"|"$/g, "");
    const found = this.aliases.get(key(clean).toLowerCase());
    if (found) return found;
    // Standalone parser compatibility: production always supplies an inventory.
    if (
      !this.context.files &&
      !path.isAbsolute(clean) &&
      !clean.split("/").includes("..") &&
      !/[\0\\]/.test(clean)
    )
      return key(clean);
  }
  current() {
    for (let i = this.frames.length - 1; i >= 0; i--)
      if (this.frames[i].file) return this.frames[i].path;
    return this.context.truncated ? undefined : this.root;
  }
  scan(text: string, start: number, end: number) {
    let scanned = end;
    for (let i = start; i < end; i++) {
      if (text[i] === ")") {
        this.frames.pop();
        continue;
      }
      if (text[i] !== "(") continue;
      const quoted = text[i + 1] === '"';
      let node = this.trie,
        cursor = i + (quoted ? 2 : 1),
        found: { path: string; end: number } | undefined;
      let column = cursor - text.lastIndexOf("\n", cursor - 1) - 1;
      for (
        let count = 0;
        count < 1100 && cursor < text.length;
        count++, cursor++
      ) {
        if (text[cursor] === "\n" && column >= 79) {
          column = 0;
          continue;
        }
        if (text[cursor] === "\r" && text[cursor + 1] === "\n") continue;
        const next = node.children.get(text[cursor]);
        if (!next) break;
        node = next;
        column++;
        if (node.file && (!text[cursor + 1] || /[\s)"]/.test(text[cursor + 1])))
          found = {
            path: node.file,
            end: cursor + (quoted && text[cursor + 1] === '"' ? 1 : 0),
          };
      }
      if (found) {
        this.frames.push({ file: true, path: found.path });
        i = found.end;
        scanned = Math.max(scanned, found.end + 1);
      } else {
        const candidate = text.slice(i + 1, i + 1100);
        const file =
          /^"?(?:\.\/|\/)/.test(candidate) ||
          /^"?[\w.-][^()\n]*?\.(?:tex|sty|cls|clo|def|aux|bbl|cfg|fd|ldf)(?:[\s)"]|$)/.test(
            candidate,
          );
        this.frames.push({ file });
      }
      if (this.frames.length > 1000) this.frames.splice(0, 500);
    }
    return scanned;
  }
  location(
    raw: string,
    line: number,
    message: string,
  ): Partial<Diagnostic> & { message: string } {
    const resolved = this.resolve(raw);
    return resolved
      ? { path: resolved, line, message }
      : {
          message: `${path.basename(raw.replace(/^"|"$/g, ""))}:${line}: ${message}`,
        };
  }
}
const warning =
  /(?:LaTeX(?: Font)?|Package [\w@.-]+|Class [\w@.-]+) Warning:|(?:Overfull|Underfull) \\[hv]box/;
function texDiagnostics(log: string, root: string, context: Context = {}) {
  const raw = log.normalize("NFC").replace(/\r\n/g, "\n").split("\n");
  // TeX hard-wraps file:line errors as well as their message bodies. Only join
  // diagnostic-looking lines; preserve file-stack and source-context records.
  const joined: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (/^! |^"?\.?\/|^\s*"?.+?\.\w+"?:\d+:/.test(line)) {
      for (
        let count = 0;
        count < 8 && raw[i].length >= 79 && i + 1 < raw.length;
        count++
      ) {
        const next = raw[i + 1];
        if (
          !next ||
          /^! |^l\.\d+|^\(|^\[|^LaTeX |^Package |^"?\.?\/.*:\d+:/.test(next)
        )
          break;
        line += next;
        i++;
      }
    }
    joined.push(line);
  }
  const text = joined.join("\n"),
    lines = text.split("\n");
  const locations = new Locations(root, context),
    results: Diagnostic[] = [];
  let offset = 0,
    scanned = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      start = offset;
    offset += line.length + 1;
    const explicit = line.match(/^\s*("?.+?\.[\w]+"?):(\d+):\s*(.+)$/);
    const warn = line.match(warning),
      bang = line.match(/^!\s+(.+)/);
    if (explicit) {
      results.push({
        severity: warning.test(explicit[3]) ? "warning" : "error",
        ...locations.location(explicit[1], Number(explicit[2]), explicit[3]),
      });
      continue;
    }
    if (!warn && !bang) {
      scanned = Math.max(
        scanned,
        locations.scan(text, Math.max(start, scanned), offset - 1),
      );
      // A known wrapped filename can span multiple log lines; don't rescan it.
      scanned = Math.max(scanned, offset);
      continue;
    }
    if (warn?.index)
      locations.scan(text, Math.max(start, scanned), start + warn.index);
    const file = locations.current();
    let message = bang ? bang[1] : line.slice(warn!.index),
      number: number | undefined;
    if (warn) {
      for (let n = 0; n < 8 && i + 1 < lines.length; n++) {
        const next = lines[i + 1];
        if (
          !next.trim() ||
          warning.test(next) ||
          /^!|^l\.\d+|^\S+\.\w+:\d+:/.test(next)
        )
          break;
        if (
          (/^\(/.test(next) && !/^\([\w@.-]+\)\s+/.test(next)) ||
          /^\[|^Output written|^Transcript written/.test(next)
        )
          break;
        if (!/^\([\w@.-]+\)\s+|^\s{2,}\S/.test(next) && lines[i].length < 79)
          break;
        message += " " + next.replace(/^\([\w@.-]+\)\s*/, "").trim();
        i++;
        offset += next.length + 1;
      }
      const ln = message.match(/(?:input line|at lines?|lines?)\s+(\d+)/);
      number = ln ? Number(ln[1]) : undefined;
    } else {
      for (const following of lines.slice(i + 1, i + 7)) {
        const ln = following.match(/^l\.(\d+)\b/);
        if (ln) {
          number = Number(ln[1]);
          break;
        }
        if (/^!|^\S+\.\w+:\d+:/.test(following)) break;
      }
    }
    results.push({
      severity: bang ? "error" : "warning",
      message,
      ...(file ? { path: file, ...(number ? { line: number } : {}) } : {}),
    });
    scanned = offset;
  }
  return results;
}
export function parseDiagnostics(log: string, root: string) {
  return finalizeDiagnostics(texDiagnostics(log, root));
}
function bibliography(log: string, locations: Locations) {
  const results: Diagnostic[] = [];
  for (const line of log.split(/\r?\n/)) {
    const biber = line.match(/\b(WARN|ERROR|FATAL)\s+-\s+(.+)/);
    if (biber) {
      const loc = biber[2].match(/([^'"\s,]+\.bib),?\s+(?:at\s+)?line\s+(\d+)/);
      results.push({
        severity: biber[1] === "WARN" ? "warning" : "error",
        ...(loc
          ? locations.location(loc[1], Number(loc[2]), "Biber: " + biber[2])
          : { message: "Biber: " + biber[2] }),
      });
      continue;
    }
    const classic = line.match(/^(.*?)---?line\s+(\d+)\s+of file\s+(.+?)\s*$/);
    if (classic)
      results.push({
        severity: "error",
        ...locations.location(
          classic[3],
          Number(classic[2]),
          "BibTeX: " + classic[1],
        ),
      });
    else if (/^Warning--/.test(line))
      results.push({
        severity: "warning",
        message: "BibTeX: " + line.slice(9),
      });
    else if (
      /^I (?:couldn't|found no)\b|^Illegal,|^Too many |^Repeated entry|^You're missing|^You can't/.test(
        line,
      )
    )
      results.push({ severity: "error", message: "BibTeX: " + line });
  }
  if (
    !results.some((d) => d.severity === "error") &&
    /\(There (?:was|were) \d+ error message/.test(log)
  )
    results.push({
      severity: "error",
      message:
        "BibTeX reported errors. Inspect the generated .blg file for details.",
    });
  return results;
}
function phases(log: string) {
  const latest = new Map<string, string>();
  let name = "startup",
    text = "";
  for (const line of log.split("\n")) {
    const header = line.match(/^Latexmk: applying rule '(.+)'\.\.\./);
    if (header) {
      latest.delete(name);
      latest.set(name, text);
      name = header[1];
      text = "";
    } else text += line + "\n";
  }
  latest.delete(name);
  latest.set(name, text);
  return latest;
}
function toolDiagnostics(log: string) {
  const results: Diagnostic[] = [];
  for (const line of log.split(/\r?\n/)) {
    if (
      /^(?:Error:|(?:GPL |AFPL )?Ghostscript.*(?:error|fatal)|.*(?:dvips|dvipdfmx|xdvipdfmx):.*(?:!|error|fatal)|.*(?:Permission denied|Operation not permitted|command not found))/i.test(
        line,
      )
    )
      results.push({ severity: "error", message: line.trim() });
  }
  return results;
}
type Log = { text: string; truncated: boolean; bytes: number };
function readLog(dir: string, relative: string, limit = LOG_BYTES): Log | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      within(dir, relative),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || !Number.isSafeInteger(stat.size))
      return null;
    const bytes = Math.min(stat.size, limit),
      buffer = Buffer.alloc(bytes);
    fs.readSync(fd, buffer, 0, bytes, stat.size - bytes);
    let text = buffer.toString("utf8");
    if (stat.size > bytes) text = text.slice(text.indexOf("\n") + 1);
    return { text, truncated: stat.size > bytes, bytes };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function inventory(dir: string, subtree: string, max = 10000) {
  const files: string[] = [],
    queue = [""];
  let entries = 0,
    limited = false;
  while (queue.length && !limited) {
    const base = queue.pop()!;
    try {
      for (const entry of fs.readdirSync(
        within(dir, subtree + (base ? "/" + base : "")),
        { withFileTypes: true },
      )) {
        if (++entries > max) {
          limited = true;
          break;
        }
        const name = base ? base + "/" + entry.name : entry.name;
        if (entry.isDirectory()) queue.push(name);
        else if (entry.isFile()) files.push(name);
      }
    } catch {
      limited = true;
    }
  }
  return { files, limited };
}
/** Read finished snapshot artifacts, never paths supplied by their log text. */
export function buildDiagnostics(
  dir: string,
  root: string,
  consoleLog: string,
  failed = false,
) {
  const source = inventory(dir, "source"),
    context = { source: path.join(dir, "source"), files: source.files };
  const locations = new Locations(root, context),
    base = path.basename(root, ".tex");
  const final = readLog(dir, "out/" + base + ".log"),
    runs = phases(consoleLog);
  let limited = source.limited || !!final?.truncated,
    used = final?.bytes ?? 0;
  const results: Diagnostic[] = [];
  if (final)
    results.push(
      ...texDiagnostics(final.text, root, {
        ...context,
        truncated: final.truncated,
      }),
    );
  else {
    const lastTex = [...runs]
      .filter(([name]) => /^(?:pdf|xe|lua)?latex$/.test(name))
      .at(-1)?.[1];
    results.push(...texDiagnostics(lastTex ?? consoleLog, root, context));
  }
  const outputs = inventory(dir, "out");
  limited ||= outputs.limited;
  const bibliographyFiles = outputs.files
    .filter((file) => file.endsWith(".blg"))
    .sort();
  for (const file of bibliographyFiles.slice(0, 32)) {
    const budget = Math.min(LOG_BYTES, TOTAL_BYTES - used);
    if (budget <= 0) {
      limited = true;
      break;
    }
    const artifact = readLog(dir, "out/" + file, budget);
    if (artifact) {
      used += artifact.bytes;
      limited ||= artifact.truncated;
      results.push(...bibliography(artifact.text, locations));
    }
  }
  limited ||= bibliographyFiles.length > 32;
  for (const [name, text] of runs) {
    if (/^bib(?:tex|er)\b/.test(name))
      results.push(...bibliography(text, locations));
    else if (!/^(?:pdf|xe|lua)?latex$/.test(name))
      results.push(...toolDiagnostics(text));
  }
  if (failed) {
    const lifecycle = consoleLog
      .split("\n")
      .filter((line) =>
        /Build interrupted by server restart|Build exceeded the two-minute|Compiler supervision failed|selected TeX installation changed/.test(
          line,
        ),
      );
    results.push(
      ...lifecycle.map((message) => ({ severity: "error" as const, message })),
    );
    if (!results.some((d) => d.severity === "error"))
      results.push({
        severity: "error",
        message:
          "Compilation failed. " +
          consoleLog
            .split("\n")
            .filter(Boolean)
            .slice(-5)
            .join(" ")
            .slice(0, 600),
      });
  }
  if (limited) results.push({ severity: "warning", message: LIMITED });
  return finalizeDiagnostics(results);
}
