#!/usr/bin/env node
// F12 (docs/backlog.md): the selection stays visible in cells with a dark or saturated fill.
// The text in a cell shaded with the standard "Blue" (0070C0) could be selected (and made bold)
// but the translucent blue selection did not show on it. For each fill: the mouse puts the caret
// in the cell, double-click / triple-click / drag / Shift+arrows select (engine read-back), the
// selected area visibly changes on screen (pixel difference with and without the selection), and
// a selection of two cells can be merged.
//   node tests/tableshade/selection.mjs [--out results.json]      (EO_BASE=http://host:port)
// Fixture: tests/fixtures/docx/selection-fills.docx (python3 tests/fixtures/docx/make_shading_fixtures.py).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, focusDoc } from "../shortcuts/lib.mjs";
import { upload, toScreen } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "fixtures", "docx", "selection-fills.docx");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "selection-latest.json");
const shots = path.join(HERE, "results");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.mkdirSync(shots, { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
let frame;
const wait = ms => frame.waitForTimeout(ms);
const FILLS = ["blue", "darkblue", "black", "orange", "themeshade", "white"];
const MIN_DIFF = 20; // mean per-channel change (0-255) of the selected area

const fname = await upload(FIX, `selfills-${process.pid}-${Date.now().toString(36)}.docx`);
frame = await openEditor(page, { fileName: fname });
await frame.evaluate(() => { try { Asc.editor.zoom(100); } catch (e) {} });
await focusDoc(frame);
await wait(500);

// first line of the cell of row r: page, bounds in mm, cell fill
const line = r => frame.evaluate(r => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  const cell = t.Content[r].Get_Cell(0);
  const p = cell.Content.Content[0];
  const l = p.Lines[0], pg = p.Pages[0];
  const shd = cell.Get_Shd(), c = shd.GetSimpleColor(d.GetTheme(), d.Get_ColorMap());
  const x = l.Ranges[0] ? l.Ranges[0].X : p.X, w = l.Ranges[0] && l.Ranges[0].W > 1 ? l.Ranges[0].W : 20;
  return { page: p.GetAbsolutePage(0), x, w, top: pg.Y + l.Top, bottom: pg.Y + l.Bottom, fill: [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase() };
}, r);
// where the caret / selection is: row of the table, selected text, cell selection
const where = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  const inTable = d.Content[d.CurPos.ContentPos] === t;
  return { row: inTable && t.CurCell ? t.CurCell.Row.Index : -1, text: d.GetSelectedText(false), cells: t.IsCellSelection() ? t.GetSelectionArray().length : 0 };
});
const clip = async (r, L) => {
  const a = await toScreen(page, frame, L.page, L.x + 1, L.top + 0.3);
  const b = await toScreen(page, frame, L.page, L.x + L.w - 1, L.bottom - 0.3);
  return { x: Math.round(a.x), y: Math.round(a.y), width: Math.max(4, Math.round(b.x - a.x)), height: Math.max(4, Math.round(b.y - a.y)) };
};
// mean absolute per-channel difference of two screenshots (raw RGBA through the page itself)
const meanDiff = (a, b) => page.evaluate(async ([a, b]) => {
  const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height;
  const x = c.getContext("2d");
  x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
  let s = 0, n = 0;
  for (let i = 0; i < da.length; i += 4) { s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); n += 3; }
  return s / n;
}, [a.toString("base64"), b.toString("base64")]);
const caretIn = r => frame.evaluate(r => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  const p = t.Content[r].Get_Cell(0).Content.Content[0];
  d.RemoveSelection(); p.Document_SetThisElementCurrent(false); p.MoveCursorToStartPos(false);
  d.UpdateSelection(); d.UpdateInterface();
}, r);

const palette = await frame.evaluate(() => { try { return Common.Utils.ThemeColor.getStandartColors(); } catch (e) { return null; } });
record("palette.standardBlue", Array.isArray(palette) && palette.map(c => String(c && c.color || c).toUpperCase()).includes("0070C0"), JSON.stringify(palette));

for (let r = 0; r < FILLS.length; r++) {
  const name = FILLS[r];
  const L = await line(r);
  // a mouse click in the text puts the caret in the cell
  const mid = await toScreen(page, frame, L.page, L.x + L.w / 2, (L.top + L.bottom) / 2);
  await page.mouse.click(mid.x, mid.y); await wait(250);
  let w = await where();
  record(`${name}.click.caret`, w.row === r && w.text === "", JSON.stringify(w));
  await wait(800); // the editor counts clicks by time: keep the gestures apart
  await page.mouse.dblclick(mid.x, mid.y); await wait(800);
  w = await where();
  record(`${name}.dblclick.word`, w.row === r && w.text.trim().length > 1 && !/\s/.test(w.text.trim()), JSON.stringify(w));
  await page.mouse.click(mid.x, mid.y, { clickCount: 3 }); await wait(800);
  w = await where();
  record(`${name}.tripleclick.paragraph`, w.row === r && w.text.startsWith("Use the money"), JSON.stringify(w));
  const a = await toScreen(page, frame, L.page, L.x + 0.5, (L.top + L.bottom) / 2);
  const b = await toScreen(page, frame, L.page, L.x + L.w - 0.5, (L.top + L.bottom) / 2);
  await caretIn(r === 0 ? 1 : 0); await wait(800); // a press inside the selection would drag the text
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await wait(100);
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await wait(250);
  w = await where();
  record(`${name}.drag.select`, w.row === r && w.text.length > 10, JSON.stringify(w));
  await caretIn(r); await page.keyboard.press("Shift+End"); await wait(300);
  w = await where();
  record(`${name}.shiftEnd.select`, w.row === r && w.text.startsWith("Use the money"), JSON.stringify(w));
  // visible: the selected line differs from the same line without selection
  const box = await clip(r, L);
  const sel = await page.screenshot({ clip: box });
  fs.writeFileSync(path.join(shots, `f12-${name}-selected.png`), sel);
  await caretIn(r === 0 ? 1 : 0); await wait(400);
  const plain = await page.screenshot({ clip: box });
  const diff = await meanDiff(sel, plain);
  record(`${name}.visible`, diff >= MIN_DIFF, `fill ${L.fill} mean diff ${diff.toFixed(1)} < ${MIN_DIFF}`);
  console.log(`  ${name} fill ${L.fill} selection contrast ${diff.toFixed(1)}`);
}

// ---- cell selection of the two empty blue cells: visible, and they can be merged ------------------------------------
{
  const r = FILLS.length;
  await caretIn(r); await page.keyboard.press("Shift+ArrowDown"); await wait(300);
  let w = await where();
  record("emptyBlue.cellSelection", w.cells === 2, JSON.stringify(w));
  const L = await line(r);
  const box = await clip(r, { ...L, w: 60, bottom: L.bottom + 8 });
  const sel = await page.screenshot({ clip: box });
  fs.writeFileSync(path.join(shots, "f12-emptyblue-cells.png"), sel);
  const canMerge = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.CanMergeTableCells());
  record("emptyBlue.canMerge", canMerge === true, String(canMerge));
  const rows0 = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.find(e => e.IsTable()).Content.length);
  await frame.evaluate(() => Asc.editor.MergeCells()); await wait(400);
  const rows1 = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.find(e => e.IsTable()).Content.length);
  record("emptyBlue.merge", rows1 === rows0 - 1, `${rows0} -> ${rows1}`);
  await frame.evaluate(() => Asc.editor.Undo()); await wait(400);
  await caretIn(r); await page.keyboard.press("Shift+ArrowDown"); await wait(300);
  const sel2 = await page.screenshot({ clip: box });
  await caretIn(0); await wait(400);
  const plain = await page.screenshot({ clip: box });
  const diff = await meanDiff(sel2, plain);
  record("emptyBlue.visible", diff >= MIN_DIFF, `mean diff ${diff.toFixed(1)} < ${MIN_DIFF}`);
}

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("noPageErrors", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
const pass = results.filter(r => r.status === "pass").length;
console.log(`results: ${pass}/${results.length} pass`);
fs.writeFileSync(outFile, JSON.stringify({ base: process.env.EO_BASE, pass, total: results.length, results }, null, 1));
await browser.close();
process.exit(pass === results.length ? 0 : 1);
