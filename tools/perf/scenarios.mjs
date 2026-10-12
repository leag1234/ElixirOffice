// SPDX-License-Identifier: AGPL-3.0-only
// Measurement scenarios of the performance harness. Each function measures ONE run and returns
// a flat record; bench.mjs repeats them and aggregates. See docs/perf.md for the definitions.
import path from "node:path";
import {
  HERE, instrument, netSummary, collect, longTasks, loafTop, probeEditable, waitReady, waitEditorFrame,
  uploadDocx, deleteFile, uniqueName, quantile, median, sum,
} from "./lib.mjs";

const rel = (t, t0) => (t == null ? null : Math.round(t - t0));

// Timeline of one editor load, t0 = navigation start of the page that hosts the editor (or the
// click on the start page).
function timeline(frames, t0) {
  const top = frames[0]?.perf || {};
  const ed = frames.find(f => /\/documenteditor\/main\//.test(f.url))?.perf || {};
  return {
    topFCP: rel(top.paint?.["first-contentful-paint"], t0),
    chromeFCP: rel(ed.paint?.["first-contentful-paint"], t0),  // editor iframe skeleton (toolbar placeholder)
    appReady: rel(top.events?.onAppReady, t0),                 // DocsAPI onAppReady: real toolbar built
    docVisible: rel(ed.viewerFrame, t0),                       // first page blitted on the canvas, next frame
    docReady: rel(top.events?.onDocumentReady, t0),            // DocsAPI onDocumentReady
  };
}

// Open one document in the editor, measure the timeline and the network/main-thread cost.
//   url: full editor URL; ctx: browser context (cold = fresh profile)
export async function measureEditorLoad(ctx, url, { throttle = 1, net = null } = {}) {
  const page = await ctx.newPage();
  // warm the browser process and the TCP connection (not the HTTP cache): a fresh profile's
  // first navigation otherwise carries ~200 ms of browser start-up that is not ours
  await page.goto(new URL("/healthcheck", url).href);
  const ins = await instrument(page, { throttle, net });
  await page.goto(url, { waitUntil: "commit" });
  const t0 = await page.evaluate(() => performance.timeOrigin);
  const { editable, glyph } = await probeEditable(page);
  await page.waitForTimeout(1500); // late tasks right after the first keystroke
  const frames = await collect(page);
  const tl = timeline(frames, t0);
  const rec = {
    ...tl, editable: rel(editable, t0), firstGlyph: rel(glyph, t0),
    lt: longTasks(frames, t0, editable), loaf: loafTop(frames, t0, editable, 12),
    net: await netSummary(ins.reqs, ins.ws), console: ins.console.slice(0, 20),
  };
  await page.close();
  return rec;
}

// Start page (/example/): first paint and full load
export async function measureStartPage(ctx, base, { throttle = 1, net = null } = {}) {
  const page = await ctx.newPage();
  await page.goto(base + "/healthcheck"); // browser process + connection warm-up, see measureEditorLoad
  const ins = await instrument(page, { throttle, net });
  await page.goto(base + "/example/", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  const frames = await collect(page);
  const t0 = frames[0].origin;
  const rec = {
    ttfb: Math.round(nav.ttfb), fcp: rel(frames[0].perf.paint["first-contentful-paint"], t0),
    dcl: Math.round(nav.dcl), load: Math.round(nav.load),
    lt: longTasks(frames, t0, t0 + 60000), net: await netSummary(ins.reqs, ins.ws), console: ins.console.slice(0, 20),
  };
  return { rec, page };
}

// From the start page: click a recent file, the editor opens in a new tab; t0 = click.
export async function measureOpenFromStart(ctx, base, fileName, { throttle = 1, hover = 0, dwell = 0, net = null } = {}) {
  const { page: home } = await measureStartPage(ctx, base, { throttle, net });
  if (dwell) await home.waitForTimeout(dwell);
  const row = home.locator(`#files-body tr[data-name="${fileName}"]`);
  await row.waitFor({ timeout: 20000 });
  if (hover) { await row.hover(); await home.waitForTimeout(hover); }
  // instrument the new tab as soon as it exists (before its first request)
  const popupP = ctx.waitForEvent("page");
  const tClick = await home.evaluate(() => performance.timeOrigin + performance.now());
  await row.click({ position: { x: 40, y: 10 } });
  const page = await popupP;
  const ins = await instrument(page, { throttle, net }); // (the tab's first request may precede it)
  const { editable, glyph } = await probeEditable(page);
  await page.waitForTimeout(1500);
  const frames = await collect(page);
  const tl = timeline(frames, tClick);
  const navStart = rel(frames[0].origin, tClick);
  const rec = {
    navStart, ...tl, editable: rel(editable, tClick), firstGlyph: rel(glyph, tClick),
    lt: longTasks(frames, tClick, editable), net: await netSummary(ins.reqs, ins.ws), console: ins.console.slice(0, 20),
  };
  await page.close();
  await home.close();
  return rec;
}

// Typing latency: keydown (event timestamp) -> end of the canvas repaint that shows the glyph
// -> next animation frame (the frame that carries it). 200 characters into a 10-page document.
export async function measureTyping(ctx, url, { throttle = 1, chars = 200, delay = 70 } = {}) {
  const page = await ctx.newPage();
  const ins = await instrument(page, { throttle });
  await page.goto(url);
  const frame = await waitReady(page);
  await page.waitForTimeout(3000);
  // caret: end of the 3rd body paragraph of page 1 (Ctrl+Home, then down)
  await frame.evaluate(() => { const a = document.getElementById("area_id"); a.focus(); });
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.waitForTimeout(800);
  await frame.evaluate(() => {
    const T = window.__typ = { keys: [], paints: [] };
    const wc = Asc.editor.WordControl, orig = wc.OnPaint;
    document.getElementById("area_id").addEventListener("keydown", e => T.keys.push({ t: e.timeStamp, key: e.key }), true);
    wc.OnPaint = function () {
      const s = performance.now();
      const x = orig.apply(this, arguments);
      const e = performance.now();
      const rec = { s, e, f: null };
      T.paints.push(rec);
      requestAnimationFrame(() => { rec.f = performance.now(); });
      return x;
    };
  });
  const text = "Le petit chat boit du lait sous la table de la cuisine pendant que les enfants jouent dehors. ";
  const tStart = Date.now();
  for (let i = 0; i < chars; i++) {
    await page.keyboard.type(text[i % text.length]);
    await page.waitForTimeout(delay + ((i * 37) % 30)); // ~10 chars/s with jitter
  }
  await page.waitForTimeout(1000);
  const T = await frame.evaluate(() => window.__typ);
  const frames = await collect(page);
  const edPerf = frames.find(f => /\/documenteditor\/main\//.test(f.url))?.perf;
  // per keystroke: first repaint that starts after the keydown
  const lat = [], draw = [], miss = [];
  for (let i = 0; i < T.keys.length; i++) {
    const k = T.keys[i].t;
    const p = T.paints.find(p => p.s >= k);
    if (!p) { miss.push(i); continue; }
    draw.push(p.e - k);
    if (p.f != null) lat.push(p.f - k);
  }
  const evts = (edPerf?.ev || []).filter(e => e.name === "keydown" || e.name === "keypress" || e.name === "keyup");
  const typedAt = frames.find(f => /\/documenteditor\/main\//.test(f.url))?.origin;
  const rec = {
    keys: T.keys.length, paints: T.paints.length, missed: miss.length,
    p50: Math.round(quantile(lat, 0.5)), p95: Math.round(quantile(lat, 0.95)), max: Math.round(Math.max(...lat)),
    drawP50: Math.round(quantile(draw, 0.5)), drawP95: Math.round(quantile(draw, 0.95)),
    paintCost: Math.round(quantile(T.paints.map(p => p.e - p.s), 0.95) * 10) / 10,
    eventTiming: { n: evts.length, p95: Math.round(quantile(evts.map(e => e.d), 0.95) || 0), maxProc: Math.round(Math.max(0, ...evts.map(e => e.proc))) },
    lt: longTasks(frames, tStart, Date.now()),
    loaf: loafTop(frames, tStart, Date.now(), 8),
    durationS: Math.round((Date.now() - tStart) / 100) / 10,
    lat,
  };
  await page.close();
  return rec;
}

// Scrolling a long document: wheel events dispatched in the page at every animation frame
// (60 Hz, like a trackpad/wheel flick) for `seconds`; measures content repaints per second,
// animation-frame intervals (jank) and long tasks.
export async function measureScroll(ctx, url, { throttle = 1, seconds = 5, delta = 100 } = {}) {
  const page = await ctx.newPage();
  const ins = await instrument(page, { throttle });
  await page.goto(url);
  const frame = await waitReady(page);
  await page.waitForTimeout(4000);
  const tStart = Date.now();
  const S = await frame.evaluate(({ seconds, delta }) => new Promise(resolve => {
    const S = { frames: [], paints: [] };
    const wc = Asc.editor.WordControl, orig = wc.OnPaint;
    wc.OnPaint = function () { const s = performance.now(); const x = orig.apply(this, arguments); S.paints.push([s, performance.now()]); return x; };
    const el = document.getElementById("id_viewer"), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + Math.min(300, r.height / 2);
    // sdkjs listens to the legacy "mousewheel" event on the main content element
    const target = wc.m_oMainContent.HtmlElement;
    const t0 = performance.now();
    const step = t => {
      S.frames.push(t);
      if (t - t0 < seconds * 1000) {
        target.dispatchEvent(new WheelEvent("mousewheel", { deltaY: delta, deltaMode: 0, wheelDeltaY: -delta * 1.2, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        requestAnimationFrame(step);
      } else { wc.OnPaint = orig; resolve(S); }
    };
    requestAnimationFrame(step);
  }), { seconds, delta });
  const tEnd = Date.now();
  await page.waitForTimeout(300);
  const pos = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oDrawingDocument; return { first: d.m_lDrawingFirst, pages: Asc.editor.getCountPages ? Asc.editor.getCountPages() : null }; });
  const frames = await collect(page);
  const iv = []; for (let i = 1; i < S.frames.length; i++) iv.push(S.frames[i] - S.frames[i - 1]);
  const span = (S.frames[S.frames.length - 1] - S.frames[0]) / 1000;
  const rec = {
    durationS: Math.round(span * 10) / 10,
    fps: Math.round((iv.length / span) * 10) / 10,
    paintsPerS: Math.round((S.paints.length / span) * 10) / 10,
    paintP95: Math.round(quantile(S.paints.map(p => p[1] - p[0]), 0.95) * 10) / 10,
    frameP95: Math.round(quantile(iv, 0.95) * 10) / 10,
    jank: iv.filter(x => x > 50).length, longestFrame: Math.round(Math.max(0, ...iv)),
    endPage: pos.first, pages: pos.pages,
    lt: longTasks(frames, tStart, tEnd), loaf: loafTop(frames, tStart, tEnd, 8),
  };
  await page.close();
  return rec;
}
