#!/usr/bin/env node
// Sections of the presentation editor (PowerPoint's p14:sectionLst): Home > Section menu, headers in the thumbnails
// and in the Slide Sorter (collapse, select, right-click menu), the slide commands keeping sections consistent,
// undo, and the round trip through .pptx (a synthetic file whose slide ids have gaps, and a file written by the editor).
// Usage: node tests/slide-views/sections.mjs http://localhost:8121 [mac]
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
const fixtures = path.join(here, "../fixtures/pptx");
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? "" : ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)}`);

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
  await page.waitForTimeout(3500);
  await f.evaluate(() => { window.__base = AscCommon.History.Index; });
  return f;
}
let f = await open(path.join(fixtures, "p01-cours-photosynthese.pptx"), `sec-${process.pid}.pptx`);
const js = (fn, a) => f.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const api = "PE.getController('Main').api";
const secs = () => js(() => PE.getController("Main").api.asc_GetSections().map(s => [s.name, s.first, s.count]));
const count = () => js(() => PE.getController("Main").api.getCountPages());
const reset = async () => {
  await js(() => { const a = PE.getController("Main").api; a.asc_SelectSlides ? 0 : 0; for (let i = 0; i < 80 && AscCommon.History.Index > window.__base; i++) a.Undo(); a.goToPage(0); });
  await wait(500);
};
const undo = async () => { await js(() => PE.getController("Main").api.Undo()); await wait(300); };
const redo = async () => { await js(() => PE.getController("Main").api.Redo()); await wait(300); };

// ---- 1. the Home button and its menu
ok((await js(() => $("#id-toolbar-btn-elx-section").length)) === 1, "Home > Slides > Section button exists");
eq(await secs(), [], "a presentation has no sections to begin with");
const n0 = await count();

// ---- 2. add (API): the slides before become the Default Section
const id1 = await js(() => PE.getController("Main").api.asc_AddSection(3));
eq(await secs(), [["Default Section", 0, 3], ["Untitled Section", 3, n0 - 3]], "Add Section at slide 4 adds the Default Section before it");
await undo();
eq(await secs(), [], "one undo removes both sections");
await redo();
eq((await secs()).length, 2, "redo brings them back");
await reset();
eq(await secs(), [], "reset");
await js(() => PE.getController("Main").api.asc_AddSection(0));
eq(await secs(), [["Untitled Section", 0, n0]], "Add Section at the first slide: one section holding every slide");
await reset();

// ---- 3. Home > Section > Add Section: the name box opens, Enter names it
await js(() => PE.getController("Main").api.goToPage(4));
await wait(300);
const menuItem = async text => { await f.locator("#id-toolbar-btn-elx-section button").first().click(); await wait(300); await f.locator(`#id-toolbar-btn-elx-section .dropdown-menu a:has-text("${text}")`).first().click(); await wait(500); };
await menuItem("Add Section");
const dlg = await js(() => $(".asc-window:visible input[type=text]").length);
ok(dlg === 1, "Add Section opens the Rename Section box");
await f.locator(".asc-window:visible input[type=text]").first().fill("Methods");
await page.keyboard.press("Enter");
await wait(600);
eq(await secs(), [["Default Section", 0, 4], ["Methods", 4, n0 - 4]], "typed name applied, Default Section before it");
// the menu follows the slide: Rename is disabled on a deck without sections, enabled here
// ---- 4. rename and undo
await menuItem("Rename Section");
await f.locator(".asc-window:visible input[type=text]").first().fill("Methods 2");
await page.keyboard.press("Enter");
await wait(500);
eq((await secs())[1][0], "Methods 2", "Rename Section from the menu");
await undo();
eq((await secs())[1][0], "Methods", "one undo restores the name");

// ---- 5. slide commands keep sections consistent
await js(() => { const a = PE.getController("Main").api; a.goToPage(4); a.asc_selectSlides ? a.asc_selectSlides([4]) : 0; });
await wait(300);
await js(() => PE.getController("Main").api.DeleteSlide());
await wait(500);
eq(await secs(), [["Default Section", 0, 4], ["Methods", 4, n0 - 5]], "deleting the first slide of a section: the section goes on with its next slide");
await js(() => { const a = PE.getController("Main").api; a.goToPage(5); a.AddSlide ? 0 : 0; });
await js(() => PE.getController("Main").api.WordControl.m_oLogicDocument.addNextSlide());
await wait(500);
eq((await secs())[1], ["Methods", 4, n0 - 4], "a new slide after a slide of the section joins it");
// a slide dragged to the front joins the first section
await js(() => PE.getController("Main").api.asc_moveSlidesTo([6], 0, false));
await wait(500);
eq(await secs(), [["Default Section", 0, 5], ["Methods", 5, n0 - 5]], "a slide moved to the front joins the first section, the headers stay on their first slides");
await reset();

// ---- 6. remove, move, remove with slides, remove all
await js(() => { const a = PE.getController("Main").api; a.asc_AddSection(2); a.asc_AddSection(5); });
let s3 = await secs();
eq(s3.map(x => x[0]), ["Default Section", "Untitled Section", "Untitled Section"], "three sections");
await js(() => { const a = PE.getController("Main").api; const s = a.asc_GetSections(); a.asc_RenameSection(s[1].id, "Middle"); a.asc_RenameSection(s[2].id, "End"); });
await wait(300);
await js(() => { const a = PE.getController("Main").api; a.asc_MoveSection(a.asc_GetSections()[1].id, 1); });
await wait(600);
const moved = await secs();
eq(moved.map(x => x[0]), ["Default Section", "End", "Middle"], "Move Section Down swaps the section with the next one");
eq(moved.map(x => x[2]), [2, n0 - 5, 3], "the slides went with their sections");
await undo();
eq((await secs()).map(x => x[0]), ["Default Section", "Middle", "End"], "one undo puts them back");
await js(() => { const a = PE.getController("Main").api; a.asc_RemoveSection(a.asc_GetSections()[1].id); });
await wait(400);
eq(await secs(), [["Default Section", 0, 5], ["End", 5, n0 - 5]], "Remove Section: its slides join the previous one");
await js(() => { const a = PE.getController("Main").api; a.asc_RemoveSection(a.asc_GetSections()[0].id); });
await wait(400);
eq(await secs(), [["End", 0, n0]], "Remove the first section: its slides join the next one");
await reset();
await js(() => { const a = PE.getController("Main").api; a.asc_AddSection(2); a.asc_AddSection(5); });
await js(() => { const a = PE.getController("Main").api; a.asc_RemoveSectionAndSlides(a.asc_GetSections()[1].id); });
await wait(600);
eq([await count(), (await secs()).map(x => x[2])], [n0 - 3, [2, n0 - 5]], "Remove Section & Slides deletes its slides");
await reset();
await js(() => { const a = PE.getController("Main").api; a.asc_AddSection(2); a.asc_AddSection(5); a.asc_RemoveAllSections(); });
await wait(300);
eq(await secs(), [], "Remove All Sections");
await undo();
eq((await secs()).length, 3, "one undo restores them");
await reset();

// ---- 7. thumbnails: headers drawn, click on the arrow collapses, click on the name selects, right click opens the menu
await js(() => { const a = PE.getController("Main").api; a.asc_AddSection(3); a.asc_AddSection(6); const s = a.asc_GetSections(); a.asc_RenameSection(s[0].id, "Intro"); a.asc_RenameSection(s[1].id, "Body"); a.asc_RenameSection(s[2].id, "Wrap-up"); a.goToPage(0); });
await wait(800);
const headers = () => js(() => PE.getController("Main").api.WordControl.Thumbnails.m_arrPages.map((p, i) => p.sectionHeader ? [i, p.sectionHeader.name, p.sectionHeader.count, p.sectionHeader.collapsed] : null).filter(Boolean));
eq(await headers(), [[0, "Intro", 3, false], [3, "Body", 3, false], [6, "Wrap-up", 2, false]], "the thumbnails have a header row above the first slide of each section");
const headerPoint = async (idx, xOff) => js(([idx, xOff]) => {
  const th = PE.getController("Main").api.WordControl.Thumbnails, p = th.m_arrPages[idx], h = p.sectionHeader;
  const r = th.m_oWordControl.m_oThumbnails.HtmlElement.getBoundingClientRect(), ratio = AscCommon.AscBrowser.retinaPixelRatio;
  return { x: r.left + xOff / ratio, y: r.top + (h.top + h.height / 2) / ratio };
}, [idx, xOff]);
const frameBox = await (await page.locator("iframe[name=frameEditor]").elementHandle()).boundingBox();
const click = async (pt, opts = {}) => page.mouse.click(frameBox.x + pt.x, frameBox.y + pt.y, opts);
await click(await headerPoint(3, 6));
await wait(600);
const hs = await headers();
ok(hs[1][3] === true && (await js(() => PE.getController("Main").api.WordControl.Thumbnails.m_arrPages.filter(p => p.collapsedHidden).length)) === 3, "a click on the arrow collapses the section: its 3 slides take no room");
eq((await secs())[1].slice(0, 3), ["Body", 3, 3], "collapsing does not change the sections");
await click(await headerPoint(3, 6));
await wait(500);
ok((await headers())[1][3] === false, "a second click expands it");
await click(await headerPoint(3, 60));
await wait(600);
eq(await js(() => PE.getController("Main").api.WordControl.Thumbnails.GetSelectedArray()), [3, 4, 5], "a click on the name selects the slides of the section");
await click(await headerPoint(3, 60), { button: "right" });
await wait(600);
const menuItems = await js(() => $(".elx-section-menu:visible li a").map((i, e) => e.textContent.trim()).get().filter(Boolean));
ok(["Rename Section", "Remove Section", "Remove All Sections", "Remove Section & Slides", "Move Section Up", "Collapse All", "Expand All"].every(t => menuItems.includes(t)), `right click on a header opens the section menu: ${JSON.stringify(menuItems)}`);
await f.locator(".elx-section-menu a:has-text('Collapse All')").first().click();
await wait(600);
ok((await headers()).every(h => h[3] === true), "Collapse All");
// going to a slide of a collapsed section opens it
await js(() => PE.getController("Main").api.goToPage(4));
await wait(600);
eq((await headers()).map(h => h[3]), [true, false, true], "going to a slide of a collapsed section expands that section");
await js(() => PE.getController("Main").api.asc_SetSectionCollapsed(PE.getController("Main").api.asc_GetSections()[0].id, false));
await js(() => PE.getController("Main").api.asc_SetSectionCollapsed(PE.getController("Main").api.asc_GetSections()[2].id, false));
await wait(300);

// ---- 8. Slide Sorter
await js(() => { $("#slot-btn-slide-sorter button").trigger("click"); });
await f.waitForSelector("#elx-sorter .elx-sorter-card", { timeout: 10000 });
await wait(800);
eq(await js(() => $("#elx-sorter .elx-sorter-section .elx-sorter-secname").map((i, e) => e.textContent).get()), ["Intro", "Body", "Wrap-up"], "the Slide Sorter has the section headers");
eq(await js(() => $("#elx-sorter .elx-sorter-card").length), n0, "and all the slides");
await js(() => $("#elx-sorter .elx-sorter-section").eq(1).find(".elx-sorter-arrow").click());
await wait(600);
eq(await js(() => $("#elx-sorter .elx-sorter-card").length), n0 - 3, "collapsing a section in the sorter hides its slides");
eq(await js(() => PE.getController("Main").api.asc_GetSections()[1].collapsed), true, "the same state as the thumbnails");
await js(() => $("#elx-sorter .elx-sorter-section").eq(1).find(".elx-sorter-arrow").click());
await wait(500);
await page.keyboard.press("Escape");
await wait(500);
await reset();

// ---- 9. the file: a .pptx written by the editor, and a file with gaps in the slide ids written by another application
await js(() => { const a = PE.getController("Main").api; a.asc_AddSection(3); a.asc_AddSection(6); const s = a.asc_GetSections(); a.asc_RenameSection(s[0].id, "Intro"); a.asc_RenameSection(s[1].id, "Body & more"); a.asc_RenameSection(s[2].id, "Wrap-up"); });
await wait(500);
fs.mkdirSync(path.join(here, "results"), { recursive: true });
const saved = async name => {
  const out = path.join(here, "results", name);
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await js(() => PE.getController("Main").api.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PPTX)));
  await (await dl).saveAs(out);
  return out;
};
const out1 = await saved("sections-saved.pptx");
const xml1 = execFileSync("unzip", ["-p", out1, "ppt/presentation.xml"], { maxBuffer: 64 << 20 }).toString();
const names1 = [...xml1.matchAll(/<p14:section name="([^"]*)"/g)].map(m => m[1]);
eq(names1, ["Intro", "Body &amp; more", "Wrap-up"], "the .pptx has the p14:sectionLst with the names");
const slideIds = [...xml1.matchAll(/<p:sldId id="(\d+)"/g)].map(m => m[1]);
const bySection = [...xml1.matchAll(/<p14:section [^>]*>(.*?)<\/p14:section>/g)].map(m => [...m[1].matchAll(/<p14:sldId id="(\d+)"/g)].map(x => x[1]));
eq(bySection.map(x => x.length), [3, 3, 2], "with the slides of each section");
eq(bySection.flat(), slideIds, "every slide is in one section, in order, with the ids of the file");
ok(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}"/.test(xml1), "under the extension URI PowerPoint uses");
f = await open(out1, `sec-re-${process.pid}.pptx`);
eq(await secs(), [["Intro", 0, 3], ["Body & more", 3, 3], ["Wrap-up", 6, 2]], "the saved file reopens with the same sections");
// the file with gaps in the slide ids (as after deleting slides in PowerPoint)
f = await open(path.join(fixtures, "sections.pptx"), `sec-gaps-${process.pid}.pptx`);
eq(await secs(), [["Intro", 0, 3], ["Body", 3, 2], ["Wrap-up", 5, 3]], "a file with gaps in the slide ids: the sections are read by their slide ids");
ok(/^\{[0-9A-F-]{36}\}$/.test(await js(() => PE.getController("Main").api.asc_GetSections()[0].id)), "with their ids kept");
await js(() => { const a = PE.getController("Main").api; a.asc_MoveSection(a.asc_GetSections()[2].id, -1); });
await wait(600);
const out2 = await saved("sections-gaps-saved.pptx");
f = await open(out2, `sec-gaps2-${process.pid}.pptx`);
eq(await secs(), [["Intro", 0, 3], ["Wrap-up", 3, 3], ["Body", 6, 2]], "a moved section is saved in its new place");

ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
