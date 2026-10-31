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
  if (command.stdin && !command.args.includes("app-server")) generationCalls++;
  return runCommand(command);
});
const ai = new AI(store, new Compiler(store), new Keys(), undefined, cli);
const source =
  "\\documentclass{article}\n\\title{Old title}\n\\begin{document}\n\\maketitle\nSynthetic example.\n\\end{document}\n";
const project = store.create("Synthetic CLI smoke", [
  { path: "main.tex", data: Buffer.from(source) },
  {
    path: "main.bbl",
    data: Buffer.from(
      "\\bibitem{fixture} A. Example. Synthetic bibliography entry.",
    ),
  },
]);
const base: AiRequest = {
  provider,
  projectId: project.id,
  model: "default",
  mode: "manual",
  prompt:
    "Use type_text to insert exactly Prism CLI OK at the cursor, with an empty replace string. Explain briefly in chat.",
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
  const connection = await cli.check(provider);
  base.model =
    connection.modelOptions?.find((m) => m.isDefault)?.id ||
    connection.models[0];
  assert.ok(base.model, connection.modelError || "No connected models");
  const id = await ai.run(base, observe);
  assert.deepEqual(errors, []);
  const run = store.run(id);
  assert.equal(run.insertion, "Prism CLI OK");
  assert.ok(run.text.trim());
  ai.progress(id, run.insertion, 0);
  ai.finish(id);
  ai.undo(id);
  assert.equal(store.readText(project.id, "main.tex").content, source);
  const projectRun = await ai.run(
    {
      ...base,
      scope: "project",
      revision: store.readText(project.id, "main.tex").revision,
      prompt:
        "Read main.bbl using read_file. Then use type_text with an empty replace string to insert exactly the contents of main.bbl at the cursor. Do not ask me to paste it. Give a short explanation in chat.",
    },
    observe,
  );
  assert.deepEqual(errors, []);
  const projectResult = store.run(projectRun);
  assert.ok(projectResult.contextFiles.includes("main.bbl"));
  assert.equal(
    projectResult.insertion,
    store.readText(project.id, "main.bbl").content,
  );
  ai.progress(
    projectRun,
    projectResult.insertion,
    store.readText(project.id, "main.tex").revision,
  );
  ai.finish(projectRun);
  ai.undo(projectRun);
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
    manualType: "separate chat and document output; exact insertion and undo",
    projectScope: "read main.bbl through Prism tools and type source only",
    model: base.model,
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
