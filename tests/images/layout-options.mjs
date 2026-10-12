#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Layout Options button, flyout and object anchor (docs/images.md), played like a user:
//   EO_BASE=http://localhost:32776 node tests/images/layout-options.mjs [--shots dir]
import fs from "node:fs";
import path from "node:path";
import * as L from "./lib.mjs";
import { flowY } from "./metric.mjs";

const args = process.argv.slice(2);
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + JSON.stringify(info) : ""}`); };
const visible = (frame, sel) => frame.evaluate(s => $(s).is(":visible"), sel);
const moved = (B, A, id) => {
  const b = B.images.find(i => i.id === id), a = A.images.find(i => i.id === id);
  return +(Math.abs(flowY(A, a.page, a.y) - flowY(B, b.page, b.y)) + Math.abs(a.x - b.x)).toFixed(2);
};

for (const lang of ["en", "fr"]) {
  const { browser, page, errors } = await L.launch({ lang });
  const { frame } = await L.openFixture(page, "worksheet.docx", lang);
  await L.caretInPara(frame, "Exercice 1");
  let A = await L.insertPictureFromFile(page, frame, "photo-small.jpg");
  const id = A.images[0].id;
  await frame.waitForTimeout(300);
  if (lang === "en") {
    check("button shown for a selected inline picture", await visible(frame, ".elx-lo-btn"));
    check("no anchor for an inline picture", !(await visible(frame, ".elx-lo-anchor-mark")));
    const pos = await frame.evaluate(() => { const b = $(".elx-lo-btn")[0].getBoundingClientRect(), v = $("#id_viewer")[0].getBoundingClientRect(), L = Asc.editor.asc_GetSelectedDrawingLayout(); return { btnLeft: b.left - v.left, btnTop: b.top - v.top, right: L.right, top: L.top }; });
    check("button next to the top right corner", pos.btnLeft >= pos.right && pos.btnLeft - pos.right < 16 && Math.abs(pos.btnTop - pos.top) < 3, pos);
  }
  // open the flyout
  await (await frame.$(".elx-lo-btn")).click();
  await frame.waitForTimeout(200);
  check(`[${lang}] flyout opens`, await visible(frame, ".elx-lo-pane"));
  const texts = await frame.evaluate(() => ({ title: $(".elx-lo-title").text(), tiles: $(".elx-lo-tile").map((i, t) => t.title).get(), radios: $(".elx-lo-radio span").map((i, t) => t.textContent).get(), more: $(".elx-lo-more").text() }));
  const want = lang === "fr"
    ? { title: "Options de disposition", tiles: ["Aligné sur le texte", "Carré", "Rapproché", "Au travers", "Haut et bas", "Derrière le texte", "Devant le texte"], radios: ["Déplacer avec le texte", "Fixer la position sur la page"] }
    : { title: "Layout Options", tiles: ["In Line with Text", "Square", "Tight", "Through", "Top and Bottom", "Behind Text", "In Front of Text"], radios: ["Move with text", "Fix position on page"] };
  check(`[${lang}] Word's choices and labels`, texts.title === want.title && JSON.stringify(texts.tiles) === JSON.stringify(want.tiles) && JSON.stringify(texts.radios) === JSON.stringify(want.radios), texts);
  check(`[${lang}] current choice: In Line with Text, radios disabled`, await frame.evaluate(() => $(".elx-lo-tile.active").data("wrap") === "inline" && $("input[name=elx-lo-move]").prop("disabled")));
  if (shots) await page.screenshot({ path: path.join(shots, `layout-options-${lang}.png`) });
  if (lang === "fr") { await browser.close(); continue; }

  // Square from the flyout: the picture starts floating where it was
  let B = await L.layout(frame);
  await (await frame.$(".elx-lo-tile[data-wrap=square]")).click();
  A = await L.idle(frame);
  let im = A.images.find(i => i.id === id);
  check("Square applied from the flyout", !im.inline && im.wrap === 1, { wrap: im.wrap });
  check("the picture keeps its place (inline -> square)", moved(B, A, id) < 0.5, { moved: moved(B, A, id) });
  check("flyout stays open on the new choice", await frame.evaluate(() => $(".elx-lo-pane").is(":visible") && $(".elx-lo-tile.active").data("wrap") === "square"));
  check("anchor shown for a floating picture", await visible(frame, ".elx-lo-anchor-mark"));
  const an = await frame.evaluate(() => { const a = $(".elx-lo-anchor-mark")[0].getBoundingClientRect(), v = $("#id_viewer")[0].getBoundingClientRect(); return { x: a.left - v.left, y: a.top - v.top }; });
  const para = await frame.evaluate(() => { const L = Asc.editor.asc_GetSelectedDrawingLayout(); return L.anchor; });
  check("anchor in the margin of its paragraph", an.x < para.x && para.x - an.x < 30 && Math.abs(an.y - para.y) < 3, { an, para });
  check("Move with text selected", await frame.evaluate(() => $("input[name=elx-lo-move][value=move]").prop("checked")));
  // every wrapping style keeps the place
  for (const w of ["tight", "through", "topAndBottom", "behind", "inFront", "square"]) {
    B = await L.layout(frame);
    await (await frame.$(`.elx-lo-tile[data-wrap=${w}]`)).click();
    A = await L.idle(frame);
    check(`${w}: applied, picture in place`, A.images.find(i => i.id === id).wrap !== undefined && moved(B, A, id) < 0.5 && await frame.evaluate(w => $(".elx-lo-tile.active").data("wrap") === w, w), { moved: moved(B, A, id) });
  }
  // Fix position on page
  B = await L.layout(frame);
  await (await frame.$("input[name=elx-lo-move][value=fix]")).click();
  A = await L.idle(frame);
  im = A.images.find(i => i.id === id);
  check("Fix position on page: page relative, in place", im.relV === 5 && im.relH === 6 && moved(B, A, id) < 0.5, { relV: im.relV, relH: im.relH, moved: moved(B, A, id) });
  // typing above does not move it any more
  await L.caretInPara(frame, "Lis attentivement", "start");
  B = await L.layout(frame);
  A = await L.typeText(page, frame, "Une nouvelle ligne de consigne ajoutée au-dessus de l'image, assez longue pour faire une ligne de plus. ");
  check("fixed picture does not move when text is added above", moved(B, A, id) < 0.5, { moved: moved(B, A, id) });
  await L.selectImage(frame, id);
  await (await frame.$(".elx-lo-btn")).click();
  await frame.waitForTimeout(200);
  B = await L.layout(frame);
  await (await frame.$("input[name=elx-lo-move][value=move]")).click();
  A = await L.idle(frame);
  im = A.images.find(i => i.id === id);
  check("Move with text: paragraph relative, in place", im.relV === 6 && moved(B, A, id) < 0.5, { relV: im.relV, moved: moved(B, A, id) });
  // Esc closes, focus back in the document
  await page.keyboard.press("Escape");
  await frame.waitForTimeout(150);
  check("Esc closes the flyout", !(await visible(frame, ".elx-lo-pane")));
  // See more... opens the Layout dialog
  await (await frame.$(".elx-lo-btn")).click();
  await frame.waitForTimeout(150);
  await (await frame.$(".elx-lo-more")).click();
  await frame.waitForTimeout(600);
  check("See more... opens the Layout dialog", await frame.evaluate(() => $(".asc-window:visible").length > 0));
  await frame.evaluate(() => { const w = $(".asc-window:visible"); const b = w.find(".dlg-btn[result=cancel]:visible, .tool.close:visible").first(); b.length ? b.click() : w.hide(); });
  await frame.waitForTimeout(300);
  check("Layout dialog closed", !(await frame.evaluate(() => $(".asc-window:visible").length > 0)));
  // hidden while dragging
  await L.selectImage(frame, id);
  A = await L.layout(frame); im = A.images.find(i => i.id === id);
  const c = await L.toScreen(page, frame, im.page, im.x + im.w / 2, im.y + im.h / 2);
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  for (let s = 1; s <= 6; s++) { await page.mouse.move(c.x + 5 * s, c.y + 3 * s); await page.waitForTimeout(30); }
  await frame.waitForTimeout(200);
  check("button and anchor hidden while dragging", !(await visible(frame, ".elx-lo-btn")) && !(await visible(frame, ".elx-lo-anchor-mark")));
  await page.mouse.up();
  await L.idle(frame);
  await frame.waitForTimeout(300);
  check("button back after the drop", await visible(frame, ".elx-lo-btn"));
  // nothing selected: no button
  await L.caretInPara(frame, "Bilan");
  await frame.waitForTimeout(300);
  check("no button without a selected object", !(await visible(frame, ".elx-lo-btn")) && !(await visible(frame, ".elx-lo-anchor-mark")));
  check("no page errors", errors.length === 0, errors.slice(0, 3));
  await browser.close();
}
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
