#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Right-click menus of the Word editor: open every context menu, click every item (and
// submenu items) from a fresh menu, record errors, popups and effects.
//   node tests/ctxmenu/sweep-word.mjs [--only id1,id2] [--out file.json] [--max-sub N]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, select, cmd, resetUi, focusDoc } from "../shortcuts/lib.mjs";
import { sigSource, sweepContext, summarize } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const only = opt("only") ? opt("only").split(",") : null;
const outFile = opt("out", path.join(HERE, "results", "word-latest.json"));
const { default: fs } = await import("node:fs");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const fb = await (await frame.frameElement()).boundingBox();

// screen point of a document position (page mm) or of the caret
const mmPt = (x, y, pg = 0) => frame.evaluate(([x, y, pg, fx, fy]) => {
  const c = Asc.editor.WordControl.m_oLogicDocument.DrawingDocument.ConvertCoordsToCursorWR(x, y, pg);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
  return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y };
}, [x, y, pg, fb.x, fb.y]);
const caretPt = (dx = 0, dy = 6) => frame.evaluate(([fx, fy, dx, dy]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument; d.Document_UpdateSelectionState();
  const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
  return { x: fx + sdk.left + c.X + dx, y: fy + sdk.top + c.Y + dy };
}, [fb.x, fb.y, dx, dy]);
const drawingPt = () => frame.evaluate(([fx, fy]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument; const g = d.DrawingObjects.drawingObjects[0];
  const c = d.DrawingDocument.ConvertCoordsToCursorWR(g.X + g.Extent.W / 2, g.Y + g.Extent.H / 2, g.PageNum);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect(); return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y };
}, [fb.x, fb.y]);

// wait until the engine has underlined something (it answers later on a loaded machine)
const spelled = () => frame.waitForFunction(() => Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().some(p => p.SpellChecker.GetErrorsCount() > 0), null, { timeout: 15000 }).then(() => frame.waitForTimeout(300)).catch(() => {});
// Text put by the builder is only checked by the engine once it is edited (and a paragraph whose text the builder replaced
// stops being checked after a few rounds): the document is rebuilt for each opening and a character is retyped as a user would.
async function misspelled(id, spec, text, paraSrc, apiSrc, rebuild, off, words) {
  await frame.evaluate(words => { try { Asc.editor.asc_spellCheckClearDictionary(); const w = Asc.editor.WordControl.m_oLogicDocument.Spelling.Words; words.forEach(x => { delete w[x]; delete w[x.charAt(0).toUpperCase() + x.slice(1)]; }); } catch (e) {} }, words);
  await setDoc(frame, spec);
  await frame.evaluate(`(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = ${paraSrc}; d.RemoveSelection(); p.Document_SetThisElementCurrent(false); p.MoveCursorToEndPos(); d.Document_UpdateSelectionState(); })()`); await focusDoc(frame);
  await page.keyboard.type("x"); await page.keyboard.press("Backspace");
  await frame.evaluate(`(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = ${paraSrc}; p.MoveCursorToStartPos(); for (let i = 0; i < ${off}; i++) p.MoveCursorRight(false, false); d.Document_UpdateSelectionState(); })()`);
  await focusDoc(frame); await spelled();
  // still nothing underlined: edit again (the engine answers late or lost the request on a loaded machine)
  for (let i = 0; i < 2; i++) {
    if (await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().some(p => p.SpellChecker.GetErrorsCount() > 0))) break;
    await page.keyboard.type("x"); await page.keyboard.press("Backspace"); await spelled();
  }
}
// the items of the Language sub-menu are built when it opens (not in the DOM when the menu is listed): tests/spell/spell.mjs clicks them
const dynamicLanguage = k => /^Language > /.test(k);
// the menu is complete once the suggestions have arrived (no "Loading variants...") or the engine has none
const spellReady = texts => texts.includes("Ignore All") && !texts.includes("Loading variants...");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TEXT = ["The quick brown fox jumps over the lazy dog.", "Second paragraph of the sample."];

const scenarios = [
  { id: "text-plain", setup: () => setDoc(frame, TEXT).then(() => caret(frame, 0, 6)), target: () => caretPt() },
  { id: "text-selected", setup: () => setDoc(frame, TEXT).then(() => select(frame, 0, 4, 9)), target: () => caretPt() },
  { id: "text-selected-multi", setup: () => setDoc(frame, TEXT).then(() => frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); d.UpdateInterface && d.UpdateInterface(); })), target: () => caretPt(-20, 0) },
  // a word accepted by "Ignore All" / "Add to Dictionary" stays accepted: forget it before each scenario
  { id: "misspelled", setup: () => misspelled("misspelled", ["This sentense has a mistake."], "This sentense has a mistake.", "d.Content[0]", "Api.GetDocument().GetElement(0)", false, 8, ["sentense"]), target: () => caretPt(), waitFor: spellReady, skip: dynamicLanguage },
  { id: "misspelled-no-suggestion", setup: () => misspelled("misspelled-no-suggestion", ["Try qzxwvkjh now."], "Try qzxwvkjh now.", "d.Content[0]", "Api.GetDocument().GetElement(0)", false, 6, ["qzxwvkjh"]), target: () => caretPt(), waitFor: spellReady, skip: dynamicLanguage },
  { id: "misspelled-table", setup: () => misspelled("misspelled-table", ["before", { table: [["a sentense", "b"], ["c", "d"]] }, "after"], "a sentense", "d.Content[1].Content[0].Content[0].Content.Content[0]", "Api.GetDocument().GetElement(1).GetCell(0, 0).GetContent().GetElement(0)", true, 6, ["sentense"]), target: () => caretPt(), waitFor: spellReady, skip: dynamicLanguage },
  { id: "table-cell", setup: async () => { await setDoc(frame, ["before", { table: [["a1", "b1"], ["a2", "b2"]] }, "after"]); await cmd(frame, `(function(){ var t = Api.GetDocument().GetElement(1); t.GetCell(0,0).GetContent().GetElement(0).GetRange().Select(); return 1; })()`); await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorLeft(false, false); d.Document_UpdateSelectionState(); }); await focusDoc(frame); }, target: () => caretPt(4, 6) },
  { id: "table-selected-cells", setup: async () => { await setDoc(frame, ["before", { table: [["a1", "b1"], ["a2", "b2"]] }, "after"]); await cmd(frame, `(function(){ var t = Api.GetDocument().GetElement(1); t.GetCell(0,0).GetContent().GetElement(0).GetRange().Select(); return 1; })()`); await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorLeft(false, false); d.MoveCursorRight(true, false); d.MoveCursorRight(true, false); d.MoveCursorRight(true, false); d.Document_UpdateSelectionState(); }); await focusDoc(frame); }, target: () => caretPt(4, 6) },
  { id: "picture", setup: async () => { await setDoc(frame, ["Picture:", "after"]); await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(0); p.AddDrawing(Api.CreateImage("${PNG}", 1828800, 914400)); return 1; })()`); await frame.waitForTimeout(400); const pt = await drawingPt(); await page.mouse.click(pt.x, pt.y); await frame.waitForTimeout(300); }, target: () => drawingPt() },
  { id: "picture-floating", setup: async () => { await setDoc(frame, ["Picture:", "after"]); await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(0); var im = Api.CreateImage("${PNG}", 1828800, 914400); im.SetWrappingStyle("square"); p.AddDrawing(im); return 1; })()`); await frame.waitForTimeout(400); const pt = await drawingPt(); await page.mouse.click(pt.x, pt.y); await frame.waitForTimeout(300); }, target: () => drawingPt() },
  { id: "shape", setup: async () => { await setDoc(frame, ["Shape:", "after"]); await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(0); var f = Api.CreateSolidFill(Api.CreateRGBColor(200,220,255)); var s = Api.CreateShape("rect", 1828800, 914400, f, Api.CreateStroke(0, Api.CreateNoFill())); p.AddDrawing(s); return 1; })()`); await frame.waitForTimeout(400); const pt = await drawingPt(); await page.mouse.click(pt.x, pt.y); await frame.waitForTimeout(300); }, target: () => drawingPt() },
  { id: "shape-text-edit", setup: async () => { await setDoc(frame, ["Shape:", "after"]); await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(0); var f = Api.CreateSolidFill(Api.CreateRGBColor(200,220,255)); var s = Api.CreateShape("rect", 1828800, 914400, f, Api.CreateStroke(0, Api.CreateNoFill())); s.GetDocContent().GetElement(0).AddText("in the shape"); p.AddDrawing(s); return 1; })()`); await frame.waitForTimeout(400); const pt = await drawingPt(); await page.mouse.click(pt.x, pt.y); await page.mouse.dblclick(pt.x, pt.y); await frame.waitForTimeout(300); }, target: () => drawingPt() },
  { id: "header", setup: async () => { await setDoc(frame, ["Body text."]); await caret(frame, 0, 0); await frame.waitForTimeout(300); }, target: () => mmPt(60, 14, 0) },
  { id: "header-editing", setup: async () => { await setDoc(frame, ["Body text."]); const pt = await mmPt(60, 14, 0); await page.mouse.dblclick(pt.x, pt.y); await frame.waitForTimeout(500); await page.keyboard.type("Head"); await frame.waitForTimeout(300); }, target: () => mmPt(30, 12, 0) },
  { id: "footer", setup: async () => { await setDoc(frame, ["Body text."]); await caret(frame, 0, 0); await frame.evaluate(() => Asc.editor.zoom(50)); await frame.waitForTimeout(500); }, target: () => mmPt(60, 285, 0) },
  { id: "hyperlink", setup: async () => { await setDoc(frame, ["Visit the site now."]); await select(frame, 0, 6, 14); await frame.evaluate(() => { const p = new Asc.CHyperlinkProperty(); p.put_Value("https://example.org"); p.put_Text("the site"); Asc.editor.add_Hyperlink(p); }); await frame.waitForTimeout(300); await caret(frame, 0, 9); }, target: () => caretPt() },
  { id: "comment", setup: async () => { await setDoc(frame, ["Comment on this phrase please."]); await cmd(frame, `(function(){ var r = Api.GetDocument().GetElement(0).GetRange(11, 15); r.AddComment("a remark", "Tester"); return 1; })()`); await frame.waitForTimeout(500); await caret(frame, 0, 13); }, target: () => caretPt() },
  { id: "list-item", setup: async () => { await setDoc(frame, ["Item one", "Item two", "Item three"]); await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); Asc.editor.put_ListType(0, 1); d.RemoveSelection(); }); await caret(frame, 1, 3); }, target: () => caretPt() },
  { id: "toc", setup: async () => { await setDoc(frame, [{ text: "Chapter one", style: "Heading 1" }, "text", { text: "Chapter two", style: "Heading 1" }, "more"]); await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToStartPos(false); Asc.editor.asc_AddTableOfContents(null, new Asc.CTableOfContentsPr()); }); await frame.waitForTimeout(800); await caret(frame, 0, 3); }, target: () => caretPt() },
  { id: "empty-margin", setup: async () => { await setDoc(frame, TEXT); await caret(frame, 0, 0); }, target: () => mmPt(8, 150, 0) },
  { id: "empty-below-text", setup: async () => { await setDoc(frame, TEXT); await caret(frame, 0, 0); }, target: () => mmPt(100, 130, 0) },
  { id: "track-change", noEffectOk: k => /^New Comment$/.test(k), setup: async () => { await setDoc(frame, TEXT); await frame.evaluate(() => Asc.editor.asc_SetTrackRevisions(true)); await caret(frame, 0, 0); await page.keyboard.type("NEW "); await frame.waitForTimeout(300); await caret(frame, 0, 2); }, target: () => caretPt() },
  { id: "equation", setup: async () => { await setDoc(frame, ["Formula: "]); await caret(frame, 0, -1); await frame.evaluate(() => { const T = (Common.define && Common.define.c_oAscMathType) || {}; Asc.editor.asc_AddMath(T.Fraction_Vertical !== undefined ? T.Fraction_Vertical : 0); }); await frame.waitForTimeout(600); }, target: () => caretPt(-10, 0) },
  { id: "footnote", setup: async () => { await setDoc(frame, TEXT); await caret(frame, 0, 8); await frame.evaluate(() => Asc.editor.asc_AddFootnote()); await frame.waitForTimeout(500); await page.keyboard.type("note"); await frame.evaluate(() => Asc.editor.zoom(50)); await frame.waitForTimeout(600); }, target: () => caretPt() },   // zoomed out: the footnote is at the bottom of the page, below the window at 100%
];

const only_ = s => !only || only.includes(s.id);
const reset = async () => { await frame.evaluate(() => { try { Common.ElixirAI.entryPoints.word.closeAskMenu(); } catch (e) {} try { DE.getController("MiniToolbar").hide(true); } catch (e) {} try { const c = DE.getController("Common.Controllers.Comments"); c.clearDummyComment && c.clearDummyComment(true); c.onApiHideComment && c.onApiHideComment(); } catch (e) {} }); await resetUi(frame, page); await frame.waitForFunction(() => !Array.from(document.querySelectorAll(".modals-mask,.asc-window")).some(w => w.getClientRects().length && getComputedStyle(w).display !== "none"), null, { timeout: 4000 }).catch(() => {}); await page.mouse.move(5, 5); };
const cfg = { shotDir: opt("shots"), frame, page, errors, sig: sigSource.word, reset, maxSub: +opt("max-sub", 4),
  rootFn: () => { const m = DE.getController("DocumentHolder").documentHolder.currentMenu; return m && m.isVisible() ? m.cmpEl[0] : null; } };
let rows = [];
for (const s of scenarios.filter(only_)) {
  console.log(`## ${s.id}`);
  try { rows = rows.concat(await sweepContext(cfg, s)); }
  catch (e) { rows.push({ ctx: s.id, item: "(scenario)", status: "fail", reason: String(e).split("\n")[0].slice(0, 200) }); console.log(`FAIL ${s.id} scenario error ${String(e).split("\n")[0]}`); }
}
// "Image from storage" is signed when the page is served and used later: its token must outlive the editor's (5 minutes)
{
  const html = await page.content();
  const m = /var data = (\{"fileType":"svg"[^;]*\});/.exec(html);
  let life = null;
  try { const tok = JSON.parse(m[1]).token; const pl = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()); life = pl.exp - pl.iat; } catch (e) {}
  rows.push({ ctx: "all", item: "(storage image token lifetime)", status: life === null || life >= 3600 ? "pass" : "fail", reason: life === null ? "no token (JWT disabled)" : life >= 3600 ? "" : `token lives ${life} s: 'Image from storage' fails after that with a security token error` });
}
const pageErr = errors.filter(e => e.kind === "pageerror");   // the ones raised by a click are failures of that item; the others are listed
rows.push({ ctx: "all", item: "(page errors outside the clicks)", status: "info", reason: pageErr.map(e => e.text).join(" | ").slice(0, 300) });
const nf = summarize(rows, outFile);
await browser.close();
process.exit(nf ? 1 : 0);
