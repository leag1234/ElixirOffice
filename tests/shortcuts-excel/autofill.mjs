#!/usr/bin/env node
// Auto Fill Options (Microsoft Excel): the button after a fill handle drag and its five options.
//   node tests/shortcuts-excel/autofill.mjs [--platform win|mac] [--out results.json]   (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, resetBook, select, cmd, focusGrid, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const platform = opt("--platform", "win");
const outFile = opt("--out", path.join(HERE, "results", `autofill-${platform}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const mac = platform === "mac";

const s = await launch({ platform });
const { page, errors } = s;
const frame = await openEditor(page);
const wait = ms => frame.waitForTimeout(ms);
const js = (fn, arg) => frame.evaluate(fn, arg);
const results = [];
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

async function test(id, fn) {
  let res;
  try { await resetBook(frame); res = await fn(); } catch (e) { res = "error: " + String(e).slice(0, 300); }
  const ok = res === true;
  results.push({ id, platform, status: ok ? "pass" : "fail", reason: ok ? "" : String(res) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${platform} ${id}${ok ? "" : "  " + res}`);
}
const cell = a => js(a => Asc.editor.wb.getWorksheet().model.getRange2(a).getValueWithFormat(), a);
const cells = async list => Promise.all(list.map(cell));
const bold = a => js(a => !!Asc.editor.wb.getWorksheet().model.getRange2(a).getFont().getBold(), a);
const setValues = src => cmd(frame, `(function(){ var s = Api.GetActiveSheet(); ${src} })()`);
const visible = sel => js(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"), sel);
const info = () => js(() => Asc.editor.asc_getAutoFillOptionsInfo());
const btn = "#autofill-options-container";

// Drag the fill handle of the selection down to the cell `toCell` ("D6") with the real mouse
async function dragFill(sel, toCell, horizontal) {
  const vertical = !horizontal;
  await select(frame, sel); await wait(200);
  const p = await js(([toCell, vertical]) => {
    const ws = Asc.editor.wb.getWorksheet(), r = ws.model.selectionRange.getLast();
    const parse = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { r: +m[2] - 1, c: c - 1 }; };
    const t = parse(toCell); // the pointer goes one cell past the last cell to fill
    if (vertical) t.r++; else t.c++;
    const from = ws.getCellCoord(r.c2, r.r2), to = ws.getCellCoord(t.c, t.r);
    const o = document.getElementById("ws-canvas-outer").getBoundingClientRect();
    return { x0: o.left + from.asc_getX() + from.asc_getWidth() - 1, y0: o.top + from.asc_getY() + from.asc_getHeight() - 1, x1: o.left + to.asc_getX() + to.asc_getWidth() / 2, y1: o.top + to.asc_getY() + to.asc_getHeight() / 2 };
  }, [toCell, vertical]);
  const fb = await (await frame.frameElement()).boundingBox();
  const X = x => fb.x + x, Y = y => fb.y + y;
  await page.mouse.move(X(p.x0), Y(p.y0)); await wait(150);
  await page.mouse.down(); await wait(100);
  await page.mouse.move(X((p.x0 + p.x1) / 2), Y((p.y0 + p.y1) / 2), { steps: 4 });
  await page.mouse.move(X(p.x1), Y(p.y1), { steps: 6 }); await wait(100);
  await page.mouse.up(); await wait(500);
}
const choose = async (value) => { await js(v => Asc.editor.asc_ApplyAutoFillOption(v), value); await wait(500); };
const FT = { copy: 0, series: 1, format: 2, noformat: 3, flash: 10 };

await test("autofill.button-after-drag", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D6");
  const vals = await cells(["D3", "D4", "D5", "D6"]);
  const i = await info();
  return eq([vals, !!i, i && i.selected, await visible(btn)], [["3", "4", "5", "6"], true, FT.series, true], "values, info, selected, visible");
});
await test("autofill.button-hidden-on-other-selection", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D5");
  const shown = await visible(btn);
  await select(frame, "H10"); await wait(400);
  return eq([shown, await visible(btn), await info()], [true, false, null], "shown, hidden, info");
});
await test("autofill.no-button-without-fill", async () => {
  await setValues(`s.GetRange("D1").SetValue(1);`);
  await select(frame, "D1:D2"); await wait(300);
  return eq([await visible(btn), await info()], [false, null], "visible, info");
});
await test("autofill.copy-cells", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D6"); await choose(FT.copy);
  return eq([await cells(["D3", "D4", "D5", "D6"]), (await info()).selected], [["1", "2", "1", "2"], FT.copy], "values, selected");
});
await test("autofill.single-number-copies-then-series", async () => {
  await setValues(`s.GetRange("D1").SetValue(5);`);
  await dragFill("D1", "D4");
  const first = [await cells(["D2", "D3", "D4"]), (await info()).selected];
  await choose(FT.series);
  return eq([first, await cells(["D2", "D3", "D4"])], [[["5", "5", "5"], FT.copy], ["6", "7", "8"]], "default copy, then series");
});
await test("autofill.fill-formatting-only", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2); s.GetRange("D1:D2").SetBold(true);`);
  await dragFill("D1:D2", "D5"); await choose(FT.format);
  return eq([await cells(["D3", "D4", "D5"]), await bold("D3"), await bold("D5"), await cell("D1")], [["", "", ""], true, true, "1"], "target values, bold D3, bold D5, source kept");
});
await test("autofill.fill-without-formatting", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2); s.GetRange("D1:D2").SetBold(true);`);
  await dragFill("D1:D2", "D5");
  const before = await bold("D3");
  await choose(FT.noformat);
  return eq([before, await cells(["D3", "D4", "D5"]), await bold("D3"), await bold("D2")], [true, ["3", "4", "5"], false, true], "bold D3 before, values, bold D3 after, source bold");
});
await test("autofill.flash-fill", async () => {
  await setValues(`s.GetRange("D1").SetValue("John Smith"); s.GetRange("D2").SetValue("Mary Jones"); s.GetRange("D3").SetValue("Peter Brown"); s.GetRange("E1").SetValue("John");`);
  await dragFill("E1", "E3");
  const i1 = await info();
  await choose(FT.flash);
  return eq([i1 && i1.flash, await cells(["E1", "E2", "E3"]), (await info()).selected], [true, ["John", "Mary", "Peter"], FT.flash], "flash offered, values, selected");
});
await test("autofill.flash-fill-not-offered-for-rows", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("E1").SetValue(2);`);
  await dragFill("D1:E1", "F1", true);
  const i = await info();
  return eq([!!i, i && i.flash], [true, false], "info, flash");
});
await test("autofill.option-is-one-undo-step", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D5"); await choose(FT.copy);
  await js(() => Asc.editor.asc_Undo()); await wait(300);
  return eq(await cells(["D1", "D2", "D3", "D4", "D5"]), ["1", "2", "", "", ""], "one undo removes the whole fill");
});
await test("autofill.menu-radio", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D5");
  const m = await js(() => { const c = SSE.getController("ExcelShortcuts"); return c.afMenu.items.map(i => [i.options.caption, !!i.isChecked(), !!i.options.disabled]); });
  await js(() => $("#autofill-options-container button").first().click()); await wait(300);
  const open = await js(() => SSE.getController("ExcelShortcuts").afMenu.isVisible());
  await page.keyboard.press("Escape");
  return eq([m, open], [[["Copy Cells", false, false], ["Fill Series", true, false], ["Fill Formatting Only", false, false], ["Fill Without Formatting", false, false], ["Flash Fill", false, false]], true], "menu items (caption, checked, disabled), menu opens");
});
await test("autofill.quick-analysis-hidden", async () => {
  await setValues(`s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2);`);
  await dragFill("D1:D2", "D5");
  return eq([await visible(btn), await visible("#quick-analysis-container")], [true, false], "auto fill button, quick analysis button");
});
await test("autofill.fill-down-has-no-button", async () => {
  await setValues(`s.GetRange("D1").SetValue(1);`);
  await select(frame, "D1:D4"); await page.keyboard.press(mac ? "Meta+d" : "Control+d"); await wait(400);
  return eq([await cells(["D2", "D4"]), await visible(btn)], [["1", "1"], false], "values, button");
});

const failed = results.filter(r => r.status !== "pass").length;
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), platform, errors, results }, null, 1));
console.log(`\n${results.length - failed}/${results.length} passed${errors.length ? ", page errors: " + errors.length : ""}`);
await s.browser.close();
process.exit(failed ? 1 : 0);
