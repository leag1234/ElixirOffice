#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// A column chart written by openpyxl (axPos="l" on both axes) keeps a horizontal category axis and a vertical value axis.
//   EO_BASE=http://localhost:PORT node tests/beta-fixes/chart-axes.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, BASE } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const rec = (id, ok, why = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + id + (ok ? "" : "  " + why)); };
const { browser, page } = await launch({});
const fname = await upload(path.join(HERE, "../fixtures/xlsx/chart-openpyxl-axpos.xlsx"), `ax-${process.pid}.xlsx`);
await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(fname)}`, { waitUntil: "load" });
let frame;
for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url().includes("/spreadsheeteditor/main/")); await page.waitForTimeout(250); }
await frame.waitForFunction(() => { try { return SSE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
await frame.waitForTimeout(2500);
const ax = await frame.evaluate(() => {
  const ws = Asc.editor.wb.getWorksheet(0), objs = ws.objectRender.controller.drawingObjects.getDrawingObjects ? ws.objectRender.controller.drawingObjects.getDrawingObjects() : ws.objectRender.controlsObjects || [];
  const out = [];
  for (const o of ws.model.Drawings || []) { const cs = o.graphicObject; if (cs && cs.chart) out.push(cs.chart.plotArea.axId.map(a => ({ type: a.getObjectType() === AscDFH.historyitem_type_CatAx ? "cat" : "val", pos: a.axPos }))); }
  return out;
});
const AX_B = 0, AX_L = 2; // AscFormat.AX_POS_B / AX_POS_L
const consts = await frame.evaluate(() => ({ B: AscFormat.AX_POS_B, L: AscFormat.AX_POS_L }));
rec("chart-found", ax.length === 1, JSON.stringify(ax));
const a = ax[0] || [];
const cat = a.find(x => x.type === "cat"), val = a.find(x => x.type === "val");
rec("cat-axis-horizontal", cat && cat.pos === consts.B, JSON.stringify(a));
rec("val-axis-vertical", val && val.pos === consts.L, JSON.stringify(a));
// pixels: the plot area has bars (green series colour 2F6B3A) inside the chart frame
await page.screenshot({ path: "/tmp/ax-shot.png" });
await browser.close();
process.exit(fails ? 1 : 0);
