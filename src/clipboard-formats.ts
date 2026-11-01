export const CLIP_MIME = "application/x-prism-fragment";
export const CLIP_LIMIT = 256 * 1024;
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export function clipboardId(html: string, custom = "") {
  const id = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (id.test(custom)) return custom;
  const found = /\bdata-prism-clip\s*=\s*["']([\da-f-]{36})["']/i.exec(
    html.slice(0, 4000),
  );
  return found && id.test(found[1]) ? found[1] : null;
}
