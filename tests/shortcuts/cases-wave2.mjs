// SPDX-License-Identifier: AGPL-3.0-only
// Test cases of the second wave of Word commands (docs/shortcuts-word.csv): block selection
// (word/Editor/word-block-selection.js), window split and Show First Line Only (controller WordViews,
// word/Editor/word-views.js), the Mailings tab keys (controller WordMailings).
// Same case format as cases.mjs; details in tests/views/wave2.mjs.

const LONG = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} ` + "lorem ipsum dolor sit amet ".repeat(8));
const split = ctx => ctx.js(() => !!DE.getController("WordViews")._state.split && $("#elx-split-pane").length === 1);
const closeSplit = ctx => ctx.js(() => DE.getController("WordViews").toggleSplit(false));
const mm = ctx => ctx.js(() => DE.getController("WordMailings").getState());
const RECIPIENTS = [["Name", "City"], ["Ada", "London"], ["Alan", "Manchester"]];
const startMerge = async ctx => {
  await ctx.js(list => Asc.editor.asc_StartMailMergeByList(list), RECIPIENTS);
  for (let i = 0; i < 20 && !(await mm(ctx)).count; i++) await ctx.frame.waitForTimeout(150);
};
const endMerge = async ctx => {
  await ctx.js(() => { try { Asc.editor.asc_EndPreviewMailMergeResult(); } catch (e) {} });
  await ctx.frame.waitForTimeout(200);
};
const withField = async ctx => {
  await startMerge(ctx);
  await ctx.js(() => Asc.editor.asc_AddMailMergeField("Name"));
  await ctx.frame.waitForTimeout(200);
};
const text0 = ctx => ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.Content[0].GetText().replace(/[\r\n]+$/, ""));

export const CASES = [
  {
    id: "sel.extend.block",
    win: [["Control+Shift+F8", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown"]],
    mac: [["Meta+Shift+F8", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown"]],
    doc: ["abcdef ghij", "klmnop qrst"], at: [0, 1],
    check: async ctx => {
      const t = await ctx.js(() => Asc.editor.asc_GetBlockSelectionText());
      await ctx.page.keyboard.press("Escape");
      return JSON.stringify(t) === JSON.stringify(["bcd", "lmn"]) ? true : `block ${JSON.stringify(t)}, expected ["bcd","lmn"]`;
    },
  },
  {
    id: "window.split", win: ["Control+Alt+s"], mac: ["Meta+Alt+s"], doc: LONG,
    check: async ctx => {
      await ctx.frame.waitForTimeout(400);
      const r = await ctx.js(() => ({ pages: $("#elx-split-pane canvas.elx-split-page").length, sdk: $("#editor_sdk").height(), ct: $("#editor-container").height() }));
      return (await split(ctx)) && r.pages > 0 && r.sdk < r.ct * 0.7 ? true : `split ${await split(ctx)} ${JSON.stringify(r)}`;
    },
    after: closeSplit,
  },
  {
    id: "window.unsplit", win: ["Alt+Shift+c"], mac: ["Meta+Alt+s"], doc: LONG,
    pre: async ctx => { await ctx.js(() => DE.getController("WordViews").toggleSplit(true)); await ctx.frame.waitForTimeout(300); },
    check: async ctx => {
      const r = await ctx.js(() => ({ sdk: $("#editor_sdk").height(), ct: $("#editor-container").height() }));
      return !(await split(ctx)) && r.sdk === r.ct ? true : `still split ${JSON.stringify(r)}`;
    },
    after: closeSplit,
  },
  {
    id: "outline.first-line", win: ["Alt+Shift+l"], mac: ["Control+Shift+l"],
    doc: [{ text: "Chapter", style: "Heading 1" }, "Body text long enough to wrap over several lines. ".repeat(6)], at: [1, 0],
    pre: async ctx => { await ctx.js(() => Asc.editor.asc_SetWordView("outline")); await ctx.frame.waitForTimeout(400); },
    check: async ctx => {
      const r = await ctx.js(() => { const p = Asc.editor.WordControl.m_oLogicDocument.Content[1]; return { on: Asc.editor.asc_GetOutlineState().firstLineOnly, h: p.Pages[0].Bounds.Bottom - p.Pages[0].Bounds.Top, lines: p.Lines.length }; });
      return r.on && r.lines > 1 && r.h < 8 ? true : `first line only ${JSON.stringify(r)}`;
    },
    after: async ctx => { await ctx.js(() => { const s = Asc.editor.asc_GetOutlineState(); s.firstLineOnly && Asc.editor.asc_OutlineCommand("firstline"); Asc.editor.asc_SetWordView("print"); }); },
  },
  {
    id: "merge.preview", win: ["Alt+Shift+k"], mac: [], doc: ["Dear "], at: [0, -1],
    pre: withField,
    check: async ctx => {
      const t = await text0(ctx), s = await mm(ctx);
      return s.preview && t === "Dear Ada" ? true : `preview ${s.preview}, text ${JSON.stringify(t)}`;
    },
    after: endMerge,
  },
  {
    id: "merge.field", win: [["Alt+Shift+f", { wait: 300 }, "Enter"]], mac: [], doc: ["Dear "], at: [0, -1],
    pre: startMerge,
    check: async ctx => {
      const t = await text0(ctx);
      return t === "Dear «Name»" ? true : `text ${JSON.stringify(t)}`;
    },
    after: endMerge,
  },
  {
    id: "merge.merge", win: ["Alt+Shift+n"], mac: [], doc: ["Dear "], at: [0, -1],
    pre: async ctx => { await withField(ctx); ctx.dl = ctx.page.waitForEvent("download", { timeout: 60000 }).catch(() => null); },
    check: async ctx => {
      const d = await ctx.dl;
      return d && /\.docx$/.test(d.suggestedFilename()) ? true : `no .docx download (${d && d.suggestedFilename()})`;
    },
    after: endMerge,
  },
  {
    id: "merge.print", win: ["Alt+Shift+m"], mac: [], doc: ["Dear "], at: [0, -1],
    pre: async ctx => { await withField(ctx); ctx.dl = ctx.page.waitForEvent("download", { timeout: 60000 }).catch(() => null); },
    check: async ctx => {
      const d = await ctx.dl;
      return d && /\.pdf$/.test(d.suggestedFilename()) ? true : `no .pdf download (${d && d.suggestedFilename()})`;
    },
    after: endMerge,
  },
  {
    id: "merge.edit-data", win: ["Alt+Shift+e"], mac: [], doc: ["Dear "],
    pre: startMerge,
    check: async ctx => {
      let open = false;
      for (let i = 0; i < 20 && !open; i++) { await ctx.frame.waitForTimeout(250); open = await ctx.js(() => $(".asc-window:visible iframe, #id-merge-editor-placeholder:visible").length > 0); }
      await ctx.js(() => { $(".asc-window:visible").each(function () { const b = $(this).find(".tool.close:visible").first(); b.length ? b.click() : $(this).hide(); }); });
      return open ? true : "the recipient list editor did not open";
    },
    after: endMerge,
  },
];
