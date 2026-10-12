#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Slide Sorter and Presenter View (next-slide preview) of the presentation editor.
// Usage: node tests/slide-views/run.mjs http://localhost:8109 [--platform mac]
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = createRequire(path.join(process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw"), "package.json"))("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");
const mac = process.argv.includes("mac");
const MOD = mac ? "Meta" : "Control";
const fx = path.join(here, "../fixtures/pptx/p01-cours-photosynthese.pptx");
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...(mac ? { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" } : {}) });
if (mac) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" }));
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
const r = await ctx.request.post(base + "/example/upload", { multipart: { uploadedFile: { name: "p01.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: fs.readFileSync(fx) } } });
const j = await r.json();
await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`);
const f = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
await f.waitForFunction(() => window.PE && PE.getController("Main") && PE.getController("Main").api && PE.getController("Main").api.getCountPages() > 0, null, { timeout: 90000 });
await page.waitForTimeout(4000);
const ids = () => f.evaluate(() => PE.getController("Main").api.WordControl.m_oLogicDocument.Slides.map(s => s.Id));
const count = () => f.evaluate(() => PE.getController("Main").api.getCountPages());
const cur = () => f.evaluate(() => PE.getController("Main").api.getCurrentPage());
const wait = ms => page.waitForTimeout(ms);
const n0 = await count();
const ids0 = await ids();

// open from View > Slide Sorter
await f.evaluate(() => { $("#slot-btn-slide-sorter button").trigger("click"); });
await f.waitForSelector("#elx-sorter .elx-sorter-card", { timeout: 10000 });
await wait(1500);
ok((await f.locator("#elx-sorter .elx-sorter-card").count()) === n0, `the sorter shows the ${n0} slides`);
ok((await f.locator("#elx-sorter .elx-sorter-img[src^='data:image']").count()) === n0, "every slide has its thumbnail");
ok(await f.evaluate(() => PE.getController("ViewTab").view.btnSlideSorter.pressed), "View > Slide Sorter is pressed");

// selection
await f.locator('.elx-sorter-card[data-idx="2"]').click();
ok((await f.locator("#elx-sorter .elx-sorter-card.selected").count()) === 1, "click selects one slide");
await f.locator('.elx-sorter-card[data-idx="4"]').click({ modifiers: ["Shift"] });
ok((await f.locator("#elx-sorter .elx-sorter-card.selected").count()) === 3, "Shift+click selects a range");
await f.locator('.elx-sorter-card[data-idx="3"]').click({ modifiers: [MOD] });
ok((await f.locator("#elx-sorter .elx-sorter-card.selected").count()) === 2, `${mac ? "Cmd" : "Ctrl"}+click toggles a slide`);
await page.keyboard.press(MOD + "+a");
ok((await f.locator("#elx-sorter .elx-sorter-card.selected").count()) === n0, `${mac ? "Cmd" : "Ctrl"}+A selects all`);

// drag and drop: slide 1 after slide 3
await f.locator('.elx-sorter-card[data-idx="0"]').click();
const bbox = i => f.locator('.elx-sorter-card[data-idx="' + i + '"]').boundingBox();
const s0 = await bbox(0), t2 = await bbox(2);
await page.mouse.move(s0.x + s0.width / 2, s0.y + s0.height / 2);
await page.mouse.down();
await page.mouse.move(s0.x + s0.width / 2 + 20, s0.y + s0.height / 2 + 5, { steps: 3 });
await page.mouse.move(t2.x + t2.width * 0.8, t2.y + t2.height / 2, { steps: 8 });
await page.mouse.up();
await wait(1500);
const ids1 = await ids();
ok(JSON.stringify(ids1) === JSON.stringify([ids0[1], ids0[2], ids0[0], ...ids0.slice(3)]), "dragging slide 1 after slide 3 reorders the deck");
ok((await f.locator("#elx-sorter .elx-sorter-card.selected").count()) === 1 && (await f.locator('.elx-sorter-card.selected').getAttribute("data-idx")) === "2", "the moved slide stays selected");
await f.evaluate(() => PE.getController("Main").api.Undo());
await wait(1500);
ok(JSON.stringify(await ids()) === JSON.stringify(ids0), "undo restores the order (one step)");
await f.locator('#elx-sorter .elx-sorter-card').first().click();

// keyboard: arrows, move with Ctrl+Right, Delete
await page.keyboard.press("ArrowRight");
ok((await f.locator('.elx-sorter-card.selected').getAttribute("data-idx")) === "1", "Right arrow moves the selection");
await page.keyboard.press(MOD + "+ArrowRight");
await wait(1200);
const ids2 = await ids();
ok(ids2[2] === ids0[1] && ids2[1] === ids0[2], `${mac ? "Cmd" : "Ctrl"}+Right moves the slide one place`);
await f.evaluate(() => PE.getController("Main").api.Undo());
await wait(1200);
await page.keyboard.press("Delete");
await wait(1500);
ok((await count()) === n0 - 1, "Delete removes the selected slide");
await f.evaluate(() => PE.getController("Main").api.Undo());
await wait(1500);
ok((await count()) === n0 && JSON.stringify(await ids()) === JSON.stringify(ids0), "undo brings the slide back");

// open a slide: double-click, then Enter / Esc
await f.locator('.elx-sorter-card[data-idx="3"]').dblclick();
await wait(800);
ok((await f.locator("#elx-sorter").count()) === 0 && (await cur()) === 3, "double-click opens the slide in the Normal view");
ok(await f.evaluate(() => PE.getController("ViewTab").view.btnNormal.pressed && !PE.getController("ViewTab").view.btnSlideSorter.pressed), "View > Normal is pressed again");
await f.evaluate(() => PE.SlideSorter.open());
await wait(800);
await page.keyboard.press("Escape");
await wait(500);
ok((await f.locator("#elx-sorter").count()) === 0, "Esc closes the sorter");
// status bar buttons
await f.locator("#elx-sb-sorter button, #elx-sb-sorter .btn-toolbar").first().click();
await f.waitForSelector("#elx-sorter", { timeout: 5000 });
ok(true, "the status bar Slide Sorter button opens it");
await f.locator("#elx-sb-normal button, #elx-sb-normal .btn-toolbar").first().click();
await wait(500);
ok((await f.locator("#elx-sorter").count()) === 0, "the status bar Normal button closes it");

// Presenter View: next slide preview
const popP = ctx.waitForEvent("page", { timeout: 30000 });
await f.evaluate(() => PE.getController("Main").api.goToPage(0));
await page.keyboard.press("Alt+F5");
const pop = await popP;
await pop.setViewportSize({ width: 1440, height: 900 });
await pop.waitForSelector("#elx_next_slide_img", { state: "attached", timeout: 30000 });
await pop.waitForTimeout(5000);
const nextSrc1 = await pop.evaluate(() => document.getElementById("elx_next_slide_img").src.length);
ok(nextSrc1 > 2000 && (await pop.locator("#elx_next_slide_img").isVisible()), "Presenter View shows the next slide preview");
const before = await pop.evaluate(() => document.getElementById("elx_next_slide_img").src);
await pop.keyboard.press("PageDown");
await pop.waitForTimeout(2500);
const after = await pop.evaluate(() => document.getElementById("elx_next_slide_img").src);
ok(after !== before, "the preview follows the slide change");
await pop.keyboard.press("End");
await pop.waitForTimeout(2500);
ok(await pop.locator("#elx_next_slide_end").isVisible(), "the last slide shows End of slideshow");
ok(errs.filter(e => !/ResizeObserver/.test(e)).length === 0, "no page error " + errs.slice(0, 2).join(" | "));
await b.close();
process.exit(fail ? 1 : 0);
