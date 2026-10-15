#!/usr/bin/env node
// Task panes of Word (controller WordPanes, sdkjs word/Editor/word-views.js): Reveal Formatting (Shift+F1),
// Selection pane (Alt+F10: list, select, hide / show with undo, rename, a hidden picture kept on save),
// Thesaurus (Shift+F7: offline MyThes lookup, follow a synonym, Insert).
//   node tests/views/panes.mjs [--out results.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { launch, openEditor, setDoc, select, caret, focusDoc, resetUi, cmd } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "panes-latest.json");
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason || ok) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + (reason || ok))); };

const { browser, page, errors } = await launch({});
let frame = await openEditor(page);
const js = (fn, a) => frame.evaluate(fn, a);
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await frame.waitForTimeout(250); } };
const pane = () => js(() => $("#elx-task-pane").attr("data-pane") || null);
const body = () => js(() => $("#elx-task-pane .elx-tp-body").text());
const closePane = () => js(() => $("#elx-task-pane .elx-tp-close").click());
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ---- Reveal Formatting
await setDoc(frame, [{ text: "Heading text", style: "Heading 1" }, "Body text here"]);
await select(frame, 0, 0, 7);
await focusDoc(frame);
await press("Shift+F1");
let t = await body();
record("reveal.open", (await pane()) === "reveal", `pane ${await pane()}`);
record("reveal.heading", /PARAGRAPH STYLE:\s*Heading 1/.test(t) && /OUTLINE LEVEL:\s*Level 1/.test(t) && /MARGINS:/.test(t) && /PAPER:/.test(t), t.slice(0, 300));
await caret(frame, 1, 2);
await frame.waitForTimeout(600);
t = await body();
record("reveal.follows-cursor", /PARAGRAPH STYLE:\s*Normal/.test(t) && /OUTLINE LEVEL:\s*Body Text/.test(t), t.slice(0, 300));
// the Font heading opens the Font dialog
await js(() => $("#elx-task-pane .elx-rf-sec a[data-action=font]").click());
await frame.waitForTimeout(600);
const dlg = await js(() => $(".asc-window:visible .title").map((i, e) => e.textContent).get());
record("reveal.font-dialog", dlg.some(x => /Font/.test(x)), `dialogs ${JSON.stringify(dlg)}`);
await press("Escape");
await closePane();

// ---- Selection pane
await resetUi(frame, page);
await setDoc(frame, ["First paragraph", "Second paragraph"]);
await cmd(frame, `(function(){ var d = Api.GetDocument();
  var a = Api.CreateImage("${PNG}", 18e5, 18e5); d.GetElement(0).AddDrawing(a);
  var b = Api.CreateShape("rect", 18e5, 9e5, Api.CreateSolidFill(Api.CreateRGBColor(200, 30, 30)), Api.CreateStroke(0, Api.CreateNoFill())); b.SetWrappingStyle("square"); d.GetElement(1).AddDrawing(b);
  return 1; })()`);
await frame.waitForTimeout(600);
await focusDoc(frame);
await press("Alt+F10");
const names = () => js(() => $("#elx-task-pane .elx-sp-item .elx-sp-name").map((i, e) => e.textContent).get());
let n = await names();
record("selection.list", (await pane()) === "selection" && n.length === 2 && n.includes("Picture 1") && n.includes("Shape 1"), JSON.stringify(n));
// click selects the object
await js(() => $("#elx-task-pane .elx-sp-item").filter((i, e) => $(e).find(".elx-sp-name").text() === "Shape 1").click());
await frame.waitForTimeout(400);
const sel = await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.DrawingObjects.getSelectedObjects().map(o => o.getObjectType && o.getObjectType() === AscDFH.historyitem_type_Shape); });
record("selection.select", sel.length === 1 && sel[0] === true, JSON.stringify(sel));
// eye hides, undo shows again
const hiddenOf = () => js(() => Asc.editor.asc_GetSelectionPaneObjects().map(o => o.hidden));
await js(() => $("#elx-task-pane .elx-sp-item").filter((i, e) => $(e).find(".elx-sp-name").text() === "Picture 1").find(".elx-sp-eye").click());
await frame.waitForTimeout(400);
let h = await js(() => Asc.editor.asc_GetSelectionPaneObjects().filter(o => o.kind === "picture").map(o => o.hidden));
record("selection.hide", h[0] === true && (await js(() => $("#elx-task-pane .elx-sp-item.hidden-obj").length)) === 1, JSON.stringify(h));
await focusDoc(frame);
await press("Control+z");
await frame.waitForTimeout(400);
h = await js(() => Asc.editor.asc_GetSelectionPaneObjects().filter(o => o.kind === "picture").map(o => o.hidden));
record("selection.hide-undo", h[0] === false, JSON.stringify(h));
// Hide All, Show All
await js(() => $("#elx-task-pane .elx-sp-tools button[data-cmd=hide]").click()); await frame.waitForTimeout(300);
const all = await hiddenOf();
await js(() => $("#elx-task-pane .elx-sp-tools button[data-cmd=show]").click()); await frame.waitForTimeout(300);
const none = await hiddenOf();
record("selection.hide-show-all", all.every(Boolean) && none.every(x => !x), `${JSON.stringify(all)} then ${JSON.stringify(none)}`);
// rename by double click
await js(() => $("#elx-task-pane .elx-sp-item").filter((i, e) => $(e).find(".elx-sp-name").text() === "Shape 1").trigger("dblclick"));
await frame.waitForTimeout(200);
await js(() => { const i = $("#elx-task-pane .elx-sp-item input"); i.val("Red box"); });
await press("Enter");
n = await names();
record("selection.rename", n.includes("Red box"), JSON.stringify(n));
// a hidden picture is saved hidden (wp:docPr hidden) and stays hidden, not dropped, when the file is opened again
await js(() => Asc.editor.asc_SetPaneObjectsHidden(Asc.editor.asc_GetSelectionPaneObjects().filter(o => o.kind === "picture").map(o => o.id), true));
await frame.waitForTimeout(400);
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
const file = path.join(HERE, "results", "selection-hidden.docx");
const dl = page.waitForEvent("download", { timeout: 60000 });
await js(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX)));
await (await dl).saveAs(file);
const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 << 20 }).toString();
record("selection.hidden-saved", /<wp:docPr\b[^>]*hidden="(1|true)"/.test(xml), "no hidden docPr in document.xml");
await closePane();
frame = await openEditor(page, { fileName: await upload(file, `panes-${process.pid}-${Date.now().toString(36)}.docx`) });
const reopened = await js(() => Asc.editor.asc_GetSelectionPaneObjects().map(o => [o.kind, o.hidden]));
record("selection.hidden-reopened", JSON.stringify(reopened.filter(o => o[0] === "picture")) === JSON.stringify([["picture", true]]), JSON.stringify(reopened));
await closePane();

// ---- Thesaurus
await resetUi(frame, page);
await setDoc(frame, ["a happy child"]);
await caret(frame, 0, 4);
await focusDoc(frame);
await press("Shift+F7");
const syns = async () => { for (let i = 0; i < 40; i++) { const s = await js(() => $("#elx-task-pane .elx-th-syn .elx-sp-name").map((i, e) => e.textContent).get()); if (s.length) return s; await frame.waitForTimeout(250); } return []; };
let s = await syns();
record("thesaurus.lookup", (await pane()) === "thesaurus" && s.includes("glad"), JSON.stringify(s.slice(0, 8)));
// clicking a synonym looks it up
await js(() => $("#elx-task-pane .elx-th-syn").filter((i, e) => $(e).find(".elx-sp-name").text() === "glad").find(".elx-sp-name").click());
await frame.waitForTimeout(800);
const word = await js(() => $("#elx-task-pane .elx-th-input").val());
record("thesaurus.follow", word === "glad", `search box ${JSON.stringify(word)}`);
// unknown word
await js(() => { const i = $("#elx-task-pane .elx-th-input"); i.val("qwxzv"); $("#elx-task-pane .elx-th-go").click(); });
await frame.waitForTimeout(800);
record("thesaurus.no-result", /No results/.test(await body()), (await body()).slice(0, 120));
await closePane();
// the thesaurus of the language of the text (docs/thesaurus.md), main variant for de-AT, none for nl-NL
for (const [lang, lcid, w, syn] of [["de-DE", 1031, "schnell", "flink"], ["de-AT", 3079, "schnell", "flink"], ["fr-FR", 1036, "maison", "bâtiment"],
  ["es-ES", 3082, "casa", "vivienda"], ["it-IT", 1040, "casa", "abitazione"], ["pl-PL", 1045, "dom", "lokum"], ["ru-RU", 1049, "дом", "здание"], ["ar-SA", 1025, "جميل", "حَسَن"]]) {
  await resetUi(frame, page);
  await setDoc(frame, [w + " " + w]);
  await js(l => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); Asc.editor.put_TextPrLang(l); d.RemoveSelection(); }, lcid);
  await caret(frame, 0, 2);
  await focusDoc(frame);
  await press("Shift+F7");
  s = await syns();
  record("thesaurus.lang-" + lang, s.includes(syn), `${w}: ${JSON.stringify(s.slice(0, 6))}`);
  await closePane();
}
await resetUi(frame, page);
await setDoc(frame, ["huis huis"]);
await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); Asc.editor.put_TextPrLang(1043); d.RemoveSelection(); });
await caret(frame, 0, 2); await focusDoc(frame);
await press("Shift+F7");
for (let i = 0; i < 20 && !/thesaurus for the language/.test(await body()); i++) await frame.waitForTimeout(250);
record("thesaurus.lang-none", /no thesaurus for the language/i.test(await body()), (await body()).slice(0, 120));
await closePane();

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("panes.no-page-error", pageErrors.length === 0, pageErrors.map(e => e.text.slice(0, 160)).join(" | "));
await browser.close();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
const fails = results.filter(r => r.status !== "pass").length;
console.log(`panes: ${results.length - fails}/${results.length} pass`);
process.exit(fails ? 1 : 0);
