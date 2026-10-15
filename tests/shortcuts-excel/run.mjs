#!/usr/bin/env node
// Plays every testable shortcut of docs/shortcuts-excel.csv in the spreadsheet
// editor and checks its effect through the editor API.
//
//   node tests/shortcuts-excel/run.mjs [--platform win|mac|both] [--only id,id] [--out file.json]
//                                      [--control] [--repeat n] [--verbose]
//
// "win" uses Windows/Linux key conventions (Ctrl, Alt); "mac" makes the editor
// believe it runs on macOS and uses Cmd/Option/Control as Excel for Mac does.
// --control plays each case's `control` (the same effect through the UI or the
// API) instead of the keys: every control must pass, which shows that a failing
// shortcut is an editor gap and not a blind check.
// --repeat n plays each variant n times and reports the variants whose result changes.
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, resetBook, resetUi, select, state, focusGrid, readCsv, REPO, HERE, BASE } from "./lib.mjs";
import { CASES } from "./cases.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const platforms = (opt("--platform", "both") === "both") ? ["win", "mac"] : [opt("--platform")];
const only = opt("--only", null) ? new Set(opt("--only").split(",")) : null;
const verbose = args.includes("--verbose");
const control = args.includes("--control");
const repeat = +opt("--repeat", "1");
const outFile = opt("--out", path.join(HERE, "results", control ? "control.json" : "latest.json"));

const rows = readCsv(path.join(REPO, "docs/shortcuts-excel.csv"));
const byId = Object.fromEntries(rows.map(r => [r.id, r]));
const caseById = Object.fromEntries(CASES.map(c => [c.id, c]));
for (const c of CASES) if (!byId[c.id]) throw new Error("case without a matrix row: " + c.id);
const resolve = c => {
  if (!c || !c.same) return c;
  const base = resolve(caseById[c.same]);
  const own = Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== undefined && k !== "same"));
  return { ...base, ...own };
};

async function runSteps(ctx, variant) {
  const steps = Array.isArray(variant) ? variant : [variant];
  for (const s of steps) {
    if (typeof s === "string") await ctx.page.keyboard.press(s);
    else if (s.text !== undefined) await ctx.page.keyboard.type(s.text, { delay: 20 });
    else if (s.wait) await ctx.frame.waitForTimeout(s.wait);
    await ctx.frame.waitForTimeout(90);
  }
}

async function runCase(env, c, variant) {
  const { frame, page, platform, errors } = env;
  const ctx = { frame, page, platform, variant, st: () => state(frame), js: (fn, a) => frame.evaluate(fn, a) };
  await resetUi(frame, page);
  await resetBook(frame);
  if (c.sel) await select(frame, c.sel, c.active);
  if (c.pre) await c.pre(ctx);
  await focusGrid(frame, c.keepObjects);
  ctx.s0 = await state(frame);
  const nErr = errors.length;
  if (control) await c.control(ctx); else await runSteps(ctx, variant);
  await frame.waitForTimeout(400);
  let r;
  try { r = await c.check(ctx); } catch (e) { r = "check threw: " + String(e).slice(0, 200); }
  const pageErrors = errors.slice(nErr).filter(e => e.kind === "pageerror");
  if (r === true && pageErrors.length) r = "page error: " + pageErrors[0].text.slice(0, 160);
  else if (r !== true && pageErrors.length && typeof r === "string") r += " [page error: " + pageErrors[0].text.slice(0, 200) + "]";
  try { if (c.after) await c.after(ctx); } catch (e) {}
  return r;
}

const label = v => (Array.isArray(v) ? v.map(s => (typeof s === "string" ? s : s.text !== undefined ? `"${s.text}"` : JSON.stringify(s))).join(", ") : v);

async function fresh(platform) {
  const env = await launch({ platform });
  env.frame = await openEditor(env.page);
  return env;
}

const results = [];
for (const platform of platforms) {
  let env = await fresh(platform);
  for (const row of rows) {
    if (only && !only.has(row.id)) continue;
    const c = resolve(caseById[row.id]);
    if (!c) {
      // an editor shortcut must have a test; a browser-reserved one is tested only when the page can receive it
      if (row.scope === "editor") results.push({ id: row.id, platform, scope: row.scope, status: "untested", reason: "no test case" });
      else if (row.scope === "browser") results.push({ id: row.id, platform, scope: row.scope, status: "n/a", reason: "kept by the browser, not testable in a page" });
      continue;
    }
    if (control && !c.control) continue;
    const variants = control ? [c[platform] && c[platform][0] || "control"] : (c[platform] || []);
    if (!variants.length) { results.push({ id: row.id, platform, scope: row.scope, status: "n/a", reason: "no shortcut on this platform" }); continue; }
    for (const v of variants) {
      if (!control && platform === "mac" && c.nativeClipboardOnMac) { results.push({ id: row.id, platform, scope: row.scope, keys: label(v), status: "skip", reason: "native clipboard command: not emulated on Linux" }); continue; }
      const seen = [];
      for (let k = 0; k < repeat; k++) {
        let r;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { r = await runCase(env, c, v); break; }
          catch (e) {
            // the harness could not set the case up (instance rebuilt, editor stuck): reopen and retry once
            r = "runner error: " + String(e).slice(0, 200);
            try { await env.browser.close(); } catch (e2) {}
            env = await fresh(platform);
          }
        }
        seen.push(r);
      }
      const r = seen[0];
      let status = r === true ? "pass" : (r && r.skip) ? "skip" : (typeof r === "string" && r.startsWith("runner error")) ? "error" : "fail";
      let reason = r === true ? "" : (r && r.skip) ? r.skip : r;
      if (seen.some(x => (x === true) !== (r === true))) { status = "flaky"; reason = "results differ between runs: " + seen.map(x => (x === true ? "pass" : typeof x === "string" ? x : JSON.stringify(x))).join(" / "); }
      results.push({ id: row.id, platform, scope: row.scope, keys: control ? "control" : label(v), status, reason });
      if (verbose || status !== "pass") console.log(`${status.toUpperCase().padEnd(5)} ${platform} ${row.id} [${control ? "control" : label(v)}] ${reason}`);
    }
  }
  await env.browser.close();
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), base: BASE, control, repeat, results }, null, 1));
for (const platform of platforms) {
  const rs = results.filter(r => r.platform === platform);
  const count = (scope, st) => rs.filter(r => (!scope || scope.includes(r.scope)) && r.status === st).length;
  console.log(`${platform}: editor scope ${count(["editor"], "pass")} pass / ${count(["editor"], "fail")} fail / ${count(["editor"], "flaky")} flaky / ${count(["editor"], "error")} harness errors / ${count(["editor"], "untested")} untested; browser-reserved scope ${count(["browser"], "pass")} pass / ${count(["browser"], "fail")} fail (variants)`);
}
console.log("results:", outFile);
