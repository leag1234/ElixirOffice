#!/usr/bin/env node
// Word-like right-click menus: order, captions, shortcuts, spelling suggestions on top.
//   node tests/shortcuts/contextmenus.mjs [screenshot dir] [--out results.json]
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, setDoc, caret, select, cmd, resetUi, focusDoc, HERE, REAL_MAC } from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args[0] && !args[0].startsWith("--") ? args[0] : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "contextmenus-latest.json");
shots && fs.mkdirSync(shots, { recursive: true });

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + reason)); };
const frameBox = await (await frame.frameElement()).boundingBox();

async function pointAt(p, off) {
  await caret(frame, p, off);
  return frame.evaluate(([fx, fy]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument; d.Document_UpdateSelectionState();
    const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
    const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
    return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y + 6 };
  }, [frameBox.x, frameBox.y]);
}
// visible items of the open context menu: caption, shortcut, icon
const menuItems = () => frame.evaluate(() => {
  const v = DE.getController("DocumentHolder").documentHolder, m = v.currentMenu;
  if (!m || !m.isVisible()) return null;
  return m.items.filter(it => it.el && it.el.style.display !== "none" && it.el.parentNode).map(it => it.caption === "--" ? "--" : {
    t: it.cmpEl.find("> a").clone().children(".menu-item-shortcut").remove().end().text().trim(),
    k: it.cmpEl.find(".menu-item-shortcut").text(), icon: !!it.cmpEl.find("> a svg, > a .menu-item-icon").length,
    bold: it.cmpEl.hasClass("spell-suggestion"), sub: !!it.menu,
  });
});
const names = items => (items || []).map(i => (i === "--" ? "--" : i.t));
const before = (list, a, b) => list.indexOf(a) > -1 && list.indexOf(b) > -1 && list.indexOf(a) < list.indexOf(b);
const closeMenu = async () => { await page.keyboard.press("Escape"); await frame.waitForTimeout(200); await resetUi(frame, page); };
async function rightClickAt(p, off) {
  const pt = await pointAt(p, off);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await frame.waitForTimeout(700);
  return pt;
}
async function shot(name, pt) {
  if (!shots || !(await menuItems())) return;
  const box = await frame.evaluate(() => { const m = DE.getController("DocumentHolder").documentHolder.currentMenu; const r = m.cmpEl.find(".dropdown-menu").addBack(".dropdown-menu").first()[0].getBoundingClientRect(); const t = document.getElementById("mini-toolbar"); const tr = t && t.classList.contains("visible") ? t.getBoundingClientRect() : null; return { x: r.left, y: tr ? tr.top : r.top, w: Math.max(r.width, tr ? tr.width : 0), h: r.bottom - (tr ? tr.top : r.top) }; });
  await page.screenshot({ path: `${shots}/${name}.png`, clip: { x: Math.max(0, frameBox.x + box.x - 40), y: Math.max(0, frameBox.y + box.y - 30), width: Math.min(700, box.w + 260), height: box.h + 60 } });
}
const noSep = list => list.filter(x => x !== "--");
const sepOk = list => list[0] !== "--" && list[list.length - 1] !== "--" && !list.some((x, i) => x === "--" && list[i + 1] === "--");

// 1. text
await setDoc(frame, ["The quick brown fox jumps over the lazy dog.", "Second paragraph."]);
await select(frame, 0, 4, 9);
let pt = await rightClickAt(0, 6);
let items = await menuItems(), list = names(items);
record("menu.text.order", ["Cut", "Copy", "Paste", "Font...", "Paragraph...", "Link", "New Comment"].every((x, i, a) => i === 0 || before(noSep(list), a[i - 1], x)), JSON.stringify(list));
// on macOS the menu shows the Mac keys with their symbols, as Word for Mac does
const textShortcuts = REAL_MAC ? ["Cut:⌘X", "Copy:⌘C", "Paste:⌘V", "Font...:⌘D", "Link:⌘K", "New Comment:⌥⌘A"]
  : ["Cut:Ctrl+X", "Copy:Ctrl+C", "Paste:Ctrl+V", "Font...:Ctrl+D", "Link:Ctrl+K", "New Comment:Ctrl+Alt+M"];
record("menu.text.shortcuts", textShortcuts.every(s => (items || []).some(i => i !== "--" && i.t + ":" + i.k === s)), JSON.stringify((items || []).filter(i => i !== "--").map(i => i.t + ":" + i.k)));
record("menu.text.icons", ["Cut", "Copy", "Paste", "Font...", "Paragraph...", "Link", "New Comment"].every(t => (items || []).some(i => i.t === t && i.icon)), "an item has no icon");
record("menu.text.separators", sepOk(list), JSON.stringify(list));
record("menu.text.no-oo-extras", !list.includes("Page break before") && !list.includes("Keep lines together"), JSON.stringify(list));
await shot("interact-contextmenu-text", pt);
// Font... opens the font dialog
await frame.evaluate(() => { const v = DE.getController("DocumentHolder").documentHolder; const it = v.currentMenu.items.find(i => i.caption === "Font..."); it && it.cmpEl.find("> a").click(); });
await frame.waitForTimeout(600);
record("menu.text.font-dialog", await frame.evaluate(() => $(".asc-window:visible #id-adv-paragraph-font, .asc-window:visible").length > 0), "Font... opened no dialog");
await closeMenu();

// 2. misspelling: suggestions first, in bold
await setDoc(frame, ["This sentense has a mistake."]);
await frame.waitForTimeout(1800);
pt = await rightClickAt(0, 8);
items = await menuItems(); list = names(items);
const firstSep = list.indexOf("--");
const sugg = items.slice(0, firstSep).filter(i => !/more/i.test(i.t));
record("menu.spelling.suggestions-first", firstSep > 0 && sugg.length > 0 && sugg.every(i => i.bold) && sugg.some(i => /sentence/i.test(i.t)), JSON.stringify(items.slice(0, firstSep)));
record("menu.spelling.then-clipboard", before(noSep(list), "Ignore All", "Cut") && before(noSep(list), "Add to Dictionary", "Cut"), JSON.stringify(list));
await shot("interact-contextmenu-spelling", pt);
await closeMenu();

// 3. table
await setDoc(frame, ["before", { table: [["a1", "b1"], ["a2", "b2"]] }, "after"]);
await cmd(frame, `(function(){ var t = Api.GetDocument().GetElement(1); t.GetCell(0,0).GetContent().GetElement(0).GetRange().Select(); return 1; })()`);
await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorLeft(false, false); d.Document_UpdateSelectionState(); });
await focusDoc(frame);
const cellPt = await frame.evaluate(([fx, fy]) => { const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum); const sdk = document.getElementById("editor_sdk").getBoundingClientRect(); return { x: fx + sdk.left + c.X + 4, y: fy + sdk.top + c.Y + 6 }; }, [frameBox.x, frameBox.y]);
await page.mouse.click(cellPt.x, cellPt.y, { button: "right" });
await frame.waitForTimeout(700);
items = await menuItems(); list = names(items);
record("menu.table.order", ["Cut", "Copy", "Paste", "Insert", "Delete", "Table Properties...", "Link", "New Comment"].every((x, i, a) => i === 0 || before(noSep(list), a[i - 1], x)), JSON.stringify(list));
record("menu.table.separators", sepOk(list), JSON.stringify(list));
await shot("interact-contextmenu-table", cellPt);
await closeMenu();

// 4. picture
await setDoc(frame, ["Picture:", "after"]);
await cmd(frame, `(function(){ var d = Api.GetDocument(); var p = d.GetElement(0); var img = Api.CreateImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 1828800, 914400); p.AddDrawing(img); return 1; })()`);
await frame.waitForTimeout(500);
const imgPt = await frame.evaluate(([fx, fy]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument; const g = d.DrawingObjects.drawingObjects[0];
  const c = d.DrawingDocument.ConvertCoordsToCursorWR(g.X + g.Extent.W / 2, g.Y + g.Extent.H / 2, g.PageNum);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect(); return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y };
}, [frameBox.x, frameBox.y]);
await page.mouse.click(imgPt.x, imgPt.y);
await frame.waitForTimeout(300);
await page.mouse.click(imgPt.x, imgPt.y, { button: "right" });
await frame.waitForTimeout(700);
items = await menuItems(); list = names(items);
record("menu.picture.order", ["Cut", "Copy", "Paste", "Change Picture", "Link", "Save as Picture...", "Insert Caption...", "Wrap Text", "Size and Position..."].every((x, i, a) => i === 0 || before(noSep(list), a[i - 1], x)), JSON.stringify(list));
record("menu.picture.separators", sepOk(list), JSON.stringify(list));
await shot("interact-contextmenu-picture", imgPt);
await closeMenu();

// 5. hyperlink
await setDoc(frame, ["Visit the site now."]);
await select(frame, 0, 6, 14);
await frame.evaluate(() => { const p = new Asc.CHyperlinkProperty(); p.put_Value("https://example.org"); p.put_Text("the site"); Asc.editor.add_Hyperlink(p); });
await frame.waitForTimeout(300);
pt = await rightClickAt(0, 9);
items = await menuItems(); list = names(items);
record("menu.link.edit", (items || []).some(i => i !== "--" && i.sub && /link/i.test(i.t)) && before(noSep(list), "Paste", "Link"), JSON.stringify(list));
await shot("interact-contextmenu-link", pt);
await closeMenu();

// 6. header: Edit Header
await setDoc(frame, ["Body text."]);
await caret(frame, 0, 0);
await frame.evaluate(() => { const w = Asc.editor.WordControl; w.m_oScrollVerApi && w.m_oScrollVerApi.scrollToY(0); });
await frame.waitForTimeout(400);
const hdrPt = await frame.evaluate(([fx, fy]) => { const d = Asc.editor.WordControl.m_oLogicDocument; const c = d.DrawingDocument.ConvertCoordsToCursorWR(60, 14, 0); const sdk = document.getElementById("editor_sdk").getBoundingClientRect(); return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y }; }, [frameBox.x, frameBox.y]);
await page.mouse.click(hdrPt.x, hdrPt.y, { button: "right" });
await frame.waitForTimeout(700);
items = await menuItems(); list = names(items);
const dbg = await frame.evaluate(() => { const v = DE.getController("DocumentHolder").documentHolder; const m = v.currentMenu; return m ? { hdr: m === v.hdrMenu, text: m === v.textMenu, vis: m.isVisible(), items: m.items.map(i => i.caption + ":" + (i.el ? i.el.style.display + ":" + !!i.el.parentNode : "noel")) } : "none"; });
record("menu.header.edit", list.some(t => /header/i.test(t)), JSON.stringify(list) + " " + JSON.stringify(dbg));
await shot("interact-contextmenu-header", hdrPt);
await closeMenu();

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("menu.no-page-error", pageErrors.length === 0, pageErrors.map(e => e.text).join(" | ").slice(0, 300));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
await browser.close();
