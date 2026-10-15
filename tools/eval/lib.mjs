// Shared helpers of the AI evaluation harness (Playwright against a running editor instance).
//
// Environment:
//   EO_BASE   editor instance (default http://localhost:8080, the main dev instance)
//   PW_DIR    directory where the playwright package is installed (default /srv/elixiroffice/pw)
//   EO_ENV    .env file holding OPENAI_API_KEY (default <repo>/.env). The key is never printed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BASE = process.env.EO_BASE || "http://localhost:8080";
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
export const { chromium } = createRequire(path.join(PW_DIR, "package.json"))("playwright");

export function readKey(name = "OPENAI_API_KEY") {
  const file = process.env.EO_ENV || path.join(REPO, ".env");
  const m = fs.readFileSync(file, "utf8").match(new RegExp("^" + name + "=(.*)$", "m"));
  if (!m) throw new Error(name + " missing in " + file);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

export async function uploadDocx(file) {
  const fd = new FormData();
  fd.append("uploadedFile", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await fetch(BASE + "/example/upload", { method: "POST", body: fd, headers: { Cookie: "uid=uid-1" } });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}

export async function launch(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 } });
  if (opts.settings) {
    await context.addInitScript(s => { try { localStorage.setItem("elixir-ai-settings", JSON.stringify(s)); } catch (e) {} }, opts.settings);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push({ t: Date.now(), kind: "pageerror", text: String(e) }));
  page.on("console", m => { if (m.type() === "error") { let u = ""; try { u = (m.location() || {}).url || ""; } catch (e) {} errors.push({ t: Date.now(), kind: "console", text: m.text() + (u && /Failed to load resource/.test(m.text()) ? " <" + u.slice(0, 200) + ">" : "") }); } });
  const requests = [];
  // Request bodies of the model calls are kept (to diff what the model was given); headers are
  // never read, so the Authorization header (the key) is never stored.
  page.on("request", r => { try { const u = new URL(r.url()); requests.push({ t: Date.now(), host: u.host, ...(/\/chat\/completions$/.test(u.pathname) && r.method() === "POST" ? { model: true, body: r.postData() } : {}) }); } catch (e) {} });
  return { browser, context, page, errors, requests };
}

export async function waitFrame(page) {
  for (let i = 0; i < 400; i++) {
    const f = page.frames().find(f => f.url().includes("/documenteditor/main/"));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  throw new Error("editor frame not found");
}

export async function openEditor(page, fileName) {
  const url = fileName ? `${BASE}/example/editor?fileName=${encodeURIComponent(fileName)}` : `${BASE}/example/editor?fileExt=docx`;
  await page.goto(url, { waitUntil: "load" });
  const frame = await waitFrame(page);
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 90000 });
  await frame.waitForTimeout(1500);
  return frame;
}

// Run builder-API code through api.callCommand (the same path as a plugin's callCommand)
export async function cmd(frame, source) {
  return frame.evaluate(src => new Promise(resolve => Asc.editor.callCommand(src, true, r => resolve(r))), source);
}

// Structural snapshot of the document body: what the checks compare.
// blocks: every body element (tracked deletions included, as stored); final: the document as it
// reads once the changes are accepted (deleted runs and paragraphs left out). Read-only internal
// fields (compiled run properties, drawing wrap, review types) are used where the builder has no getter.
export const SNAPSHOT = `(function(){
  var doc = Api.GetDocument(), out = [], fin = [];
  var MM = 36000, TW = 56.6929;
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  var finalText = function (p) {
    var t = '';
    for (var k = 0; k < p.GetElementsCount(); k++) {
      var e = p.GetElement(k);
      try { if (e.Run && e.Run.GetReviewType && e.Run.GetReviewType() === 1) continue; } catch (x) {}
      try { t += e.GetText(); } catch (x) {}
    }
    return t.replace(/[\\r\\n]+$/, '');
  };
  var runPr = function (p) {
    try {
      var c = p.Paragraph.Content;
      for (var k = 0; k < c.length; k++) {
        if (!c[k].Get_CompiledPr || !c[k].GetText || !String(c[k].GetText() || '').trim()) continue;
        if (c[k].GetReviewType && c[k].GetReviewType() === 1) continue;
        var pr = c[k].Get_CompiledPr(false);
        return { size: pr.FontSize, bold: !!pr.Bold, italic: !!pr.Italic, font: pr.RFonts && pr.RFonts.Ascii ? pr.RFonts.Ascii.Name : null,
          color: pr.Color ? [pr.Color.r, pr.Color.g, pr.Color.b] : null };
      }
    } catch (x) {}
    return null;
  };
  var listKind = function (p) {
    if (!p.GetNumbering()) return null;
    try { var np = p.Paragraph.GetNumPr(); var l = p.Paragraph.Parent.GetNumbering().GetNum(np.NumId).GetLvl(np.Lvl || 0); return l.IsBulleted() ? 'bullet' : 'numbered'; } catch (x) { return 'numbered'; }
  };
  var drawings = function (p) {
    var o = [];
    try { var all = p.GetAllDrawingObjects(); for (var k = 0; k < all.length; k++) { var d = all[k], pd = d.getParaDrawing ? d.getParaDrawing() : d.Drawing;
      var inl = pd.Is_Inline(), ph = pd.PositionH;
      o.push({ w: r1(d.GetWidth() / MM), h: r1(d.GetHeight() / MM), wrap: inl ? 'inline' : (['none', 'square', 'through', 'tight', 'topAndBottom'][pd.wrappingType] || 'none') + (pd.behindDoc ? '-behind' : ''),
        halign: !inl && ph && ph.Align ? ['center', 'inside', 'left', 'outside', 'right'][ph.Value] : null }); } } catch (x) {}
    return o;
  };
  for (var i = 0; i < doc.GetElementsCount(); i++) {
    var el = doc.GetElement(i), k = el.GetClassType(), b = {i:i, type:k}, f = null;
    if (k === 'paragraph') {
      var s = el.GetStyle(); b.style = s ? s.GetName() : 'Normal';
      b.text = el.GetText({Numbering:false}).replace(/[\\r\\n]+$/,'');
      var sec = el.GetSection(); b.cols = sec.GetColumnsCount(); b.secType = sec.GetType();
      b.list = !!el.GetNumbering();
      var pp = el.GetParaPr();
      f = { i: i, type: k, style: b.style, text: finalText(el), list: listKind(el), level: el.GetNumbering() ? el.GetNumbering().GetLevelIndex() : null,
        jc: pp.GetJc() || 'left', spaceAfter: pp.GetSpacingAfter(), spaceBefore: pp.GetSpacingBefore(), line: pp.GetSpacingLineValue(),
        indLeft: pp.GetIndLeft(), run: runPr(el), drawings: drawings(el), cols: b.cols };
      var deleted = false; try { deleted = el.Paragraph.GetReviewType() === 1; } catch (x) {}
      if (deleted && !f.text) f = null;
      if (f) { try { var j = JSON.parse(el.ToJSON(false, false)); f.pageBreakBefore = !!(j.pPr && j.pPr.pageBreakBefore); var tx = JSON.stringify(j); f.hasPageBreak = /"breakType":"page"|"type":"page"/.test(tx) || /"br"[^}]*page/.test(tx); } catch (x) {} }
    } else if (k === 'table') {
      b.rows = el.GetRowsCount(); b.cells = [];
      for (var r = 0; r < b.rows; r++) { var row = el.GetRow(r), c = []; for (var j2 = 0; j2 < row.GetCellsCount(); j2++) c.push(row.GetCell(j2).GetContent().GetText().replace(/[\\r\\n]+/g,'').trim()); b.cells.push(c); }
      var json = el.ToJSON(false, false); if (typeof json === 'string') json = JSON.parse(json); b.header = !!(json && json.content && json.content[0] && json.content[0].trPr && json.content[0].trPr.tblHeader);
      f = { i: i, type: k, rows: b.rows, header: b.header, cells: [] };
      for (var r2 = 0; r2 < b.rows; r2++) { var row2 = el.GetRow(r2), c2 = [];
        var rowDeleted = false; try { rowDeleted = row2.Row.GetReviewType && row2.Row.GetReviewType() === 1; } catch (x) {}
        if (rowDeleted) continue;
        for (var j3 = 0; j3 < row2.GetCellsCount(); j3++) { var cc = row2.GetCell(j3).GetContent(), txt = '';
          for (var q = 0; q < cc.GetElementsCount(); q++) { var ce = cc.GetElement(q); if (ce.GetClassType() === 'paragraph') txt += (txt ? ' ' : '') + finalText(ce); }
          c2.push(txt.trim()); }
        f.cells.push(c2); }
      try { f.firstRowBold = !!(runPr(el.GetRow(0).GetCell(0).GetContent().GetElement(0)) || {}).bold; } catch (x) {}
      try { var bb = el.Table.GetPageBounds(0); f.widthMm = r1(bb.Right - bb.Left); } catch (x) {}
    } else if (k === 'blockLvlSdt') {
      b.text = el.GetContent().GetText().replace(/[\\r\\n]+/g, ' | ').trim();
      f = { i: i, type: k, text: b.text, toc: false, entries: [] };
      try { f.toc = !!el.Sdt.IsBuiltInTableOfContents(); } catch (x) {}
      try { var ct = el.GetContent(); for (var q2 = 0; q2 < ct.GetElementsCount(); q2++) { var pe = ct.GetElement(q2); if (pe.GetClassType() !== 'paragraph') continue;
        var ps = pe.GetStyle(); f.entries.push({ style: ps ? ps.GetName() : '', text: pe.GetText().replace(/[\\r\\n]+$/, '') }); } } catch (x) {}
    }
    out.push(b);
    if (f) fin.push(f);
  }
  var secs = [], all = doc.GetSections();
  for (var n = 0; n < all.length; n++) { var S = all[n];
    var hd = '', ft = ''; try { var hc = S.GetHeader('default', false); hd = hc ? hc.GetText().replace(/[\\r\\n]+/g, ' ').trim() : ''; } catch (x) {}
    try { var fc = S.GetFooter('default', false); ft = fc ? fc.GetText().replace(/[\\r\\n]+/g, ' ').trim() : ''; } catch (x) {}
    var fjson = ''; try { var fc2 = S.GetFooter('default', false); fjson = fc2 ? JSON.stringify(fc2.ToJSON ? fc2.ToJSON() : '') : ''; } catch (x) {}
    var hjson = ''; try { var hc2 = S.GetHeader('default', false); hjson = hc2 ? JSON.stringify(hc2.ToJSON ? hc2.ToJSON() : '') : ''; } catch (x) {}
    secs.push({ w: r1(S.GetPageWidth() / TW), h: r1(S.GetPageHeight() / TW), mt: r1(S.GetPageMarginTop() / TW), mb: r1(S.GetPageMarginBottom() / TW),
      ml: r1(S.GetPageMarginLeft() / TW), mr: r1(S.GetPageMarginRight() / TW), cols: S.GetColumnsCount(), type: S.GetType(), header: hd, footer: ft,
      footerHasPage: /pgNum|instr[^,]*PAGE/.test(fjson), headerHasPage: /pgNum|instr[^,]*PAGE/.test(hjson) }); }
  var comments = []; try { var cs = doc.GetAllComments(); for (var m = 0; m < cs.length; m++) comments.push({ text: cs[m].GetText(), quote: cs[m].GetQuoteText ? cs[m].GetQuoteText() : '' }); } catch (x) {}
  var rep = doc.GetReviewReport(), revs = {};
  for (var a in rep) { if (Object.prototype.hasOwnProperty.call(rep, a) && Array.isArray(rep[a])) revs[a] = rep[a].map(function(x){ return x.Type; }); }
  var pages = null; try { pages = doc.GetPageCount(); } catch (x) {}
  return JSON.stringify({blocks: out, final: fin, sections: doc.GetSections().length, secs: secs, comments: comments, pages: pages, revisions: revs, track: doc.IsTrackRevisions()});
})()`;

export async function snapshot(frame) { return JSON.parse(await cmd(frame, SNAPSHOT)); }

export async function selectBlocks(frame, from, to) {
  await cmd(frame, `(function(){ var d = Api.GetDocument(); var r = d.GetElement(${from}).GetRange(); if (${to} > ${from}) r = r.ExpandTo(d.GetElement(${to}).GetRange()); r.Select(); return 1; })()`);
}

// Give the keyboard focus back to the document without changing the selection
export async function focusEditor(frame) {
  await frame.evaluate(() => { Asc.editor.asc_enableKeyEvents(true); const a = document.getElementById("area_id"); a && a.focus(); });
  await frame.waitForTimeout(100);
}

export function sameStructure(a, b) {
  return JSON.stringify(a.blocks) === JSON.stringify(b.blocks) && a.sections === b.sections &&
    JSON.stringify(a.secs || null) === JSON.stringify(b.secs || null) && JSON.stringify(a.final || null) === JSON.stringify(b.final || null) &&
    (a.comments || []).length === (b.comments || []).length;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
