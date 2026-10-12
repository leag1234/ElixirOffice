#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Per-task success with 95 % confidence intervals (Wilson score) and median latency, for one or
// more evaluation result sets (tools/eval/run.mjs output directories or results.json files).
//
//   node tools/eval/stats.mjs <dirA> [<dirB> ...]        one column per result set (e.g. before / after)
//   node tools/eval/stats.mjs --md <dirA> [<dirB> ...]   Markdown table
//
// Several result directories can be merged into one column with a comma: dir1,dir2.
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const MD = argv.includes("--md");
const sets = argv.filter(a => a !== "--md");
if (!sets.length) { console.error("usage: stats.mjs [--md] <results dir>[,<dir>...] ..."); process.exit(1); }

const load = spec => spec.split(",").flatMap(p => {
  const f = fs.statSync(p).isDirectory() ? path.join(p, "results.json") : p;
  return JSON.parse(fs.readFileSync(f, "utf8"));
});

// Wilson score interval for k successes out of n (95 %)
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = x => Math.round(100 * x);

const data = sets.map(load);
const labels = sets.map(s => path.basename(s.split(",")[0].replace(/\/results\.json$/, "")));
const tasks = [...new Set(data.flat().map(r => r.task))].sort();
const cell = (rs) => {
  const k = rs.filter(r => r.success).length, n = rs.length;
  if (!n) return "–";
  const [lo, hi] = wilson(k, n), lat = median(rs.filter(r => r.latencyMs).map(r => r.latencyMs));
  return `${k}/${n} [${pct(lo)}–${pct(hi)} %] ${lat ? (lat / 1000).toFixed(1) + " s" : ""}`;
};
const rows = tasks.map(t => [t, ...data.map(d => cell(d.filter(r => r.task === t)))]);
const total = ["TOTAL", ...data.map(d => cell(d))];
const under8 = ["tasks under 80 %", ...data.map(d => String(tasks.filter(t => { const rs = d.filter(r => r.task === t); return rs.length && rs.filter(r => r.success).length / rs.length < 0.8; }).length))];
if (MD) {
  console.log(`| Task | ${labels.join(" | ")} |`);
  console.log(`|---|${labels.map(() => "---").join("|")}|`);
  for (const r of [...rows, total, under8]) console.log(`| ${r[0].startsWith("TOTAL") || r[0].startsWith("tasks") ? "**" + r[0] + "**" : "`" + r[0] + "`"} | ${r.slice(1).join(" | ")} |`);
} else {
  const w = [Math.max(...rows.map(r => r[0].length), 18), ...labels.map((l, i) => Math.max(l.length, ...rows.map(r => r[i + 1].length), total[i + 1].length))];
  const line = r => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log(line(["task", ...labels]));
  for (const r of [...rows, total, under8]) console.log(line(r));
}
