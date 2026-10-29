// Test cases of the Excel shortcut matrix (docs/shortcuts-excel.csv).
//
// A case: { id, win, mac, sel, active, pre, check, after, control }
//   win, mac   list of variants for that platform; a variant is a key ("Control+b")
//              or a list of steps: a key, {text: "..."} typed text, {wait: ms}
//   sel        range selected before the keys ("A1:B3"; default A1), active: its active cell
//   pre        async (ctx) extra setup
//   check      async (ctx) -> true, or a string saying what is wrong
//   control    async (ctx): does what the shortcut should do through the UI or the
//              API; `run.mjs --control` plays it instead of the keys and the check
//              must pass, which proves the check can see the effect
// ctx: { frame, page, platform, s0 (state before the keys), st() (state now), js(fn, arg), press(k), type(t) }
// The workbook (lib.mjs resetBook): Sheet1 A1:A5 = 10..50, B1:B5 = apple..elderberry,
// A6 = =SUM(A1:A5) (150); Sheet2 empty; A1 selected.
import { cmd, select, focusGrid } from "./lib.mjs";

// ---- helpers ---------------------------------------------------------------
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what || "got"} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const parse = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2] - 1, c - 1]; };
const MAXR = 1048575, MAXC = 16383;
const rangeOf = ref => { const [p, q] = ref.split(":"); const a = parse(p), b = parse(q || p); return [a[0], a[1], b[0], b[1]]; };

const at = addr => async ctx => eq((await ctx.st()).activeAddr, addr, "active cell");
const ranges = refs => async ctx => eq((await ctx.st()).ranges, refs.map(r => (Array.isArray(r) ? r : rangeOf(r))), "selection");
const cells = want => async ctx => { const s = await ctx.st(); const got = Object.fromEntries(Object.keys(want).map(k => [k, s.cells[k]])); return eq(got, want, "cells"); };
const all = (...checks) => async ctx => { for (const c of checks) { const r = await c(ctx); if (r !== true) return r; } return true; };
const xf = (prop, value) => async ctx => eq((await ctx.st()).xf[prop], value, prop);
const windowCase = re => async ctx => { const s = await ctx.st(); const t = s.windows.join(" | "); return re.test(t) ? true : `no dialog matching ${re} (open: ${t || "none"})`; };
const backstage = panels => async ctx => { const s = await ctx.st(); if (!s.fileMenu) return "File backstage not open"; if (panels && !panels.includes(s.fileMenu)) return `backstage panel ${s.fileMenu}, expected ${panels.join(" or ")}`; return true; };
const editing = async ctx => ((await ctx.st()).edit ? true : "not in cell edit mode");

// Wrap an API method (path from Asc.editor, e.g. "wb.calculate") and count its calls
// ("ctrl:Toolbar.onSave" wraps a method of an SSE controller)
const target = path => `(function(){ var p = ${JSON.stringify(path)}; var root = Asc.editor; if (p.indexOf("ctrl:") === 0) { p = p.slice(5); var i = p.indexOf("."); root = SSE.getController(p.slice(0, i)); p = p.slice(i + 1); } var parts = p.split("."), name = parts.pop(); return { obj: parts.reduce(function (o, k) { return o[k]; }, root), name: name }; })()`;
const spy = path => async ctx => {
  await ctx.js(([path, t]) => {
    window.__calls = window.__calls || {}; window.__calls[path] = [];
    const { obj, name } = eval(t);
    if (!obj["__orig_" + name]) { obj["__orig_" + name] = obj[name]; }
    const orig = obj["__orig_" + name];
    obj[name] = function () { window.__calls[path].push(Array.from(arguments).map(a => (typeof a === "object" ? null : a))); return orig.apply(this, arguments); };
  }, [path, target(path)]);
};
const unspy = path => async ctx => ctx.js(([path, t]) => { const { obj, name } = eval(t); if (obj["__orig_" + name]) { obj[name] = obj["__orig_" + name]; delete obj["__orig_" + name]; } }, [path, target(path)]);
const calls = path => ctx => ctx.js(p => (window.__calls || {})[p] || [], path);
const called = (path, argTest) => async ctx => { const c = await calls(path)(ctx); if (!c.length) return `${path} was not called`; if (argTest && !c.some(a => argTest(a))) return `${path} called with ${JSON.stringify(c)}`; return true; };

const undo = async ctx => { await ctx.js(() => { const api = Asc.editor; if (api.asc_getCellEditMode()) api.asc_closeCellEditor(true); }); };

// copy A1 with the keyboard (Ctrl+C is the native copy command of Chromium on Linux,
// whatever the emulated platform) and select `to`
const copyTo = (from, to) => async ctx => {
  await select(ctx.frame, from); await ctx.page.keyboard.press("Control+c"); await ctx.frame.waitForTimeout(300);
  await select(ctx.frame, to);
};
const pasteThere = async ctx => { await ctx.page.keyboard.press("Control+v"); await ctx.frame.waitForTimeout(600); await focusGrid(ctx.frame); };

// visible floating/left panels and popovers
const vis = (ctx, sel) => ctx.js(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && e.offsetWidth > 0), sel);
const visCase = (sel, what) => async ctx => ((await vis(ctx, sel)) ? true : `${what} not shown`);
const commentOpen = visCase("#id-comments-popover", "comment box");

const sheetInfo = ctx => ctx.js(() => { const s = Asc.editor.wb.model.getWorksheet(0); const lvl = r => { let l = 0; s._getRowNoEmpty(r, row => { l = row ? row.getOutlineLevel() : 0; }); return l; }; return { autoFilter: !!s.AutoFilter, tables: (s.TableParts || []).length, comments: (s.aComments || []).length, rowLevels: [0, 1, 2, 3, 4].map(lvl), names: Asc.editor.wb.model.getDefinesNames ? 0 : 0 }; });
const bordersOf = (ctx, addr) => ctx.js(([r, c]) => { const b = Asc.editor.wb.model.getWorksheet(0).getRange3(r, c, r, c).getBorderFull(); const st = x => (x && x.s) || 0; return { l: st(b.l), t: st(b.t), r: st(b.r), b: st(b.b) }; }, parse(addr));
const has = (b, sides) => sides.split("").every(k => b[k] > 0);
const none = b => !b.l && !b.t && !b.r && !b.b;

// where the keyboard focus is
const where = ctx => ctx.js(() => { const a = document.activeElement; if (!a || a === document.body || a.id === "area_id") return "grid"; if (a.closest("#toolbar")) return "ribbon"; if (a.closest("#statusbar")) return "statusbar"; if (a.closest("#left-menu, #left-panel, .left-panel, #right-menu, #right-panel, #cell-editing-box")) return "pane"; return a.id || a.className || a.tagName; });

const numType = name => async ctx => { const s = await ctx.st(); const want = await ctx.js(n => Asc.c_oAscNumFormatType[n], name); return s.xf.numType === want ? true : `number format ${JSON.stringify(s.xf.numFormat)} (type ${s.xf.numType}), expected ${name}`; };
const setFormat = (addr, fmt) => async ctx => cmd(ctx.frame, `Api.GetActiveSheet().GetRange("${addr}").SetNumberFormat(${JSON.stringify(fmt)})`);
const builder = src => async ctx => cmd(ctx.frame, src);

const addShapes = n => async ctx => {
  await cmd(ctx.frame, `(function(){ var s = Api.GetActiveSheet(); for (var i = 0; i < ${n}; i++) { var f = Api.CreateSolidFill(Api.CreateRGBColor(80, 120, 200)); var st = Api.CreateStroke(0, Api.CreateNoFill()); s.AddShape("rect", 1800000, 900000, f, st, 4 + i * 3, 0, 2, 0); } return s.GetAllDrawings().length; })()`);
  await ctx.frame.waitForTimeout(300);
};
const selectShape = async ctx => { await ctx.js(() => { const ws = Asc.editor.wb.getWorksheet(), c = ws.objectRender.controller, d = c.getDrawingObjects(); c.resetSelection(); d[0].select(c, 0); c.updateSelectionState && c.updateSelectionState(); ws.objectRender.showDrawingObjects && ws.objectRender.showDrawingObjects(); }); };

// type in the cell editor then commit with Enter: the committed value of `addr`
const typed = (addr, want) => cells({ [addr]: want });

const pasteDialog = async ctx => {
  // open the editor's Paste Special dialog: paste A1 into D1, then the paste options menu > Paste special
  await copyTo("A1", "D1")(ctx); await pasteThere(ctx);
  await ctx.js(() => { const b = $("#special-paste-container button:visible, #special-paste-container .btn:visible").first(); b.click(); });
  await ctx.frame.waitForTimeout(300);
  await ctx.js(() => { const it = $(".dropdown-menu:visible a").filter(function () { return /paste special/i.test($(this).text()); }).first(); it.click(); });
  await ctx.frame.waitForTimeout(500);
  if (!(await vis(ctx, "#paste-radio-all"))) throw new Error("Paste Special dialog did not open");
};
const radioChecked = id => async ctx => ((await ctx.js(id => { const e = document.querySelector("#" + id + " input"); return !!(e && e.checked); }, id)) ? true : `${id} not selected`);
const pasteLetter = (id, letter, radio) => ({ id, win: [letter], mac: [], pre: async ctx => { await pasteDialog(ctx); if (radio === "paste-radio-all") await ctx.js(() => document.querySelector("#paste-radio-values input").click()); }, check: radioChecked(radio), control: async ctx => ctx.js(id => document.querySelector("#" + id + " input").click(), radio) });

// ---- cases -----------------------------------------------------------------
export const CASES = [
  // file
  { id: "file.open", win: ["Control+o"], mac: ["Meta+o", "Control+o"], check: backstage(null), control: async ctx => ctx.js(() => SSE.getController("LeftMenu").leftMenu.showMenu("file")) },
  { id: "file.open.cmd-f12", win: [], mac: ["Meta+F12"], same: "file.open" },
  { id: "file.new", win: ["Control+Alt+Shift+n"], mac: ["Meta+Alt+Shift+n"], check: backstage(["new"]) },
  { id: "file.new-template", win: [], mac: ["Meta+Shift+p"], check: backstage(["new"]) },
  // the editor saves only a modified workbook (Toolbar.onSave): the check is that the save is requested
  { id: "file.save", win: ["Control+s"], mac: ["Meta+s", "Control+s"], pre: spy("ctrl:Toolbar.onSave"), check: called("ctrl:Toolbar.onSave"), after: unspy("ctrl:Toolbar.onSave"), control: async ctx => ctx.js(() => SSE.getController("Toolbar").onSave()) },
  { id: "file.save-as", win: ["F12"], mac: ["Meta+Shift+s", "F12"], check: backstage(["saveas", "save-copy", "save-desktop"]), control: async ctx => ctx.js(() => SSE.getController("LeftMenu").leftMenu.showMenu("file:saveas")) },
  { id: "file.save.option-f2", win: [], mac: ["Alt+F2"], pre: spy("ctrl:Toolbar.onSave"), check: async ctx => ((await called("ctrl:Toolbar.onSave")(ctx)) === true || (await backstage(["saveas", "save-copy"])(ctx)) === true ? true : "neither saved nor File > Save as"), after: unspy("ctrl:Toolbar.onSave") },
  { id: "file.print", win: ["Control+p"], mac: ["Meta+p", "Control+p"], check: backstage(["printpreview"]) },
  { id: "file.help", win: ["F1"], mac: ["F1", "Meta+Slash"], check: async ctx => { if (!(await ctx.js(() => SSE.getController("Main").appOptions.canHelp))) return { skip: "help is disabled in this deployment (File > Help absent)" }; return backstage(["help"])(ctx); } },
  // window
  { id: "window.ribbon-collapse", win: ["Control+F1"], mac: ["Meta+Alt+r"], check: async ctx => ((await ctx.st()).compact !== ctx.s0.compact ? true : "ribbon state unchanged"), control: async ctx => ctx.js(() => SSE.getController("RibbonTabs").toggleRibbon()) },
  {
    id: "window.formula-bar", win: ["Control+Shift+u"], mac: ["Control+Shift+u"],
    check: async ctx => ((await ctx.js(() => $("#ce-btn-expand").hasClass("btn-collapse"))) ? true : "formula bar not expanded"),
    control: async ctx => ctx.js(() => $("#ce-btn-expand").click()),
  },
  ...[["window.cycle-panes", "F6", ["F6", "Shift+F6"]], ["window.cycle-panes.back", "Shift+F6", []]].map(([id, k, mac]) => ({
    id, win: [k], mac,
    check: async ctx => {
      const first = await where(ctx);
      if (first === "grid") return "focus stayed in the grid";
      if (!["ribbon", "statusbar", "pane"].includes(first)) return `focus went to ${first}`;
      const key = ctx.variant;
      for (let i = 0; i < 6; i++) { await ctx.page.keyboard.press(key); await ctx.frame.waitForTimeout(150); if ((await where(ctx)) === "grid") return true; }
      return `${key} never comes back to the grid`;
    },
  })),
  { id: "window.zoom-in", win: ["Control+Alt+Equal"], mac: [], check: async ctx => ((await ctx.st()).zoom > 1 ? true : `zoom ${(await ctx.st()).zoom}`), control: async ctx => ctx.js(() => Asc.editor.asc_setZoom(1.1)) },
  { id: "window.zoom-out", win: ["Control+Alt+Minus"], mac: [], check: async ctx => ((await ctx.st()).zoom < 1 ? true : `zoom ${(await ctx.st()).zoom}`), control: async ctx => ctx.js(() => Asc.editor.asc_setZoom(0.9)) },
  { id: "window.search", win: [], mac: ["Meta+f"], check: async ctx => ((await ctx.st()).searchBar ? true : "Find bar not shown") },
  // ribbon
  { id: "ribbon.context-menu", win: ["Shift+F10", "ContextMenu"], mac: ["Shift+F10"], check: visCase("#id-context-menu-item-add-comment, .dropdown-menu.shifted-right", "context menu") },
  {
    id: "ribbon.error-menu", win: ["Alt+Shift+F10"], mac: ["Alt+Shift+F10"], pre: async ctx => { await copyTo("A1", "D1")(ctx); await pasteThere(ctx); },
    check: async ctx => ((await ctx.js(() => $(".dropdown-menu:visible").filter(function () { return $(this).closest("#special-paste-container").length > 0; }).length)) > 0 ? true : "paste options menu not open"),
    control: async ctx => ctx.js(() => $("#special-paste-container button:visible, #special-paste-container .btn:visible").first().click()),
  },
  // dialog
  {
    id: "dialog.cancel", win: ["Escape"], mac: ["Escape"],
    pre: async ctx => { await ctx.page.keyboard.press("Control+Shift+Equal"); await ctx.frame.waitForTimeout(500); if (!(await ctx.st()).windows.length) throw new Error("Insert cells dialog did not open"); },
    check: async ctx => { const w = (await ctx.st()).windows; return w.length ? `dialog still open: ${w.join(" | ")}` : true; },
  },
  // navigation
  { id: "nav.up", win: ["ArrowUp"], mac: ["ArrowUp"], sel: "B3", check: at("B2") },
  { id: "nav.down", win: ["ArrowDown"], mac: ["ArrowDown"], sel: "B3", check: at("B4") },
  { id: "nav.left", win: ["ArrowLeft"], mac: ["ArrowLeft"], sel: "B3", check: at("A3") },
  { id: "nav.right", win: ["ArrowRight"], mac: ["ArrowRight"], sel: "B3", check: at("C3") },
  { id: "nav.tab", win: ["Tab"], mac: ["Tab"], check: at("B1") },
  { id: "nav.protected-tab", same: "nav.tab" },
  { id: "nav.shift-tab", win: ["Shift+Tab"], mac: ["Shift+Tab"], sel: "B1", check: at("A1") },
  { id: "nav.edge", win: ["Control+ArrowDown"], mac: ["Meta+ArrowDown"], check: at("A6") },
  { id: "nav.end-mode", win: [["End", "ArrowDown"]], mac: [], check: at("A6") },
  { id: "nav.last-cell", win: ["Control+End"], mac: ["Control+End"], check: at("B6") },
  { id: "nav.first-cell", win: ["Control+Home"], mac: ["Control+Home"], sel: "C4", check: at("A1") },
  { id: "nav.row-start", win: ["Home"], mac: ["Home"], sel: "C4", check: at("A4") },
  { id: "nav.page-down", win: ["PageDown"], mac: ["PageDown"], check: async ctx => { const s = await ctx.st(); return s.active[0] >= 10 && s.active[1] === 0 ? true : `active cell ${s.activeAddr}`; } },
  { id: "nav.page-up", win: ["PageUp"], mac: ["PageUp"], sel: "A100", check: async ctx => { const s = await ctx.st(); return s.active[0] <= 89 && s.active[1] === 0 ? true : `active cell ${s.activeAddr}`; } },
  { id: "nav.screen-right", win: ["Alt+PageDown"], mac: ["Alt+PageDown"], check: async ctx => { const s = await ctx.st(); return s.sheet === 0 && s.active[0] === 0 && s.active[1] >= 5 ? true : `sheet ${s.sheet + 1}, active cell ${s.activeAddr}`; } },
  { id: "nav.screen-left", win: ["Alt+PageUp"], mac: ["Alt+PageUp"], sel: "Z1", check: async ctx => { const s = await ctx.st(); return s.sheet === 0 && s.active[0] === 0 && s.active[1] <= 20 ? true : `sheet ${s.sheet + 1}, active cell ${s.activeAddr}`; } },
  { id: "nav.next-sheet", win: ["Control+PageDown", "Control+Alt+PageDown"], mac: ["Control+PageDown", "Alt+ArrowRight", "Control+Alt+PageDown"], check: async ctx => eq((await ctx.st()).sheet, 1, "active sheet index") },
  { id: "nav.prev-sheet", win: ["Control+PageUp", "Control+Alt+PageUp"], mac: ["Control+PageUp", "Alt+ArrowLeft", "Control+Alt+PageUp"], pre: async ctx => { await ctx.js(() => Asc.editor.asc_showWorksheet(1)); await ctx.frame.waitForTimeout(200); await focusGrid(ctx.frame); }, check: async ctx => eq((await ctx.st()).sheet, 0, "active sheet index") },
  { id: "nav.validation-list", win: ["Alt+ArrowDown"], mac: ["Alt+ArrowDown"], sel: "B6", check: async ctx => ((await ctx.js(() => $(".dropdown-menu:visible").text())).includes("elderberry") ? true : "no list of the column's values") },
  { id: "entry.autocomplete", same: "nav.validation-list", win: [] },
  {
    id: "nav.shapes", win: [["Control+Alt+Digit5"]], mac: [], pre: addShapes(1),
    check: async ctx => ((await ctx.st()).selectedDrawings > 0 ? true : "no shape selected"), control: selectShape,
  },
  { id: "nav.shapes-exit", win: ["Escape"], mac: [], keepObjects: true, pre: async ctx => { await addShapes(1)(ctx); await selectShape(ctx); if (!(await ctx.st()).selectedDrawings) throw new Error("shape not selected"); }, check: async ctx => ((await ctx.st()).selectedDrawings === 0 ? true : "shape still selected") },
  {
    id: "nav.scroll-to-active", win: [], mac: ["Control+Backspace"],
    pre: async ctx => { await ctx.js(() => Asc.editor.wb.getWorksheet().scrollVertical(60)); await ctx.frame.waitForTimeout(200); },
    check: async ctx => { const r = await ctx.js(() => Asc.editor.wb.getWorksheet().visibleRange.r1); return r === 0 ? true : `first visible row ${r + 1}`; },
    control: async ctx => ctx.js(() => Asc.editor.wb.getWorksheet().scrollVertical(-60)),
  },
  ...["nav.goto", "nav.goto.ctrl-g"].map((id, i) => ({
    id, win: [i ? "Control+g" : "F5"], mac: i ? [] : ["Control+g", "F5"],
    check: async ctx => { const s = await ctx.st(); if (s.windows.some(w => /go to/i.test(w))) return true; return s.focus === "ce-cell-name" ? true : `no Go To dialog, focus on ${s.focus}`; },
    control: async ctx => ctx.js(() => document.getElementById("ce-cell-name").focus()),
  })),
  { id: "nav.find", win: ["Control+f"], mac: ["Control+f", "Shift+F5"], check: async ctx => ((await ctx.st()).searchBar ? true : "Find bar not shown") },
  { id: "nav.search-sheet", win: [], mac: ["Control+F5"], same: "nav.find" },
  { id: "nav.replace", win: ["Control+h"], mac: ["Control+h", "Meta+Shift+h"], check: async ctx => ((await ctx.st()).replaceField ? true : "Replace field not shown") },
  // selection
  { id: "sel.all", win: ["Control+a", "Control+Shift+Space"], mac: ["Meta+a", "Meta+Shift+Space"], check: ranges(["A1:B6"]) },
  ...[["sel.next-sheet", "Control+Shift+PageDown", "Control+Alt+Shift+PageDown", 0], ["sel.prev-sheet", "Control+Shift+PageUp", "Control+Alt+Shift+PageUp", 1]].map(([id, k, alt, start]) => ({
    id, win: [k, alt], mac: [alt],
    pre: async ctx => { if (start) { await ctx.js(() => Asc.editor.asc_showWorksheet(1)); await focusGrid(ctx.frame); } },
    check: async ctx => { const n = await ctx.js(() => SSE.getController("Statusbar").statusbar.tabbar.selectTabs.length); return n === 2 ? true : `${n} sheet tab(s) selected, expected 2`; },
    control: async ctx => { const tabs = ctx.frame.locator("#status-sheets-bar li"); await tabs.nth(1 - start).click({ modifiers: ["Control"] }); },
  })),
  { id: "sel.extend", win: ["Shift+ArrowDown"], mac: ["Shift+ArrowDown"], check: ranges(["A1:A2"]) },
  { id: "sel.extend-edge", win: ["Control+Shift+ArrowDown"], mac: ["Meta+Shift+ArrowDown"], check: ranges(["A1:A6"]) },
  { id: "sel.extend-last", win: ["Control+Shift+End"], mac: ["Control+Shift+End"], check: ranges(["A1:B6"]) },
  { id: "sel.extend-first", win: ["Control+Shift+Home"], mac: ["Control+Shift+Home"], sel: "B3", check: ranges(["A1:B3"]) },
  { id: "sel.extend-row-start", win: ["Shift+Home"], mac: ["Shift+Home"], sel: "C3", check: ranges(["A3:C3"]) },
  { id: "sel.extend-page-down", win: ["Shift+PageDown"], mac: ["Shift+PageDown"], check: async ctx => { const g = (await ctx.st()).ranges; return g.length === 1 && g[0][0] === 0 && g[0][2] >= 10 && g[0][1] === 0 && g[0][3] === 0 ? true : `selection ${JSON.stringify(g)}`; } },
  { id: "sel.extend-page-up", win: ["Shift+PageUp"], mac: ["Shift+PageUp"], sel: "A100", check: async ctx => { const g = (await ctx.st()).ranges; return g.length === 1 && g[0][2] === 99 && g[0][0] <= 89 ? true : `selection ${JSON.stringify(g)}`; } },
  { id: "sel.extend-mode", win: [["F8", "ArrowDown", "ArrowDown"]], mac: [["F8", "ArrowDown", "ArrowDown"]], check: ranges(["A1:A3"]), after: async ctx => { await ctx.page.keyboard.press("F8"); } },
  { id: "sel.add-mode", win: [["Shift+F8", "ArrowRight", "ArrowRight"]], mac: [["Shift+F8", "ArrowRight", "ArrowRight"]], check: async ctx => { const g = (await ctx.st()).ranges; return g.length >= 2 && JSON.stringify(g[0]) === JSON.stringify([0, 0, 0, 0]) ? true : `selection ${JSON.stringify(g)} (A1 should stay selected)`; }, after: async ctx => { await ctx.page.keyboard.press("Shift+F8"); } },
  { id: "sel.column", win: ["Control+Space"], mac: ["Control+Space"], sel: "B2", check: ranges([[0, 1, MAXR, 1]]) },
  { id: "sel.row", win: ["Shift+Space"], mac: ["Shift+Space"], sel: "B2", check: ranges([[1, 0, 1, MAXC]]) },
  {
    id: "sel.objects", win: ["Control+Shift+Space"], mac: [], keepObjects: true, pre: async ctx => { await addShapes(2)(ctx); await selectShape(ctx); },
    check: async ctx => { const s = await ctx.st(); return s.selectedDrawings === 2 ? true : `${s.selectedDrawings} of ${s.drawings} shapes selected`; },
  },
  { id: "sel.region", win: ["Control+Shift+Digit8", "Control+NumpadMultiply"], mac: [], sel: "A3", check: ranges(["A1:B6"]) },
  { id: "sel.active-only", win: [], mac: ["Shift+Backspace"], sel: "A1:B3", active: "B2", check: ranges(["B2"]) },
  { id: "sel.down", win: ["Enter"], mac: ["Enter"], sel: "A1:B2", check: all(at("A2"), ranges(["A1:B2"])) },
  { id: "sel.up", win: ["Shift+Enter"], mac: ["Shift+Enter"], sel: "A1:B2", active: "A2", check: all(at("A1"), ranges(["A1:B2"])) },
  { id: "sel.right", win: ["Tab"], mac: ["Tab"], sel: "A1:B2", check: all(at("B1"), ranges(["A1:B2"])) },
  { id: "sel.left", win: ["Shift+Tab"], mac: ["Shift+Tab"], sel: "A1:B2", active: "B1", check: all(at("A1"), ranges(["A1:B2"])) },
  { id: "sel.corner", win: ["Control+Period"], mac: ["Control+Period"], sel: "A1:B3", check: all(at("B1"), ranges(["A1:B3"])) },
  // edit
  {
    id: "edit.copy", win: ["Control+c"], mac: ["Meta+c"], nativeClipboardOnMac: true,
    pre: async ctx => { await ctx.js(() => navigator.clipboard.writeText("-")); },
    check: async ctx => { const t = (await ctx.js(() => navigator.clipboard.readText())).trim(); return t === "10" ? true : `clipboard ${JSON.stringify(t)}`; },
  },
  {
    id: "edit.cut", win: ["Control+x"], mac: ["Meta+x"], nativeClipboardOnMac: true,
    pre: async ctx => { await ctx.js(() => navigator.clipboard.writeText("-")); },
    check: async ctx => { const t = (await ctx.js(() => navigator.clipboard.readText())).trim(); if (t !== "10") return `clipboard ${JSON.stringify(t)}`; await select(ctx.frame, "D1"); await pasteThere(ctx); return cells({ A1: "", D1: "10" })(ctx); },
  },
  { id: "edit.paste", win: ["Control+v", "Shift+Insert"], mac: ["Meta+v"], nativeClipboardOnMac: true, pre: copyTo("A1", "D1"), check: cells({ D1: "10" }) },
  {
    id: "edit.paste-special", win: ["Control+Alt+v"], mac: ["Meta+Control+v", "Control+Alt+v", "Meta+Alt+v"], pre: copyTo("A1", "D1"),
    check: async ctx => ((await vis(ctx, "#paste-radio-all")) ? true : `no Paste Special dialog (open: ${(await ctx.st()).windows.join(" | ") || "none"})`),
    control: async ctx => { await pasteThere(ctx); await ctx.js(() => $("#special-paste-container button:visible, #special-paste-container .btn:visible").first().click()); await ctx.frame.waitForTimeout(300); await ctx.js(() => $(".dropdown-menu:visible a").filter(function () { return /paste special/i.test($(this).text()); }).first().click()); await ctx.frame.waitForTimeout(400); },
  },
  { id: "edit.undo", win: ["Control+z"], mac: ["Meta+z", "Control+z"], sel: "D1", pre: async ctx => { await ctx.page.keyboard.type("x"); await ctx.page.keyboard.press("Enter"); await ctx.frame.waitForTimeout(150); await select(ctx.frame, "D2"); }, check: cells({ D1: "" }) },
  { id: "edit.redo", win: ["Control+y"], mac: ["Meta+y", "Control+y", "Meta+Shift+z"], sel: "D1", pre: async ctx => { await ctx.page.keyboard.type("x"); await ctx.page.keyboard.press("Enter"); await ctx.frame.waitForTimeout(150); await ctx.js(() => Asc.editor.asc_Undo()); await ctx.frame.waitForTimeout(150); await focusGrid(ctx.frame); }, check: cells({ D1: "x" }) },
  { id: "edit.repeat", win: ["F4", "Control+y"], mac: ["F4", "Meta+y"], pre: async ctx => { await ctx.page.keyboard.press("Control+b"); await ctx.frame.waitForTimeout(150); await select(ctx.frame, "A2"); }, check: xf("bold", true) },
  { id: "edit.flash-fill", win: ["Control+e"], mac: ["Control+e"], sel: "C2", pre: builder(`Api.GetActiveSheet().GetRange("C1").SetValue("APPLE")`), check: cells({ C2: "BANANA", C3: "CHERRY", C5: "ELDERBERRY", C6: "" }) },
  { id: "edit.quick-analysis", win: ["Control+q"], mac: ["Control+q"], sel: "A1:B5", check: async ctx => ((await ctx.js(() => { const m = SSE.getController("ExcelShortcuts").qaMenuCmp; return !!m && m.isVisible(); })) ? true : "Quick Analysis menu not open"), after: async ctx => { await ctx.page.keyboard.press("Escape"); } },
  { id: "edit.clear", win: ["Delete"], mac: ["Backspace"], sel: "A1:A2", check: all(cells({ A1: "", A2: "" }), async ctx => ((await ctx.st()).edit ? "cell edit mode opened" : true)) },
  { id: "edit.clear-active", win: ["Backspace"], mac: ["Backspace"], sel: "A1", check: all(editing, async ctx => eq((await ctx.st()).formulaBar, "", "formula bar")) },
  { id: "edit.delete-cells", win: ["Control+Minus"], mac: ["Meta+Minus", "Control+Minus"], sel: "B2", check: windowCase(/delete/i), control: async ctx => ctx.page.keyboard.press("Control+Shift+Minus") },
  { id: "edit.insert-cells", win: ["Control+Shift+Equal"], mac: ["Control+Shift+Equal"], sel: "B2", check: windowCase(/insert/i) },
  {
    id: "edit.fill-down", win: ["Control+d"], mac: ["Meta+d", "Control+d"], sel: "A1:A3",
    check: async ctx => {
      let result = await cells({ A1: "10", A2: "10", A3: "10" })(ctx);
      if (result !== true) return result;
      await builder(`Api.GetActiveSheet().GetRange("D2").SetValue("=A1")`)(ctx);
      await select(ctx.frame, "D3"); await ctx.page.keyboard.press(ctx.variant); await ctx.frame.waitForTimeout(200);
      const state = await ctx.st();
      result = eq(state.formulas.D3, "=A2", "single-cell adjusted formula");
      return result === true ? eq(state.activeAddr, "D3", "selection after single-cell fill") : result;
    },
  },
  {
    id: "edit.fill-right", win: ["Control+r"], mac: ["Meta+r", "Control+r"], sel: "A1:C1",
    check: async ctx => {
      let result = await cells({ A1: "10", B1: "10", C1: "10" })(ctx);
      if (result !== true) return result;
      await builder(`Api.GetActiveSheet().GetRange("D4").SetValue("=A1")`)(ctx);
      await select(ctx.frame, "E4"); await ctx.page.keyboard.press(ctx.variant); await ctx.frame.waitForTimeout(200);
      const state = await ctx.st();
      result = eq(state.formulas.E4, "=B1", "single-cell adjusted formula");
      return result === true ? eq(state.activeAddr, "E4", "selection after single-cell fill") : result;
    },
  },
  { id: "edit.hide-rows", win: ["Control+9"], mac: ["Control+9", "Meta+Shift+Digit9"], sel: "A2", check: async ctx => eq((await ctx.st()).hiddenRows, [2], "hidden rows"), control: async ctx => ctx.js(() => Asc.editor.asc_hideRows()) },
  {
    id: "edit.unhide-rows", win: ["Control+Shift+Digit9"], mac: ["Control+Shift+Digit9"], sel: "A1:A4",
    pre: async ctx => { await builder(`Api.GetActiveSheet().GetRange("A2:A3").GetEntireRow().SetHidden(true)`)(ctx); await select(ctx.frame, "A1:A4"); if (!(await ctx.st()).hiddenRows.length) throw new Error("rows not hidden"); },
    check: async ctx => eq((await ctx.st()).hiddenRows, [], "hidden rows"), control: async ctx => ctx.js(() => Asc.editor.asc_showRows()),
  },
  { id: "edit.hide-cols", win: ["Control+0"], mac: ["Control+0", "Meta+Shift+Digit0"], sel: "B1", check: async ctx => eq((await ctx.st()).hiddenCols, ["B"], "hidden columns"), control: async ctx => ctx.js(() => Asc.editor.asc_hideColumns()) },
  {
    id: "edit.unhide-cols", win: [], mac: ["Control+Shift+Digit0"], sel: "A1:D1",
    pre: async ctx => { await builder(`Api.GetActiveSheet().GetRange("B1:C1").GetEntireColumn().SetHidden(true)`)(ctx); await select(ctx.frame, "A1:D1"); if (!(await ctx.st()).hiddenCols.length) throw new Error("columns not hidden"); },
    check: async ctx => eq((await ctx.st()).hiddenCols, [], "hidden columns"), control: async ctx => ctx.js(() => Asc.editor.asc_showColumns()),
  },
  {
    id: "edit.group", win: ["Alt+Shift+ArrowRight"], mac: ["Meta+Shift+k"], sel: "A2:A3",
    pre: async ctx => { await select(ctx.frame, "A2:A3"); await ctx.js(() => Asc.editor.wb.getWorksheet().setSelection(new Asc.Range(0, 1, 16383, 2))); await focusGrid(ctx.frame); },
    check: async ctx => eq((await sheetInfo(ctx)).rowLevels, [0, 1, 1, 0, 0], "row outline levels"),
    control: async ctx => ctx.js(() => Asc.editor.asc_group(true)),
  },
  {
    id: "edit.ungroup", win: ["Alt+Shift+ArrowLeft"], mac: ["Meta+Shift+j"],
    pre: async ctx => { await ctx.js(() => { Asc.editor.wb.getWorksheet().setSelection(new Asc.Range(0, 1, 16383, 2)); Asc.editor.asc_group(true); }); await ctx.frame.waitForTimeout(200); await ctx.js(() => Asc.editor.wb.getWorksheet().setSelection(new Asc.Range(0, 1, 16383, 2))); if ((await sheetInfo(ctx)).rowLevels[1] !== 1) throw new Error("rows not grouped"); await focusGrid(ctx.frame); },
    check: async ctx => eq((await sheetInfo(ctx)).rowLevels, [0, 0, 0, 0, 0], "row outline levels"),
  },
  { id: "edit.new-sheet", win: ["Shift+F11"], mac: ["Shift+F11"], check: async ctx => eq((await ctx.st()).sheets, 3, "sheet count"), control: async ctx => ctx.js(() => Asc.editor.asc_addWorksheet("Sheet3")) },
  { id: "edit.new-sheet.alt-shift-f1", win: ["Alt+Shift+F1"], mac: [], same: "edit.new-sheet" },
  { id: "edit.chart", win: ["Alt+F1"], mac: [], sel: "A1:A5", control: builder(`Api.GetActiveSheet().AddChart("'Sheet1'!$A$1:$A$5", true, "bar", 2, 100 * 36000, 70 * 36000, 3, 0, 2, 0)`), check: async ctx => { const n = await ctx.js(() => Asc.editor.wb.getWorksheet().objectRender.controller.getDrawingObjects().filter(d => d.getObjectType && d.getObjectType() === AscDFH.historyitem_type_ChartSpace).length); return n === 1 ? true : "no chart inserted"; } },
  { id: "edit.sort", win: [], mac: ["Meta+Shift+r"], check: windowCase(/sort/i) },
  { id: "edit.filter", win: ["Control+Shift+l"], mac: ["Meta+Shift+f", "Control+Shift+l"], check: async ctx => ((await sheetInfo(ctx)).autoFilter ? true : "no AutoFilter") },
  { id: "edit.table", win: ["Control+l", "Control+t"], mac: ["Meta+t", "Control+t"], check: windowCase(/table/i) },
  { id: "edit.hyperlink", win: ["Control+k"], mac: ["Meta+k", "Control+k"], check: windowCase(/link/i) },
  {
    id: "edit.spelling", win: ["F7"], mac: ["F7"],
    check: async ctx => { if (!(await ctx.js(() => { const b = SSE.getController("LeftMenu").leftMenu.btnSpellcheck; return !!(b && b.isVisible()); }))) return { skip: "spell checking is not available in this deployment" }; return visCase("#left-panel-spellcheck", "spelling pane")(ctx); },
    control: async ctx => ctx.js(() => $("#left-btn-spellcheck").click()),
  },
  { id: "edit.note", win: ["Shift+F2"], mac: ["Shift+F2"], check: commentOpen, control: async ctx => ctx.js(() => SSE.getController("DocumentHolder").onAddComment()) },
  { id: "edit.comment", win: ["Control+Shift+F2"], mac: ["Meta+Shift+F2"], check: commentOpen, control: async ctx => ctx.js(() => SSE.getController("DocumentHolder").onAddComment()) },
  { id: "edit.comment.cmd-return", win: [], mac: ["Meta+Enter"], check: commentOpen },
  { id: "edit.macros", win: ["Alt+F8"], mac: ["Alt+F8"], check: windowCase(/macro/i), control: async ctx => ctx.js(() => $("#slot-btn-macros button, #slot-btn-macros .btn").first().click()) },
  { id: "edit.vba", win: ["Alt+F11"], mac: ["Alt+F11"], same: "edit.macros" },
  { id: "edit.refresh-all", win: ["Control+Alt+F5"], mac: [], pre: spy("wb._onRefreshConnections"), check: called("wb._onRefreshConnections", a => a[0] === true), after: unspy("wb._onRefreshConnections") },
  // cell entry
  { id: "entry.edit", win: [["F2", { text: "#" }, "Enter"]], mac: [["F2", { text: "#" }, "Enter"]], check: typed("A1", "10#") },
  { id: "entry.edit.ctrl-u", win: [], mac: [["Control+u", { text: "#" }, "Enter"]], check: typed("A1", "10#") },
  { id: "entry.edit-formula-bar", win: ["Control+F2"], mac: [], check: async ctx => { const s = await ctx.st(); return s.edit && s.focus === "ce-cell-content" ? true : `edit mode ${s.edit}, focus on ${s.focus}`; } },
  { id: "entry.newline", win: [[{ text: "ab" }, "Alt+Enter", { text: "c" }, "Enter"]], mac: [[{ text: "ab" }, "Alt+Enter", { text: "c" }, "Enter"], [{ text: "ab" }, "Control+Alt+Enter", { text: "c" }, "Enter"]], sel: "D1", check: typed("D1", "ab\nc") },
  { id: "entry.newline.cmd-option", win: [], mac: [[{ text: "ab" }, "Meta+Alt+Enter", { text: "c" }, "Enter"], [{ text: "ab" }, "Control+Alt+Enter", { text: "c" }, "Enter"]], sel: "D1", check: typed("D1", "ab\nc") },
  { id: "entry.fill", win: [[{ text: "x" }, "Control+Enter"]], mac: [[{ text: "x" }, "Meta+Enter"], [{ text: "x" }, "Control+Enter"]], sel: "D1:D3", check: cells({ D1: "x", D2: "x", D3: "x" }) },
  { id: "entry.complete-down", win: [[{ text: "x" }, "Enter"]], mac: [[{ text: "x" }, "Enter"]], sel: "D1", check: all(cells({ D1: "x" }), at("D2")) },
  { id: "entry.complete-up", win: [[{ text: "x" }, "Shift+Enter"]], mac: [[{ text: "x" }, "Shift+Enter"]], sel: "D2", check: all(cells({ D2: "x" }), at("D1")) },
  { id: "entry.complete-right", win: [[{ text: "x" }, "Tab"]], mac: [[{ text: "x" }, "Tab"]], sel: "D1", check: all(cells({ D1: "x" }), at("E1")) },
  { id: "entry.complete-left", win: [[{ text: "x" }, "Shift+Tab"]], mac: [[{ text: "x" }, "Shift+Tab"]], sel: "E1", check: all(cells({ E1: "x" }), at("D1")) },
  { id: "entry.cancel", win: [[{ text: "x" }, "Escape"]], mac: [[{ text: "x" }, "Escape"]], sel: "D1", check: all(cells({ D1: "" }), async ctx => ((await ctx.st()).edit ? "still editing" : true)) },
  {
    id: "entry.array", win: [[{ text: "=A1:A2*2" }, "Control+Shift+Enter"]], mac: [[{ text: "=A1:A2*2" }, "Meta+Shift+Enter"], [{ text: "=A1:A2*2" }, "Control+Shift+Enter"]], sel: "D1",
    check: async ctx => { const ref = await ctx.js(() => { let ref = null; Asc.editor.wb.model.getWorksheet(0).getRange3(0, 3, 0, 3)._foreachNoEmpty(c => { ref = c.formulaParsed ? (c.formulaParsed.ref ? "array" : "plain") : "value"; }); return ref; }); return ref === "array" ? true : `D1 is a ${ref} formula`; },
  },
  { id: "entry.backspace", win: [[{ text: "abc" }, "Backspace", "Enter"]], mac: [[{ text: "abc" }, "Backspace", "Enter"]], sel: "D1", check: typed("D1", "ab") },
  { id: "entry.delete", win: [["F2", "Home", "Delete", "Enter"]], mac: [["F2", "Home", "Delete", "Enter"]], sel: "B1", check: typed("B1", "pple") },
  { id: "entry.delete-eol", win: [["F2", "Home", "ArrowRight", "Control+Delete", "Enter"]], mac: [["F2", "Home", "ArrowRight", "Control+Delete", "Enter"]], sel: "D1", pre: builder(`Api.GetActiveSheet().GetRange("D1").SetValue("one two three")`), check: typed("D1", "o") },
  { id: "entry.move-char", win: [["F2", "Home", "ArrowRight", { text: "#" }, "Enter"]], mac: [["F2", "Home", "ArrowRight", { text: "#" }, "Enter"]], sel: "B1", check: typed("B1", "a#pple") },
  { id: "entry.line-start", win: [["F2", "Home", { text: "#" }, "Enter"]], mac: [["F2", "Home", { text: "#" }, "Enter"]], sel: "B1", check: typed("B1", "#apple") },
  { id: "entry.formula-end", win: [["F2", "Home", "Control+End", { text: "#" }, "Enter"]], mac: [], sel: "B1", check: typed("B1", "apple#") },
  { id: "entry.formula-select-end", win: [["F2", "Home", "ArrowRight", "Control+Shift+End", { text: "#" }, "Enter"]], mac: [], sel: "B1", check: typed("B1", "a#") },
  { id: "entry.start-formula", win: [[{ text: "=1+2" }, "Enter"]], mac: [[{ text: "=1+2" }, "Enter"]], sel: "D1", check: typed("D1", "3") },
  {
    id: "entry.date", win: [["Control+Semicolon", "Enter"]], mac: [["Control+Semicolon", "Enter"]], sel: "D1",
    check: async ctx => { const s = await ctx.st(); const v = s.cells.D1; return v && /^\d+$/.test(v) && +v > 40000 ? true : `D1 = ${JSON.stringify(v)}, expected today's date`; },
  },
  {
    id: "entry.time", win: [["Control+Shift+Semicolon", "Enter"]], mac: [["Meta+Semicolon", "Enter"]], sel: "D1",
    check: async ctx => { const s = await ctx.st(); const v = s.cells.D1; return v !== "" && !isNaN(+v) && +v < 1 && /h|:/i.test(s.xf.numFormat + (await ctx.js(() => Asc.editor.wb.model.getWorksheet(0).getRange3(0, 3, 0, 3).getNumFormatStr()))) ? true : `D1 = ${JSON.stringify(v)}, expected the current time`; },
  },
  { id: "entry.copy-formula-above", win: [["Control+Quote", "Enter"]], mac: [["Control+Quote", "Enter"]], sel: "A7", check: async ctx => eq((await ctx.st()).formulas.A7, "=SUM(A1:A5)", "A7 formula") },
  { id: "entry.copy-value-above", win: [["Control+Shift+Quote", "Enter"]], mac: [["Control+Shift+Quote", "Enter"]], sel: "A7", check: async ctx => { const s = await ctx.st(); return s.cells.A7 === "150" && s.formulas.A7 === "" ? true : `A7 = ${JSON.stringify(s.cells.A7)} (formula ${JSON.stringify(s.formulas.A7)}), expected the value 150`; } },
  { id: "entry.define-name", win: [], mac: ["Control+l"], check: windowCase(/name/i) },
  { id: "entry.define-name.cmd-f3", win: [], mac: ["Meta+F3"], same: "entry.define-name" },
  {
    id: "entry.paste-name", win: ["F3"], mac: [], sel: "D1", pre: builder(`Api.AddDefName("myname", "Sheet1!$A$1:$A$5")`),
    check: windowCase(/paste name/i), control: async ctx => ctx.js(() => SSE.getController("Toolbar").onNamedRangeMenu(null, { value: "paste" })), after: builder(`(function(){ var n = Api.GetDefName("myname"); n && n.Delete(); })()`),
  },
  // formulas
  { id: "formula.show", win: ["Control+Backquote"], mac: ["Control+Backquote"], check: async ctx => ((await ctx.st()).showFormulas ? true : "formulas not shown"), control: async ctx => ctx.js(() => Asc.editor.asc_setShowFormulas(true)) },
  ...[["formula.calc-all", ["F9"], ["Meta+Equal", "F9"], t => [4, 3].includes(t)], ["formula.calc-sheet", ["Shift+F9"], ["Shift+F9"], t => t === 2], ["formula.calc-full", ["Control+Alt+F9"], ["Control+Alt+F9"], t => t === 4], ["formula.calc-rebuild", ["Control+Alt+Shift+F9"], ["Control+Alt+Shift+F9"], t => t === 4]].map(([id, win, mac, ok]) => ({
    id, win, mac, pre: spy("wb.calculate"), check: called("wb.calculate", a => ok(a[0])), after: unspy("wb.calculate"),
  })),
  { id: "formula.args-dialog", win: [[{ text: "=SUM" }, "Control+a"]], mac: [[{ text: "=SUM" }, "Control+a"]], sel: "D1", check: windowCase(/argument|function/i) },
  { id: "formula.autosum", win: [["Alt+Equal", "Enter"]], mac: [["Meta+Shift+t", "Enter"]], sel: "A7", check: async ctx => eq((await ctx.st()).formulas.A7, "=SUM(A1:A6)", "A7 formula") },
  { id: "formula.abs-ref", win: [[{ text: "=A1" }, "F4", "Enter"]], mac: [[{ text: "=A1" }, "Meta+t", "Enter"], [{ text: "=A1" }, "F4", "Enter"]], sel: "D1", check: async ctx => eq((await ctx.st()).formulas.D1, "=$A$1", "D1 formula") },
  { id: "formula.insert-function", win: ["Shift+F3"], mac: ["Shift+F3"], check: windowCase(/function/i) },
  { id: "formula.point-mode", win: [[{ text: "=A1" }, "F2", "ArrowLeft", { text: "$" }, "Enter"]], mac: [], sel: "D1", check: async ctx => eq((await ctx.st()).formulas.D1, "=A$1", "D1 formula") },
  // format
  { id: "fmt.cells-dialog", win: ["Control+1"], mac: ["Meta+1", "Control+1"], check: windowCase(/format/i) },
  { id: "fmt.bold", win: ["Control+b", "Control+2"], mac: ["Meta+b", "Control+b"], check: xf("bold", true) },
  { id: "fmt.italic", win: ["Control+i", "Control+3"], mac: ["Meta+i", "Control+i"], check: xf("italic", true) },
  { id: "fmt.underline", win: ["Control+u", "Control+4"], mac: ["Meta+u"], check: xf("underline", true) },
  { id: "fmt.strike", win: ["Control+5"], mac: ["Meta+Shift+x"], check: xf("strike", true) },
  { id: "fmt.grow-font", win: [], mac: ["Meta+Shift+Period"], check: async ctx => ((await ctx.st()).xf.size > 11 ? true : `font size ${(await ctx.st()).xf.size}`) },
  { id: "fmt.shrink-font", win: [], mac: ["Meta+Shift+Comma"], check: async ctx => ((await ctx.st()).xf.size < 11 ? true : `font size ${(await ctx.st()).xf.size}`) },
  { id: "fmt.align-center", win: [], mac: ["Meta+e"], check: async ctx => eq((await ctx.st()).xf.align, await ctx.js(() => AscCommon.align_Center), "horizontal alignment") },
  { id: "fmt.align-left", win: [], mac: ["Meta+l"], sel: "B1", pre: builder(`Api.GetActiveSheet().GetRange("B1").SetAlignHorizontal("right")`), check: async ctx => eq((await ctx.st()).xf.align, await ctx.js(() => AscCommon.align_Left), "horizontal alignment") },
  { id: "fmt.border-outline", win: ["Control+Shift+Digit7"], mac: ["Meta+Alt+Digit0"], sel: "A1:B2", check: async ctx => { const a = await bordersOf(ctx, "A1"), b = await bordersOf(ctx, "B2"); return has(a, "lt") && has(b, "rb") ? true : `A1 ${JSON.stringify(a)}, B2 ${JSON.stringify(b)}`; } },
  ...[["fmt.border-right", "ArrowRight", "B1", "r"], ["fmt.border-left", "ArrowLeft", "A1", "l"], ["fmt.border-top", "ArrowUp", "A1", "t"], ["fmt.border-bottom", "ArrowDown", "A2", "b"]].map(([id, k, cell, side]) => ({
    id, win: [], mac: ["Meta+Alt+" + k], sel: "A1:B2", check: async ctx => { const b = await bordersOf(ctx, cell); return has(b, side) ? true : `${cell} borders ${JSON.stringify(b)}`; },
  })),
  {
    id: "fmt.border-remove", win: ["Control+Shift+Minus"], mac: ["Meta+Alt+Minus"], sel: "A1:B2",
    pre: async ctx => { await builder(`Api.GetActiveSheet().GetRange("A1:B2").SetBorders("Top", "Thin", Api.CreateColorFromRGB(0, 0, 0)); Api.GetActiveSheet().GetRange("A1:B2").SetBorders("Left", "Thin", Api.CreateColorFromRGB(0, 0, 0));`)(ctx); await select(ctx.frame, "A1:B2"); },
    check: async ctx => { const a = await bordersOf(ctx, "A1"); return none(a) ? true : `A1 borders ${JSON.stringify(a)}`; },
  },
  { id: "fmt.general", win: ["Control+Shift+Backquote"], mac: ["Control+Shift+Backquote"], pre: async ctx => { await setFormat("A1", "0.00%")(ctx); await select(ctx.frame, "A1"); }, check: numType("General") },
  { id: "fmt.currency", win: ["Control+Shift+Digit4"], mac: ["Control+Shift+Digit4"], check: numType("Currency") },
  { id: "fmt.percent", win: ["Control+Shift+Digit5"], mac: ["Control+Shift+Digit5"], check: numType("Percent") },
  { id: "fmt.scientific", win: ["Control+Shift+Digit6"], mac: ["Control+Shift+Digit6"], check: numType("Scientific") },
  { id: "fmt.date", win: ["Control+Shift+Digit3"], mac: ["Control+Shift+Digit3"], check: numType("Date") },
  { id: "fmt.time", win: ["Control+Shift+Digit2"], mac: ["Control+Shift+Digit2"], check: numType("Time") },
  { id: "fmt.number", win: ["Control+Shift+Digit1"], mac: ["Control+Shift+Digit1"], check: numType("Number") },
  // Paste Special dialog letters
  pasteLetter("paste.all", "a", "paste-radio-all"),
  pasteLetter("paste.formulas", "f", "paste-radio-formulas"),
  pasteLetter("paste.values", "v", "paste-radio-values"),
  pasteLetter("paste.formats", "t", "paste-radio-formats"),
  pasteLetter("paste.comments", "c", "paste-radio-comments"),
  pasteLetter("paste.no-borders", "x", "paste-radio-without-borders"),
  pasteLetter("paste.col-widths", "w", "paste-radio-col-width"),
  pasteLetter("paste.formulas-numfmt", "r", "paste-radio-formula-num-format"),
  pasteLetter("paste.values-numfmt", "u", "paste-radio-value-num-format"),
];
