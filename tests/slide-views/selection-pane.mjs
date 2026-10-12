#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Selection pane of the presentation editor (Alt+F10; Home > Arrange > Selection Pane).
// Usage: node tests/slide-views/selection-pane.mjs http://localhost:8121 [mac]
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
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

async function open(file, name) {
  const r = await ctx.request.post(base + "/example/upload", { multipart: { uploadedFile: { name, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: fs.readFileSync(file) } } });
  const j = await r.json();
  await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`);
  const f = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
  await f.waitForFunction(() => window.PE && PE.getController("Main") && PE.getController("Main").api && PE.getController("Main").api.getCountPages() > 0, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  return f;
}
let f = await open(fx, `selpane-${process.pid}.pptx`);
const js = (fn, a) => f.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const objs = () => js(() => PE.getController("Main").api.asc_GetSelectionPaneObjects());
const names = () => js(() => $("#elx-task-pane .elx-sp-item .elx-sp-name").map((i, e) => e.textContent).get());
const spTree = () => js(() => PE.getController("Main").api.WordControl.m_oLogicDocument.GetCurrentSlide().cSld.spTree.map(o => o.getObjectName()));
const selected = () => js(() => PE.getController("Main").api.WordControl.m_oLogicDocument.GetCurrentController().selectedObjects.map(o => o.getObjectName()));
const slideShot = async () => { const h = await page.locator("iframe[name=frameEditor]").elementHandle(); return (await (await f.waitForSelector("#id_viewer")).screenshot()).toString("base64"); };

// make sure the current slide has several objects: add two shapes through the builder API
await js(() => PE.getController("Main").api.asc_enableKeyEvents(true));
await js(() => { const api = PE.getController("Main").api; api.WordControl.m_oLogicDocument.Set_CurPage(0); });
await wait(500);
const tree0 = await spTree();
ok(tree0.length >= 2, `the first slide has ${tree0.length} objects: ${JSON.stringify(tree0)}`);

// ---- Alt+F10 opens, lists front first
await f.locator("#editor_sdk, #id_viewer").first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.keyboard.press(mac ? "Alt+F10" : "Alt+F10");
await wait(600);
ok((await js(() => $("#elx-task-pane[data-pane=selection]").length)) === 1, mac ? "Alt+F10 opens the Selection pane (also on macOS)" : "Alt+F10 opens the Selection pane");
let n = await names();
ok(JSON.stringify(n) === JSON.stringify(tree0.slice().reverse()), `the list is the slide's objects, front first: ${JSON.stringify(n)}`);

// ---- click selects
await js(() => $("#elx-task-pane .elx-sp-item").last().click());
await wait(400);
let sel = await selected();
ok(sel.length === 1 && sel[0] === tree0[0], `click selects the object: ${JSON.stringify(sel)}`);
ok((await js(() => $("#elx-task-pane .elx-sp-item.selected").length)) === 1, "the selected row is highlighted");

// ---- the eye hides (not drawn, not selectable, undo shows it again)
const before = await slideShot();
await js(() => $("#elx-task-pane .elx-sp-item").last().find(".elx-sp-eye").click());
await wait(600);
let o = await objs();
ok(o[o.length - 1].hidden === true, "the eye hides the object");
ok((await selected()).length === 0, "hiding the selected object clears the selection");
const hiddenShot = await slideShot();
ok(hiddenShot !== before, "the hidden object is not drawn");
ok((await js(() => $("#elx-task-pane .elx-sp-item.hidden-obj").length)) === 1, "the row is dimmed");
await js(() => $("#elx-task-pane .elx-sp-item").last().click());
await wait(300);
ok((await selected()).length === 0, "a hidden object cannot be selected from the pane");
await page.keyboard.press(`${MOD}+z`);
await wait(600);
o = await objs();
ok(o[o.length - 1].hidden === false, "one undo shows it again");
await js(() => PE.getController("Main").api.WordControl.m_oLogicDocument.GetCurrentController().resetSelection());
await js(() => PE.getController("Main").api.WordControl.m_oLogicDocument.Document_UpdateSelectionState());
await wait(500);
ok((await slideShot()) !== hiddenShot, "and it is drawn again");

// ---- Hide All / Show All
await js(() => $("#elx-task-pane [data-cmd=hide]").click());
await wait(500);
ok((await objs()).every(x => x.hidden), "Hide All");
await js(() => $("#elx-task-pane [data-cmd=show]").click());
await wait(500);
ok((await objs()).every(x => !x.hidden), "Show All");

// ---- rename
await js(() => $("#elx-task-pane .elx-sp-item").first().trigger("dblclick"));
await wait(200);
await js(() => $("#elx-task-pane .elx-sp-item input").val("Key figure"));
await page.keyboard.press("Enter");
await wait(400);
n = await names();
ok(n[0] === "Key figure" && (await spTree()).slice(-1)[0] === "Key figure", `rename: ${JSON.stringify(n)}`);
await page.keyboard.press(`${MOD}+z`);
await wait(400);
ok((await spTree()).slice(-1)[0] === tree0.slice(-1)[0], "one undo restores the name");

// ---- z-order from the pane
await js(() => $("#elx-task-pane .elx-sp-item").eq(1).click());
await wait(300);
const z0 = await spTree();
await js(() => $("#elx-task-pane [data-cmd=forward]").click());
await wait(400);
const z1 = await spTree();
ok(z1.indexOf(z0[z0.length - 2]) === z0.length - 1, `Bring Forward moves the selected object to the front: ${JSON.stringify(z1)}`);
await js(() => $("#elx-task-pane [data-cmd=backward]").click());
await wait(400);
ok(JSON.stringify(await spTree()) === JSON.stringify(z0), "Send Backward moves it back");

// ---- saved hidden and kept on opening
await js(() => PE.getController("Main").api.asc_SetPaneObjectsHidden(PE.getController("Main").api.asc_GetSelectionPaneObjects()[0].id, true));
await wait(500);
fs.mkdirSync(path.join(here, "results"), { recursive: true });
const out = path.join(here, "results", "selection-hidden.pptx");
const dl = page.waitForEvent("download", { timeout: 60000 });
await js(() => PE.getController("Main").api.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PPTX)));
await (await dl).saveAs(out);
const xml = execFileSync("unzip", ["-p", out, "ppt/slides/slide1.xml"], { maxBuffer: 64 << 20 }).toString();
ok(/<p:cNvPr\b[^>]*hidden="(1|true)"/.test(xml), "the hidden object is saved with hidden=\"1\" in the .pptx");
const name0 = (await objs())[0].name;
f = await open(out, `selpane2-${process.pid}.pptx`);
const re = await js(() => PE.getController("Main").api.asc_GetSelectionPaneObjects());
ok(re.length === tree0.length && re[0].hidden === true && re[0].name === name0 && re.slice(1).every(x => !x.hidden), `reopened: the same object is still hidden (${JSON.stringify(re.map(x => [x.name, x.hidden]))})`);

// ---- toggle, Esc, menu entry
await page.keyboard.press(mac ? "Alt+F10" : "Alt+F10");
await wait(500);
ok((await js(() => $("#elx-task-pane").length)) === 1, "Alt+F10 opens it again");
await page.keyboard.press(mac ? "Alt+F10" : "Alt+F10");
await wait(300);
ok((await js(() => $("#elx-task-pane").length)) === 0, "Alt+F10 again closes it");
await page.keyboard.press(mac ? "Alt+F10" : "Alt+F10");
await wait(300);
await f.locator("#elx-task-pane .elx-tp-head").click();
await page.keyboard.press("Escape");
await wait(300);
ok((await js(() => $("#elx-task-pane").length)) === 0, "Esc closes it");
const item = await js(() => PE.getController("Toolbar").toolbar.btnShapeArrange.menu.items.some(i => i.options.value === "selection-pane"));
ok(item, "Home > Arrange has Selection Pane...");
await js(() => $("#elx-task-pane .elx-tp-close").click());
await js(() => $("#elx-task-pane").remove());
await js(() => { const a = PE.getController("Main").api; a.asc_SelectPaneObject(a.asc_GetSelectionPaneObjects().find(x => !x.hidden).id); });
await wait(400);
await f.locator("#slot-btn-arrange-shape .dropdown-toggle").first().click();
await wait(300);
await f.locator("a:has-text('Selection Pane...')").first().click();
await wait(400);
ok((await js(() => $("#elx-task-pane").length)) === 1, "Selection Pane... opens the pane");

ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
