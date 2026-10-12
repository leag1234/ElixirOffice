// SPDX-License-Identifier: AGPL-3.0-only
// Layout stability metric (docs/images.md, section 3, "Stability metric").
//
// Compares two layout snapshots (probe.js) taken before and after one user action and
// reports how much of the content that the action should NOT have touched moved anyway.
//
//   affected paragraphs  = the paragraph that holds / anchors a manipulated image (before
//                          and after), the paragraph where text was typed, and every paragraph
//                          whose lines overlap the wrap rectangle of a floating image (before
//                          or after): those legitimately rewrap.
//   legit(p)             = total height change of the paragraphs placed before p: the cascade
//                          that Word produces too (text pushed down by the image or by the
//                          rewrapped lines); used to tell legitimate page changes from jumps.
//   U  (mm)              = for every unaffected paragraph: change of its gap to the element
//                          before it (previous paragraph of the body or of its cell, bottom of
//                          the previous table row) while both stay on their page, plus its own
//                          height change (rewrapped lines) and, in a table, the horizontal move
//                          of its cell. Moves explained by pagination are free.
//   J                    = unexpected page jumps: unaffected paragraphs that changed page while
//                          no growth explains it (|legit| < 1 mm), plus non-manipulated images
//                          that did not land on the page their anchor explains
//   M                    = non-manipulated floating images that moved by more than 0.5 mm
//                          beyond what their anchor explains (anchored to the paragraph / line:
//                          move with it; page or margin relative: must not move). Inline
//                          pictures are text and are checked with their paragraph.
//   O                    = new overlaps between floating images that wrap text
//   P                    = page-count change (reported, not in the cost: an inline picture
//                          legitimately adds pages)
//   cost S = U + 50 J + 20 M + 20 O   (0 = only what the Word model requires moved)
const EPS = 0.5;

function textArea(L, page) { const p = L.pages[Math.min(page, L.pages.length - 1)]; return { top: p.top, h: p.bottom - p.top }; }
export function flowY(L, page, y) {
  let acc = 0;
  for (let i = 0; i < page; i++) acc += textArea(L, i).h;
  return acc + (y - textArea(L, page).top);
}
const height = p => p.segs.reduce((s, g) => s + (g.bottom - g.top), 0);

// wrap rectangle of a floating image that pushes text (inline / behind / in front: none)
const WRAP_NONE = 0, WRAP_TOP_BOTTOM = 4;  // sdkjs WRAPPING_TYPE_*: 0 none, 1 square, 2 through, 3 tight, 4 top and bottom
export function wrapRect(im) {
  if (im.inline) return null;
  if (im.behind || im.wrap === WRAP_NONE) return null;
  return { page: im.page, l: im.x - 3.2, r: im.x + im.w + 3.2, t: im.y - 1, b: im.y + im.h + 1, full: im.wrap === WRAP_TOP_BOTTOM };
}
function overlaps(seg, R) {
  if (seg.page !== R.page) return false;
  if (seg.bottom <= R.t || seg.top >= R.b) return false;
  return R.full || !(seg.right <= R.l || seg.left >= R.r);
}

export function stability(B, A, { targets = [], edited = [] } = {}) {
  const bPara = new Map(B.paras.map((p, i) => [p.id, { p, i }]));
  const aPara = new Map(A.paras.map((p, i) => [p.id, { p, i }]));
  const bImg = new Map(B.images.map(i => [i.id, i])), aImg = new Map(A.images.map(i => [i.id, i]));
  const tset = new Set(targets);
  for (const id of aImg.keys()) if (!bImg.has(id)) tset.add(id);  // new images are manipulated
  const affected = new Set(edited);
  const rects = [];
  for (const id of tset) for (const im of [bImg.get(id), aImg.get(id)]) {
    if (!im) continue;
    if (im.anchor) affected.add(im.anchor);
    const R = wrapRect(im); if (R) rects.push(R);
  }
  for (const L of [B, A]) for (const p of L.paras) if (p.segs.some(s => rects.some(R => overlaps(s, R)))) affected.add(p.id);
  // text that the action moves next to another floating picture (one that did not move)
  // rewraps around it, as in Word: allowed too
  const still = [];
  for (const L of [B, A]) for (const im of L.images) if (!tset.has(im.id)) { const R = wrapRect(im); if (R) still.push(R); }
  for (const L of [B, A]) for (const p of L.paras) if (p.segs.some(s => still.some(R => overlaps(s, R)))) affected.add(p.id);
  // U: unaffected text that moved relative to what precedes it, or rewrapped.
  // For each unaffected paragraph p, the gap between p and its predecessor in the flow
  // (previous paragraph of the same cell / of the body, or the bottom of the previous table)
  // must not change while both stay on the same page, and p must keep its height. Moves
  // explained by pagination (a predecessor that changed page) are free: that is the
  // cascade Word produces too.
  const lastSeg = q => q.segs[q.segs.length - 1];
  const rowBottom = (L, table, row) => {
    const last = L.paras.filter(r => r.cell && r.cell.table === table && r.cell.row === row && r.segs.length).map(lastSeg);
    if (!last.length) return null;
    const page = Math.max(...last.map(g => g.page));
    return { page, bottom: Math.max(...last.filter(g => g.page === page).map(g => g.bottom)) };
  };
  const pred = (L, i) => {
    const p = L.paras[i];
    for (let j = i - 1; j >= 0; j--) {
      const q = L.paras[j];
      if (!q.segs.length) continue;
      if (p.cell && q.cell && q.cell.table === p.cell.table) {
        if (q.cell.row === p.cell.row && q.cell.cell === p.cell.cell) return lastSeg(q);
        if (q.cell.row === p.cell.row) continue;          // another cell of the same row
        if (p.cell.row > 0) return rowBottom(L, p.cell.table, p.cell.row - 1);  // first paragraph of a cell
        continue;
      }
      if (q.cell) return rowBottom(L, q.cell.table, q.cell.row);  // paragraph (or table) after a table
      return lastSeg(q);
    }
    return null;
  };
  const pagesOf = p => p.segs.map(g => g.page).join(",");
  let legit = 0, U = 0, J = 0, rewrap = 0, moved = 0;
  const details = [];
  for (let i = 0; i < B.paras.length; i++) {
    const bp = B.paras[i];
    const ap = aPara.get(bp.id);
    if (!ap || !bp.segs.length || !ap.p.segs.length) continue;
    const dh = height(ap.p) - height(bp);
    if (affected.has(bp.id)) { legit += Math.abs(dh); continue; }
    const b0 = bp.segs[0], a0 = ap.p.segs[0];
    const qb = pred(B, i), qa = pred(A, ap.i);
    let err = 0;
    if (qb && qa && qb.page === b0.page && qa.page === a0.page) err += Math.abs((a0.top - qa.bottom) - (b0.top - qb.bottom));
    else if (!qb && !qa && a0.page === b0.page) err += Math.abs(a0.top - b0.top);  // first paragraph of a cell / of the document
    // height change = rewrapped lines; when the paragraph is split differently across pages
    // (pagination), its bounds change without any rewrap: not counted
    const paginated = pagesOf(bp) !== pagesOf(ap.p) || (qb ? qb.page : -1) !== (qa ? qa.page : -1) || (qb && qb.page !== b0.page) || (qa && qa.page !== a0.page);
    if (Math.abs(dh) > EPS && !paginated) { rewrap++; err += Math.abs(dh); }
    // horizontal: a table column that widens or narrows moves the text of the other cells
    if (bp.cell) err += Math.abs(a0.left - b0.left) + Math.abs(a0.right - b0.right);
    if (err > EPS) { U += err; moved++; if (details.length < 8) details.push({ para: bp.id, text: bp.text.slice(0, 24), err: +err.toFixed(1), dh: +dh.toFixed(1) }); }
    if (a0.page !== b0.page && legit < 1) J++;
    legit += Math.abs(dh);
  }
  let M = 0;
  const imgDetails = [];
  for (const [id, bi] of bImg) {
    if (tset.has(id) || bi.inline) continue;  // inline pictures are text: checked with their paragraph
    const ai = aImg.get(id); if (!ai || ai.inline) continue;
    let ey = 0, expectPage = bi.page;
    const anchB = bi.anchor && bPara.get(bi.anchor), anchA = ai.anchor && aPara.get(ai.anchor);
    const followsText = bi.inline || bi.relV === 6 /* paragraph */ || bi.relV === 2 /* line */ || bi.inCell;
    const dyFlow = flowY(A, ai.page, ai.y) - flowY(B, bi.page, bi.y);
    if (followsText && anchB && anchA && anchB.p.segs.length && anchA.p.segs.length) {
      // Word positions the object from where its paragraph starts before the paragraph wraps
      // around the object itself: the bottom of the element before it on the same page
      const natural = (L, a) => { const s0 = a.p.segs[0], q = pred(L, a.i); return q && q.page === s0.page ? { page: q.page, y: q.bottom } : { page: s0.page, y: s0.top }; };
      const nb = natural(B, anchB), na = natural(A, anchA);
      ey = flowY(A, na.page, na.y) - flowY(B, nb.page, nb.y);
      expectPage = bi.page + (na.page - nb.page);
    }
    // an inline picture also moves horizontally when the text before it on its line changes
    const errY = Math.abs(dyFlow - ey), errX = bi.inline ? 0 : Math.abs(ai.x - bi.x);
    if (errY > EPS || errX > EPS) { M++; if (imgDetails.length < 8) imgDetails.push({ img: id, dx: +(ai.x - bi.x).toFixed(1), dy: +dyFlow.toFixed(1), expected: +ey.toFixed(1) }); }
    if (ai.page !== expectPage) J++;
  }
  const ov = L => {
    const f = L.images.filter(i => wrapRect(i) && !i.inCell);
    const s = new Set();
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
      const a = f[i], b = f[j];
      if (a.page === b.page && a.x < b.x + b.w - 0.1 && b.x < a.x + a.w - 0.1 && a.y < b.y + b.h - 0.1 && b.y < a.y + a.h - 0.1) s.add([a.id, b.id].sort().join("+"));
    }
    return s;
  };
  const ob = ov(B), oa = ov(A);
  const O = [...oa].filter(k => !ob.has(k)).length;
  const P = A.pages.length - B.pages.length;
  const S = U + 50 * J + 20 * M + 20 * O;
  return { S: +S.toFixed(1), U: +U.toFixed(1), J, M, O, P, pages: A.pages.length, moved, rewrap, details, imgDetails };
}
