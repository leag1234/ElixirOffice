#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Word-style comment balloons in the right margin (docs/ui.md, "Comments in the margin"):
// balloons next to their anchors, page shifted left, selection and connector line, inline reply,
// edit, resolve, delete, caret in commented text, Comments pane and "Show comments" hide them, scrolling.
//   node tests/comments/margin.mjs [--out results.json]      (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, select, caret } from "../shortcuts/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "margin-latest.json");
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
const frame = await openEditor(page, {});
const wait = ms => frame.waitForTimeout(ms);
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

const lorem = "The quick brown fox jumps over the lazy dog. ".repeat(6);
const spec = ["Project plan", lorem, lorem, "Budget and schedule. " + lorem, lorem];
for (let i = 0; i < 14; i++) spec.push(lorem);
await setDoc(frame, spec);
const add = async (p, a, b, text) => {
  await select(frame, p, a, b);
  await frame.evaluate(t => { const d = new Asc.asc_CCommentDataWord(null); d.asc_putText(t); d.asc_putUserName("Test User"); Asc.editor.asc_addComment(d); }, text);
  await wait(250);
};
// layout of the balloons and their anchors, in the coordinates of #id_main
const state = () => frame.evaluate(() => {
  const m = DE.Views.ElixirCommentMargin.instance, main = $("#id_main")[0].getBoundingClientRect();
  const anchors = Asc.editor.asc_ElixirGetCommentAnchors();
  const bal = $(".elx-cbal:visible").toArray().map(el => { const r = el.getBoundingClientRect(); return { uid: el.getAttribute("data-uid"), top: r.top - main.top, left: r.left - main.left, bottom: r.bottom - main.top, active: el.classList.contains("active"), text: el.querySelector(".elx-cbal-text") ? el.querySelector(".elx-cbal-text").textContent : "", replies: el.querySelectorAll(".elx-cbal-reply").length }; });
  const pop = $(".comments-popover:visible, #id-comments-popover:visible").length;
  return { on: m.isOn(), width: Asc.editor.WordControl.ElixirMarkupWidth, anchors, bal, line: $(".elx-markup-line").attr("d") || "", pop, view: $("#id_main_view").width() };
});
const comment = uid => frame.evaluate(u => { const c = DE.getController("Common.Controllers.Comments").findComment(u); return c ? { text: c.get("comment"), resolved: c.get("resolved"), replies: (c.get("replys") || []).length } : null; }, uid);
const settle = () => wait(500);

// ---- no comment: no markup area -----------------------------------------------------------------------------
let s = await state();
record("m.none.noArea", !s.on && s.width === 0 && s.bal.length === 0, JSON.stringify({ on: s.on, w: s.width, n: s.bal.length }));

await add(0, 0, 7, "Is this the final title?");
await add(1, 4, 15, "Use a less common example sentence, the reviewers know this one.");
await add(1, 40, 55, "Second comment on the same paragraph");
await add(3, 0, 6, "Check the numbers with finance.");
await caret(frame, 4, 0);
await settle();
s = await state();
const ids = s.anchors.map(a => a.Id);
record("m.show.area", s.on && s.width >= 200, JSON.stringify({ on: s.on, w: s.width }));
record("m.show.count", s.bal.length === 4, s.bal.length);
// the page moved left to make room: page right + markup area fits in the view
const right = Math.max(...s.anchors.map(a => a.PageRight));
record("m.show.pageShifted", right + s.width <= s.view + 30 && right > s.view / 2, JSON.stringify({ right, w: s.width, view: s.view }));
// every balloon sits to the right of the page, in the anchors order, without overlap, next to or below its text
const byUid = Object.fromEntries(s.bal.map(b => [b.uid, b]));
const ordered = [...s.anchors].sort((a, b) => a.Y - b.Y || a.X - b.X);
let okPos = true, why = "";
ordered.forEach((a, i) => {
  const b = byUid[a.Id]; if (!b) { okPos = false; why = "missing " + a.Id; return; }
  if (b.left < a.PageRight) { okPos = false; why = "left " + JSON.stringify([a, b]); }
  if (b.top < a.Y - 12) { okPos = false; why = "above " + JSON.stringify([a, b]); }
  if (i && b.top < byUid[ordered[i - 1].Id].bottom) { okPos = false; why = "overlap " + a.Id; }
});
record("m.show.positions", okPos, why);
record("m.show.firstAligned", Math.abs(byUid[ordered[0].Id].top - (ordered[0].Y - 6)) <= 3, JSON.stringify([byUid[ordered[0].Id].top, ordered[0].Y]));
await shot("margin-all");

// ---- click a balloon: selected, aligned with its text, connector line, document selection on the comment ----
const second = ordered[2].Id; // the second comment of paragraph 1 (pushed down while nothing is selected)
await frame.locator(`.elx-cbal[data-uid="${second}"] .elx-cbal-text`).click();
await settle();
s = await state();
let b2 = s.bal.find(b => b.uid === second), a2 = s.anchors.find(a => a.Id === second);
record("m.select.active", !!b2 && b2.active, JSON.stringify(b2));
record("m.select.aligned", !!b2 && Math.abs(b2.top - (a2.Y - 6)) <= 3, JSON.stringify([b2 && b2.top, a2.Y]));
record("m.select.noOverlap", s.bal.every((b, i) => !i || b.top >= s.bal[i - 1].bottom - 1) || (() => { const so = [...s.bal].sort((x, y) => x.top - y.top); return so.every((b, i) => !i || b.top >= so[i - 1].bottom - 1); })(), JSON.stringify(s.bal.map(b => [b.top, b.bottom])));
record("m.select.line", /^M[\d.]+,[\d.]+H[\d.]+L[\d.]+,[\d.]+$/.test(s.line), s.line);
record("m.select.noPopover", s.pop === 0, s.pop);
const cur = await frame.evaluate(() => { const c = Asc.editor.WordControl.m_oLogicDocument.Comments.Get_Current(); return c ? c.Get_Id() : null; });
record("m.select.current", cur === second, JSON.stringify([cur, second]));
await shot("margin-selected");

// ---- inline reply: type, Ctrl+Enter ---------------------------------------------------------------------------
await frame.locator(`.elx-cbal[data-uid="${second}"] textarea`).click();
await page.keyboard.type("Agreed, I will change it.");
await page.keyboard.press("Control+Enter");
await settle();
let c = await comment(second);
s = await state();
record("m.reply.saved", c && c.replies === 1, JSON.stringify(c));
record("m.reply.shown", (s.bal.find(b => b.uid === second) || {}).replies === 1, JSON.stringify(s.bal.find(b => b.uid === second)));
const docText = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content[1].GetText());
record("m.reply.notInDocument", !docText.includes("Agreed"), docText.slice(0, 60));
// the reply button posts too
await frame.locator(`.elx-cbal[data-uid="${second}"] textarea`).click();
await page.keyboard.type("Second reply");
await frame.locator(`.elx-cbal[data-uid="${second}"] [data-act=reply]`).click();
await settle();
c = await comment(second);
record("m.reply.button", c && c.replies === 2, JSON.stringify(c));

// ---- edit through the "More thread actions" menu ----------------------------------------------------------
await frame.locator(`.elx-cbal[data-uid="${second}"] [data-act=more]`).click();
await wait(200);
await frame.locator(`.elx-cbal-menu [data-action=edit]`).click();
await wait(300);
await page.keyboard.press("Control+A");
await page.keyboard.type("Edited comment text");
await page.keyboard.press("Control+Enter");
await settle();
c = await comment(second);
record("m.edit", c && c.text === "Edited comment text", JSON.stringify(c));

// ---- resolve: the balloon goes away (resolved comments hidden by default) ---------------------------------
await frame.locator(`.elx-cbal[data-uid="${second}"] [data-act=resolve]`).click();
await settle();
c = await comment(second);
s = await state();
record("m.resolve", c && c.resolved === true && !s.bal.find(b => b.uid === second) && s.bal.length === 3, JSON.stringify({ c, n: s.bal.length }));

// ---- caret in commented text selects its balloon ------------------------------------------------------------
// a real click in the commented word "Budget"
{ const a = (await state()).anchors.find(x => x.Id === ordered[3].Id); await frame.locator("#id_main").click({ position: { x: a.X + 12, y: a.Y + a.H / 2 } }); }
await settle();
s = await state();
const third = ordered[3].Id;
record("m.caret.selects", !!(s.bal.find(b => b.uid === third) || {}).active && s.pop === 0, JSON.stringify(s.bal.map(b => [b.uid, b.active])) + " pop " + s.pop);
// a click in text without comment deselects it
{ const a = (await state()).anchors.find(x => x.Id === ordered[3].Id); await frame.locator("#id_main").click({ position: { x: a.X + 200, y: a.Y + a.H / 2 + 60 } }); }
await settle();
s = await state();
record("m.caret.deselects", s.bal.every(b => !b.active) && s.line === "", JSON.stringify(s.bal.map(b => b.active)));

// ---- scrolling moves the balloons with the text ---------------------------------------------------------------
const before = s.bal[0].top;
await frame.evaluate(() => Asc.editor.WordControl.m_oScrollVerApi.scrollByY(120));
await settle();
s = await state();
const moved = before - s.bal[0].top;
record("m.scroll.follows", Math.abs(moved - 120) <= 4, moved);
await frame.evaluate(() => Asc.editor.WordControl.m_oScrollVerApi.scrollByY(-120));
await settle();

// ---- zoom: the balloons follow the page edge ---------------------------------------------------------------
await frame.evaluate(() => Asc.editor.zoom(75));
await settle();
s = await state();
const r75 = Math.max(...s.anchors.map(a => a.PageRight));
record("m.zoom.follows", s.on && s.bal.every(b => b.left >= r75 && b.left <= r75 + 30), JSON.stringify({ r75, l: s.bal.map(b => b.left) }));
await frame.evaluate(() => Asc.editor.zoom(100));
await settle();

// ---- the Comments pane replaces the balloons, closing it brings them back ---------------------------------------
await frame.evaluate(() => DE.getController("ElixirChrome").toggleComments());
await wait(800);
s = await state();
record("m.pane.hides", !s.on && s.width === 0 && s.bal.length === 0 && await frame.locator("#left-panel-comments").isVisible(), JSON.stringify({ on: s.on, w: s.width, n: s.bal.length }));
await shot("margin-pane");
await frame.evaluate(() => DE.getController("ElixirChrome").toggleComments());
await wait(800);
s = await state();
record("m.pane.back", s.on && s.bal.length === 3, JSON.stringify({ on: s.on, n: s.bal.length }));

// ---- Review > Show Comments off hides them ----------------------------------------------------------------
await frame.evaluate(() => { Common.Utils.InternalSettings.set("de-settings-livecomment", false); Asc.editor.asc_hideComments(); });
await settle();
s = await state();
record("m.hidden.off", !s.on && s.bal.length === 0, JSON.stringify({ on: s.on, n: s.bal.length }));
await frame.evaluate(() => { Common.Utils.InternalSettings.set("de-settings-livecomment", true); Asc.editor.asc_showComments(false); });
await settle();
s = await state();
record("m.hidden.on", s.on && s.bal.length === 3, JSON.stringify({ on: s.on, n: s.bal.length }));

// ---- delete through the menu; the last comment gone, the page recenters --------------------------------------
for (const uid of s.bal.map(b => b.uid)) {
  await frame.locator(`.elx-cbal[data-uid="${uid}"]`).click();
  await wait(250);
  await frame.locator(`.elx-cbal[data-uid="${uid}"] [data-act=more]`).click();
  await wait(150);
  await frame.locator(`.elx-cbal-menu [data-action=delete]`).click();
  await settle();
}
s = await state();
const left = await frame.evaluate(() => DE.getController("Common.Controllers.Comments").collection.filter(c => !c.get("resolved")).length);
record("m.delete", left === 0 && s.bal.length === 0, JSON.stringify({ left, n: s.bal.length }));
// the resolved one stays hidden: no markup area
record("m.delete.noArea", !s.on && s.width === 0, JSON.stringify({ on: s.on, w: s.width }));
// undo brings a deleted comment back with its balloon
await frame.evaluate(() => Asc.editor.Undo());
await settle();
s = await state();
record("m.undo", s.on && s.bal.length === 1, JSON.stringify({ on: s.on, n: s.bal.length }));

// ---- new comment through the ribbon: the popover is used to type it, then it gets a balloon ------------------
await select(frame, 6, 0, 9);
await frame.evaluate(() => Common.NotificationCenter.trigger("app:comment:add", "toolbar"));
await wait(600);
await page.keyboard.type("A new comment from the ribbon");
await shot("margin-new");
await page.keyboard.press("Control+Enter");
await settle();
s = await state();
const added = s.bal.find(b => b.text === "A new comment from the ribbon");
record("m.new.balloon", !!added, JSON.stringify(s.bal.map(b => b.text)));

const errs = errors.filter(e => !/Failed to load resource/.test(e.text || ""));
record("m.noErrors", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), base: process.env.EO_BASE, results }, null, 2));
const pass = results.filter(r => r.status === "pass").length;
console.log(`results: ${pass}/${results.length} pass`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
