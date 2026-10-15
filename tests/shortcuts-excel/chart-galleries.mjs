#!/usr/bin/env node
// Insert > Charts: one gallery per family of chart types (Column or Bar, Line or Area, Pie, Scatter, Stock or Radar, Combo).
//   node tests/shortcuts-excel/chart-galleries.mjs [--platform win|mac] [--out results.json]   (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, resetBook, select, cmd, state, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const platform = opt("--platform", "win");
const outFile = opt("--out", path.join(HERE, "results", `chart-galleries-${platform}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const s = await launch({ platform });
const { page, errors } = s;
const frame = await openEditor(page);
const wait = ms => frame.waitForTimeout(ms);
const js = (fn, arg) => frame.evaluate(fn, arg);
const results = [];
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

async function test(id, fn) {
  let res;
  try {
    await resetBook(frame);
    // charts of a previous test are undone by resetBook; make sure the Insert tab is the current one
    await js(() => $('.ribtab > a[data-tab="ins"]').click());
    res = await fn();
  } catch (e) { res = "error: " + String(e).slice(0, 300); }
  try { await page.keyboard.press("Escape"); } catch (e) {}
  const ok = res === true;
  results.push({ id, platform, status: ok ? "pass" : "fail", reason: ok ? "" : String(res) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${platform} ${id}${ok ? "" : "  " + res}`);
}
const setValues = src => cmd(frame, `(function(){ var s = Api.GetActiveSheet(); ${src} })()`);
const NUM = `for (var r = 1; r <= 5; r++) { s.GetRange("D" + r).SetValue(r); s.GetRange("E" + r).SetValue(r * r); s.GetRange("F" + r).SetValue(r + 10); }`;
const visible = sel => js(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"), sel);
const KEYS = ["column", "line", "pie", "scatter", "stock", "combo"];
const open = async key => { await js(k => $(`#id-toolbar-btn-elx-chart-${k} button`).first().click(), key); await wait(500); };
const items = async key => js(k => $(`#id-elx-chart-gallery-${k} .item`).length, key);
const headers = async key => js(k => $(`#id-elx-chart-gallery-${k} .group-description, #id-elx-chart-gallery-${k} .group-name, #id-elx-chart-gallery-${k} .group-items-container`).length ? $(`#id-elx-chart-gallery-${k}`).text().replace(/\s+/g, " ").trim() : "", key);
// click the n-th preview of a gallery, return the type of the inserted chart and the number of drawings
async function pick(key, n) {
  await open(key);
  await frame.locator(`#id-elx-chart-gallery-${key} .item`).nth(n).click();
  await wait(900);
  return js(() => {
    const api = Asc.editor, c = api.wb.getWorksheet().objectRender.controller;
    let type = null;
    try { type = api.asc_getChartSettings(true).getType(); } catch (e) {}
    return { drawings: c.getDrawingObjects().length, type };
  });
}
const TYPES = await js(() => ({ ...Asc.c_oAscChartTypeSettings }));
const T = n => TYPES[n];

await test("charts.buttons-in-insert-tab", async () => {
  const v = await Promise.all(KEYS.map(k => visible(`#id-toolbar-btn-elx-chart-${k}`)));
  const tips = await js(() => ["column", "line", "pie", "scatter", "stock", "combo"].map(k => $(`#id-toolbar-btn-elx-chart-${k} button`).attr("aria-label")));
  return eq([v, tips], [KEYS.map(() => true), ["Insert Column or Bar Chart", "Insert Line or Area Chart", "Insert Pie or Doughnut Chart", "Insert Scatter (X, Y) Chart", "Insert Stock or Radar Chart", "Insert Combo Chart"]], "visible, tips");
});
await test("charts.recommended-and-all-kept", async () => {
  return eq([await visible("#slot-btn-insrecommend button"), await visible("#slot-btn-inschart button")], [true, true], "Recommended Charts, Chart");
});
await test("charts.column-gallery-sections", async () => {
  await open("column");
  const n = await items("column"), text = await headers("column");
  return eq([n, /Column/.test(text) && /Bar/.test(text), await visible(".menu-insertchart")], [13, true, true], "previews, section names, open");
});
await test("charts.line-gallery-sections", async () => {
  await open("line");
  const n = await items("line"), text = await headers("line");
  return eq([n, /Line/.test(text) && /Area/.test(text)], [10, true], "previews, section names");
});
await test("charts.pie-gallery", async () => { await open("pie"); return eq(await items("pie"), 3, "previews"); });
await test("charts.scatter-gallery", async () => { await open("scatter"); return eq(await items("scatter"), 5, "previews"); });
await test("charts.stock-gallery", async () => { await open("stock"); return eq(await items("stock"), 4, "previews (stock, radar x3)"); });
await test("charts.combo-gallery", async () => { await open("combo"); return eq(await items("combo"), 4, "previews"); });
await test("charts.insert-clustered-column", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  const r = await pick("column", 0);
  return eq([r.drawings, r.type], [1, T("barNormal")], "drawings, type");
});
await test("charts.insert-bar-100-percent", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  const r = await pick("column", 9); // the Bar section follows the 7 columns: clustered, stacked, 100 % stacked
  return eq([r.drawings, r.type], [1, T("hBarStackedPer")], "drawings, type");
});
await test("charts.insert-line-with-markers", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  const r = await pick("line", 3);
  return eq([r.drawings, r.type], [1, T("lineNormalMarker")], "drawings, type");
});
await test("charts.insert-area", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  const r = await pick("line", 7);
  return eq([r.drawings, r.type], [1, T("areaNormal")], "drawings, type");
});
await test("charts.insert-pie", async () => {
  await setValues(NUM); await select(frame, "D1:D5");
  const r = await pick("pie", 0);
  return eq([r.drawings, r.type], [1, T("pie")], "drawings, type");
});
await test("charts.insert-doughnut", async () => {
  await setValues(NUM); await select(frame, "D1:D5");
  const r = await pick("pie", 1);
  return eq([r.drawings, r.type], [1, T("doughnut")], "drawings, type");
});
await test("charts.insert-scatter", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  const r = await pick("scatter", 0);
  return eq([r.drawings, r.type], [1, T("scatter")], "drawings, type");
});
await test("charts.insert-radar", async () => {
  await setValues(NUM); await select(frame, "D1:F5");
  const r = await pick("stock", 1);
  return eq([r.drawings, r.type], [1, T("radar")], "drawings, type");
});
await test("charts.insert-combo", async () => {
  await setValues(NUM); await select(frame, "D1:F5");
  const r = await pick("combo", 0);
  return eq([r.drawings, r.type], [1, T("comboBarLine")], "drawings, type");
});
await test("charts.all-charts-opens-dialog", async () => {
  await setValues(NUM); await select(frame, "D1:E5");
  await open("column");
  await js(() => $("#id-toolbar-btn-elx-chart-column .dropdown-menu a:contains('All Charts')").click()); await wait(1000);
  const w = await js(() => Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length).map(w => (w.querySelector(".title") || w).textContent.trim()));
  await js(() => $(".asc-window:visible .dlg-btn[result=cancel], .asc-window:visible .tool.close").first().click());
  return w.length >= 1 ? true : "no dialog: " + JSON.stringify(w);
});
await test("charts.disabled-while-editing-cell", async () => {
  await select(frame, "D1"); await js(() => Asc.editor.wb._onEditCell && Asc.editor.asc_startEditCurrentCell && 0); await page.keyboard.press("F2"); await wait(300);
  const dis = await js(() => $("#id-toolbar-btn-elx-chart-column").hasClass("disabled") || $("#id-toolbar-btn-elx-chart-column button").prop("disabled"));
  await page.keyboard.press("Escape");
  return dis ? true : "gallery button enabled while a cell is edited";
});

const failed = results.filter(r => r.status !== "pass").length;
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), platform, errors, results }, null, 1));
console.log(`\n${results.length - failed}/${results.length} passed${errors.length ? ", page errors: " + errors.length : ""}`);
await s.browser.close();
process.exit(failed ? 1 : 0);
