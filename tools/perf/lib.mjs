// Shared helpers of the performance harness (docs/perf.md).
//
// Environment:
//   PW_DIR   directory where the playwright package is installed (default /srv/elixiroffice/pw)
//   PERF_HEADFUL=1   run a visible browser (debugging only; numbers are not comparable)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
export const { chromium } = createRequire(path.join(PW_DIR, "package.json"))("playwright");

// ---------------------------------------------------------------------------------------------
// Statistics
export function quantile(xs, q) {
  const s = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const median = xs => quantile(xs, 0.5);
export const sum = xs => xs.reduce((a, b) => a + b, 0);

// Machine load, recorded with every measurement (other agents build on the same host)
export function machineLoad() {
  const [l1, l5, l15] = os.loadavg();
  return { load1: +l1.toFixed(2), load5: +l5.toFixed(2), load15: +l15.toFixed(2), cpus: os.cpus().length, at: new Date().toISOString() };
}

// Wait until the 1-minute load average drops under `max` (or give up after `timeoutS`)
export async function waitForQuiet(max = 4, timeoutS = 600) {
  const t0 = Date.now();
  while (os.loadavg()[0] > max && Date.now() - t0 < timeoutS * 1000) await new Promise(r => setTimeout(r, 5000));
  return machineLoad();
}

// ---------------------------------------------------------------------------------------------
// Example app (start page) storage: files are stored per client IP; node's fetch and the
// browser both reach the instance from the same host, so they share the storage folder.
export async function uploadDocx(base, file, name) {
  const fd = new FormData();
  fd.append("uploadedFile", new Blob([fs.readFileSync(file)]), name || path.basename(file));
  const r = await fetch(base + "/example/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}
export async function deleteFile(base, name) {
  try { await fetch(base + "/example/file?filename=" + encodeURIComponent(name), { method: "DELETE" }); } catch (e) {}
}
let seq = 0;
export const uniqueName = (prefix) => `${prefix}-${process.pid}-${Date.now().toString(36)}-${seq++}.docx`;

// ---------------------------------------------------------------------------------------------
// Instrumentation injected in every frame before any page script runs.
// Times are epoch milliseconds (performance.timeOrigin + performance.now()) so that the top
// page and the editor iframe share one clock.
const INIT = () => {
  if (window.__perf) return;
  const now = () => performance.timeOrigin + performance.now();
  const P = window.__perf = { res: [], lt: [], loaf: [], paint: {}, events: {}, viewerDraw: null, viewerFrame: null, keys: [], ev: [] };
  const obs = (type, fn, extra) => { try { new PerformanceObserver(l => l.getEntries().forEach(fn)).observe(Object.assign({ type, buffered: true }, extra || {})); } catch (e) {} };
  obs("longtask", e => P.lt.push([performance.timeOrigin + e.startTime, e.duration]));
  obs("paint", e => { P.paint[e.name] = performance.timeOrigin + e.startTime; });
  // Resource Timing: transferSize is the reliable "bytes on the wire" for same-origin requests
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  obs("resource", e => P.res.push({ url: e.name, transfer: e.transferSize, enc: e.encodedBodySize, dec: e.decodedBodySize, t: performance.timeOrigin + e.startTime, end: performance.timeOrigin + e.responseEnd, init: e.initiatorType }));
  obs("long-animation-frame", e => P.loaf.push({
    t: performance.timeOrigin + e.startTime, d: e.duration, block: e.blockingDuration,
    scripts: (e.scripts || []).map(s => ({ d: s.duration, inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: s.sourceURL, pos: s.sourceCharPosition, styleLayout: s.forcedStyleAndLayoutDuration })),
    render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
  }));
  obs("event", e => P.ev.push({ name: e.name, t: performance.timeOrigin + e.startTime, d: e.duration, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }), { durationThreshold: 16 });
  // DocsAPI events posted by the editor iframe to its parent (onAppReady, onDocumentReady, ...)
  window.addEventListener("message", e => {
    try {
      const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (d && d.event && !(d.event in P.events)) P.events[d.event] = now();
    } catch (err) {}
  });
  // First blit of a page onto the document canvas (#id_viewer): the document becomes visible
  // in the frame presented after it.
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function () {
    if (P.viewerDraw === null && this.canvas && this.canvas.id === "id_viewer") {
      P.viewerDraw = now();
      requestAnimationFrame(() => { P.viewerFrame = now(); });
    }
    return di.apply(this, arguments);
  };
  document.addEventListener("keydown", e => P.keys.push(performance.timeOrigin + e.timeStamp), true);
};

// ---------------------------------------------------------------------------------------------
// Browser
//   throttle: CPU slowdown factor (Emulation.setCPUThrottlingRate), 1 = native
//   net: optional {latency, down, up} (ms, bytes/s) network emulation
export async function launch({ userDataDir, viewport = { width: 1440, height: 900 } } = {}) {
  const dir = userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), "eo-perf-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", headless: !process.env.PERF_HEADFUL, viewport,
    args: ["--disable-features=Translate,OptimizationHints", "--no-first-run", "--no-default-browser-check"],
  });
  await ctx.addInitScript(INIT);
  ctx.__dir = dir;
  return ctx;
}
export async function closeBrowser(ctx) {
  await ctx.close();
  if (ctx.__dir && ctx.__dir.includes("eo-perf-")) fs.rmSync(ctx.__dir, { recursive: true, force: true });
}

// Network capture through CDP (the editor iframe is same-origin, so it shares the page target)
export async function instrument(page, { throttle = 1, net = null } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (net) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: net.up });
  const reqs = new Map();
  const ws = { frames: 0, bytesIn: 0, bytesOut: 0 };
  cdp.on("Network.requestWillBeSent", e => {
    const r = reqs.get(e.requestId) || {};
    reqs.set(e.requestId, Object.assign(r, { url: e.request.url, type: e.type, method: e.request.method, t: e.wallTime * 1000 }));
  });
  cdp.on("Network.requestServedFromCache", e => { const r = reqs.get(e.requestId); if (r) r.memCache = true; });
  cdp.on("Network.responseReceived", e => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.status = e.response.status; r.mime = e.response.mimeType; r.type = e.type || r.type;
    r.diskCache = !!e.response.fromDiskCache; r.sw = !!e.response.fromServiceWorker;
    r.enc = (e.response.headers["content-encoding"] || e.response.headers["Content-Encoding"] || "");
    r.cc = (e.response.headers["cache-control"] || e.response.headers["Cache-Control"] || "");
  });
  // encodedDataLength is reported either per chunk or at the end depending on the request
  cdp.on("Network.dataReceived", e => { const r = reqs.get(e.requestId); if (r) { r.decoded = (r.decoded || 0) + e.dataLength; r.wireChunks = (r.wireChunks || 0) + (e.encodedDataLength || 0); } });
  cdp.on("Network.loadingFinished", e => { const r = reqs.get(e.requestId); if (r) { r.wire = Math.max(e.encodedDataLength || 0, r.wireChunks || 0); r.done = true; } });
  cdp.on("Network.loadingFailed", e => { const r = reqs.get(e.requestId); if (r) { r.failed = e.errorText; r.done = true; } });
  cdp.on("Network.webSocketFrameReceived", e => { ws.frames++; ws.bytesIn += (e.response.payloadData || "").length; });
  cdp.on("Network.webSocketFrameSent", e => { ws.frames++; ws.bytesOut += (e.response.payloadData || "").length; });
  const console_ = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") console_.push({ type: m.type(), text: m.text().slice(0, 300) }); });
  page.on("pageerror", e => console_.push({ type: "pageerror", text: String(e).slice(0, 300) }));
  return { cdp, reqs, ws, console: console_ };
}

// Request category for the bytes table
export function category(url) {
  let p; try { p = new URL(url).pathname; } catch (e) { return "other"; }
  p = p.replace(/^\/[\d.]+-[\w]+\//, "/");
  if (/^\/cache\/files\//.test(p)) return "document";
  if (/^\/fonts\//.test(p)) return "fonts";
  if (/^\/sdkjs\/.*\.(js|wasm)$/.test(p)) return "sdkjs";
  if (/^\/sdkjs\//.test(p)) return "sdkjs-other";
  if (/^\/sdkjs-plugins\//.test(p)) return "plugins";
  if (/^\/web-apps\/.*\.js$/.test(p)) return "web-apps-js";
  if (/^\/web-apps\/.*\.css$/.test(p)) return "web-apps-css";
  if (/^\/web-apps\/.*\.json$/.test(p)) return "web-apps-json";
  if (/^\/web-apps\/.*\.(png|svg|jpg|gif|ico|woff2?|ttf)$/.test(p)) return "web-apps-img";
  if (/^\/web-apps\//.test(p)) return "web-apps-html";
  if (/^\/example\//.test(p)) return "example";
  if (/^\/(doc|coauthoring|socket)/.test(p)) return "docservice";
  return "other";
}

// Compressed size of a response as the server sends it (Chrome does not report the transfer
// size of the editor iframe's requests, neither through CDP nor Resource Timing). Same request
// headers as a browser: gzip/deflate/br accepted. Cached per URL.
const wireCache = new Map();
function wireSize(url) {
  if (wireCache.has(url)) return wireCache.get(url);
  const p = new Promise(resolve => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "accept-encoding": "gzip, deflate, br", "user-agent": "Mozilla/5.0 Chrome/140" } }, res => {
      let n = 0;
      res.on("data", c => { n += c.length; });
      res.on("end", () => resolve({ body: n, enc: res.headers["content-encoding"] || "" }));
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
  });
  wireCache.set(url, p);
  return p;
}

export async function netSummary(reqs, ws) {
  const all = [...reqs.values()].filter(r => r.url && !r.url.startsWith("data:") && !r.url.startsWith("blob:"));
  for (const r of all) {
    if (r.diskCache || r.memCache || r.failed || !(r.status >= 200 && r.status < 300) || r.method !== "GET") continue;
    if (!r.wire && r.decoded) {  // not reported by Chrome (0, not a small 304): measure it
      const w = await wireSize(r.url);
      if (w) { r.wire = w.body; r.wireMeasured = true; if (!r.enc) r.enc = w.enc; }
    }
  }
  const byCat = {};
  for (const r of all) {
    const c = category(r.url);
    const b = byCat[c] || (byCat[c] = { n: 0, wire: 0, decoded: 0, cached: 0 });
    b.n++; b.wire += r.wire || 0; b.decoded += r.decoded || 0;
    if (r.diskCache || r.memCache) b.cached++;
  }
  const errors = all.filter(r => r.status >= 400 || r.failed).map(r => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ""), status: r.status, failed: r.failed }));
  const uncompressed = all.filter(r => !r.enc && (r.decoded || 0) > 4096 && /javascript|css|json|svg|html|text|wasm/.test(r.mime || "") && !(r.diskCache || r.memCache))
    .map(r => ({ url: r.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 140), bytes: r.decoded, mime: r.mime }));
  const notCached = all.filter(r => r.status === 200 && !(r.diskCache || r.memCache) && r.method === "GET" && !/immutable|max-age=[1-9]/.test(r.cc || "") && (r.decoded || 0) > 1024)
    .map(r => ({ url: r.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 140), cc: r.cc, bytes: r.decoded }));
  return {
    requests: all.length,
    fromCache: all.filter(r => r.diskCache || r.memCache).length,
    wire: sum(all.map(r => r.wire || 0)),
    decoded: sum(all.map(r => r.decoded || 0)),
    byCat, errors, uncompressed, notCached, ws: { ...ws },
  };
}

// ---------------------------------------------------------------------------------------------
// Editor helpers
export function editorFrame(page) {
  return page.frames().find(f => /\/documenteditor\/main\//.test(f.url()));
}
export async function waitEditorFrame(page, timeout = 120000) {
  const t0 = Date.now();
  for (;;) {
    const f = editorFrame(page);
    if (f) return f;
    if (Date.now() - t0 > timeout) throw new Error("editor frame not found");
    await page.waitForTimeout(20);
  }
}
const safe = async (frame, fn, arg) => { try { return await frame.evaluate(fn, arg); } catch (e) { return undefined; } };

// Wait for "document editable": press a key every ~interval ms in the document input area
// until one is accepted (the document reports a modification). Returns the epoch time of the
// accepted keydown (as seen by the page) and the time its glyph reached the canvas.
export async function probeEditable(page, { timeout = 180000, key = "x" } = {}) {
  const t0 = Date.now();
  let frame = null;
  while (Date.now() - t0 < timeout) {
    frame = frame && !frame.isDetached() ? frame : editorFrame(page);
    if (!frame) { await page.waitForTimeout(20); continue; }
    const ok = await safe(frame, () => {
      const a = document.getElementById("area_id");
      if (!a || !window.Asc || !Asc.editor || !Asc.editor.isDocumentModified) return false;
      if (Asc.editor.isDocumentModified()) return "already";
      if (document.activeElement !== a) a.focus();
      return document.activeElement === a;
    });
    if (ok === "already") throw new Error("document modified before the probe");
    if (!ok) { await page.waitForTimeout(20); continue; }
    await page.keyboard.press(key);
    const r = await safe(frame, () => Asc.editor.isDocumentModified() ? window.__perf.keys[window.__perf.keys.length - 1] : null);
    if (r) {
      // wait for the glyph: next blit of #id_viewer after the accepted key
      const glyph = await safe(frame, () => new Promise(res => {
        const wc = Asc.editor.WordControl, orig = wc.OnPaint;
        const done = () => { wc.OnPaint = orig; requestAnimationFrame(() => res(performance.timeOrigin + performance.now())); };
        wc.OnPaint = function () { const x = orig.apply(this, arguments); done(); return x; };
        setTimeout(() => { wc.OnPaint = orig; res(null); }, 3000);
      }));
      return { editable: r, glyph, frame };
    }
    await page.waitForTimeout(15);
  }
  throw new Error("document never became editable");
}

// Wait until the editor is ready and idle (used before typing/scrolling tests)
export async function waitReady(page, timeout = 180000) {
  const frame = await waitEditorFrame(page, timeout);
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout, polling: 100 });
  return frame;
}

// Collect the instrumentation of every frame
export async function collect(page) {
  const out = [];
  for (const f of page.frames()) {
    const p = await safe(f, () => window.__perf ? JSON.parse(JSON.stringify(window.__perf)) : null);
    if (p) out.push({ url: f.url(), origin: await safe(f, () => performance.timeOrigin), perf: p });
  }
  return out;
}

// Long-task statistics within [from, to] over all frames (de-duplicated: the iframe and the
// top page can both report the same task)
export function longTasks(frames, from, to) {
  const seen = new Set(), tasks = [];
  for (const f of frames) for (const [t, d] of f.perf.lt) {
    const k = Math.round(t / 5) + ":" + Math.round(d / 5);
    if (seen.has(k) || t < from || t > to) continue;
    seen.add(k); tasks.push(d);
  }
  return { count: tasks.length, total: Math.round(sum(tasks)), tbt: Math.round(sum(tasks.map(d => Math.max(0, d - 50)))), max: Math.round(Math.max(0, ...tasks)) };
}

// Aggregate long-animation-frame script attributions: where the long frames spend their time
export function loafTop(frames, from, to, n = 15) {
  const agg = new Map();
  for (const f of frames) for (const l of f.perf.loaf) {
    if (l.t < from || l.t > to) continue;
    for (const s of l.scripts) {
      const file = (s.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/[\d.]+-\w+/, "").replace(/\?.*$/, "");
      const k = `${s.fn || "(anonymous)"} @ ${file || s.inv}`;
      const a = agg.get(k) || { key: k, d: 0, n: 0, layout: 0 };
      a.d += s.d; a.n++; a.layout += s.styleLayout || 0;
      agg.set(k, a);
    }
  }
  return [...agg.values()].sort((a, b) => b.d - a.d).slice(0, n).map(a => ({ ...a, d: Math.round(a.d), layout: Math.round(a.layout) }));
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}

export function gitDescribe(dir) {
  try { return execSync(`git -C ${dir} describe --always --dirty`, { encoding: "utf8" }).trim(); } catch (e) { return null; }
}
