#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Font name and font size drop-downs (feedback F5-F7): the mini toolbar and the ribbon of the three editors.
// Real mouse clicks, like a tester on macOS (Chrome/Safari-like user agent) in a French school document:
//   - the mini toolbar floats above the selection together with the right-click menu
//   - the font-name drop-down opens, a font is picked: no error dialog, no console or page error,
//     the font is really applied (read back from the editor engine)
//   - the font-size drop-down lists the sizes (not an empty box), a size is picked: applied
//   - the right-click menu still works afterwards
// Also with fonts that are not installed (Comic Sans MS) and with the local-fonts consent on and off.
//   node tests/ctxmenu/fontcombos.mjs [--platform win|mac] [--out results.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, cmd, focusDoc } from "../shortcuts/lib.mjs";
import * as X from "../shortcuts-excel/lib.mjs";
import { visibleWindows, isErrorWindow } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const platform = opt("platform", "mac");
const outFile = opt("out", path.join(HERE, "results", "fontcombos-latest.json"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const BASE = process.env.EO_BASE || "http://localhost:8095";
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " :: " + reason)); };

// ---- helpers (the drop-downs are driven with the mouse) -------------------------------------------
const notIgnored = e => !/Failed to load resource/.test(e.text);   // a missing optional file is not a script error
async function errorsSince(errors, mark, frame) {
  const wins = (await visibleWindows(frame)).filter(isErrorWindow);
  return [...errors.slice(mark).filter(notIgnored).map(e => e.text.split("\n")[0].slice(0, 140)), ...wins.map(w => `dialog: ${w.title} ${w.body}`.slice(0, 160))];
}
const boxOf = (frame, sel) => frame.evaluate(s => { const e = $(s).filter(":visible")[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
async function clickSel(frame, page, fb, sel) { const b = await boxOf(frame, sel); if (!b) return false; await page.mouse.click(fb.x + b.x, fb.y + b.y); return true; }
// rows of the open drop-down: id, text; height of the box
const listOf = (frame, root) => frame.evaluate(r => {
  const ul = $(r).find("ul.dropdown-menu").filter(":visible")[0];
  if (!ul) return null;
  const rect = ul.getBoundingClientRect();
  return { h: Math.round(rect.height), rows: $(ul).children("li:not(.divider):visible").map(function () { return { id: this.id, text: $(this).text().trim(), value: $(this).attr("data-value") || null }; }).get() };
}, root);
// the engine applies a font after loading it: look again for a few seconds
async function until(frame, fn, ms = 6000) { for (let t = 0; t < ms; t += 250) { try { if (await fn()) return true; } catch (e) {} await frame.waitForTimeout(250); } return false; }
const closeAll = async (frame, page) => { await page.keyboard.press("Escape"); await frame.evaluate(() => { try { Common.UI.Menu.Manager.hideAll(); } catch (e) {} }); await frame.waitForTimeout(250); };

// Click the row `pick(rows)` of the open font-name list (rows without text: names come from the store)
async function pickFont(frame, page, fb, root, comboPath, current) {
  const name = await frame.evaluate(([root, cp, cur]) => {
    const combo = cp.split(".").reduce((o, k) => o[k], window), ul = $(root).find("ul.dropdown-menu").filter(":visible")[0];
    // the list opens scrolled to the font in use (far down when it is a font of this computer): only rows inside the
    // visible part of the list can be clicked
    const box = ul.getBoundingClientRect(), inView = l => { const r = l.getBoundingClientRect(); return r.height > 0 && r.top >= box.top && r.bottom <= box.bottom; };
    const li = $(ul).find("li:visible a.font-item").toArray().map(a => a.parentNode).filter(inView);
    // a few rows down from the top of what is shown; not the font in use
    for (const l of li.slice(3).concat(li.slice(0, 3))) { const rec = combo.store.findWhere({ id: l.id }); if (rec && rec.get("name") !== cur && rec.get("name") !== "Comic Sans MS") { $(l).attr("data-pick", "1"); return rec.get("name"); } }
    return null;
  }, [root, comboPath, current]);
  if (!name) return null;
  const b = await boxOf(frame, `${root} li[data-pick=1] a`);
  await page.mouse.click(fb.x + b.x, fb.y + b.y);
  await frame.waitForTimeout(700);
  return name;
}

// ---- launch ---------------------------------------------------------------------------------------
async function withConsent(consent, run) {
  const { browser, context, page, errors } = await launch({ platform });
  if (consent) {
    await context.addInitScript(() => { try { localStorage.setItem("elixir.localfonts.consent", "1"); } catch (e) {} });
    await context.grantPermissions(["local-fonts"], { origin: BASE }).catch(() => {});
  }
  try { await run({ browser, context, page, errors }); } finally { await browser.close(); }
}

// ---- Word -----------------------------------------------------------------------------------------
const wordState = frame => frame.evaluate(() => { const tp = Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr() || {}; return { font: tp.RFonts && tp.RFonts.Ascii && tp.RFonts.Ascii.Name, size: tp.FontSize }; });
async function selectCellWord(frame, page, fb) {
  const pt = await frame.evaluate(() => {
    const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection();
    const t = d.Content[1]; t.CurCell = t.GetRow(0).GetCell(0); d.CurPos.ContentPos = 1;
    t.GetRow(0).GetCell(0).GetContent().Content[0].MoveCursorToStartPos(); d.Document_UpdateSelectionState();
    const tp = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(tp.X, tp.Y, tp.PageNum), sdk = document.getElementById("editor_sdk").getBoundingClientRect();
    return { x: sdk.left + c.X + 30, y: sdk.top + c.Y + 6 };
  });
  await page.mouse.dblclick(fb.x + pt.x, fb.y + pt.y);
  await frame.waitForTimeout(500);
  await page.mouse.click(fb.x + pt.x, fb.y + pt.y, { button: "right" });
  await frame.waitForTimeout(900);
  return pt;
}
const ctxMenuOpen = frame => frame.evaluate(() => { const v = DE.getController("DocumentHolder").documentHolder, m = v && v.currentMenu; return !!(m && m.isVisible() && $(m.el).find("li:visible").length > 3); });

async function wordSuite(tag, { page, errors }) {
  const frame = await openEditor(page, { lang: "en" });
  const fb = await (await frame.frameElement()).boundingBox();
  // a French school worksheet: a table whose cell text is in Comic Sans MS (not installed on the server)
  await setDoc(frame, ["Fiche de lecture", { table: [["Bonjour la classe", "x"], ["y", "z"]] }, "Fin"]);
  await cmd(frame, `(function(){var t=Api.GetDocument().GetElement(1);var p=t.GetRow(0).GetCell(0).GetContent().GetElement(0);p.SetFontFamily("Comic Sans MS");p.SetFontSize(26);})()`);
  await frame.waitForTimeout(500);

  // 1. mini toolbar + right-click menu together
  let mark = errors.length;
  await selectCellWord(frame, page, fb);
  record(`${tag}.word.mini-with-context-menu`, (await frame.evaluate(() => $("#mini-toolbar").hasClass("visible"))) && await ctxMenuOpen(frame), "the mini toolbar and the right-click menu did not open together");
  const st0 = await wordState(frame);
  record(`${tag}.word.setup-comic-sans-13`, st0.font === "Comic Sans MS" && st0.size === 13, JSON.stringify(st0));

  // 2. mini toolbar font-name drop-down
  await frame.evaluate(() => { window.__miniFont = DE.getController("MiniToolbar").view.cmbFontName; });
  await clickSel(frame, page, fb, "#mini-font-name .dropdown-toggle");
  await frame.waitForTimeout(800);
  let l = await listOf(frame, "#mini-font-name");
  record(`${tag}.word.mini-font-list-opens`, !!l && l.rows.length > 30 && l.h > 150, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const picked = await pickFont(frame, page, fb, "#mini-font-name", "window.__miniFont", "Comic Sans MS").catch(e => "ERR " + e);
  record(`${tag}.word.mini-font-picked-no-error`, !!picked && !/^ERR/.test(picked) && (await errorsSince(errors, mark, frame)).length === 0, `${picked} ${JSON.stringify(await errorsSince(errors, mark, frame))}`);
  const okFont = await until(frame, async () => (await wordState(frame)).font === picked);
  record(`${tag}.word.mini-font-applied`, !!picked && okFont, `picked ${picked}, engine ${JSON.stringify(await wordState(frame))}`);
  const shown = await until(frame, () => frame.evaluate(p => $("#mini-font-name input").val() === p, picked));
  record(`${tag}.word.mini-font-shown`, shown, `mini combo shows ${await frame.evaluate(() => $("#mini-font-name input").val())}, ribbon ${await frame.evaluate(() => DE.getController("Toolbar").toolbar.cmbFontName.getRawValue())}`);

  // 3. mini toolbar font-size drop-down
  await clickSel(frame, page, fb, "#mini-font-size .dropdown-toggle");
  await frame.waitForTimeout(700);
  l = await listOf(frame, "#mini-font-size");
  record(`${tag}.word.mini-size-list-not-empty`, !!l && l.rows.length >= 10 && l.h > 100, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const r18 = l && l.rows.find(r => r.text === "18");
  if (r18) { const b = await boxOf(frame, `#mini-font-size li#${r18.id} a`); await page.mouse.click(fb.x + b.x, fb.y + b.y); await frame.waitForTimeout(600); }
  const st2 = await wordState(frame);
  record(`${tag}.word.mini-size-applied`, !!r18 && st2.size === 18, JSON.stringify(st2));
  // a size that is not in the list, typed in the box of the mini toolbar
  await closeAll(frame, page);
  await selectCellWord(frame, page, fb);
  await frame.evaluate(() => { const i = $("#mini-font-size input")[0]; i.focus(); i.select(); });
  await page.keyboard.type("13"); await page.keyboard.press("Enter");
  await frame.waitForTimeout(600);
  record(`${tag}.word.mini-size-typed`, (await wordState(frame)).size === 13, JSON.stringify(await wordState(frame)));
  record(`${tag}.word.mini-no-error-after-size`, (await errorsSince(errors, mark, frame)).length === 0, JSON.stringify(await errorsSince(errors, mark, frame)));

  // 4. the right-click menu still works
  await closeAll(frame, page);
  await selectCellWord(frame, page, fb);
  record(`${tag}.word.context-menu-still-works`, await ctxMenuOpen(frame), "the right-click menu does not open any more");
  await closeAll(frame, page);

  // 5. ribbon: Home font name and size
  mark = errors.length;
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.MoveCursorToStartPos(false); for (let i = 0; i < 7; i++) d.MoveCursorRight(true, false); d.UpdateInterface(); $("#mini-toolbar").removeClass("visible"); });
  await frame.waitForTimeout(500);
  await frame.evaluate(() => { const t = DE.getController("Toolbar").toolbar; window.__rf = t.cmbFontName; t.cmbFontName.cmpEl.attr("id", "t-font"); t.cmbFontSize.cmpEl.attr("id", "t-size"); });
  await clickSel(frame, page, fb, "#t-font .dropdown-toggle");
  await frame.waitForTimeout(800);
  l = await listOf(frame, "#t-font");
  record(`${tag}.word.ribbon-font-list-opens`, !!l && l.rows.length > 30 && l.h > 150, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const rp = await pickFont(frame, page, fb, "#t-font", "window.__rf", "Comic Sans MS").catch(e => "ERR " + e);
  await until(frame, async () => (await wordState(frame)).font === rp);
  const st3 = await wordState(frame);
  record(`${tag}.word.ribbon-font-applied`, !!rp && st3.font === rp && (await errorsSince(errors, mark, frame)).length === 0, `${rp} ${JSON.stringify(st3)} ${JSON.stringify(await errorsSince(errors, mark, frame))}`);
  await clickSel(frame, page, fb, "#t-size .dropdown-toggle");
  await frame.waitForTimeout(700);
  l = await listOf(frame, "#t-size");
  record(`${tag}.word.ribbon-size-list-not-empty`, !!l && l.rows.length >= 10 && l.h > 100, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const t20 = l && l.rows.find(r => r.text === "20");
  if (t20) { const b = await boxOf(frame, `#t-size li#${t20.id} a`); await page.mouse.click(fb.x + b.x, fb.y + b.y); await frame.waitForTimeout(600); }
  record(`${tag}.word.ribbon-size-applied`, !!t20 && (await wordState(frame)).size === 20, JSON.stringify(await wordState(frame)));
  record(`${tag}.word.page-errors`, errors.filter(e => e.kind === "pageerror").length === 0, errors.filter(e => e.kind === "pageerror").map(e => e.text).join(" | ").slice(0, 200));
}

// ---- Spreadsheet and Presentation ribbons ---------------------------------------------------------
async function ribbonSuite(tag, kind, frame, page, errors, applied) {
  const fb = await (await frame.frameElement()).boundingBox();
  const ctl = kind === "cell" ? "SSE" : "PE";
  const mark = errors.length;
  await frame.evaluate(c => { const t = window[c].getController("Toolbar").toolbar; window.__rf = t.cmbFontName; t.cmbFontName.cmpEl.attr("id", "t-font"); t.cmbFontSize.cmpEl.attr("id", "t-size"); }, ctl);
  await clickSel(frame, page, fb, "#t-font .dropdown-toggle");
  await frame.waitForTimeout(800);
  let l = await listOf(frame, "#t-font");
  record(`${tag}.${kind}.ribbon-font-list-opens`, !!l && l.rows.length > 30 && l.h > 150, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const before = await applied();
  const rp = await pickFont(frame, page, fb, "#t-font", "window.__rf", before.font).catch(e => "ERR " + e);
  await until(frame, async () => (await applied()).font === rp);
  const after = await applied();
  record(`${tag}.${kind}.ribbon-font-applied`, !!rp && after.font === rp && (await errorsSince(errors, mark, frame)).length === 0, `${rp} ${JSON.stringify(after)} ${JSON.stringify(await errorsSince(errors, mark, frame))}`);
  await clickSel(frame, page, fb, "#t-size .dropdown-toggle");
  await frame.waitForTimeout(700);
  l = await listOf(frame, "#t-size");
  record(`${tag}.${kind}.ribbon-size-list-not-empty`, !!l && l.rows.length >= 10 && l.h > 100, JSON.stringify(l && { h: l.h, n: l.rows.length }));
  const r = l && l.rows.find(x => x.text === "20");
  if (r) { const b = await boxOf(frame, `#t-size li#${r.id} a`); await page.mouse.click(fb.x + b.x, fb.y + b.y); await frame.waitForTimeout(700); }
  record(`${tag}.${kind}.ribbon-size-applied`, !!r && (await applied()).size === 20 && (await errorsSince(errors, mark, frame)).length === 0, `${JSON.stringify(await applied())} ${JSON.stringify(await errorsSince(errors, mark, frame))}`);
}

async function cellSuite(tag, { page, errors }) {
  const frame = await X.openEditor(page);
  await X.select(frame, "B2");
  const applied = () => frame.evaluate(() => { const x = Asc.editor.asc_getCellInfo().asc_getXfs(); return { font: x.asc_getFontName(), size: x.asc_getFontSize() }; });
  await ribbonSuite(tag, "cell", frame, page, errors, applied);
}

async function slideSuite(tag, { context, page, errors }) {
  const fixture = path.resolve(HERE, "../fixtures/pptx/p01-cours-photosynthese.pptx");
  const up = await (await context.request.post(BASE + "/example/upload", { multipart: { uploadedFile: { name: path.basename(fixture), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: fs.readFileSync(fixture) } } })).json();
  await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(up.filename)}&lang=en`);
  const frame = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
  await frame.waitForFunction(() => window.PE && PE.getController("Main") && PE.getController("Main").api && PE.getController("Main").api.getCountPages() > 0, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  const fb = await (await frame.frameElement()).boundingBox();
  // text of the first slide's title selected
  const p = await frame.evaluate(() => { const r = (document.querySelector("#id_main_view") || document.querySelector("#editor_sdk")).getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.3 }; });
  await page.mouse.click(fb.x + p.x, fb.y + p.y); await page.waitForTimeout(300); await page.keyboard.press("Control+A"); await page.waitForTimeout(300);
  const applied = () => frame.evaluate(() => { const tp = PE.getController("Main").api.WordControl.m_oLogicDocument.GetCalculatedTextPr(); return { font: tp.RFonts && tp.RFonts.Ascii && tp.RFonts.Ascii.Name, size: tp.FontSize }; });
  await ribbonSuite(tag, "slide", frame, page, errors, applied);
}

// ---- run ------------------------------------------------------------------------------------------
for (const consent of [false, true]) {
  const tag = (platform === "mac" ? "mac" : "win") + (consent ? ".consent" : ".noconsent");
  for (const [name, fn] of [["word", wordSuite], ["cell", cellSuite], ["slide", slideSuite]]) {
    if (consent && name !== "word") continue;   // the local-fonts feature is the same module in the three editors
    await withConsent(consent, async env => {
      try { await fn(tag, env); } catch (e) { record(`${tag}.${name}.suite`, false, "exception " + String(e).split("\n")[0].slice(0, 200)); }
    });
  }
}
const fails = results.filter(r => r.status === "fail");
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), platform, pass: results.length - fails.length, fail: fails.length, results }, null, 1));
console.log(`${results.length - fails.length}/${results.length} pass, ${fails.length} fail`);
process.exit(fails.length ? 1 : 0);
