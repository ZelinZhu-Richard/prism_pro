import type { Engine } from "./types";
export const TEX_TOOLS = [
  "latexmk",
  "pdflatex",
  "latex",
  "xelatex",
  "lualatex",
  "bibtex",
  "biber",
  "synctex",
  "dvips",
  "ps2pdf",
  "gs",
] as const;
export type TexTool = (typeof TEX_TOOLS)[number];
export interface TexRuntime {
  id: string;
  label: string;
  version: string;
  binDir: string;
  texRoot: string;
  fingerprint: string;
  tools: Record<TexTool, boolean>;
  available: boolean;
  problem?: string;
}
export interface TexRuntimeCatalog {
  runtimes: TexRuntime[];
  problems: string[];
}
export type TexRuntimeSnapshot = Pick<
  TexRuntime,
  "id" | "label" | "version" | "binDir" | "texRoot" | "fingerprint"
>;
export function requiredTexTools(engine: Engine): TexTool[] {
  return [
    "latexmk",
    engine,
    ...(engine === "latex" ? (["dvips", "ps2pdf", "gs"] as const) : []),
  ];
}
