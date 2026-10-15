#!/usr/bin/env node
// Per-shortcut summary of run.mjs result files (one or several, e.g. a Windows
// and a macOS run).
//   node tests/shortcuts-excel/report.mjs [results.json ...] [--md] [--compare before.json[,before2.json]]
// A shortcut passes on a platform when every key variant tested for it passes.
// "flaky" and "error" (harness could not set the case up) are reported apart:
// they are neither a pass nor an editor gap.
import fs from "node:fs";
import path from "node:path";
import { readCsv, REPO, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const cmpIdx = args.indexOf("--compare");
const files = args.filter((a, i) => a.endsWith(".json") && !(cmpIdx >= 0 && i === cmpIdx + 1));
if (!files.length) files.push(path.join(HERE, "results", "latest.json"));
const md = args.includes("--md");
const rows = readCsv(path.join(REPO, "docs/shortcuts-excel.csv"));

function summarize(list) {
  const per = {};
  for (const f of list) {
    const { results } = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const r of results) {
      const k = r.id + "|" + r.platform;
      const p = per[k] || (per[k] = { status: null, reasons: [] });
      if (r.status === "fail" || r.status === "untested") { p.status = "fail"; p.reasons.push((r.keys ? r.keys + ": " : "") + r.reason); }
      else if (r.status === "flaky" || r.status === "error") { if (p.status !== "fail") p.status = "error"; p.reasons.push((r.keys ? r.keys + ": " : "") + r.status + ": " + r.reason); }
      else if (r.status === "pass") { if (!["fail", "error"].includes(p.status)) p.status = "pass"; }
      else if (!p.status) { p.status = r.status; r.reason && p.reasons.push(r.reason); }
    }
  }
  return per;
}

function counts(per) {
  const out = {};
  for (const plat of ["win", "mac"]) {
    for (const scope of ["editor", "browser"]) {
      const ids = rows.filter(r => r.scope === scope).map(r => r.id);
      const st = ids.map(id => (per[id + "|" + plat] || {}).status).filter(Boolean);
      out[plat + "." + scope] = { pass: st.filter(s => s === "pass").length, tested: st.filter(s => s === "pass" || s === "fail").length, error: st.filter(s => s === "error").length };
    }
  }
  return out;
}

const per = summarize(files);
const c = counts(per);
const before = cmpIdx >= 0 ? counts(summarize(args[cmpIdx + 1].split(","))) : null;
for (const k of Object.keys(c)) {
  console.log(`${k.padEnd(12)} ${c[k].pass}/${c[k].tested} pass` + (c[k].error ? `, ${c[k].error} flaky/error` : "") + (before ? `   (before: ${before[k].pass}/${before[k].tested})` : ""));
}

if (md) {
  const icon = s => (s === "pass" ? "✅" : s === "fail" ? "❌" : s === "skip" ? "⏭" : s === "error" ? "⚠" : "—");
  console.log("\n| id | action | Windows | | macOS | | scope | remarque |\n|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const w = per[r.id + "|win"] || {}, m = per[r.id + "|mac"] || {};
    if (!["editor", "browser"].includes(r.scope)) continue;
    const why = [...(w.reasons || []).map(x => "win " + x), ...(m.reasons || []).map(x => "mac " + x)].join("; ").replace(/\|/g, "/").replace(/\s+/g, " ");
    console.log(`| ${r.id} | ${r.action.replace(/\|/g, "/")} | ${r.windows.replace(/\|/g, "/")} | ${icon(w.status)} | ${r.macos.replace(/\|/g, "/")} | ${icon(m.status)} | ${r.scope} | ${why.slice(0, 200)} |`);
  }
}
