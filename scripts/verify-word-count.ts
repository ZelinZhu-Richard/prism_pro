import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { WordCounter } from "../server/word-count";
const root = path.resolve("data/verification/word-count-" + Date.now());
const store = new Store(root);
let passed = 0;
try {
  const sentinel = path.join(root, "outside-analysis.tex");
  fs.writeFileSync(
    sentinel,
    "These outside words must not be read by the counter.",
  );
  const source =
    "\\documentclass{article}\n\\begin{document}\n\\section{A heading}\nHello scientific world. $x=2$.\n\\input{sections/intro}\n\\begin{figure}\\caption{A useful figure caption}\\end{figure}\n\\[a=b\\]\n\\end{document}";
  const p = store.create("Synthetic word-count verification", [
    { path: "main.tex", data: Buffer.from(source) },
    {
      path: "sections/intro.tex",
      data: Buffer.from("\\subsection{More words}\nThese are included words."),
    },
  ]);
  const counter = new WordCounter(store),
    count = await counter.count(p.id);
  assert.equal(count.text, 7);
  assert.equal(count.headings, 4);
  assert.equal(count.captions, 4);
  passed++;
  assert.equal(count.inlineMath, 1);
  assert.equal(count.displayMath, 1);
  assert.equal(count.sections.length, 2);
  passed++;
  assert.equal(store.checkpoints(p.id).length, 1);
  assert.equal(store.readText(p.id, "main.tex").revision, 0);
  passed++;
  store.save(
    p.id,
    "main.tex",
    source.replace(
      "\\end{document}",
      "\\input{" + sentinel + "}\n\\end{document}",
    ),
    0,
  );
  const blocked = await counter.count(p.id);
  assert.equal(blocked.text, 7);
  assert.ok(blocked.warnings.length, "Forbidden input must be reported");
  passed++;
  store.save(
    p.id,
    "main.tex",
    source.replace(
      "\\end{document}",
      "\\immediate\\write18{touch " +
        path.join(root, "must-not-exist") +
        "}\n\\end{document}",
    ),
    1,
  );
  await counter.count(p.id);
  assert.equal(fs.existsSync(path.join(root, "must-not-exist")), false);
  passed++;
  assert.equal(fs.readdirSync(path.join(root, "analysis")).length, 0);
  passed++;
  store.update(p.id, { root: "sections/intro.tex" });
  const nested = await counter.count(p.id);
  assert.equal(nested.text, 4);
  assert.equal(nested.headings, 2);
  passed++;
  const bibliographic = store.create("Synthetic compiled bibliography", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\nHello body.\n\\bibliography{references}\n\\end{document}",
      ),
    },
  ]);
  const compiler = new Compiler(store),
    job = {
      id: "synthetic-bibliography",
      projectId: bibliographic.id,
      generation: 0,
      status: "succeeded",
      pdf: true,
      root: "main.tex",
      started: new Date().toISOString(),
      diagnostics: [],
      log: "",
      engine: "pdflatex",
    } as const;
  compiler.jobs.set(job.id, { ...job, diagnostics: [] });
  const out = path.join(compiler.dir(job.id), "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "main.bbl"),
    "\\begin{thebibliography}{1}\n\\bibitem{sample} Example author. Reference title.\n\\end{thebibliography}",
  );
  const withBibliography = await new WordCounter(store, compiler).count(
    bibliographic.id,
    true,
  );
  assert.equal(withBibliography.text, 7);
  passed++;
  store.save(
    bibliographic.id,
    "main.tex",
    store.readText(bibliographic.id, "main.tex").content,
    0,
  );
  const withoutStaleBibliography = await new WordCounter(store, compiler).count(
    bibliographic.id,
    true,
  );
  assert.equal(withoutStaleBibliography.text, 3);
  assert.equal(withBibliography.text - withoutStaleBibliography.text, 4);
  assert.ok(withoutStaleBibliography.warnings.length);
  passed++;
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        passed,
        engine: count.engine,
        counts: count,
        blocked,
        nested,
        withBibliography,
        withoutStaleBibliography,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed, root }));
} finally {
  store.close();
}
