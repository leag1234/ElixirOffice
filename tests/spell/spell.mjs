#!/usr/bin/env node
// Inline spelling correction (feedback F2): right-click on a misspelled word offers the best
// suggestions, Ignore All, Add to Dictionary and Language; F7 and Review > Spelling keep working.
//   node tests/spell/spell.mjs [--out results.json]      (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, select, cmd, resetUi, focusDoc, BASE } from "../shortcuts/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "spell-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, context, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };

let frame = await openEditor(page);
let fb = await (await frame.frameElement()).boundingBox();
const wait = ms => frame.waitForTimeout(ms);

// ---- helpers (Word) -------------------------------------------------------------------------------------------
const holder = () => `DE.getController("DocumentHolder").documentHolder`;
const caretPt = (dy = 6) => frame.evaluate(([fx, fy, dy]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument; d.Document_UpdateSelectionState();
  const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
  return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y + dy };
}, [fb.x, fb.y, dy]);
const paras = () => frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(e => (e.IsTable && e.IsTable()) ? "[table]" : e.GetText().replace(/[\r\n]+$/, "")));
// underlined words of the document (0 when the checking is off)
const errorCount = () => frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Spelling.Use ? d.GetAllParagraphs().reduce((n, p) => n + p.SpellChecker.GetErrorsCount(), 0) : 0; });
// menu items: caption, bold (suggestion), disabled, submenu
const menuItems = () => frame.evaluate(h => {
  const m = eval(h).currentMenu;
  if (!m || !m.isVisible()) return null;
  return m.items.filter(it => it.el && it.el.style.display !== "none" && it.el.parentNode).map(it => it.caption === "--" ? "--" : {
    t: it.cmpEl.find("> a").clone().children(".menu-item-shortcut").remove().end().text().trim(),
    bold: it.cmpEl.hasClass("spell-suggestion"), dis: !!(it.isDisabled && it.isDisabled()), sub: !!it.menu,
  });
}, holder());
const names = items => (items || []).map(i => (i === "--" ? "--" : i.t));
const closeMenu = async () => {
  await page.keyboard.press("Escape"); await wait(150); await resetUi(frame, page);
  await frame.waitForFunction(() => !Array.from(document.querySelectorAll(".modals-mask,.asc-window")).some(w => w.getClientRects().length && getComputedStyle(w).display !== "none"), null, { timeout: 4000 }).catch(() => {});
  await page.mouse.move(5, 5); await wait(150);
};
async function rightClick(p, off) {
  await caret(frame, p, off);
  const pt = await caretPt();
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await wait(900);
}
async function clickItem(label) {
  const box = await frame.evaluate(([h, label]) => {
    const m = eval(h).currentMenu; const it = m.items.find(i => i.cmpEl && i.cmpEl.find("> a").clone().children(".menu-item-shortcut").remove().end().text().trim() === label && i.el.style.display !== "none");
    if (!it) return null; const r = it.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [holder(), label]);
  if (!box) throw new Error("no menu item " + label);
  await page.mouse.click(fb.x + box.x, fb.y + box.y);
  await wait(500);
}
// open the Language sub-menu of the open spelling menu (real hover) and list it
async function languageItems() {
  const box = await frame.evaluate(h => { const it = eval(h).currentMenu.items.find(i => i.cmpEl && /^Language/.test(i.caption) && i.el.style.display !== "none"); if (!it) return null; const r = it.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, holder());
  if (!box) return null;
  await page.mouse.move(fb.x + box.x, fb.y + box.y);
  await wait(800);
  return frame.evaluate(h => { const it = eval(h).currentMenu.items.find(i => i.menu && /^Language/.test(i.caption)); const m = it.menu; if (!m.isVisible()) return null;
    return m.items.filter(i => i.el && i.el.style.display !== "none").map(i => i.caption === "--" ? "--" : { t: i.caption, checked: !!i.checked, value: i.value }); }, holder());
}
const idx = (list, label) => list.indexOf(label);
const before = (list, a, b) => idx(list, a) > -1 && idx(list, b) > -1 && idx(list, a) < idx(list, b);
const noSep = l => l.filter(x => x !== "--");

// ---- 1. Word: the menu on a misspelled word -------------------------------------------------------------------------
await setDoc(frame, ["This sentense has a mistake.", "Another sentense here."]);
await wait(2500);
await rightClick(0, 8);
let items = await menuItems(), list = names(items);
const firstSep = list.indexOf("--");
const sugg = (items || []).slice(0, firstSep > 0 ? firstSep : 0);
record("word.menu.suggestions-on-top", sugg.length >= 1 && sugg.length <= 5 && sugg.every(i => i.bold && !i.dis) && sugg.some(i => /^sentence$/i.test(i.t)), JSON.stringify(list.slice(0, 8)));
record("word.menu.no-more-submenu", !list.some(t => /more/i.test(t)), JSON.stringify(list));
record("word.menu.order", before(noSep(list), "Ignore All", "Add to Dictionary") && before(noSep(list), "Add to Dictionary", "Language") && before(noSep(list), "Language", "Cut"), JSON.stringify(noSep(list)));
record("word.menu.no-ignore-once", !list.includes("Ignore"), JSON.stringify(list));
record("word.menu.suggestions-bold-others-not", (items || []).filter(i => i !== "--" && !sugg.includes(i)).every(i => !i.bold), "");
const langs = await languageItems();
const lnames = names(langs);
record("word.language.submenu-compact", !!langs && langs.length <= 8 && lnames.includes("Set Proofing Language...") && langs.some(i => i !== "--" && i.checked && /English/.test(i.t)), JSON.stringify(langs));
await closeMenu();

// ---- 2. picking a suggestion: one undo step ----------------------------------------------------------------------------
await rightClick(0, 8);
const histBefore = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.History.Index);
await clickItem("sentence");
let t = await paras();
record("word.pick.replaces-word", t[0] === "This sentence has a mistake.", JSON.stringify(t));
const histAfter = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.History.Index);
await focusDoc(frame);
await page.keyboard.press("ControlOrMeta+z");
await wait(400);
t = await paras();
record("word.pick.one-undo-step", t[0] === "This sentense has a mistake." && histAfter > histBefore, JSON.stringify({ t0: t[0], histBefore, histAfter }));
await page.keyboard.press("ControlOrMeta+y"); await wait(300);
record("word.pick.redo", (await paras())[0] === "This sentence has a mistake.", "");
await closeMenu();

// ---- 3. no suggestion: greyed entry --------------------------------------------------------------------------------------
await setDoc(frame, ["Try qzxwvkjh now."]);
await wait(2500);
await rightClick(0, 6);
items = await menuItems(); list = names(items);
const ns = (items || []).find(i => i !== "--" && /No Spelling Suggestions/.test(i.t));
record("word.nosuggestion.greyed-entry", !!ns && ns.dis && !ns.bold, JSON.stringify(list.slice(0, 6)));
record("word.nosuggestion.still-ignore-add", list.includes("Ignore All") && list.includes("Add to Dictionary"), JSON.stringify(list));
await closeMenu();

// ---- 4. Ignore All -------------------------------------------------------------------------------------------------------
await setDoc(frame, ["Try blorptastic now.", "A blorptastic word again."]);
await wait(2500);
const e0 = await errorCount();
await rightClick(0, 6);
await clickItem("Ignore All");
await wait(800);
record("word.ignore-all.clears-all-occurrences", e0 >= 2 && (await errorCount()) === 0, `errors before ${e0}, after ${await errorCount()}`);
record("word.ignore-all.text-unchanged", (await paras()).join("|") === "Try blorptastic now.|A blorptastic word again.", "");
await closeMenu();

// ---- 5. Add to Dictionary: kept, applies to a new document ----------------------------------------------------------
await frame.evaluate(() => { try { Asc.editor.asc_spellCheckClearDictionary(); } catch (e) {} });
await setDoc(frame, ["The zorbulax is here.", "The zorbulax again."]);
await wait(2500);
await rightClick(0, 6);
items = await menuItems(); list = names(items);
record("word.dictionary.entry-in-browser", list.includes("Add to Dictionary"), JSON.stringify(list));
await clickItem("Add to Dictionary");
await wait(800);
record("word.dictionary.clears-underline", (await errorCount()) === 0, "errors " + await errorCount());
const stored = await frame.evaluate(() => localStorage.getItem("elixir-user-dictionary"));
record("word.dictionary.persisted", !!stored && stored.includes("zorbulax"), String(stored));
await closeMenu();
// a new document of the same browser: the word is accepted, a lower-case word is accepted capitalized
frame = await openEditor(page); fb = await (await frame.frameElement()).boundingBox();
await setDoc(frame, ["Zorbulax and zorbulax, but also blorptastic."]);
await wait(2500);
const nErr = await errorCount();
record("word.dictionary.new-document", nErr === 1, "errors " + nErr + " (only blorptastic expected)");
await frame.evaluate(() => Asc.editor.asc_spellCheckClearDictionary());

// ---- 6. word in a table cell: same flat menu ------------------------------------------------------------------------------
await setDoc(frame, ["before", { table: [["a sentense", "b"], ["c", "d"]] }, "after"]);
await wait(2500);
// cells filled through the builder are only checked once edited (loaded documents are checked at once)
await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = d.Content[1].Content[0].Content[0].Content.Content[0]; d.RemoveSelection(); p.Document_SetThisElementCurrent(false); p.MoveCursorToEndPos(); d.Document_UpdateSelectionState(); });
await focusDoc(frame);
await page.keyboard.type("x"); await page.keyboard.press("Backspace");
await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = d.Content[1].Content[0].Content[0].Content.Content[0]; p.MoveCursorToStartPos(); for (let i = 0; i < 6; i++) p.MoveCursorRight(false, false); d.Document_UpdateSelectionState(); });
await focusDoc(frame);
await wait(2500);
{ const pt = await caretPt(); await page.mouse.click(pt.x, pt.y, { button: "right" }); await wait(900); }
items = await menuItems(); list = names(items);
const ts = (items || []).slice(0, list.indexOf("--") > 0 ? list.indexOf("--") : 0);
record("word.table.suggestions-on-top", ts.length >= 1 && ts.every(i => i.bold) && ts.some(i => /sentence/i.test(i.t)), JSON.stringify(list.slice(0, 8)));
record("word.table.same-actions", before(noSep(list), "Ignore All", "Add to Dictionary") && before(noSep(list), "Add to Dictionary", "Language") && !list.includes("Spellcheck"), JSON.stringify(noSep(list)));
await clickItem(ts[0].t);
t = await paras();
const cellText = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content[1].Content[0].Content[0].Content.GetText().replace(/[\r\n]+$/, ""));
record("word.table.pick-replaced-word", /sentence/.test(cellText) && !/sentense/.test(cellText), cellText);
await closeMenu();

// ---- 7. F7 and Review > Spelling -------------------------------------------------------------------------------------------
await setDoc(frame, ["alpha bta gamma"]);
await wait(2500);
await caret(frame, 0, 0);
await focusDoc(frame);
await page.keyboard.press("F7");
await wait(1200);
items = await menuItems(); list = names(items);
record("word.f7.opens-suggestions", !!items && list.some((x, i) => items[i] !== "--" && items[i].bold) && list.includes("Ignore All"), JSON.stringify(list.slice(0, 8)));
await closeMenu();
// Review > Spelling switches the checking off and on
await setDoc(frame, ["This sentense has a mistake."]);
await wait(2500);
const on0 = await errorCount();
const spellingOff = await frame.evaluate(() => { const rv = DE.getController("Common.Controllers.ReviewChanges"); const b = rv.view.btnsSpelling && rv.view.btnsSpelling[0]; return !!b; });
record("word.review.spelling-button-present", spellingOff, "");
await frame.evaluate(() => { const rv = DE.getController("Common.Controllers.ReviewChanges"); rv.onTurnSpelling("off"); });
await wait(1200);
record("word.review.spelling-off-clears", on0 >= 1 && (await errorCount()) === 0, `before ${on0}, after ${await errorCount()}`);
await rightClick(0, 8);
items = await menuItems(); list = names(items);
record("word.review.spelling-off-menu-has-no-spelling-items", !list.includes("Ignore All") && !list.includes("Add to Dictionary"), JSON.stringify(list.slice(0, 6)));
await closeMenu();
await frame.evaluate(() => DE.getController("Common.Controllers.ReviewChanges").onTurnSpelling("on"));
await wait(2500);
record("word.review.spelling-on-again", (await errorCount()) >= 1, "errors " + await errorCount());
await rightClick(0, 8);
items = await menuItems(); list = names(items);
record("word.review.spelling-on-menu-back", list.includes("Ignore All"), JSON.stringify(list.slice(0, 6)));
await closeMenu();

// ---- 8. Language sub-menu: Set Proofing Language... opens the Language dialog ---------------------------------------------
await setDoc(frame, ["This sentense has a mistake."]);
await wait(2500);
await rightClick(0, 8);
let lm = await languageItems();
const setBox = await frame.evaluate(h => { const it = eval(h).currentMenu.items.find(i => i.menu && /^Language/.test(i.caption)); const s = it.menu.items.find(i => i.value === "lang"); if (!s) return null; const r = s.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, holder());
if (setBox) { await page.mouse.click(fb.x + setBox.x, fb.y + setBox.y); await wait(900); }
const dlg = await frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length && getComputedStyle(w).display !== "none").map(w => (w.querySelector(".title") || {}).textContent || "").join("|"));
record("word.language.set-proofing-opens-dialog", !!setBox && /language/i.test(dlg), "windows: " + dlg);
await closeMenu();
// a recent language in the sub-menu applies at once
await rightClick(0, 8);
lm = await languageItems();
const fr = await frame.evaluate(() => DE.getController("Main").languages.find(x => x.code === 1036));
await closeMenu();
record("word.language.recent-setup", !!fr, "no fr-FR in the list of languages");
if (fr) {
  await frame.evaluate(code => { const prev = (Common.localStorage.getItem("app-settings-recent-langs") || ""); Common.localStorage.setItem("app-settings-recent-langs", code + ";" + prev); }, fr.value);
  await select(frame, 0, 5, 13);
  await rightClick(0, 8);
  // the right-click leaves the selection untouched when it is inside it
  lm = await languageItems();
  const frItem = (lm || []).find(i => i !== "--" && i.t === fr.displayValue);
  record("word.language.recent-listed", !!frItem, JSON.stringify(lm));
  if (frItem) {
    const b = await frame.evaluate(([h, cap]) => { const it = eval(h).currentMenu.items.find(i => i.menu && /^Language/.test(i.caption)); const s = it.menu.items.find(i => i.caption === cap); const r = s.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [holder(), fr.displayValue]);
    await page.mouse.click(fb.x + b.x, fb.y + b.y); await wait(600);
    const lang = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll && 0; const p = d.Content[0]; const r = p.Content.find(x => x.Lang); let l = null; p.Content.forEach(x => { if (x.Pr && x.Pr.Lang && x.Pr.Lang.Val) l = l || x.Pr.Lang.Val; }); return l; });
    record("word.language.pick-applies", lang === fr.code, "lang " + lang + " expected " + fr.code);
  }
  await closeMenu();
}

// ---- 9. Presentation: text of the title placeholder ------------------------------------------------------------------------
await page.goto(`${BASE}/example/editor?fileExt=pptx&lang=en`);
const pf = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
await pf.waitForFunction(() => window.PE && PE.getController("Main") && PE.getController("Main").api && PE.getController("Main").api.getCountPages() > 0, null, { timeout: 90000 });
await page.waitForTimeout(4000);
const pfb = await (await pf.frameElement()).boundingBox();
const pcmd = src => pf.evaluate(src => new Promise(res => Asc.editor.callCommand(src, true, r => res(r))), src);
await pcmd(`(function(){ var s = Api.GetPresentation().GetSlideByIndex(0); var sh = s.GetAllShapes()[0]; sh.GetDocContent().GetElement(0).AddText("A sentense with erors"); return 1; })()`);
await page.waitForTimeout(3000);
const pholder = () => `PE.getController("DocumentHolder").documentHolder`;
const pmenu = () => pf.evaluate(h => { const m = eval(h).currentMenu; if (!m || !m.isVisible()) return null; return m.items.filter(it => it.el && it.el.style.display !== "none" && it.el.parentNode).map(it => it.caption === "--" ? "--" : { t: it.cmpEl.find("> a").clone().children(".menu-item-shortcut").remove().end().text().trim(), bold: it.cmpEl.hasClass("spell-suggestion") }); }, pholder());
const sdk = await pf.evaluate(() => { const r = (document.querySelector("#id_main_view") || document.querySelector("#editor_sdk")).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
// the title text is centered: scan along its line for a point where a double click + right click gives the spelling menu
let pm = null;
scan: for (const fy of [0.33, 0.37, 0.41, 0.29]) for (let fx = 0.34; fx <= 0.66; fx += 0.03) {
  const x = pfb.x + sdk[0] + sdk[2] * fx, y = pfb.y + sdk[1] + sdk[3] * fy;
  await page.mouse.dblclick(x, y); await page.waitForTimeout(250);
  await page.mouse.click(x, y, { button: "right" }); await page.waitForTimeout(700);
  const m = await pmenu();
  if (m && m.some(i => i !== "--" && i.t === "Ignore All")) { pm = m; break scan; }
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await pf.evaluate(() => { try { Common.UI.Menu.Manager.hideAll(); } catch (e) {} });
}
const pl = names(pm || []);
record("slide.menu.suggestions-on-top", !!pm && pm[0] !== "--" && pm[0].bold && pl.includes("Ignore All") && pl.includes("Add to Dictionary") && !pl.includes("Ignore") && before(pl, "Add to Dictionary", "Language"), JSON.stringify(pl.slice(0, 10)));
if (pm && pm[0] !== "--" && pm[0].bold) {
  const word = pm[0].t;
  const box = await pf.evaluate(([h, cap]) => { const it = eval(h).currentMenu.items.find(i => i.cmpEl && i.cmpEl.find("> a").text().trim() === cap && i.el.style.display !== "none"); const r = it.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [pholder(), word]);
  await page.mouse.click(pfb.x + box.x, pfb.y + box.y); await page.waitForTimeout(700);
  const txt = await pcmd(`(function(){ var sh = Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0]; return sh.GetDocContent().GetElement(0).GetText(); })()`);
  record("slide.pick.replaces-word", typeof txt === "string" && txt.includes(word) && /^A /.test(txt) && txt.length >= 10, String(txt) + " / picked " + word);
}
await page.keyboard.press("Escape");

// ---- errors -------------------------------------------------------------------------------------------------------------------------------
const bad = errors.filter(e => !/404/.test(e.text));
record("no-page-errors", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
const failed = results.filter(r => r.status !== "pass");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
