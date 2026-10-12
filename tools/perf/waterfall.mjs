// SPDX-License-Identifier: AGPL-3.0-only
// debug: waterfall of one editor load with response ends, websocket frames and editor events
import { launch, closeBrowser, instrument, uploadDocx, deleteFile, uniqueName, probeEditable, collect } from "./lib.mjs";
const BASE = process.argv[2], file = process.argv[3], thr = +(process.argv[4] || 1), warm = process.argv[5] === "warm";
const ctx = await launch();
const created = [];
const page = await ctx.newPage();
if (warm) for (let i = 0; i < 2; i++) { const n = await uploadDocx(BASE, file, uniqueName("wf")); created.push(n); await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(n)}`); await probeEditable(page); await page.waitForTimeout(800); }
const name = await uploadDocx(BASE, file, uniqueName("wf")); created.push(name);
const ins = await instrument(page, { throttle: thr });
const ev = [];
ins.cdp.on("Network.responseReceived", e => { const r = ins.reqs.get(e.requestId); if (r) r.tResp = e.timestamp; });
ins.cdp.on("Network.loadingFinished", e => { const r = ins.reqs.get(e.requestId); if (r) r.tEnd = e.timestamp; });
ins.cdp.on("Network.requestWillBeSent", e => { const r = ins.reqs.get(e.requestId); if (r) r.ts = e.timestamp; });
ins.cdp.on("Network.webSocketFrameReceived", e => ev.push([e.timestamp, "WS<", e.response.payloadData.slice(0, 110)]));
ins.cdp.on("Network.webSocketFrameSent", e => ev.push([e.timestamp, "WS>", e.response.payloadData.slice(0, 110)]));
ins.cdp.on("Network.webSocketCreated", e => ev.push([null, "WS created", e.url, Date.now()]));
await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(name)}`, { waitUntil: "commit" });
const t0 = await page.evaluate(() => performance.timeOrigin);
const { editable } = await probeEditable(page);
await page.waitForTimeout(500);
const fr = await collect(page);
// map CDP monotonic timestamps to epoch with the main document request
const main = [...ins.reqs.values()].find(r => r.type === "Document");
const off = main.t - main.ts * 1000;
const rows = [];
for (const r of ins.reqs.values()) if (!r.url.startsWith("data:")) rows.push([r.ts * 1000 + off - t0, `${(r.type||"").padEnd(10)} ttfb ${r.tResp ? Math.round((r.tResp - r.ts) * 1000) : "-"} end ${r.tEnd ? Math.round(r.tEnd * 1000 + off - t0) : "-"} ${r.diskCache ? "disk " : ""}${r.url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/[\d.]+-\w+/, "").slice(0, 110)}`]);
for (const e of ev) if (e[0]) rows.push([e[0] * 1000 + off - t0, e[1] + " " + e[2]]);
const ed = fr.find(f => /documenteditor/.test(f.url)).perf, top = fr[0].perf;
rows.push([ed.paint["first-contentful-paint"] - t0, "== iframe FCP"]);
for (const [k, v] of Object.entries(top.events)) rows.push([v - t0, "== event " + k]);
rows.push([ed.viewerFrame - t0, "== doc visible"]);
rows.push([editable - t0, "== editable"]);
for (const [t, d] of ed.lt) rows.push([t - t0, `-- longtask ${Math.round(d)} ms`]);
rows.sort((a, b) => a[0] - b[0]);
for (const [t, s] of rows) console.log(String(Math.round(t)).padStart(6), s);
await closeBrowser(ctx); for (const n of created) await deleteFile(BASE, n);
