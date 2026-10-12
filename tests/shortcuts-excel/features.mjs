#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Excel features behind the keyboard: Repeat (F4, Ctrl+Y), End / Extend / Add modes, Flash Fill
// (Ctrl+E) patterns, Quick Analysis (button and Ctrl+Q: formatting, charts, totals).
//   node tests/shortcuts-excel/features.mjs [--platform win|mac] [--out results.json]   (EO_BASE=http://host:port)
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, resetBook, select, state, cmd, focusGrid, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const platform = opt("--platform", "win");
const outFile = opt("--out", path.join(HERE, "results", `features-${platform}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const mac = platform === "mac";

const s = await launch({ platform });
const { page, errors } = s;
const frame = await openEditor(page);
const wait = ms => frame.waitForTimeout(ms);
const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await wait(120); } };
const js = (fn, arg) => frame.evaluate(fn, arg);
const results = [];
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${what}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

async function test(id, fn) {
  let res;
  try {
    await resetBook(frame);
    res = await fn();
  } catch (e) {
    res = "error: " + String(e).slice(0, 300);
  }
  const ok = res === true;
  results.push({ id, platform, status: ok ? "pass" : "fail", reason: ok ? "" : String(res) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${platform} ${id}${ok ? "" : "  " + res}`);
}
const cell = addr => js(a => Asc.editor.wb.getWorksheet().model.getRange2(a).getValueWithFormat(), addr);
const formula = addr => js(a => { const r = Asc.editor.wb.getWorksheet().model.getRange2(a); return r.getFormula ? r.getFormula() : ""; }, addr);
const bold = addr => js(a => !!Asc.editor.wb.getWorksheet().model.getRange2(a).getFont().getBold(), addr);
const setValues = src => cmd(frame, `(function(){ var s = Api.GetActiveSheet(); ${src} })()`);
const visible = sel => js(sel => Array.from(document.querySelectorAll(sel)).some(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"), sel);
const ctrl = mac ? "Meta" : "Control";

// ---- Repeat ------------------------------------------------------------------------------------
await test("repeat.bold-f4", async () => {
  await press(`${ctrl}+b`); await select(frame, "A3"); await press("F4");
  return (await bold("A3")) ? true : "A3 not bold after F4";
});
await test("repeat.bold-stays-on", async () => {
  // a repeat applies the value the command set, it does not toggle: F4 on a bold cell keeps it bold
  await select(frame, "A2"); await press(`${ctrl}+b`); await select(frame, "A2"); await press("F4");
  return (await bold("A2")) ? true : "A2 lost its bold";
});
await test("repeat.ctrl-y", async () => {
  await press(`${ctrl}+i`); await select(frame, "B2"); await press(`${ctrl}+y`);
  return eq(await js(() => !!Asc.editor.wb.getWorksheet().model.getRange2("B2").getFont().getItalic()), true, "B2 italic");
});
await test("repeat.insert-row", async () => {
  await select(frame, "A2");
  await js(() => Asc.editor.asc_insertCells(Asc.c_oAscInsertOptions.InsertRows));
  await wait(300); await select(frame, "A5"); await press("F4"); await wait(300);
  // A1 = 10, a row inserted at A2 (20 to A3, 40 to A5), then the repeat at A5 (40 to A6)
  const got = [await cell("A3"), await cell("A5"), await cell("A6")];
  return eq(got, ["20", "", "40"], "A3, A5, A6");
});
await test("repeat.undo-one-step", async () => {
  await press(`${ctrl}+b`); await select(frame, "A2:A3"); await press("F4"); await press(`${ctrl}+z`);
  return eq([await bold("A1"), await bold("A2")], [true, false], "A1, A2 bold after undoing the repeat");
});

// ---- End, Extend and Add modes --------------------------------------------------------------------
if (!mac) {
  await test("end-mode.home", async () => {
    await press("End", "Home");
    return eq((await state(frame)).activeAddr, "B6", "active cell (last cell of the sheet)") === true || (await state(frame)).activeAddr === "A6" ? true : `active ${(await state(frame)).activeAddr}`;
  });
  await test("end-mode.shift", async () => {
    await press("End", "Shift+ArrowDown");
    return eq((await state(frame)).ranges, [[0, 0, 5, 0]], "selection");
  });
}
await test("extend-mode.escape", async () => {
  await press("F8", "Escape", "ArrowDown");
  return eq((await state(frame)).ranges, [[1, 0, 1, 0]], "selection after Esc and an arrow");
});
await test("add-mode.event", async () => {
  await js(() => { window.__kbMode = []; Asc.editor.asc_registerCallback("asc_onKeyboardSelectionMode", m => window.__kbMode.push(m)); });
  await press("Shift+F8", "Shift+F8", "F8", "F8");
  return eq(await js(() => window.__kbMode), ["add", "", "extend", ""], "asc_onKeyboardSelectionMode");
});

// ---- Flash Fill -----------------------------------------------------------------------------------
const names = `s.GetRange("D1").SetValue("Full name"); s.GetRange("E1").SetValue("First");
  var n = ["Jane Doe", "mary jones", "Ann Lee Brown", "Paul Martin"]; for (var i = 0; i < n.length; i++) s.GetRange("D" + (i + 2)).SetValue(n[i]);`;
await test("flash-fill.first-name-header", async () => {
  await setValues(names + ` s.GetRange("E2").SetValue("Jane");`);
  await select(frame, "E3"); await press("Control+e"); await wait(300);
  return eq([await cell("E1"), await cell("E3"), await cell("E4"), await cell("E5")], ["First", "mary", "Ann", "Paul"], "E1, E3:E5");
});
await test("flash-fill.last-name-upper", async () => {
  await setValues(names + ` s.GetRange("E1").SetValue(""); s.GetRange("E2").SetValue("SMITH"); s.GetRange("E3").SetValue("JONES");`);
  await select(frame, "E4"); await press("Control+e"); await wait(300);
  return eq([await cell("E4"), await cell("E5")], ["BROWN", "MARTIN"], "E4, E5");
});
await test("flash-fill.initials", async () => {
  await setValues(names + ` s.GetRange("E1").SetValue(""); s.GetRange("E2").SetValue("J.S.");`);
  await select(frame, "E2"); await press("Control+e"); await wait(300);
  return eq([await cell("E3"), await cell("E5")], ["M.J.", "P.M."], "E3, E5");
});
await test("flash-fill.combine-columns", async () => {
  await setValues(`s.GetRange("D1").SetValue("john"); s.GetRange("E1").SetValue("Smith"); s.GetRange("D2").SetValue("mary"); s.GetRange("E2").SetValue("Jones");
    s.GetRange("F1").SetValue("Doe, Jane");`);
  await select(frame, "F2"); await press("Control+e"); await wait(300);
  return eq(await cell("F2"), "Jones, Mary", "F2");
});
await test("flash-fill.one-undo", async () => {
  await setValues(names + ` s.GetRange("E2").SetValue("Jane");`);
  await select(frame, "E3"); await press("Control+e"); await wait(300); await press(`${ctrl}+z`); await wait(200);
  return eq([await cell("E3"), await cell("E5"), await cell("E2")], ["", "", "Jane"], "E3, E5, E2 after one undo");
});
await test("flash-fill.no-pattern", async () => {
  await setValues(`s.GetRange("D1").SetValue("abc"); s.GetRange("E1").SetValue("xyz"); s.GetRange("D2").SetValue("def");`);
  await select(frame, "E2"); await press("Control+e"); await wait(300);
  return eq(await cell("E2"), "", "E2");
});

// ---- Quick Analysis -------------------------------------------------------------------------------
const qaBtn = "#quick-analysis-container";
const openQa = async () => { await press(mac ? "Control+q" : "Control+q"); await wait(400); };
const qaClick = async (sub, item) => {
  await js(([sub, item]) => {
    const m = SSE.getController("ExcelShortcuts").qaMenuCmp;
    const s = m.items.find(i => i.value === sub); s.cmpEl.find("> a").trigger("mouseenter").click();
    const it = s.menu.items.find(i => i.value === item); it.cmpEl.find("> a").click();
  }, [sub, item]);
  await wait(800);
};
const numbers = `s.GetRange("D1").SetValue(1); s.GetRange("D2").SetValue(2); s.GetRange("D3").SetValue(3); s.GetRange("E1").SetValue(10); s.GetRange("E2").SetValue(20); s.GetRange("E3").SetValue(30);`;
await test("quick-analysis.button", async () => {
  await setValues(numbers); await select(frame, "D1:E3"); await wait(400);
  const shown = await visible(qaBtn);
  await select(frame, "H10"); await wait(400);
  const hidden = !(await visible(qaBtn));
  return shown && hidden ? true : `button shown on a range with data: ${shown}, hidden on an empty cell: ${hidden}`;
});
await test("quick-analysis.ctrl-q-menu", async () => {
  await setValues(numbers); await select(frame, "D1:E3"); await openQa();
  const v = await js(() => { const m = SSE.getController("ExcelShortcuts").qaMenuCmp; return !!m && m.isVisible() && m.items.map(i => i.value); });
  await press("Escape");
  return eq(v, ["formatting", "charts", "totals", "tables"], "menu sections");
});
await test("quick-analysis.totals-sum", async () => {
  await setValues(numbers); await select(frame, "D1:E3"); await openQa(); await qaClick("totals", "sum");
  return eq([await formula("D4"), await cell("D4"), await cell("E4")], ["SUM(D1:D3)", "6", "60"], "D4 formula, D4, E4");
});
await test("quick-analysis.totals-right", async () => {
  await setValues(numbers); await select(frame, "D1:E3"); await openQa(); await qaClick("totals", "sum-right");
  return eq([await cell("F1"), await cell("F3")], ["11", "33"], "F1, F3");
});
await test("quick-analysis.totals-no-overwrite", async () => {
  await select(frame, "A1:A3"); await openQa(); await qaClick("totals", "sum");
  const warned = await js(() => Common.Utils.ModalWindow.isVisible());
  await press("Enter"); await wait(300);
  return eq([await cell("A4"), warned], ["40", true], "A4 kept, warning shown");
});
await test("quick-analysis.data-bar", async () => {
  await setValues(numbers); await select(frame, "D1:D3"); await openQa(); await qaClick("formatting", "databar");
  return eq(await js(() => { const r = Asc.editor.wb.getWorksheet().model.aConditionalFormattingRules; return Array.isArray(r) ? r.length : Object.keys(r || {}).length; }), 1, "conditional formatting rules");
});
await test("quick-analysis.chart", async () => {
  await setValues(numbers); await select(frame, "D1:E3"); await openQa(); await qaClick("charts", "column");
  return eq((await state(frame)).drawings, 1, "drawings");
});

const failed = results.filter(r => r.status !== "pass").length;
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), platform, errors, results }, null, 1));
console.log(`\n${results.length - failed}/${results.length} passed${errors.length ? ", page errors: " + errors.length : ""}`);
await s.browser.close();
process.exit(failed ? 1 : 0);
