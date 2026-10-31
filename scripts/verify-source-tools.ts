import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import {
  tableSource,
  figureSource,
  formatSource,
  type TableOptions,
} from "../src/source-actions";
import { mathSymbols } from "../src/math-symbols";

// A synthetic image fixture, generated without network or private project assets.
export function syntheticPng() {
  function chunk(type: string, data: Buffer) {
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
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(40, 0);
  header.writeUInt32BE(24, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(24 * (40 * 3 + 1));
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
async function verify() {
  const root = path.resolve("data/verification/source-tools-" + Date.now());
  fs.mkdirSync(root, { recursive: true });
  const store = new Store(root),
    compiler = new Compiler(store),
    results: { name: string; job: string }[] = [];
  const options: TableOptions = {
    cells: [
      ["Method", "A & B"],
      ["Baseline", "50% $ # _ { } \\ ^ ~"],
    ],
    alignments: ["l", "r"],
    header: true,
    raw: false,
    rules: "minimal",
    caption: "Synthetic & escaped",
    label: "tab:synthetic",
    placement: "htbp",
    captionAbove: true,
  };
  const figure = figureSource({
    path: "figures/plot one.png",
    width: 0.5,
    caption: "Synthetic & monochrome",
    label: "fig:synthetic",
    placement: "htbp",
  });
  const preamble =
    "\\documentclass{article}\n\\usepackage{amsmath,amssymb,graphicx}\n\\begin{document}\n";
  try {
    const variants = [
      {
        name: "Plain table and figure",
        root: "main.tex",
        body: tableSource(options) + "\n" + figure,
      },
      {
        name: "Grid, source cells and symbol catalog",
        root: "main.tex",
        body:
          tableSource({
            ...options,
            cells: [["$x$", "\\textit{Method}"]],
            raw: true,
            rules: "grid",
            captionAbove: false,
          }) +
          "\n" +
          mathSymbols.map((s) => `$${s.command}$`).join(" ") +
          "\n" +
          formatSource("One\nTwo", 0, 7, "enumerate").text,
      },
      {
        name: "Nested root with a spaced asset path",
        root: "roots/entry.tex",
        body: figure + "\n" + tableSource({ ...options, rules: "none" }),
      },
    ];
    for (const variant of variants) {
      const p = store.create(variant.name, [
        {
          path: variant.root,
          data: Buffer.from(preamble + variant.body + "\n\\end{document}\n"),
        },
        { path: "figures/plot one.png", data: syntheticPng() },
      ]);
      store.update(p.id, { root: variant.root });
      const job = compiler.start(p.id),
        start = Date.now();
      while (compiler.processes.has(job.id)) {
        if (Date.now() - start > 130000)
          throw new Error("Compilation verification timed out.");
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(job.status, "succeeded", job.log.slice(-4000));
      assert.ok(fs.statSync(compiler.pdfPath(job.id)).size > 1000);
      results.push({ name: variant.name, job: job.id });
      console.log("PASS " + variant.name);
    }
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify({ passed: results.length, results }, null, 2),
    );
    console.log(JSON.stringify({ passed: results.length, root }));
  } finally {
    for (const id of compiler.processes.keys()) compiler.cancel(id);
    while (compiler.processes.size) await new Promise((r) => setTimeout(r, 50));
    store.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve("scripts/verify-source-tools.ts")
)
  await verify();
