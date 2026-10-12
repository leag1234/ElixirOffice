#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Word ribbon gaps (docs/ui.md, "UI gaps with Word, third pass"): Design (themes, style sets, theme fonts,
// paragraph spacing, page borders), Insert (cover page, Quick Tables, live table preview, header and footer
// galleries), References (sources, citations APA/MLA, bibliography, Mark Entry Alt+Shift+X, index),
// AutoCorrect while typing (typo list, capital at the start of a sentence, (c), curly quotes, Ctrl+Z,
// AutoCorrect Options "Replace Text" page).
//   node tests/ribbon/word-gaps.mjs [--out results.json] [--shots dir] [--only design,insert,refs,autocorrect]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, select, focusDoc } from "../shortcuts/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => args.includes(k) ? args[args.indexOf(k) + 1] : null;
const outFile = opt("--out") || path.join(HERE, "results", "word-gaps-latest.json");
const shots = opt("--shots");
const only = opt("--only") ? opt("--only").split(",") : ["design", "insert", "refs", "autocorrect"];
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
const frame = await openEditor(page, {});
const wait = ms => frame.waitForTimeout(ms);
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };
const setTab = async t => { await frame.evaluate(t => DE.getController("Toolbar").toolbar.setTab(t), t); await wait(400); };
const idle = async () => { await wait(900); };
const style = name => frame.evaluate(n => {
  const d = Asc.editor.WordControl.m_oLogicDocument, st = d.Styles.Get(d.Styles.GetStyleIdByName(n));
  if (!st) return null;
  const tp = st.TextPr, pp = st.ParaPr;
  return { size: tp.FontSize, bold: !!tp.Bold, caps: !!tp.Caps, jc: pp.Jc, after: pp.Spacing ? pp.Spacing.After : undefined, line: pp.Spacing ? pp.Spacing.Line : undefined, bottom: pp.Brd && pp.Brd.Bottom ? pp.Brd.Bottom.Value : 0 };
}, name);
const texts = () => frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(e => (e.IsTable && e.IsTable()) ? "#table" : (e.GetText ? e.GetText().replace(/[\r\n]+$/, "") : "?")));
const allText = () => frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); const t = d.GetSelectedText(false, { NewLine: true, NewLineParagraph: true }); d.RemoveSelection(); return t; });
const undo = async () => { await frame.evaluate(() => Asc.editor.Undo()); await wait(500); };
const typeKeys = async s => { await focusDoc(frame); await page.keyboard.type(s, { delay: 30 }); await wait(500); };
const cmdRet = src => frame.evaluate(s => new Promise(r => Asc.editor.callCommand(s, true, r)), src);

// ===== Design ===============================================================================================
if (only.includes("design")) {
  await setDoc(frame, [{ text: "Project report", style: "Title" }, { text: "Introduction", style: "Heading 1" }, "Body text of the report.", { text: "Details", style: "Heading 2" }, "More text."]);
  await setTab("design");
  await shot("ribbon-design");
  const has = await frame.evaluate(() => ["#elx-dsg-themes", "#elx-dsg-stylesets", "#elx-dsg-fonts", "#elx-dsg-spacing", "#elx-dsg-borders", "#slot-btn-colorschemas"].map(s => $(s).is(":visible")));
  record("design.controls", has.every(Boolean), JSON.stringify(has));
  await frame.locator("#elx-dsg-themes button").first().click(); await wait(600);
  const nThemes = await frame.locator("#elx-dsg-theme-list .elx-dsg-theme").count();
  record("design.themes.gallery", nThemes >= 10, nThemes);
  await shot("ribbon-design-themes");
  await frame.locator("#elx-dsg-theme-list .elx-dsg-theme[title=Paper]").click(); await idle();
  let fonts = await frame.evaluate(() => Asc.editor.asc_ElixirGetThemeFonts());
  const scheme = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.theme.themeElements.clrScheme.name);
  record("design.themes.apply", !!fonts && fonts.Major === "Constantia" && fonts.Minor === "Constantia" && scheme === "Paper", JSON.stringify([fonts, scheme]));
  await frame.locator("#elx-dsg-fonts button").first().click(); await wait(400);
  const nFonts = await frame.locator(".elx-dsg-fonts-menu a.elx-dsg-fontpair").count();
  record("design.fonts.gallery", nFonts >= 10, nFonts);
  await frame.locator(".elx-dsg-fonts-menu a.elx-dsg-fontpair", { hasText: "Times New Roman" }).first().click(); await idle();
  fonts = await frame.evaluate(() => Asc.editor.asc_ElixirGetThemeFonts());
  record("design.fonts.apply", !!fonts && fonts.Major === "Times New Roman" && fonts.Minor === "Times New Roman", JSON.stringify(fonts));
  await undo();
  fonts = await frame.evaluate(() => Asc.editor.asc_ElixirGetThemeFonts());
  record("design.fonts.undo", !!fonts && fonts.Major === "Constantia", JSON.stringify(fonts));
  const nSets = await frame.evaluate(() => DE.getController("ElixirDesign").styleSets.menuPicker.store.length);
  record("design.stylesets.gallery", nSets >= 8, nSets);
  await frame.evaluate(() => DE.getController("ElixirDesign").applyStyleSet("centered")); await idle();
  let t = await style("Title"), h1 = await style("Heading 1");
  record("design.stylesets.centered", !!t && t.jc === 2 && t.caps && !!h1 && h1.jc === 2 && h1.bold, JSON.stringify([t, h1]));
  await frame.evaluate(() => DE.getController("ElixirDesign").applyStyleSet("lines")); await idle();
  h1 = await style("Heading 1");
  record("design.stylesets.lines", !!h1 && h1.bottom === 1 && h1.jc !== 2, JSON.stringify(h1));
  await frame.locator("#elx-dsg-spacing button").first().click(); await wait(300);
  await frame.locator(".elx-dsg-spacing-menu a", { hasText: "Double" }).first().click(); await idle();
  let n = await style("Normal");
  record("design.spacing.double", !!n && Math.abs(n.line - 2) < 0.01 && Math.abs(n.after - 8 * 25.4 / 72) < 0.1, JSON.stringify(n));
  await frame.locator("#elx-dsg-spacing button").first().click(); await wait(300);
  await frame.locator(".elx-dsg-spacing-menu a", { hasText: "No Paragraph Space" }).first().click(); await idle();
  n = await style("Normal");
  record("design.spacing.none", !!n && Math.abs(n.line - 1) < 0.01 && n.after < 0.01, JSON.stringify(n));
  await frame.locator("#elx-dsg-borders button").first().click(); await wait(500);
  await shot("ribbon-design-borders-dialog");
  await frame.locator(".elx-dsg-borders-dlg .elx-dsg-box").click();
  await frame.locator(".elx-dsg-borders-dlg .dlg-btn[result=ok]").click(); await idle();
  let pb = await frame.evaluate(() => Asc.editor.asc_ElixirGetPageBorders());
  record("design.pageBorders.box", !!pb && pb.Value === 1, JSON.stringify(pb));
  await shot("ribbon-design-borders");
  await undo();
  pb = await frame.evaluate(() => Asc.editor.asc_ElixirGetPageBorders());
  record("design.pageBorders.undo", !!pb && pb.Value === 0, JSON.stringify(pb));
}

// ===== Insert ===============================================================================================
if (only.includes("insert")) {
  await setDoc(frame, ["First paragraph of the document.", "Second paragraph.", ""]);
  await setTab("ins");
  record("insert.cover.button", await frame.locator("#elx-ins-cover button").first().isVisible(), "");
  await frame.locator("#elx-ins-cover button").first().click(); await wait(400);
  await shot("ribbon-insert-cover");
  await frame.locator(".elx-cover-menu a.elx-cover-item").nth(2).click(); await idle();
  const coverTag = () => frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.filter(e => e.IsBlockLevelSdt && e.IsBlockLevelSdt() && e.GetTag() === "elixir-cover-page").length);
  record("insert.cover.inserted", (await coverTag()) === 1, JSON.stringify((await texts()).slice(0, 3)));
  const pages = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.GetPagesCount());
  record("insert.cover.ownPage", pages >= 2, pages);
  await frame.locator("#elx-ins-cover button").first().click(); await wait(300);
  await frame.locator(".elx-cover-menu a.elx-cover-item").nth(0).click(); await idle();
  record("insert.cover.replaced", (await coverTag()) === 1, await coverTag());
  await frame.locator("#elx-ins-cover button").first().click(); await wait(300);
  await frame.locator(".elx-cover-menu a", { hasText: "Remove Current Cover Page" }).click(); await idle();
  let tx = await texts();
  record("insert.cover.removed", (await coverTag()) === 0 && tx[0] === "First paragraph of the document.", JSON.stringify(tx.slice(0, 2)));
  await caret(frame, 2, 0);
  await frame.locator("#slot-btn-instable button").first().click(); await wait(500);
  await frame.evaluate(() => { const p = DE.getController("Toolbar").toolbar.mnuTablePicker; p.trigger("change", p, 4, 3); });
  await wait(300);
  const ghost = await frame.evaluate(() => { const g = $(".elx-table-ghost"); return { vis: g.is(":visible"), rows: g.find(".row").length, cells: g.find(".row").first().find(".cell").length, w: g.width() }; });
  const col = await frame.evaluate(() => Asc.editor.asc_ElixirGetInsertionArea());
  record("insert.tablePreview.ghost", ghost.vis && ghost.rows === 3 && ghost.cells === 4 && Math.abs(ghost.w - col.W) < 3, JSON.stringify([ghost, col]));
  // the outline spans the text column, between the margins, not the page
  const pageW = await frame.evaluate(() => { const p = Asc.editor.WordControl.m_oDrawingDocument.m_arrPages[0].drawingPage; return p.right - p.left; });
  record("insert.tablePreview.margins", col.W < pageW * 0.9, JSON.stringify([col.W, pageW]));
  record("insert.tablePreview.noChange", (await texts()).every(x => x !== "#table"), "");
  await shot("ribbon-insert-table-preview");
  await frame.evaluate(() => DE.getController("Toolbar").toolbar.btnInsertTable.menu.hide());
  await wait(200);
  record("insert.tablePreview.hidden", await frame.evaluate(() => !$(".elx-table-ghost").is(":visible")), "");
  await caret(frame, 2, 0);
  await frame.evaluate(() => DE.getController("ElixirInsert").insertQuickTable("calendar")); await idle();
  const tbl = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument, t = d.Content.find(e => e.IsTable && e.IsTable()); return t ? { rows: t.GetRowsCount(), cols: t.GetRow(0).GetCellsCount() } : null; });
  record("insert.quickTables.calendar", !!tbl && tbl.cols === 7 && tbl.rows >= 5, JSON.stringify(tbl));
  record("insert.quickTables.menu", await frame.evaluate(() => DE.getController("Toolbar").toolbar.mnuInsertTable.items.some(i => i.value === "elx-quick")), "");
  await frame.evaluate(() => DE.getController("ElixirInsert").insertHeaderFooter(false, "pagexofy")); await idle();
  const footer = await cmdRet("(function(){var f=Api.GetDocument().GetFinalSection().GetFooter(\"default\",false);return f?f.GetElement(0).GetText():null;})()");
  record("insert.footer.pageXofY", !!footer && /Page\s*\S*\s*of/.test(footer), JSON.stringify(footer));
  const hdrItems = await frame.evaluate(() => DE.getController("RibbonTabs").view.btnInsHeader.menu.items.filter(i => /^elx-hf-/.test(i.value)).length);
  record("insert.header.gallery", hdrItems >= 4, hdrItems);
}

// ===== References ===========================================================================================
if (only.includes("refs")) {
  await setDoc(frame, ["Climate models agree on the trend.", "Index terms: photosynthesis and chlorophyll.", ""]);
  await setTab("links");
  record("refs.controls", await frame.evaluate(() => ["#elx-ref-cite", "#elx-ref-manage", "#elx-ref-style", "#elx-ref-bib", "#elx-ref-mark", "#elx-ref-insidx"].every(s => $(s).is(":visible"))), "");
  await shot("ribbon-references");
  await caret(frame, 0, -1);
  await frame.locator("#elx-ref-cite button").first().click(); await wait(800);
  await frame.locator("a", { hasText: "Add New Source..." }).first().click(); await wait(500);
  const dlg = frame.locator(".elx-ref-source-dlg");
  await dlg.locator("input[data-key=author]").fill("Hansen, James; Sato, Makiko");
  await dlg.locator("input[data-key=title]").fill("Global temperature change");
  await dlg.locator("input[data-key=year]").fill("2006");
  await dlg.locator("input[data-key=publisher]").fill("PNAS");
  await shot("refs-create-source");
  await dlg.locator(".dlg-btn[result=ok]").click(); await idle(); await idle();
  const p0 = (await texts())[0];
  record("refs.citation.apa", p0.includes("(Hansen & Sato, 2006)"), p0);
  await frame.evaluate(() => new Promise(r => DE.getController("ElixirReferences").saveSource({ tag: "Darwin59", type: "book", author: "Darwin, Charles", title: "On the Origin of Species", year: "1859", publisher: "John Murray" }, r)));
  await idle();
  await caret(frame, 2, 0);
  await frame.evaluate(() => DE.getController("ElixirReferences").insertBibliography()); await idle(); await idle();
  let all = await allText();
  record("refs.bibliography.apa", /References/.test(all) && /Darwin, C\. \(1859\)\. On the Origin of Species\. John Murray\./.test(all) && /Hansen, J\., & Sato, M\. \(2006\)/.test(all), all.slice(-260));
  await frame.evaluate(() => DE.getController("ElixirReferences").setStyle("mla")); await idle(); await idle();
  all = await allText();
  record("refs.style.mla", /Works Cited/.test(all) && /Darwin, Charles\. On the Origin of Species\. John Murray, 1859\./.test(all) && /\(Hansen and Sato\)/.test(all), all.slice(0, 80) + " ... " + all.slice(-200));
  await shot("refs-bibliography-mla");
  const saved = await cmdRet("(function(){return Api.GetDocument().GetCustomProperties().Get(\"ElixirSources\");})()");
  record("refs.sources.inDocument", /Darwin59/.test(saved || "") && /Hansen/.test(saved || ""), String(saved).slice(0, 80));
  const para1 = (await texts()).findIndex(x => x.startsWith("Index terms"));
  await select(frame, para1, 13, 27);
  await page.keyboard.press("Alt+Shift+X"); await wait(600);
  const mainVal = await frame.locator(".elx-ref-mark-dlg .elx-ref-main").inputValue().catch(() => "");
  record("refs.markEntry.shortcut", mainVal === "photosynthesis", mainVal);
  await frame.locator(".elx-ref-mark-dlg .dlg-btn[result=ok]").click().catch(() => {}); await idle();
  await select(frame, para1, 32, 43);
  await frame.evaluate(() => Asc.editor.asc_ElixirMarkIndexEntry("photosynthesis:chlorophyll")); await idle();
  const entries = await frame.evaluate(() => Asc.editor.asc_ElixirGetIndexEntries());
  record("refs.markEntry.fields", entries.length === 2 && entries.every(e => e.Page >= 1), JSON.stringify(entries));
  const visible = (await texts())[para1];
  record("refs.markEntry.invisible", visible === "Index terms: photosynthesis and chlorophyll.", visible);
  await caret(frame, para1, -1);
  await frame.evaluate(() => DE.getController("ElixirReferences").insertIndex(false)); await idle();
  all = await allText();
  record("refs.index.inserted", /photosynthesis, \d+/.test(all) && /chlorophyll, \d+/.test(all), all.slice(-160));
}

// ===== AutoCorrect ==========================================================================================
if (only.includes("autocorrect")) {
  await setDoc(frame, [""]);
  await caret(frame, 0, 0);
  await typeKeys("teh dog ran. it was (c) \"fine\" ");
  let p = (await texts())[0];
  record("autocorrect.typo", p.startsWith("The dog ran."), p);
  record("autocorrect.firstLetter", p.includes("ran. It was"), p);
  record("autocorrect.copyright", p.includes("©"), p);
  record("autocorrect.curlyQuotes", p.includes("“fine”"), p);
  await setDoc(frame, [""]); await caret(frame, 0, 0);
  await typeKeys("we recieve ");
  p = (await texts())[0];
  record("autocorrect.typo2", p === "We receive ", JSON.stringify(p));
  await page.keyboard.press("Control+Z"); await wait(500);
  p = (await texts())[0];
  record("autocorrect.undo", p === "We recieve ", JSON.stringify(p));
  await frame.evaluate(() => (new Common.Views.AutoCorrectDialog({ api: Asc.editor })).show());
  await wait(800);
  await frame.locator(".asc-window").getByText("Replace Text", { exact: true }).first().click();
  await wait(400);
  await shot("autocorrect-dialog");
  await frame.locator(".elx-ac-from").fill("eo");
  await frame.locator(".elx-ac-to").fill("ElixirOffice");
  await frame.locator(".elx-ac-add").click(); await wait(300);
  record("autocorrect.dialog.add", (await frame.locator(".elx-ac-item[data-key=eo]").count()) === 1, "");
  await frame.evaluate(() => { $(".asc-window:visible .tool.close").click(); });
  await wait(400);
  await setDoc(frame, [""]); await caret(frame, 0, 0);
  await typeKeys("Try eo now ");
  p = (await texts())[0];
  record("autocorrect.userEntry", p.includes("ElixirOffice now"), p);
  await frame.evaluate(() => { Common.localStorage.setBool("de-elixir-autocorrect-replace", false); window.ElixirTextAutoCorrect.apply(Asc.editor); });
  await setDoc(frame, [""]); await caret(frame, 0, 0);
  await typeKeys("Also teh end ");
  p = (await texts())[0];
  record("autocorrect.off", p.includes("teh end"), p);
  await frame.evaluate(() => { Common.localStorage.setBool("de-elixir-autocorrect-replace", true); Common.localStorage.removeItem("de-elixir-autocorrect-user"); window.ElixirTextAutoCorrect.apply(Asc.editor); });
}

const errs = errors.filter(e => !/Failed to load resource/.test(e.text || ""));
record("noErrors", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), base: process.env.EO_BASE, results }, null, 2));
const pass = results.filter(r => r.status === "pass").length;
console.log(`results: ${pass}/${results.length} pass`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
