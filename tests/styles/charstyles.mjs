#!/usr/bin/env node
// Issue #91: Word character styles in the Styles pane.
//   1. clicking a character style applies it to the selection or to the word at the caret
//      (the run gets w:rStyle, the paragraph style is untouched), and the .docx round trip keeps it;
//   2. "Update <style> to Match Selection" updates the character style from the selection;
//   3. "Create New Style from Formatting" can create a character style (Style type combo);
//   4. paragraph styles still apply as before.
//   node tests/styles/charstyles.mjs [--out results.json]       (EO_BASE=http://host:port)
// Fixture: tests/fixtures/docx/charstyles.docx (python3 tests/fixtures/docx/make_charstyle_fixture.py).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, openEditor, caret, select, focusDoc } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "fixtures", "docx", "charstyles.docx");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "charstyles-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
let frame;
const wait = ms => frame.waitForTimeout(ms);

async function open(file) {
  const fname = await upload(file, `charstyles-${process.pid}-${Date.now().toString(36)}.docx`);
  frame = await openEditor(page, { fileName: fname });
  await frame.evaluate(() => { try { Asc.editor.zoom(100); } catch (e) {} });
  await focusDoc(frame);
  await wait(400);
}
// runs of paragraph p: [{text, rStyle (style name or null), bold, italic}]
const runs = p => frame.evaluate(p => {
  const d = Asc.editor.WordControl.m_oLogicDocument, para = d.Content[p], out = [];
  para.CheckRunContent(r => {
    let t = ""; r.Content.forEach(it => { if (it.Value !== undefined) t += String.fromCodePoint(it.Value); });
    if (!t) return;
    const id = r.GetRStyle(), st = id ? d.Styles.Get(id) : null;
    out.push({ text: t, rStyle: st ? st.Name : null, rStyleId: id || null });
  });
  return out;
}, p);
const pStyle = p => frame.evaluate(p => { const d = Asc.editor.WordControl.m_oLogicDocument, id = d.Content[p].Pr.PStyle, s = id && d.Styles.Get(id); return s ? s.Name : null; }, p);
const styleInfo = name => frame.evaluate(name => { const i = Asc.editor.asc_GetStyleForModify(name); return i && { type: i.Type, bold: i.TextPr.Bold, italic: i.TextPr.Italic, underline: i.TextPr.Underline, size: i.TextPr.FontSize }; }, name);
// the Styles pane action of a click on the list row / menu item (same handler as the UI)
const paneAction = (action, name) => frame.evaluate(([action, name]) => {
  const c = DE.getController("WordFormatting");
  const type = c.getStyleList().find(s => s.name === name).type;
  const rec = { get: k => ({ name, caption: name, isClear: false, type })[k] };
  c.onStylesPaneAction(action, rec);
}, [action, name]);
const rowClick = async name => {
  await frame.evaluate(() => { const c = DE.getController("WordFormatting"); c.toggleStylesPane(true); });
  await wait(500);
  await frame.evaluate(name => { const r = [...document.querySelectorAll(".word-styles-pane .word-style-row")].find(e => e.getAttribute("data-name") === name); if (!r) throw new Error("no row " + name); r.querySelector(".word-style-name").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); r.querySelector(".word-style-name").click(); }, name);
  await wait(400);
};
const closePane = () => frame.evaluate(() => { const c = DE.getController("WordFormatting"); c.stylesPane && c.stylesPane.close(); });
async function savedXml(tag, part = "word/document.xml") {
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await frame.evaluate(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX)));
  const file = path.join(HERE, "results", `${tag}.docx`);
  await (await dl).saveAs(file);
  await wait(300);
  return { file, xml: execFileSync("unzip", ["-p", file, part], { maxBuffer: 64 << 20 }).toString() };
}
const savedStyleId = (file, name) => (execFileSync("unzip", ["-p", file, "word/styles.xml"], { maxBuffer: 64 << 20 }).toString()
  .match(new RegExp(`<w:style\\b[^>]*w:styleId="([^"]+)"[^>]*>\\s*<w:name w:val="${name}"`)) || [])[1];

await open(FIX);

// 1. the pane lists the character styles
{
  const list = await frame.evaluate(() => DE.getController("WordFormatting").getStyleList().filter(s => s.type === "c").map(s => s.name));
  record("list-char-styles", list.includes("Key Term") && list.includes("Quiet"), JSON.stringify(list));
}

// 2. caret in a word, click the style in the pane: the word gets the style
await caret(frame, 0, 8); // inside "beta"
await rowClick("Key Term");
{
  const r = await runs(0), hit = r.filter(x => x.rStyle === "Key Term");
  record("apply-word-at-caret", hit.length === 1 && hit[0].text.trim() === "beta", JSON.stringify(r));
  record("apply-word-keeps-pstyle", (await pStyle(0)) === null || (await pStyle(0)) === "Normal", await pStyle(0));
}
await closePane();

// 3. selection: the selection gets the style
await select(frame, 0, 11, 22); // "gamma delta"
await paneAction("apply", "Quiet");
{
  const r = await runs(0), hit = r.filter(x => x.rStyle === "Quiet").map(x => x.text).join("");
  record("apply-selection", hit === "gamma delta", JSON.stringify(r));
}
// second paragraph untouched
record("apply-other-paragraph-untouched", (await runs(1)).every(x => !x.rStyle), JSON.stringify(await runs(1)));

// 4. round trip: save to docx, the runs carry w:rStyle; reopen keeps them
let saved;
{
  saved = await savedXml("charstyles-saved");
  const kt = savedStyleId(saved.file, "Key Term"), qt = savedStyleId(saved.file, "Quiet");
  const okXml = !!kt && !!qt && new RegExp(`<w:rStyle w:val="${kt}"\\s*/>`).test(saved.xml) && new RegExp(`<w:rStyle w:val="${qt}"\\s*/>`).test(saved.xml);
  record("save-docx-has-rStyle", okXml, `Key Term=${kt} Quiet=${qt}`);
  await open(saved.file);
  const r = await runs(0);
  record("reopen-keeps-rStyle", r.some(x => x.text.trim() === "beta" && x.rStyle === "Key Term") && r.some(x => x.text.includes("gamma delta") && x.rStyle === "Quiet"), JSON.stringify(r));
}

// 5. Update to match selection: select "alpha", make it underlined 16 pt, update "Quiet"
await open(FIX);
await select(frame, 1, 0, 7); // "epsilon"
await frame.evaluate(() => { const a = Asc.editor; a.put_TextPrUnderline(true); a.put_TextPrFontSize(16); });
await wait(300);
const before = await styleInfo("Quiet");
await paneAction("update", "Quiet");
await wait(400);
{
  const after = await styleInfo("Quiet");
  record("update-char-style-from-selection", after && after.type === 4 && after.underline === true && after.size === 16, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  record("update-char-style-stays-character", after && after.type === 4, JSON.stringify(after));
  const names = await frame.evaluate(() => DE.getController("WordFormatting").getStyleList().filter(s => s.name === "Quiet").map(s => s.type));
  record("update-char-style-list-type", names.length === 1 && names[0] === "c", JSON.stringify(names));
}

// 6. New style dialog: Style type = Character creates a character style
await open(FIX);
await select(frame, 0, 0, 5);
await frame.evaluate(() => { const a = Asc.editor; a.put_TextPrBold(true); a.put_TextPrFontSize(14); });
await wait(300);
await frame.evaluate(() => {
  const P = DE.Views.ModifyStyleDialog.prototype, r = P.render;
  P.render = function () { const x = r.apply(this, arguments); window.__eoStyleDlg = this; return x; };
  DE.getController("WordFormatting").showNewStyle();
});
await wait(800);
{
  const dlgInfo = await frame.evaluate(() => {
    const d = window.__eoStyleDlg;
    return { hasType: !!d, disabled: d ? d.cmbType.isDisabled() : null, options: d ? d.cmbType.store.pluck("displayValue") : null };
  });
  record("dialog-type-enabled-for-new", dlgInfo.hasType && dlgInfo.disabled === false, JSON.stringify(dlgInfo));
  const bg = await frame.evaluate(() => {
    const el = document.querySelector(".word-modify-style .word-ms-preview"), light = getComputedStyle(el).backgroundColor;
    document.body.classList.add("content-theme-dark");
    const dark = getComputedStyle(el).backgroundColor;
    document.body.classList.remove("content-theme-dark");
    return { light, dark };
  });
  record("dialog-preview-follows-dark-document", bg.light === "rgb(255, 255, 255)" && bg.dark !== bg.light, JSON.stringify(bg));
  // choose Character, name it, OK
  await frame.evaluate(() => {
    const dlg = window.__eoStyleDlg;
    dlg.cmbType.setValue(4);
    dlg.cmbType.trigger("selected", dlg.cmbType, { value: 4 });
    dlg.inputName.setValue("Callout");
    dlg.onPrimary();
  });
  await wait(800);
  const info = await styleInfo("Callout");
  const dlgState = await frame.evaluate(() => 0);
  record("new-char-style-created", info && info.type === 4 && info.bold === true, JSON.stringify(info));
  const r = await runs(0);
  record("new-char-style-applied-to-selection", r.some(x => x.rStyle === "Callout" && x.text.startsWith("alpha".slice(0, 4))), JSON.stringify(r));
  const s = await savedXml("charstyles-new");
  record("new-char-style-saved", /<w:style\b[^>]*w:type="character"[^>]*>\s*<w:name w:val="Callout"/.test(execFileSync("unzip", ["-p", s.file, "word/styles.xml"]).toString()), "styles.xml");
}

// 7. paragraph styles are not broken
await open(FIX);
await caret(frame, 1, 3);
await paneAction("apply", "Heading 1");
await wait(300);
record("paragraph-style-apply", (await pStyle(1)) === "Heading 1" && (await runs(1)).every(x => !x.rStyle), `${await pStyle(1)} ${JSON.stringify(await runs(1))}`);
await select(frame, 0, 0, -1);
await frame.evaluate(() => Asc.editor.put_Style("Heading 2"));
await wait(300);
record("paragraph-style-apply-whole-paragraph", (await pStyle(0)) === "Heading 2", await pStyle(0));

const real = errors.filter(e => !/favicon|ResizeObserver|Failed to load resource/.test(e.text));
record("no-page-errors", real.length === 0, JSON.stringify(real.slice(0, 3)));
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
await browser.close();
const failed = results.filter(r => r.status !== "pass").length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
