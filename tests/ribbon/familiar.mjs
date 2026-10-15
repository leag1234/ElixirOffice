#!/usr/bin/env node
// "Familiar to a Word user" additions (docs/ui.md, "Familiar ground"): mini toolbar in a table cell (borders, shading,
// Insert, Delete, New comment), status bar (word count with a selection, Display Settings), AutoSave switch of the title bar,
// French Home group names. English and French interface.
//   node tests/ribbon/familiar.mjs [--out results.json] [--shots dir]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret, select, focusDoc } from "../shortcuts/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => args.includes(k) ? args[args.indexOf(k) + 1] : null;
const outFile = opt("--out") || path.join(HERE, "results", "familiar-latest.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };

for (const lang of ["en", "fr"]) {
  const { browser, page, errors } = await launch({ w: 1930, h: 1040, lang });
  const frame = await openEditor(page, { lang });
  const wait = ms => frame.waitForTimeout(ms);
  const frameBox = await (await frame.frameElement()).boundingBox();
  const tag = id => `${lang}.${id}`;
  await setDoc(frame, [{ table: [["A1", "B1"], ["A2", "B2"]] }, "Paragraph one has several words in it.", "Second paragraph."]);
  await wait(500);

  // ---- mini toolbar above a table cell --------------------------------------------------------
  const cellPoint = () => frame.evaluate(([fx, fy]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    d.MoveCursorToStartPos(false); d.UpdateSelection(); d.Document_UpdateSelectionState();
    const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
    const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
    return { x: fx + sdk.left + c.X + 20, y: fy + sdk.top + c.Y + 6 };
  }, [frameBox.x, frameBox.y]);
  const tableInfo = () => frame.evaluate(() => {
    const t = Asc.editor.WordControl.m_oLogicDocument.Content.find(e => e.IsTable && e.IsTable());
    if (!t) return null;
    const c = t.Content[0].Content[0];
    return { rows: t.Content.length, cols: t.Content[0].Content.length, shd: c.Pr && c.Pr.Shd ? (c.Pr.Shd.Fill ? JSON.stringify(c.Pr.Shd.Fill) : c.Pr.Shd.Unifill ? "unifill" : "none") : null, bottom: c.Pr && c.Pr.TableCellBorders && c.Pr.TableCellBorders.Bottom ? c.Pr.TableCellBorders.Bottom.Value : null };
  });
  const miniState = () => frame.evaluate(() => {
    const el = document.getElementById("mini-toolbar"); if (!el) return null;
    const vis = s => { const e = el.querySelector(s); return !!e && e.getClientRects().length > 0; };
    const ids = row => [...el.querySelectorAll("#" + row + " > .mini-slot")].filter(e => e.getClientRects().length).map(e => e.id.replace("mini-", ""));
    return { visible: el.classList.contains("visible"), table: el.classList.contains("mini-table"), borders: vis("#mini-borders"), shading: vis("#mini-shading"), insert: vis("#mini-insert"), del: vis("#mini-delete"), tcomment: vis("#mini-tcomment"), comment: vis("#mini-comment"), row1: ids("mini-row1").filter(i => i !== "elixir"), row2: ids("mini-row2") };
  });
  const rightClick = async p => { await page.mouse.click(p.x, p.y, { button: "right" }); await wait(700); };
  const clickMini = async sel => { await page.locator("#mini-toolbar " + sel).first().click().catch(async () => { await frame.locator("#mini-toolbar " + sel).first().click(); }); await wait(400); };
  const miniFrame = () => frame; // the mini toolbar lives in the editor frame
  let p = await cellPoint();
  await rightClick(p);
  let m = await miniState();
  record(tag("mini.table.visible"), !!m && m.visible && m.table, JSON.stringify(m));
  record(tag("mini.table.controls"), !!m && m.borders && m.shading && m.insert && m.del && m.tcomment && !m.comment, JSON.stringify(m));
  record(tag("mini.table.order"), !!m && m.row1.join() === "font-name,font-size,grow,shrink,bullets,numbering,styles" && m.row2.join() === "bold,italic,underline,highlight,fontcolor,painter,borders,shading", m && (m.row1.join() + " | " + m.row2.join()));
  await frame.locator("#mini-toolbar #mini-insert button").first().click(); await wait(400);
  const insItems = await frame.evaluate(() => [...document.querySelectorAll(".dropdown-menu.show li a, .dropdown-menu li a")].filter(a => a.getClientRects().length).map(a => a.textContent.trim()).filter(Boolean));
  record(tag("mini.insert.menu"), insItems.length >= 4, JSON.stringify(insItems));
  // Insert below
  await frame.evaluate(() => { const b = document.querySelector("#mini-insert button"); });
  const before = await tableInfo();
  await frame.locator(".dropdown-menu:visible li a", { hasText: /^(Insert Below|Insérer en dessous)/ }).first().click(); await wait(600);
  let after = await tableInfo();
  record(tag("mini.insert.below"), before && after && after.rows === before.rows + 1, JSON.stringify([before, after]));
  // Delete rows
  p = await cellPoint(); await rightClick(p);
  await frame.locator("#mini-toolbar #mini-delete button").first().click(); await wait(400);
  await frame.locator(".dropdown-menu:visible li a", { hasText: /^(Delete Rows|Supprimer les lignes)/ }).first().click(); await wait(600);
  after = await tableInfo();
  record(tag("mini.delete.rows"), after && after.rows === before.rows, JSON.stringify(after));
  // Shading
  p = await cellPoint(); await rightClick(p);
  await frame.locator("#mini-toolbar #mini-shading .arrow, #mini-toolbar #mini-shading .inner-box-caret, #mini-toolbar #mini-shading .caret").first().click({ force: true }); await wait(500);
  await frame.locator(".dropdown-menu:visible .theme-colors .color-item, .dropdown-menu:visible .palette-color, .dropdown-menu:visible .standard-colors .color-item").nth(4).click(); await wait(600);
  after = await tableInfo();
  record(tag("mini.shading"), after && after.shd !== null && after.shd !== "none", JSON.stringify(after));
  // Borders (menu: bottom border)
  p = await cellPoint(); await rightClick(p);
  await frame.locator("#mini-toolbar #mini-borders .arrow, #mini-toolbar #mini-borders .inner-box-caret, #mini-toolbar #mini-borders .caret").first().click({ force: true }); await wait(500);
  const bItems = await frame.evaluate(() => [...document.querySelectorAll(".dropdown-menu li a")].filter(a => a.getClientRects().length).map(a => a.textContent.trim()).filter(Boolean));
  record(tag("mini.borders.menu"), bItems.length >= 10, JSON.stringify(bItems));
  await page.keyboard.press("Escape"); await wait(300);
  // New comment (tall button)
  p = await cellPoint(); await rightClick(p);
  await frame.locator("#mini-toolbar #mini-tcomment button").first().click(); await wait(800);
  const dlg = await frame.evaluate(() => !!document.querySelector(".asc-window.modal:not([style*='display: none']), #id-comments-dialog, .comments-dialog, .asc-window") );
  record(tag("mini.table.comment"), dlg, "no comment window");
  await page.keyboard.press("Escape"); await wait(300);
  // text mode keeps the previous layout
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToEndPos(false); d.UpdateSelection(); });
  const ptxt = await frame.evaluate(([fx, fy]) => {
    const d = Asc.editor.WordControl.m_oLogicDocument; d.Document_UpdateSelectionState();
    const t = d.TargetPos, c = d.DrawingDocument.ConvertCoordsToCursorWR(t.X, t.Y, t.PageNum);
    const sdk = document.getElementById("editor_sdk").getBoundingClientRect();
    return { x: fx + sdk.left + c.X - 10, y: fy + sdk.top + c.Y + 6 };
  }, [frameBox.x, frameBox.y]);
  await page.keyboard.press("Escape");
  await rightClick(ptxt);
  m = await miniState();
  record(tag("mini.text.layout"), !!m && m.visible && !m.table && !m.borders && !m.insert && m.comment, JSON.stringify(m));
  await page.keyboard.press("Escape"); await wait(300);

  // ---- status bar -------------------------------------------------------------------------------
  await wait(2500);
  const cap = () => frame.evaluate(() => { const b = document.querySelector("#slot-status-btn-info button .caption"); return b ? b.textContent.trim() : null; });
  const total = await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); const t = d.GetSelectedText(false, { NewLine: true, NewLineParagraph: true }); d.RemoveSelection(); return (t.match(/\S+/g) || []).length; });
  const plain = await cap();
  record(tag("status.words"), /\d/.test(plain || ""), plain);
  await select(frame, 1, 0, 13); await wait(900);
  const sel = await cap();
  record(tag("status.words.selection"), /^2\D+\d+\D/.test(sel || "") && (sel || "").includes(String(total)), `${sel} (total ${total})`);
  await caret(frame, 1, 2); await wait(2500);
  record(tag("status.words.back"), /^\d/.test((await cap()) || "") && !/ (of|sur|von|de) /.test(await cap()), await cap());
  // Display Settings
  await frame.locator("#slot-status-btn-display button").first().click(); await wait(400);
  const dsItems = await frame.evaluate(() => [...document.querySelectorAll(".dropdown-menu li a")].filter(a => a.getClientRects().length).map(a => a.textContent.trim()));
  record(tag("status.display.menu"), dsItems.length === 2, JSON.stringify(dsItems));
  const rulerBefore = await frame.evaluate(() => Common.Utils.InternalSettings.get("de-hidden-rulers"));
  await frame.locator(".dropdown-menu:visible li a").first().click(); await wait(600);
  const rulerAfter = await frame.evaluate(() => Common.Utils.InternalSettings.get("de-hidden-rulers"));
  record(tag("status.display.ruler"), !!rulerBefore !== !!rulerAfter, `${rulerBefore} -> ${rulerAfter}`);
  await frame.locator("#slot-status-btn-display button").first().click(); await wait(400);
  await frame.locator(".dropdown-menu:visible li a").first().click(); await wait(600); // back

  // ---- title bar: AutoSave ----------------------------------------------------------------------
  const sw = frame.locator(".elx-autosave .elx-switch");
  record(tag("title.autosave.present"), (await sw.count()) === 1, "no switch");
  const label = await frame.locator(".elx-autosave-label").textContent();
  record(tag("title.autosave.label"), label === (lang === "fr" ? "Enregistrement automatique" : "AutoSave"), label);
  const on0 = await sw.getAttribute("aria-checked");
  const disabled = await sw.isDisabled();
  if (!disabled) {
    await sw.click(); await wait(500);
    const on1 = await sw.getAttribute("aria-checked");
    const store = await frame.evaluate(() => [Common.Utils.InternalSettings.get("de-settings-autosave"), Common.localStorage.getItem("de-settings-autosave")]);
    record(tag("title.autosave.toggle"), on0 !== on1 && (on1 === "true" ? store[0] === 1 : store[0] === 0), JSON.stringify([on0, on1, store]));
    await sw.click(); await wait(400);
    record(tag("title.autosave.back"), (await sw.getAttribute("aria-checked")) === on0, "");
  } else record(tag("title.autosave.fixed"), on0 === "true" && !!(await frame.locator(".elx-autosave").getAttribute("title")), "disabled switch must be on, with a tip");

  // ---- French group names -----------------------------------------------------------------------
  const groups = await frame.evaluate(() => [...document.querySelectorAll("#toolbar .group-name, .elx-group-label, #toolbar [class*=group] .elx-group-title")].map(e => e.textContent.trim()));
  if (lang === "fr") {
    const bodyText = await frame.evaluate(() => document.getElementById("toolbar").innerText);
    record(tag("home.group.edition"), /(^|\n)\s*Édition\s*($|\n)/.test(bodyText) || (await frame.evaluate(() => DE.Views.Toolbar.prototype.txtGroupEditing)) === "Édition", await frame.evaluate(() => DE.Views.Toolbar.prototype.txtGroupEditing));
  }
  record(tag("no.page.errors"), errors.filter(e => e.kind === "pageerror").length === 0, JSON.stringify(errors.slice(0, 3)));
  await browser.close();
}
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
const failed = results.filter(r => r.status !== "pass").length;
console.log(`results: ${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
