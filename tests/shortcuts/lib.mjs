import { cancelHtmlDialogs } from "../html-dialogs.mjs";
// Shared helpers of the keyboard-shortcut suites (Playwright against a running editor).
//
// Environment:
//   EO_BASE   editor instance (default http://localhost:8095)
//   PW_DIR    directory where the playwright package is installed (default /srv/elixiroffice/pw)
//
// The editor is driven like a user: real key presses in the document, then the
// effect is read back from the editor (logic document, builder API, DOM).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../..");
export const BASE = process.env.EO_BASE || "http://localhost:8095";
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
const PW = createRequire(path.join(PW_DIR, "package.json"))("playwright");
export const { chromium } = PW;
// Browser and host (see docs/shortcuts.md, "Running on a real Mac"):
//   EO_BROWSER=chromium (default) | chrome (the installed Google Chrome) | webkit (Safari engine)
//   EO_REAL_MAC=1: the tests run on macOS itself; the editor already sees a Mac, so the user agent and
//   navigator.platform are not spoofed, and the suites play the Mac forms of their keys (Cmd for Ctrl)
export const EO_BROWSER = process.env.EO_BROWSER || "chromium";
export const REAL_MAC = process.env.EO_REAL_MAC === "1";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// platform: "win" (Windows/Linux key conventions) or "mac" (the editor believes it runs on macOS)
export async function launch({ platform = "win", w = 1440, h = 900, lang } = {}) {
  const browser = EO_BROWSER === "webkit" ? await PW.webkit.launch() : await chromium.launch(EO_BROWSER === "chrome" ? { channel: "chrome" } : {});
  const opts = { viewport: { width: w, height: h } };
  if (platform === "mac" && !REAL_MAC) opts.userAgent = MAC_UA;
  if (lang) opts.locale = lang;
  const context = await browser.newContext(opts);
  // WebKit knows no clipboard-write permission (and refuses the whole call when it is asked for)
  try { await context.grantPermissions(EO_BROWSER === "webkit" ? ["clipboard-read"] : ["clipboard-read", "clipboard-write"], { origin: BASE }); } catch (e) { /* not granted: clipboard cases report it */ }
  if (platform === "mac" && !REAL_MAC) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push({ t: Date.now(), kind: "pageerror", text: String(e) }));
  page.on("console", m => { if (m.type() === "error") errors.push({ t: Date.now(), kind: "console", text: m.text() }); });
  return { browser, context, page, errors, platform };
}

export async function waitFrame(page) {
  for (let i = 0; i < 400; i++) {
    const f = page.frames().find(f => f.url().includes("/documenteditor/main/"));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  throw new Error("editor frame not found");
}

export async function openEditor(page, { fileName, lang } = {}) {
  let url = fileName ? `${BASE}/example/editor?fileName=${encodeURIComponent(fileName)}` : `${BASE}/example/editor?fileExt=docx`;
  if (lang) url += `&lang=${lang}`;
  await page.goto(url, { waitUntil: "load" });
  const frame = await waitFrame(page);
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
  await frame.waitForTimeout(1500);
  return frame;
}

// Run builder-API code through api.callCommand (same path as a plugin)
export async function cmd(frame, source) {
  return frame.evaluate(src => new Promise(resolve => Asc.editor.callCommand(src, true, r => resolve(r))), source);
}

// Give the keyboard focus to the document without changing the selection
export async function focusDoc(frame) {
  await frame.evaluate(() => { Asc.editor.asc_enableKeyEvents(true); const a = document.getElementById("area_id"); a && a.focus(); });
}

// Close menus, dialogs, backstage and panels a previous test may have left open
export async function resetUi(frame, page) {
  await cancelHtmlDialogs(frame);
  await frame.evaluate(() => {
    try { Common.UI.Menu.Manager.hideAll(); } catch (e) {}
    try { $(".asc-window:visible").each(function () { const b = $(this).find(".tool.close:visible, .dlg-btn[result=cancel]:visible, .dlg-btn[result=close]:visible").first(); b.length ? b.click() : $(this).hide(); }); } catch (e) {}
    try { const lm = DE.getController("LeftMenu"); lm.leftMenu.menuFile && lm.leftMenu.menuFile.isVisible() && lm.leftMenu.menuFile.hide(); } catch (e) {}
    try { const lm = DE.getController("LeftMenu"); lm.leftMenu.close && lm.leftMenu.close(); } catch (e) {}
    try { const d = Asc.editor.WordControl.m_oLogicDocument; if (d.IsTrackRevisions && d.IsTrackRevisions()) Asc.editor.asc_SetTrackRevisions(false); } catch (e) {}
    try { if (Asc.editor.WordControl.m_oLogicDocument.IsDocumentEditor && Asc.editor.WordControl.m_oLogicDocument.GetDocPosType() !== 0) Asc.editor.WordControl.m_oLogicDocument.EndHdrFtrEditing(true); } catch (e) {}
    try { Asc.editor.zoom(100); } catch (e) {}
    try { Asc.editor.SetPaintFormat && Asc.editor.SetPaintFormat(0); } catch (e) {}
    try { const d = Asc.editor.WordControl.m_oLogicDocument; d.WordExtendSelection = 0; d.WordPendingAccent = null; } catch (e) {}
  });
  await focusDoc(frame);
}

// Replace the whole document. spec: array of paragraphs; a paragraph is a string
// or {text, style, bold, align, table:[[..],[..]], break:'page'}
export async function setDoc(frame, spec) {
  const src = `(function(){
    var doc = Api.GetDocument(); doc.RemoveAllElements();
    var spec = ${JSON.stringify(spec)};
    spec.forEach(function(s){
      if (typeof s === 'string') s = {text: s};
      if (s.table) {
        var t = Api.CreateTable(s.table[0].length, s.table.length);
        for (var r = 0; r < s.table.length; r++) for (var c = 0; c < s.table[r].length; c++)
          t.GetRow(r).GetCell(c).GetContent().GetElement(0).AddText(s.table[r][c]);
        doc.Push(t); return;
      }
      var p = Api.CreateParagraph();
      if (s.text) p.AddText(s.text);
      if (s.style) p.SetStyle(doc.GetStyle(s.style));
      if (s.size) p.SetFontSize(s.size * 2);
      if (s.bold) p.SetBold(true);
      if (s.pageBreak) p.AddPageBreak();
      doc.Push(p);
    });
    if (doc.GetElementsCount() > spec.length) doc.RemoveElement(0);
    return doc.GetElementsCount();
  })()`;
  const n = await cmd(frame, src);
  const got = await frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(e => (e.IsTable && e.IsTable()) ? null : e.GetText().replace(/[\r\n]+$/, "")));
  const want = spec.map(s => (typeof s === "string" ? s : s.table ? null : (s.text || "")));
  const strip = list => list.filter(t => t !== "");
  const same = JSON.stringify(strip(got).map(t => t === null ? null : t.replace(/\r/g, ""))) === JSON.stringify(strip(want));
  if (!same) throw new Error(`setDoc: the document is ${JSON.stringify(got).slice(0, 120)} (editor in a bad state)`);
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.MoveCursorToStartPos(false); d.UpdateSelection(); });
  return n;
}

// Put the caret before character `off` of top-level paragraph `p` (off = -1: end of paragraph)
export async function caret(frame, p, off = 0) {
  await frame.evaluate(([p, off]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    d.RemoveSelection();
    const para = d.Content[p];
    para.MoveCursorToStartPos ? para.MoveCursorToStartPos() : null;
    d.CurPos.ContentPos = p;
    d.Selection.Use = false;
    if (off === -1) para.MoveCursorToEndPos(); else { para.MoveCursorToStartPos(); for (let i = 0; i < off; i++) para.MoveCursorRight(false, false); }
    d.Document_UpdateSelectionState(); d.UpdateInterface && d.UpdateInterface();
  }, [p, off]);
  await focusDoc(frame);
}

// Select characters [from, to) of paragraph p (to = -1: to the end of the paragraph)
export async function select(frame, p, from, to) {
  await caret(frame, p, from);
  await frame.evaluate(([p, from, to]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    const len = d.Content[p].GetText().replace(/\r?\n$/, "").length;
    const end = to === -1 ? len : to;
    for (let i = from; i < end; i++) d.MoveCursorRight(true, false);
    d.Document_UpdateSelectionState(); d.UpdateInterface && d.UpdateInterface();
  }, [p, from, to]);
  await focusDoc(frame);
}

export async function selectAllInternal(frame) {
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); d.UpdateInterface && d.UpdateInterface(); });
  await focusDoc(frame);
}

// Read the document state the checks look at
export async function state(frame) {
  return frame.evaluate(() => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    const tp = d.GetCalculatedTextPr() || {};
    const pp = d.GetCalculatedParaPr() || {};
    const paras = [];
    for (let i = 0; i < d.Content.length; i++) {
      const el = d.Content[i];
      if (el.IsTable && el.IsTable()) {
        const rows = [];
        for (let r = 0; r < el.GetRowsCount(); r++) { const row = el.GetRow(r), cells = []; for (let c = 0; c < row.GetCellsCount(); c++) cells.push(row.GetCell(c).GetContent().GetText().replace(/[\r\n\t]+$/g, "")); rows.push(cells); }
        paras.push({ table: rows });
      } else {
        const st = el.GetParagraphStyle ? el.GetParagraphStyle() : (el.Pr && el.Pr.PStyle);
        paras.push({ text: el.GetText().replace(/\r?\n$/, ""), style: st ? (d.Styles.Get(st) ? d.Styles.Get(st).GetName() : st) : "Normal" });
      }
    }
    const styleId = pp.PStyle;
    return {
      paras,
      selected: d.GetSelectedText(false, { NewLineParagraph: true }) || "",
      hasSelection: d.IsSelectionUse(),
      text: { bold: !!tp.Bold, italic: !!tp.Italic, underline: !!tp.Underline, strike: !!tp.Strikeout, size: tp.FontSize, caps: !!tp.Caps, smallCaps: !!tp.SmallCaps, vertAlign: tp.VertAlign, vanish: !!tp.Vanish, font: tp.RFonts && tp.RFonts.Ascii && tp.RFonts.Ascii.Name },
      para: { jc: pp.Jc, left: pp.Ind && pp.Ind.Left, firstLine: pp.Ind && pp.Ind.FirstLine, line: pp.Spacing && pp.Spacing.Line, lineRule: pp.Spacing && pp.Spacing.LineRule, style: styleId ? (d.Styles.Get(styleId) ? d.Styles.Get(styleId).GetName() : styleId) : "Normal", numbered: !!pp.NumPr, bidi: !!pp.Bidi },
      zoom: Asc.editor.zoom ? Asc.editor.WordControl.m_nZoomValue : null,
      track: !!(d.IsTrackRevisions && d.IsTrackRevisions()),
      showParaMarks: !!Asc.editor.ShowParaMarks,
      comments: Object.keys(d.Comments && d.Comments.m_arrCommentsById ? d.Comments.m_arrCommentsById : (d.Comments.CommentsById || {})).length,
      footnotes: d.Footnotes && d.Footnotes.Footnote ? Object.keys(d.Footnotes.Footnote).length : 0,
      endnotes: d.Endnotes && d.Endnotes.Endnote ? Object.keys(d.Endnotes.Endnote).length : 0,
      docPosType: d.GetDocPosType ? d.GetDocPosType() : null,
      drawingSelected: !!(d.DrawingObjects && d.DrawingObjects.getSelectedObjects && d.DrawingObjects.getSelectedObjects().length),
      inTable: !!(d.IsInTable && d.IsInTable()),
      pages: d.GetPagesCount ? d.GetPagesCount() : null,
      currentPage: Asc.editor.getCurrentPage ? Asc.editor.getCurrentPage() : null,
    };
  });
}

// Type a marker at the caret and return the text of every top-level paragraph
export async function markCaret(frame, page, mark = "#") {
  await focusDoc(frame);
  await page.keyboard.type(mark);
  await frame.waitForTimeout(80);
  return (await state(frame)).paras.map(p => p.text !== undefined ? p.text : JSON.stringify(p.table));
}

// Visible dialog/panel helpers (DOM)
export async function visibleWindowText(frame) {
  return frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length && getComputedStyle(w).display !== "none" && getComputedStyle(w).visibility !== "hidden").map(w => (w.querySelector(".title") || w).textContent.trim()).join(" | "));
}

export async function isVisible(frame, selector) {
  return frame.evaluate(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden"), selector);
}

export function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const parse = line => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = parse(lines[0]);
  return lines.slice(1).map(l => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}
