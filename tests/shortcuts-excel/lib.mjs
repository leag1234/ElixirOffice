// Shared helpers of the Excel keyboard-shortcut suite (Playwright against a running
// spreadsheet editor). Mirrors tests/shortcuts/lib.mjs (Word).
//
// Environment:
//   EO_BASE   editor instance (default http://localhost:8099)
//   EO_FILE   workbook of the example storage to open instead of a new blank one
//             (e.g. c04-blank-ish.xlsx; it is then shared with other sessions: avoid)
//   PW_DIR    directory where the playwright package is installed (default /srv/elixiroffice/pw)
//
// Every browser opens its own new workbook (/example/editor?fileExt=xlsx), so no
// other session co-edits it. The test data is written once through the builder
// API: Sheet1 A1:A5 = 10..50, B1:B5 = apple..elderberry, A6 = =SUM(A1:A5), and an
// empty Sheet2 (the same content as c04-blank-ish.xlsx, plus Sheet2). Before each
// test, resetBook undoes everything back to that point, selects Sheet1!A1 and
// checks the result; when the check fails the runner opens a new workbook.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../..");
export const BASE = process.env.EO_BASE || "http://localhost:8099";
export const FILE = process.env.EO_FILE || "";
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
export const { chromium } = createRequire(path.join(PW_DIR, "package.json"))("playwright");

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// platform: "win" (Windows/Linux key conventions) or "mac" (the editor believes it runs on macOS)
export async function launch({ platform = "win", w = 1440, h = 900 } = {}) {
  const browser = await chromium.launch();
  const opts = { viewport: { width: w, height: h } };
  if (platform === "mac") opts.userAgent = MAC_UA;
  const context = await browser.newContext(opts);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  if (platform === "mac") {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push({ t: Date.now(), kind: "pageerror", text: String(e) }));
  page.on("console", m => { if (m.type() === "error") errors.push({ t: Date.now(), kind: "console", text: m.text() }); });
  return { browser, context, page, errors, platform };
}

async function waitFrame(page) {
  for (let i = 0; i < 240; i++) {
    const f = page.frames().find(f => f.url().includes("/spreadsheeteditor/main/"));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  throw new Error("editor frame not found");
}

// Open a workbook and write the test data; retries while the instance is being
// rebuilt (502, missing frame, editor not ready...)
export async function openEditor(page, { fileName = FILE, tries = 8 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const q = fileName ? `fileName=${encodeURIComponent(fileName)}` : "fileExt=xlsx";
      await page.goto(`${BASE}/example/editor?${q}&lang=en`, { waitUntil: "load", timeout: 60000 });
      const frame = await waitFrame(page);
      await frame.waitForFunction(() => { try { return SSE.getController("Main")._isDocReady === true && !!Asc.editor.wb; } catch (e) { return false; } }, null, { timeout: 90000 });
      await frame.waitForTimeout(1500);
      await writeBook(frame);
      await resetBook(frame);
      return frame;
    } catch (e) {
      last = e;
      console.log(`openEditor: attempt ${i + 1} failed (${String(e).slice(0, 160)}), retrying in 20 s`);
      await page.waitForTimeout(20000);
    }
  }
  throw last;
}

// Run builder-API code (a string) through api.callCommand, as a plugin does
export async function cmd(frame, source) {
  return frame.evaluate(src => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("callCommand timeout")), 8000);
    Asc.editor.callCommand(src, true, r => { clearTimeout(t); resolve(r); });
  }), source);
}

// Give the keyboard focus to the grid without changing the selection
// keepObjects: leave a selected shape selected (the shortcut acts on it)
export async function focusGrid(frame, keepObjects) {
  await frame.evaluate(keepObjects => {
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (e) {}
    Asc.editor.asc_enableKeyEvents(true);
    if (!keepObjects) { try { Asc.editor.wb.getWorksheet().objectRender.controller.resetSelection(); } catch (e) {} }
    try { Asc.editor.wb._onUpdateSelectionName && 0; } catch (e) {}
  }, !!keepObjects);
}

// Close menus, dialogs, backstage, panels and the cell editor a previous test may have left open
export async function resetUi(frame, page) {
  await page.mouse.move(5, 5);
  await frame.evaluate(() => {
    const api = Asc.editor;
    try { if (api.asc_getCellEditMode()) api.asc_closeCellEditor(true); } catch (e) {}
    try { Common.UI.Menu.Manager.hideAll(); } catch (e) {}
    try { $(".dropdown-menu:visible").each(function () { const m = $(this).closest(".btn-group, .dropdown"); m.removeClass("open"); }); } catch (e) {}
    // the comment box is a window driven by the Comments controller: close it through it
    try { const c = SSE.getController("Common.Controllers.Comments"); c.clearDummyComment(true); c.onApiHideComment(); } catch (e) {}
    try { $(".asc-window:visible").filter(function () { return !$(this).find("#id-popover").length; }).each(function () { const b = $(this).find(".tool.close:visible, .dlg-btn[result=cancel]:visible, .dlg-btn[result=close]:visible").first(); b.length ? b.click() : $(this).hide(); }); } catch (e) {}
    try { const lm = SSE.getController("LeftMenu"); lm.leftMenu.menuFile && lm.leftMenu.menuFile.isVisible() && lm.leftMenu.menuFile.hide(); } catch (e) {}
    try { const lm = SSE.getController("LeftMenu"); lm.leftMenu.close && lm.leftMenu.close(); } catch (e) {}
    try { const vp = SSE.getController("Viewport"); vp.searchBar && vp.searchBar.isVisible() && vp.searchBar.hide(); } catch (e) {}
    try { const lm = SSE.getController("LeftMenu"); lm.leftMenu.btnSearchBar.pressed && lm.onShowHideSearch(false); } catch (e) {}
    try { const lm = SSE.getController("LeftMenu"); ["btnComments", "btnSpellcheck", "btnChat"].forEach(b => { const x = lm.leftMenu[b]; x && x.pressed && x.toggle(false); }); lm.leftMenu.close && lm.leftMenu.close(); } catch (e) {}
    try { if (SSE.getController("Toolbar").toolbar.isCompact()) SSE.getController("RibbonTabs").toggleRibbon(); } catch (e) {}
    try { if (api.asc_getShowFormulas()) api.asc_setShowFormulas(false); } catch (e) {}
    try { api.asc_setZoom(1); } catch (e) {}
    try { const cs = SSE.getController("CellEditor"); if (cs.editor.$btnexpand.hasClass("btn-collapse")) cs.expandEditorField(); } catch (e) {}
    try { const ev = api.wb.controller; ev.isSelectMode = false; } catch (e) {}
  });
  await page.keyboard.up("Shift"); await page.keyboard.up("Control"); await page.keyboard.up("Alt"); await page.keyboard.up("Meta");
  // windows and panels fade out: wait until nothing is left open
  await frame.waitForFunction(() => !Array.from(document.querySelectorAll(".asc-window")).some(w => w.getClientRects().length && getComputedStyle(w).display !== "none"), null, { timeout: 3000 }).catch(() => {});
  await focusGrid(frame);
}

const BOOK = {
  A: [10, 20, 30, 40, 50],
  B: ["apple", "banana", "cherry", "date", "elderberry"],
};

// Write the test data and remember the undo position resetBook goes back to
async function writeBook(frame) {
  await cmd(frame, `(function(){
    var sheets = Api.GetSheets();
    for (var i = sheets.length - 1; i >= 1; i--) sheets[i].Delete();
    var s = Api.GetSheets()[0];
    if (s.GetName() !== "Sheet1") s.SetName("Sheet1");
    s.GetRange("A1:Z100").Clear();
    var A = ${JSON.stringify(BOOK.A)}, B = ${JSON.stringify(BOOK.B)};
    for (var r = 0; r < 5; r++) { s.GetRange("A" + (r + 1)).SetValue(A[r]); s.GetRange("B" + (r + 1)).SetValue(B[r]); }
    s.GetRange("A6").SetValue("=SUM(A1:A5)");
    Api.AddSheet("Sheet2");
    Api.GetSheets()[0].SetActive();
    return Api.GetSheets().length;
  })()`);
  await frame.waitForTimeout(300);
  await frame.evaluate(() => { window.__eoBase = AscCommon.History.Index; });
}

// Back to the test data: undo everything done since writeBook, then Sheet1!A1
export async function resetBook(frame) {
  await frame.evaluate(() => {
    const api = Asc.editor, H = AscCommon.History;
    try { if (api.asc_getCellEditMode()) api.asc_closeCellEditor(true); } catch (e) {}
    try { api.wb.getWorksheet().objectRender.controller.resetSelection(); } catch (e) {}
    for (let i = 0; i < 300 && H.Index > window.__eoBase && H.Can_Undo(); i++) api.asc_Undo();
    try { if (api.asc_getActiveWorksheetIndex() !== 0) api.asc_showWorksheet(0); } catch (e) {}
    try { if (api.asc_getShowFormulas()) api.asc_setShowFormulas(false); } catch (e) {}
    try { api.asc_setZoom(1); } catch (e) {}
    const ws = api.wb.getWorksheet();
    ws.setSelection(new Asc.Range(0, 0, 0, 0));
    try { ws.scrollToCell ? 0 : 0; ws.scrollVertical(-ws.visibleRange.r1); ws.scrollHorizontal(-ws.visibleRange.c1); } catch (e) {}
  });
  // several sheet tabs selected (Ctrl+click, Ctrl+Shift+Page down): a plain click on the first one
  if (await frame.evaluate(() => { try { return SSE.getController("Statusbar").statusbar.tabbar.selectTabs.length > 1; } catch (e) { return false; } })) {
    await frame.locator("#status-sheets-bar li").first().click();
    await frame.waitForTimeout(200);
  }
  const s = await state(frame);
  const ok = s.sheet === 0 && s.sheets === 2 && s.active.join() === "0,0" && JSON.stringify(s.ranges) === "[[0,0,0,0]]" && s.cells.A1 === "10" && s.cells.B5 === "elderberry" && s.formulas.A6 === "=SUM(A1:A5)"
    && s.cells.A7 === "" && s.cells.D1 === "" && !s.edit && s.drawings === 0 && !s.hiddenRows.length && !s.hiddenCols.length && s.zoom === 1 && !s.showFormulas;
  if (!ok) throw new Error("resetBook: workbook in a bad state " + JSON.stringify({ sheet: s.sheet, sheets: s.sheets, active: s.active, ranges: s.ranges, A1: s.cells.A1, B5: s.cells.B5, A6: s.formulas.A6, A7: s.cells.A7, D1: s.cells.D1, edit: s.edit, drawings: s.drawings, hidden: [s.hiddenRows, s.hiddenCols], zoom: s.zoom }));
  await focusGrid(frame);
}

// Select a range given in A1 notation ("B2", "A1:B3"); the active cell is the first
// cell, or `active` ("B2") when given
export async function select(frame, ref, active) {
  await frame.evaluate(([ref, active]) => {
    const api = Asc.editor, ws = api.wb.getWorksheet();
    const parse = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { r: +m[2] - 1, c: c - 1 }; };
    const [p, q] = ref.split(":"); const a = parse(p), b = parse(q || p);
    const range = new Asc.Range(Math.min(a.c, b.c), Math.min(a.r, b.r), Math.max(a.c, b.c), Math.max(a.r, b.r));
    ws.setSelection(range);
    if (active) { const x = parse(active); ws.model.selectionRange.activeCell.row = x.r; ws.model.selectionRange.activeCell.col = x.c; ws.model.selectionRange.activeCellId = 0; ws.updateSelection && ws.updateSelection(); ws._drawSelection && ws._drawSelection(); }
    api.wb._onWSSelectionChanged && api.wb._onWSSelectionChanged();
  }, [ref, active || null]);
  await focusGrid(frame);
}

export const colName = c => { let s = ""; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const addr = (r, c) => colName(c) + (r + 1);

// The state the checks look at (Sheet1 cells A1:F12 and the active sheet)
export async function state(frame) {
  return frame.evaluate(() => {
    const api = Asc.editor, wb = api.wb, ws = wb.getWorksheet(), m = ws.model;
    const colName = c => { let s = ""; c++; while (c > 0) { const k = (c - 1) % 26; s = String.fromCharCode(65 + k) + s; c = Math.floor((c - 1) / 26); } return s; };
    // while some dialogs are open the sheet has no selection object: report none
    const sel = m.selectionRange || { activeCell: { row: -1, col: -1 }, ranges: [] };
    const cells = {}, formulas = {}, numfmt = {};
    const s1 = wb.model.getWorksheet(0);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 6; c++) {
      const rg = s1.getRange3(r, c, r, c), a = colName(c) + (r + 1);
      cells[a] = rg.getValue();
      const f = rg.getFormula && rg.getFormula(); formulas[a] = f ? "=" + f : "";
    }
    const ci = api.asc_getCellInfo(), x = ci.asc_getXfs();
    const nfi = x.asc_getNumFormatInfo && x.asc_getNumFormatInfo();
    const vis = sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden");
    let fileMenu = null;
    try { const mf = SSE.getController("LeftMenu").leftMenu.menuFile; fileMenu = mf && mf.isVisible() ? (mf.active || "?") : null; } catch (e) {}
    let drawings = 0, selectedDrawings = 0;
    try { drawings = ws.objectRender.controller.getDrawingObjects().length; selectedDrawings = ws.objectRender.controller.getSelectedObjects().length; } catch (e) {}
    const hiddenRows = [], hiddenCols = [];
    for (let r = 0; r < 12; r++) if (s1.getRowHidden(r)) hiddenRows.push(r + 1);
    for (let c = 0; c < 6; c++) if (s1.getColHidden(c)) hiddenCols.push(colName(c));
    const ae = document.activeElement;
    return {
      sheet: api.asc_getActiveWorksheetIndex(), sheets: api.asc_getWorksheetsCount(),
      active: [sel.activeCell.row, sel.activeCell.col],
      activeAddr: colName(sel.activeCell.col) + (sel.activeCell.row + 1),
      ranges: sel.ranges.map(g => [g.r1, g.c1, g.r2, g.c2]),
      cells, formulas,
      edit: !!api.asc_getCellEditMode(),
      nameBox: (document.querySelector("#ce-cell-name") || {}).value,
      formulaBar: (document.querySelector("#ce-cell-content") || {}).value,
      xf: { bold: !!x.asc_getFontBold(), italic: !!x.asc_getFontItalic(), underline: !!x.asc_getFontUnderline(), strike: !!x.asc_getFontStrikeout(), size: x.asc_getFontSize(), align: x.asc_getHorAlign(), numFormat: x.asc_getNumFormat(), numType: nfi ? nfi.asc_getType() : null },
      zoom: api.asc_getZoom(),
      showFormulas: !!api.asc_getShowFormulas(),
      fileMenu,
      windows: Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length && getComputedStyle(w).display !== "none").map(w => ((w.querySelector(".header .title, .title") || w).textContent || "").trim()),
      menus: Array.from(document.querySelectorAll(".dropdown-menu")).filter(e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && !e.closest("#toolbar")).length,
      searchBar: vis("#search-bar-text") || vis("#search-adv-text"),
      replaceField: vis("#search-adv-replace-text"),
      drawings, selectedDrawings, hiddenRows, hiddenCols,
      compact: (() => { try { return SSE.getController("Toolbar").toolbar.isCompact(); } catch (e) { return null; } })(),
      focus: ae ? (ae.id || ae.className || ae.tagName) : null,
      keyEvents: (() => { try { return !!api.wb.getCellEditMode || api.isEnabledKeyEvents ? true : true; } catch (e) { return null; } })(),
    };
  });
}

export async function isVisible(frame, selector) {
  return frame.evaluate(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden"), selector);
}

export function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const parse = line => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = parse(lines[0]);
  return lines.slice(1).map(l => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}
