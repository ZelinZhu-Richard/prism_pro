import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { isCliProvider, type AiEvent, type AiRequest } from "../shared/types";
import { CliBackends, runCommand } from "../server/cli";
import { AI } from "../server/ai";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Keys } from "../server/providers";

const provider = process.argv[2];
if (!isCliProvider(provider))
  throw new Error(
    "Usage: pnpm verify:cli codex|claude-code (uses your CLI subscription; synthetic documents only).",
  );
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/verification",
  `cli-${provider}-${Date.now()}`,
);
const store = new Store(root);
let generationCalls = 0;
const cli = new CliBackends(root, async (command) => {
  if (command.stdin) generationCalls++;
  return runCommand(command);
});
const ai = new AI(store, new Compiler(store), new Keys(), undefined, cli);
const source =
  "\\documentclass{article}\n\\title{Old title}\n\\begin{document}\n\\maketitle\nSynthetic example.\n\\end{document}\n";
const project = store.create("Synthetic CLI smoke", [
  { path: "main.tex", data: Buffer.from(source) },
]);
const base: AiRequest = {
  provider,
  projectId: project.id,
  model: "default",
  mode: "manual",
  prompt: "Return exactly Prism CLI OK",
  path: "main.tex",
  revision: 0,
  from: 0,
  to: 0,
};
const errors: string[] = [];
const observe = (event: AiEvent) => {
  if (event.type === "error") errors.push(event.message);
};
try {
  const id = await ai.run(base, observe);
  assert.deepEqual(errors, []);
  const run = store.run(id);
  assert.equal(run.text.trim(), "Prism CLI OK");
  ai.progress(id, run.text, 0);
  ai.finish(id);
  ai.undo(id);
  assert.equal(store.readText(project.id, "main.tex").content, source);
  await ai.run(
    {
      ...base,
      mode: "review",
      revision: store.readText(project.id, "main.tex").revision,
      prompt:
        "Use propose_edits to change only the title from Old title to Prism CLI smoke. All other source must remain identical. The active file is already read in your context.",
    },
    observe,
  );
  assert.deepEqual(errors, []);
  const proposal = store.proposals(project.id)[0];
  assert.ok(proposal, "A revision-bound proposal was returned");
  store.applyProposal(proposal.id);
  assert.equal(
    store.readText(project.id, "main.tex").content,
    proposal.files.find((file) => file.path === "main.tex")?.after,
  );
  assert.match(
    store.readText(project.id, "main.tex").content,
    /\\title\{Prism CLI smoke\}/,
  );
  store.applyProposal(proposal.id, true);
  assert.equal(store.readText(project.id, "main.tex").content, source);
  const report = {
    provider,
    passed: true,
    generationCalls,
    manualType: "exact insertion and undo",
    reviewEdits: "exact Apply and Undo",
    version: cli.state(provider).version,
  };
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  for (const c of ai.controllers.values()) c.abort();
  for (const timer of ai.leases.values()) clearTimeout(timer);
  store.close();
}
