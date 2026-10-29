#!/usr/bin/env node
// Office ScreenTips, focus states, tab switching, no layout jump.
//   node tests/shortcuts/screentips.mjs [screenshot dir] [--out results.json]
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args[0] && !args[0].startsWith("--") ? args[0] : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "screentips-latest.json");
shots && fs.mkdirSync(shots, { recursive: true });
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + reason)); };

async function session(lang) {
  const env = await launch({});
  env.frame = await openEditor(env.page, { lang });
  env.box = await (await env.frame.frameElement()).boundingBox();
  return env;
}
const tip = frame => frame.evaluate(() => {
  const t = $(".tooltip.in:visible").last();
  if (!t.length) return null;
  const title = t.find(".screentip-title"), desc = t.find(".screentip-description");
  return { screentip: t.hasClass("screentip"), title: title.text() || t.text(), desc: desc.text(), weight: title.length ? getComputedStyle(title[0]).fontWeight : null, rect: t[0].getBoundingClientRect().toJSON() };
});
async function hover(env, selector) {
  const r = await env.frame.evaluate(sel => { const e = $(sel)[0]; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, selector);
  await env.page.mouse.move(env.box.x + r.x, env.box.y + r.y, { steps: 3 });
}

// English
let env = await session();
await env.page.mouse.move(env.box.x + 700, env.box.y + 500);
await env.frame.waitForTimeout(800);
await hover(env, "#id-toolbar-btn-bold");
await env.frame.waitForTimeout(250);
const early = await tip(env.frame);
await env.frame.waitForTimeout(600);
let t = await tip(env.frame);
record("tip.delay", !early && !!t, `at 250 ms ${JSON.stringify(early)}, at 850 ms ${JSON.stringify(t)}`);
record("tip.title-shortcut", !!t && /^Bold \(Ctrl\+B\)$/.test(t.title), JSON.stringify(t));
record("tip.title-bold", !!t && parseInt(t.weight, 10) >= 600, `font-weight ${t && t.weight}`);
record("tip.description", !!t && t.desc === "Make your text bold.", JSON.stringify(t));
const boldTip = t;
// moving to the next control: at once
await hover(env, "#id-toolbar-btn-italic");
await env.frame.waitForTimeout(150);
t = await tip(env.frame);
record("tip.reshow-at-once", !!t && /^Italic/.test(t.title) && t.desc === "Italicize your text.", JSON.stringify(t));
// QAT
await hover(env, "#id-toolbar-btn-align-center");
await env.frame.waitForTimeout(250);
t = await tip(env.frame);
record("tip.center", !!t && /^Align center|^Center/.test(t.title) && /Center your content/.test(t.desc), JSON.stringify(t));
// screenshot of the Bold ScreenTip (after the timing checks: a screenshot takes time)
await hover(env, "#id-toolbar-btn-bold");
await env.frame.waitForTimeout(400);
t = await tip(env.frame) || boldTip;
shots && t && await env.page.screenshot({ path: `${shots}/interact-screentip.png`, clip: { x: Math.max(0, env.box.x + t.rect.x - 120), y: Math.max(0, env.box.y + t.rect.y - 90), width: Math.min(560, t.rect.width + 260), height: t.rect.height + 120 } });


// focus ring with the keyboard
await env.page.mouse.move(env.box.x + 700, env.box.y + 500);
await env.page.keyboard.down("Alt"); await env.page.keyboard.up("Alt"); await env.frame.waitForTimeout(300);
await env.page.keyboard.press("Tab"); await env.frame.waitForTimeout(200);
const ring = await env.frame.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, outline: cs.outlineStyle + " " + cs.outlineWidth }; });
record("state.focus-ring", /solid 2px/.test(ring.outline), JSON.stringify(ring));
await env.page.keyboard.press("Escape"); await env.page.keyboard.press("Escape");

// tab switching: animated, same ribbon height; menus open without moving the ribbon
const geo = () => env.frame.evaluate(() => { const t = document.getElementById("toolbar").getBoundingClientRect(); const e = document.getElementById("editor_sdk").getBoundingClientRect(); return [Math.round(t.height), Math.round(e.top)]; });
const g0 = await geo(); let same = true, anim = true;
for (const tab of ["ins", "layout", "links", "review", "view", "home"]) {
  await env.frame.evaluate(t => $(`#toolbar a[data-tab=${t}]`).click(), tab);
  await env.frame.waitForTimeout(60);
  anim = anim && await env.frame.evaluate(() => getComputedStyle($("#toolbar .box-panels > .panel.active")[0]).animationName !== "none");
  await env.frame.waitForTimeout(250);
  same = same && JSON.stringify(await geo()) === JSON.stringify(g0);
}
record("state.tab-switch-smooth", anim, "no transition on the active panel");
record("state.tab-switch-no-jump", same, "the ribbon height or the document moved");
const pos = () => env.frame.evaluate(() => ["#id-toolbar-btn-bold", "#id-toolbar-btn-markers", "#id-toolbar-btn-fontcolor", "#id-toolbar-btn-align-left"].map(s => { const r = $(s)[0].getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }));
const p0 = await pos(); let still = true;
for (const s of ["#id-toolbar-btn-fontcolor .dropdown-toggle", "#id-toolbar-btn-markers .dropdown-toggle", "#id-toolbar-btn-highlight .dropdown-toggle"]) {
  await env.frame.evaluate(sel => $(sel).last().click(), s);
  await env.frame.waitForTimeout(300);
  still = still && JSON.stringify(await pos()) === JSON.stringify(p0) && JSON.stringify(await geo()) === JSON.stringify(g0);
  await env.page.keyboard.press("Escape"); await env.frame.waitForTimeout(150);
}
record("state.menu-no-jump", still, "a control moved when a menu opened");
const errs = env.errors.filter(e => e.kind === "pageerror");
await env.browser.close();

// French
env = await session("fr");
await env.page.mouse.move(env.box.x + 700, env.box.y + 500);
await env.frame.waitForTimeout(800);
await hover(env, "#id-toolbar-btn-bold");
await env.frame.waitForTimeout(900);
t = await tip(env.frame);
record("tip.fr", !!t && t.desc === "Mettre votre texte en gras.", JSON.stringify(t));
shots && t && await env.page.screenshot({ path: `${shots}/interact-screentip-fr.png`, clip: { x: Math.max(0, env.box.x + t.rect.x - 120), y: Math.max(0, env.box.y + t.rect.y - 90), width: Math.min(560, t.rect.width + 260), height: t.rect.height + 120 } });
errs.push(...env.errors.filter(e => e.kind === "pageerror"));
await env.browser.close();

record("tip.no-page-error", errs.length === 0, errs.map(e => e.text).join(" | ").slice(0, 300));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
process.exitCode = results.some(row => row.status === "fail") ? 1 : 0;
