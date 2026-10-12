#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Plays every testable shortcut of docs/shortcuts-word.csv in the editor and
// checks its effect through the editor API.
//
//   node tests/shortcuts/run.mjs [--platform win|mac|both] [--only id,id] [--out file.json] [--verbose]
//
// "win" uses Windows/Linux key conventions (Ctrl, Alt); "mac" makes the editor
// believe it runs on macOS and uses Cmd/Option/Control as Word for Mac does.
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, setDoc, caret, select, state, focusDoc, resetUi, readCsv, REPO, HERE } from "./lib.mjs";
import { CASES as BASE_CASES } from "./cases.mjs";
import { CASES as EDIT_KEYS_CASES } from "./cases-edit-keys.mjs";
import { CASES as VIEWS_CASES } from "./cases-views.mjs";
import { CASES as WAVE2_CASES } from "./cases-wave2.mjs";
const CASES = [...BASE_CASES, ...EDIT_KEYS_CASES, ...VIEWS_CASES, ...WAVE2_CASES];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const platforms = (opt("--platform", "both") === "both") ? ["win", "mac"] : [opt("--platform")];
const only = opt("--only", null) ? new Set(opt("--only").split(",")) : null;
const verbose = args.includes("--verbose");
const outFile = opt("--out", path.join(HERE, "results", "latest.json"));

const rows = readCsv(path.join(REPO, "docs/shortcuts-word.csv"));
const byId = Object.fromEntries(rows.map(r => [r.id, r]));
const caseById = Object.fromEntries(CASES.map(c => [c.id, c]));
for (const c of CASES) if (!byId[c.id]) throw new Error("case without a matrix row: " + c.id);

async function runSteps(ctx, variant) {
  const steps = Array.isArray(variant) ? variant : [variant];
  for (const s of steps) {
    if (typeof s === "string") await ctx.page.keyboard.press(s);
    else if (s.text !== undefined) await ctx.page.keyboard.type(s.text);
    else if (s.wait) await ctx.frame.waitForTimeout(s.wait);
    else if (s.run) await s.run(ctx);   // custom step (cases-edit-keys.mjs)
    else if (s.cdp) {
      // keys Playwright cannot name (e.g. Clear = numeric keypad 5 with Num Lock off)
      const cdp = await ctx.page.context().newCDPSession(ctx.page);
      const base = { modifiers: s.cdp.modifiers || 0, key: s.cdp.key, code: s.cdp.code, windowsVirtualKeyCode: s.cdp.keyCode, nativeVirtualKeyCode: s.cdp.keyCode };
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await cdp.detach();
    }
    else if (s.wheel) {
      const box = await ctx.frame.evaluate(() => { const r = document.getElementById("editor_sdk").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const fr = await (await ctx.frame.frameElement()).boundingBox();
      await ctx.page.mouse.move(fr.x + box.x, fr.y + box.y);
      await ctx.page.keyboard.down(s.mod); await ctx.page.mouse.wheel(0, s.wheel); await ctx.frame.waitForTimeout(200); await ctx.page.keyboard.up(s.mod);
    }
    await ctx.frame.waitForTimeout(70);
  }
}

async function runCase(env, c, variant) {
  const { frame, page, platform, errors } = env;
  const ctx = { frame, page, platform, st: () => state(frame), js: (fn, a) => frame.evaluate(fn, a), focus: () => focusDoc(frame) };
  await resetUi(frame, page);
  if (c.doc) await setDoc(frame, c.doc);
  if (c.at) await caret(frame, ...c.at);
  if (c.sel) await select(frame, ...c.sel);
  if (c.pre) await c.pre(ctx);
  await focusDoc(frame);
  ctx.s0 = await state(frame);
  const nErr = errors.length;
  await runSteps(ctx, variant);
  await frame.waitForTimeout(250);
  let r;
  try { r = await c.check(ctx); } catch (e) { r = "check threw: " + String(e).slice(0, 200); }
  const pageErrors = errors.slice(nErr).filter(e => e.kind === "pageerror");
  if (r === true && pageErrors.length) r = "page error: " + pageErrors[0].text.slice(0, 160);
  else if (r !== true && pageErrors.length && typeof r === "string") r += " [page error: " + pageErrors[0].text.slice(0, 200) + "]";
  try { if (c.after) await c.after(ctx); } catch (e) {}
  return r;
}

const label = v => (Array.isArray(v) ? v.map(s => (typeof s === "string" ? s : s.text !== undefined ? `"${s.text}"` : s.wheel ? `${s.mod}+wheel` : s.cdp ? (s.cdp.modifiers & 1 ? "Alt+" : "") + s.cdp.key : JSON.stringify(s))).join(", ") : v);

const results = [];
for (const platform of platforms) {
  let env = await launch({ platform });
  env.frame = await openEditor(env.page);
  for (const row of rows) {
    if (only && !only.has(row.id)) continue;
    let c = caseById[row.id];
    if (c && c.same) c = { ...caseById[c.same], id: row.id };
    const testable = ["editor", "browser"].includes(row.scope);
    if (!c) { if (testable) results.push({ id: row.id, platform, scope: row.scope, status: "untested", reason: "no test case" }); continue; }
    const variants = c[platform] || [];
    if (!variants.length) { results.push({ id: row.id, platform, scope: row.scope, status: "n/a", reason: "no shortcut on this platform" }); continue; }
    for (const v of variants) {
      if (platform === "mac" && c.nativeClipboardOnMac) { results.push({ id: row.id, platform, scope: row.scope, keys: label(v), status: "skip", reason: "native clipboard command: not emulated on Linux" }); continue; }
      let r;
      try { r = await runCase(env, c, v); }
      catch (e) {
        r = "runner error: " + String(e).slice(0, 200);
        try { await env.browser.close(); } catch (e2) {}
        env = await launch({ platform }); env.frame = await openEditor(env.page);
      }
      const status = r === true ? "pass" : (r && r.skip) ? "skip" : "fail";
      if (r && r.skip) r = r.skip;
      results.push({ id: row.id, platform, scope: row.scope, keys: label(v), status, reason: r === true ? "" : r });
      if (verbose || status !== "pass") console.log(`${status.toUpperCase().padEnd(5)} ${platform} ${row.id} [${label(v)}] ${r === true ? "" : r}`);
    }
  }
  await env.browser.close();
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
for (const platform of platforms) {
  const rs = results.filter(r => r.platform === platform);
  const count = (scope, st) => rs.filter(r => (!scope || scope.includes(r.scope)) && r.status === st).length;
  console.log(`${platform}: editor scope ${count(["editor"], "pass")} pass / ${count(["editor"], "fail")} fail / ${count(["editor"], "untested")} untested; browser-reserved scope ${count(["browser"], "pass")} pass / ${count(["browser"], "fail")} fail (variants)`);
}
console.log("results:", outFile);
