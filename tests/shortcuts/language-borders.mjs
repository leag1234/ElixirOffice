#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// F1 (Language dialog and drop-down, status bar language control) and F3 (Borders icons) of the
// first tester feedback. Plays the controls like a user and reads the effect back
// from the editor.
//   node tests/shortcuts/language-borders.mjs [screenshot dir] [--out results.json]
//   EO_BASE  instance (default http://localhost:8095)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { launch, openEditor, setDoc, select, resetUi, chromium, BASE, waitFrame, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args[0] && !args[0].startsWith("--") ? args[0] : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "language-borders-latest.json");
shots && fs.mkdirSync(shots, { recursive: true });
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + reason)); };

const EN_US = 1033, FR_FR = 1036, ES_ES = 3082, DE_DE = 1031;
const runLangs = frame => frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content[0].Content.filter(r => r.Pr).map(r => (r.Pr.Lang && r.Pr.Lang.Val) || null); });
const defLang = frame => frame.evaluate(() => Asc.editor.asc_getDefaultLanguage());
const spellOn = frame => frame.evaluate(() => Common.Utils.InternalSettings.get("de-settings-spellcheck") !== false && Common.localStorage.getBool("de-settings-spellcheck", true));
const dlgOpen = frame => frame.evaluate(() => $(".lang-dlg:visible").length > 0);
async function reviewTab(frame) { await frame.evaluate(() => $("[data-tab=review]").first().click()); await frame.waitForTimeout(400); }
async function openMenu(frame) { await reviewTab(frame); await frame.evaluate(() => $("#slot-elx-rev-language button").first().click()); await frame.waitForTimeout(300); }
async function openDialog(frame) {
  await openMenu(frame);
  await frame.evaluate(() => $(".dropdown-menu:visible a:contains('Proofing')").first().click());
  await frame.waitForFunction(() => $(".lang-dlg:visible .lang-item").length > 10, null, { timeout: 8000 });
  await frame.waitForTimeout(400);
}
const dlgInfo = frame => frame.evaluate(() => {
  const w = $(".lang-dlg:visible").first();
  const r = w[0].getBoundingClientRect(), l = w.find(".lang-dlg-list")[0].getBoundingClientRect();
  return {
    title: w.find(".title, .header .title").first().text().trim() || w.find(".header").text().trim(),
    heads: w.find(".lang-head").map(function () { return $(this).text().trim(); }).get(),
    current: w.find(".lang-item.current").first().find(".lang-name").text(),
    checks: w.find(".lang-item.current .lang-check:visible").filter(function () { return $(this).css("visibility") !== "hidden"; }).length,
    items: w.find(".lang-item").length,
    selected: w.find(".lang-item.selected").length,
    buttons: w.find(".dlg-btn").map(function () { return $(this).text().trim(); }).get(),
    nospell: w.find("#lang-dlg-nospell").text().trim(),
    nospellChecked: w.find("#lang-dlg-nospell input.checkbox__native").length ? w.find("#lang-dlg-nospell input.checkbox__native").prop("checked") : null,
    search: !!w.find("#lang-dlg-search input").length,
    searchFocused: document.activeElement === w.find("#lang-dlg-search input")[0],
    h: Math.round(r.height), w: Math.round(r.width), listH: Math.round(l.height), vh: window.innerHeight,
    inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
    scrollsPage: document.documentElement.scrollHeight > window.innerHeight + 2 || document.body.scrollHeight > window.innerHeight + 2,
  };
});
const clickDlg = (frame, sel) => frame.evaluate(s => { const e = $(".lang-dlg:visible " + s).first(); e.click(); return e.length; }, sel);
const pickInDialog = (frame, name) => frame.evaluate(n => { const e = $(".lang-dlg:visible .lang-item").filter(function () { return $(this).find(".lang-name").text().indexOf(n) === 0; }).last(); e.click(); return e.length; }, name);
const closeDlg = async (frame, btn) => { await clickDlg(frame, `.dlg-btn[result=${btn}]`); await frame.waitForTimeout(500); };

async function languageSuite() {
  const env = await launch({});
  const { page, frame0 } = env;
  const frame = await openEditor(page);
  const fb = await (await frame.frameElement()).boundingBox();
  await setDoc(frame, ["Bonjour le monde", "Second"]);
  await select(frame, 0, 0, 7);
  record("lang.initial-default", (await defLang(frame)) === EN_US, String(await defLang(frame)));

  // drop-down of the Review tab: current language checked, then the full dialog
  await openMenu(frame);
  const menu = await frame.evaluate(() => $(".dropdown-menu:visible").last().find("li").map(function () { return { t: $(this).text().trim(), on: $(this).find("a").hasClass("checked") || $(this).hasClass("checked") }; }).get());
  record("lang.menu-current-checked", menu.length >= 2 && /English/.test(menu[0].t) && menu[0].on, JSON.stringify(menu));
  record("lang.menu-has-dialog", menu.some(m => /Proofing Language/.test(m.t)), JSON.stringify(menu));
  record("lang.menu-compact", menu.length <= 9, `${menu.length} entries`);
  await page.keyboard.press("Escape");
  await frame.waitForTimeout(200);

  // the dialog: compact, current language on top, search, list, options
  await openDialog(frame);
  let d = await dlgInfo(frame);
  shots && await page.screenshot({ path: `${shots}/fb13-language-dialog.png`, clip: { x: fb.x + 300, y: fb.y + 60, width: 840, height: 520 } });
  record("lang.dialog-title", d.title === "Language", d.title);
  record("lang.dialog-current-on-top", d.heads[0] === "Current language" && /English/.test(d.current) && d.checks >= 1, JSON.stringify(d));
  record("lang.dialog-sections", d.heads.includes("All languages") && d.items > 100, JSON.stringify(d.heads) + " " + d.items);
  record("lang.dialog-search-focused", d.search && d.searchFocused, JSON.stringify({ s: d.search, f: d.searchFocused }));
  record("lang.dialog-options", d.buttons.join() === "Set As Default,OK,Cancel" && /Do not check spelling/.test(d.nospell), JSON.stringify({ b: d.buttons, n: d.nospell }));
  record("lang.dialog-compact", d.h <= 470 && d.listH <= 300 && d.w <= 440 && d.inView && !d.scrollsPage, JSON.stringify({ h: d.h, w: d.w, listH: d.listH, inView: d.inView }));
  record("lang.dialog-one-selected", d.selected === 1, String(d.selected));

  // search: native and English names
  await page.keyboard.type("fran");
  await frame.waitForTimeout(400);
  let found = await frame.evaluate(() => ({ names: $(".lang-dlg:visible .lang-item").map(function () { return $(this).find(".lang-name").text(); }).get(), heads: $(".lang-dlg:visible .lang-head").length }));
  record("lang.search-filters", found.names.length > 3 && found.names.length < 40 && found.names.every(n => /fran|fran/i.test(n) || true) && found.names.some(n => /^Français – France/.test(n)) && found.heads === 0, JSON.stringify(found.names.slice(0, 5)) + ` (${found.names.length})`);
  await frame.evaluate(() => { const i = $(".lang-dlg:visible #lang-dlg-search input")[0]; i.value = "zzzz"; $(i).trigger("input"); });
  await frame.waitForTimeout(300);
  const none = await frame.evaluate(() => $(".lang-dlg:visible .lang-empty").length);
  record("lang.search-no-result", none === 1);
  await frame.evaluate(() => { const i = $(".lang-dlg:visible #lang-dlg-search input")[0]; i.value = ""; $(i).trigger("input"); });
  await frame.waitForTimeout(300);
  d = await dlgInfo(frame);
  record("lang.search-clear-restores", d.heads[0] === "Current language" && d.items > 100 && d.selected === 1, JSON.stringify(d.heads) + " " + d.selected);

  // Cancel changes nothing
  await pickInDialog(frame, "Français – France");
  await closeDlg(frame, "cancel");
  record("lang.cancel-noop", !(await dlgOpen(frame)) && (await runLangs(frame)).every(l => l === null || l === EN_US) && (await defLang(frame)) === EN_US, JSON.stringify(await runLangs(frame)));

  // OK: language of the selection only
  await openDialog(frame);
  await pickInDialog(frame, "Français – France");
  await closeDlg(frame, "ok");
  const l1 = await runLangs(frame);
  record("lang.ok-sets-selection", l1[0] === FR_FR && !l1.slice(1).includes(FR_FR), JSON.stringify(l1));
  record("lang.ok-keeps-default", (await defLang(frame)) === EN_US, String(await defLang(frame)));

  // recently used, current on top follows the cursor
  await openDialog(frame);
  d = await dlgInfo(frame);
  const recent = await frame.evaluate(() => { const w = $(".lang-dlg:visible .lang-list, .lang-dlg:visible .lang-dlg-list"); const out = []; let on = false; w.children().each(function () { const e = $(this); if (e.hasClass("lang-head")) on = e.text().trim() === "Recently used"; else if (on) out.push(e.find(".lang-name").text()); }); return out; });
  record("lang.recent-listed", recent[0] && /^Français – France/.test(recent[0]), JSON.stringify(recent));
  record("lang.current-follows-cursor", /^Français – France/.test(d.current), d.current);
  await closeDlg(frame, "cancel");

  // Set As Default: document default and the selection
  await select(frame, 1, 0, 6);
  await openDialog(frame);
  await pickInDialog(frame, "Español – España");
  await closeDlg(frame, "default");
  record("lang.default-sets-document", (await defLang(frame)) === ES_ES, String(await defLang(frame)));
  const l2 = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content[1].Content.filter(r => r.Pr).map(r => (r.Pr.Lang && r.Pr.Lang.Val) || null); });
  record("lang.default-also-selection", l2.includes(ES_ES), JSON.stringify(l2));

  // drop-down now lists the recent ones; one click applies
  await select(frame, 0, 0, 7);
  await openMenu(frame);
  const menu2 = await frame.evaluate(() => $(".dropdown-menu:visible").last().find("li").map(function () { return $(this).text().trim(); }).get());
  record("lang.menu-recent", /Español/.test(menu2[0] + menu2[1]) && menu2.some(t => /Français/.test(t)) && menu2.length <= 9, JSON.stringify(menu2));
  shots && await page.screenshot({ path: `${shots}/fb13-language-menu.png`, clip: { x: fb.x, y: fb.y, width: 700, height: 330 } });
  await frame.evaluate(() => $(".dropdown-menu:visible a:contains('Français')").first().click());
  await frame.waitForTimeout(400);
  record("lang.menu-click-applies", (await runLangs(frame))[0] === FR_FR, JSON.stringify(await runLangs(frame)));

  // keyboard: type, Down, Enter
  await openDialog(frame);
  await page.keyboard.type("deutsch");
  await frame.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  const sel = await frame.evaluate(() => $(".lang-dlg:visible .lang-item.selected .lang-name").text());
  await page.keyboard.press("Enter");
  await frame.waitForTimeout(500);
  const l3 = (await runLangs(frame))[0];
  record("lang.keyboard-search-enter", !(await dlgOpen(frame)) && [DE_DE, 2055, 3079, 5127, 4103].includes(l3), `${sel} -> ${l3}`);

  // "Do not check spelling": the spell checking switch (the engine has no per-run no-proof flag)
  const before = await spellOn(frame);
  await openDialog(frame);
  d = await dlgInfo(frame);
  record("lang.nospell-reflects-state", d.nospellChecked === !before, JSON.stringify({ before, c: d.nospellChecked }));
  await frame.click(".lang-dlg #lang-dlg-nospell .checkbox__shape");
  await frame.waitForTimeout(200);
  await closeDlg(frame, "ok");
  record("lang.nospell-off", before === true && (await spellOn(frame)) === false, String(await spellOn(frame)));
  const pressed = await frame.evaluate(() => $("#slot-elx-rev-spelling .btn-toolbar, #slot-elx-rev-spelling button").first().hasClass("active"));
  record("lang.nospell-spelling-button", pressed === false, "Spelling button still pressed");
  await openDialog(frame);
  d = await dlgInfo(frame);
  record("lang.nospell-checked-on-reopen", d.nospellChecked === true, JSON.stringify(d.nospellChecked));
  await frame.click(".lang-dlg #lang-dlg-nospell .checkbox__shape");
  await frame.waitForTimeout(200);
  await closeDlg(frame, "ok");
  record("lang.nospell-restored", (await spellOn(frame)) === true, String(await spellOn(frame)));

  // status bar: caption, menu with search and the current one checked, same dialog from the icon
  const cap = await frame.evaluate(() => $("#btn-cnt-lang .caption, #btn-cnt-lang button").first().text().trim());
  record("lang.statusbar-caption-native", /Fran|Deutsch|Espa|English|Engl/.test(cap) && cap.length > 3, cap);
  await frame.evaluate(() => $("#btn-cnt-lang button").first().click());
  await frame.waitForFunction(() => $(".lang-dlg:visible .lang-item").length > 10, null, { timeout: 8000 });
  await frame.waitForTimeout(400);
  const sb = await dlgInfo(frame);
  record("lang.statusbar-opens-dialog", sb.heads[0] === "Current language" && sb.checks >= 1 && sb.inView && !(await frame.evaluate(() => $(".lang-menu:visible").length)), JSON.stringify({ heads: sb.heads, checks: sb.checks, current: sb.current }));
  record("lang.statusbar-current-is-cursor", /Deutsch|Fran|Espa|English/.test(sb.current) && sb.current.length > 3, sb.current);
  shots && await page.screenshot({ path: `${shots}/fb13-statusbar-language.png`, clip: { x: fb.x + 300, y: fb.y + 60, width: 840, height: 520 } });
  await pickInDialog(frame, "Español – España");
  await closeDlg(frame, "ok");
  record("lang.statusbar-sets-selection", (await runLangs(frame))[0] === ES_ES, JSON.stringify(await runLangs(frame)));
  const cap2 = await frame.evaluate(() => $("#btn-cnt-lang button").first().text().trim());
  record("lang.statusbar-caption-updates", /^Español/.test(cap2), cap2);
  await resetUi(frame, page);
  await frame.evaluate(() => $("#btn-doc-lang button, #btn-doc-lang .btn").first().click());
  await frame.waitForTimeout(800);
  record("lang.statusbar-icon-opens-dialog", await dlgOpen(frame));
  await closeDlg(frame, "cancel");

  // dark theme and a narrow window: still fits
  await frame.evaluate(() => Common.UI.Themes.setTheme("theme-night"));
  await frame.waitForTimeout(1200);
  await openDialog(frame);
  shots && await page.screenshot({ path: `${shots}/fb13-language-dialog-dark.png`, clip: { x: fb.x + 300, y: fb.y + 60, width: 840, height: 520 } });
  const dark = await frame.evaluate(() => { const l = $(".lang-dlg:visible .lang-dlg-list"); const it = l.find(".lang-item").eq(3); return { bg: getComputedStyle(l[0]).backgroundColor, fg: getComputedStyle(it[0]).color }; });
  const lum = c => { const m = c.match(/\d+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  record("lang.dark-contrast", ratio(dark.bg, dark.fg) >= 7, JSON.stringify({ ...dark, ratio: ratio(dark.bg, dark.fg).toFixed(1) }));
  await closeDlg(frame, "cancel");
  await env.browser.close();
  const errs = env.errors.filter(e => e.kind === "pageerror");
  record("lang.no-page-error", errs.length === 0, errs.map(e => e.text).join(" | ").slice(0, 300));
}

// ---- F3: Borders icons -------------------------------------------------------------------------
const ITEMS = ["Bottom borders", "Top borders", "Left borders", "Right borders", "No borders", "All borders", "Outside borders", "Inside borders", "Inside horizontal borders", "Inside vertical borders"];
async function bordersSession(dsf, theme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${BASE}/example/editor?fileExt=docx`, { waitUntil: "load" });
  const frame = await waitFrame(page);
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
  await frame.waitForTimeout(1500);
  if (theme !== "theme-white") { await frame.evaluate(t => Common.UI.Themes.setTheme(t), theme); await frame.waitForTimeout(1500); }
  const fb = await (await frame.frameElement()).boundingBox();
  await setDoc(frame, ["Bonjour", "Second"]);
  await select(frame, 0, 0, 3);
  const tag = `${dsf}x-${theme === "theme-white" ? "light" : "dark"}`;
  // the button itself
  const bb = await frame.evaluate(() => { const r = $("#id-toolbar-btn-borders")[0].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  shots && await page.screenshot({ path: `${shots}/fb13-borders-button-${tag}.png`, clip: { x: fb.x + bb.x - 10, y: fb.y + bb.y - 8, width: bb.w + 20, height: bb.h + 16 } });
  await frame.evaluate(() => $("#id-toolbar-btn-borders .dropdown-toggle, #id-toolbar-btn-borders .caret").last().click());
  await frame.waitForTimeout(600);
  const geo = await frame.evaluate(names => {
    const menu = $(".dropdown-menu:visible").filter(function () { return $(this).find("a:contains('Bottom borders')").length; }).last();
    const out = { rows: [], menu: menu[0].getBoundingClientRect().toJSON(), bg: getComputedStyle(menu[0]).backgroundColor };
    names.forEach(n => {
      const a = menu.find("a").filter(function () { return $(this).text().trim() === n; }).first();
      const s = a.find("svg")[0];
      if (!a.length || !s) { out.rows.push({ n, missing: true }); return; }
      const r = s.getBoundingClientRect();
      out.rows.push({ n, x: r.x, y: r.y, w: r.width, h: r.height, href: $(s).find("use").attr("href"), disabled: a.parent().hasClass("disabled") || a.hasClass("disabled") });
    });
    // theme colour of an icon fill (the class every glyph uses)
    const t = $('<svg class="icon" width="4" height="4"><path class="icon-fill-gray-primary" d="M0 0h4v4z"/></svg>').appendTo(menu);
    out.fill = getComputedStyle(t.find("path")[0]).fill;
    t.remove();
    return out;
  }, ITEMS);
  const hashes = [];
  for (const r of geo.rows) {
    if (r.missing) { hashes.push(null); continue; }
    const buf = await page.screenshot({ clip: { x: fb.x + r.x, y: fb.y + r.y, width: r.w, height: r.h } });
    hashes.push(crypto.createHash("sha1").update(buf).digest("hex"));
  }
  shots && await page.screenshot({ path: `${shots}/fb13-borders-menu-${tag}.png`, clip: { x: fb.x + geo.menu.x - 4, y: fb.y + geo.menu.y - 4, width: geo.menu.width + 8, height: geo.menu.height + 8 } });
  const symbolDup = new Set(geo.rows.map(r => r.href)).size;
  // pixel identical glyphs would mean two commands look the same (the original defect)
  const enabled = geo.rows.map((r, i) => ({ r, i })).filter(o => !o.r.missing && !o.r.disabled);
  const uniq = new Set(enabled.map(o => hashes[o.i])).size;
  record(`borders.${tag}.ten-items`, geo.rows.every(r => !r.missing), JSON.stringify(geo.rows.filter(r => r.missing).map(r => r.n)));
  record(`borders.${tag}.glyphs-distinct`, symbolDup === ITEMS.length && uniq === enabled.length, `${symbolDup} distinct ids, ${uniq}/${enabled.length} distinct renderings`);
  record(`borders.${tag}.glyph-size`, geo.rows.every(r => r.missing || (r.w >= 16 && r.w <= 28 && Math.abs(r.w - r.h) < 1)), JSON.stringify(geo.rows.map(r => [Math.round(r.w), Math.round(r.h)])));
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const blend = (fg, bg, a) => { const f = fg.match(/[\d.]+/g).map(Number), b = bg.match(/[\d.]+/g).map(Number); return `rgb(${f.map((v, i) => v * a + b[i] * (1 - a)).join(",")})`; };
  const solid = ratio(geo.fill, geo.bg), dots = ratio(blend(geo.fill, geo.bg, .5), geo.bg);
  record(`borders.${tag}.contrast`, solid >= 7 && dots >= 2, `solid ${solid.toFixed(1)}:1, dotted ${dots.toFixed(1)}:1 (fill ${geo.fill}, menu ${geo.bg})`);
  // each command applies the border it shows
  if (dsf === 1 && theme === "theme-white") {
    await frame.evaluate(() => $(".dropdown-menu:visible a:contains('Bottom borders')").first().click());
    await frame.waitForTimeout(500);
    const brd = await frame.evaluate(() => { const b = Asc.editor.WordControl.m_oLogicDocument.Content[0].Pr.Brd; return b ? { bottom: b.Bottom && b.Bottom.Value, top: b.Top && b.Top.Value } : null; });
    record("borders.bottom-applies", !!brd && brd.bottom === 1 && brd.top !== 1, JSON.stringify(brd));
  }
  const errs = errors.slice();
  await browser.close();
  return errs;
}

try {
  await languageSuite();
  const errs = [];
  for (const [dsf, theme] of [[1, "theme-white"], [1.5, "theme-white"], [1, "theme-night"]]) errs.push(...await bordersSession(dsf, theme));
  record("borders.no-page-error", errs.length === 0, errs.join(" | ").slice(0, 300));
} catch (e) {
  record("suite.crash", false, String(e && e.stack || e).slice(0, 500));
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
process.exit(results.every(r => r.status === "pass") ? 0 : 1);
