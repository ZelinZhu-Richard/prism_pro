import { parentPort, workerData } from "node:worker_threads";

// User regular expressions execute only inside this disposable worker.
const { files, options, replacement, expand, preview, selectOnly } = workerData;
function splitSurrogate(text, at) {
  return (
    at > 0 &&
    at < text.length &&
    text.charCodeAt(at - 1) >= 0xd800 &&
    text.charCodeAt(at - 1) <= 0xdbff &&
    text.charCodeAt(at) >= 0xdc00 &&
    text.charCodeAt(at) <= 0xdfff
  );
}
function substitute(template, match) {
  if (!expand) return template;
  return template.replace(/\$(\$|&|[1-9]\d?|<[^>]+>)/g, (original, token) => {
    if (token === "$") return "$";
    if (token === "&") return match[0];
    if (token.startsWith("<"))
      return match.groups ? (match.groups[token.slice(1, -1)] ?? "") : original;
    const index = Number(token);
    if (index < match.length) return match[index] ?? "";
    if (token.length === 2 && Number(token[0]) < match.length)
      return (match[Number(token[0])] ?? "") + token[1];
    return original;
  });
}
function patternList(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((glob) => {
      let source = "";
      for (let i = 0; i < glob.length; i++) {
        if (glob[i] === "*" && glob[i + 1] === "*") {
          i++;
          if (glob[i + 1] === "/") {
            i++;
            source += "(?:.*/)?";
          } else source += ".*";
        } else if (glob[i] === "*") source += "[^/]*";
        else if (glob[i] === "?") source += "[^/]";
        else source += glob[i].replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      }
      return new RegExp(
        (glob.includes("/") ? "^" : "(?:^|/)") + source + "$",
        "u",
      );
    });
}
function run() {
  const include = patternList(options.include),
    exclude = patternList(options.exclude);
  const selected = files.filter(
    (file) =>
      (!include.length || include.some((r) => r.test(file.path))) &&
      !exclude.some((r) => r.test(file.path)),
  );
  if (selectOnly) return { paths: selected.map((file) => file.path) };
  const source = options.regex
    ? options.query
    : options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(source, "gmu" + (options.caseSensitive ? "" : "i"));
  const result = { files: [], total: 0, truncated: false };
  const limit = preview ? 5000 : 1000;
  let scannedBytes = 0,
    replacementBytes = 0;
  for (const file of selected) {
    scannedBytes += Buffer.byteLength(file.content);
    if (scannedBytes > 32 * 1024 * 1024)
      throw new Error(
        "The search scope exceeds 32 MB. Refine the included files or exclusions.",
      );
    regex.lastIndex = 0;
    const matches = [],
      chunks = [];
    let match,
      count = 0,
      cursor = 0,
      line = 1,
      lineStart = 0,
      scan = 0,
      outputBytes = 0;
    while ((match = regex.exec(file.content))) {
      const from = match.index,
        to = from + match[0].length;
      if (match[0].length === 0)
        regex.lastIndex =
          from + (file.content.codePointAt(from) > 0xffff ? 2 : 1);
      if (
        options.wholeWord &&
        (/[\p{L}\p{N}\p{M}_]$/u.test(
          file.content.slice(Math.max(0, from - 2), from),
        ) ||
          /^[\p{L}\p{N}\p{M}_]/u.test(file.content.slice(to, to + 2)))
      )
        continue;
      if (result.total >= limit) {
        if (preview)
          throw new Error(
            "More than 5,000 replacement matches. Refine the query or included files before replacing.",
          );
        result.truncated = true;
        break;
      }
      count++;
      result.total++;
      while (scan < from) {
        if (file.content[scan] === "\n") {
          line++;
          lineStart = scan + 1;
        }
        scan++;
      }
      let prefixStart = Math.max(lineStart, from - 45),
        textEnd = Math.min(match[0].length, 180),
        suffixEnd = Math.min(
          file.content.indexOf("\n", to) < 0
            ? file.content.length
            : file.content.indexOf("\n", to),
          to + 60,
        );
      if (splitSurrogate(file.content, prefixStart)) prefixStart++;
      if (splitSurrogate(match[0], textEnd)) textEnd--;
      if (splitSurrogate(file.content, suffixEnd)) suffixEnd--;
      if (matches.length < 1000)
        matches.push({
          from,
          to,
          line,
          column: from - lineStart + 1,
          prefix: file.content.slice(prefixStart, from),
          text: match[0].slice(0, textEnd),
          suffix: file.content.slice(to, suffixEnd),
          clipped: match[0].length > textEnd,
        });
      if (preview) {
        const unchanged = file.content.slice(cursor, from),
          changed = substitute(replacement, match);
        outputBytes +=
          Buffer.byteLength(unchanged) + Buffer.byteLength(changed);
        if (outputBytes > 2 * 1024 * 1024)
          throw new Error(
            `Replacement would make ${file.path} exceed the 2 MB editable-file limit.`,
          );
        chunks.push(unchanged, changed);
        cursor = to;
      }
    }
    if (count) {
      const found = {
        path: file.path,
        revision: file.revision,
        count,
        matches,
      };
      if (preview) {
        chunks.push(file.content.slice(cursor));
        const after = chunks.join("");
        if (Buffer.byteLength(after) > 2 * 1024 * 1024)
          throw new Error(
            `Replacement would make ${file.path} exceed the 2 MB editable-file limit.`,
          );
        replacementBytes += Buffer.byteLength(after);
        if (replacementBytes > 32 * 1024 * 1024)
          throw new Error(
            "Replacement output exceeds 32 MB. Narrow the included files.",
          );
        if (after !== file.content)
          result.files.push({ ...found, before: file.content, after });
      } else result.files.push(found);
    }
    if (result.truncated) break;
  }
  return result;
}
try {
  parentPort.postMessage({ result: run() });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
