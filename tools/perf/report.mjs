#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Markdown tables from bench.mjs result files (medians over runs; p90 for "editable").
//   node tools/perf/report.mjs results/a.json [results/b.json ...]
// With two files, prints a before/after comparison for the scenarios they share.
import fs from "node:fs";
import { median, quantile } from "./lib.mjs";

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: report.mjs <result.json> [<result.json>]"); process.exit(2); }
const R = files.map(f => JSON.parse(fs.readFileSync(f, "utf8")));
const med = (recs, f) => { const v = median(recs.map(f).filter(x => x != null && Number.isFinite(x))); return v == null ? null : v; };
const r0 = x => (x == null ? "–" : String(Math.round(x)));
const kb = x => (x == null ? "–" : (x / 1024 >= 1024 ? (x / 1048576).toFixed(1) + " Mo" : Math.round(x / 1024) + " ko"));

function loadRow(recs) {
  return {
    n: recs.length,
    chrome: med(recs, r => r.chromeFCP), app: med(recs, r => r.appReady), visible: med(recs, r => r.docVisible),
    editable: med(recs, r => r.editable), p90: quantile(recs.map(r => r.editable), 0.9),
    wire: med(recs, r => r.net.wire), req: med(recs, r => r.net.requests), tbt: med(recs, r => r.lt.tbt), maxTask: med(recs, r => r.lt.max),
    load1: med(recs, r => (r.machine || r.load || {}).load1),
  };
}
function header(title) { console.log(`\n### ${title}\n`); }

for (const [i, res] of R.entries()) {
  header(`${res.label} (${res.base}, ${res.date.slice(0, 16)}${res.net ? `, network ${res.net.latency} ms / ${Math.round(res.net.down / 125000)} Mbit/s` : ""})`);
  const keys = Object.keys(res.raw).filter(k => !k.endsWith("/errors"));
  const loads = keys.filter(k => /^(load|fromstart)/.test(k));
  if (loads.length) {
    console.log("| scenario | CPU | visit | n | chrome (ms) | doc visible (ms) | editable (ms) | editable p90 | transferred | requests | TBT (ms) | tâche max (ms) | load avg |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const k of loads) {
      const [scen, thr, v] = k.split("/");
      const x = loadRow(res.raw[k]);
      console.log(`| ${scen} | ${thr} | ${v} | ${x.n} | ${r0(x.chrome)} | ${r0(x.visible)} | **${r0(x.editable)}** | ${r0(x.p90)} | ${kb(x.wire)} | ${r0(x.req)} | ${r0(x.tbt)} | ${r0(x.maxTask)} | ${x.load1?.toFixed(1)} |`);
    }
  }
  const starts = keys.filter(k => k.startsWith("start"));
  if (starts.length) {
    console.log("\n| home page | CPU | visit | n | FCP (ms) | load (ms) | transferred | requests |");
    console.log("|---|---|---|---|---|---|---|---|");
    for (const k of starts) {
      const [, thr, v] = k.split("/"); const recs = res.raw[k];
      console.log(`| /example/ | ${thr} | ${v} | ${recs.length} | ${r0(med(recs, r => r.fcp))} | ${r0(med(recs, r => r.load))} | ${kb(med(recs, r => r.net.wire))} | ${r0(med(recs, r => r.net.requests))} |`);
    }
  }
  const typing = keys.filter(k => k.startsWith("typing"));
  if (typing.length) {
    console.log("\n| frappe (200 car., doc 10 p.) | CPU | n | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | dessin p50 | load avg |");
    console.log("|---|---|---|---|---|---|---|---|---|");
    for (const k of typing) {
      const recs = res.raw[k]; const all = recs.flatMap(r => r.lat);
      console.log(`| typing | ${k.split("/")[1]} | ${recs.length} | **${r0(quantile(all, 0.5))}** | **${r0(quantile(all, 0.95))}** | ${r0(quantile(all, 0.99))} | ${r0(Math.max(...all))} | ${r0(med(recs, r => r.drawP50))} | ${med(recs, r => (r.machine || r.load || {}).load1)?.toFixed(1)} |`);
    }
  }
  const scroll = keys.filter(k => k.startsWith("scroll"));
  if (scroll.length) {
    console.log("\n| scrolling (50-page doc, 5 s) | CPU | n | frames/s (rAF) | repaints/s | p95 interval (ms) | frames > 50 ms | worst frame (ms) | page reached | load avg |");
    console.log("|---|---|---|---|---|---|---|---|---|---|");
    for (const k of scroll) {
      const recs = res.raw[k];
      console.log(`| scroll | ${k.split("/")[1]} | ${recs.length} | ${med(recs, r => r.fps)} | **${med(recs, r => r.paintsPerS)}** | ${med(recs, r => r.frameP95)} | ${r0(med(recs, r => r.jank))} | ${r0(med(recs, r => r.longestFrame))} | ${r0(med(recs, r => r.endPage))} | ${med(recs, r => (r.machine || r.load || {}).load1)?.toFixed(1)} |`);
    }
  }
  const errs = Object.keys(res.raw).filter(k => k.endsWith("/errors"));
  if (errs.length) console.log("\nÉchecs : " + errs.map(k => `${k} ×${res.raw[k].length}`).join(", "));
}
