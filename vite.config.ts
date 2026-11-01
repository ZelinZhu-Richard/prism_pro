import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { emacsInitialization } from "./build/emacs-initialization";
export default defineConfig({
  plugins: [react(), emacsInitialization()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/data/**"] },
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ["pdfjs-dist"],
          keybindings: ["@replit/codemirror-vim", "@replit/codemirror-emacs"],
          editor: [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/commands",
            "@codemirror/language",
            "@codemirror/search",
            "@codemirror/autocomplete",
            "@codemirror/legacy-modes/mode/stex",
          ],
          react: ["react", "react-dom/client"],
        },
      },
    },
  },
});
