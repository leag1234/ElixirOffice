#!/usr/bin/env node
// Word layout regressions reported on an observation grid (docs/backlog.md F8, F9):
//   F8  grouping anchored shapes inside a table cell keeps the group in the cell (group, ungroup, undo, .docx)
//   F9  page break before a heading that follows a table: one break paragraph, Backspace removes it and
//       the heading keeps its style (.docx round trip)
//   node tests/layout/layout.mjs [--out results.json]      (EO_BASE=http://host:port)
// Fixture: tests/fixtures/docx/observation-grid.docx (python3 tests/fixtures/docx/make_fixtures.py).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, focusDoc, BASE, waitFrame } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "fixtures", "docx", "observation-grid.docx");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "layout-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
let frame;
const wait = ms => frame.waitForTimeout(ms);

// ---- helpers -------------------------------------------------------------------------------------------------
// anchored drawings of the document: position on the page, anchor paragraph, in a cell or not
const drawings = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  return d.GetAllDrawingObjects().map(pd => ({ id: pd.Id, x: +pd.X.toFixed(2), y: +pd.Y.toFixed(2), w: +pd.GraphicObj.extX.toFixed(2), h: +pd.GraphicObj.extY.toFixed(2), page: pd.PageNum, inCell: pd.isTableCellChild(false), group: pd.GraphicObj.getObjectType() === AscDFH.historyitem_type_GroupShape, para: pd.Get_ParentParagraph().Id }));
});
// top-level elements: text, style, page breaks, page segments, cursor
const outline = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  return d.Content.map((e, i) => {
    if (e.IsTable()) return { i, table: true, page: e.GetAbsoluteStartPage() };
    const segs = e.Pages.map((pg, k) => pg.EndLine < pg.StartLine ? null : { page: e.GetAbsolutePage(k), top: +pg.Bounds.Top.toFixed(1) }).filter(Boolean);
    let pb = 0; e.CheckRunContent(r => r.Content.forEach(it => { if (it.IsBreak && it.IsBreak() && it.IsPageBreak()) pb++; }));
    const st = d.Styles.Get(e.Pr.PStyle);
    return { i, text: e.GetText().replace(/[\r\n]+$/, ""), style: st ? st.Name : "Normal", pb, segs, cur: i === d.CurPos.ContentPos };
  });
});
const imgApply = props => frame.evaluate(p => { const o = new Asc.asc_CImgProperty(); Object.assign(o, p); Asc.editor.ImgApply(o); }, props);
const undo = async () => { await frame.evaluate(() => Asc.editor.Undo()); await wait(400); };
// the document as saved to .docx: word/document.xml of a DOCX export
async function savedDocumentXml(tag) {
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await frame.evaluate(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX)));
  const file = path.join(HERE, "results", `${tag}.docx`);
  await (await dl).saveAs(file);
  await wait(300);
  return execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 << 20 }).toString();
}
// styleId of a named style in the saved file (the ids are renumbered on export)
const savedStyleId = (tag, name) => (execFileSync("unzip", ["-p", path.join(HERE, "results", `${tag}.docx`), "word/styles.xml"], { maxBuffer: 64 << 20 }).toString()
  .match(new RegExp(`<w:style\\b[^>]*w:styleId="([^"]+)"[^>]*>\\s*<w:name w:val="${name}"`, "i")) || [])[1];

// ---- F8: group shapes in a table cell ------------------------------------------------------------------------
{
  const fname = await upload(FIX, `layout-${process.pid}-${Date.now().toString(36)}.docx`);
  frame = await openEditor(page, { fileName: fname });
  const before = (await drawings()).slice(0, 4);
  record("f8.fixture", before.length === 4 && before.every(s => s.inCell && s.page === 0 && !s.group), JSON.stringify(before));
  const box = { x: Math.min(...before.map(s => s.x)), y: Math.min(...before.map(s => s.y)), r: Math.max(...before.map(s => s.x + s.w)), b: Math.max(...before.map(s => s.y + s.h)) };
  const selected = await frame.evaluate(ids => {
    const d = Asc.editor.WordControl.m_oLogicDocument; const all = d.GetAllDrawingObjects().filter(pd => ids.includes(pd.Id));
    d.RemoveSelection(); d.Select_DrawingObject(all[0].Id);
    for (const pd of all.slice(1)) d.DrawingObjects.selectObject(pd.GraphicObj, pd.PageNum);
    d.UpdateSelection(); d.UpdateInterface(); return [d.DrawingObjects.selectedObjects.length, d.CanGroup()];
  }, before.map(s => s.id));
  record("f8.select4", selected[0] === 4 && selected[1] === true, JSON.stringify(selected));
  await imgApply({ Group: 1 }); await wait(600);
  let now = await drawings();
  const g = now.find(s => s.group);
  record("f8.group.inCell", !!g && g.inCell && g.page === 0 && g.para === before[0].para, JSON.stringify(g));
  record("f8.group.samePlace", !!g && near(g.x, box.x) && near(g.y, box.y) && near(g.w, box.r - box.x) && near(g.h, box.b - box.y), `${JSON.stringify(g)} vs ${JSON.stringify(box)}`);
  // saved file: the group is a wpg:wgp anchored in a table cell, the other shapes are untouched
  const xml = await savedDocumentXml("f8-grouped");
  const cellWithGroup = /<w:tc>(?:(?!<\/w:tc>).)*<wpg:wgp/s.test(xml);
  record("f8.docx.groupInCell", cellWithGroup && (xml.match(/<wpg:wgp/g) || []).length === 1, `groups=${(xml.match(/<wpg:wgp/g) || []).length} inCell=${cellWithGroup}`);
  // ungroup: the four shapes come back where they were, still in the cell
  await imgApply({ Group: -1 }); await wait(600);
  now = (await drawings()).filter(s => !s.group).slice(0, 4);
  const back = now.length === 4 && now.every(s => s.inCell && s.page === 0 && s.para === before[0].para) && before.every(b => now.some(s => near(s.x, b.x) && near(s.y, b.y) && near(s.w, b.w)));
  record("f8.ungroup.samePlace", back, JSON.stringify(now));
  await undo();
  now = await drawings(); const g2 = now.find(s => s.group);
  record("f8.undo.ungroup", !!g2 && g2.inCell && near(g2.x, box.x) && near(g2.y, box.y), JSON.stringify(g2));
  await undo();
  now = (await drawings()).slice(0, 4);
  record("f8.undo.group", now.every(s => !s.group && s.inCell) && before.every(b => now.some(s => near(s.x, b.x) && near(s.y, b.y))), JSON.stringify(now));
}

// ---- F9: page break before a heading after a table -------------------------------------------------------------
{
  frame = await openEditor(page);
  const doc = [
    { text: "8. Closing of the lesson", style: "Heading 1" },
    { table: [["Criterion", "Observed"], ["Objectives", "yes"], ["Timing", "no"]] },
    { text: "9. Professional posture", style: "Heading 1" },
    { table: [["Criterion", "Observed"], ["Attitude", "yes"]] },
    { text: "End of the grid." },
  ];
  const dropEmpty = () => frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.StartAction(0); for (let i = d.Content.length - 2; i >= 0; i--) { const e = d.Content[i]; if (e.IsParagraph() && e.IsEmpty()) d.Internal_Content_Remove(i, 1); } d.Recalculate(); d.FinalizeAction(); });
  const heading = o => o.find(e => e.text && e.text.includes("9. Professional"));
  for (const empties of [true, false]) {
    const tag = empties ? "gap" : "tight";
    const H = empties ? 3 : 2;
    const reset = async () => { await setDoc(frame, doc); await wait(300); if (!empties) { await dropEmpty(); await wait(200); } await caret(frame, H, 0); await wait(200); };
    // Ctrl+Enter at the start of the heading: one break paragraph before it, the heading alone at the top of page 2
    await reset();
    const n0 = (await outline()).length;
    await page.keyboard.press("Control+Enter"); await wait(500);
    let o = await outline(); let h = heading(o);
    record(`f9.${tag}.ctrlEnter`, o.length === n0 + 1 && o[H].pb === 1 && o[H].text === "" && h.i === H + 1 && h.style === "Heading 1" && h.segs[0].page === 1 && near(h.segs[0].top, 20, 1) && h.cur, JSON.stringify(o.slice(H, H + 2)));
    // Backspace merges the heading with the break paragraph: still on page 2, style kept; a second Backspace removes the break
    await page.keyboard.press("Backspace"); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.backspace1`, o.length === n0 && h.i === H && h.pb === 1 && h.style === "Heading 1" && h.segs.some(s => s.page === 1), JSON.stringify(h));
    await page.keyboard.press("Backspace"); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.backspace2`, o.length === n0 && h.i === H && h.pb === 0 && h.style === "Heading 1" && h.segs.every(s => s.page === 0), JSON.stringify(h));
    // Delete at the end of the break paragraph does the same
    await reset(); await page.keyboard.press("Control+Enter"); await wait(400); await caret(frame, H, -1); await page.keyboard.press("Delete"); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.delete`, o.length === n0 && h.i === H && h.pb === 1 && h.style === "Heading 1", JSON.stringify(h));
    // .docx round trip of the merged paragraph: Heading1 with an inline page break
    if (!empties) {
      const xml = await savedDocumentXml("f9-merged");
      const sid = savedStyleId("f9-merged", "heading 1");
      const para = (xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*9\. Professional posture(?:(?!<\/w:p>).)*<\/w:p>/s) || [""])[0];
      const brInPara = /<w:br w:type="page"[^>]*\/>/.test(para);
      const emptyBreakParaBefore = /<w:p\b[^>]*>(?:(?!<\/w:p>).)*<w:br w:type="page"[^>]*\/>(?:(?!<\/w:p>).)*<\/w:p>\s*<w:p\b[^>]*>(?:(?!<\/w:p>).)*9\. Professional/s.test(xml);
      record("f9.docx.headingWithBreak", !!sid && new RegExp(`w:pStyle w:val="${sid}"`).test(para) && brInPara && !emptyBreakParaBefore, `styleId=${sid} ${para.slice(0, 200)}`);
    }
    // "Page break before" on the heading: no extra paragraph
    await reset();
    await frame.evaluate(h => { const d = Asc.editor.WordControl.m_oLogicDocument; d.StartAction(0); d.Content[h].Set_PageBreakBefore(true); d.Recalculate(); d.FinalizeAction(); }, H); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.breakBefore`, o.length === n0 && h.i === H && h.segs[0].page === 1 && near(h.segs[0].top, 20, 1), JSON.stringify(h));
    // Enter x2 at the start of the heading then Ctrl+Enter: the empty paragraphs are ordinary ones (deletable), one break paragraph
    await reset();
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await page.keyboard.press("Control+Enter"); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.enterEnterCtrlEnter`, o.length === n0 + 3 && h.i === H + 3 && h.style === "Heading 1" && h.segs[0].page === 1 && o[H + 2].pb === 1 && o.filter(e => e.pb).length === 1, JSON.stringify(o.slice(H, H + 4)));
    await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await wait(500);
    o = await outline(); h = heading(o);
    record(`f9.${tag}.backspaceAll`, o.length === n0 && h.i === H && h.pb === 0 && h.style === "Heading 1" && h.segs[0].page === 0, JSON.stringify(h));
  }
}

const bad = errors.filter(e => !/404/.test(e.text));
record("console.clean", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
await browser.close();
const failed = results.filter(r => r.status !== "pass").length;
fs.writeFileSync(outFile, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 1));
console.log(`\n${results.length - failed}/${results.length} pass -> ${outFile}`);
process.exit(failed ? 1 : 0);
