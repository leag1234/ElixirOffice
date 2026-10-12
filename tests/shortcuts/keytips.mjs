#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// KeyTips (ribbon access keys) like Word: Alt, then the tab letter, then the command letters.
//   node tests/shortcuts/keytips.mjs [screenshot dir] [--out results.json]
// Ids are those of docs/shortcuts-word.csv (scope keytips) plus kt.* checks of this suite.
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, setDoc, select, state, focusDoc, resetUi, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args[0] && !args[0].startsWith("--") ? args[0] : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "keytips-latest.json");
shots && fs.mkdirSync(shots, { recursive: true });

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : (reason || String(ok)) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + (reason || ok))); };

const badges = () => frame.evaluate(() => Array.from(document.querySelectorAll(".hint-div")).filter(h => h.offsetParent !== null).map(h => {
  const r = h.getBoundingClientRect();
  const under = document.elementsFromPoint(r.left + r.width / 2, r.top - 4).find(e => !e.classList.contains("hint-div")) || null;
  return { t: h.textContent, x: Math.round(r.left), y: Math.round(r.top), inToolbar: !!(under && under.closest("#toolbar")) };
}));
const activeTab = () => frame.evaluate(() => $("#toolbar .ribtab.active > a").attr("data-tab"));
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await frame.waitForTimeout(250); } };
const alt = async () => { await page.keyboard.down("Alt"); await page.keyboard.up("Alt"); await frame.waitForTimeout(300); };
async function reset() { await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await resetUi(frame, page); await frame.evaluate(() => { $("#toolbar a[data-tab=home]").click(); }); await frame.waitForTimeout(200); await focusDoc(frame); }

await setDoc(frame, ["alpha beta"]);
await select(frame, 0, 0, 5);

// level 0: tabs with Word's letters
await alt();
let b = await badges();
const tipOf = async tab => frame.evaluate(t => { const a = $(`#toolbar a[data-tab=${t}]`)[0]; if (!a) return null; const r = a.getBoundingClientRect(); const hs = Array.from(document.querySelectorAll(".hint-div")).filter(h => h.offsetParent); let best = null, d = 1e9; for (const h of hs) { const q = h.getBoundingClientRect(); const dd = Math.abs((q.left + q.width / 2) - (r.left + r.width / 2)) + Math.abs(q.top - r.bottom); if (dd < d) { d = dd; best = h.textContent; } } return d < 30 ? best : null; }, tab);
const want = { file: "F", home: "H", ins: "N", draw: "JI", design: "G", layout: "P", links: "S", mailings: "M", review: "R", view: "W" };
for (const [tab, letter] of Object.entries(want)) {
  const got = await tipOf(tab);
  const id = { file: "ribbon.file", home: "ribbon.home", ins: "ribbon.insert", design: "ribbon.design", layout: "ribbon.layout", links: "ribbon.references", mailings: "ribbon.mailings", review: "ribbon.review", view: "ribbon.view", draw: "kt.tab-draw" }[tab];
  record(id + ".letter", got === letter, `tab ${tab} shows ${got}, Word: ${letter}`);
}
record("kt.level0-only-ribbon", b.every(x => x.y < 140), `badges outside the ribbon and title bar: ${JSON.stringify(b.filter(x => x.y >= 140).map(x => x.t))}`);
shots && await page.screenshot({ path: `${shots}/interact-keytips-tabs.png`, clip: { x: 0, y: 0, width: 1440, height: 170 } });
record("ribbon.keytips", b.length > 5, `${b.length} badges after Alt`);

// Alt, H: Home commands; 1 = Bold
await press("h");
b = await badges();
const has = (t) => b.some(x => x.t === t);
record("kt.home-letters", ["1", "2", "3", "FF", "FS", "AL", "AC", "U", "N", "V"].every(has), `Home badges: ${b.map(x => x.t).join(" ")}`);
shots && await page.screenshot({ path: `${shots}/interact-keytips-home.png`, clip: { x: 0, y: 0, width: 1440, height: 210 } });
await press("1");
record("kt.home-bold", (await state(frame)).text.bold === true, "Alt, H, 1 did not apply bold");
record("ribbon.home", true);

// Alt, H, F, F: font name box
await reset(); await select(frame, 0, 0, 5);
await alt(); await press("h", "f", "f");
record("kt.font-name", await frame.evaluate(() => { const a = document.activeElement; return !!(a && a.closest && a.closest("#toolbar") && a.tagName === "INPUT"); }), "focus is not in the font name box");

// Alt, N: Insert tab, Esc back to the tabs, Esc closes
await reset(); await alt(); await press("n");
record("ribbon.insert", (await activeTab()) === "ins", `active tab ${await activeTab()}`);
b = await badges();
record("kt.insert-letters", ["T", "P", "SH", "C", "I", "X", "E", "U"].every(t => b.some(x => x.t === t)), `Insert badges: ${b.map(x => x.t).join(" ")}`);
await press("Escape");
b = await badges();
record("kt.escape-back", b.some(x => x.t === "H") && b.some(x => x.t === "N"), "Esc did not return to the tab KeyTips");
await press("Escape");
record("kt.escape-close", (await badges()).length === 0, "badges still visible after Esc, Esc");

for (const [id, letter, tab] of [["ribbon.design", "g", "design"], ["ribbon.layout", "p", "layout"], ["ribbon.references", "s", "links"], ["ribbon.review", "r", "review"], ["ribbon.view", "w", "view"]]) {
  await reset(); await alt(); await press(letter);
  record(id, (await activeTab()) === tab, `Alt, ${letter.toUpperCase()}: active tab ${await activeTab()}`);
}

// Alt, N, M (SmartArt), Alt, N, W (WordArt)
for (const [id, seq, check] of [["edit.smartart", ["n", "m"], () => frame.evaluate(() => $(".dropdown-menu:visible, .asc-window:visible").length > 0)], ["edit.wordart", ["n", "w"], () => frame.evaluate(() => $(".dropdown-menu:visible").length > 0)]]) {
  await reset(); await alt(); await press(...seq);
  record(id, await check(), "no gallery opened");
}

// Alt, H, V, S: Paste Special from the Paste menu
await reset(); await select(frame, 0, 0, 5); await alt(); await press("h", "v", "s");
record("edit.paste-special.menu", /paste special/i.test(await frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length).map(w => w.textContent).join("|"))), "Alt, H, V, S did not open the Paste Special dialog");
await press("Escape"); await reset();

// Alt, R, P: the list of comments (Comments pane)
await reset(); await alt(); await press("r", "p");
record("review.comments-list", await frame.evaluate(() => $("#left-panel-comments:visible").length > 0), "Alt, R, P did not open the Comments pane");
await frame.evaluate(() => { try { DE.getController("LeftMenu").leftMenu.close(); } catch (e) {} }); await reset();

// Alt, F: backstage
await reset(); await alt(); await press("f");
record("ribbon.file", await frame.evaluate(() => $("#file-menu-panel").is(":visible")), "backstage not open");
await press("Escape", "Escape"); await reset();

// F10 toggles the KeyTips
await press("F10");
const onF10 = (await badges()).length;
await press("F10");
record("ribbon.keytips.f10", onF10 > 5 && (await badges()).length === 0, `F10: ${onF10} badges, then ${(await badges()).length}`);

// Alt+H held together
await reset(); await select(frame, 0, 0, 5);
await page.keyboard.down("Alt"); await page.keyboard.press("h"); await page.keyboard.up("Alt"); await frame.waitForTimeout(300);
b = await badges();
record("kt.alt-h-chord", (await activeTab()) === "home" && b.some(x => x.t === "1"), `Alt+H: tab ${await activeTab()}, badges ${b.map(x => x.t).join(" ")}`);
await reset();

// Alt+I stays the Elixir AI bar, without KeyTips
await page.keyboard.press("Alt+i"); await frame.waitForTimeout(400);
const aiOpen = await frame.evaluate(() => { const bar = document.getElementById("elixir-ai-bar"); return !!bar && bar.style.display !== "none"; });
record("kt.alt-i-ai", aiOpen && (await badges()).length === 0, `AI bar ${aiOpen}, ${(await badges()).length} badges`);
await focusDoc(frame); await press("Escape"); await reset();

// quick access toolbar: numbers, under the buttons
await alt();
b = await badges();
// (a disabled button, Save without changes, has no badge, as in the hint manager)
const qat = b.filter(x => x.y < 50 && x.x < 400);
record("kt.qat-numbers", qat.length >= 2 && qat.filter(x => /^\d$/.test(x.t)).length >= 2 && qat.every(x => x.y > 15), `title bar badges: ${JSON.stringify(qat)}`);
await reset();

// Word letters on the buttons of the Word ribbon layout: Alt, P (Layout): M Margins, B Breaks
await reset(); await alt(); await press("p");
b = await badges();
record("kt.layout-letters", ["M", "O", "SZ", "J", "B"].every(t => b.some(x => x.t === t)), `Layout badges: ${b.map(x => x.t).join(" ")}`);
await press("b");
record("kt.layout-breaks", await frame.evaluate(() => $("#toolbar .dropdown-menu:visible").length > 0), "Alt, P, B did not open the Breaks menu");
await reset();

// Alt, Q: the command search of the title bar
await reset(); await alt(); await press("q");
record("kt.search-q", await frame.evaluate(() => !!(document.activeElement && document.activeElement.classList.contains("elx-search-input"))), "Alt, Q did not focus the title-bar search");
await press("Escape"); await reset();

// contextual tabs: Table Design JT, Layout JL (caret in a table)
await setDoc(frame, ["before", { table: [["a1", "b1"], ["a2", "b2"]] }, "after"]);
await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.Content[1].MoveCursorToStartPos(); d.Content[1].Document_SetThisElementCurrent(true); d.UpdateInterface(); });
await frame.waitForTimeout(500);
await alt();
for (const [tab, letter] of [["tabledesign", "JT"], ["tablelayout", "JL"]]) {
  const got = await tipOf(tab);
  record(`kt.tab-${tab}`, got === letter, `tab ${tab} shows ${got}, Word: ${letter}`);
}
await press("j", "t");
record("kt.tab-tabledesign.open", (await activeTab()) === "tabledesign", `Alt, J, T: active tab ${await activeTab()}`);
await reset(); await setDoc(frame, ["alpha beta"]);

// keyboard navigation in the ribbon (Word: Alt, then Tab, arrows, Enter...)
const focused = () => frame.evaluate(() => { const a = document.activeElement; return { id: a.id || "", index: DE.getController("WordKeyTips").ribbonControls().index(a), inPanel: !!$(a).closest("#toolbar .panel.active").length, tab: !!$(a).closest(".ribtab").length, group: $(a).closest(".group").index(), hint: $(a).closest("[data-original-title]").attr("data-original-title") || $(a).attr("aria-label") || "" }; });
await reset(); await select(frame, 0, 0, 5);
await alt(); await press("Tab");
let f = await focused();
record("ribbon.focus-commands", f.inPanel, `focus after Alt, Tab: ${JSON.stringify(f)}`);
const f0 = f;
await press("ArrowRight");
f = await focused();
record("ribbon.items", f.inPanel && f.index !== f0.index, `Right arrow: ${JSON.stringify(f)}`);
await press("Control+ArrowRight");
const fg = await focused();
record("ribbon.groups", fg.inPanel && fg.group !== f.group, `Ctrl+Right: ${JSON.stringify(f)} -> ${JSON.stringify(fg)}`);
// Enter on Bold (on a fresh, not bold, text)
await reset(); await setDoc(frame, ["alpha beta"]); await select(frame, 0, 0, 5); await frame.waitForTimeout(400);
await frame.evaluate(() => { const b = DE.getController("Toolbar").toolbar.btnBold.cmpEl; const el = b.is("button") ? b : b.find("button").first(); Asc.editor.asc_enableKeyEvents(false); el[0].focus(); });
const before = await frame.evaluate(() => document.activeElement.id);
await press("Enter");
const sa = await state(frame);
record("ribbon.activate", sa.text.bold === true, `Enter on the focused Bold button did not apply bold (focus ${before}, ${sa.paras.length} paragraph(s), selected ${JSON.stringify(sa.selected)})`);
// Down opens the list of a split button (Bullets), Down moves in the menu
await reset();
await frame.evaluate(() => { const b = DE.getController("Toolbar").toolbar.btnMarkers.cmpEl; const el = b.find("button").first(); Asc.editor.asc_enableKeyEvents(false); el[0].focus(); });
await press("ArrowDown");
record("ribbon.open-list", await frame.evaluate(() => $("#toolbar .dropdown-menu:visible").length > 0), "Down did not open the Bullets gallery");
await reset();
await frame.evaluate(() => { $("#toolbar a[data-tab=layout]").click(); const rv = DE.getController("RibbonTabs") && DE.getController("RibbonTabs").view; const b = (rv && rv.btnLayBreaks ? rv.btnLayBreaks : DE.getController("Toolbar").toolbar.btnsPageBreak[1]).cmpEl; const el = b.find("button").first(); Asc.editor.asc_enableKeyEvents(false); el[0].focus(); });
await frame.waitForTimeout(200);
await press("Alt+ArrowDown");
record("ribbon.open-menu", await frame.evaluate(() => $("#toolbar .dropdown-menu:visible").length > 0), "Alt+Down did not open the Breaks menu");
const item0 = await frame.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
await press("ArrowDown");
const item1 = await frame.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
record("ribbon.menu-next", item1 && item1 !== item0, `menu focus ${JSON.stringify(item0)} -> ${JSON.stringify(item1)}`);
// a submenu opens with Right (Word's Breaks menu is flat: Home > Borders, Line Style)
await reset();
await frame.evaluate(() => { const b = DE.getController("Toolbar").toolbar.btnBorders.cmpEl; const el = b.find("button").first(); Asc.editor.asc_enableKeyEvents(false); el[0].focus(); });
await frame.waitForTimeout(200);
await press("Alt+ArrowDown");
let sub = false;
for (let i = 0; i < 16 && !sub; i++) {
  if (await frame.evaluate(() => $(document.activeElement).parent().hasClass("dropdown-submenu"))) {
    await press("ArrowRight");
    sub = await frame.evaluate(() => $("#toolbar .dropdown-menu:visible").length > 1);
    break;
  }
  await press("ArrowDown");
}
record("ribbon.submenu", sub, "no submenu opened with Right in the Borders menu");
// Ctrl+Shift+F10: the ScreenTip of the focused control
await reset();
await frame.evaluate(() => { const b = DE.getController("Toolbar").toolbar.btnItalic.cmpEl; const el = b.is("button") ? b : b.find("button").first(); Asc.editor.asc_enableKeyEvents(false); el[0].focus(); });
await press("Control+Shift+F10");
await frame.waitForTimeout(900);
record("ribbon.tooltip", await frame.evaluate(() => $(".tooltip:visible").length > 0), "no ScreenTip after Ctrl+Shift+F10");
await reset();

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("kt.no-page-error", pageErrors.length === 0, pageErrors.map(e => e.text).join(" | ").slice(0, 200));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
await browser.close();
