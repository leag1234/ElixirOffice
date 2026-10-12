#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// CPU profile of one editor load (navigation -> first accepted keystroke) and, optionally, of
// typing; writes the .cpuprofile (open in Chrome DevTools > Performance, or speedscope.app) and
// prints the top functions by self time and the time per script file.
//
//   node tools/perf/profile.mjs --base http://localhost:32772 [--doc tools/perf/docs/perf-10p.docx]
//        [--throttle 1] [--warm] [--typing 100] [--out dir]
import fs from "node:fs";
import path from "node:path";
import { HERE, launch, closeBrowser, instrument, uploadDocx, deleteFile, uniqueName, probeEditable, waitReady, machineLoad } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
  return a;
}, []));
const BASE = args.base || "http://localhost:8080";
const DOC = args.doc || path.join(HERE, "docs/perf-10p.docx");
const THR = +(args.throttle || 1);
const OUT = args.out || path.join(HERE, "results");
fs.mkdirSync(OUT, { recursive: true });

export function summarize(profile, n = 25) {
  const nodes = new Map(profile.nodes.map(x => [x.id, x]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    self.set(id, (self.get(id) || 0) + (dt[i + 1] !== undefined ? dt[i + 1] : 0) / 1000);
  }
  const byFn = new Map(), byFile = new Map();
  let total = 0, idle = 0, gc = 0, program = 0;
  for (const [id, ms] of self) {
    const cf = nodes.get(id).callFrame;
    total += ms;
    if (cf.functionName === "(idle)") { idle += ms; continue; }
    if (cf.functionName === "(garbage collector)") gc += ms;
    if (cf.functionName === "(program)") program += ms;
    const file = (cf.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/[\d.]+-\w+/, "").replace(/\?.*$/, "") || "(native)";
    const k = `${cf.functionName || "(anonymous)"}  ${file}:${cf.lineNumber + 1}`;
    byFn.set(k, (byFn.get(k) || 0) + ms);
    byFile.set(file, (byFile.get(file) || 0) + ms);
  }
  // inclusive ("total") time per function, each sample counted once per distinct function on
  // its stack (recursion is not double-counted): the flame-chart view of where time goes
  const parent = new Map();
  for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id);
  const keyOf = id => { const cf = nodes.get(id).callFrame; const file = (cf.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/[\d.]+-\w+/, "").replace(/\?.*$/, ""); return `${cf.functionName || "(anonymous)"}  ${file || "(native)"}:${cf.lineNumber + 1}`; };
  const incl = new Map();
  for (const [id, ms] of self) {
    const fn = nodes.get(id).callFrame.functionName;
    if (fn === "(idle)" || fn === "(program)" || fn === "(garbage collector)" || fn === "(root)") continue;
    const seen = new Set();
    for (let n = id; n !== undefined; n = parent.get(n)) {
      const k = keyOf(n);
      if (k.startsWith("(root)") || seen.has(k)) continue;
      seen.add(k); incl.set(k, (incl.get(k) || 0) + ms);
    }
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [Math.round(v), k]);
  return { totalMs: Math.round(total), busyMs: Math.round(total - idle), idleMs: Math.round(idle), gcMs: Math.round(gc), programMs: Math.round(program), topSelf: top(byFn), topTotal: top(incl).filter(([, k]) => !/^\(anonymous\)/.test(k)).slice(0, 30), byFile: top(byFile) };
}

const ctx = await launch();
const created = [];
const page = await ctx.newPage();
const ins = await instrument(page, { throttle: THR });
const cdp = ins.cdp;
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
if (args.warm) { // prime the HTTP and code caches with two loads of another copy
  for (let i = 0; i < 2; i++) {
    const n = await uploadDocx(BASE, DOC, uniqueName("prof-warm")); created.push(n);
    await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(n)}`);
    await probeEditable(page);
    await page.waitForTimeout(1000);
  }
}
const name = await uploadDocx(BASE, DOC, uniqueName("prof")); created.push(name);
const load = machineLoad();
await cdp.send("Profiler.start");
await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(name)}`, { waitUntil: "commit" });
const t0 = await page.evaluate(() => performance.timeOrigin);
const { editable } = await probeEditable(page);
const { profile } = await cdp.send("Profiler.stop");
const tag = `${path.basename(DOC, ".docx")}-x${THR}${args.warm ? "-warm" : "-cold"}`;
fs.writeFileSync(path.join(OUT, `load-${tag}.cpuprofile`), JSON.stringify(profile));
const s = summarize(profile);
console.log(JSON.stringify({ phase: "load", tag, editableMs: Math.round(editable - t0), load, ...s }, null, 1));

if (args.typing) {
  const frame = await waitReady(page);
  await page.waitForTimeout(2000);
  await cdp.send("Profiler.start");
  for (let i = 0; i < +args.typing; i++) { await page.keyboard.type("abcdefgh "[i % 9]); await page.waitForTimeout(70); }
  const { profile: p2 } = await cdp.send("Profiler.stop");
  fs.writeFileSync(path.join(OUT, `typing-${tag}.cpuprofile`), JSON.stringify(p2));
  console.log(JSON.stringify({ phase: "typing", tag, ...summarize(p2) }, null, 1));
}
await closeBrowser(ctx);
for (const n of created) await deleteFile(BASE, n);
