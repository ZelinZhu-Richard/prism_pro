import type { Plugin } from "vite";

// codemirror-emacs 6.1.0 incorrectly marks these essential registrations pure.
// Preserve just those calls; leave dependency files and other tree-shaking intact.
export function emacsInitialization(): Plugin {
  return {
    name: "preserve-emacs-initialization",
    enforce: "pre",
    transform(code, id) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith("/@replit/codemirror-emacs/dist/index.js")
      )
        return;
      return {
        code: code.replace(
          /\/\*@__PURE__\*\/(?=EmacsHandler\.(?:bindKey|addCommands)\()/g,
          "",
        ),
        map: null,
      };
    },
  };
}
