#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Chart Design and Format contextual tabs (docs/ui.md, "Ribbon autonomy"): a chart is edited from the
// ribbon, the right panel only opens on "More Options" (Chart Styles launcher).
//   node tests/ribbon/chart-tabs.mjs [--out results.json] [--shots dir]      (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openEditor, setDoc, caret } from "../shortcuts/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(HERE, "results", "chart-tabs-latest.json");
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const { browser, page, errors } = await launch({});
const results = [];
const record = (id, ok, reason = "") => { results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : String(reason) }); console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : "  " + reason)); };
const frame = await openEditor(page, {});
const wait = ms => frame.waitForTimeout(ms);
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

const tabs = () => frame.evaluate(() => ({
  visible: $(".ribbon .tabs li:visible > a, #toolbar .tabs li:visible > a").toArray().map(a => a.getAttribute("data-tab")),
  active: $("#toolbar .tabs li.active > a").attr("data-tab"),
  rightPanel: $("#right-menu").is(":visible") && $("#right-menu").width() > 20
}));
const chart = () => frame.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument, all = d.GetAllDrawingObjects().filter(pd => pd.GraphicObj && pd.GraphicObj.getObjectType && pd.GraphicObj.getObjectType() === AscDFH.historyitem_type_ChartSpace);
  if (!all.length) return null;
  const sel = Asc.editor.getSelectedElements().map(e => e.get_ObjectValue()).find(v => v && v.get_ChartProperties && v.get_ChartProperties());
  return { n: all.length, w: +all[0].Extent.W.toFixed(1), h: +all[0].Extent.H.toFixed(1), type: sel ? sel.get_ChartProperties().getType() : null, style: sel ? sel.get_ChartProperties().getStyle() : null, wrap: sel ? sel.get_WrappingStyle() : null };
});
const click = async sel => { await frame.locator(sel).first().click(); await wait(500); };

await setDoc(frame, ["Sales report", "Quarterly figures are shown below.", ""]);
await caret(frame, 2, 0);
await frame.evaluate(() => Asc.editor.asc_addChartDrawingObject(Asc.c_oAscChartTypeSettings.barNormal, undefined, true));
await wait(1500);
// the chart editor (data sheet) opens on insertion, like Word opening the data in Excel: close it
const closeEditor = async () => {
  // let the chart editor finish loading before closing it
  await frame.waitForFunction(() => { const f = $("#id-external-diagram-editor iframe")[0]; try { const w = f && f.contentWindow; return !f || !!(w && w.SSE && w.Asc && w.Asc.editor && w.SSE.getController("Main") && w.SSE.getController("Main")._isDocReady !== false); } catch (e) { return true; } }, null, { timeout: 30000 }).catch(() => {});
  await wait(2000); await frame.evaluate(() => { const w = $("#id-external-diagram-editor:visible"); w.find(".tool.close").click(); }); await wait(1200); };
const editorOpen = () => frame.evaluate(() => $("#id-external-diagram-editor").is(":visible"));
record("chart.editorOnInsert", await editorOpen(), "");
await closeEditor();
let t = await tabs(), c = await chart();
record("chart.inserted", c && c.n === 1, JSON.stringify(c));
record("chart.tabsShown", t.visible.includes("chartdesign") && t.visible.includes("chartformat"), JSON.stringify(t.visible));
record("chart.designOpened", t.active === "chartdesign", t.active);
record("chart.noRightPanel", !t.rightPanel, JSON.stringify(t));
await shot("ribbon-ctx-chartdesign");

// Change Chart Type -> Line
await click("#elx-btn-cht-type button");
const items = await frame.locator("#elx-cht-type-menu .item").count();
record("chart.typePicker", items > 20, items);
const lineType = await frame.evaluate(() => Asc.c_oAscChartTypeSettings.lineNormal);
await frame.evaluate(t => { const ctl = DE.getController("ContextTabs"); const rec = ctl._chartTypePicker.store.findWhere({ type: t }); $("#" + rec.get("id")).click(); }, lineType);
await wait(1200);
c = await chart();
record("chart.typeChanged", c && c.type === lineType, JSON.stringify(c));

// Chart Styles gallery
const nStyles = await frame.evaluate(() => DE.getController("ContextTabs").view.chartStyles.menuPicker.store.length);
record("chart.styles", nStyles >= 6, nStyles);
const before = (await chart()).style;
await frame.locator("#elx-cht-styles .dataview .item").nth(2).click();
await wait(1000);
c = await chart();
record("chart.styleApplied", c && c.style !== before, JSON.stringify([before, c && c.style]));
// previews are images, not blank
const imgs = await frame.evaluate(() => $("#elx-cht-styles .dataview .item img").toArray().filter(i => (i.getAttribute("src") || "").startsWith("data:image")).length);
record("chart.stylePreviews", imgs >= 3, imgs);

// Format tab: size and position
await frame.evaluate(() => DE.getController("Toolbar").toolbar.setTab("chartformat"));
await wait(500);
await shot("ribbon-ctx-chartformat");
const spin = frame.locator("#elx-spin-cht-width input");
await spin.fill("10 cm"); await spin.press("Enter");
await wait(800);
c = await chart();
record("chart.width", c && Math.abs(c.w - 100) < 1, JSON.stringify(c));
await click("#elx-btn-cht-position button");
await frame.locator(".elx-position-menu:visible a").nth(3).click();
await wait(800);
c = await chart();
record("chart.position", c && c.wrap === 1, JSON.stringify(c));

// Edit Data opens the chart editor
await frame.evaluate(() => DE.getController("Toolbar").toolbar.setTab("chartdesign"));
await wait(300);
await click("#elx-btn-cht-editdata button");
await wait(2500);
record("chart.editData", await editorOpen(), "");
await closeEditor();

// More Options: the Chart Styles launcher opens the right panel on the chart settings
await frame.evaluate(() => DE.getController("ContextTabs").onGroupLauncher("chartstyles"));
await wait(800);
t = await tabs();
record("chart.moreOptions", t.rightPanel && await frame.locator("#id-chart-settings").isVisible(), JSON.stringify(t));
await frame.evaluate(() => { const rm = DE.getController("RightMenu"); rm.rightmenu && rm.rightmenu.hide && 0; });

// leaving the chart hides the tabs and returns to the previous tab
await caret(frame, 0, 0);
await wait(800);
t = await tabs();
record("chart.tabsHidden", !t.visible.includes("chartdesign") && !t.visible.includes("chartformat") && t.active !== "chartdesign", JSON.stringify(t));

// known, also on elixir/dev before this work: the chart editor's embedded spreadsheet requests
// spreadsheeteditor/main/{api,jquery,sdk}.js (404) and logs three requirejs script errors
const KNOWN = /Failed to load resource|Script error for "(api|jquery|sdk)", needed by: app/;
const errs = errors.filter(e => !KNOWN.test(e.text || ""));
record("chart.noErrors", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), base: process.env.EO_BASE, results }, null, 2));
const pass = results.filter(r => r.status === "pass").length;
console.log(`results: ${pass}/${results.length} pass`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
