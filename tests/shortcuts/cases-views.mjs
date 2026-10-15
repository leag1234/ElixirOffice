// Test cases of the Word views and field commands of word/Editor/word-views.js (docs/shortcuts-word.csv):
// Outline view and its keys, Draft view, Print Layout, Read Mode keys, Ctrl+F9, Ctrl+F11, Ctrl+Shift+F11,
// and the task panes of controller WordPanes (Shift+F1, Alt+F10, Shift+F7).
// Same case format as cases.mjs.
import { caret, cmd } from "./lib.mjs";

const doc = "Asc.editor.WordControl.m_oLogicDocument";
const view = ctx => ctx.js(() => Asc.editor.asc_GetWordView());
const hiddenTexts = ctx => ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content.filter(p => d.IsOutlineHidden(p)).map(p => p.GetText().trim()); });
const toView = (ctx, v) => ctx.js(v => Asc.editor.asc_SetWordView(v), v);
const backToPrint = async ctx => { await ctx.js(() => { try { Asc.editor.asc_SetWordView("print"); } catch (e) {} }); };
const fields = ctx => ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllFields(false).map(f => ({ code: f.GetInstructionLine(), shown: f.IsShowFieldCode(), locked: f.IsLocked() })));
const text1 = async ctx => (await ctx.st()).paras.map(p => p.text);
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what || "got"} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

// Heading 1 > body, Heading 2 > body; Heading 1 > body
const OUTLINE = [{ text: "Chapter one", style: "Heading 1" }, "Body one", { text: "Section A", style: "Heading 2" }, "Body A", { text: "Chapter two", style: "Heading 1" }, "Body two"];
const inOutline = async ctx => { await toView(ctx, "outline"); await ctx.frame.waitForTimeout(400); };
// Windows: Alt+Shift+...; macOS: Control+Shift+...
const om = (ctx, k) => (ctx.platform === "mac" ? "Control+Shift+" : "Alt+Shift+") + k;
const outlineKeys = k => ({ win: ["Alt+Shift+" + k], mac: ["Control+Shift+" + k] });

const LONG = Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1} ` + "lorem ipsum dolor sit amet ".repeat(8));
async function enterRead(ctx) {
  await ctx.js(() => DE.getController("RibbonTabs").view.btnViewRead.cmpEl.find("button").addBack("button").first().click());
  for (let i = 0; i < 20 && (await view(ctx)) !== "read"; i++) await ctx.frame.waitForTimeout(250);
  await ctx.frame.waitForTimeout(500);
  await ctx.js(() => { const a = document.activeElement; a && a.blur && a.blur(); });
}
const leaveRead = async ctx => {
  await ctx.js(() => { const c = DE.getController("WordViews"); c._state.read && c.exitReadMode(); });
  for (let i = 0; i < 20 && (await ctx.js(() => !!(Asc.editor.isViewMode || Asc.editor.restrictions || Asc.editor.asc_GetWordView() !== "print"))); i++) await ctx.frame.waitForTimeout(250);
  await ctx.frame.waitForTimeout(800);
};
const page = ctx => ctx.js(() => Asc.editor.getCurrentPage());
function readCase(id, keys, prepare, want) {
  return {
    id, win: [keys], mac: [keys], doc: LONG,
    pre: async ctx => { await enterRead(ctx); if (prepare) await prepare(ctx); },
    check: async ctx => {
      if ((await view(ctx)) !== "read") return `not in Read Mode (${await view(ctx)})`;
      const count = await ctx.js(() => Asc.editor.getCountPages());
      const target = typeof want === "function" ? want(count) : want;
      let got = await page(ctx);
      for (let i = 0; i < 8 && got !== target; i++) { await ctx.frame.waitForTimeout(250); got = await page(ctx); }
      return got === target ? true : `page ${got} of ${count}, expected ${target}`;
    },
    after: leaveRead,
  };
}

export const CASES = [
  // ---- views
  {
    id: "view.outline", win: ["Control+Alt+o"], mac: ["Meta+Alt+o"], doc: OUTLINE,
    check: async ctx => {
      const r = await ctx.js(() => {
        const d = Asc.editor.WordControl.m_oLogicDocument;
        return { view: d.GetWordView(), tab: $("#toolbar a[data-tab=outlining]").closest("li").is(":visible"), active: $("#toolbar .ribtab.active > a").attr("data-tab"),
          ind: d.Content.map(p => Math.round(p.Get_CompiledPr2(false).ParaPr.Ind.Left)) };
      });
      if (r.view !== "outline") return `view ${r.view}`;
      if (!r.tab || r.active !== "outlining") return `Outlining tab visible ${r.tab}, active tab ${r.active}`;
      // indented by level, body text one level under its heading
      return r.ind[0] < r.ind[1] && r.ind[1] === r.ind[2] && r.ind[2] < r.ind[3] && r.ind[4] === r.ind[0] ? true : `indents ${JSON.stringify(r.ind)}`;
    },
    after: backToPrint,
  },
  {
    id: "view.draft", win: ["Control+Alt+n"], mac: ["Meta+Alt+n"], doc: [{ text: "one", pageBreak: true }, "two"],
    check: async ctx => {
      const r = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return { view: d.GetWordView(), headers: d.Layout.IsHeaders(), outline: $("#toolbar a[data-tab=outlining]").closest("li").is(":visible"), draftBtn: DE.getController("WordViews").btnViewDraft.pressed }; });
      return r.view === "draft" && !r.headers && !r.outline && r.draftBtn ? true : JSON.stringify(r);
    },
    after: backToPrint,
  },
  {
    id: "view.print-layout", win: ["Control+Alt+p"], mac: ["Meta+Alt+p"], doc: ["ab"], at: [0, 1],
    pre: inOutline,
    check: async ctx => {
      const r = await ctx.js(() => ({ view: Asc.editor.asc_GetWordView(), tab: $("#toolbar a[data-tab=outlining]").closest("li").is(":visible"), text: Asc.editor.WordControl.m_oLogicDocument.Content[0].GetText().trim() }));
      return r.view === "print" && !r.tab && r.text === "ab" ? true : JSON.stringify(r);
    },
  },

  // ---- Outline view keys
  {
    id: "outline.collapse", ...outlineKeys("Minus"), doc: OUTLINE, at: [0, 2], pre: inOutline,
    check: async ctx => {
      let r = eq(await hiddenTexts(ctx), ["Body one", "Body A"], "first press hides the body text");
      if (r !== true) return r;
      await ctx.page.keyboard.press(om(ctx, "Minus")); await ctx.frame.waitForTimeout(300);
      r = eq(await hiddenTexts(ctx), ["Body one", "Section A", "Body A"], "second press hides the subheadings");
      if (r !== true) return r;
      // collapsed text takes no room and the cursor jumps over it
      const h = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p = d.Content[1].Pages[0]; return p.Bounds.Bottom - p.Bounds.Top; });
      if (h > 0.01) return `a collapsed paragraph is ${h} mm high`;
      await ctx.page.keyboard.press("ArrowDown"); await ctx.frame.waitForTimeout(200);
      const cur = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content.indexOf(d.GetCurrentParagraph()); });
      return cur === 4 ? true : `Down went to paragraph ${cur}, expected 4 (Chapter two)`;
    },
    after: backToPrint,
  },
  {
    id: "outline.expand", ...outlineKeys("Equal"), doc: OUTLINE, at: [0, 2],
    pre: async ctx => { await inOutline(ctx); await ctx.js(() => Asc.editor.asc_OutlineCommand("level", 1)); },
    check: async ctx => {
      let r = eq(await hiddenTexts(ctx), ["Body one", "Body A", "Body two"], "first press shows the next level");
      if (r !== true) return r;
      await ctx.page.keyboard.press(om(ctx, "Equal")); await ctx.frame.waitForTimeout(300);
      return eq(await hiddenTexts(ctx), ["Body two"], "second press shows the body text");
    },
    after: backToPrint,
  },
  {
    id: "outline.expand-all", ...outlineKeys("a"), doc: OUTLINE, pre: inOutline,
    check: async ctx => {
      let r = eq(await hiddenTexts(ctx), ["Body one", "Body A", "Body two"], "headings only");
      if (r !== true) return r;
      await ctx.page.keyboard.press(om(ctx, "a")); await ctx.frame.waitForTimeout(300);
      return eq(await hiddenTexts(ctx), [], "everything");
    },
    after: backToPrint,
  },
  {
    id: "outline.show-heading1", ...outlineKeys("1"), doc: OUTLINE, pre: inOutline,
    check: async ctx => {
      const r = eq(await hiddenTexts(ctx), ["Body one", "Section A", "Body A", "Body two"], "Heading 1 only");
      const combo = await ctx.js(() => DE.getController("WordViews").cmbShow.getValue());
      return r !== true ? r : combo === 1 ? true : `Show Level box ${combo}`;
    },
    after: backToPrint,
  },
  {
    id: "outline.show-level", ...outlineKeys("2"), doc: OUTLINE, pre: inOutline,
    check: async ctx => eq(await hiddenTexts(ctx), ["Body one", "Body A", "Body two"], "levels 1 and 2"),
    after: backToPrint,
  },
  {
    id: "outline.char-format", win: ["NumpadDivide"], mac: ["NumpadDivide"], doc: [{ text: "Chapter one", style: "Heading 1" }, "Body one"], pre: inOutline,
    check: async ctx => {
      const r = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const pr = d.Content[0].Content[0].Get_CompiledPr(false); return { size: pr.FontSize, plain: d.GetOutlineState().showFormatting === false, chk: DE.getController("WordViews").chkFormatting.getValue(), text: d.Content[0].GetText().trim() }; });
      if (!r.plain || r.size > 12 || r.text !== "Chapter one") return `formatting still shown: ${JSON.stringify(r)}`;
      await ctx.page.keyboard.press("NumpadDivide"); await ctx.frame.waitForTimeout(300);
      const size = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.Content[0].Content[0].Get_CompiledPr(false).FontSize);
      return size > 12 ? true : `the second press did not show the formatting again (size ${size})`;
    },
    after: backToPrint,
  },
  // ---- Read Mode
  readCase("view.read-mode.end", "End", null, n => n - 1),
  readCase("view.read-mode.home", "Home", async ctx => { await ctx.js(() => Asc.editor.goToPage(2)); await ctx.frame.waitForTimeout(400); }, 0),
  readCase("view.read-mode.page", ["3", "Enter"], null, 2),
  {
    id: "view.read-mode.exit", win: ["Escape"], mac: ["Escape"], doc: LONG,
    pre: enterRead,
    check: async ctx => {
      await ctx.frame.waitForTimeout(600);
      const r = await ctx.js(() => ({ view: Asc.editor.asc_GetWordView(), viewMode: !!(Asc.editor.isViewMode || Asc.editor.restrictions), read: DE.getController("WordViews")._state.read }));
      return r.view === "print" && !r.read && !r.viewMode ? true : JSON.stringify(r);
    },
    after: leaveRead,
  },

  // ---- fields
  {
    id: "field.empty", win: ["Control+F9"], mac: ["Meta+F9"], doc: ["Page "], at: [0, -1],
    check: async ctx => {
      let f = await fields(ctx);
      if (f.length !== 1 || !f[0].shown) return `after the key: ${JSON.stringify(f)}`;
      await ctx.page.keyboard.type("PAGE");
      await ctx.page.keyboard.press("F9");
      await ctx.frame.waitForTimeout(400);
      f = await fields(ctx);
      const t = (await text1(ctx))[0];
      return f.length === 1 && f[0].code.trim() === "PAGE" && !f[0].shown && t === "Page 1" ? true : `after typing PAGE and F9: ${JSON.stringify(f)} text ${JSON.stringify(t)}`;
    },
  },
  {
    id: "field.lock", win: ["Control+F11"], mac: ["Meta+F11"], doc: ["x"], at: [0, 1],
    pre: async ctx => {
      await ctx.js(() => { Asc.editor.asc_AddComplexFieldWithInstruction("NUMPAGES"); });
      await ctx.frame.waitForTimeout(300);
      await ctx.page.keyboard.press("ArrowLeft");
    },
    check: async ctx => {
      const f = await fields(ctx);
      if (f.length !== 1 || !f[0].locked) return `after the key: ${JSON.stringify(f)}`;
      // a locked field keeps its result on F9
      await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToEndPos(); });
      await ctx.page.keyboard.press("Enter"); await ctx.page.keyboard.press("Control+Enter");
      await ctx.frame.waitForTimeout(300);
      await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); d.UpdateFields(true); d.RemoveSelection(); });
      await ctx.frame.waitForTimeout(400);
      const t = (await text1(ctx))[0];
      return t === "x1" ? true : `a locked NUMPAGES field was updated: ${JSON.stringify(t)}`;
    },
  },
  {
    id: "field.unlock", win: ["Control+Shift+F11"], mac: ["Meta+Shift+F11"], doc: ["x"], at: [0, 1],
    pre: async ctx => {
      await ctx.js(() => { Asc.editor.asc_AddComplexFieldWithInstruction("PAGE"); });
      await ctx.frame.waitForTimeout(300);
      await ctx.page.keyboard.press("ArrowLeft");
      await ctx.js(() => Asc.editor.asc_SetFieldsLocked(true));
    },
    check: async ctx => {
      const f = await fields(ctx);
      return f.length === 1 && !f[0].locked ? true : `after the key: ${JSON.stringify(f)}`;
    },
  },
  // ---- task panes (details in tests/views/panes.mjs)
  {
    id: "fmt.reveal", win: ["Shift+F1"], mac: ["Shift+F1"], doc: [{ text: "Bold words", bold: true }], sel: [0, 0, 4],
    check: async ctx => {
      const r = await ctx.js(() => ({ pane: $("#elx-task-pane").attr("data-pane"), text: $("#elx-task-pane .elx-tp-body").text() }));
      if (r.pane !== "reveal" || !/Bold/.test(r.text) || !/PARAGRAPH STYLE:/.test(r.text)) return `pane ${r.pane}: ${r.text.slice(0, 160)}`;
      await ctx.page.keyboard.press("Shift+F1"); await ctx.frame.waitForTimeout(200);
      return (await ctx.js(() => $("#elx-task-pane").length)) === 0 ? true : "a second Shift+F1 did not close the pane";
    },
    after: ctx => ctx.js(() => $("#elx-task-pane .elx-tp-close").click()),
  },
  {
    id: "ribbon.selection-pane", win: ["Alt+F10"], mac: [], doc: ["Picture here"],
    pre: async ctx => {
      await cmd(ctx.frame, `(function(){ var d = Api.GetDocument(); var img = Api.CreateImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 18e5, 18e5); d.GetElement(0).AddDrawing(img); return 1; })()`);
      await ctx.frame.waitForTimeout(400);
    },
    check: async ctx => {
      const r = await ctx.js(() => ({ pane: $("#elx-task-pane").attr("data-pane"), items: $("#elx-task-pane .elx-sp-item .elx-sp-name").map((i, e) => e.textContent).get() }));
      return r.pane === "selection" && r.items.length === 1 && /^Picture 1$/.test(r.items[0]) ? true : JSON.stringify(r);
    },
    after: ctx => ctx.js(() => $("#elx-task-pane .elx-tp-close").click()),
  },
  {
    id: "review.thesaurus", win: ["Shift+F7"], mac: ["Shift+F7"], doc: ["a happy child"], at: [0, 4],
    check: async ctx => {
      let r;
      for (let i = 0; i < 40; i++) {
        r = await ctx.js(() => ({ pane: $("#elx-task-pane").attr("data-pane"), word: $("#elx-task-pane .elx-th-input").val(), syn: $("#elx-task-pane .elx-th-syn .elx-sp-name").map((i, e) => e.textContent).get() }));
        if (r.syn.length) break;
        await ctx.frame.waitForTimeout(250);
      }
      if (r.pane !== "thesaurus" || r.word !== "happy" || !r.syn.includes("glad")) return JSON.stringify(r).slice(0, 200);
      // Insert replaces the word of the cursor
      await ctx.js(() => $("#elx-task-pane .elx-th-syn").filter((i, e) => $(e).find(".elx-sp-name").text() === "glad").find(".elx-th-insert").click());
      await ctx.frame.waitForTimeout(400);
      const t = (await ctx.st()).paras[0].text;
      return t === "a glad child" ? true : `after Insert: ${JSON.stringify(t)}`;
    },
    after: ctx => ctx.js(() => $("#elx-task-pane .elx-tp-close").click()),
  },
];
