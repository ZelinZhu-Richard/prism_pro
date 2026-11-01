import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Comments } from "../server/comments";
import { Tracking } from "../server/tracking";
import { HistoryRecovery } from "../server/history-recovery";
const root = path.resolve(
    "data/verification/review-history-compiler-" + Date.now(),
  ),
  store = new Store(root),
  compiler = new Compiler(store),
  comments = new Comments(store),
  tracking = new Tracking(store),
  recovery = new HistoryRecovery(store);
const main =
    "\\documentclass{article}\n\\begin{document}\n\\section{Synthetic review recovery}\n\\input{sections/body}\n\\input{sections/notes}\n\\end{document}\n",
  old = "An original target paragraph.\n\n",
  saved = "A saved reviewed paragraph.\n\n",
  current = "A latest current paragraph.\n\n",
  notes = "An original supporting note.\n",
  currentNotes = "A latest supporting note.\n";
const jobs: { name: string; job: string; text?: string }[] = [];
try {
  const p = store.create("Synthetic review recovery", [
    { path: "main.tex", data: Buffer.from(main) },
    { path: "sections/body.tex", data: Buffer.from(old) },
    { path: "sections/notes.tex", data: Buffer.from(notes) },
  ]);
  const thread = comments.create(p.id, {
      id: randomUUID(),
      path: "sections/body.tex",
      revision: 0,
      from: 3,
      to: 18,
      body: "Saved local review.",
    }),
    other = comments.create(p.id, {
      id: randomUUID(),
      path: "sections/notes.tex",
      revision: 0,
      from: 0,
      to: 10,
      body: "Saved supporting discussion.",
    });
  tracking.mode(p.id, { enabled: true, revision: 0 });
  store.save(p.id, "sections/body.tex", saved, 0);
  const version = store.checkpoint(p.id, "Saved review milestone"),
    pending = tracking.file(p.id, "sections/body.tex").hunks;
  async function compile(name: string) {
    const job = compiler.start(p.id),
      start = Date.now();
    while (compiler.processes.has(job.id)) {
      if (Date.now() - start > 130000) throw new Error("Compile timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "succeeded", job.log.slice(-3000));
    const text = spawnSync("pdftotext", [compiler.pdfPath(job.id), "-"], {
      encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        LANG: "en_US.UTF-8",
      },
    });
    jobs.push({
      name,
      job: job.id,
      text: text.status === 0 ? text.stdout : undefined,
    });
    console.log("PASS " + name);
  }
  function restore(id: string, file?: string) {
    const c = store.compareHistory(p.id, id),
      r = recovery.comparison(p.id, id),
      f = file ? store.fileList(p.id).find((f) => f.path === file) : undefined,
      input = {
        includeReview: true,
        path: file,
        expectedRevision: f?.revision ?? null,
        expectedGeneration: c.currentGeneration,
        expectedReviewToken: r.currentToken,
      },
      plan = recovery.plan(p.id, id, input);
    return recovery.apply(p.id, id, {
      ...input,
      includeReview: plan.includeReview,
      token: plan.token,
      id: randomUUID(),
    });
  }
  await compile("Saved source with pending review");
  const f = tracking.file(p.id, "sections/body.tex");
  tracking.apply(p.id, {
    id: randomUUID(),
    path: f.path,
    action: "accept",
    ids: f.hunks.map((h) => h.id),
    sourceRevision: f.sourceRevision,
    reviewRevision: f.reviewRevision,
    token: f.token,
  });
  tracking.mode(p.id, {
    enabled: false,
    revision: tracking.status(p.id).revision,
  });
  store.save(
    p.id,
    "sections/body.tex",
    current,
    store.readText(p.id, "sections/body.tex").revision,
  );
  store.save(p.id, "sections/notes.tex", currentNotes, 0);
  for (const [id, body] of [
    [thread.id, "Latest local review."],
    [other.id, "Latest supporting discussion."],
  ]) {
    const t = comments.get(p.id, id);
    comments.change(p.id, id, {
      action: "edit",
      id: t.replies[0].id,
      revision: t.revision,
      body,
    });
  }
  const latest = store.checkpoint(p.id, "Latest source and discussion");
  await compile("Latest source and review");
  const single = restore(version.id, "sections/body.tex");
  assert.equal(store.readText(p.id, "sections/body.tex").content, saved);
  assert.equal(
    store.readText(p.id, "sections/notes.tex").content,
    currentNotes,
  );
  assert.equal(
    comments.get(p.id, thread.id).replies[0].body,
    "Saved local review.",
  );
  assert.equal(
    comments.get(p.id, other.id).replies[0].body,
    "Latest supporting discussion.",
  );
  assert.deepEqual(tracking.file(p.id, "sections/body.tex").hunks, pending);
  await compile(
    "Single-file restore preserves latest supporting source and discussion",
  );
  restore(single.backupId);
  await compile("Pre-restore backup recovers latest project exactly");
  restore(version.id);
  assert.equal(store.readText(p.id, "sections/notes.tex").content, notes);
  assert.equal(
    comments.get(p.id, other.id).replies[0].body,
    "Saved supporting discussion.",
  );
  assert.equal(tracking.status(p.id).enabled, false);
  await compile("Whole-version restore recovers saved source and review");
  restore(latest.id);
  await compile("Latest version recovers current source and review again");
  assert.equal(store.readText(p.id, "main.tex").content, main);
  assert.equal(store.readText(p.id, "sections/body.tex").content, current);
  assert.equal(
    store.readText(p.id, "sections/notes.tex").content,
    currentNotes,
  );
  if (jobs.every((j) => j.text !== undefined)) {
    assert.equal(jobs[0].text, jobs[4].text);
    assert.equal(jobs[1].text, jobs[3].text);
    assert.equal(jobs[1].text, jobs[5].text);
    assert.notEqual(jobs[2].text, jobs[0].text);
    assert.notEqual(jobs[2].text, jobs[1].text);
    console.log(
      "PASS expected PDF text equivalence across saved, current, hybrid and recovered versions",
    );
  } else console.log("SKIP text comparison: pdftotext unavailable");
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(
      {
        project: p.id,
        jobs,
        sourceExact: true,
        reviewRecovered: true,
        modePreserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
