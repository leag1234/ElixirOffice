#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Dragging and resizing a picture like in Word (docs/images.md): alignment guides, snapping
// to the margins and paragraphs, anchor rules, aspect ratio of the resize handles.
//   EO_BASE=http://localhost:32776 node tests/images/drag-resize.mjs [--shots dir]
import fs from "node:fs";
import path from "node:path";
import * as L from "./lib.mjs";

const args = process.argv.slice(2);
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + JSON.stringify(info) : ""}`); };
const K = 96 / 25.4;  // px per mm at 100 %

// green pixels of the overlay canvas (alignment guides), counted along a column or a row
const greenAlong = (frame, axis, at) => frame.evaluate(([axis, at]) => {
  const c = document.getElementById("id_viewer_overlay"), r = window.devicePixelRatio || 1;
  const ctx = c.getContext("2d");
  const d = axis === "x" ? ctx.getImageData(Math.round(at * r) - 1, 0, 3, c.height).data : ctx.getImageData(0, Math.round(at * r) - 1, c.width, 3).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] > 140 && d[i + 2] < 120 && d[i + 3] > 200) n++;
  return n;
}, [axis, at]);

const { browser, page, errors } = await L.launch({});
const { frame } = await L.openFixture(page);
await L.caretInPara(frame, "Exercice 1");
let A = await L.insertPictureFromFile(page, frame, "photo-small.jpg");
let id = A.images[0].id;
await L.setWidth(frame, id, 50);
A = await L.setWrap(frame, id, "square");
let im = A.images.find(i => i.id === id);
const pg = A.pages[im.page];

// 1. drag the picture so that its left edge comes 0.8 mm right of the left margin
let c = await L.toScreen(page, frame, im.page, im.x + im.w / 2, im.y + im.h / 2);
const dx = (pg.left + 0.8 - im.x) * K;
await page.mouse.move(c.x, c.y); await page.mouse.down();
for (let s = 1; s <= 15; s++) { await page.mouse.move(c.x + dx * s / 15, c.y + 18 * K * s / 15); await page.waitForTimeout(25); }
await frame.waitForTimeout(150);
const marginPx = await frame.evaluate(([x, y, p]) => Asc.editor.WordControl.m_oDrawingDocument.ConvertCoordsToCursor4(x, y, p, true), [pg.left, im.y, im.page]);
const greens = await greenAlong(frame, "x", marginPx.X);
check("green alignment guide on the left margin while dragging", greens > 100, { greenPixels: greens });
check("ghost of the picture shown while dragging (live preview)", await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.arrTrackObjects.length === 1));
if (shots) await page.screenshot({ path: path.join(shots, "drag-guide.png") });
await page.mouse.up();
A = await L.idle(frame);
id = await L.selectedImage(frame);
im = A.images.find(i => i.id === id);
check("picture snapped to the margin", Math.abs(im.x - pg.left) < 0.05, { x: im.x, margin: pg.left });

// 2. the anchor moves to the paragraph under the picture's top (Word), not when locked
const paraAt = (Lay, page, y) => Lay.paras.filter(p => !p.cell && p.segs.some(s => s.page === page && s.top <= y + 0.01 && s.bottom > y)).map(p => p.id)[0];
check("anchor = paragraph at the top of the picture", im.anchor === paraAt(A, im.page, im.y), { anchor: im.anchor, under: paraAt(A, im.page, im.y) });
await L.selectImage(frame, id);
await frame.evaluate(() => { const p = new Asc.asc_CImgProperty(); p.put_LockAnchor(true); Asc.editor.ImgApply(p); });
A = await L.idle(frame);
const anchorBefore = A.images.find(i => i.id === id).anchor;
A = await L.dragImage(page, frame, id, 10, 60);
id = await L.selectedImage(frame);
im = A.images.find(i => i.id === id);
check("locked anchor stays on its paragraph", im.anchor === anchorBefore && im.locked, { anchor: im.anchor, before: anchorBefore });
await frame.evaluate(() => { const p = new Asc.asc_CImgProperty(); p.put_LockAnchor(false); Asc.editor.ImgApply(p); });
await L.idle(frame);

// 3. snapping to the top of a paragraph
A = await L.layout(frame);
im = A.images.find(i => i.id === id);
const target = A.paras.find(p => !p.cell && p.segs[0] && p.segs[0].page === im.page && p.segs[0].top > im.y + 15 && p.segs[0].top < im.y + 70 && p.text.length > 0);
await L.selectImage(frame, id);
const lineTop = await frame.evaluate(pid => { const p = AscCommon.g_oTableId.Get_ById(pid); const pp = p.Pages[0], l = p.Lines[pp.StartLine]; return pp.Y + l.Y - l.Metrics.Ascent; }, target.id);
const im0y = im.y;
c = await L.toScreen(page, frame, im.page, im.x + im.w / 2, im.y + im.h / 2);
const dy = (lineTop - im.y + 0.7) * K;
await page.mouse.move(c.x, c.y); await page.mouse.down();
for (let s = 1; s <= 15; s++) { await page.mouse.move(c.x + 2, c.y + dy * s / 15); await page.waitForTimeout(25); }
await frame.waitForTimeout(150);
const trackTop = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.arrTrackObjects[0].getBounds().min_y);
if (process.env.IMG_DEBUG) { console.log("c", c, "dy", dy, await frame.evaluate(() => { const t = Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.arrTrackObjects[0]; return JSON.stringify({ b: t.getBounds(), page: t.pageIndex }); })); await page.screenshot({ path: process.env.HOME + "/elixiroffice/wt/images-work/shots/snapdbg.png" }); }
const guideY = await frame.evaluate(([y, p]) => Asc.editor.WordControl.m_oDrawingDocument.ConvertCoordsToCursor4(0, y, p, true).Y, [lineTop, im.page]);
const greensH = await greenAlong(frame, "y", guideY);
await page.mouse.up();
A = await L.idle(frame);
id = await L.selectedImage(frame);
im = A.images.find(i => i.id === id);
check("picture top snaps to the top of a paragraph while dragging", Math.abs(trackTop - lineTop) < 0.05, { from: im0y, top: +trackTop.toFixed(2), paragraphTop: +lineTop.toFixed(2) });
check("green guide along that paragraph", greensH > 100, { greenPixels: greensH });

// 4. a wrapped picture lands where it is dropped, and one Ctrl+Z puts it back
for (const wrap of ["square", "topAndBottom"]) {
  await L.selectImage(frame, id);
  A = await L.setWrap(frame, id, wrap);
  id = await L.selectedImage(frame) || id;
  const before = A.images.find(i => i.id === id);
  A = await L.dragImage(page, frame, id, 12, -60, { steps: 15 });
  const drop = L.lastDrop;
  const nid = await L.selectedImage(frame);
  const got = A.images.find(i => i.id === nid);
  check(`${wrap}: lands where it is dropped`, got.page === drop.page && Math.abs(got.y - drop.y) < 0.1 && Math.abs(got.x - drop.x) < 0.1, { drop: { page: drop.page, x: +drop.x.toFixed(2), y: +drop.y.toFixed(2) }, landed: { page: got.page, x: got.x, y: got.y } });
  A = await L.pressKey(page, frame, "Control+z");
  const back = A.images.find(i => Math.abs(i.x - before.x) < 0.1 && Math.abs(i.y - before.y) < 0.1 && i.page === before.page);
  check(`${wrap}: one Ctrl+Z puts it back`, !!back && A.images.length === 1, { images: A.images.map(i => [i.page, i.x, i.y]) });
  id = back ? back.id : A.images[0].id;
}
await L.selectImage(frame, id);
A = await L.setWrap(frame, id, "square");
id = await L.selectedImage(frame) || id;
im = A.images.find(i => i.id === id);

// 5. resize handles: corner keeps the ratio of a photo, with or without Shift (Word), an edge stretches
const ratio = i => +(i.w / i.h).toFixed(3);
const r0 = ratio(im);
A = await L.resizeImage(page, frame, id, "br", 20, 3); im = A.images.find(i => i.id === id);
check("corner handle keeps the aspect ratio of a photo", Math.abs(ratio(im) - r0) < 0.01 && im.lockAspect, { ratio: ratio(im), before: r0 });
A = await L.resizeImage(page, frame, id, "br", 20, 3, { shift: true }); im = A.images.find(i => i.id === id);
check("Shift + corner keeps the aspect ratio of a locked photo", Math.abs(ratio(im) - r0) < 0.01 && im.lockAspect, { ratio: ratio(im), before: r0 });
const h0 = im.h;
A = await L.resizeImage(page, frame, id, "r", 10, 0); im = A.images.find(i => i.id === id);
check("side handle changes the width only", Math.abs(im.h - h0) < 0.05, { h: im.h, before: h0 });
check("no page errors", errors.length === 0, errors.slice(0, 3));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
