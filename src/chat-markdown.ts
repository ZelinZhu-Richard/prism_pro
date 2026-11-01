// Normalise common assistant math delimiters for Markdown, leaving source/code and link destinations literal.
export function chatMath(source: string) {
  if (source.length > 100000) return source;
  let out = "",
    i = 0,
    fence: { char: string; size: number } | undefined;
  while (i < source.length) {
    if (i === 0 || source[i - 1] === "\n") {
      const lineEnd = source.indexOf("\n", i),
        end = lineEnd < 0 ? source.length : lineEnd + 1,
        line = source.slice(i, end),
        match = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
      if (match) {
        if (!fence) fence = { char: match[1][0], size: match[1].length };
        else if (
          match[1][0] === fence.char &&
          match[1].length >= fence.size &&
          !match[2].trim()
        )
          fence = undefined;
        out += line;
        i = end;
        continue;
      }
      if (fence) {
        out += line;
        i = end;
        continue;
      }
    }
    if (source[i] === "`") {
      let size = 1;
      while (source[i + size] === "`") size++;
      const token = "`".repeat(size);
      let close = source.indexOf(token, i + size);
      while (
        close >= 0 &&
        (source[close - 1] === "`" || source[close + size] === "`")
      )
        close = source.indexOf(token, close + size);
      if (close >= 0) {
        out += source.slice(i, close + size);
        i = close + size;
        continue;
      }
    }
    if (source[i] === "]" && source[i + 1] === "(") {
      let depth = 1,
        end = i + 2;
      for (; end < source.length && depth; end++) {
        if (source[end] === "\\") {
          end++;
          continue;
        }
        if (source[end] === "(") depth++;
        if (source[end] === ")") depth--;
      }
      out += source.slice(i, end);
      i = end;
      continue;
    }
    if (source[i] === "\\" && source[i + 1] === "\\") {
      out += "\\\\";
      i += 2;
      continue;
    }
    if (
      source[i] === "\\" &&
      (source[i + 1] === "(" || source[i + 1] === "[")
    ) {
      const display = source[i + 1] === "[",
        ending = display ? "\\]" : "\\)",
        end = source.indexOf(ending, i + 2);
      if (end < 0) return out + source.slice(i);
      const body = source.slice(i + 2, end);
      if (
        end >= 0 &&
        body.length <= 8000 &&
        !body.includes("`") &&
        !body.includes("$") &&
        (display || !body.includes("\n"))
      ) {
        out +=
          (display ? "\n\n$$\n" : "$") + body + (display ? "\n$$\n\n" : "$");
        i = end + 2;
        continue;
      }
      out += source.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    out += source[i++];
  }
  return out;
}
export function chatLink(href: string) {
  if (!href || /[\u0000-\u0020\u007f]/.test(href)) return "";
  try {
    const url = new URL(href);
    if (
      ["http:", "https:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return href;
  } catch {}
  return "";
}
