// SPDX-License-Identifier: AGPL-3.0-only
// Test cases of the Word editing shortcuts of word/Editor/word-edit-keys.js (docs/shortcuts-word.csv):
// F2 / Shift+F2, Spike, Paste Special, edit locations, underline styles, hidden text, ...
// Same case format as cases.mjs.
import { visibleWindowText, select, caret, cmd } from "./lib.mjs";

const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what || "got"} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const texts = async ctx => (await ctx.st()).paras.map(p => p.text);
const hintText = ctx => ctx.js(() => { const h = document.getElementById("eo-status-hint"); return h && h.getClientRects().length && getComputedStyle(h).display !== "none" ? h.textContent : null; });
const modKey = (ctx, k) => (ctx.platform === "mac" ? "Meta+" : "Control+") + k;
const paraIndex = ctx => ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.Content.indexOf(d.GetCurrentParagraph()); });
const resetLocations = ctx => ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.WordEditLocations = []; d.WordEditCycle = undefined; d.WordSpike = []; d.WordMoveCopy = null; });

const THREE = ["alpha beta gamma", "second line", "third line"];

// Types a mark at the end of paragraphs, so that they become the places of the last edits
async function editAt(ctx, list) {
  for (const p of list) {
    await caret(ctx.frame, p, -1);
    await ctx.page.keyboard.type("x");
    await ctx.frame.waitForTimeout(400);
  }
}

const PAGES = [{ text: "page one", pageBreak: true }, { text: "page two", pageBreak: true }, "page three"];
const previewPage = ctx => ctx.js(() => DE.getController("Print")._navigationPreview.currentPreviewPage);
// File > Print with the preview on `start`; the key must bring it to `want`
function previewCase(id, keys, start, want, extra) {
  return {
    id, win: keys, mac: [], doc: PAGES,
    pre: async ctx => {
      await ctx.js(() => DE.getController("LeftMenu").leftMenu.showMenu("file:printpreview"));
      for (let i = 0; i < 30; i++) {
        if (await ctx.js(() => { const p = DE.getController("Print"); return p._isPreviewVisible && p._navigationPreview.pageCount >= 3; })) break;
        await ctx.frame.waitForTimeout(250);
      }
      await ctx.frame.waitForTimeout(300);
      await ctx.js(s => DE.getController("Print").api.goToPage(s), start);
      await ctx.frame.waitForTimeout(500);
      await ctx.js(() => { const a = document.activeElement; a && a.blur && a.blur(); });
    },
    check: async ctx => {
      let got = await previewPage(ctx);
      for (let i = 0; i < 12 && got !== want; i++) { await ctx.frame.waitForTimeout(250); got = await previewPage(ctx); }
      if (got !== want) return `preview page ${got}, expected ${want} ` + JSON.stringify(await ctx.js(() => { const p = DE.getController('Print'); const a = document.activeElement; return [p._isPreviewVisible, $('#print-preview-box:visible').length, $('.dropdown-menu:visible').length, a.tagName + '#' + a.id + '.' + a.className.slice(0, 40), $(a).closest('.dropdown-menu, .combo-dataview, .menu-picker-container').length]; }));
      return extra ? extra(ctx) : true;
    },
    after: async ctx => { await ctx.js(() => DE.getController("LeftMenu").leftMenu.menuFile.hide()); },
  };
}

const focusCommentsPane = ctx => ctx.js(() => { const el = $("#left-panel-comments button:visible, #left-panel-comments [tabindex]:visible").first()[0]; Asc.editor.asc_enableKeyEvents(false); el && el.focus(); });
// three comments, the Comments pane open with the focus in its list; the key must select the comment of `text`
function commentsCase(id, key, text) {
  return {
    id, win: [], mac: [[{ run: focusCommentsPane }, "Meta+" + key]], doc: ["alpha one", "beta two", "gamma three"],
    pre: async ctx => {
      await cmd(ctx.frame, `(function(){ var d = Api.GetDocument(); for (var i = 0; i < 3; i++) d.GetElement(i).GetRange(0, 4).AddComment("comment " + i, "Tester"); return 1; })()`);
      await ctx.frame.waitForTimeout(800);
      await ctx.js(() => DE.getController("LeftMenu").onShortcut("comments"));
      await ctx.frame.waitForTimeout(800);
      await ctx.js(() => { const el = $("#left-panel-comments button:visible, #left-panel-comments [tabindex]:visible").first()[0]; Asc.editor.asc_enableKeyEvents(false); el && el.focus(); });
      // start from the middle comment
      await ctx.js(() => { const cc = DE.getController("Common.Controllers.Comments"); const m = cc.collection.find(m => m.get("comment") === "comment 1" && m.get("position") >= 0); m && Asc.editor.asc_selectComment(m.get("uid")); });
      await ctx.frame.waitForTimeout(600);
      await ctx.js(() => { const el = $("#left-panel-comments button:visible, #left-panel-comments [tabindex]:visible").first()[0]; Asc.editor.asc_enableKeyEvents(false); el && el.focus(); });
    },
    check: async ctx => {
      const r = await ctx.js(t => { const cc = DE.getController("Common.Controllers.Comments"); const m = cc.collection.find(m => m.get("comment") === t && m.get("position") >= 0); return { want: m && m.get("uid"), got: Asc.editor.WordControl.m_oLogicDocument.Comments.Get_CurrentId() }; }, text);
      return r.want && r.want === r.got ? true : `selected comment ${r.got}, expected ${r.want} (${text}) ` + JSON.stringify(await ctx.js(() => { const a = document.activeElement; return [a.tagName, a.className.slice(0, 40), $(a).closest('#left-panel-comments').length, $('#left-panel-comments:visible').length, Common.Utils.isMac]; }));
    },
    after: async ctx => { await ctx.js(() => { try { Asc.editor.asc_RemoveAllComments(true, true); DE.getController("LeftMenu").leftMenu.close(); } catch (e) {} }); },
  };
}

const clearAutoText = ctx => ctx.js(() => { try { Object.keys(localStorage).filter(k => k.startsWith("eo-autotext")).forEach(k => localStorage.removeItem(k)); } catch (e) {} });

export const CASES = [
  // ---- F2 / Shift+F2: move / copy to a place chosen with the cursor
  {
    id: "edit.move-to", win: ["F2"], mac: [], doc: THREE, sel: [0, 0, 5],
    check: async ctx => {
      const hint = await hintText(ctx);
      if (!/Move to where\? Press Enter/i.test(hint || "")) return `status hint ${JSON.stringify(hint)}`;
      for (const k of ["ArrowDown", "ArrowDown", "End"]) await ctx.page.keyboard.press(k);
      await ctx.page.keyboard.press("Enter");
      await ctx.frame.waitForTimeout(400);
      if (await hintText(ctx)) return "the hint stays after Enter";
      let r = eq(await texts(ctx), [" beta gamma", "second line", "third linealpha"], "after Enter");
      if (r !== true) return r;
      // Esc cancels: nothing moves
      await select(ctx.frame, 1, 0, 6);
      await ctx.page.keyboard.press("F2");
      await ctx.page.keyboard.press("ArrowDown");
      await ctx.page.keyboard.press("Escape");
      await ctx.frame.waitForTimeout(200);
      const pending = await ctx.js(() => !!Asc.editor.WordControl.m_oLogicDocument.WordMoveCopy);
      const after = await texts(ctx);
      return !pending && !(await hintText(ctx)) && after[1] === "second line" ? true : `Esc did not cancel: pending ${pending}, ${JSON.stringify(after)}`;
    },
  },
  {
    id: "edit.copy-to", win: ["Shift+F2"], mac: ["Shift+F2"], doc: THREE, sel: [0, 0, 5],
    check: async ctx => {
      const hint = await hintText(ctx);
      if (!/Copy to where\? Press Enter/i.test(hint || "")) return `status hint ${JSON.stringify(hint)}`;
      for (const k of ["ArrowDown", "Home"]) await ctx.page.keyboard.press(k);
      await ctx.page.keyboard.press("Enter");
      await ctx.frame.waitForTimeout(400);
      return eq(await texts(ctx), ["alpha beta gamma", "alphasecond line", "third line"], "after Enter");
    },
  },

  // ---- Spike
  {
    id: "edit.spike-cut", win: ["Control+F3"], mac: ["Meta+F3"], doc: THREE, sel: [0, 0, 5],
    pre: resetLocations,
    check: async ctx => {
      let r = eq(await texts(ctx), [" beta gamma", "second line", "third line"], "after the first cut");
      if (r !== true) return r;
      await select(ctx.frame, 1, 0, 6);
      await ctx.page.keyboard.press(modKey(ctx, "F3"));
      await ctx.frame.waitForTimeout(300);
      r = eq(await texts(ctx), [" beta gamma", " line", "third line"], "after the second cut");
      if (r !== true) return r;
      const count = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.WordSpike.length);
      return count === 2 && /Spike: 2/.test((await hintText(ctx)) || "") ? true : `Spike has ${count} items, hint ${JSON.stringify(await hintText(ctx))}`;
    },
  },
  {
    id: "edit.spike-paste", win: ["Control+Shift+F3"], mac: ["Meta+Shift+F3"], doc: THREE, sel: [0, 0, 5],
    pre: async ctx => {
      await resetLocations(ctx);
      await select(ctx.frame, 0, 0, 5); await ctx.page.keyboard.press(modKey(ctx, "F3")); await ctx.frame.waitForTimeout(250);
      await select(ctx.frame, 1, 0, 6); await ctx.page.keyboard.press(modKey(ctx, "F3")); await ctx.frame.waitForTimeout(250);
      await caret(ctx.frame, 2, -1);
    },
    check: async ctx => {
      await ctx.frame.waitForTimeout(200);
      const t = await texts(ctx);
      if (JSON.stringify(t) !== JSON.stringify([" beta gamma", " line", "third linealpha", "second", ""])) return `after pasting the Spike ${JSON.stringify(t)}`;
      // the Spike is empty now
      await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+Shift+F3" : "Control+Shift+F3");
      await ctx.frame.waitForTimeout(250);
      return eq(await texts(ctx), t, "second paste (the Spike must be empty)");
    },
  },

  // ---- Paste Special dialog
  {
    id: "edit.paste-special", win: ["Control+Alt+v"], mac: ["Meta+Control+v"], doc: ["alpha beta"], sel: [0, 0, 5],
    pre: async ctx => { await ctx.js(() => Asc.editor.clearFormatPainterData()); },
    check: async ctx => {
      const t = await visibleWindowText(ctx.frame);
      if (!/Paste Special/i.test(t)) return `no Paste Special dialog (open: ${t || "none"})`;
      const options = await ctx.js(() => $(".asc-window:visible .radio-box, .asc-window:visible label.radiobox, .asc-window:visible .custom-radio").length || $(".asc-window:visible input[type=radio]").length);
      return options >= 3 ? true : `${options} options in the dialog`;
    },
    after: async ctx => { await ctx.page.keyboard.press("Escape"); },
  },

  // ---- edit locations
  {
    id: "nav.previous-revision", win: ["Shift+F5"], mac: ["Shift+F5"], doc: ["p0 text", "p1 text", "p2 text", "p3 text", "p4 text", "p5 text"],
    pre: async ctx => { await resetLocations(ctx); await editAt(ctx, [0, 2, 4]); await caret(ctx.frame, 5, 0); },
    check: async ctx => eq(await paraIndex(ctx), 4, "paragraph of the cursor (the last edit)"),
  },
  {
    id: "nav.last-revision-on-open", win: ["Shift+F5"], mac: [], doc: ["p0 text", "p1 text", "p2 text", "p3 text", "p4 text", "p5 text"],
    // the places of the last session are remembered by the browser: simulate a document that was just opened
    pre: async ctx => {
      await ctx.js(() => {
        const d = Asc.editor.WordControl.m_oLogicDocument;
        d.WordEditLocations = []; d.WordEditCycle = undefined;
        const key = d.private_GetEditLocationKey();
        localStorage.setItem(key, JSON.stringify([[3, 2], [1, 0]]));
      });
      await caret(ctx.frame, 5, 0);
    },
    check: async ctx => {
      const p = await paraIndex(ctx);
      await ctx.page.keyboard.type("#");
      const t = await texts(ctx);
      await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; localStorage.removeItem(d.private_GetEditLocationKey()); });
      return p === 3 && t[3] === "p3# text" ? true : `cursor in paragraph ${p}, text ${JSON.stringify(t[3])}`;
    },
  },
  {
    id: "nav.recent-changes", win: [["Control+Alt+z", "Control+Alt+z"]], mac: [], doc: ["p0 text", "p1 text", "p2 text", "p3 text", "p4 text", "p5 text"],
    pre: async ctx => { await resetLocations(ctx); await editAt(ctx, [0, 2, 4]); await caret(ctx.frame, 5, 0); },
    check: async ctx => {
      let r = eq(await paraIndex(ctx), 2, "after two presses");
      if (r !== true) return r;
      await ctx.page.keyboard.press("Control+Alt+z"); await ctx.frame.waitForTimeout(150);
      await ctx.page.keyboard.press("Control+Alt+z"); await ctx.frame.waitForTimeout(150);
      return eq(await paraIndex(ctx), 4, "after four presses (the cycle goes back to the last place)");
    },
  },

  // ---- underline styles (w:u double / words) and hidden text (w:vanish)
  {
    id: "fmt.double-underline", win: ["Control+Shift+d"], mac: ["Meta+Shift+d"], doc: ["alpha beta"], sel: [0, 0, 5],
    check: async ctx => {
      const u = () => ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr().Underline);
      let r = eq(await u(), 10, "underline (Asc.UnderlineType.Double)");
      if (r !== true) return r;
      await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+Shift+d" : "Control+Shift+d");
      await ctx.frame.waitForTimeout(250);
      return eq(!!(await u()), false, "underline after pressing the key again");
    },
  },
  {
    id: "fmt.word-underline", win: ["Control+Shift+w", "Control+Alt+Shift+w"], mac: ["Meta+Shift+w", "Meta+Alt+Shift+w"], doc: ["alpha beta gamma"], sel: [0, 0, 16],
    check: async ctx => {
      const u = () => ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr().Underline);
      let r = eq(await u(), 17, "underline (Asc.UnderlineType.Words)");
      if (r !== true) return r;
      await ctx.page.keyboard.press(ctx.platform === "mac" ? "Meta+Shift+w" : "Control+Shift+w");
      await ctx.frame.waitForTimeout(250);
      return eq(!!(await u()), false, "underline after pressing the key again");
    },
  },
  {
    id: "fmt.hidden", win: ["Control+Shift+h"], mac: [], doc: ["alpha SECRET beta gamma"], sel: [0, 6, 12],
    pre: async ctx => { ctx.w0 = await ctx.js(() => Asc.editor.WordControl.m_oLogicDocument.Content[0].Lines[0].Ranges[0].W); },
    check: async ctx => {
      const width = () => ctx.js(() => Math.round(Asc.editor.WordControl.m_oLogicDocument.Content[0].Lines[0].Ranges[0].W * 100) / 100);
      const vanish = () => ctx.js(() => !!Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr().Vanish);
      if (!(await vanish())) return "the text is not hidden";
      const w1 = await width();
      if (!(w1 < ctx.w0 - 5)) return `the line is as wide as before (${ctx.w0} -> ${w1}): the hidden text still takes room`;
      // shown with the formatting marks
      await ctx.js(() => Asc.editor.put_ShowParaMarks(true));
      await ctx.frame.waitForTimeout(400);
      const w2 = await width();
      await ctx.js(() => Asc.editor.put_ShowParaMarks(false));
      await ctx.frame.waitForTimeout(300);
      if (!(w2 > w1 + 5)) return `the hidden text does not appear with the formatting marks (${w1} -> ${w2})`;
      await ctx.page.keyboard.press("Control+Shift+h");
      await ctx.frame.waitForTimeout(250);
      return (await vanish()) ? "second press did not show the text again" : true;
    },
  },

  // ---- print preview of the backstage (File > Print): one fitted page, keys change the page
  previewCase("file.preview.move", ["ArrowDown", "ArrowRight"], 0, 1, async ctx => { await ctx.page.keyboard.press("ArrowUp"); await ctx.frame.waitForTimeout(500); return eq(await previewPage(ctx), 0, "page after Up arrow"); }),
  previewCase("file.preview.page", ["PageDown"], 0, 1, async ctx => { await ctx.page.keyboard.press("PageUp"); await ctx.frame.waitForTimeout(500); return eq(await previewPage(ctx), 0, "page after Page up"); }),
  previewCase("file.preview.first", ["Control+Home"], 2, 0),
  previewCase("file.preview.last", ["Control+End"], 0, 2),

  // ---- Alt+F6: from a pane back to the document
  {
    id: "window.dialog-to-document", win: ["Alt+F6"], mac: [], doc: ["alpha beta"],
    pre: async ctx => {
      await ctx.page.keyboard.press("Control+f");
      await ctx.frame.waitForTimeout(600);
      ctx.inPane = await ctx.js(() => !!$(document.activeElement).closest("#left-menu, #left-panel-search, .left-panel").length);
    },
    check: async ctx => {
      if (!ctx.inPane) return "precondition: the Find box did not take the focus";
      const where = await ctx.js(() => { const a = document.activeElement; return { id: a.id, inPane: !!$(a).closest("#left-menu, #left-panel-search, .left-panel").length, tag: a.tagName }; });
      return !where.inPane ? true : `the focus is still in the pane (${JSON.stringify(where)})`;
    },
    after: async ctx => { await ctx.js(() => { try { DE.getController("LeftMenu").leftMenu.close(); } catch (e) {} }); },
  },

  // ---- Alt+Shift+R: header of the previous section
  {
    id: "edit.copy-previous-header", win: ["Alt+Shift+r"], mac: [], doc: ["section one", "section two"],
    pre: async ctx => {
      await cmd(ctx.frame, `(function(){ var d = Api.GetDocument(); var s1 = d.CreateSection(d.GetElement(0)); s1.SetType("nextPage"); s1.GetHeader("default", true).GetElement(0).AddText("HEADER ONE"); var s2 = d.GetFinalSection(); s2.GetHeader("default", true).GetElement(0).AddText("HEADER TWO"); return 1; })()`);
      await ctx.frame.waitForTimeout(500);
      await ctx.js(() => Asc.editor.GoToHeader(1));
      await ctx.frame.waitForTimeout(500);
      ctx.own = await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.GetDocPosType() === 8 || d.SectionsInfo.GetSectPrByIndex(1) && d.SectionsInfo.GetSectPrByIndex(1).GetHdrFtr(true, false, false) !== null; });
    },
    check: async ctx => {
      const own = () => ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const sp = d.SectionsInfo.GetSectPrByIndex(1); return sp ? sp.GetHdrFtr(true, false, false) !== null : "no second section"; });
      return (await own()) === false ? true : `the header of section two is still its own (${await own()})`;
    },
    after: async ctx => { await ctx.js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; try { d.EndHdrFtrEditing(true); } catch (e) {} }); },
  },

  // ---- Comments pane: first and last comment (Cmd+Home / Cmd+End in the Reviewing Pane)
  commentsCase("review.comments-first", "Home", "comment 0"),
  commentsCase("review.comments-last", "End", "comment 2"),

  // ---- AutoText: Alt+F3 defines a block, its name + Enter inserts it (kept in localStorage)
  {
    id: "edit.autotext-define", win: ["Alt+F3"], mac: ["Alt+F3"], doc: [{ text: "alpha bold", bold: true }, "target "], sel: [0, 0, 5],
    pre: async ctx => { await clearAutoText(ctx); },
    check: async ctx => {
      const t = await visibleWindowText(ctx.frame);
      if (!/AutoText/i.test(t)) return `no AutoText dialog (open: ${t || "none"})`;
      await ctx.page.keyboard.press("ControlOrMeta+a");
      await ctx.page.keyboard.type("sig1");
      await ctx.page.keyboard.press("Enter");
      await ctx.frame.waitForTimeout(400);
      const saved = await ctx.js(() => { try { return [JSON.parse(localStorage.getItem("eo-autotext-index")), !!localStorage.getItem("eo-autotext:sig1")]; } catch (e) { return null; } });
      return eq(saved, [["sig1"], true], "stored AutoText");
    },
    after: async ctx => { await clearAutoText(ctx); },
  },
  {
    id: "edit.autotext-insert", win: ["Enter"], mac: [], doc: [{ text: "alpha bold", bold: true }, "target "],
    pre: async ctx => {
      await clearAutoText(ctx);
      await select(ctx.frame, 0, 0, 5);
      await ctx.page.keyboard.press("Alt+F3"); await ctx.frame.waitForTimeout(500);
      await ctx.page.keyboard.press("Control+a"); await ctx.page.keyboard.type("sig1"); await ctx.page.keyboard.press("Enter"); await ctx.frame.waitForTimeout(500);
      await caret(ctx.frame, 1, -1);
      await ctx.page.keyboard.type("sig1");
    },
    check: async ctx => {
      await ctx.frame.waitForTimeout(300);
      const s = await ctx.st();
      if (JSON.stringify(s.paras.map(p => p.text)) !== JSON.stringify(["alpha bold", "target alpha"])) return `text after Enter ${JSON.stringify(s.paras.map(p => p.text))}`;
      await select(ctx.frame, 1, 7, 12);
      return (await ctx.st()).text.bold ? true : "the inserted block lost its formatting";
    },
    after: async ctx => { await clearAutoText(ctx); },
  },
];
