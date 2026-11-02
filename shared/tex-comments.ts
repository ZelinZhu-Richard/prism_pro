/** Mask comments without moving UTF-16 source positions or escaped percent signs. */
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
