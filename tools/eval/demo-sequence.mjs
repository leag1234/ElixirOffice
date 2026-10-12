#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Screenshot sequence of one task, for documentation: selection, command, progress, review with
// tracked changes, accept, and the single undo.
//   node tools/eval/demo-sequence.mjs <task> <model> <outdir>
import fs from "node:fs";
import path from "node:path";
import { REPO, launch, uploadDocx, openEditor, selectBlocks, focusEditor, readKey } from "./lib.mjs";

const [taskId = "list-to-table", model = "gpt-4.1-mini", out = "demo"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const task = JSON.parse(fs.readFileSync(path.join(REPO, "eval/tasks", taskId, "task.json"), "utf8"));
const { browser, page } = await launch({ settings: { endpoint: "https://api.openai.com/v1", apiKey: readKey(), model, maxRounds: 8 } });
const shot = name => page.screenshot({ path: path.join(out, `${taskId}-${name}.png`) });
const frame = await openEditor(page, await uploadDocx(path.join(REPO, "eval/tasks", taskId, task.input)));
if (task.select) await selectBlocks(frame, task.select[0], task.select[1]);
await focusEditor(frame);
await shot("1-selection");
await page.keyboard.press("Alt+i");
await frame.waitForSelector("#elixir-ai-bar[data-state=idle]");
await frame.fill("#elixir-ai-bar .elixir-ai-input", task.instruction);
await shot("2-command");
await frame.press("#elixir-ai-bar .elixir-ai-input", "Enter");
await frame.waitForSelector("#elixir-ai-bar .elixir-ai-steps li", { timeout: 60000 }).catch(() => {});
await shot("3-progress");
await frame.waitForSelector("#elixir-ai-bar[data-state=review], #elixir-ai-bar[data-state=idle]", { timeout: 120000 });
await frame.waitForTimeout(500);
await shot("4-review-tracked");
const accept = await frame.$("#elixir-ai-bar [data-act=accept]");
if (accept) {
  await accept.click();
  await frame.waitForTimeout(1500);
  await shot("5-accepted");
  await focusEditor(frame);
  await page.keyboard.press("Control+z"); // undoes the acceptance
  await frame.waitForTimeout(600);
}
await focusEditor(frame);
await page.keyboard.press("Control+z"); // undoes the AI action as a whole
await frame.waitForTimeout(800);
await shot("6-undone");
await browser.close();
console.log("written to " + out);
