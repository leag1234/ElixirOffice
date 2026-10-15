#!/usr/bin/env node
// F10 (docs/backlog.md): Table Design > Shading recolours the whole cell, text area included.
// The fixture repeats the pale cell colour as direct paragraph and/or run shading of the cell text
// (as LibreOffice-saved or converted files do). Changing the cell colour from the Table Design tab
// must remove those duplicates in the same action (one undo step) and keep any other shading.
//   node tests/tableshade/tableshade.mjs [--out results.json]      (EO_BASE=http://host:port)
// Fixture: tests/fixtures/docx/coloured-cells.docx (python3 tests/fixtures/docx/make_shading_fixtures.py).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, openEditor, focusDoc } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "fixtures", "docx", "coloured-cells.docx");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "tableshade-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
let frame;
const wait = ms => frame.waitForTimeout(ms);
const PALE = "255,242,204", ORANGE = "255,192,0", BLUE = "221,235,247", THEME = "230,224,236";
const ROWS = ["para", "run", "both", "highlight", "other", "theme", "auto", "plain"];

// shading of the coloured cell of each row: cell fill, paragraph shading, run shading (text runs only)
const state = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  const th = d.GetTheme(), cm = d.Get_ColorMap();
  const col = s => { if (!s || s.IsNil()) return "nil"; const c = s.GetSimpleColor(th, cm); return c.Auto ? "auto" : [c.r, c.g, c.b].join(","); };
  const out = {};
  t.Content.forEach(row => {
    const cell = row.Get_Cell(1);
    const paras = cell.Content.Content.filter(p => p.IsParagraph());
    const runs = []; paras.forEach(p => p.CheckRunContent(r => { if (r.GetText().trim()) runs.push(col(r.Pr.Shd) + (r.Pr.HighLight && r.Pr.HighLight !== -1 ? "/hl" : "")); }));
    out[row.Get_Cell(0).Content.Content[0].GetText().trim()] = { cell: col(cell.Get_Shd()), paras: [...new Set(paras.map(p => col(p.Pr.Shd)))].join("|"), runs: [...new Set(runs)].join("|") };
  });
  return out;
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// caret in the coloured cell of a row (first paragraph, offset)
const caretInCell = (row, off = 0) => frame.evaluate(([row, off]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  const p = t.Content[row].Get_Cell(1).Content.Content[0];
  d.RemoveSelection();
  p.Document_SetThisElementCurrent(false);
  p.MoveCursorToStartPos(false);
  for (let i = 0; i < off; i++) d.MoveCursorRight(false, false);
  d.UpdateSelection(); d.UpdateInterface();
}, [row, off]);
const selection = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  const t = d.Content.find(e => e.IsTable());
  return { cells: t.IsCellSelection() ? t.GetSelectionArray().map(p => p.Row + ":" + p.Cell) : [], text: d.GetSelectedText(false) };
});
// the Table Design > Shading colour picker of the ribbon
const tableDesignShading = async color => {
  await frame.evaluate(c => { const v = DE.getController("ContextTabs").view; v.btnShading.trigger("color:select", v.btnShading, c); }, color);
  await wait(500);
};
const undo = async () => { await frame.evaluate(() => Asc.editor.Undo()); await wait(400); };
async function savedDocumentXml(tag) {
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await frame.evaluate(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX)));
  const file = path.join(HERE, "results", `${tag}.docx`);
  await (await dl).saveAs(file);
  return execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 << 20 }).toString();
}
// the <w:tc> of the coloured cell of a row in the saved XML
const savedCell = (xml, label) => {
  const rows = xml.match(/<w:tr\b(?:(?!<\/w:tr>).)*<\/w:tr>/gs) || [];
  const row = rows.find(r => new RegExp(`<w:t[^>]*>${label}</w:t>`).test(r)) || "";
  return (row.match(/<w:tc>(?:(?!<\/w:tc>).)*<\/w:tc>/gs) || [])[1] || "";
};

const fname = await upload(FIX, `tableshade-${process.pid}-${Date.now().toString(36)}.docx`);
frame = await openEditor(page, { fileName: fname });
await focusDoc(frame);

// ---- import: the duplicates are read as written, nothing spurious ------------------------------------------------
const s0 = await state();
record("import.para", same(s0.para, { cell: PALE, paras: PALE, runs: "nil" }), JSON.stringify(s0.para));
record("import.run", same(s0.run, { cell: PALE, paras: "nil", runs: PALE }), JSON.stringify(s0.run));
record("import.both", same(s0.both, { cell: PALE, paras: PALE, runs: PALE }), JSON.stringify(s0.both));
record("import.highlight", same(s0.highlight, { cell: PALE, paras: "nil", runs: "nil/hl" }), JSON.stringify(s0.highlight));
record("import.other", same(s0.other, { cell: PALE, paras: BLUE, runs: "nil" }), JSON.stringify(s0.other));
record("import.theme", same(s0.theme, { cell: THEME, paras: THEME, runs: THEME }), JSON.stringify(s0.theme));
record("import.autoFill", same(s0.auto, { cell: PALE, paras: "auto", runs: "nil" }), JSON.stringify(s0.auto));
record("import.plain", same(s0.plain, { cell: PALE, paras: "nil", runs: "nil" }), JSON.stringify(s0.plain));

// ---- 1. cursor in the cell -------------------------------------------------------------------------------------------
await caretInCell(0, 3);
await tableDesignShading("FFC000");
let s = await state();
record("cursor.cellAndText", same(s.para, { cell: ORANGE, paras: "nil", runs: "nil" }), JSON.stringify(s.para));
record("cursor.otherCellsUntouched", ROWS.slice(1).every(r => same(s[r], s0[r])), JSON.stringify(s));
await undo();
s = await state();
record("cursor.oneUndo", same(s, s0), JSON.stringify(s.para));

// ---- 2. text selected inside the cell: the cell is coloured (Word), the duplicates go ---------------------------------
await caretInCell(1, 0);
await page.keyboard.press("Shift+End"); await wait(200);
const sel2 = await selection();
record("textSel.selection", sel2.cells.length === 0 && sel2.text.startsWith("First line"), JSON.stringify(sel2));
await tableDesignShading("FFC000");
s = await state();
record("textSel.cellAndText", same(s.run, { cell: ORANGE, paras: "nil", runs: "nil" }), JSON.stringify(s.run));
await undo();
record("textSel.oneUndo", same(await state(), s0), "");

// ---- 3. whole cell selected -------------------------------------------------------------------------------------------
await caretInCell(2, 0);
await frame.evaluate(() => { Asc.editor.WordControl.m_oLogicDocument.SelectTable(0 /* c_oAscTableSelectionType.Cell */); Asc.editor.WordControl.m_oLogicDocument.UpdateSelection(); Asc.editor.WordControl.m_oLogicDocument.UpdateInterface(); });
await wait(200);
const sel3 = await selection();
record("cellSel.selection", same(sel3.cells, ["2:1"]), JSON.stringify(sel3));
await tableDesignShading("FFC000");
s = await state();
record("cellSel.cellAndText", same(s.both, { cell: ORANGE, paras: "nil", runs: "nil" }), JSON.stringify(s.both));
await undo();
record("cellSel.oneUndo", same(await state(), s0), "");

// ---- 4. several cells: duplicates go, highlight / other colours / auto stay -----------------------------------------
await caretInCell(3, 0);
for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowDown");
await wait(300);
const sel4 = await selection();
record("multiSel.selection", ["3:1", "4:1", "5:1", "6:1", "7:1"].every(c => sel4.cells.includes(c)) && !sel4.cells.some(c => c.endsWith(":0")), JSON.stringify(sel4));
await tableDesignShading("FFC000");
s = await state();
record("multiSel.allCellsOrange", ["highlight", "other", "theme", "auto", "plain"].every(r => s[r].cell === ORANGE), JSON.stringify(s));
record("multiSel.highlightKept", same(s.highlight, { cell: ORANGE, paras: "nil", runs: "nil/hl" }), JSON.stringify(s.highlight));
record("multiSel.otherColourKept", same(s.other, { cell: ORANGE, paras: BLUE, runs: "nil" }), JSON.stringify(s.other));
record("multiSel.themeDuplicateCleared", same(s.theme, { cell: ORANGE, paras: "nil", runs: "nil" }), JSON.stringify(s.theme));
record("multiSel.autoKept", same(s.auto, { cell: ORANGE, paras: "auto", runs: "nil" }), JSON.stringify(s.auto));
record("multiSel.firstRowsUntouched", ["para", "run", "both"].every(r => same(s[r], s0[r])), "");

// ---- saved .docx -------------------------------------------------------------------------------------------------------
const xml = await savedDocumentXml("f10-multi");
const tcShd = c => (c.match(/<w:tcPr>(?:(?!<\/w:tcPr>).)*<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/s) || [])[1];
const textShd = c => (c.replace(/<w:tcPr>(?:(?!<\/w:tcPr>).)*<\/w:tcPr>/s, "").match(/<w:shd [^>]*w:fill="([0-9A-Fa-f]{6}|auto)"/g) || []).map(x => x.match(/w:fill="([^"]+)"/)[1].toUpperCase());
const cells = Object.fromEntries(ROWS.map(r => [r, savedCell(xml, r)]));
record("docx.cellsOrange", ["highlight", "other", "theme", "auto", "plain"].every(r => (tcShd(cells[r]) || "").toUpperCase() === "FFC000"), JSON.stringify(ROWS.map(r => tcShd(cells[r]))));
record("docx.noPaleTextShading", ["highlight", "theme", "plain"].every(r => !textShd(cells[r]).includes("FFF2CC")), JSON.stringify(textShd(cells.theme)));
record("docx.otherColourKept", textShd(cells.other).includes("DDEBF7"), JSON.stringify(textShd(cells.other)));
record("docx.highlightKept", /<w:highlight w:val="yellow"\s*\/>/.test(cells.highlight), cells.highlight.slice(0, 300));
record("docx.untouchedRowsKeepTheirShading", textShd(cells.para).includes("FFF2CC") && (tcShd(cells.para) || "").toUpperCase() === "FFF2CC", JSON.stringify(textShd(cells.para)));

await undo();
record("multiSel.oneUndo", same(await state(), s0), JSON.stringify(await state()));

// ---- No color from Table Design: the cell and its duplicated text shading are both cleared -------------------------
await caretInCell(0, 0);
await tableDesignShading("transparent");
s = await state();
record("noColor.cellAndText", same(s.para, { cell: "nil", paras: "nil", runs: "nil" }), JSON.stringify(s.para));
await undo();

// ---- Home > Shading keeps its upstream routing: cursor in a cell shades the current paragraph only --------------------------------
await caretInCell(7, 0);
await frame.evaluate(() => { const c = new Asc.asc_CColor(); c.put_r(0xFF); c.put_g(0xC0); c.put_b(0); Asc.editor.put_ParagraphShade(true, c); });
await wait(400);
s = await state();
record("homeShading.paragraph", same(s.plain, { cell: PALE, paras: ORANGE + "|nil", runs: "nil" }), JSON.stringify(s.plain));
await undo();

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("noPageErrors", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
const pass = results.filter(r => r.status === "pass").length;
console.log(`results: ${pass}/${results.length} pass`);
fs.writeFileSync(outFile, JSON.stringify({ base: process.env.EO_BASE, pass, total: results.length, results }, null, 1));
await browser.close();
process.exit(pass === results.length ? 0 : 1);
