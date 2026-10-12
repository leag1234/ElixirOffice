// SPDX-License-Identifier: AGPL-3.0-only
// Test cases of the Word shortcut matrix (docs/shortcuts-word.csv).
//
// A case: { id, win, mac, doc, at|sel|pre, check }
//   win, mac   list of variants for that platform; a variant is a key ("Control+b")
//              or a list of steps: a key, {text: "..."} typed text, {wait: ms},
//              {wheel: dy, mod: "Control"}.
//   doc        document spec for setDoc (lib.mjs)
//   at         [paragraph, offset] caret, sel: [paragraph, from, to] selection
//   pre        async (ctx) extra setup after doc/at/sel
//   check      async (ctx) -> true, or a string saying what is wrong
// ctx: { frame, page, platform, s0 (state before the keys), st() (state now), js(fn, arg) }
import { isVisible, visibleWindowText, select, caret, cmd } from "./lib.mjs";

const W3 = ["alpha beta gamma"];
const LONG = Array.from({ length: 90 }, (_, i) => `Line ${i + 1} of a long document used to test scrolling and screens.`);
const TABLE = ["before", { table: [["a1", "b1", "c1"], ["a2", "b2", "c2"], ["a3", "b3", "c3"]] }, "after"];

// ---- helpers ---------------------------------------------------------------
const textOf = (s, i = 0) => s.paras[i] && s.paras[i].text;
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what || "got"} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const C = async (ctx, name) => ctx.js(n => n.split(".").reduce((o, k) => o[k], window), name);

async function marked(ctx) {
  await ctx.page.keyboard.type("#");
  await ctx.frame.waitForTimeout(60);
  const s = await ctx.st();
  return s.paras.map(p => (p.table ? p.table : p.text.replace(/\r/g, "")));
}

function caretCase(id, win, mac, doc, at, expected, extra = {}) {
  return { id, win, mac, doc, at, ...extra, check: async ctx => eq(await marked(ctx), expected, "text after typing # at the caret") };
}

// GetSelectedText adds a line break when the selection reaches the end of a paragraph,
// even without the paragraph mark: compare without it
const selText = s => s.selected.replace(/\r?\n$/, "");
function selCase(id, win, mac, doc, at, expected, extra = {}) {
  return { id, win, mac, doc, at, ...extra, check: async ctx => eq(selText(await ctx.st()), expected, "selected text") };
}

function textPrCase(id, win, mac, prop, value = true, extra = {}) {
  return {
    id, win, mac, doc: ["alpha beta"], sel: [0, 0, 5], ...extra,
    check: async ctx => { const s = await ctx.st(); const want = typeof value === "function" ? await value(ctx) : value; return eq(s.text[prop], want, prop); },
  };
}

function alignCase(id, win, mac, constName, startConst) {
  return {
    id, win, mac, doc: ["alpha beta"], at: [0, 2],
    pre: async ctx => { await ctx.js(c => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].Set_Align(AscCommon[c]); d.Recalculate(); }, startConst); },
    check: async ctx => eq((await ctx.st()).para.jc, await C(ctx, "AscCommon." + constName), "paragraph alignment"),
  };
}

function backstage(panels) {
  return async ctx => {
    const r = await ctx.js(() => { try { const m = DE.getController("LeftMenu").leftMenu.menuFile; return { visible: !!(m && m.isVisible()), active: m && m.active }; } catch (e) { return { visible: false }; } });
    if (!r.visible) return "File backstage not open";
    if (panels && !panels.includes(r.active)) return `backstage panel ${r.active}, expected ${panels.join(" or ")}`;
    return true;
  };
}

function windowCase(re) {
  return async ctx => { const t = await visibleWindowText(ctx.frame); return re.test(t) ? true : `no dialog matching ${re} (open: ${t || "none"})`; };
}

async function openCheck(ctx) {
  const recent = await ctx.js(() => DE.getController("Main").appOptions.canOpenRecent);
  return backstage(recent ? ["recent"] : null)(ctx);
}

const spy = name => async ctx => {
  await ctx.js(n => { window.__calls = window.__calls || {}; window.__calls[n] = 0; const api = Asc.editor; if (!api["__orig_" + n]) { api["__orig_" + n] = api[n]; api[n] = function () { window.__calls[n]++; return api["__orig_" + n].apply(this, arguments); }; } }, name);
};
const called = name => async ctx => ((await ctx.js(n => (window.__calls || {})[n] || 0, name)) > 0 ? true : `${name} was not called`);

// in-page: does paragraph p contain a break of the given type
const hasBreak = (ctx, p, kind) => ctx.js(([p, kind]) => {
  const d = Asc.editor.WordControl.m_oLogicDocument, para = d.Content[p];
  let found = false;
  para.CheckRunContent(function (run) { for (const it of run.Content) if (it.IsBreak && it.IsBreak() && (kind === "line" ? it.IsLineBreak() : kind === "column" ? it.IsColumnBreak() : it.IsPageBreak())) found = true; });
  return found;
}, [p, kind]);

const fieldsCount = ctx => ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllFields(false).length);

const tableCell = async (ctx, r, c) => { const s = await ctx.st(); const t = s.paras.find(p => p.table); return t && t.table[r][c]; };

async function inTableAt(ctx, r, c) {
  await cmd(ctx.frame, `(function(){ var d = Api.GetDocument(); for (var i = 0; i < d.GetElementsCount(); i++) { var t = d.GetElement(i); if (t.GetClassType() === "table") { t.GetCell(${r}, ${c}).GetContent().GetElement(0).GetRange().Select(); return 1; } } return 0; })()`);
  await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorLeft(false, false); d.Document_UpdateSelectionState(); d.UpdateInterface(); });
  await ctx.focus();
}

const zoom = ctx => ctx.js(() => Asc.editor.WordControl.m_nZoomValue);
const setZoom = (ctx, z) => ctx.js(z => { Asc.editor.zoom(z); }, z);
const scrollY = ctx => ctx.js(() => Asc.editor.WordControl.m_dScrollY);

const intl = (id, prefix, letter, out) => ({
  id, win: [[prefix, letter]], mac: [], doc: ["x"], at: [0, -1],
  check: async ctx => eq(textOf(await ctx.st()), "x" + out, "text"),
});

// ---- cases -----------------------------------------------------------------
export const CASES = [
  // file
  { id: "file.open", win: ["Control+o"], mac: ["Meta+o"], doc: W3, check: openCheck },
  { id: "file.open.ctrl-f12", win: ["Control+F12"], mac: [], doc: W3, check: openCheck },
  { id: "file.open.ctrl-alt-f2", win: ["Control+Alt+F2"], mac: [], doc: W3, check: openCheck },
  { id: "file.new", win: ["Control+n"], mac: ["Meta+n"], doc: W3, check: backstage(["new"]) },
  ...[["file.save", ["Control+s"], ["Meta+s"]], ["file.save.shift-f12", ["Shift+F12"], []], ["file.save.alt-shift-f2", ["Alt+Shift+F2"], []]].map(([id, win, mac]) => ({
    id, win, mac, doc: W3, at: [0, -1], pre: async ctx => { await ctx.page.keyboard.type("x"); await spy("asc_Save")(ctx); },
    check: async ctx => { const r = await called("asc_Save")(ctx); if (r !== true) return r; const t = textOf(await ctx.st()); return t === "alpha beta gammax" ? true : `text changed: ${t}`; },
  })),
  { id: "file.save-as", win: ["F12"], mac: ["Meta+Shift+s"], doc: W3, check: backstage(["saveas", "save-copy", "save-desktop"]) },
  ...[["file.print", ["Control+p"], ["Meta+p"]], ["file.print-preview", ["Control+Alt+i"], []], ["file.print-preview.ctrl-f2", ["Control+F2"], []], ["file.print.ctrl-shift-f12", ["Control+Shift+F12"], []]].map(([id, win, mac]) => ({
    // same as File > Print: the print preview of the backstage, or the browser print of the PDF when the integration has no preview
    id, win, mac, doc: W3, pre: spy("asc_Print"),
    check: async ctx => { const b = await backstage(["printpreview", "print"])(ctx); if (b === true) return true; return (await called("asc_Print")(ctx)) === true ? true : b + " and asc_Print not called"; },
  })),
  { id: "file.rename", win: ["Alt+b"], mac: [], doc: W3, check: async ctx => ((await isVisible(ctx.frame, ".asc-window input")) && /file name|rename/i.test(await ctx.js(() => $(".asc-window:visible").text())) ? true : "no rename dialog") },
  { id: "file.help", win: ["F1"], mac: [], doc: W3, check: async ctx => { if (!(await ctx.js(() => DE.getController("Main").appOptions.canHelp))) return { skip: "help is disabled in this deployment (File > Help absent)" }; return backstage(["help"])(ctx); } },

  // window
  ...[["window.cycle-regions", "F6"], ["window.cycle-regions.back", "Shift+F6"]].map(([id, k]) => ({
    id, win: [k], mac: [k], doc: W3, at: [0, 1],
    check: async ctx => {
      const where = () => ctx.js(() => { const a = document.activeElement; if (!a || a.id === "area_id") return "document"; if (a.closest("#toolbar")) return "ribbon"; if (a.closest("#statusbar")) return "statusbar"; if (a.closest("#left-menu, #right-menu, #left-panel, .left-panel, #right-panel")) return "pane"; return a.id || a.tagName; });
      const first = await where();
      if (first === "document") return "focus stayed in the document";
      if (!["ribbon", "statusbar", "pane"].includes(first)) return `focus went to ${first}`;
      for (let i = 0; i < 5; i++) { await ctx.page.keyboard.press(k); await ctx.frame.waitForTimeout(120); if ((await where()) === "document") return true; }
      return "F6 never comes back to the document";
    },
  })),

  // editing
  {
    id: "edit.cut", win: ["Control+x"], mac: ["Meta+x", "F2"], doc: ["alpha beta"], sel: [0, 0, 6], nativeClipboardOnMac: true,
    check: async ctx => { const t = textOf(await ctx.st()); if (t !== "beta") return `after cut: ${t}`; await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToEndPos(); }); await ctx.focus(); await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+v" : "Control+v"); await ctx.frame.waitForTimeout(400); return eq(textOf(await ctx.st()), "betaalpha ", "after cut and paste"); },
  },
  {
    id: "edit.copy", win: ["Control+c"], mac: ["Meta+c", "F3"], doc: ["alpha beta"], sel: [0, 0, 6], nativeClipboardOnMac: true,
    check: async ctx => { await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.MoveCursorToEndPos()); await ctx.focus(); await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+v" : "Control+v"); await ctx.frame.waitForTimeout(400); return eq(textOf(await ctx.st()), "alpha betaalpha ", "after copy and paste"); },
  },
  {
    id: "edit.paste", win: ["Control+v", "Shift+Insert"], mac: ["Meta+v", "F4"], doc: ["alpha beta"], sel: [0, 0, 6], nativeClipboardOnMac: true,
    pre: async ctx => { await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+c" : "Control+c"); await ctx.frame.waitForTimeout(200); await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.MoveCursorToEndPos()); await ctx.focus(); },
    check: async ctx => eq(textOf(await ctx.st()), "alpha betaalpha ", "after paste"),
  },
  {
    id: "edit.paste-text", win: ["Control+Shift+v"], mac: ["Meta+Shift+v"], doc: [{ text: "alpha", bold: true }, "beta"], sel: [0, 0, 5], nativeClipboardOnMac: true,
    pre: async ctx => { await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+c" : "Control+c"); await ctx.frame.waitForTimeout(200); await caret(ctx.frame, 1, -1); },
    check: async ctx => { await ctx.frame.waitForTimeout(300); const s = await ctx.st(); if (textOf(s, 1) !== "betaalpha") return `para 2: ${textOf(s, 1)}`; await select(ctx.frame, 1, 4, 9); const s2 = await ctx.st(); return s2.text.bold ? "pasted text kept its bold formatting" : true; },
  },
  { id: "edit.select-all", win: ["Control+a"], mac: ["Meta+a"], doc: ["alpha", "beta"], at: [0, 1], check: async ctx => eq((await ctx.st()).selected.replace(/\r?\n/g, "|").replace(/\|$/, ""), "alpha|beta", "selected") },
  {
    id: "edit.undo", win: ["Control+z"], mac: ["Meta+z", "F1"], doc: ["alpha"], at: [0, -1], pre: async ctx => { await ctx.page.keyboard.type("x"); await ctx.frame.waitForTimeout(100); },
    check: async ctx => eq(textOf(await ctx.st()), "alpha", "after undo"),
  },
  {
    id: "edit.redo", win: ["Control+y"], mac: ["Meta+y"], doc: ["alpha"], at: [0, -1],
    pre: async ctx => { await ctx.page.keyboard.type("x"); await ctx.frame.waitForTimeout(100); await ctx.js(() => Asc.editor.Undo()); await ctx.focus(); },
    check: async ctx => eq(textOf(await ctx.st()), "alphax", "after redo"),
  },
  {
    // F4, and Ctrl+Y (Cmd+Y) when there is nothing to redo: the last command is applied again (tests/shortcuts/repeat.mjs: the whole behaviour)
    id: "edit.repeat", win: ["F4", "Control+y"], mac: ["F4", "Meta+y"], doc: ["alpha beta"], sel: [0, 0, 5],
    pre: async ctx => { await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+b" : "Control+b"); await ctx.frame.waitForTimeout(150); await select(ctx.frame, 0, 6, 10); },
    check: async ctx => ((await ctx.st()).text.bold ? true : "the last command (bold) was not repeated on the selection"),
  },
  {
    id: "edit.cancel", win: ["Escape"], mac: ["Escape"], doc: W3, sel: [0, 0, 5],
    pre: async ctx => { await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+k" : "Control+k"); await ctx.frame.waitForTimeout(600); ctx.pre = await visibleWindowText(ctx.frame); },
    check: async ctx => { if (!ctx.pre) return "precondition: Ctrl+K opened no dialog"; const t = await visibleWindowText(ctx.frame); return t ? `dialog still open: ${t}` : true; },
  },
  caretCase("edit.delete-word-left", ["Control+Backspace"], ["Alt+Backspace"], ["alpha beta"], [0, -1], ["alpha #"]),
  caretCase("edit.delete-word-right", ["Control+Delete"], ["Alt+Delete"], ["alpha beta"], [0, 0], ["#beta"]),
  {
    id: "edit.copy-format", win: ["Control+Alt+c"], mac: ["Meta+Alt+c"], doc: [{ text: "alpha", bold: true }, "beta"], sel: [0, 0, 5],
    check: async ctx => { await select(ctx.frame, 1, 0, 4); await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+Alt+v" : "Control+Alt+v"); await ctx.frame.waitForTimeout(200); await select(ctx.frame, 1, 0, 4); return (await ctx.st()).text.bold ? true : "formatting not copied to beta"; },
  },
  {
    id: "edit.paste-format", win: ["Control+Alt+v"], mac: ["Meta+Alt+v"], doc: [{ text: "alpha", bold: true }, "beta"], sel: [0, 0, 5],
    pre: async ctx => { await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.CopyFormatting ? Asc.editor.WordControl.m_oLogicDocument.CopyFormatting() : Asc.editor.SetPaintFormat(1)); await select(ctx.frame, 1, 0, 4); },
    check: async ctx => { await select(ctx.frame, 1, 0, 4); return (await ctx.st()).text.bold ? true : "formatting not pasted"; },
  },
  { id: "edit.hyperlink", win: ["Control+k"], mac: ["Meta+k"], doc: W3, sel: [0, 0, 5], check: windowCase(/link/i) },
  { id: "edit.replace", win: ["Control+h"], mac: ["Control+h"], doc: W3, check: async ctx => ((await isVisible(ctx.frame, "#search-adv-replace-text")) ? true : "replace box not visible") },

  // formatting
  textPrCase("fmt.bold", ["Control+b"], ["Meta+b"], "bold"),
  textPrCase("fmt.italic", ["Control+i"], ["Meta+i"], "italic"),
  textPrCase("fmt.underline", ["Control+u"], ["Meta+u"], "underline"),
  textPrCase("fmt.strikethrough", [], ["Meta+Shift+x"], "strike"),
  { id: "fmt.font-dialog", win: ["Control+d", "Control+Shift+f"], mac: ["Meta+d"], doc: W3, sel: [0, 0, 5], check: async ctx => ((await isVisible(ctx.frame, ".asc-window #id-adv-paragraph-font, .asc-window[id*=font]")) ? true : windowCase(/^font/i)(ctx)) },
  textPrCase("fmt.grow", ["Control+Shift+Period"], ["Meta+Shift+Period"], "size", 14, { doc: [{ text: "alpha beta", size: 12 }] }),
  textPrCase("fmt.shrink", ["Control+Shift+Comma"], ["Meta+Shift+Comma"], "size", 11, { doc: [{ text: "alpha beta", size: 12 }] }),
  textPrCase("fmt.grow-1pt", ["Control+BracketRight"], ["Meta+BracketRight"], "size", 13, { doc: [{ text: "alpha beta", size: 12 }] }),
  textPrCase("fmt.shrink-1pt", ["Control+BracketLeft"], ["Meta+BracketLeft"], "size", 11, { doc: [{ text: "alpha beta", size: 12 }] }),
  {
    id: "fmt.change-case", win: [["Shift+F3", "Shift+F3", "Shift+F3"]], mac: [["Shift+F3", "Shift+F3", "Shift+F3"]], doc: ["alpha beta"], sel: [0, 0, 10],
    check: async ctx => {
      // three presses from lower case: UPPER, Title, lower (Word's cycle)
      const seen = [];
      await setTextAndSelect(ctx, "alpha beta");
      for (let i = 0; i < 3; i++) { await ctx.page.keyboard.press("Shift+F3"); await ctx.frame.waitForTimeout(150); seen.push(textOf(await ctx.st())); }
      return eq(seen, ["ALPHA BETA", "Alpha Beta", "alpha beta"], "cycle");
    },
  },
  textPrCase("fmt.all-caps", ["Control+Shift+a"], ["Meta+Shift+a"], "caps"),
  textPrCase("fmt.small-caps", ["Control+Shift+k"], ["Meta+Shift+k"], "smallCaps"),
  textPrCase("fmt.subscript", ["Control+Shift+Minus"], ["Meta+Shift+Minus"], "vertAlign", ctx => C(ctx, "AscCommon.vertalign_SubScript")),
  textPrCase("fmt.superscript", ["Control+Shift+Equal"], ["Meta+Shift+Equal"], "vertAlign", ctx => C(ctx, "AscCommon.vertalign_SuperScript")),
  textPrCase("fmt.reset-char", ["Control+Space"], ["Control+Space"], "bold", false, { doc: [{ text: "alpha beta", bold: true }] }),
  textPrCase("fmt.symbol-font", ["Control+Shift+q"], [], "font", "Symbol"),
  { id: "fmt.bullets", win: ["Control+Shift+l"], mac: ["Meta+Shift+l"], doc: ["alpha"], at: [0, 0], check: async ctx => ((await ctx.st()).para.numbered ? true : "no list") },
  { id: "style.list", win: [], mac: ["Meta+Shift+l"], doc: ["alpha"], at: [0, 0], check: async ctx => ((await ctx.st()).para.numbered ? true : "no list") },
  { id: "fmt.show-all", win: ["Control+Shift+8"], mac: ["Meta+8"], doc: W3, check: async ctx => ((await ctx.st()).showParaMarks ? true : "nonprinting characters not shown"), after: async ctx => ctx.js(() => Asc.editor.put_ShowParaMarks(false)) },

  // paragraph
  alignCase("para.center", ["Control+e"], ["Meta+e"], "align_Center", "align_Left"),
  alignCase("para.justify", ["Control+j"], ["Meta+j"], "align_Justify", "align_Left"),
  alignCase("para.left", ["Control+l"], ["Meta+l"], "align_Left", "align_Center"),
  alignCase("para.right", ["Control+r"], ["Meta+r"], "align_Right", "align_Left"),
  { id: "para.indent", win: ["Control+m"], mac: ["Control+Shift+m"], doc: ["alpha"], at: [0, 1], check: async ctx => { const s = await ctx.st(); return s.para.left >= 12 ? true : `left indent ${s.para.left} mm`; } },
  {
    id: "para.unindent", win: ["Control+Shift+m"], mac: ["Meta+Shift+m"], doc: ["alpha"], at: [0, 1],
    // three default tab stops, then one tab stop less
    pre: async ctx => { ctx.tab = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].Set_Ind({ Left: 3 * AscCommonWord.Default_Tab_Stop }); d.Recalculate(); return AscCommonWord.Default_Tab_Stop; }); },
    check: async ctx => { const s = await ctx.st(); return Math.abs(s.para.left - 2 * ctx.tab) < 0.1 ? true : `left indent ${s.para.left} mm, expected ${2 * ctx.tab}`; },
  },
  { id: "para.hanging", win: ["Control+t", "Control+Alt+Shift+t"], mac: ["Meta+t", "Meta+Alt+Shift+t"], doc: ["alpha"], at: [0, 1], check: async ctx => { const s = await ctx.st(); return s.para.firstLine < 0 && s.para.left > 0 ? true : `left ${s.para.left}, first line ${s.para.firstLine}`; } },
  {
    id: "para.unhanging", win: ["Control+Shift+t"], mac: ["Meta+Shift+t"], doc: ["alpha"], at: [0, 1],
    pre: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].Set_Ind({ Left: 12.7, FirstLine: -12.7 }); d.Recalculate(); }); },
    check: async ctx => { const s = await ctx.st(); return s.para.firstLine === 0 || s.para.left < 12.7 ? true : `left ${s.para.left}, first line ${s.para.firstLine}`; },
  },
  {
    id: "para.reset", win: ["Control+q"], mac: [], doc: ["alpha"], at: [0, 1],
    pre: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].Set_Align(AscCommon.align_Center); d.Content[0].Set_Ind({ Left: 20 }); d.Recalculate(); }); },
    check: async ctx => { const s = await ctx.st(); return s.para.jc === (await C(ctx, "AscCommon.align_Left")) && !s.para.left ? true : `jc ${s.para.jc}, left ${s.para.left}`; },
  },
  ...[["para.spacing-1", "1", 1], ["para.spacing-2", "2", 2], ["para.spacing-1.5", "5", 1.5]].map(([id, d, v]) => ({
    id, win: ["Control+" + d], mac: ["Meta+" + d], doc: ["alpha"], at: [0, 1],
    pre: async ctx => { if (v === 1) await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].Set_Spacing({ Line: 2, LineRule: Asc.linerule_Auto }); d.Recalculate(); }); },
    check: async ctx => { const s = await ctx.st(); return s.para.line === v ? true : `line spacing ${s.para.line}`; },
  })),
  { id: "para.rtl", win: [], mac: ["Control+Meta+ArrowLeft"], doc: ["alpha"], at: [0, 1], check: async ctx => ((await ctx.st()).para.bidi ? true : "paragraph is not right-to-left") },
  {
    id: "para.ltr", win: [], mac: ["Control+Meta+ArrowRight"], doc: ["alpha"], at: [0, 1],
    pre: async ctx => ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Content[0].SetParagraphBidi ? d.Content[0].SetParagraphBidi(true) : d.Content[0].Set_Bidi(true); d.Recalculate(); }),
    check: async ctx => ((await ctx.st()).para.bidi ? "paragraph is still right-to-left" : true),
  },

  // styles
  { id: "style.normal", win: ["Control+Shift+n", "Control+Alt+Shift+n"], mac: ["Meta+Shift+n", "Meta+Alt+Shift+n"], doc: [{ text: "alpha", style: "Heading 1" }], at: [0, 1], check: async ctx => eq((await ctx.st()).para.style, "Normal", "style") },
  { id: "style.body-text", win: ["Control+Shift+n", "Control+Alt+Shift+n"], mac: ["Meta+Shift+n", "Meta+Alt+Shift+n"], doc: [{ text: "alpha", style: "Heading 2" }], at: [0, 1], check: async ctx => eq((await ctx.st()).para.style, "Normal", "style") },
  ...[1, 2, 3].map(n => ({ id: "style.heading" + n, win: ["Control+Alt+" + n], mac: ["Meta+Alt+" + n], doc: ["alpha"], at: [0, 1], check: async ctx => eq((await ctx.st()).para.style, "Heading " + n, "style") })),
  { id: "style.promote", win: ["Alt+Shift+ArrowLeft"], mac: ["Control+Shift+ArrowLeft"], doc: [{ text: "alpha", style: "Heading 2" }], at: [0, 1], check: async ctx => eq((await ctx.st()).para.style, "Heading 1", "style") },
  { id: "style.demote", win: ["Alt+Shift+ArrowRight"], mac: ["Control+Shift+ArrowRight"], doc: [{ text: "alpha", style: "Heading 1" }], at: [0, 1], check: async ctx => eq((await ctx.st()).para.style, "Heading 2", "style") },

  {
    id: "style.apply-pane", win: ["Control+Shift+s"], mac: [], doc: W3, at: [0, 1],
    check: windowCase(/apply styles/i),
    after: async ctx => ctx.page.keyboard.press("Escape"),
  },
  {
    id: "style.pane", win: ["Control+Alt+Shift+s"], mac: ["Meta+Alt+Shift+s"], doc: W3, at: [0, 1],
    check: async ctx => ((await ctx.js(() => { const c = DE.getController("WordFormatting"); return !!(c && c.stylesPane && c.stylesPane.isVisible()); })) ? true : "Styles pane not open"),
    after: async ctx => ctx.js(() => { const c = DE.getController("WordFormatting"); c && c.stylesPane && c.stylesPane.isVisible() && c.toggleStylesPane(false); }),
  },

  // navigation
  caretCase("nav.word-left", ["Control+ArrowLeft"], ["Alt+ArrowLeft"], W3, [0, 11], ["alpha #beta gamma"]),
  caretCase("nav.word-right", ["Control+ArrowRight"], ["Alt+ArrowRight"], W3, [0, 0], ["alpha #beta gamma"]),
  caretCase("nav.paragraph-up", ["Control+ArrowUp"], ["Meta+ArrowUp"], ["one", "two three", "four"], [1, 4], ["one", "#two three", "four"]),
  caretCase("nav.paragraph-down", ["Control+ArrowDown"], ["Meta+ArrowDown"], ["one", "two three", "four"], [0, 1], ["one", "#two three", "four"]),
  caretCase("nav.line-end", ["End"], ["Meta+ArrowRight", "End"], W3, [0, 2], ["alpha beta gamma#"]),
  caretCase("nav.line-start", ["Home"], ["Meta+ArrowLeft", "Home"], W3, [0, 8], ["#alpha beta gamma"]),
  ...[["nav.screen-top", "Control+Alt+PageUp", -1], ["nav.screen-bottom", "Control+Alt+PageDown", 1]].map(([id, k, dir]) => ({
    id, win: [k], mac: [], doc: LONG, at: [40, 2],
    // the caret is brought into view at an edge: scroll it to the middle of the screen first
    pre: async ctx => { await ctx.js(() => { const w = Asc.editor.WordControl; w.m_oLogicDocument.Document_UpdateSelectionState(); }); await ctx.frame.waitForTimeout(200); await ctx.js(() => Asc.editor.WordControl.m_oScrollVerApi.scrollByY(300)); await ctx.frame.waitForTimeout(300); ctx.y0 = await scrollY(ctx); },
    check: async ctx => {
      const y1 = await scrollY(ctx);
      const p = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.CurPos.ContentPos);
      if (Math.abs(y1 - ctx.y0) > 2) return `the view scrolled (${ctx.y0} -> ${y1})`;
      return (dir < 0 ? p < 40 : p > 40) ? true : `caret in paragraph ${p}`;
    },
  })),
  ...[["nav.page-down", "PageDown", 1], ["nav.page-up", "PageUp", -1]].map(([id, k, dir]) => ({
    id, win: [k], mac: [k], doc: LONG, at: [dir > 0 ? 2 : 60, 0],
    check: async ctx => { const p = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.CurPos.ContentPos); return (dir > 0 ? p > 10 : p < 50) ? true : `caret in paragraph ${p}`; },
  })),
  caretCase("nav.next-page", ["Control+PageDown"], ["Meta+PageDown"], ["one", { text: "two", pageBreak: true }, "three"], [0, 1], ["one", "two", "#three"].map((t, i) => t), {
    check: async ctx => { const m = await marked(ctx); return m[2] === "#three" || (m[1] && m[1].startsWith("two") && m[1].endsWith("#")) ? true : `text: ${JSON.stringify(m)}`; },
  }),
  caretCase("nav.previous-page", ["Control+PageUp"], ["Meta+PageUp"], ["one", { text: "two", pageBreak: true }, "three four"], [2, 4], ["#one", "two", "three four"]),
  caretCase("nav.document-end", ["Control+End"], ["Meta+End"], ["one", "two"], [0, 1], ["one", "two#"]),
  caretCase("nav.document-start", ["Control+Home"], ["Meta+Home"], ["one", "two"], [1, 2], ["#one", "two"]),
  {
    id: "nav.floating-shapes", win: [["Control+Alt+5"]], mac: [], doc: ["alpha", "beta"], at: [1, 2],
    pre: async ctx => { await addFloatingShape(ctx); },
    check: async ctx => ((await ctx.st()).drawingSelected ? true : "no floating shape selected"),
  },
  {
    id: "nav.floating-shapes.exit", win: ["Escape"], mac: ["Escape"], doc: ["alpha", "beta"], at: [1, 2],
    pre: async ctx => { await addFloatingShape(ctx); await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const g = d.DrawingObjects.drawingObjects[0]; d.SelectDrawings([g], d); d.UpdateInterface(); }); await ctx.focus(); },
    check: async ctx => { const s = await ctx.st(); return !s.drawingSelected ? true : "the shape is still selected"; },
  },
  {
    id: "nav.find", win: ["Control+f"], mac: ["Meta+f"], doc: W3,
    // Word: the Navigation pane, on its Results tab, with the search box
    check: async ctx => {
      const r = await ctx.js(() => ({ on: document.body.classList.contains("elx-nav-on"), tab: $(".elx-navtabs [data-tab].active").attr("data-tab") || "" }));
      if (!r.on) return "Navigation pane not open";
      if (r.tab !== "results") return `Navigation pane on ${r.tab || "no"} tab, expected results`;
      return (await isVisible(ctx.frame, "#search-adv-text, #search-bar-text")) ? true : "search box not visible";
    },
  },
  { id: "nav.go-to", win: ["Control+g"], mac: ["Meta+Alt+g", "F5"], doc: W3, check: windowCase(/go to/i) },
  { id: "nav.go-to.f5", win: ["F5"], mac: [], doc: W3, check: windowCase(/go to/i) },
  {
    id: "nav.repeat-find", win: ["Shift+F4"], mac: ["Shift+F4", "Meta+Shift+F4"], doc: ["one x two x three x"], at: [0, 0],
    pre: async ctx => { await ctx.js(() => { const o = new AscCommon.CSearchSettings(); o.put_Text("x"); o.put_MatchCase(false); Asc.editor.asc_findText(o, true); }); await ctx.frame.waitForTimeout(300); await ctx.focus(); ctx.p0 = await selStart(ctx); },
    check: async ctx => { const s = await ctx.st(); const p1 = await selStart(ctx); if (s.selected !== "x") return `selected ${JSON.stringify(s.selected)}`; return p1 > ctx.p0 ? true : `selection did not move (${ctx.p0} -> ${p1})`; },
  },
  { id: "nav.web-refresh", same: "field.update" },

  // selection
  selCase("sel.char", [["Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight"]], [["Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight"]], W3, [0, 0], "alp"),
  selCase("sel.word-left", ["Control+Shift+ArrowLeft"], ["Shift+Alt+ArrowLeft"], ["alpha beta"], [0, -1], "beta"),
  selCase("sel.word-right", ["Control+Shift+ArrowRight"], ["Shift+Alt+ArrowRight"], ["alpha beta"], [0, 0], "alpha "),
  selCase("sel.line-start", ["Shift+Home"], ["Meta+Shift+ArrowLeft", "Shift+Home"], ["alpha beta"], [0, 5], "alpha"),
  selCase("sel.line-end", ["Shift+End"], ["Meta+Shift+ArrowRight", "Shift+End"], ["alpha beta"], [0, 5], " beta"),
  selCase("sel.paragraph-start", ["Control+Shift+ArrowUp"], ["Meta+Shift+ArrowUp"], ["alpha beta", "gamma"], [0, 5], "alpha"),
  { id: "sel.paragraph-end", win: ["Control+Shift+ArrowDown"], mac: ["Meta+Shift+ArrowDown"], doc: ["alpha beta", "gamma"], at: [0, 6], check: async ctx => { const t = (await ctx.st()).selected; return /^beta\r?\n?$/.test(t) ? true : `selected ${JSON.stringify(t)}`; } },
  ...[["sel.screen-down", "Shift+PageDown", 2], ["sel.screen-up", "Shift+PageUp", 60]].map(([id, k, p]) => ({
    id, win: [k], mac: [k], doc: LONG, at: [p, 0],
    check: async ctx => { const t = (await ctx.st()).selected; return t.split(/\r?\n/).length > 5 ? true : `selected ${JSON.stringify(t.slice(0, 60))}`; },
  })),
  { id: "sel.document-start", win: ["Control+Shift+Home"], mac: ["Meta+Shift+Home"], doc: ["one", "two"], at: [1, 2], check: async ctx => eq((await ctx.st()).selected.replace(/\r?\n/g, "|"), "one|tw", "selected") },
  { id: "sel.document-end", win: ["Control+Shift+End"], mac: ["Meta+Shift+End"], doc: ["one", "two"], at: [0, 1], check: async ctx => { const t = (await ctx.st()).selected.replace(/\r?\n/g, "|"); return /^ne\|two\|?$/.test(t) ? true : `selected ${JSON.stringify(t)}`; } },
  {
    id: "sel.window-bottom", win: ["Control+Alt+Shift+PageDown"], mac: ["Meta+Shift+Alt+PageDown"], doc: LONG, at: [3, 0],
    pre: async ctx => { await ctx.frame.waitForTimeout(200); ctx.y0 = await scrollY(ctx); },
    check: async ctx => { const t = (await ctx.st()).selected; const y1 = await scrollY(ctx); if (Math.abs(y1 - ctx.y0) > 2) return "the view scrolled"; return t.split(/\r?\n/).length > 5 ? true : `selected ${JSON.stringify(t.slice(0, 60))}`; },
  },
  selCase("sel.extend", [["F8", "ArrowRight", "ArrowRight"]], [["F8", "ArrowRight", "ArrowRight"]], W3, [0, 0], "al"),
  selCase("sel.extend.char", [["F8", "ArrowLeft"]], [["F8", "ArrowLeft"]], W3, [0, 3], "p"),
  { id: "sel.extend.grow", win: [["F8", "F8"]], mac: [["F8", "F8"]], doc: ["One two three. Four five six.", "Next"], at: [0, 5],
    check: async ctx => { const steps = []; steps.push((await ctx.st()).selected); for (const want of ["sentence", "paragraph"]) { await ctx.page.keyboard.press("F8"); await ctx.frame.waitForTimeout(100); steps.push((await ctx.st()).selected); } return eq(steps.map(s => s.replace(/\r?\n/g, "¶")), ["two ", "One two three. ", "One two three. Four five six.¶"], "F8 F8, then F8, then F8"); } },
  { id: "sel.extend.shrink", win: [["F8", "F8", "F8", "F8", "Shift+F8"]], mac: [["F8", "F8", "F8", "F8", "Shift+F8"]], doc: ["One two three. Four five six.", "Next"], at: [0, 5], check: async ctx => eq((await ctx.st()).selected, "One two three. ", "selected") },
  { id: "sel.extend.stop", win: [["F8", "Escape", "ArrowRight", "ArrowRight"]], mac: [["F8", "Escape", "ArrowRight", "ArrowRight"]], doc: W3, at: [0, 0], check: async ctx => eq((await ctx.st()).selected, "", "selected") },

  // tables
  ...[
    ["table.next-cell", ["Tab"], ["Tab"], [0, 0], [0, 1]],
    ["table.previous-cell", ["Shift+Tab"], ["Shift+Tab"], [0, 1], [0, 0]],
    ["table.row-first", ["Alt+Home"], ["Control+Home"], [1, 2], [1, 0]],
    ["table.row-last", ["Alt+End"], ["Control+End"], [1, 0], [1, 2]],
    ["table.column-first", ["Alt+PageUp"], ["Control+PageUp"], [2, 1], [0, 1]],
    ["table.column-last", ["Alt+PageDown"], ["Control+PageDown"], [0, 1], [2, 1]],
    ["table.previous-row", ["ArrowUp"], ["ArrowUp"], [1, 1], [0, 1]],
    ["table.next-row", ["ArrowDown"], ["ArrowDown"], [1, 1], [2, 1]],
  ].map(([id, win, mac, from, to]) => ({
    id, win, mac, doc: TABLE, pre: async ctx => inTableAt(ctx, ...from),
    check: async ctx => { await ctx.page.keyboard.type("#"); await ctx.frame.waitForTimeout(80); const c = await tableCell(ctx, ...to); return c && c.includes("#") ? true : `cell ${to} is ${JSON.stringify(c)}; table ${JSON.stringify((await ctx.st()).paras[1].table)}`; },
  })),
  ...[["table.move-row-up", "Alt+Shift+ArrowUp", [["a2", "b2", "c2"], ["a1", "b1", "c1"], ["a3", "b3", "c3"]]], ["table.move-row-down", "Alt+Shift+ArrowDown", [["a1", "b1", "c1"], ["a3", "b3", "c3"], ["a2", "b2", "c2"]]]].map(([id, k, want]) => ({
    id, win: [k], mac: [], doc: TABLE, pre: async ctx => inTableAt(ctx, 1, 0),
    check: async ctx => eq((await ctx.st()).paras[1].table, want, "rows"),
  })),
  { id: "table.add-row", win: ["Tab"], mac: ["Tab"], doc: TABLE, pre: async ctx => inTableAt(ctx, 2, 2), check: async ctx => eq((await ctx.st()).paras[1].table.length, 4, "rows") },
  { id: "table.insert-row", win: [], mac: ["Meta+Control+i"], doc: TABLE, pre: async ctx => inTableAt(ctx, 1, 0), check: async ctx => { const t = (await ctx.st()).paras[1].table; return t.length === 4 && t[1][0] === "" && t[2][0] === "a2" ? true : `table ${JSON.stringify(t)}`; } },
  { id: "table.select-extend", win: [["Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight"]], mac: [["Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight"]], doc: TABLE, pre: async ctx => inTableAt(ctx, 0, 0), check: async ctx => { const t = (await ctx.st()).selected; return /a1/.test(t) && /b1/.test(t) ? true : `selected ${JSON.stringify(t)}`; } },
  { id: "table.select-column", win: ["Shift+PageDown"], mac: ["Shift+PageDown"], doc: TABLE, pre: async ctx => inTableAt(ctx, 0, 1), check: async ctx => { const t = (await ctx.st()).selected; return /b1/.test(t) && /b2/.test(t) && /b3/.test(t) && !/a2|c2/.test(t) ? true : `selected ${JSON.stringify(t)}`; } },
  { id: "table.select-row", win: ["Alt+Shift+End"], mac: ["Alt+Shift+End"], doc: TABLE, pre: async ctx => inTableAt(ctx, 1, 0), check: async ctx => { const t = (await ctx.st()).selected; return /a2/.test(t) && /b2/.test(t) && /c2/.test(t) && !/a1|a3/.test(t) ? true : `selected ${JSON.stringify(t)}`; } },
  { id: "table.select-table", win: [[{ cdp: { key: "Clear", code: "Numpad5", keyCode: 12, modifiers: 1 } }]], mac: [], doc: TABLE, pre: async ctx => inTableAt(ctx, 1, 1), check: async ctx => { const t = (await ctx.st()).selected; return ["a1", "c1", "b2", "a3", "c3"].every(x => t.includes(x)) && !t.includes("before") ? true : `selected ${JSON.stringify(t)}`; } },
  {
    id: "table.new-paragraph", win: ["Enter"], mac: ["Enter"], doc: TABLE, pre: async ctx => { await inTableAt(ctx, 0, 0); await ctx.page.keyboard.press("End"); },
    check: async ctx => { const n = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.Content.find(e => e.IsTable && e.IsTable()); return t.GetRow(0).GetCell(0).GetContent().GetElementsCount(); }); return n === 2 ? true : `${n} paragraph(s) in the cell`; },
  },
  {
    id: "table.tab-char", win: ["Control+Tab", "Control+Alt+Shift+Tab"], mac: ["Alt+Tab"], doc: TABLE, pre: async ctx => inTableAt(ctx, 0, 0),
    check: async ctx => { const n = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const t = d.Content.find(e => e.IsTable && e.IsTable()); let tabs = 0; t.GetRow(0).GetCell(0).GetContent().GetElement(0).CheckRunContent(run => { for (const it of run.Content) if (it instanceof AscWord.CRunTab) tabs++; }); return tabs; }); return n === 1 ? true : `${n} tab character(s) in cell a1`; },
  },

  // review
  { id: "review.comment", win: ["Control+Alt+m"], mac: ["Meta+Alt+a"], doc: W3, sel: [0, 0, 5], check: async ctx => ((await isVisible(ctx.frame, "#id-comments-popover textarea, #id-comments-popover .user-comment-item")) ? true : "no comment box") },
  { id: "review.track-changes", win: ["Control+Shift+e"], mac: ["Meta+Shift+e"], doc: W3, check: async ctx => ((await ctx.st()).track ? true : "track changes still off") },
  {
    id: "review.close-pane", win: ["Alt+Shift+c"], mac: [], doc: W3,
    pre: async ctx => { await ctx.js(() => { const lm = DE.getController("LeftMenu"); lm.leftMenu.btnComments.toggle(true); }); await ctx.frame.waitForTimeout(300); await ctx.focus(); },
    check: async ctx => ((await isVisible(ctx.frame, "#left-panel-comments")) ? "comments pane still open" : true),
  },
  {
    // no Editor pane: F7 selects the next misspelling and opens its suggestions (the context menu)
    id: "review.spelling", win: ["F7"], mac: ["Meta+Alt+l", "F7"], doc: ["alpha bta gamma"], at: [0, 0], pre: async ctx => { await ctx.frame.waitForTimeout(1500); },
    check: async ctx => { const s = await ctx.st(); if (s.selected !== "bta") return `selected ${JSON.stringify(s.selected)}`; return (await ctx.js(() => $(".dropdown-menu:visible").filter(function () { return $(this).closest("#toolbar").length === 0; }).length)) > 0 ? true : "no suggestions menu"; },
  },
  {
    id: "review.next-error", win: ["Alt+F7"], mac: ["Alt+F7"], doc: ["alpha bta gamma"], at: [0, 0],
    pre: async ctx => { await ctx.frame.waitForTimeout(1500); },
    check: async ctx => eq((await ctx.st()).selected, "bta", "selected"),
  },

  // references
  { id: "ref.footnote", win: ["Control+Alt+f"], mac: ["Meta+Alt+f"], doc: W3, at: [0, 5], check: async ctx => { const n = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetFootnotesList(null, null).length); return n === 1 ? true : `${n} footnote(s)`; } },
  { id: "ref.endnote", win: ["Control+Alt+d"], mac: ["Meta+Alt+e"], doc: W3, at: [0, 5], check: async ctx => { const n = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetEndnotesList(null, null).length); return n === 1 ? true : `${n} endnote(s)`; } },
  ...[["ref.next-footnote", "Alt+Shift+Period", 0, 1], ["ref.previous-footnote", "Alt+Shift+Comma", -1, -1]].map(([id, k, from, dir]) => ({
    id, win: [k], mac: [], doc: ["one two three four five"], at: [0, 0],
    pre: async ctx => {
      await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = d.Content[0]; p.MoveCursorToStartPos(); for (let i = 0; i < 3; i++) p.MoveCursorRight(false, false); d.AddFootnote(); d.EndHdrFtrEditing && 0; });
      await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToStartPos(false); d.CurPos.ContentPos = 0; const p = d.Content[0]; p.MoveCursorToStartPos(); for (let i = 0; i < 12; i++) p.MoveCursorRight(false, false); d.AddFootnote(); });
      await ctx.js(([from]) => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.SetDocPosType(0); d.CurPos.ContentPos = 0; const p = d.Content[0]; if (from === -1) p.MoveCursorToEndPos(); else p.MoveCursorToStartPos(); d.Document_UpdateSelectionState(); }, [from]);
      await ctx.focus();
      ctx.pos0 = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return { t: d.GetDocPosType(), s: JSON.stringify(d.GetContentPosition().map(x => x.Position)) }; });
    },
    check: async ctx => { const p = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return { t: d.GetDocPosType(), s: JSON.stringify(d.GetContentPosition().map(x => x.Position)) }; }); return p.s !== ctx.pos0.s || p.t !== ctx.pos0.t ? true : "the caret did not move to a footnote"; },
  })),
  { id: "ref.bookmark", win: ["Control+Shift+F5"], mac: ["Meta+Shift+F5"], doc: W3, check: windowCase(/bookmark/i) },

  // fields
  { id: "field.date", win: ["Alt+Shift+d"], mac: ["Control+Shift+d"], doc: ["Date: "], at: [0, -1], check: async ctx => { const t = textOf(await ctx.st()); const n = await fieldsCount(ctx); return /\d/.test(t) && n === 1 ? true : `text ${JSON.stringify(t)}, ${n} field(s)`; } },
  { id: "field.time", win: ["Alt+Shift+t"], mac: ["Control+Shift+t"], doc: ["Time: "], at: [0, -1], check: async ctx => { const t = textOf(await ctx.st()); const n = await fieldsCount(ctx); return /\d{1,2}:\d{2}/.test(t) && n === 1 ? true : `text ${JSON.stringify(t)}, ${n} field(s)`; } },
  { id: "field.page", win: ["Alt+Shift+p"], mac: ["Control+Shift+p"], doc: ["Page "], at: [0, -1], check: async ctx => { const t = textOf(await ctx.st()); return /Page 1/.test(t) ? true : `text ${JSON.stringify(t)}`; } },
  {
    id: "field.update", win: ["F9"], mac: ["F9"], doc: ["x"], at: [0, -1],
    pre: async ctx => { await addStaleField(ctx); await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.SelectAll()); await ctx.focus(); },
    check: async ctx => { const t = textOf(await ctx.st()); return t.includes(String(new Date().getFullYear())) ? true : `text ${JSON.stringify(t)}`; },
  },
  {
    id: "field.unlink", win: ["Control+Shift+F9"], mac: ["Meta+Shift+F9"], doc: ["x"], at: [0, -1],
    pre: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.AddFieldWithInstruction("PAGE"); d.SelectAll(); }); await ctx.focus(); },
    check: async ctx => { const n = await fieldsCount(ctx); const t = textOf(await ctx.st()); return n === 0 && t === "x1" ? true : `${n} field(s), text ${JSON.stringify(t)}`; },
  },
  ...[["field.next", "F11", 1], ["field.next.alt-f1", "Alt+F1", 1], ["field.previous", "Shift+F11", -1], ["field.previous.alt-shift-f1", "Alt+Shift+F1", -1]].map(([id, k, dir]) => ({
    id, win: [k], mac: [], doc: ["a "], at: [0, -1],
    pre: async ctx => { await ctx.js(([dir]) => { const d = Asc.editor.WordControl.m_oLogicDocument; d.AddFieldWithInstruction("PAGE"); d.MoveCursorToEndPos(false); d.AddToParagraph(new AscWord.CRunText(32)); d.AddFieldWithInstruction("NUMPAGES"); d.MoveCursorToEndPos(false); d.AddToParagraph(new AscWord.CRunText(32)); d.Recalculate(); d.RemoveSelection(); if (dir > 0) d.MoveCursorToStartPos(false); else d.MoveCursorToEndPos(false); d.Document_UpdateSelectionState(); }, [dir]); await ctx.focus(); },
    // Word selects the whole field
    check: async ctx => { const f = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const fs = d.IsSelectionUse() ? d.GetAllFields(true) : []; return fs.length === 1 ? fs[0].GetInstruction().GetType() : "selection " + JSON.stringify(d.GetSelectedText()) + ", " + fs.length + " field(s)"; }); const want = dir > 0 ? await C(ctx, "AscWord.fieldtype_PAGE") : await C(ctx, "AscWord.fieldtype_NUMPAGES"); return f === want ? true : `selected field ${f}, expected ${want}`; },
  })),

  {
    id: "field.toggle-code", win: ["Shift+F9"], mac: ["Shift+F9"], doc: ["x"], at: [0, -1],
    pre: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.AddFieldWithInstruction("PAGE"); d.GetAllFields(false)[0].SelectField(); d.Document_UpdateSelectionState(); }); await ctx.focus(); },
    check: async ctx => ((await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllFields(false)[0].IsShowFieldCode())) ? true : "field code not shown"),
  },
  {
    id: "field.toggle-all-codes", win: ["Alt+F9"], mac: ["Alt+F9"], doc: ["x"], at: [0, -1],
    pre: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.AddFieldWithInstruction("PAGE"); d.MoveCursorToEndPos(false); d.AddToParagraph(new AscWord.CRunText(32)); d.AddFieldWithInstruction("NUMPAGES"); d.MoveCursorToStartPos(false); d.Document_UpdateSelectionState(); }); await ctx.focus(); },
    check: async ctx => { const st = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllFields(false).map(f => f.IsShowFieldCode())); return st.length === 2 && st.every(Boolean) ? true : `codes shown: ${JSON.stringify(st)}`; },
  },

  // special characters
  { id: "char.line-break", win: ["Shift+Enter"], mac: ["Shift+Enter"], doc: ["alpha beta"], at: [0, 5], check: async ctx => { const s = await ctx.st(); if (s.paras.length !== 1) return `${s.paras.length} paragraphs`; return (await hasBreak(ctx, 0, "line")) ? true : "no line break"; } },
  { id: "char.page-break", win: ["Control+Enter"], mac: ["Meta+Enter"], doc: ["alpha beta"], at: [0, 5], check: async ctx => { const s = await ctx.st(); return s.pages === 2 ? true : `${s.pages} page(s)`; } },
  { id: "char.column-break", win: ["Control+Shift+Enter"], mac: ["Meta+Shift+Enter"], doc: ["alpha beta"], at: [0, 5], check: async ctx => { const s = await ctx.st(); for (let i = 0; i < s.paras.length; i++) if (await hasBreak(ctx, i, "column")) return true; return "no column break"; } },
  ...[
    ["char.em-dash", ["Control+Alt+NumpadSubtract"], [], "—"],
    ["char.en-dash", ["Control+NumpadSubtract"], [], "–"],
    ["char.optional-hyphen", ["Control+Alt+Minus"], ["Meta+Alt+Minus"], "­"],
    ["char.nonbreaking-hyphen", ["Alt+Shift+Minus"], ["Alt+Shift+Minus"], "‑|\u001e"],
    ["char.nonbreaking-space", ["Control+Shift+Space"], ["Alt+Space"], " "],
    ["char.registered", ["Control+Alt+r"], [], "®"],
    ["char.trademark", ["Control+Alt+t"], [], "™"],
    ["char.ellipsis", ["Control+Alt+Period"], [], "…"],
  ].map(([id, win, mac, ch]) => ({ id, win, mac, doc: ["ab"], at: [0, 1], check: async ctx => {
    const t = textOf(await ctx.st());
    if (id === "char.nonbreaking-hyphen") return (await ctx.js(() => { let n = 0; Asc.editor.WordControl.m_oLogicDocument.Content[0].CheckRunContent(run => { for (const it of run.Content) if (it.IsNoBreakHyphen && it.IsNoBreakHyphen()) n++; }); return n; })) === 1 ? true : `text ${JSON.stringify(t)}, no nonbreaking hyphen`;
    return new RegExp("^a(" + ch + ")b$").test(t) ? true : `text ${JSON.stringify(t)}`;
  } })),
  { id: "char.copyright", win: [[{ text: "(c) " }]], mac: [[{ text: "(c) " }]], doc: ["x"], at: [0, -1], check: async ctx => { const t = textOf(await ctx.st()); return t.includes("©") ? true : `text ${JSON.stringify(t)}`; } },
  { id: "char.unicode", win: [[{ text: "00e9" }, "Alt+x"]], mac: [[{ text: "00e9" }, "Meta+Alt+x"]], doc: ["x"], at: [0, -1], check: async ctx => eq(textOf(await ctx.st()), "xé", "text") },

  // international (Windows key names on a US layout)
  intl("intl.grave", "Control+Backquote", "e", "è"),
  intl("intl.acute", "Control+Quote", "e", "é"),
  intl("intl.circumflex", "Control+Shift+Digit6", "e", "ê"),
  intl("intl.tilde", "Control+Shift+Backquote", "n", "ñ"),
  intl("intl.umlaut", "Control+Shift+Semicolon", "u", "ü"),
  intl("intl.ring", "Control+Shift+Digit2", "a", "å"),
  intl("intl.ae", "Control+Shift+Digit7", "a", "æ"),
  intl("intl.oe", "Control+Shift+Digit7", "o", "œ"),
  intl("intl.cedilla", "Control+Comma", "c", "ç"),
  intl("intl.eth", "Control+Quote", "d", "ð"),
  intl("intl.slash-o", "Control+Slash", "o", "ø"),
  intl("intl.sharp-s", "Control+Shift+Digit7", "s", "ß"),
  { id: "intl.inverted-question", win: ["Control+Alt+Shift+Slash"], mac: [], doc: ["x"], at: [0, -1], check: async ctx => eq(textOf(await ctx.st()), "x¿", "text") },
  { id: "intl.inverted-exclamation", win: ["Control+Alt+Shift+Digit1"], mac: [], doc: ["x"], at: [0, -1], check: async ctx => eq(textOf(await ctx.st()), "x¡", "text") },

  // view
  { id: "view.zoom-in", win: ["Control+Equal", "Control+NumpadAdd"], mac: ["Meta+Equal"], doc: W3, check: async ctx => ((await zoom(ctx)) > 100 ? true : `zoom ${await zoom(ctx)}`) },
  { id: "view.zoom-out", win: ["Control+Minus"], mac: ["Meta+Minus"], doc: W3, check: async ctx => ((await zoom(ctx)) < 100 ? true : `zoom ${await zoom(ctx)}`) },
  { id: "view.zoom-100", win: ["Control+0"], mac: ["Meta+0"], doc: W3, pre: async ctx => { await setZoom(ctx, 150); await ctx.focus(); }, check: async ctx => ((await zoom(ctx)) === 100 ? true : `zoom ${await zoom(ctx)}`) },
  { id: "view.zoom-wheel", win: [[{ wheel: -300, mod: "Control" }]], mac: [[{ wheel: -300, mod: "Meta" }]], doc: W3, check: async ctx => ((await zoom(ctx)) !== 100 ? true : "zoom unchanged") },
  { id: "view.print-layout", win: ["Control+Alt+p"], mac: [], doc: ["ab"], at: [0, 1], check: async ctx => { const t = textOf(await ctx.st()); return t === "ab" ? true : `text ${JSON.stringify(t)}`; } },

  // outline (moving paragraphs)
  { id: "outline.move-up", win: ["Alt+Shift+ArrowUp"], mac: ["Control+Shift+ArrowUp"], doc: ["one", "two", "three"], at: [1, 1], check: async ctx => eq((await ctx.st()).paras.map(p => p.text), ["two", "one", "three"], "paragraphs") },
  { id: "outline.move-down", win: ["Alt+Shift+ArrowDown"], mac: ["Control+Shift+ArrowDown"], doc: ["one", "two", "three"], at: [1, 1], check: async ctx => eq((await ctx.st()).paras.map(p => p.text), ["one", "three", "two"], "paragraphs") },

  // ribbon commands with a direct key
  {
    // Word: Alt, Q (KeyTips) or Alt+Q go to the command search of the title bar
    id: "ribbon.search", win: ["Alt+q", ["Alt", { wait: 300 }, "q"]], mac: ["Control+Alt+q"], doc: W3,
    check: async ctx => ((await ctx.js(() => !!(document.activeElement && document.activeElement.classList.contains("elx-search-input")))) ? true : "focus is not in the title-bar search"),
    after: async ctx => ctx.page.keyboard.press("Escape"),
  },
  {
    id: "ribbon.collapse", win: ["Control+F1"], mac: ["Meta+Alt+r"], doc: W3,
    pre: async ctx => { ctx.c0 = await ctx.js(() => DE.getController("Toolbar").toolbar.isCompact()); },
    check: async ctx => { const c1 = await ctx.js(() => DE.getController("Toolbar").toolbar.isCompact()); return c1 !== ctx.c0 ? true : "ribbon unchanged"; },
    after: async ctx => ctx.js(() => { const c = DE.getController("Toolbar"); c.toolbar.isCompact() && c.onChangeCompactView(null, false); }),
  },
  { id: "ribbon.context-menu", win: ["Shift+F10", "ContextMenu"], mac: ["Shift+F10"], doc: W3, at: [0, 2], check: async ctx => ((await ctx.js(() => $(".dropdown-menu:visible").filter(function () { return $(this).closest("#toolbar").length === 0; }).length)) > 0 ? true : "no context menu") },
  { id: "ribbon.macros", win: ["Alt+F8"], mac: ["Alt+F8"], doc: W3, check: windowCase(/macro/i) },
  { id: "ribbon.vba", win: ["Alt+F11"], mac: ["Alt+F11"], doc: W3, check: windowCase(/macro/i) },
  {
    id: "ribbon.actions-menu", win: ["Alt+Shift+F10"], mac: [], doc: ["alpha beta"], sel: [0, 0, 5],
    pre: async ctx => { await ctx.page.keyboard.press("Control+c"); await ctx.frame.waitForTimeout(150); await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.MoveCursorToEndPos()); await ctx.focus(); await ctx.page.keyboard.press("Control+v"); await ctx.frame.waitForTimeout(600); },
    check: async ctx => ((await ctx.js(() => { const b = DE.getController("DocumentHolder").btnSpecialPaste; return !!(b && b.menu && b.menu.isVisible()); })) ? true : "paste options menu not open"),
  },
];

async function setTextAndSelect(ctx, text) {
  await ctx.js(() => {}, null);
  return select(ctx.frame, 0, 0, text.length);
}

async function selStart(ctx) {
  return ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = d.GetContentPosition(true, true); return JSON.stringify(p.map(x => x.Position)).length * 1000 + p.reduce((a, x) => a * 100 + x.Position, 0); });
}

async function addFloatingShape(ctx) {
  await cmd(ctx.frame, `(function(){ var d = Api.GetDocument(); var p = d.GetElement(0); var s = Api.CreateShape("rect", 914400, 914400, Api.CreateSolidFill(Api.CreateRGBColor(200,80,80)), Api.CreateStroke(0, Api.CreateNoFill())); s.SetWrappingStyle("square"); s.SetHorPosition("page", 3000000); s.SetVerPosition("page", 3000000); p.AddDrawing(s); return 1; })()`);
  await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.CurPos.ContentPos = 1; d.Content[1].MoveCursorToStartPos(); d.Document_UpdateSelectionState(); });
  await ctx.focus();
}

async function addStaleField(ctx) {
  // A DATE field whose displayed result is out of date ("0000")
  await ctx.js(() => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    d.AddFieldWithInstruction('DATE \\@ "yyyy"');
    const f = d.GetAllFields(false)[0];
    if (f && f.SelectFieldValue) { f.SelectFieldValue(); d.AddToParagraph(new AscWord.CRunText(48)); for (let i = 0; i < 3; i++) d.AddToParagraph(new AscWord.CRunText(48)); }
    d.RemoveSelection();
  });
}
