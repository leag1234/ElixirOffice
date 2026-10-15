#!/usr/bin/env node
// Multi-image layout stability suite (docs/images.md).
//   EO_BASE=http://localhost:32776 node tests/images/run.mjs [--only a,b] [--out results/x.json] [--shots dir]
// Each scenario opens a fresh copy of the worksheet fixture, plays user actions and measures
// the layout after each action (metric.mjs: S = U + 50 J + 20 M + 20 O), plus checks done
// here and added to S:
//   F     pictures created or changed by the action that overflow their paragraph, cell or page (x20)
//   self  move of a picture whose wrapping only was changed (mm; Word keeps it in place)
//   D     distance between where a dragged picture was dropped (its ghost at the release) and
//         where it lands, or move of the fixed corner of a resized picture (mm). Word's own
//         rules are not counted: an object hanging into the bottom margin takes its paragraph
//         to the next page, an object is kept inside the page width.
// IMG_DEBUG=1 prints what moved. Results: --out results.json (tests/images/results/).
import fs from "node:fs";
import path from "node:path";
import * as L from "./lib.mjs";
import { stability, flowY } from "./metric.mjs";

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt("--only") ? opt("--only").split(",") : null;
const out = opt("--out");
const shots = opt("--shots");
if (shots) fs.mkdirSync(shots, { recursive: true });

// Checks on one layout, independent of the previous one:
//   F = pictures that overflow the width available where they are (inline: the paragraph's
//       text width or the table cell; floating: the page)
//   A = aspect-ratio changes of pictures that the action did not ask to distort
function fitIssues(Lay, only) {
  let F = 0; const list = [];
  for (const im of Lay.images) {
    if (!im.inline || !only.has(im.id)) continue;
    const p = Lay.paras.find(p => p.id === im.anchor);
    const seg = p && (p.segs.find(s => s.page === im.page) || p.segs[0]);
    if (!seg) continue;
    if (im.x + im.w > seg.right + 0.5 || im.x < seg.left - 0.5) { F++; list.push({ img: im.id, right: +(im.x + im.w).toFixed(1), limit: seg.right }); }
    const pg = Lay.pages[im.page];
    if (pg && im.h > pg.bottom - pg.top + 0.5) { F++; list.push({ img: im.id, h: im.h, limit: +(pg.bottom - pg.top).toFixed(1) }); }
  }
  return { F, list };
}

class Run {
  constructor(name, page, frame) { this.name = name; this.page = page; this.frame = frame; this.steps = []; this.ratio = new Map(); }
  async step(label, fn, { targets = [], edited = [], keepsPlace = false, drop = null, fixedCorner = null } = {}) {
    const B = await L.layout(this.frame);
    const t0 = Date.now();
    const A = (await fn()) || await L.idle(this.frame);
    const ms = Date.now() - t0;
    const tg = typeof targets === "function" ? targets(B, A) : targets;
    const ed = typeof edited === "function" ? edited(B, A) : edited;
    const m = stability(B, A, { targets: tg, edited: ed });
    // overflow of the pictures this action created or changed (not of the others again)
    const fit = fitIssues(A, new Set([...tg, ...A.images.filter(i => !B.images.some(j => j.id === i.id)).map(i => i.id)]));
    m.F = fit.F; if (fit.list.length) m.fit = fit.list;
    // the manipulated picture itself must stay where it is when only its wrapping changes
    if (keepsPlace) {
      let self = 0;
      for (const id of tg) {
        const b = B.images.find(i => i.id === id), a = A.images.find(i => i.id === id);
        if (a && b) self += Math.abs(flowY(A, a.page, a.y) - flowY(B, b.page, b.y)) + Math.abs(a.x - b.x);
      }
      m.self = +self.toFixed(1);
    }
    // a dragged picture must land where it is dropped (the ghost at the moment of the drop,
    // snapping included)
    if (drop && L.lastDrop && L.lastDrop.page !== null) {
      const sel = await L.selectedImage(this.frame);
      const a = A.images.find(i => i.id === sel);
      if (a) {
        const d = L.lastDrop, pg = A.pages[d.page] || A.pages[0];
        // Word's own rules, not errors: an object that hangs into the bottom margin takes its
        // paragraph to the next page (Word 2013+), and an object is kept inside the page width
        const wordNextPage = a.page === d.page + 1 && d.y + a.h > pg.bottom + 0.01;
        const offPage = d.x < -0.01 || d.x + a.w > pg.w + 0.01;
        if (wordNextPage) m.W = 1;
        const ey = wordNextPage ? 0 : Math.abs(flowY(A, a.page, a.y) - flowY(A, d.page, d.y));
        const ex = offPage ? 0 : Math.abs(a.x - d.x);
        m.D = +((ey > 0.5 ? ey : 0) + (ex > 0.5 ? ex : 0)).toFixed(1);
        if (m.D && process.env.IMG_DEBUG) console.log("     drop", JSON.stringify(L.lastDrop), "landed", JSON.stringify({ page: a.page, x: a.x, y: a.y, h: a.h, anchor: (A.paras.find(p => p.id === a.anchor) || {}).segs }));
      }
    }
    // resizing from one handle must not move the opposite corner
    if (fixedCorner) {
      const b = B.images.find(i => i.id === tg[0]), a = A.images.find(i => i.id === tg[0]);
      if (a && b) {
        const pt = (L_, i) => fixedCorner === "tl" ? [flowY(L_, i.page, i.y), i.x] : [flowY(L_, i.page, i.y + i.h), i.x + i.w];
        const [by, bx] = pt(B, b), [ay, ax] = pt(A, a);
        const e = Math.abs(ay - by) + Math.abs(ax - bx);
        m.D = +(e > 0.5 ? e : 0).toFixed(1);
        if (m.D && process.env.IMG_DEBUG) console.log("     resize", JSON.stringify(b), "->", JSON.stringify(a));
      }
    }
    m.S = +(m.S + 20 * m.F + (m.self || 0) + (m.D || 0)).toFixed(1);
    this.steps.push({ label, ms, ...m });
    const extra = (m.self !== undefined ? ` self=${m.self}` : "") + (m.D !== undefined ? ` D=${m.D}` : "") + (m.W ? " (Word: to next page)" : "");
    console.log(`  ${label.padEnd(44)} S=${String(m.S).padStart(6)} U=${m.U} J=${m.J} M=${m.M} O=${m.O} F=${m.F}${extra} pages=${m.pages}${m.P ? ` (${m.P > 0 ? "+" : ""}${m.P})` : ""}`);
    if (process.env.IMG_DEBUG && (m.details.length || m.imgDetails.length)) console.log("    ", JSON.stringify(m.details.slice(0, 3)), JSON.stringify(m.imgDetails.slice(0, 3)));
    return A;
  }
  newImage(B, A) { return A.images.find(i => !B.images.some(j => j.id === i.id)); }
  summary() {
    const s = k => +this.steps.reduce((a, x) => a + (x[k] || 0), 0).toFixed(1);
    return { scenario: this.name, steps: this.steps.length, S: s("S"), U: s("U"), J: s("J"), M: s("M"), O: s("O"), F: s("F"), self: s("self"), D: s("D"), pages: this.steps.length ? this.steps[this.steps.length - 1].pages : null };
  }
}

const ids = Lay => Lay.images.map(i => i.id);
const lastImage = async frame => { const Lay = await L.layout(frame); return Lay.images[Lay.images.length - 1].id; };
// pictures in insertion order (ids are allocated increasingly)
const byOrder = Lay => Lay.images.slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

const PICS = ["photo-camera.jpg", "photo-small.jpg", "clip-star.png", "photo-portrait.jpg", "clip-icon.png", "clip-banner.png", "photo-small.jpg", "clip-star.png"];
const SPOTS = ["Exercice 1", "Exercice 2", "Exercice 3", "Exercice 4", "Exercice 5", "Exercice 6", "Consigne", "Bilan"];

// insert n pictures at the end of different exercises (Insert > Picture > From file)
async function insertN(r, n, { pics = PICS, spots = SPOTS, label = "insert" } = {}) {
  const got = [];
  for (let k = 0; k < n; k++) {
    await L.caretInPara(r.frame, spots[k % spots.length]);
    const A = await r.step(`${label} ${pics[k % pics.length]} @ ${spots[k % spots.length]}`, () => L.insertPictureFromFile(r.page, r.frame, pics[k % pics.length]));
    got.push(byOrder(A)[byOrder(A).length - 1].id);
  }
  return got;
}
// small floating pictures, as a teacher lays out illustrations next to exercises
async function floatingSet(r, n, wrap = "square") {
  const pics = ["photo-small.jpg", "clip-icon.png", "photo-small.jpg", "clip-icon.png"];
  const got = await insertN(r, n, { pics, label: "insert" });
  for (const id of got) await r.step(`wrap ${id} -> ${wrap}`, () => L.setWrap(r.frame, id, wrap), { targets: [id], keepsPlace: true });
  return got;
}

const SCENARIOS = {
  // 1, 2, 4, 8 pictures inserted with the default layout
  async "insert-1"(r) { await insertN(r, 1); },
  async "insert-2"(r) { await insertN(r, 2); },
  async "insert-4"(r) { await insertN(r, 4); },
  async "insert-8"(r) { await insertN(r, 8); },
  // every wrapping style on one picture, then back to inline, with a second picture around
  async "wrap-cycle"(r) {
    const [a] = await insertN(r, 2, { pics: ["photo-small.jpg", "clip-star.png"], spots: ["Exercice 1", "Exercice 4"] });
    for (const w of ["square", "tight", "topAndBottom", "behind", "inFront", "square", "inline"])
      await r.step(`wrap -> ${w}`, () => L.setWrap(r.frame, a, w), { targets: [a], keepsPlace: true });
  },
  // drag floating pictures around the page and across pages
  async "drag-float"(r) {
    let [a, b, c, d] = await floatingSet(r, 4);
    const drag = async (id, dx, dy, label, o) => { await r.step(label || `drag ${id} ${dx},${dy}`, () => L.dragImage(r.page, r.frame, id, dx, dy, o), { targets: [id], drop: true }); return L.selectedImage(r.frame); };
    a = await drag(a, 10, 5);
    b = await drag(b, 60, 40);
    c = await drag(c, -40, -60);
    const Lay = await L.layout(r.frame); const A = Lay.images.find(i => i.id === a), B = Lay.images.find(i => i.id === b);
    a = await drag(a, B.x - A.x + 5, flowY(Lay, B.page, B.y) - flowY(Lay, A.page, A.y) + 5, `drag ${a} onto ${b}`);
    d = await drag(d, 0, 120, null, { steps: 24 });
  },
  // a picture dragged down to the next page, then back
  async "drag-cross-page"(r) {
    let [a] = await floatingSet(r, 1);
    const Lay = await L.layout(r.frame); const A = Lay.images.find(i => i.id === a);
    const dy = flowY(Lay, A.page + 1, Lay.pages[A.page + 1].top + 30) - flowY(Lay, A.page, A.y);
    await r.step(`drag ${a} to next page`, () => L.dragImage(r.page, r.frame, a, 20, dy, { steps: 30 }), { targets: [a], drop: true });
    a = await L.selectedImage(r.frame);
    await r.step(`drag ${a} back up`, () => L.dragImage(r.page, r.frame, a, -20, -dy, { steps: 30 }), { targets: [a], drop: true });
  },
  // a picture moved down the page, near and into the bottom margin, for three wrappings
  async "drag-down-page"(r) {
    for (const [k, wrap] of [[1, "square"], [3, "topAndBottom"], [5, "inFront"]]) {
      await L.caretInPara(r.frame, "Exercice " + k);
      let A = await r.step(`insert photo-small.jpg @ Exercice ${k}`, () => L.insertPictureFromFile(r.page, r.frame, "photo-small.jpg"));
      let id = byOrder(A)[byOrder(A).length - 1].id;
      await r.step(`width 50 mm`, () => L.setWidth(r.frame, id, 50), { targets: [id] });
      A = await r.step(`wrap -> ${wrap}`, () => L.setWrap(r.frame, id, wrap), { targets: [id], keepsPlace: true });
      await r.frame.evaluate(() => Asc.editor.zoom(50));
      let im = A.images.find(i => i.id === id), pg = A.pages[im.page];
      // middle of the text area, then 10 mm into the bottom margin
      await r.step(`${wrap}: drag down 60 mm`, () => L.dragImage(r.page, r.frame, id, 15, 60, { steps: 20 }), { targets: [id], drop: true });
      id = await L.selectedImage(r.frame);
      A = await L.layout(r.frame); im = A.images.find(i => i.id === id); pg = A.pages[im.page];
      await r.step(`${wrap}: drag into the bottom margin`, () => L.dragImage(r.page, r.frame, id, 0, pg.bottom + 10 - im.h - im.y, { steps: 20 }), { targets: [id], drop: true });
      await r.frame.evaluate(() => Asc.editor.zoom(100));
    }
  },
  // a picture dragged over the table (its anchor goes into a cell, as in Word), then out
  async "drag-over-table"(r) {
    let [a] = await floatingSet(r, 1);
    await r.step(`width 40 mm`, () => L.setWidth(r.frame, a, 40), { targets: [a] });
    let Lay = await L.layout(r.frame);
    const cell = Lay.paras.find(p => p.text === "Poule").segs[0], im = Lay.images.find(i => i.id === a);
    await r.frame.evaluate(() => Asc.editor.zoom(50));
    const dy = flowY(Lay, cell.page, cell.top + 1) - flowY(Lay, im.page, im.y);
    await r.step(`drag ${a} onto the table`, () => L.dragImage(r.page, r.frame, a, cell.left + 60 - im.x, dy, { steps: 25 }), { targets: [a], drop: true });
    a = await L.selectedImage(r.frame);
    await r.step(`drag ${a} out of the table`, () => L.dragImage(r.page, r.frame, a, 0, 60, { steps: 20 }), { targets: [a], drop: true });
    await r.frame.evaluate(() => Asc.editor.zoom(100));
  },
  // typing above floating pictures that move with text
  async "type-before"(r) {
    await floatingSet(r, 4);
    await L.caretInPara(r.frame, "Lis attentivement");
    await r.step("type 3 lines above", () => L.typeText(r.page, r.frame, " Attention : ".concat("relis bien les consignes avant de commencer, ".repeat(5))), { edited: B => [B.paras.find(p => p.text.startsWith("Lis attentivement")).id] });
    await r.step("Enter x3 above", async () => { for (let k = 0; k < 3; k++) await L.pressKey(r.page, r.frame, "Enter"); return L.idle(r.frame); }, { edited: B => [B.paras.find(p => p.text.startsWith("Lis attentivement")).id] });
  },
  // typing above pictures with "Fix position on page": they must not move
  async "type-before-fixed"(r) {
    const got = await floatingSet(r, 3);
    for (const id of got) await r.step(`fix ${id} on page`, () => L.fixOnPage(r.frame, id), { targets: [id], keepsPlace: true });
    await L.caretInPara(r.frame, "Lis attentivement");
    await r.step("type 3 lines above", () => L.typeText(r.page, r.frame, " Attention : ".concat("relis bien les consignes avant de commencer, ".repeat(5))), { edited: B => [B.paras.find(p => p.text.startsWith("Lis attentivement")).id] });
  },
  // resize handles
  async "resize"(r) {
    const [a, b] = await floatingSet(r, 2);
    for (const id of [a, b]) r.ratio.set(id, null);
    await r.step(`corner br +25,+25 ${a}`, () => L.resizeImage(r.page, r.frame, a, "br", 25, 25), { targets: [a], fixedCorner: "tl" });
    await r.step(`corner tl -10,-10 ${b}`, () => L.resizeImage(r.page, r.frame, b, "tl", -10, -10), { targets: [b], fixedCorner: "br" });
    await r.step(`edge r +20 ${a}`, () => L.resizeImage(r.page, r.frame, a, "r", 20, 0), { targets: [a], fixedCorner: "tl" });
  },
  // pasted pictures (screenshot / copied image file)
  async "paste"(r) {
    await L.caretInPara(r.frame, "Exercice 2");
    await r.step("paste photo-camera.jpg @ Exercice 2", () => L.pastePicture(r.page, r.frame, "photo-camera.jpg"));
    await L.caretInPara(r.frame, "Exercice 5");
    await r.step("paste clip-star.png @ Exercice 5", () => L.pastePicture(r.page, r.frame, "clip-star.png"));
  },
  // pictures in table cells: inserted and dropped
  async "table-cell"(r) {
    await L.caretInPara(r.frame, "Vache");
    await r.step("insert photo-camera.jpg in cell Vache", () => L.insertPictureFromFile(r.page, r.frame, "photo-camera.jpg"));
    await L.caretInPara(r.frame, "Poule");
    await r.step("insert photo-portrait.jpg in cell Poule", () => L.insertPictureFromFile(r.page, r.frame, "photo-portrait.jpg"));
    const Lay = await L.layout(r.frame);
    const cell = Lay.paras.find(p => p.text === "Mouton");
    const s = cell.segs[0];
    await r.step("drop photo-small.jpg on cell Mouton", () => L.dropPicture(r.page, r.frame, "clip-banner.png", s.page, s.left + 5, (s.top + s.bottom) / 2));
  },
  // a whole worksheet session: 8 pictures, half floating, moved, then text added above
  async "worksheet-8"(r) {
    const got = await insertN(r, 8, { pics: ["photo-small.jpg", "clip-star.png", "photo-portrait.jpg", "clip-icon.png", "photo-camera.jpg", "photo-small.jpg", "clip-icon.png", "clip-star.png"] });
    for (const id of got.slice(0, 4)) await r.step(`wrap ${id} -> square`, () => L.setWrap(r.frame, id, "square"), { targets: [id], keepsPlace: true });
    for (const id of got.slice(0, 4)) await r.step(`resize ${id} to 45 mm`, () => L.setWidth(r.frame, id, 45), { targets: [id] });
    await r.step(`drag ${got[0]} +80,+10`, () => L.dragImage(r.page, r.frame, got[0], 80, 10), { targets: [got[0]], drop: true });
    await r.step(`drag ${got[1]} +70,-20`, () => L.dragImage(r.page, r.frame, got[1], 70, -20), { targets: [got[1]], drop: true });
    await r.step(`drag ${got[3]} -20,+30`, () => L.dragImage(r.page, r.frame, got[3], -20, 30), { targets: [got[3]], drop: true });
    await L.caretInPara(r.frame, "Lis attentivement");
    await r.step("type a sentence above", () => L.typeText(r.page, r.frame, " Écris au crayon à papier."), { edited: B => [B.paras.find(p => p.text.startsWith("Lis attentivement")).id] });
  },
};

// same session on a worksheet kept in Word 2010 compatibility mode
SCENARIOS["worksheet-8-compat14"] = r => SCENARIOS["worksheet-8"](r);

const results = [];
const { browser, page, errors } = await L.launch({});
for (const [name, fn] of Object.entries(SCENARIOS)) {
  if (only && !only.includes(name)) continue;
  console.log(`== ${name}`);
  const { frame } = await L.openFixture(page, name.endsWith("-compat14") ? "worksheet-compat14.docx" : "worksheet.docx");
  const r = new Run(name, page, frame);
  try { await fn(r); } catch (e) { console.log("  ERROR", e.message.split("\n")[0]); r.error = e.message.split("\n")[0]; }
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
  results.push({ ...r.summary(), error: r.error || null, detail: r.steps });
}
await browser.close();
console.log("\nscenario              steps      S       U    J   M   O   F  self     D  pages");
for (const s of results) console.log(`${s.scenario.padEnd(20)} ${String(s.steps).padStart(5)} ${String(s.S).padStart(7)} ${String(s.U).padStart(7)} ${String(s.J).padStart(4)} ${String(s.M).padStart(3)} ${String(s.O).padStart(3)} ${String(s.F).padStart(3)} ${String(s.self).padStart(5)} ${String(s.D).padStart(5)} ${String(s.pages).padStart(5)}${s.error ? "  ERROR " + s.error : ""}`);
const total = +results.reduce((a, s) => a + s.S, 0).toFixed(1);
console.log(`TOTAL S = ${total}`);
if (errors.length) console.log("page errors:", JSON.stringify(errors.slice(0, 5)).slice(0, 800));
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ base: L.BASE, at: new Date().toISOString(), total, results, errors: errors.slice(0, 20) }, null, 1)); }
