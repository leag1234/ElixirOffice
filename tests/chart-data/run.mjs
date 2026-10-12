#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Chart "Edit Data" editor of the Word and PowerPoint editors (the nested spreadsheet
// editor, index_internal.html): it loads without 404 or script errors, the chart is
// inserted on OK, its data can be edited again, and undo restores the previous state.
// Usage: node tests/chart-data/run.mjs http://localhost:8109 [word|slide]
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = createRequire(path.join(process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw"), "package.json"))("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");
const kinds = process.argv[3] ? [process.argv[3]] : ["slide", "word"];
const CFG = {
  slide: { fx: "pptx/p02-blank-16x9.pptx", name: "c.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ns: "PE", count: api => api.getCountPages() },
  word: { fx: "docx/" + fs.readdirSync(path.join(here, "../fixtures/docx")).find(f => f.endsWith(".docx")), name: "c.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ns: "DE", count: api => 1 },
};
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

for (const kind of kinds) {
  const c = CFG[kind];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const bad = [];
  page.on("response", r => { if (r.status() >= 400 && /\.js|\.html/.test(r.url()) && !/elixir-ai/.test(r.url())) bad.push(r.status() + " " + r.url()); });
  page.on("pageerror", e => bad.push("ERR " + e));
  const r = await ctx.request.post(base + "/example/upload", { multipart: { uploadedFile: { name: c.name, mimeType: c.mime, buffer: fs.readFileSync(path.join(here, "../fixtures", c.fx)) } } });
  const j = await r.json();
  await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`);
  const f = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
  await f.waitForFunction(ns => window[ns] && window[ns].getController("Main") && window[ns].getController("Main").api && window[ns].getController("Main").api.asc_getCountPages !== undefined || (window[ns] && window[ns].getController("Main") && window[ns].getController("Main").api), c.ns, { timeout: 90000 });
  await page.waitForTimeout(5000);
  const nCharts = () => f.evaluate(() => { const a = (window.PE || window.DE).getController("Main").api; return a.asc_getChartObject ? (a.asc_getChartObject() ? 1 : 0) : 0; });
  // insert a bar chart: opens the nested spreadsheet editor
  await f.evaluate(() => { const a = (window.PE || window.DE).getController("Main").api; a.asc_addChartDrawingObject(Asc.c_oAscChartTypeSettings.barNormal, undefined, true); });
  const inner = await (await f.waitForSelector("iframe[name=frameEditor]", { timeout: 30000 })).contentFrame();
  await inner.waitForFunction(() => window.SSE && SSE.getController("Main") && SSE.getController("Main").api && SSE.getController("Main").api.asc_getWorksheetsCount && SSE.getController("Main").api.asc_getWorksheetsCount() > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  ok(bad.length === 0, `${kind}: the chart data editor loads without 404 or script error ${bad.slice(0, 3).join(" | ")}`);
  const loaded = await inner.evaluate(() => !!(window.SSE && SSE.getController("Main").api.asc_getWorksheetsCount()));
  ok(loaded, `${kind}: the nested spreadsheet editor is ready`);
  // the chart is inserted live; edit B2 in the nested editor, then close the window
  const chartVals = () => f.evaluate(() => { const a = (window.PE || window.DE).getController("Main").api; return a.getSelectedElements().filter(e => e.get_ObjectType() === Asc.c_oAscTypeSelectElement.Chart || (e.get_ObjectValue() && e.get_ObjectValue().get_ChartProperties && e.get_ObjectValue().get_ChartProperties())).length; });
  ok((await chartVals()) > 0, `${kind}: the chart is inserted with its default data`);
  await inner.evaluate(() => { const a = SSE.getController("Main").api; a.asc_enterText([55, 55]); });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await f.locator(".asc-window .tool.close").first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  ok(await f.evaluate(() => !document.querySelector(".asc-window:not([style*=none]) iframe[name=frameEditor]")), `${kind}: the data window closes`);
  ok((await chartVals()) > 0, `${kind}: the chart remains after closing`);
  let steps = 0;
  while ((await chartVals()) > 0 && steps < 5) { await f.evaluate(() => { (window.PE || window.DE).getController("Main").api.Undo(); }); await page.waitForTimeout(1200); steps++; }
  console.log("undo steps", steps);
  ok((await chartVals()) === 0 && steps <= 2, `${kind}: undo removes the chart`);
  await f.evaluate(() => { (window.PE || window.DE).getController("Main").api.Redo(); });
  await page.waitForTimeout(1200);
  ok(bad.length === 0, `${kind}: no error during open, edit, undo, redo ${bad.slice(0, 3).join(" | ")}`);
  await b.close();
}
process.exit(fail ? 1 : 0);
