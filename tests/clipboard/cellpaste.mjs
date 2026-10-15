#!/usr/bin/env node
// Copy and paste of table cells keeps the cell formatting, like Word (docs/backlog.md F11):
// rotated text (btLr, tbRl), shading, vertical alignment, cell margins, cell borders, row height
// rule, merged cells; pasted into existing cells (Overwrite Cells), into an empty paragraph (new
// table), into another document, with Ctrl+C/V, the right-click menu and Paste Special; the HTML
// clipboard (what other applications get and give) carries the text direction too.
//   node tests/clipboard/cellpaste.mjs [--out results.json]      (EO_BASE=http://host:port)
// Fixture: tests/fixtures/docx/vertical-cells.docx (python3 tests/fixtures/docx/make_fixtures.py).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, openEditor, focusDoc } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "fixtures", "docx", "vertical-cells.docx");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "cellpaste-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, detail = "") => {
  const reason = ok === true ? "" : (typeof ok === "string" ? ok + " :: " : "") + String(detail).slice(0, 400);
  results.push({ id, status: ok === true ? "pass" : "fail", reason });
  console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason));
};
let frame, pg = page;
const wait = ms => frame.waitForTimeout(ms);
const near = (a, b, tol = 0.3) => a != null && b != null && Math.abs(a - b) <= tol;

// Document content indexes of the fixture
const SRC = 1, TGT = 3, EMPTY = 4;
const BTLR = 2, TBRL = 1, VA_TOP = 0, VA_CENTER = 1, VA_BOTTOM = 2;

// ---- helpers ---------------------------------------------------------------------------------------------------
// direct properties of every cell of the table at content index ti
const cells = (ti, f = frame) => f.evaluate(ti => {
  const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.Content[ti];
  if (!t || !t.IsTable()) return null;
  const hex = c => c ? [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase() : null;
  return t.Content.map(r => ({
    h: r.Pr.Height && r.Pr.Height.HRule !== Asc.linerule_Auto && r.Pr.Height.Value ? { rule: r.Pr.Height.HRule, mm: +r.Pr.Height.Value.toFixed(1) } : null,
    cells: r.Content.map(c => {
      const p = c.Pr, m = p.TableCellMar || {}, b = p.TableCellBorders || {};
      const run = c.Content.Content[0] && c.Content.Content[0].Content && c.Content.Content[0].Content.find(x => x.Pr && x.GetText && x.GetText().trim());
      return {
        text: c.Content.Content.map(x => x.GetText ? x.GetText() : "").join("").replace(/[\r\n\t]/g, "").trim(),
        td: p.TextDirection, va: p.VAlign, shd: p.Shd && p.Shd.Value !== Asc.c_oAscShdNil ? hex(p.Shd.Fill || p.Shd.Color) : null,
        mar: p.TableCellMar ? ["Top", "Left", "Bottom", "Right"].map(k => m[k] ? +m[k].W.toFixed(1) : null) : null,
        brd: ["Top", "Left", "Bottom", "Right"].map(k => b[k] ? hex(b[k].Color) : null).filter(Boolean),
        w: p.TableCellW ? +p.TableCellW.W.toFixed(1) : null, span: p.GridSpan || 1, vm: p.VMerge || 1,
        biu: run ? [!!run.Pr.Bold, !!run.Pr.Italic, !!run.Pr.Underline] : null,
      };
    }),
  }));
}, ti);
const tableCount = (f = frame) => f.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.filter(e => e.IsTable()).length);
const contentKinds = (f = frame) => f.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(e => e.IsTable() ? "T" : "P").join(""));

// screen point (page coordinates) of a cell centre, the view scrolled so that it is visible
async function cellPoint(ti, r, c, f = frame, p = pg) {
  const pt = await f.evaluate(([ti, r, c]) => {
    const wc = Asc.editor.WordControl, dd = wc.m_oDrawingDocument, d = wc.m_oLogicDocument; const t = d.Content[ti];
    const cell = t.GetRow(r).GetCell(c); const info = t.RowsInfo[r]; const pgi = Object.keys(info.Y)[0];
    const x = t.Pages[pgi].X + (cell.Metrics.X_cell_start + cell.Metrics.X_cell_end) / 2;
    const y = info.Y[pgi] + Math.min(info.H[pgi] / 2, 6);
    const pageAbs = t.GetAbsolutePage(+pgi);
    const view = document.getElementById("id_viewer").getBoundingClientRect();
    let q = dd.ConvertCoordsToCursor(x, y, pageAbs);
    if (q.Y < view.height * 0.15 || q.Y > view.height * 0.7) { wc.m_oScrollVerApi.scrollToY(Math.max(0, wc.m_dScrollY + q.Y - view.height * 0.4)); q = dd.ConvertCoordsToCursor(x, y, pageAbs); }
    return { x: view.left + q.X, y: view.top + q.Y };
  }, [ti, r, c]);
  const box = await (await f.frameElement()).boundingBox();
  return { x: box.x + pt.x, y: box.y + pt.y };
}
// screen point at the start of the paragraph at content index i
async function paraPoint(i) {
  const pt = await frame.evaluate(i => {
    const wc = Asc.editor.WordControl, dd = wc.m_oDrawingDocument, p = wc.m_oLogicDocument.Content[i];
    const x = p.Pages[0].X + 5, y = p.Pages[0].Y + 2, pa = p.GetAbsolutePage(0);
    const v = document.getElementById("id_viewer").getBoundingClientRect();
    let q = dd.ConvertCoordsToCursor(x, y, pa);
    if (q.Y < v.height * 0.15 || q.Y > v.height * 0.7) { wc.m_oScrollVerApi.scrollToY(Math.max(0, wc.m_dScrollY + q.Y - v.height * 0.4)); q = dd.ConvertCoordsToCursor(x, y, pa); }
    return { x: v.left + q.X, y: v.top + q.Y, inView: q.X > 0 && q.Y > 0 && q.X < v.width && q.Y < v.height };
  }, i);
  const box = await (await frame.frameElement()).boundingBox();
  return { x: box.x + pt.x, y: box.y + pt.y };
}
// select a block of cells by dragging the mouse from the first cell to the last, like a user
async function dragCells(ti, [r0, c0], [r1, c1]) {
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.UpdateSelection(); });
  await cellPoint(ti, r0, c0); const b = await cellPoint(ti, r1, c1); const a2 = await cellPoint(ti, r0, c0);
  await pg.mouse.move(a2.x, a2.y); await pg.mouse.down(); await wait(80);
  for (let i = 1; i <= 8; i++) { await pg.mouse.move(a2.x + (b.x - a2.x) * i / 8, a2.y + (b.y - a2.y) * i / 8); await wait(30); }
  await pg.mouse.up(); await wait(300);
  return frame.evaluate(ti => { const t = Asc.editor.WordControl.m_oLogicDocument.Content[ti]; return t.IsSelectionUse() && t.Selection.Type === 0 ? t.Selection.Data.map(p => `${p.Row}:${p.Cell}`).join(",") : "text"; }, ti);
}
// select a whole cell (or several) through the engine, for the targets
const selectCells = (ti, list, f = frame) => f.evaluate(([ti, list]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.Content[ti];
  d.RemoveSelection(); d.CurPos.ContentPos = ti; d.Selection.Use = true; d.Selection.Start = false; d.Selection.StartPos = d.Selection.EndPos = ti;
  t.CurCell = t.GetRow(list[0][0]).GetCell(list[0][1]);
  t.Selection.Use = true; t.Selection.Start = false; t.Selection.Type = 0; t.Selection.Type2 = 0; t.Selection.Data2 = null;
  t.private_SetSelectionData(list.map(([r, c]) => ({ Row: r, Cell: c })));
  t.Selection.StartPos.Pos = { Row: list[0][0], Cell: list[0][1] }; t.Selection.EndPos.Pos = { Row: list.at(-1)[0], Cell: list.at(-1)[1] };
  d.UpdateSelection(); d.UpdateInterface(); return t.Selection.Data.length;
}, [ti, list]);
const caretAt = (i, f = frame) => f.evaluate(i => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.CurPos.ContentPos = i; d.Content[i].MoveCursorToStartPos(); d.UpdateSelection(); d.UpdateInterface(); }, i);
const key = async (k, f = frame, p = pg) => { await focusDoc(f); await p.keyboard.press(k); await f.waitForTimeout(900); };
// right-click at a point and click a menu item by its caption
async function ctxMenu(pt, caption, f = frame, p = pg) {
  await p.mouse.move(pt.x, pt.y); await p.mouse.click(pt.x, pt.y, { button: "right" });
  let r = null;
  for (let i = 0; i < 10 && !(r && r.x); i++) {
    await f.waitForTimeout(400);
    r = await f.evaluate(cap => {
      const vis = [...document.querySelectorAll(".dropdown-menu a")].filter(e => e.offsetParent);
      const a = vis.find(e => e.textContent.replace(/\s+/g, " ").trim().startsWith(cap) && !e.closest(".disabled"));
      if (!a) return { seen: vis.map(e => e.textContent.trim()).filter(Boolean).slice(0, 12) };
      const b = a.getBoundingClientRect(); return { x: b.left + Math.min(20, b.width / 2), y: b.top + b.height / 2 };
    }, caption);
  }
  if (!r.x) { console.log(`   menu without ${caption}: ${JSON.stringify(r.seen)}`); return false; }
  const box = await (await f.frameElement()).boundingBox();
  await p.mouse.click(box.x + r.x, box.y + r.y); await f.waitForTimeout(1200);
  return true;
}
async function reopen() {
  const fname = await upload(FIX, `cellpaste-${process.pid}-${Date.now().toString(36)}.docx`);
  frame = await openEditor(page, { fileName: fname }); pg = page;
}
// the saved .docx: word/document.xml
async function savedXml(tag, f = frame, p = pg) {
  const dl = p.waitForEvent("download", { timeout: 60000 });
  await f.evaluate(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX)));
  const file = path.join(HERE, "results", `${tag}.docx`);
  await (await dl).saveAs(file); await f.waitForTimeout(300);
  return execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 << 20 }).toString();
}
// tables of the saved document.xml, each as a list of cells {text, tcPr}
const xmlTables = xml => (xml.match(/<w:tbl>.*?<\/w:tbl>/gs) || []).map(t => (t.match(/<w:tc>.*?<\/w:tc>/gs) || []).map(tc => ({ text: (tc.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, "")).join(""), tcPr: (tc.match(/<w:tcPr>.*?<\/w:tcPr>/s) || [""])[0] })));

// expected formatting of the source cells (fixture)
const READING = { text: "Reading", td: BTLR, va: VA_CENTER, shd: "9DC3E6", mar: [1, 2, 1, 2], brd: ["C00000", "C00000", "C00000", "C00000"], biu: [true, true, true] };
const WRITING = { text: "Writing", td: BTLR, va: VA_CENTER, shd: "A9D08E", biu: [true, true, true] };
const LISTENING = { text: "Listening", td: TBRL, va: VA_BOTTOM, shd: "FFE699" };
const MONDAY = { text: "Monday", td: BTLR, va: VA_CENTER, shd: "F4B183" };
const SPEAKING = { text: "Speaking", td: TBRL, va: VA_TOP, shd: "D9D2E9" };
const same = (got, exp) => {
  if (!got) return "missing cell";
  const bad = [];
  for (const k of Object.keys(exp)) {
    const g = got[k], e = exp[k];
    const ok = Array.isArray(e) ? Array.isArray(g) && e.length === g.length && e.every((v, i) => typeof v === "number" ? near(g[i], v) : g[i] === v) : g === e;
    if (!ok) bad.push(`${k}=${JSON.stringify(g)} (want ${JSON.stringify(e)})`);
  }
  return bad.length ? `${got.text}: ${bad.join(", ")}` : true;
};
const all = (...checks) => { const bad = checks.filter(c => c !== true); return bad.length ? bad.join(" | ") : true; };

// ---- 0. fixture ------------------------------------------------------------------------------------------------
await reopen();
{
  const s = await cells(SRC);
  record("fixture.source", all(same(s[0].cells[0], READING), same(s[0].cells[1], WRITING), same(s[0].cells[2], LISTENING), same(s[1].cells[0], MONDAY), same(s[1].cells[1], { ...SPEAKING, span: 2 }), s[0].h && s[0].h.rule === 2 && near(s[0].h.mm, 30, 0.2) ? true : "row 1 height " + JSON.stringify(s[0].h)));
  const k = await contentKinds();
  record("fixture.layout", k === "PTPTPP" || k, k);
}

// ---- 1. Ctrl+C / Ctrl+V of 1 cell, 2 cells, a row, merged cells into existing cells (Overwrite Cells) -----------
{
  // one cell, selected with the mouse, pasted into one selected target cell
  let sel = await dragCells(SRC, [0, 0], [0, 1]);
  record("select.drag2cells", sel === "0:0,0:1", sel);
  await selectCells(SRC, [[0, 0]]);
  await key("Control+c");
  await selectCells(TGT, [[0, 0]]);
  await key("Control+v");
  let t = await cells(TGT);
  record("overwrite.1cell", all(same(t[0].cells[0], READING), same(t[0].cells[0], { w: 30, span: 1 }), same(t[0].cells[1], { text: "t01", td: undefined, shd: null })), JSON.stringify(t[0].cells.slice(0, 2)));
  // undo brings the target cell back
  await frame.evaluate(() => Asc.editor.Undo()); await wait(500);
  t = await cells(TGT);
  record("overwrite.undo", same(t[0].cells[0], { text: "t00", td: undefined, va: undefined, shd: null, mar: null, brd: [] }), JSON.stringify(t[0].cells[0]));

  // the teacher's case: two rotated cells selected with the mouse, Ctrl+C, then Ctrl+V with the caret in a target cell
  sel = await dragCells(SRC, [0, 0], [0, 1]);
  await key("Control+c");
  await caretAt(TGT); await frame.evaluate(ti => { const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.Content[ti]; t.CurCell = t.GetRow(1).GetCell(1); d.CurPos.ContentPos = ti; t.Selection.Use = false; t.CurCell.Content.MoveCursorToStartPos(); d.UpdateSelection(); d.UpdateInterface(); }, TGT);
  await key("Control+v");
  t = await cells(TGT);
  record("overwrite.2cells.caret", all(same(t[1].cells[1], READING), same(t[1].cells[2], WRITING), same(t[1].cells[1], { w: 30 }), same(t[1].cells[0], { text: "t10", td: undefined }), same(t[1].cells[3], { text: "t13", td: undefined })), JSON.stringify(t[1].cells));

  // a whole row (exact height) into the first target row
  await reopen();
  sel = await dragCells(SRC, [0, 0], [0, 3]);
  record("select.dragRow", sel === "0:0,0:1,0:2,0:3", sel);
  await key("Control+c");
  await selectCells(TGT, [[0, 0], [0, 1], [0, 2], [0, 3]]);
  await key("Control+v");
  t = await cells(TGT);
  record("overwrite.row", all(same(t[0].cells[0], READING), same(t[0].cells[1], WRITING), same(t[0].cells[2], LISTENING), same(t[0].cells[3], { text: "Notes", td: undefined, shd: null }), t[0].cells.every(c => near(c.w, 30)) ? true : "widths " + t[0].cells.map(c => c.w)), JSON.stringify(t[0]));

  // merged cells (vertical merge Monday, horizontal merge Speaking) into the target: the target keeps its grid
  await reopen();
  await selectCells(SRC, [[1, 0], [1, 1], [2, 1], [2, 2]]);
  await key("Control+c");
  await selectCells(TGT, [[1, 0]]);
  await key("Control+v");
  t = await cells(TGT);
  record("overwrite.merged", all(same(t[1].cells[0], MONDAY), same(t[1].cells[1], SPEAKING), same(t[1].cells[0], { span: 1, vm: 1, w: 30 }), t.length === 3 && t.every(r => r.cells.length === 4) ? true : "target grid changed " + t.map(r => r.cells.length)), JSON.stringify(t.slice(1).map(r => r.cells.slice(0, 3))));

  // the saved file keeps the pasted cell formatting
  const xml = await savedXml("overwrite-merged");
  const tgtXml = xmlTables(xml)[1] || [];
  const mon = tgtXml.find(c => c.text === "Monday"), spk = tgtXml.find(c => c.text === "Speaking");
  record("overwrite.docx", !!mon && /w:textDirection w:val="btLr"/.test(mon.tcPr) && /w:fill="F4B183"/i.test(mon.tcPr) && /w:vAlign w:val="center"/.test(mon.tcPr) && !!spk && /w:textDirection w:val="tbRl"/.test(spk.tcPr) && /w:fill="D9D2E9"/i.test(spk.tcPr), `${mon && mon.tcPr} || ${spk && spk.tcPr}`);
}

// ---- 2. into an empty paragraph: a new table with the source cells -------------------------------------------
{
  await reopen();
  await dragCells(SRC, [0, 0], [0, 1]);
  await key("Control+c");
  await caretAt(EMPTY);
  await key("Control+v");
  let n = await cells(EMPTY);
  record("newtable.2cells", n ? all(same(n[0].cells[0], { ...READING, w: 15 }), same(n[0].cells[1], { ...WRITING, w: 15 }), n[0].h && n[0].h.rule === 2 && near(n[0].h.mm, 30, 0.2) ? true : "row height " + JSON.stringify(n[0].h)) : "no table pasted", JSON.stringify(n));
  // Paste Special > Keep Source Formatting gives the same table
  await frame.evaluate(() => Asc.editor.asc_SpecialPaste(Asc.c_oSpecialPasteProps.sourceformatting)); await wait(1200);
  n = await cells(EMPTY);
  record("newtable.pasteSpecial.source", n ? all(same(n[0].cells[0], READING), same(n[0].cells[1], WRITING)) : "no table", JSON.stringify(n && n[0]));

  // two rows with the merges: exact and at-least heights, vertical merge, horizontal merge
  await reopen();
  await selectCells(SRC, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2]]);
  await key("Control+c");
  await caretAt(EMPTY);
  await key("Control+v");
  n = await cells(EMPTY);
  record("newtable.rows", n ? all(same(n[0].cells[2], LISTENING), same(n[1].cells[0], MONDAY), same(n[1].cells[1], { ...SPEAKING, span: 2 }), n[0].h && n[0].h.rule === 2 && near(n[0].h.mm, 30, 0.2) ? true : "row 1 " + JSON.stringify(n[0].h), n[1].h && n[1].h.rule === 0 && near(n[1].h.mm, 20, 0.2) ? true : "row 2 " + JSON.stringify(n[1].h)) : "no table", JSON.stringify(n));
  const xml = await savedXml("newtable-rows");
  const tb = xmlTables(xml)[2] || [];
  const rd = tb.find(c => c.text === "Reading");
  record("newtable.docx", !!rd && /w:textDirection w:val="btLr"/.test(rd.tcPr) && /w:fill="9DC3E6"/i.test(rd.tcPr) && /w:vAlign w:val="center"/.test(rd.tcPr) && /<w:trHeight w:val="1701" w:hRule="exact"\/>/.test(xml.split("<w:tbl>")[3] || ""), rd ? rd.tcPr : "no Reading cell in the third table");
}

// ---- 3. right-click menu Copy and Paste ------------------------------------------------------------------------
{
  await reopen();
  await dragCells(SRC, [0, 0], [0, 1]);
  const copied = await ctxMenu(await cellPoint(SRC, 0, 1), "Copy");
  await selectCells(TGT, [[2, 0]]);
  const pasted = await ctxMenu(await cellPoint(TGT, 2, 0), "Paste");
  const t = await cells(TGT);
  record("ctxmenu.overwrite", copied && pasted ? all(same(t[2].cells[0], READING), same(t[2].cells[1], WRITING)) : `menu items: copy=${copied} paste=${pasted}`, JSON.stringify(t[2].cells.slice(0, 2)));
  await caretAt(EMPTY); await pg.keyboard.press("Escape"); await wait(300);
  const pasted2 = await ctxMenu(await paraPoint(EMPTY), "Paste");
  const n = await cells(EMPTY);
  record("ctxmenu.newtable", pasted2 && n ? all(same(n[0].cells[0], READING), same(n[0].cells[1], WRITING)) : `paste=${pasted2} table=${!!n}`, JSON.stringify(n && n[0]));
}

// ---- 4. Paste Special into cells: Overwrite Cells and Nest Table ------------------------------------------------
{
  await reopen();
  await selectCells(SRC, [[0, 2]]);
  await key("Control+c");
  await selectCells(TGT, [[0, 3]]);
  await key("Control+v");
  await frame.evaluate(() => Asc.editor.asc_SpecialPaste(Asc.c_oSpecialPasteProps.overwriteCells)); await wait(1200);
  let t = await cells(TGT);
  record("pasteSpecial.overwrite", same(t[0].cells[3], LISTENING), JSON.stringify(t[0].cells[3]));
  await frame.evaluate(() => Asc.editor.asc_SpecialPaste(Asc.c_oSpecialPasteProps.insertAsNestedTable)); await wait(1200);
  const nested = await frame.evaluate(ti => { const c = Asc.editor.WordControl.m_oLogicDocument.Content[ti].GetRow(0).GetCell(3); const nt = c.Content.Content.find(e => e.IsTable()); if (!nt) return null; const p = nt.GetRow(0).GetCell(0).Pr; return { td: p.TextDirection, va: p.VAlign, shd: !!p.Shd, outer: c.Pr.TextDirection }; }, TGT);
  record("pasteSpecial.nested", !!nested && nested.td === TBRL && nested.va === VA_BOTTOM && nested.shd && nested.outer === undefined, JSON.stringify(nested));
}

// ---- 5. into another document ------------------------------------------------------------------------------------
{
  await reopen();
  await dragCells(SRC, [0, 0], [0, 1]);
  await key("Control+c");
  const page2 = await page.context().newPage();
  const f2 = await openEditor(page2, {});
  await key("Control+v", f2, page2);
  const ti = await f2.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.findIndex(e => e.IsTable()));
  const n = ti >= 0 ? await cells(ti, f2) : null;
  record("otherdoc.newtable", n ? all(same(n[0].cells[0], READING), same(n[0].cells[1], WRITING)) : "no table pasted", JSON.stringify(n && n[0]));
  await page2.close();
}

// ---- 6. HTML clipboard (other applications): writes and reads the text direction ---------------------------------
{
  await reopen();
  await selectCells(SRC, [[0, 0], [0, 1], [0, 2]]);
  await key("Control+c");
  const clip = await page.evaluate(async () => { const it = await navigator.clipboard.read(); return await (await it[0].getType("text/html")).text(); }).catch(e => "ERR " + e);
  const tds = clip.match(/<td[^>]*>/g) || [];
  const tr = (clip.match(/<tr[^>]*>/) || [""])[0];
  record("html.write", /mso-height-rule:exactly/.test(tr) && tds.length === 3 && /mso-layout-flow-alt:bottom-to-top/.test(tds[0]) && /writing-mode:sideways-lr/.test(tds[0]) && /vertical-align:middle/.test(tds[0]) && /layout-flow:vertical/.test(tds[2]) && /writing-mode:vertical-rl/.test(tds[2]) && /vertical-align:bottom/.test(tds[2]), tds.join(" ").slice(0, 600));
  // the same HTML without the editor's binary data, as another application would give it
  const html = clip.replace(/(class|data-[a-z-]+)="(docData|xslData|pptData|pdfData);[^"]*"/g, "").replace(/docData;[A-Za-z0-9+/=;]+/g, "");
  await caretAt(EMPTY); await focusDoc(frame);
  await frame.evaluate(h => AscCommon.g_clipboardBase.CommonIframe_PasteStart(h, "Reading\tWriting\tListening"), html); await wait(1500);
  let n = await cells(EMPTY);
  record("html.read.own", n ? all(same(n[0].cells[0], { text: "Reading", td: BTLR, va: VA_CENTER, shd: "9DC3E6" }), same(n[0].cells[2], { text: "Listening", td: TBRL, va: VA_BOTTOM }), n[0].h && n[0].h.rule === 2 && near(n[0].h.mm, 30, 0.2) ? true : "row height " + JSON.stringify(n[0].h)) : "no table pasted", JSON.stringify(n && n[0]));
  // Word's HTML for rotated cells (layout-flow / mso-layout-flow-alt)
  await reopen();
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><body><table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style="border-collapse:collapse"><tr style="height:85.05pt;mso-height-rule:exactly">` +
    `<td width=57 style="width:42.5pt;background:#9DC3E6;padding:0cm 5.4pt 0cm 5.4pt;height:85.05pt;layout-flow:vertical;mso-layout-flow-alt:bottom-to-top" valign=middle><p class=MsoNormal><b><i><u>Reading</u></i></b></p></td>` +
    `<td width=57 style="width:42.5pt;background:#FFE699;padding:0cm 5.4pt 0cm 5.4pt;height:85.05pt;layout-flow:vertical" valign=bottom><p class=MsoNormal>Listening</p></td>` +
    `<td width=57 style="width:42.5pt;padding:0cm 5.4pt 0cm 5.4pt;height:85.05pt"><p class=MsoNormal>Notes</p></td></tr></table></body></html>`;
  await caretAt(EMPTY); await focusDoc(frame);
  await frame.evaluate(h => AscCommon.g_clipboardBase.CommonIframe_PasteStart(h, "Reading\tListening\tNotes"), word); await wait(1500);
  n = await cells(EMPTY);
  record("html.read.word", n ? all(same(n[0].cells[0], { text: "Reading", td: BTLR, shd: "9DC3E6" }), same(n[0].cells[1], { text: "Listening", td: TBRL, va: VA_BOTTOM }), same(n[0].cells[2], { text: "Notes", td: undefined }), n[0].h && n[0].h.rule === 2 && near(n[0].h.mm, 30, 0.2) ? true : "row height " + JSON.stringify(n[0].h)) : "no table pasted", JSON.stringify(n && n[0]));
}

const errs = errors.filter(e => !/Failed to load resource/.test(e.text));
record("no.errors", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
await browser.close();
const pass = results.filter(r => r.status === "pass").length;
fs.writeFileSync(outFile, JSON.stringify({ base: process.env.EO_BASE, date: new Date().toISOString(), pass, total: results.length, results }, null, 1));
console.log(`${pass}/${results.length} pass -> ${outFile}`);
process.exit(pass === results.length ? 0 : 1);
