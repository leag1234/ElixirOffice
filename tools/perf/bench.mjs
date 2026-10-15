#!/usr/bin/env node
// ElixirOffice performance harness (Word editor). Method and results: docs/perf.md.
//
//   node tools/perf/bench.mjs --base http://localhost:8080 --label main \
//        [--runs 5] [--throttle 1,4] [--scenarios load,large,typing,scroll,start,fromstart] \
//        [--docs <dir with perf-10p/50p/100p.docx>] [--out tools/perf/results] [--max-load 4]
//
// Every run starts a fresh browser profile (cold HTTP cache) and opens freshly uploaded copies
// of the test documents (so the document server converts each one, as on a first open); the
// copies are deleted afterwards. Visit 1 = cold cache, visit 2 = warm HTTP cache, visit 3 = warm
// HTTP + V8 code cache. Machine load (uptime) is recorded with every run.
import fs from "node:fs";
import path from "node:path";
import { HERE, launch, closeBrowser, uploadDocx, deleteFile, uniqueName, machineLoad, waitForQuiet, median, quantile, writeJSON } from "./lib.mjs";
import { measureEditorLoad, measureStartPage, measureOpenFromStart, measureTyping, measureScroll } from "./scenarios.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
  return a;
}, []));
const BASE = args.base || "http://localhost:8080";
const LABEL = args.label || new URL(BASE).port;
const RUNS = +(args.runs || 5);
const THROTTLES = (args.throttle || "1,4").split(",").map(Number);
const SCEN = (args.scenarios || "load,large,typing,scroll,start,fromstart").split(",");
const DOCS = args.docs || path.join(HERE, "docs");
const VISITS = +(args.visits || 3);
const MAXLOAD = +(args["max-load"] || 4);
// optional network emulation for the load scenarios, e.g. --net 40,50 = 40 ms RTT, 50 Mbit/s down
// fromstart: time spent on the start page before clicking the file (lets its idle work run)
const DWELL = +(args.dwell || 0);
const NET = args.net ? (([lat, mbit]) => ({ latency: +lat, down: +mbit * 125000, up: +mbit * 125000 / 4 }))(args.net.split(",")) : null;
const OUT = args.out || path.join(HERE, "results");
const doc = n => path.join(DOCS, `perf-${n}.docx`);
for (const n of ["10p", "50p", "100p"]) if (!fs.existsSync(doc(n))) { console.error(`missing ${doc(n)}: run tools/perf/gen_docs.py ${DOCS}`); process.exit(2); }

const results = { label: LABEL, base: BASE, date: new Date().toISOString(), runs: RUNS, throttles: THROTTLES, net: NET, raw: {} };
const outFile = path.join(OUT, `${LABEL}-${results.date.slice(0, 16).replace(/[:T]/g, "")}.json`);
const push = (key, rec) => { (results.raw[key] ||= []).push(rec); writeJSON(outFile, results); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// A run is redone (up to 3 extra attempts per run) when the 1-minute load average rose above
// MAXLOAD + 2 while it ran: other jobs on the host would otherwise skew it.
const NOISY = MAXLOAD + 2;
async function repeat(label, once) {
  let ok = 0, attempts = 0;
  while (ok < RUNS && attempts < RUNS + 3) {
    attempts++;
    const before = await waitForQuiet(MAXLOAD);
    const recs = await once(ok, before);
    const after = machineLoad();
    if (recs && Math.max(before.load1, after.load1) > NOISY) {
      log(label, `run discarded (load ${before.load1} -> ${after.load1})`);
      results.discarded = (results.discarded || 0) + 1;
      continue;
    }
    if (recs) for (const [key, rec] of recs) push(key, rec);
    ok++;
  }
}

async function editorUrl(file, created) {
  const name = await uploadDocx(BASE, file, uniqueName(path.basename(file, ".docx")));
  created.push(name);
  return { name, url: `${BASE}/example/editor?fileName=${encodeURIComponent(name)}` };
}

async function loadRuns(kind, file, throttle) {
  await repeat(kind, async (r, before) => {
    const ctx = await launch();
    const created = [], out = [];
    try {
      for (let v = 1; v <= VISITS; v++) {
        const { url } = await editorUrl(file, created);
        const rec = await measureEditorLoad(ctx, url, { throttle, net: NET });
        rec.machine = machineLoad(); rec.machineBefore = before; rec.visit = v; rec.run = r;
        out.push([`${kind}/x${throttle}/v${v}`, rec]);
        log(kind, `x${throttle} run ${r} visit ${v}: chrome ${rec.chromeFCP} visible ${rec.docVisible} editable ${rec.editable} ms, ${(rec.net.wire / 1e6).toFixed(2)} MB/${rec.net.requests} req, load ${rec.machine.load1}`);
      }
    } catch (e) { log(kind, "run failed:", e.message); push(`${kind}/x${throttle}/errors`, { run: r, error: e.message }); }
    await closeBrowser(ctx);
    for (const n of created) await deleteFile(BASE, n);
    return out.length === VISITS ? out : null;
  });
}

for (const throttle of THROTTLES) {
  if (SCEN.includes("load")) await loadRuns("load10p", doc("10p"), throttle);
  if (SCEN.includes("large")) await loadRuns("load100p", doc("100p"), throttle);

  if (SCEN.includes("start")) await repeat("start", async (r) => {
    const ctx = await launch(), out = [];
    for (let v = 1; v <= 2; v++) {
      const { rec, page } = await measureStartPage(ctx, BASE, { throttle });
      await page.close();
      rec.machine = machineLoad(); rec.visit = v; rec.run = r;
      out.push([`start/x${throttle}/v${v}`, rec]);
      log("start", `x${throttle} run ${r} visit ${v}: fcp ${rec.fcp} load ${rec.load} ms, ${(rec.net.wire / 1e3).toFixed(0)} kB/${rec.net.requests} req`);
    }
    await closeBrowser(ctx);
    return out;
  });

  if (SCEN.includes("fromstart")) await repeat("fromstart", async (r) => {
    const ctx = await launch();
    const created = [], out = [];
    try {
      for (let v = 1; v <= VISITS; v++) {
        const { name } = await editorUrl(doc("10p"), created);
        const rec = await measureOpenFromStart(ctx, BASE, name, { throttle, dwell: DWELL, net: NET });
        rec.machine = machineLoad(); rec.visit = v; rec.run = r;
        out.push([`fromstart/x${throttle}/v${v}`, rec]);
        log("fromstart", `x${throttle} run ${r} visit ${v}: tab ${rec.navStart} chrome ${rec.chromeFCP} visible ${rec.docVisible} editable ${rec.editable} ms`);
      }
    } catch (e) { log("fromstart run failed:", e.message); push(`fromstart/x${throttle}/errors`, { run: r, error: e.message }); }
    await closeBrowser(ctx);
    for (const n of created) await deleteFile(BASE, n);
    return out.length === VISITS ? out : null;
  });

  if (SCEN.includes("typing")) await repeat("typing", async (r) => {
    const ctx = await launch();
    const created = [];
    let out = null;
    try {
      const { url } = await editorUrl(doc("10p"), created);
      const rec = await measureTyping(ctx, url, { throttle });
      rec.machine = machineLoad(); rec.run = r;
      out = [[`typing/x${throttle}`, rec]];
      log("typing", `x${throttle} run ${r}: p50 ${rec.p50} p95 ${rec.p95} max ${rec.max} ms (draw p50 ${rec.drawP50}), ${rec.keys} keys/${rec.paints} paints, load ${rec.machine.load1}`);
    } catch (e) { log("typing run failed:", e.message); push(`typing/x${throttle}/errors`, { run: r, error: e.message }); }
    await closeBrowser(ctx);
    for (const n of created) await deleteFile(BASE, n);
    return out;
  });

  if (SCEN.includes("scroll")) await repeat("scroll", async (r) => {
    const ctx = await launch();
    const created = [];
    let out = null;
    try {
      const { url } = await editorUrl(doc("50p"), created);
      const rec = await measureScroll(ctx, url, { throttle });
      rec.machine = machineLoad(); rec.run = r;
      out = [[`scroll/x${throttle}`, rec]];
      log("scroll", `x${throttle} run ${r}: ${rec.fps} fps, ${rec.paintsPerS} paints/s, frame p95 ${rec.frameP95} ms, jank ${rec.jank}, reached page ${rec.endPage}/${rec.pages}, load ${rec.machine.load1}`);
    } catch (e) { log("scroll run failed:", e.message); push(`scroll/x${throttle}/errors`, { run: r, error: e.message }); }
    await closeBrowser(ctx);
    for (const n of created) await deleteFile(BASE, n);
    return out;
  });
}

// Summary: medians over runs
const summary = {};
for (const [k, recs] of Object.entries(results.raw)) {
  if (k.endsWith("/errors")) { summary[k] = recs.length; continue; }
  const m = f => { const v = median(recs.map(f).filter(x => x != null)); return v == null ? null : Math.round(v); };
  if (k.startsWith("load") || k.startsWith("fromstart")) summary[k] = {
    n: recs.length, navStart: m(r => r.navStart), chromeFCP: m(r => r.chromeFCP), appReady: m(r => r.appReady), docVisible: m(r => r.docVisible),
    docReady: m(r => r.docReady), editable: m(r => r.editable), editableP90: Math.round(quantile(recs.map(r => r.editable), 0.9)),
    wireKB: m(r => r.net.wire / 1024), requests: m(r => r.net.requests), cached: m(r => r.net.fromCache), errors: m(r => r.net.errors.length),
    tbt: m(r => r.lt.tbt), longTasks: m(r => r.lt.count), maxTask: m(r => r.lt.max), load1: median(recs.map(r => r.machine.load1)),
  };
  else if (k.startsWith("start")) summary[k] = { n: recs.length, fcp: m(r => r.fcp), load: m(r => r.load), wireKB: m(r => r.net.wire / 1024), requests: m(r => r.net.requests) };
  else if (k.startsWith("typing")) {
    const all = recs.flatMap(r => r.lat);
    summary[k] = { n: recs.length, keys: all.length, p50: Math.round(quantile(all, 0.5)), p95: Math.round(quantile(all, 0.95)), p99: Math.round(quantile(all, 0.99)), max: Math.round(Math.max(...all)), drawP50: m(r => r.drawP50), drawP95: m(r => r.drawP95), load1: median(recs.map(r => r.machine.load1)) };
  } else if (k.startsWith("scroll")) summary[k] = { n: recs.length, fps: median(recs.map(r => r.fps)), paintsPerS: median(recs.map(r => r.paintsPerS)), frameP95: median(recs.map(r => r.frameP95)), jank: m(r => r.jank), longestFrame: m(r => r.longestFrame), tbt: m(r => r.lt.tbt), load1: median(recs.map(r => r.machine.load1)) };
}
results.summary = summary;
writeJSON(outFile, results);
console.log(JSON.stringify(summary, null, 1));
console.log("written", outFile);
