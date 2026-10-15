#!/usr/bin/env node
// Word views in the interface (controller WordViews, sdkjs word/Editor/word-views.js): View tab buttons and
// KeyTips (Alt, W, F / P / U / E), the Outlining tab (Alt, U), Read Mode around the reading layout, the Draft
// view with a floating picture, collapsed headings moved with their text.
//   node tests/views/views.mjs [--out results.json] [--shots dir]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, focusDoc, resetUi, cmd } from "../shortcuts/lib.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = opt("--out", path.join(HERE, "results", "views-latest.json"));
const shots = opt("--shots", null);
shots && fs.mkdirSync(shots, { recursive: true });

const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason || ok) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + (reason || ok))); };

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const js = (fn, a) => frame.evaluate(fn, a);
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await frame.waitForTimeout(250); } };
const alt = async () => { await page.keyboard.down("Alt"); await page.keyboard.up("Alt"); await frame.waitForTimeout(350); };
const view = () => js(() => Asc.editor.asc_GetWordView());
const waitView = async v => { for (let i = 0; i < 20 && (await view()) !== v; i++) await frame.waitForTimeout(250); return view(); };
const hidden = () => js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content.filter(p => d.IsOutlineHidden(p)).map(p => p.GetText().trim()); });
const texts = () => js(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(p => p.GetText().trim()));
const click = sel => js(s => { const el = $(s).find("button").addBack("button").first(); el.click(); return el.length; }, sel);
async function reset() {
  await js(() => { const c = DE.getController("WordViews"); c._state.read && c.exitReadMode(); Asc.editor.asc_SetWordView("print"); });
  for (let i = 0; i < 20 && (await js(() => !!(Asc.editor.isViewMode || Asc.editor.restrictions))); i++) await frame.waitForTimeout(250);
  await press("Escape", "Escape");
  await resetUi(frame, page);
}
const OUTLINE = [{ text: "Chapter one", style: "Heading 1" }, "Body one", { text: "Section A", style: "Heading 2" }, "Body A", { text: "Chapter two", style: "Heading 1" }, "Body two"];
const LONG = Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1} ` + "lorem ipsum dolor sit amet ".repeat(8));

// ---- View tab: the four views, the KeyTips of Word
await setDoc(frame, OUTLINE);
await focusDoc(frame);
record("views.buttons", await js(() => ["#slot-elx-view-read", "#slot-elx-view-print", "#slot-elx-view-outline", "#slot-elx-view-draft"].every(s => $(s + " button").length === 1)), "the View tab does not show Read Mode, Print Layout, Outline and Draft");

await alt(); await press("w", "u");
record("views.keytip-outline", (await waitView("outline")) === "outline", `Alt, W, U gave ${await view()}`);
const tab = await js(() => ({ visible: $("#toolbar a[data-tab=outlining]").closest("li").is(":visible"), active: $("#toolbar .ribtab.active > a").attr("data-tab"), first: $("#toolbar .ribtab:visible > a").eq(1).attr("data-tab") }));
record("views.outlining-tab", tab.visible && tab.active === "outlining" && tab.first === "outlining", JSON.stringify(tab));
shots && await page.screenshot({ path: `${shots}/views-outline.png` });

// Outlining tab buttons
await caret(frame, 2, 0);
await click("#elx-outl-demote");
let level = await js(() => Asc.editor.asc_GetOutlineState().level);
record("views.outlining-demote", level === 2, `Section A level ${level} after Demote, expected 2 (Heading 3)`);
await click("#elx-outl-promote");
await click("#elx-outl-collapse");
record("views.outlining-collapse", JSON.stringify(await hidden()) === JSON.stringify(["Body A"]), `hidden ${JSON.stringify(await hidden())}`);
await click("#elx-outl-expand");
record("views.outlining-expand", (await hidden()).length === 0, `hidden ${JSON.stringify(await hidden())}`);
await js(() => { const c = DE.getController("WordViews"); c.cmbShow.setValue(1); c.cmbShow.trigger("selected", c.cmbShow, c.cmbShow.store.findWhere({value: 1}).toJSON()); });
await frame.waitForTimeout(300);
record("views.outlining-show-level", JSON.stringify(await hidden()) === JSON.stringify(["Body one", "Section A", "Body A", "Body two"]), `hidden ${JSON.stringify(await hidden())}`);
// a collapsed heading moves with its text (Move Down: below Chapter two and its hidden text)
await caret(frame, 0, 0);
await click("#elx-outl-down");
record("views.outlining-move-collapsed", JSON.stringify(await texts()) === JSON.stringify(["Chapter two", "Body two", "Chapter one", "Body one", "Section A", "Body A"]), `after Move Down ${JSON.stringify(await texts())}`);
await press("Control+z");
await caret(frame, 1, 0);
await click("#elx-outl-body");
record("views.outlining-body-text", (await js(() => Asc.editor.asc_GetOutlineState().level)) === 9, "Demote to Body Text did not make body text");
await click("#elx-outl-close");
record("views.outlining-close", (await waitView("print")) === "print" && !(await js(() => $("#toolbar a[data-tab=outlining]").closest("li").is(":visible"))), "Close Outline View did not return to Print Layout");
await alt(); await press("w", "u");
await waitView("outline");
await alt();
const kt = await js(() => $("#toolbar a[data-tab=outlining]")[0] && Array.from(document.querySelectorAll(".hint-div")).filter(h => h.offsetParent !== null).map(h => h.textContent));
await press("u");
const kt2 = await js(() => Array.from(document.querySelectorAll(".hint-div")).filter(h => h.offsetParent !== null).map(h => h.textContent));
record("views.keytip-outlining-tab", (kt || []).includes("U") && ["P", "D", "E", "C", "S", "T"].every(t => kt2.includes(t)), `level 0 ${JSON.stringify(kt)}, Alt, U ${JSON.stringify(kt2)}`);
await press("Escape", "Escape", "Escape");

// ---- Draft view: a floating picture is laid out in the text flow
await reset();
await setDoc(frame, ["Before the picture", "After the picture"]);
await cmd(frame, `(function(){ var d = Api.GetDocument(); var img = Api.CreateImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 36e5, 18e5); img.SetWrappingStyle("square"); d.GetElement(0).AddDrawing(img); return 1; })()`);
await frame.waitForTimeout(500);
await focusDoc(frame);
await alt(); await press("w", "e");
const draft = await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const dr = d.GetAllDrawingObjects()[0]; return { view: d.GetWordView(), inline: dr && dr.Is_Inline(), stored: dr && dr.DrawingType, headers: d.Layout.IsHeaders() }; });
record("views.keytip-draft", draft.view === "draft", `Alt, W, E gave ${draft.view}`);
record("views.draft-floating-inline", draft.inline === true && draft.stored !== 1 && draft.headers === false, JSON.stringify(draft));
await alt(); await press("w", "p");
record("views.keytip-print", (await waitView("print")) === "print", `Alt, W, P gave ${await view()}`);
const back = await js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllDrawingObjects()[0].Is_Inline());
record("views.print-floating-back", back === false, "the picture stays inline after Print Layout");

// ---- Read Mode
await reset();
await setDoc(frame, LONG);
await focusDoc(frame);
const before = await js(() => ({ rulers: Asc.editor.WordControl.m_bIsRuler, spell: Asc.editor.WordControl.m_oLogicDocument.Spelling.Use, folded: DE.getController("Toolbar").toolbar.isCompact() }));
await alt(); await press("w", "f");
const read = await waitView("read");
await frame.waitForTimeout(800);
const inRead = await js(() => ({ view: Asc.editor.asc_GetWordView(), viewMode: !!(Asc.editor.isViewMode || Asc.editor.restrictions), folded: DE.getController("Toolbar").toolbar.isCompact(), rulers: Asc.editor.WordControl.m_bIsRuler, spell: Asc.editor.WordControl.m_oLogicDocument.Spelling.Use, pages: Asc.editor.getCountPages(), readBtn: DE.getController("RibbonTabs").view.btnViewRead.pressed }));
record("view.read-mode", read === "read" && inRead.viewMode && inRead.folded && !inRead.rulers && !inRead.spell && inRead.pages > 1 && inRead.readBtn, JSON.stringify(inRead));
shots && await page.screenshot({ path: `${shots}/views-read.png` });
await press("PageDown", "PageDown");
record("views.read-pagedown", (await js(() => Asc.editor.getCurrentPage())) === 2, `page ${await js(() => Asc.editor.getCurrentPage())} after two Page Down`);
await press("Escape");
await frame.waitForTimeout(800);
const after = await js(() => ({ view: Asc.editor.asc_GetWordView(), viewMode: !!(Asc.editor.isViewMode || Asc.editor.restrictions), rulers: Asc.editor.WordControl.m_bIsRuler, spell: Asc.editor.WordControl.m_oLogicDocument.Spelling.Use, folded: DE.getController("Toolbar").toolbar.isCompact() }));
record("views.read-exit-restores", after.view === "print" && !after.viewMode && after.rulers === before.rulers && after.spell === before.spell && after.folded === before.folded, `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
// Ctrl+Alt+O from Read Mode: Outline view, editing again
await alt(); await press("w", "f"); await waitView("read");
await press("Control+Alt+o");
await frame.waitForTimeout(800);
const fromRead = await js(() => ({ view: Asc.editor.asc_GetWordView(), viewMode: !!(Asc.editor.isViewMode || Asc.editor.restrictions), read: DE.getController("WordViews")._state.read }));
record("views.read-to-outline", fromRead.view === "outline" && !fromRead.viewMode && !fromRead.read, JSON.stringify(fromRead));

await reset();
const pageErrors = errors.filter(e => e.kind === "pageerror");
record("views.no-page-error", pageErrors.length === 0, pageErrors.map(e => e.text.slice(0, 160)).join(" | "));
await browser.close();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
const fails = results.filter(r => r.status !== "pass").length;
console.log(`views: ${results.length - fails}/${results.length} pass`);
process.exit(fails ? 1 : 0);
