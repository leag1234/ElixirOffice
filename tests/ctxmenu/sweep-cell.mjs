#!/usr/bin/env node
// Right-click menus of the Spreadsheet editor: open every context menu, click every item
// (and submenu items) from a fresh menu, record errors, popups and effects.
//   node tests/ctxmenu/sweep-cell.mjs [--only id1,id2] [--out file.json] [--max-sub N]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, resetBook, select, cmd, resetUi } from "../shortcuts-excel/lib.mjs";
import { sigSource, sweepContext, summarize } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const only = opt("only") ? opt("only").split(",") : null;
const outFile = opt("out", path.join(HERE, "results", "cell-latest.json"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const fb = await (await frame.frameElement()).boundingBox();

// Insert function on the formula and range contexts starts a formula edit that the sweep's quick reset cannot close cleanly
// (it then leaves the editor in a state where later menus do not open); the command is covered by the "cell" context
// screen point inside cell (col, row) (0-based); dx/dy inside the cell
const cellPt = (c, r, dx = 20, dy = 8) => frame.evaluate(([c, r, dx, dy, fx, fy]) => {
  const ws = Asc.editor.wb.getWorksheet(), cv = document.getElementById("ws-canvas").getBoundingClientRect();
  return { x: fx + cv.left + ws.getCellLeft(c, 0) + dx, y: fy + cv.top + ws.getCellTop(r, 0) + dy };
}, [c, r, dx, dy, fb.x, fb.y]);
const colHeaderPt = c => frame.evaluate(([c, fx, fy]) => { const ws = Asc.editor.wb.getWorksheet(), cv = document.getElementById("ws-canvas").getBoundingClientRect(); return { x: fx + cv.left + ws.getCellLeft(c, 0) + 20, y: fy + cv.top + 8 }; }, [c, fb.x, fb.y]);
const rowHeaderPt = r => frame.evaluate(([r, fx, fy]) => { const ws = Asc.editor.wb.getWorksheet(), cv = document.getElementById("ws-canvas").getBoundingClientRect(); return { x: fx + cv.left + 10, y: fy + cv.top + ws.getCellTop(r, 0) + 8 }; }, [r, fb.x, fb.y]);
const click = async pt => { await page.mouse.click(pt.x, pt.y); await frame.waitForTimeout(250); };
const addShape = (kind) => cmd(frame, `(function(){ var s = Api.GetActiveSheet(); var f = Api.CreateSolidFill(Api.CreateRGBColor(200,220,255));
  ${kind === "image" ? 's.AddImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 1828800, 914400, 3, 0, 8, 0);'
   : kind === "chart" ? 's.AddChart("\'Sheet1\'!$A$1:$A$5", true, "bar", 2, 100*36000, 70*36000, 3, 0, 8, 0);'
   : 's.AddShape("rect", 1828800, 914400, f, Api.CreateStroke(0, Api.CreateNoFill()), 3, 0, 8, 0);'} return 1; })()`);

const scenarios = [
  { id: "cell", noEffectOk: k => /^Number Format > General/.test(k), setup: () => select(frame, "B2"), target: () => cellPt(1, 1) },
  { id: "cell-range", skip: k => /^Insert function$/.test(k), noEffectOk: k => /^Number Format > General/.test(k), setup: () => select(frame, "A1:B4"), target: () => cellPt(1, 2) },
  { id: "cell-formula", skip: k => /^Insert function$/.test(k), noEffectOk: k => /^Number Format > General/.test(k), setup: () => select(frame, "A6"), target: () => cellPt(0, 5), expectPopup: k => /^Pick From/.test(k) },
  { id: "cell-empty", skip: k => /^Insert function$/.test(k), setup: () => select(frame, "H12"), target: () => cellPt(7, 11), expectPopup: k => /^(Pick From|Filter|Sort)/.test(k), noEffectOk: k => /^Clear|^Number Format > General/.test(k) },
  { id: "cell-link", setup: async () => { await cmd(frame, `(function(){ Api.GetActiveSheet().SetHyperlink && 0; Api.GetActiveSheet().GetRange("D2").SetValue("link"); Api.GetActiveSheet().SetHyperlink("D2", "https://example.org", "", "tip"); return 1; })()`).catch(() => {}); await select(frame, "D2"); }, target: () => cellPt(3, 1) },
  { id: "cell-comment", setup: async () => { await cmd(frame, `(function(){ Api.GetActiveSheet().GetRange("D4").AddComment("a note", "Tester"); return 1; })()`).catch(() => {}); await frame.waitForTimeout(300); await select(frame, "D4"); }, target: () => cellPt(3, 3) },
  { id: "row-header", setup: () => select(frame, "A3"), target: () => rowHeaderPt(2) },
  { id: "column-header", setup: () => select(frame, "B1"), target: () => colHeaderPt(1) },
  { id: "column-header-range", setup: () => select(frame, "B1:C1"), target: () => colHeaderPt(1) },
  { id: "corner", noEffectOk: k => /^Clear/.test(k), setup: () => select(frame, "A1"), target: () => frame.evaluate(([fx, fy]) => { const cv = document.getElementById("ws-canvas").getBoundingClientRect(); return { x: fx + cv.left + 10, y: fy + cv.top + 8 }; }, [fb.x, fb.y]) },
  { id: "sheet-tab", expectPopup: k => /^Delete$/.test(k), skip: k => /^Tab color >/.test(k), setup: () => select(frame, "A1"), target: async () => { const b = await frame.locator("#status-sheets-bar li").first().boundingBox(); return { x: fb.x + b.x + b.width / 2, y: fb.y + b.y + b.height / 2 }; } },
  { id: "sheet-tab-2", expectPopup: k => /^Delete$/.test(k), skip: k => /^Tab color >/.test(k), setup: () => select(frame, "A1"), target: async () => { const b = await frame.locator("#status-sheets-bar li").nth(1).boundingBox(); return { x: fb.x + b.x + b.width / 2, y: fb.y + b.y + b.height / 2 }; } },
  { id: "shape", setup: async () => { await addShape("shape"); await frame.waitForTimeout(400); await click(await cellPt(3, 8, 30, 20)); }, target: () => cellPt(3, 8, 30, 20) },
  { id: "picture", setup: async () => { await addShape("image"); await frame.waitForTimeout(400); await click(await cellPt(3, 8, 30, 20)); }, target: () => cellPt(3, 8, 30, 20) },
  { id: "chart", setup: async () => { await addShape("chart"); await frame.waitForTimeout(600); await click(await cellPt(3, 8, 60, 40)); }, target: () => cellPt(3, 8, 60, 40) },
];

for (const s of scenarios) { s.keepsOpen = k => /^Save as picture$/.test(k); /* the picture is downloaded; the menu stays open (upstream behavior) */ s.noEffectOk = (o => k => /^Number Format > General/.test(k) || (o && o(k)))(s.noEffectOk); const own = s.expectPopup; s.expectPopup = k => /^Pick From|^(Filter|Sort) >/.test(k) || (own && own(k)); }   // upstream: a warning when the column has nothing to pick
const reset = async () => {
  await frame.evaluate(() => { try { SSE.getController("ExcelMiniToolbar").hide(true); } catch (e) {} });   // the mini toolbar of the previous right click covers the headers
  await resetUi(frame, page);
  await frame.waitForTimeout(250);
  await resetUi(frame, page);   // twice: closing a dialog (Insert Function) leaves the cell editor open, which the second pass closes
  await frame.waitForFunction(() => !Array.from(document.querySelectorAll(".modals-mask,.asc-window")).some(w => w.getClientRects().length && getComputedStyle(w).display !== "none"), null, { timeout: 4000 }).catch(() => {});
  try { await resetBook(frame); } catch (e) { console.log("resetBook: " + String(e).slice(0, 120)); }
  await page.mouse.move(5, 5);
};
const cfg = { shotDir: opt("shots"), frame, page, errors, sig: sigSource.cell, reset, maxSub: +opt("max-sub", 4),
  rootFn: () => {
    const sb = SSE.getController("Statusbar").statusbar.tabMenu; if (sb && sb.isVisible()) return sb.cmpEl[0];
    const m = SSE.getController("DocumentHolder").currentMenu; return m && m.isVisible() ? m.cmpEl[0] : null;
  } };
let rows = [];
for (const s of scenarios.filter(s => !only || only.includes(s.id))) {
  console.log(`## ${s.id}`);
  try { rows = rows.concat(await sweepContext(cfg, s)); }
  catch (e) { rows.push({ ctx: s.id, item: "(scenario)", status: "fail", reason: String(e).split("\n")[0].slice(0, 200) }); console.log(`FAIL ${s.id} scenario error ${String(e).split("\n")[0]}`); }
}
const pageErr = errors.filter(e => e.kind === "pageerror");   // the ones raised by a click are failures of that item; the others are listed
rows.push({ ctx: "all", item: "(page errors outside the clicks)", status: "info", reason: pageErr.map(e => e.text).join(" | ").slice(0, 300) });
const nf = summarize(rows, outFile);
await browser.close();
process.exit(nf ? 1 : 0);
