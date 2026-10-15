#!/usr/bin/env node
// Second wave of Word commands: Show First Line Only in the Outline view, block (column) selection, window split,
// field lock saved in .docx (w:fldLock, needs the x2t of core elixir/parity2), the Mailings tab (mail merge).
// Engine: sdkjs word/Editor/word-block-selection.js and word-views.js; interface: controllers WordViews, WordMailings.
//   node tests/views/wave2.mjs [--out results.json] [--shots dir]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, focusDoc, resetUi } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = opt("--out", path.join(HERE, "results", "wave2-latest.json"));
const shots = opt("--shots", null);
shots && fs.mkdirSync(shots, { recursive: true });
const WORK = path.join(HERE, "results", "wave2-files");
execFileSync("python3", [path.join(HERE, "make_fixtures.py"), WORK]);

const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason || ok) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + (reason || ok))); };

const { browser, page, errors } = await launch({});
let frame = await openEditor(page);
const js = (fn, a) => frame.evaluate(fn, a);
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await frame.waitForTimeout(250); } };
const texts = () => js(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(p => p.GetText().replace(/[\r\n]+$/, "")));
const click = sel => js(s => { const el = $(s).find("button").addBack("button").first(); el.click(); return el.length; }, sel);
const fb = async () => (await frame.frameElement()).boundingBox();
// screen point of a document position (mm on a page)
const mmPt = async (x, y, pg = 0) => { const b = await fb(); return frame.evaluate(([x, y, pg, fx, fy]) => {
  const c = Asc.editor.WordControl.m_oLogicDocument.DrawingDocument.ConvertCoordsToCursorWR(x, y, pg);
  const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
  return { x: fx + sdk.left + c.X, y: fy + sdk.top + c.Y };
}, [x, y, pg, b.x, b.y]); };
const reopen = async file => { frame = await openEditor(page, { fileName: await upload(file, `wave2-${process.pid}-${Date.now().toString(36)}.docx`) }); };
const download = async (fn, file) => { const dl = page.waitForEvent("download", { timeout: 60000 }); await fn(); const d = await dl; await d.saveAs(file); return d; };
const xmlOf = file => execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 64 << 20 }).toString();

// ---------------------------------------------------------------- Show First Line Only
const BODY = "Body text that is long enough to wrap over several lines in the outline view. ".repeat(5);
await setDoc(frame, [{ text: "Chapter one", style: "Heading 1" }, BODY, { text: "Chapter two", style: "Heading 1" }, "Short body"]);
await js(() => Asc.editor.asc_SetWordView("outline"));
await frame.waitForTimeout(500);
const heights = () => js(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(p => Math.round((p.Pages[0].Bounds.Bottom - p.Pages[0].Bounds.Top) * 10) / 10));
const h0 = await heights();
await js(() => { const c = DE.getController("WordViews"); c.chkFirstLine.setValue(true); });
await frame.waitForTimeout(400);
const h1 = await heights();
record("firstline.checkbox", h1[1] < h0[1] / 2 && h1[1] <= h0[3] + 0.5 && h1[3] === h0[3], `body heights before ${JSON.stringify(h0)}, after ${JSON.stringify(h1)}`);
shots && await page.screenshot({ path: `${shots}/wave2-firstline.png` });
await caret(frame, 1, 0); await focusDoc(frame);
await press("Alt+Shift+l");
const h2 = await heights();
record("firstline.key-off", JSON.stringify(h2) === JSON.stringify(h0) && !(await js(() => $("#elx-outl-firstline input").prop("checked"))), `heights ${JSON.stringify(h2)}, expected ${JSON.stringify(h0)}`);
await js(() => Asc.editor.asc_SetWordView("print"));
await frame.waitForTimeout(300);

// ---------------------------------------------------------------- block selection
await resetUi(frame, page);
await setDoc(frame, ["alpha bravo charlie", "delta echo foxtrot", "golf hotel india"]);
await caret(frame, 0, 6); await focusDoc(frame);
await press("Control+Shift+F8", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown");
const blk = await js(() => Asc.editor.asc_GetBlockSelectionText());
record("block.keys", Array.isArray(blk) && blk.length === 3 && blk[0] === "bravo", `block ${JSON.stringify(blk)}`);
shots && await page.screenshot({ path: `${shots}/wave2-block.png` });
await press("Control+c");
const clip = await js(() => navigator.clipboard.readText().catch(e => "ERR " + e));
record("block.copy", clip === blk.join("\r\n") || clip === blk.join("\n"), `clipboard ${JSON.stringify(clip)}`);
await press("Control+b");
const bold = await js(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(p => p.Content.filter(r => r.Pr && r.Pr.Bold).map(r => r.GetText()).join("")));
record("block.bold", JSON.stringify(bold) === JSON.stringify(blk) && (await js(() => Asc.editor.asc_IsBlockSelection())), `bold runs ${JSON.stringify(bold)}, block ${JSON.stringify(blk)}`);
const before = await texts();
await press("Delete");
const del = await texts();
const want = before.map((t, i) => t.replace(blk[i], ""));
record("block.delete", JSON.stringify(del) === JSON.stringify(want), `after Delete ${JSON.stringify(del)}, expected ${JSON.stringify(want)}`);
await press("Control+z");
await press("Control+z");
record("block.undo", JSON.stringify(await texts()) === JSON.stringify(before), `after undo ${JSON.stringify(await texts())}`);
// Alt+drag from the start of line 1 to about 9 mm right on line 3
const geo = await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; const p0 = d.Content[0], p2 = d.Content[2];
  return { x: p0.Get_XYByContentPos(p0.Get_StartPos()).X, y0: p0.GetLineBounds(0).Top + 1, y1: p2.GetLineBounds(0).Bottom - 1 }; });
const a = await mmPt(geo.x + 0.3, geo.y0), b = await mmPt(geo.x + 9, geo.y1);
await page.keyboard.down("Alt");
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
await page.keyboard.up("Alt");
await frame.waitForTimeout(400);
const drag = await js(() => Asc.editor.asc_GetBlockSelectionText());
record("block.alt-drag", Array.isArray(drag) && drag.length === 3 && drag.every((t, i) => t.length >= 3 && before[i].startsWith(t)), `block ${JSON.stringify(drag)}`);
record("block.alt-no-keytips", (await js(() => $(".hint-div:visible").length)) === 0, "KeyTips shown after Alt+drag");
await press("Control+x");
const cut = await texts();
record("block.cut", Array.isArray(drag) && JSON.stringify(cut) === JSON.stringify(before.map((t, i) => t.slice(drag[i].length))), `after cut ${JSON.stringify(cut)}`);
await press("Control+z");
await caret(frame, 1, 2); await focusDoc(frame);
await press("Control+Shift+F8", "ArrowRight", "ArrowRight", "Escape");
record("block.escape", !(await js(() => Asc.editor.asc_IsBlockSelection())), "Esc did not end the block");
await press("Control+Shift+F8", "ArrowRight", "ArrowDown");
await page.keyboard.type("Z");
await frame.waitForTimeout(250);
const typed = await texts();
record("block.type-ends", !(await js(() => Asc.editor.asc_IsBlockSelection())) && typed[1] === "deZlta echo foxtrot" && typed[2] === before[2], `after typing ${JSON.stringify(typed)}`);

// ---------------------------------------------------------------- window split
await resetUi(frame, page);
const LONG = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} ` + "lorem ipsum dolor sit amet ".repeat(8));
await setDoc(frame, LONG);
await caret(frame, 0, 0); await focusDoc(frame);
await click("#slot-elx-view-split");
await frame.waitForTimeout(600);
const sp = () => js(() => ({ on: !!DE.getController("WordViews")._state.split, canvases: $("#elx-split-pane canvas.elx-split-page").length, sdk: $("#editor_sdk").height(), ct: $("#editor-container").height(), pressed: DE.getController("WordViews").btnSplit.pressed }));
let s = await sp();
record("split.button", s.on && s.canvases > 0 && s.pressed && s.sdk < s.ct * 0.7, JSON.stringify(s));
const topPage = await js(() => Asc.editor.getCurrentPage());
await js(() => $("#elx-split-pane").scrollTop(3000));
await frame.waitForTimeout(500);
const lowerPages = await js(() => $("#elx-split-pane canvas.elx-split-page").map(function () { return +$(this).attr("data-page"); }).get());
record("split.independent-scroll", (await js(() => Asc.editor.getCurrentPage())) === topPage && lowerPages.some(p => p >= 2), `upper page ${await js(() => Asc.editor.getCurrentPage())}, lower pages ${JSON.stringify(lowerPages)}`);
// a change in the upper pane is drawn in the lower one
await js(() => $("#elx-split-pane").scrollTop(0));
await frame.waitForTimeout(400);
const pix = () => js(() => { const c = $("#elx-split-pane canvas[data-page=0]")[0]; if (!c) return null; const d = c.getContext("2d").getImageData(0, 0, c.width, Math.round(c.height / 4)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; });
const p0 = await pix();
await page.keyboard.type("WWWWWWWWWW ");
await frame.waitForTimeout(1200);
const p1 = await pix();
record("split.live", p0 !== null && p1 > p0, `dark pixels before ${p0}, after ${p1}`);
shots && await page.screenshot({ path: `${shots}/wave2-split.png` });
// a click in the lower pane puts the cursor there
await js(() => { const g = DE.getController("WordViews").splitGeometry()[1]; g && $("#elx-split-pane").scrollTop(g.top + g.h * 0.4 - 100); });
await frame.waitForTimeout(400);
const t2 = await js(() => { const c = $("#elx-split-pane canvas[data-page=1]")[0]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.4 }; });
if (t2) { const f = await fb(); await page.mouse.click(f.x + t2.x, f.y + t2.y); await frame.waitForTimeout(500); }
const curPage = await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.Document_UpdateSelectionState(); return d.TargetPos ? d.TargetPos.PageNum : d.CurPage; });
record("split.click", t2 !== null && curPage === 1, `cursor on page ${curPage}`);
// drag the split bar
const bar = await js(() => { const r = $("#elx-split-bar")[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 3 }; });
const f2 = await fb();
await page.mouse.move(f2.x + bar.x, f2.y + bar.y); await page.mouse.down(); await page.mouse.move(f2.x + bar.x, f2.y + bar.y - 120, { steps: 5 }); await page.mouse.up();
await frame.waitForTimeout(400);
const s2 = await sp();
record("split.resize", s2.on && s2.sdk < s.sdk - 80, `upper pane ${s.sdk} -> ${s2.sdk}`);
await js(() => $("#elx-split-bar").trigger("dblclick"));
await frame.waitForTimeout(400);
s = await sp();
record("split.dblclick-removes", !s.on && s.sdk === s.ct && !s.pressed, JSON.stringify(s));

// ---------------------------------------------------------------- field lock saved in .docx
await reopen(path.join(WORK, "field-lock.docx"));
const locks = () => js(() => Asc.editor.WordControl.m_oLogicDocument.GetAllFields(false).map(f => f.IsLocked ? f.IsLocked() : null));
const lk = await locks();
record("fieldlock.open", JSON.stringify(lk.slice(0, 2)) === JSON.stringify([true, false]), `locks after opening ${JSON.stringify(lk)}`);
await js(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); d.UpdateFields(true); d.RemoveSelection(); });
await frame.waitForTimeout(500);
const tt = await texts();
const year = String(new Date().getFullYear());
record("fieldlock.f9-skips-locked", tt[0] === "Locked: 1999" && tt[1] === "Free: " + year, `after F9 ${JSON.stringify(tt)}`);
// lock the second field, save, reopen
await caret(frame, 1, 7); await focusDoc(frame);
await press("Control+F11");
const saved = path.join(WORK, "field-lock-saved.docx");
await download(() => js(() => Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.DOCX))), saved);
const xml = xmlOf(saved);
const nLock = (xml.match(/<w:fldChar\b[^>]*w:fldLock="(1|true|on)"/g) || []).length;
record("fieldlock.saved", nLock >= 2, `${nLock} locked fldChar in document.xml`);
await reopen(saved);
const lk2 = await locks();
record("fieldlock.reopened", lk2[0] === true && lk2[1] === true, `locks after reopening ${JSON.stringify(lk2)}`);

// ---------------------------------------------------------------- Mailings tab
frame = await openEditor(page);
await setDoc(frame, ["Dear , welcome to ."]);
const mm = () => js(() => DE.getController("WordMailings").getState());
const tabs = await js(() => $("#toolbar .ribtab:visible > a").map(function () { return $(this).attr("data-tab"); }).get());
record("mailings.tab", tabs.indexOf("mailings") === tabs.indexOf("links") + 1, `tabs ${JSON.stringify(tabs)}`);
record("mailings.disabled-without-list", await js(() => DE.getController("WordMailings").btnField.isDisabled() && DE.getController("WordMailings").btnPreview.isDisabled()), "Insert Merge Field or Preview enabled without recipients");
for (const [kind, file] of [["csv", "recipients.csv"], ["xlsx", "recipients.xlsx"]]) {
  await js(() => { DE.getController("WordMailings")._state.count = 0; });
  const fc = page.waitForEvent("filechooser", { timeout: 15000 });
  await js(() => { $("#toolbar a[data-tab=mailings]").click(); DE.getController("WordMailings").btnRecipients.menu.items[0].$el.find("a").click(); });
  await (await fc).setFiles(path.join(WORK, file));
  let st = await mm();
  for (let i = 0; i < 40 && !st.count; i++) { await frame.waitForTimeout(500); st = await mm(); }
  record("mailings.recipients-" + kind, st.count === 3 && JSON.stringify(st.fields) === JSON.stringify(["FirstName", "LastName", "City"]), JSON.stringify(st));
}
await caret(frame, 0, 5); await focusDoc(frame);
await js(() => { const c = DE.getController("WordMailings"); c.insertField("FirstName"); });
await caret(frame, 0, -1); await page.keyboard.press("ArrowLeft"); await focusDoc(frame);
await press("Alt+Shift+f");
const menu = await js(() => $("#elx-mm-field .dropdown-menu:visible li a").map(function () { return $(this).text(); }).get());
await press("ArrowDown", "ArrowDown", "Enter");
const withFields = (await texts())[0];
record("mailings.insert-field", JSON.stringify(menu) === JSON.stringify(["FirstName", "LastName", "City"]) && withFields === "Dear «FirstName», welcome to «City».", `menu ${JSON.stringify(menu)}, text ${JSON.stringify(withFields)}`);
await click("#elx-mm-highlight");
record("mailings.highlight", (await mm()).highlight === true, "Highlight Merge Fields not on");
await click("#elx-mm-preview");
await frame.waitForTimeout(400);
record("mailings.preview", (await texts())[0] === "Dear Ada, welcome to London.", `preview ${JSON.stringify((await texts())[0])}`);
await click("#elx-mm-next"); await frame.waitForTimeout(300);
const second = (await texts())[0];
await click("#elx-mm-last"); await frame.waitForTimeout(300);
const third = (await texts())[0];
await click("#elx-mm-prev"); await frame.waitForTimeout(300);
await click("#elx-mm-first"); await frame.waitForTimeout(300);
const first = (await texts())[0];
record("mailings.navigate", second === "Dear Alan, welcome to Manchester." && third === "Dear Grace, welcome to New York." && first === "Dear Ada, welcome to London.", JSON.stringify([second, third, first]));
record("mailings.preview-tab-usable", await js(() => !DE.getController("WordMailings").btnNext.isDisabled() && $("#toolbar .panel[data-tab=mailings]").css("z-index") === "1"), "the Mailings tab is masked in preview");
shots && await page.screenshot({ path: `${shots}/wave2-mailings.png` });
await press("Alt+Shift+k");
record("mailings.preview-off", (await texts())[0] === withFields && !(await mm()).preview, `after Alt+Shift+K ${JSON.stringify((await texts())[0])}`);
const merged = path.join(WORK, "merged.docx");
await download(() => js(() => DE.getController("WordMailings").finish("docx")), merged);
const mx = xmlOf(merged);
record("mailings.finish-docx", ["Ada", "Alan", "Grace"].every(n => mx.includes(n)) && (mx.match(/w:val="nextPage"/g) || []).length >= 2, "merged .docx without the three records");
const pdf = await download(() => js(() => DE.getController("WordMailings").finish("pdf")), path.join(WORK, "merged.pdf"));
record("mailings.finish-pdf", /\.pdf$/.test(pdf.suggestedFilename()) && fs.readFileSync(path.join(WORK, "merged.pdf")).slice(0, 4).toString() === "%PDF", pdf.suggestedFilename());
const dls = []; const onDl = d => dls.push(d); page.on("download", onDl);
await js(() => DE.getController("WordMailings").finish("pdf-each"));
for (let i = 0; i < 90 && dls.length < 3; i++) await frame.waitForTimeout(500);
page.off("download", onDl);
record("mailings.pdf-per-record", dls.length === 3 && dls.every(d => /\.pdf$/.test(d.suggestedFilename())), `${dls.length} downloads`);
// KeyTips: Alt, M
await resetUi(frame, page);
await page.keyboard.down("Alt"); await page.keyboard.up("Alt"); await frame.waitForTimeout(300);
await press("m");
const kt = await js(() => ({ tab: $("#toolbar .ribtab.active > a").attr("data-tab"), hints: Array.from(document.querySelectorAll(".hint-div")).filter(h => h.offsetParent !== null).map(h => h.textContent) }));
record("mailings.keytips", kt.tab === "mailings" && ["S", "I", "P"].every(t => kt.hints.includes(t)), JSON.stringify(kt));
await press("Escape", "Escape");

record("wave2.no-page-error", !errors.some(e => e.kind === "pageerror"), errors.filter(e => e.kind === "pageerror").map(e => e.text).join(" | ").slice(0, 400));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
const pass = results.filter(r => r.status === "pass").length;
console.log(`wave2: ${pass}/${results.length} pass`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
