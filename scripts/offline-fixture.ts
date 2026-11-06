import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { zipSync } from "fflate";

// Reuses the repository's source-tools fixture geometry; no downloaded artwork.
function localPng() {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4),
      footer = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, footer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(40, 0);
  header.writeUInt32BE(24, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(24 * 121);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 40; x++)
      for (let c = 0; c < 3; c++)
        pixels[y * 121 + 1 + x * 3 + c] = x > y ? 80 : 200;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export function offlineArchive(root: string) {
  const entries: Record<string, Uint8Array> = {
    "offline-paper/main.tex":
      Buffer.from(String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,graphicx}
\usepackage[hidelinks]{hyperref}
\title{Writing without a connection}
\author{Synthetic verification}
\date{}
\begin{document}
\maketitle
\input{sections/introduction}
\begin{equation}\label{eq:local}E=mc^2.\end{equation}
\begin{figure}[h]\centering\includegraphics[width=3cm]{figures/local.png}
\caption{A synthetic local figure.}\label{fig:local}\end{figure}
\bibliographystyle{plain}\bibliography{references}
\newpage
\input{sections/results}
\end{document}
`),
    "offline-paper/sections/introduction.tex":
      Buffer.from(String.raw`\section{Introduction}\label{sec:intro}
Offline writing uses local source, figures and references~\cite{local2026}.
Café is Unicode text; $x^2+y^2$ is an inline equation.
This synthetic manuscript contains the deliberate spelling error acccuracy.
% Unicode source notes: 新文本 👩🏽‍💻 é
`),
    "offline-paper/sections/results.tex":
      Buffer.from(String.raw`\section{Results}\label{sec:results}
The result is available without an account or a network connection.
Equation~\ref{eq:local} and Figure~\ref{fig:local} are part of this local project.
`),
    "offline-paper/references.bib": Buffer.from(
      "@book{local2026,author={Synthetic Author},title={Local Verification},year={2026},publisher={Synthetic Press}}\n",
    ),
    "offline-paper/figures/local.png": localPng(),
    "offline-paper/notes/": Buffer.alloc(0),
    "offline-paper/build.sh": Buffer.from(
      `#!/bin/sh\necho imported-script > '${path.join(root, "imported-script-ran")}'\nexit 99\n`,
    ),
    "offline-paper/.latexmkrc": Buffer.from(
      `system('touch ${path.join(root, "imported-config-ran")}'); die 'Imported config must not run';\n`,
    ),
  };
  return Buffer.from(zipSync(entries, { level: 6 }));
}
export async function offlineWorkspace(root: string, dist?: string) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "QWEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "QWEN_BASE_URL",
    "LEAF_COMPILE_TIMEOUT_MS",
  ])
    delete process.env[key];
  // Use supported per-process overrides; do not consult the owner's CLI login.
  process.env.PRISM_CODEX_BIN = path.join(root, "cli-unavailable");
  process.env.PRISM_CLAUDE_BIN = path.join(root, "cli-unavailable");
  const nativeFetch = globalThis.fetch,
    blocked: { origin: string; path: string }[] = [],
    requests: { method: string; url: string; host?: string }[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol)
    ) {
      blocked.push({ origin: url.origin, path: url.pathname });
      throw Error("External network blocked by offline verification.");
    }
    return nativeFetch(input, { ...init, redirect: "error" });
  }) as typeof fetch;
  try {
    await fetch("https://offline-probe.invalid/guard");
    throw Error("Offline guard failed");
  } catch (e) {
    if (blocked.length !== 1) throw e;
  }
  const guardProbe = blocked.splice(0);
  const { createApp } = await import("../server/app");
  const f = await createApp(root, { seed: false, dist });
  let generations = 0;
  f.ai.providerRunner = async () => {
    generations++;
    throw Error("AI is not part of offline verification.");
  };
  const policy =
    "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";
  f.app.addHook("onRequest", async (req) => {
    if (requests.length < 5000)
      requests.push({
        method: req.method,
        url: req.url,
        host: req.headers.host,
      });
  });
  f.app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("Content-Security-Policy", policy);
    return payload;
  });
  return {
    ...f,
    evidence: () => ({
      guardProbe,
      blocked,
      requests,
      generations,
      policy,
    }),
    restoreFetch: () => {
      globalThis.fetch = nativeFetch;
    },
  };
}
