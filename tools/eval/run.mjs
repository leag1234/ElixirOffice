#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// End-to-end evaluation of the Elixir AI tasks against a running editor instance.
//
//   node tools/eval/run.mjs [--tasks a,b|all] [--models m1,m2] [--modes scaffold,direct] [--runs 3]
//                           [--concurrency 3] [--out dir] [--extra '{"reasoning_effort":"low"}'] [--endpoint managed]
//                           [--log-requests 1] [--sampling default|deterministic]
//
// Each run: upload eval/tasks/<id>/input.docx (or a new document), open it with the model settings
// injected in localStorage, select the task's blocks (or put the cursor), open the command bar with
// Alt+I, type the instruction, wait for the result (a clarifying question is answered with its first
// option), then verify:
//   1. the task's success criteria (eval/tasks/<id>/check.mjs) on the document structure;
//   2. one Ctrl+Z restores the original document (when the task changes it);
//   3. no console or page error during the action.
// The API key is read from .env and only injected into the page; it is never printed or saved.
// --endpoint managed: no key in the browser, the server-managed proxy (/elixir-ai/config.json) is used.
// --log-requests 1: write the full body of every model request of a run to <out>/requests/ (bodies
// only, never headers: no key). Each result also records the sampling parameters actually sent and a
// hash of the first request (system prompt without the date line, user message, tools), to compare
// what the model was given across runs and instances.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { REPO, launch, uploadDocx, openEditor, snapshot, selectBlocks, focusEditor, sameStructure, median, readKey, cmd } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const ALL = fs.readdirSync(path.join(REPO, "eval/tasks")).filter(d => fs.existsSync(path.join(REPO, "eval/tasks", d, "task.json"))).sort();
const TASKS = !args.tasks || args.tasks === "all" ? ALL : args.tasks.split(",");
const MODELS = (args.models || "gpt-4.1-mini").split(",");
const MODES = (args.modes || "scaffold").split(",");
const RUNS = +(args.runs || 3);
const CONC = +(args.concurrency || 1);
const OUT = path.resolve(args.out || path.join(REPO, "eval/results", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")));
const MANAGED = args.endpoint === "managed";
const ENDPOINT = MANAGED ? "" : (args.endpoint || "https://api.openai.com/v1");
fs.mkdirSync(OUT, { recursive: true });

const key = MANAGED ? "" : readKey();
const results = [];

const barState = frame => frame.evaluate(() => document.getElementById("elixir-ai-bar").getAttribute("data-state"));
async function waitEnd(frame) {
  await frame.waitForFunction(() => {
    const s = document.getElementById("elixir-ai-bar").getAttribute("data-state");
    return s === "review" || s === "idle";
  }, null, { timeout: 240000, polling: 100 });
}

async function runOnce(task, model, mode, n) {
  const dir = path.join(REPO, "eval/tasks", task.id);
  const { check } = await import(path.join(dir, "check.mjs"));
  const base = { model, mode, extraParams: args.extra || "", maxRounds: 10, ...(args.sampling ? { sampling: args.sampling } : {}) };
  const settings = MANAGED ? base : { endpoint: ENDPOINT, apiKey: key, ...base };
  const { browser, page, errors, requests } = await launch({ settings });
  const rec = { task: task.id, model, mode, run: n, extra: args.extra || "" };
  try {
    const file = task.input ? await uploadDocx(path.join(dir, task.input)) : null;
    const frame = await openEditor(page, file);
    if (task.setup) await cmd(frame, task.setup);
    const before = await snapshot(frame);
    if (task.select) await selectBlocks(frame, task.select[0], task.select[1]);
    if (task.cursor !== undefined) await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(${task.cursor}); var r = p.GetRange ? p.GetRange(0, 0) : null; if (p.GetClassType() === 'table') r = p.GetCell(0, 0).GetContent().GetElement(0).GetRange(0, 0); r.Select(); return 1; })()`);
    if (task.selectDrawing) await cmd(frame, `(function(){ var d = Api.GetDocument().GetElement(${task.selectDrawing[0]}).GetAllDrawingObjects()[${task.selectDrawing[1]}]; d.Select(); return 1; })()`);
    await focusEditor(frame);
    const errStart = errors.length, reqStart = requests.length;

    await page.keyboard.press("Alt+i");
    await frame.waitForSelector("#elixir-ai-bar[data-state=idle]", { timeout: 8000 });
    await frame.fill("#elixir-ai-bar .elixir-ai-input", task.instruction);
    const t0 = Date.now();
    await frame.press("#elixir-ai-bar .elixir-ai-input", "Enter");
    await frame.waitForSelector("#elixir-ai-bar[data-state=running]", { timeout: 5000 }).catch(() => {});
    await waitEnd(frame);
    // a clarifying question: answer with the first option (counted in the latency)
    if (await frame.$("#elixir-ai-bar [data-act=option-0]")) {
      rec.asked = await frame.evaluate(() => document.querySelector("#elixir-ai-bar .elixir-ai-plan").textContent);
      await frame.click("#elixir-ai-bar [data-act=option-0]");
      await frame.waitForSelector("#elixir-ai-bar[data-state=running]", { timeout: 5000 }).catch(() => {});
      await waitEnd(frame);
    }
    rec.latencyMs = Date.now() - t0;
    rec.state = await barState(frame);
    const ui = await frame.evaluate(() => {
      const q = s => document.querySelector("#elixir-ai-bar " + s);
      return {
        status: q(".elixir-ai-status").textContent, plan: q(".elixir-ai-plan").textContent,
        summary: document.getElementById("elixir-ai-bar").getAttribute("data-summary") || (document.getElementById("elixir-ai-bar").getAttribute("data-state") === "review" ? "" : q(".elixir-ai-plan").textContent),
        answer: Array.from(document.querySelectorAll("#elixir-ai-bar .elixir-ai-answer")).map(e => e.textContent).join(" "),
        cannotDo: q(".elixir-ai-status").getAttribute("data-kind") === "cannot-do",
        suggestion: q("[data-act=suggestion]") ? q("[data-act=suggestion]").textContent : "",
        untrackedNote: document.querySelectorAll("#elixir-ai-bar .elixir-ai-note:not(.warn)").length > 0,
        warn: Array.from(document.querySelectorAll("#elixir-ai-bar .elixir-ai-note.warn")).map(e => e.textContent).join(" "),
        steps: Array.from(document.querySelectorAll("#elixir-ai-bar .elixir-ai-steps li")).map(li => li.className + ":" + li.textContent)
      };
    });
    Object.assign(rec, { status: ui.status, plan: ui.plan, summary: ui.summary, answer: ui.answer, cannotDo: ui.cannotDo, suggestion: ui.suggestion, warn: ui.warn, steps: ui.steps });
    if (n === 1) await page.screenshot({ path: path.join(OUT, `${task.id}-${model}-${mode}-review.png`) });

    const entry = await frame.evaluate(() => Common.ElixirAI.Journal.list().then(l => l[0]));
    rec.journal = entry ? {
      id: entry.id, outcome: entry.outcome, ms: entry.ms, rounds: entry.rounds.length, usage: entry.usage, costUsd: entry.costUsd,
      plan: entry.plan, verification: entry.verification,
      tools: entry.rounds.flatMap(r => r.tool_calls.map(c => ({ name: c.name, args: c.args, ok: !!(c.result && c.result.ok), error: c.result && c.result.error }))),
      roundMs: entry.rounds.map(r => r.ms), error: entry.error
    } : null;
    rec.toolErrors = rec.journal ? rec.journal.tools.filter(t => !t.ok).length : null;

    const after = await snapshot(frame);
    rec.criteria = check(before, after, { untrackedNote: ui.untrackedNote, ...ui, asked: rec.asked, journal: rec.journal });
    rec.aiRevisions = (after.revisions["Elixir AI"] || []).length;
    rec.changed = !sameStructure(before, after);

    // One undo must restore the original document (only when something changed)
    if (rec.changed) {
      await page.keyboard.press("Escape");
      await focusEditor(frame);
      await page.keyboard.press("Control+z");
      await frame.waitForTimeout(900);
      const undone = await snapshot(frame);
      rec.undoRestores = sameStructure(undone, before) && Object.keys(undone.revisions).length === Object.keys(before.revisions).length;
      if (!rec.undoRestores) rec.undoDiff = JSON.stringify({ before: before.final, undone: undone.final }).slice(0, 2000);
    } else rec.undoRestores = true;

    rec.errors = errors.slice(errStart).map(e => e.kind + ": " + e.text.slice(0, 300));
    const hosts = [...new Set(requests.slice(reqStart).map(r => r.host))].filter(h => !/^localhost(:\d+)?$|^127\.0\.0\.1/.test(h));
    rec.externalHosts = hosts;
    const bodies = requests.slice(reqStart).filter(r => r.model && r.body).map(r => { try { return JSON.parse(r.body); } catch (e) { return null; } }).filter(Boolean);
    if (bodies.length) {
      const b0 = bodies[0], { messages, tools, ...params } = b0;
      rec.sampling = params;
      const sys = String((messages[0] || {}).content || "").replace(/^Today: .*$/m, "Today: -");
      const h = x => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 10);
      rec.requestHash = { system: h(sys), user: h(messages[1]), tools: h(tools) };
      if (args["log-requests"]) {
        fs.mkdirSync(path.join(OUT, "requests"), { recursive: true });
        fs.writeFileSync(path.join(OUT, "requests", `${task.id}-${model}-${mode}-${n}.json`), JSON.stringify(bodies, null, 1));
      }
    }
  } catch (e) {
    rec.exception = String(e && e.stack || e).slice(0, 1000);
  }
  await browser.close();
  rec.criteriaPass = !!rec.criteria && rec.criteria.every(c => c.pass);
  rec.success = rec.criteriaPass && rec.undoRestores === true && rec.errors && rec.errors.length === 0 && !rec.exception;
  return rec;
}

const tasks = TASKS.map(id => ({ id, ...JSON.parse(fs.readFileSync(path.join(REPO, "eval/tasks", id, "task.json"), "utf8")) }));
const jobs = [];
for (const model of MODELS) for (const mode of MODES) for (const task of tasks) for (let n = 1; n <= RUNS; n++) jobs.push({ task, model, mode, n });

const INFRA = /Failed to fetch|NetworkError|ERR_NETWORK|ERR_CONNECTION|HTTP (5\d\d|429)\b|net::ERR_/;
async function worker() {
  while (jobs.length) {
    const { task, model, mode, n } = jobs.shift();
    // A run broken by the infrastructure (network drop, provider 5xx / 429, before any model answer
    // could be judged) is replayed, at most twice; the count is kept in the result (infraRetries).
    let rec, tries = 0;
    for (;;) {
      rec = await runOnce(task, model, mode, n);
      const err = [rec.journal && rec.journal.error, rec.exception, ...(rec.errors || [])].filter(Boolean).join(" ");
      if (rec.success || tries >= 2 || !INFRA.test(err)) break;
      tries++;
      console.log(`${model} ${mode} ${task.id} #${n}: infrastructure error, replayed (${err.slice(0, 120)})`);
    }
    if (tries) rec.infraRetries = tries;
    results.push(rec);
    const failed = (rec.criteria || []).filter(c => !c.pass).map(c => c.name + (c.detail ? " [" + String(c.detail).slice(0, 160) + "]" : ""));
    console.log(`${model} ${mode} ${task.id} #${n}: ${rec.success ? "OK " : "FAIL"} ${(rec.latencyMs / 1000 || 0).toFixed(1)}s` +
      ` rounds=${rec.journal ? rec.journal.rounds : "?"} tools=${rec.journal ? rec.journal.tools.map(t => t.name + (t.ok ? "" : "!")).join(",") : "?"}` +
      ` undo=${rec.undoRestores} errors=${rec.errors ? rec.errors.length : "?"}` + (failed.length ? " failed: " + failed.join("; ") : "") +
      (rec.exception ? " exception: " + rec.exception.split("\n")[0] : ""));
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

// Summary per task, model and mode
const summary = [];
for (const model of MODELS) for (const mode of MODES) for (const task of tasks) {
  const rs = results.filter(r => r.model === model && r.mode === mode && r.task === task.id);
  const ok = rs.filter(r => r.success);
  const lat = rs.filter(r => r.latencyMs).map(r => r.latencyMs);
  const tok = rs.filter(r => r.journal && r.journal.usage).map(r => r.journal.usage.total_tokens);
  const cost = rs.filter(r => r.journal && r.journal.costUsd != null).map(r => r.journal.costUsd);
  summary.push({
    model, mode, task: task.id, runs: rs.length, success: ok.length, successRate: rs.length ? ok.length / rs.length : 0,
    medianLatencyS: lat.length ? +(median(lat) / 1000).toFixed(2) : null,
    medianRounds: median(rs.filter(r => r.journal).map(r => r.journal.rounds)),
    medianTokens: median(tok), medianCostUsd: cost.length ? +median(cost).toFixed(6) : null,
    toolErrors: rs.reduce((a, r) => a + (r.toolErrors || 0), 0)
  });
}
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
console.log("\nmodel | mode | task | success | median latency (s) | median rounds | median tokens | median cost ($) | tool errors");
for (const s of summary)
  console.log(`${s.model} | ${s.mode} | ${s.task} | ${s.success}/${s.runs} | ${s.medianLatencyS} | ${s.medianRounds} | ${s.medianTokens} | ${s.medianCostUsd} | ${s.toolErrors}`);
for (const model of MODELS) for (const mode of MODES) {
  const rs = results.filter(r => r.model === model && r.mode === mode);
  const lat = rs.filter(r => r.latencyMs).map(r => r.latencyMs);
  console.log(`TOTAL ${model} ${mode}: ${rs.filter(r => r.success).length}/${rs.length} (${(100 * rs.filter(r => r.success).length / Math.max(1, rs.length)).toFixed(0)}%), median ${(median(lat) / 1000).toFixed(2)} s`);
}
console.log("\nresults: " + OUT);
