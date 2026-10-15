#!/usr/bin/env node
// Word's mini toolbar: on a mouse selection, fading with the distance to the pointer,
// and above the context menu.
//   node tests/shortcuts/minitoolbar.mjs [screenshot dir] [--out results.json]
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, setDoc, caret, state, focusDoc, resetUi, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args[0] && !args[0].startsWith("--") ? args[0] : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "minitoolbar-latest.json");
shots && fs.mkdirSync(shots, { recursive: true });

const { browser, page, errors } = await launch({});
const frame = await openEditor(page);
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + reason)); };
const frameBox = await (await frame.frameElement()).boundingBox();

// page coordinates of the caret before character `off` of paragraph p
async function pointAt(p, off) {
  await caret(frame, p, off);
  return frame.evaluate(([fx, fy]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    d.Document_UpdateSelectionState();
    const t = d.TargetPos;
    const c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
    const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
    return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y + 6 };
  }, [frameBox.x, frameBox.y]);
}
const mini = () => frame.evaluate(() => { const el = document.getElementById("mini-toolbar"); if (!el) return null; const r = el.getBoundingClientRect(); return { visible: el.classList.contains("visible") && getComputedStyle(el).display !== "none", opacity: parseFloat(getComputedStyle(el).opacity), x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = m => ({ x: frameBox.x + m.x, y: frameBox.y + m.y });

await setDoc(frame, ["Mini toolbar test: select these words with the mouse.", "Second paragraph."]);
await frame.waitForTimeout(300);

// 1. mouse selection
let a = await pointAt(0, 19), b = await pointAt(0, 31);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
await frame.waitForTimeout(400);
let m = await mini();
record("mini.shows-on-mouse-selection", !!(m && m.visible), JSON.stringify(m));
record("mini.translucent-first", !!(m && m.opacity > 0.15 && m.opacity < 0.9), `opacity ${m && m.opacity}`);
record("mini.near-pointer", !!(m && Math.abs(toPage(m).y + m.h - b.y) < 90 && Math.abs(toPage(m).x - b.x) < 260), `toolbar at ${JSON.stringify(m && toPage(m))}, pointer ${JSON.stringify(b)}`);
shots && await page.screenshot({ path: `${shots}/interact-minitoolbar.png`, clip: { x: Math.max(0, b.x - 360), y: Math.max(0, b.y - 160), width: 720, height: 230 } });

// 2. pointer on it: opaque
const mp = toPage(m);
await page.mouse.move(mp.x + m.w / 2, mp.y + m.h / 2, { steps: 5 });
await frame.waitForTimeout(300);
m = await mini();
record("mini.opaque-under-pointer", !!(m && m.visible && m.opacity > 0.95), `opacity ${m && m.opacity}`);

// 3. Bold from the mini toolbar
await frame.evaluate(() => { const b = $("#mini-bold button").first(); b.length ? b.click() : $("#mini-bold .btn-toolbar").first().click(); });
await frame.waitForTimeout(300);
record("mini.bold", (await state(frame)).text.bold === true, "bold not applied to the selection");

// 4. Styles menu: Heading 1
await frame.evaluate(() => $("#mini-styles button").first().click());
await frame.waitForTimeout(300);
const styleItems = await frame.evaluate(() => $("#mini-toolbar").length && $(".dropdown-menu:visible a").map(function () { return $(this).text().trim(); }).get());
const h1 = await frame.evaluate(() => { const it = $(".dropdown-menu:visible a").filter(function () { return /^Heading 1$/.test($(this).text().trim()); }).first()[0]; if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await frame.evaluate(() => { window.__styleClicks = []; DE.getController("MiniToolbar").view.btnStyles.menu.on("item:click", (m, it) => window.__styleClicks.push(it.value)); });
h1 && await page.mouse.click(frameBox.x + h1.x, frameBox.y + h1.y);
await frame.waitForTimeout(200);
const clicks = await frame.evaluate(() => window.__styleClicks);
// a part of a paragraph gets the linked character style (Word), a whole paragraph the paragraph style
const styled = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const tp = d.GetCalculatedTextPr(); const pp = d.GetCalculatedParaPr(); const n = id => (id && d.Styles.Get(id) ? d.Styles.Get(id).GetName() : ""); return { para: n(pp.PStyle), run: n(tp.RStyle) }; });
await frame.waitForTimeout(400);
record("mini.styles", /^Heading 1/.test(styled.para) || /^Heading 1/.test(styled.run), `styles ${JSON.stringify(styled)}, menu ${JSON.stringify((styleItems || []).slice(0, 6))}, item ${JSON.stringify(h1)}, clicks ${JSON.stringify(clicks)}, style ${(await state(frame)).para.style}, selected ${JSON.stringify((await state(frame)).selected)}`);

// 5. pointer far away: it fades out
await page.mouse.move(mp.x + 600, mp.y + 400, { steps: 8 });
await frame.waitForTimeout(300);
m = await mini();
record("mini.fades-away", !!(m && !m.visible), `still visible, opacity ${m && m.opacity}`);

// 6. typing hides it; a keyboard selection does not show it
a = await pointAt(1, 0); b = await pointAt(1, 6);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
await frame.waitForTimeout(400);
const before = await mini();
await page.keyboard.press("ArrowRight");
await frame.waitForTimeout(200);
record("mini.hides-on-key", !!(before && before.visible && !(await mini()).visible), `before ${JSON.stringify(before)}`);
await page.keyboard.press("Shift+ArrowRight"); await page.keyboard.press("Shift+ArrowRight");
await frame.waitForTimeout(300);
record("mini.not-on-keyboard-selection", !(await mini()).visible, "shown after Shift+arrows");

// 7. right-click: above the context menu
a = await pointAt(0, 0); b = await pointAt(0, 4);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
await frame.waitForTimeout(300);
await page.mouse.click(b.x - 6, b.y, { button: "right" });
await frame.waitForTimeout(600);
m = await mini();
const menu = await frame.evaluate(() => { const v = DE.getController("DocumentHolder").documentHolder; const mm = v.currentMenu; if (!mm || !mm.isVisible()) return null; const r = mm.cmpEl.find(".dropdown-menu").addBack(".dropdown-menu").first()[0].getBoundingClientRect(); return { x: r.left, y: r.top }; });
record("mini.above-context-menu", !!(m && m.visible && menu && m.y + m.h <= menu.y + 2 && Math.abs(m.x - menu.x) < 40 && m.opacity > 0.95), `mini ${JSON.stringify(m)}, menu ${JSON.stringify(menu)}`);
shots && await page.screenshot({ path: `${shots}/interact-minitoolbar-contextmenu.png`, clip: { x: Math.max(0, frameBox.x + (menu ? menu.x : 300) - 80), y: Math.max(0, frameBox.y + (m ? m.y : 200) - 40), width: 600, height: 520 } });
await page.keyboard.press("Escape");
await frame.waitForTimeout(300);
record("mini.hides-with-menu", !(await mini()).visible, "still visible after the menu closed");

// 8. font name and font size drop-downs of the mini toolbar (feedback F5-F7: the editor crashed when the
// font list was opened, the size list was an empty box); the full matrix is tests/ctxmenu/fontcombos.mjs
{
  const mark = errors.length;
  const errDialog = () => frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).some(w => w.getClientRects().length && /error occurred|Warning/i.test(w.textContent)));
  const toggle = async sel => { const r = await frame.evaluate(s => { const e = $(s)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); r && await page.mouse.click(frameBox.x + r.x, frameBox.y + r.y); await frame.waitForTimeout(700); return !!r; };
  const rows = root => frame.evaluate(r => { const ul = $(r + " ul.dropdown-menu:visible")[0]; return ul ? { h: Math.round(ul.getBoundingClientRect().height), n: $(ul).children("li:not(.divider):visible").length } : null; }, root);
  const textFont = () => frame.evaluate(() => { const tp = Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr() || {}; return { font: tp.RFonts && tp.RFonts.Ascii && tp.RFonts.Ascii.Name, size: tp.FontSize }; });
  a = await pointAt(0, 0); b = await pointAt(0, 4);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  await frame.waitForTimeout(400);
  m = await mini(); const mpp = toPage(m);
  await page.mouse.move(mpp.x + m.w / 2, mpp.y + m.h / 2, { steps: 4 });
  await frame.waitForTimeout(300);
  await toggle("#mini-font-name .dropdown-toggle");
  const fl = await rows("#mini-font-name");
  record("mini.font-list-opens", !!(fl && fl.n > 30 && fl.h > 150), JSON.stringify(fl));
  const pick = await frame.evaluate(() => { const c = DE.getController("MiniToolbar").view.cmbFontName, cur = Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr().RFonts.Ascii.Name; for (const a of $("#mini-font-name ul li:visible a.font-item").toArray().slice(3, 40)) { const rec = c.store.findWhere({ id: a.parentNode.id }); if (rec && rec.get("name") !== cur) { $(a).attr("data-pick", "1"); return rec.get("name"); } } return null; });
  const pb = pick && await frame.evaluate(() => { const r = $("#mini-font-name a[data-pick=1]")[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  pb && await page.mouse.click(frameBox.x + pb.x, frameBox.y + pb.y);
  let ok = false; for (let i = 0; i < 24 && !ok; i++) { await frame.waitForTimeout(250); ok = (await textFont()).font === pick; }
  record("mini.font-applied", !!pick && ok, `picked ${pick}, engine ${JSON.stringify(await textFont())}`);
  record("mini.font-no-error", !(await errDialog()) && errors.slice(mark).filter(e => !/Failed to load resource/.test(e.text)).length === 0, JSON.stringify(errors.slice(mark).map(e => e.text.slice(0, 120))));
  await toggle("#mini-font-size .dropdown-toggle");
  const sl = await rows("#mini-font-size");
  record("mini.size-list-not-empty", !!(sl && sl.n >= 10 && sl.h > 100), JSON.stringify(sl));
  const sb = sl && await frame.evaluate(() => { const li = $("#mini-font-size ul li:visible").filter(function () { return $(this).text().trim() === "18"; })[0]; if (!li) return null; const r = li.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  sb && await page.mouse.click(frameBox.x + sb.x, frameBox.y + sb.y);
  await frame.waitForTimeout(500);
  record("mini.size-applied", !!sb && (await textFont()).size === 18, JSON.stringify(await textFont()));
  await page.keyboard.press("Escape");
  await frame.waitForTimeout(300);
  await page.mouse.click(frameBox.x + 700, frameBox.y + 500);
  await frame.waitForTimeout(300);
  a = await pointAt(0, 0); b = await pointAt(0, 4);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  await page.mouse.click(b.x - 6, b.y, { button: "right" });
  await frame.waitForTimeout(700);
  record("mini.context-menu-after-fonts", await frame.evaluate(() => { const mm = DE.getController("DocumentHolder").documentHolder.currentMenu; return !!(mm && mm.isVisible()); }), "the right-click menu does not open after the font drop-downs were used");
  await page.keyboard.press("Escape");
  await frame.waitForTimeout(300);
}

const pageErrors = errors.filter(e => e.kind === "pageerror");
record("mini.no-page-error", pageErrors.length === 0, pageErrors.map(e => e.text).join(" | ").slice(0, 300));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
await browser.close();
