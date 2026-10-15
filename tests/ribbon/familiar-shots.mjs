#!/usr/bin/env node
// Screenshots of OUR Word editor at the size and zoom of the Word reference (1930x1040, 120%), en and fr.
//   node tests/ribbon/familiar-shots.mjs --dir docs/screenshots/familiar --tag before
import path from "node:path";
import fs from "node:fs";
import { launch, openEditor, setDoc, caret, select, focusDoc } from "../shortcuts/lib.mjs";
const args = process.argv.slice(2);
const opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const dir = opt("--dir", "shots"), tag = opt("--tag", "after");
fs.mkdirSync(dir, { recursive: true });
for (const lang of ["en", "fr"]) {
  const { browser, page } = await launch({ w: 1930, h: 1040, lang });
  const frame = await openEditor(page, { lang });
  await setDoc(frame, [{ text: "1. INTRODUCTION", style: "Heading 1" }, { text: "1.1 Purpose and scope", style: "Heading 2" }, "The procedure covers actual and potential conflicts of interests, and situations which may objectively be perceived as such."]);
  await frame.evaluate(() => { Asc.editor.zoom(120); });
  await frame.waitForTimeout(1200);
  await caret(frame, 2, 5);
  await frame.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dir, `${tag}-home-${lang}.png`) });
  await select(frame, 2, 0, 20);
  await frame.waitForTimeout(1200);
  await page.screenshot({ path: path.join(dir, `${tag}-statusbar-selection-${lang}.png`), clip: { x: 0, y: 1000, width: 1930, height: 40 } });
  await caret(frame, 2, 5);
  await frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.MoveCursorToEndPos && d.MoveCursorToEndPos(); Asc.editor.put_Table(3, 2); });
  await frame.waitForTimeout(800);
  await page.mouse.click(800, 498, { button: "right" });
  await frame.waitForTimeout(800);
  await page.screenshot({ path: path.join(dir, `${tag}-minitoolbar-${lang}.png`) });
  await browser.close();
}
