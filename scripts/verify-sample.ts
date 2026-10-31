import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readZip, writeZip } from "../server/files";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
const archive = process.argv[2];
if (!archive)
  throw new Error(
    "Usage: node --import tsx scripts/verify-sample.ts /absolute/path/project.zip",
  );
const root = path.resolve("data/verification/private-sample-" + Date.now());
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const bytes = fs.readFileSync(archive),
  files = await readZip(bytes),
  store = new Store(root),
  compiler = new Compiler(store),
  project = store.create("Private compatibility sample", files);
assert.ok(project.root);
const round = await readZip(writeZip(store.exportFiles(project.id)));
assert.deepEqual(
  round
    .map((f) => [f.path, createHash("sha256").update(f.data).digest("hex")])
    .sort(),
  files
    .map((f) => [f.path, createHash("sha256").update(f.data).digest("hex")])
    .sort(),
);
const job = compiler.start(project.id);
await new Promise<void>((resolve, reject) => {
  const timer = setInterval(() => {
    if (!compiler.processes.has(job.id)) {
      clearInterval(timer);
      resolve();
    }
  }, 150);
  setTimeout(() => {
    clearInterval(timer);
    reject(new Error("Compile timed out"));
  }, 130000).unref();
});
const report: any = {
  date: new Date().toISOString(),
  archiveSHA256: createHash("sha256").update(bytes).digest("hex"),
  files: files.length,
  root: project.root,
  roundTrip: "exact paths and bytes",
  jobId: job.id,
  status: job.status,
  diagnostics: job.diagnostics.length,
};
if (job.status === "succeeded") {
  const reference = files.find((f) => f.path === "paper.pdf");
  if (reference) {
    const ref = path.join(root, "reference.pdf");
    fs.writeFileSync(ref, reference.data);
    const pdf = compiler.pdfPath(job.id);
    fs.copyFileSync(pdf, path.join(root, "compiled.pdf"));
    const text = (file: string) => {
      const result = spawnSync(
        "/opt/homebrew/bin/pdftotext",
        ["-layout", file, "-"],
        { encoding: "utf8", maxBuffer: 20e6 },
      );
      assert.equal(result.status, 0);
      return result.stdout;
    };
    const a = text(ref),
      b = text(pdf),
      normalize = (x: string) => x.normalize("NFC").replace(/\s+/g, " ").trim();
    fs.writeFileSync(path.join(root, "reference.txt"), a);
    fs.writeFileSync(path.join(root, "compiled.txt"), b);
    const wordsA = normalize(a).split(" "),
      wordsB = normalize(b).split(" ");
    let equal = 0;
    for (let i = 0; i < Math.min(wordsA.length, wordsB.length); i++)
      if (wordsA[i] === wordsB[i]) equal++;
    report.comparison = {
      referencePages: (a.match(/\f/g) || []).length,
      compiledPages: (b.match(/\f/g) || []).length,
      normalizedTextExact: normalize(a) === normalize(b),
      referenceWords: wordsA.length,
      compiledWords: wordsB.length,
      positionMatchedWords: equal,
    };
    for (const [name, file] of [
      ["reference", ref],
      ["compiled", pdf],
    ]) {
      const result = spawnSync(
        "/opt/homebrew/bin/pdftoppm",
        ["-r", "36", file, path.join(root, name + "-raster")],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
    }
    const compare = spawnSync(
      "python3",
      [
        "-c",
        `import pathlib,json,sys,difflib
p=pathlib.Path(sys.argv[1]); results=[]
def ppm(path):
 with path.open('rb') as f:
  assert f.readline().strip()==b'P6'
  size=f.readline().strip()
  assert f.readline().strip()==b'255'
  return size,f.read()
for a in sorted(p.glob('reference-raster-*.ppm')):
 b=p/a.name.replace('reference','compiled')
 if not b.exists(): continue
 x,xb=ppm(a);y,yb=ppm(b)
 results.append({'page':int(a.stem.split('-')[-1]),'sameDimensions':x==y,'meanAbsoluteChannelDifference':round(sum(abs(u-v) for u,v in zip(xb,yb))/len(xb),3) if x==y else None,'exactPixels':xb==yb})
a=(p/'reference.txt').read_text().split();b=(p/'compiled.txt').read_text().split()
print(json.dumps({'raster':results,'wordSequenceSimilarity':difflib.SequenceMatcher(None,a,b,autojunk=False).ratio()}))`,
        root,
      ],
      { encoding: "utf8" },
    );
    if (compare.status === 0)
      Object.assign(report.comparison, JSON.parse(compare.stdout));
    else report.comparison.raster = "Image comparison unavailable";
  }
}
fs.writeFileSync(
  path.join(root, "report.json"),
  JSON.stringify(report, null, 2),
);
store.close();
console.log(JSON.stringify(report, null, 2));
console.log("Private report: " + path.join(root, "report.json"));
if (job.status !== "succeeded") process.exitCode = 1;
