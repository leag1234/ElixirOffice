#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Per-shortcut summary of a run.mjs result file.
//   node tests/shortcuts/report.mjs [results.json] [--md] [--compare before.json]
// A shortcut passes on a platform when every key variant tested for it passes.
import fs from "node:fs";
import path from "node:path";
import { readCsv, REPO, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const file = args.find(a => a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--compare") || path.join(HERE, "results", "latest.json");
const cmpIdx = args.indexOf("--compare");
const md = args.includes("--md");
const rows = readCsv(path.join(REPO, "docs/shortcuts-word.csv"));

function summarize(f) {
  const { results } = JSON.parse(fs.readFileSync(f, "utf8"));
  const per = {};
  for (const r of results) {
    const k = r.id + "|" + r.platform;
    const p = per[k] || (per[k] = { status: null, reasons: [] });
    if (r.status === "fail" || r.status === "untested") { p.status = "fail"; p.reasons.push((r.keys ? r.keys + ": " : "") + r.reason); }
    else if (r.status === "pass") { if (p.status !== "fail") p.status = "pass"; }
    else if (!p.status) p.status = r.status;
  }
  return per;
}

function counts(per) {
  const out = {};
  for (const plat of ["win", "mac"]) {
    for (const scope of ["editor", "browser"]) {
      const ids = rows.filter(r => r.scope === scope).map(r => r.id);
      const st = ids.map(id => (per[id + "|" + plat] || {}).status).filter(Boolean);
      out[plat + "." + scope] = { pass: st.filter(s => s === "pass").length, tested: st.filter(s => s === "pass" || s === "fail").length };
    }
  }
  return out;
}

const per = summarize(file);
const c = counts(per);
const before = cmpIdx >= 0 ? counts(summarize(args[cmpIdx + 1])) : null;
for (const k of Object.keys(c)) {
  console.log(`${k.padEnd(12)} ${c[k].pass}/${c[k].tested} pass` + (before ? `   (before: ${before[k].pass}/${before[k].tested})` : ""));
}

if (md) {
  const icon = s => (s === "pass" ? "✅" : s === "fail" ? "❌" : s === "skip" ? "⏭" : "—");
  console.log("\n| id | action | Windows | | macOS | | scope | remarque |\n|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const w = per[r.id + "|win"] || {}, m = per[r.id + "|mac"] || {};
    if (!["editor", "browser"].includes(r.scope)) continue;
    const why = [...(w.reasons || []).map(x => "win " + x), ...(m.reasons || []).map(x => "mac " + x)].join("; ").replace(/\|/g, "/");
    console.log(`| ${r.id} | ${r.action.replace(/\|/g, "/")} | ${r.windows.replace(/\|/g, "/")} | ${icon(w.status)} | ${r.macos.replace(/\|/g, "/")} | ${icon(m.status)} | ${r.scope} | ${why.slice(0, 160)} |`);
  }
}
