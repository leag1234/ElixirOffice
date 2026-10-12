#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Right-click menus of the Presentation editor: open every context menu, click every item
// (and submenu items) from a fresh menu, record errors, popups and effects.
//   node tests/ctxmenu/sweep-slide.mjs [--only id1,id2] [--out file.json] [--max-sub N]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../shortcuts/lib.mjs";
import { sigSource, sweepContext, summarize } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const only = opt("only") ? opt("only").split(",") : null;
const outFile = opt("out", path.join(HERE, "results", "slide-latest.json"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const BASE = process.env.EO_BASE || "http://localhost:8095";

const { browser, context, page, errors } = await launch({});
const fixture = path.resolve(HERE, "../fixtures/pptx/p01-cours-photosynthese.pptx");
const up = await (await context.request.post(BASE + "/example/upload", { multipart: { uploadedFile: { name: path.basename(fixture), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: fs.readFileSync(fixture) } } })).json();
await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(up.filename)}&lang=en`);
const frame = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 60000 })).contentFrame();
await frame.waitForFunction(() => window.PE && PE.getController("Main") && PE.getController("Main").api && PE.getController("Main").api.getCountPages() > 0, null, { timeout: 90000 });
await page.waitForTimeout(4000);
const fb = await (await frame.frameElement()).boundingBox();
await frame.evaluate(() => { const d = PE.getController("Main").api.WordControl.m_oLogicDocument; window.__eoBase = d.History.Index; });

const sdkBox = () => frame.evaluate(() => { const r = (document.querySelector("#id_main_view") || document.querySelector("#editor_sdk")).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
const slidePt = async (fx, fy) => { const b = await sdkBox(); return { x: fb.x + b[0] + b[2] * fx, y: fb.y + b[1] + b[3] * fy }; };
const thumbPt = async n => { const r = await frame.evaluate(() => { const b = document.querySelector("#id_panel_thumbnails").getBoundingClientRect(); return [b.left, b.top, b.width]; }); return { x: fb.x + r[0] + r[2] / 2, y: fb.y + r[1] + 60 + n * 134 }; };
const goSlide = async n => { await frame.evaluate(n => PE.getController("Main").api.goToPage(n), n); await page.waitForTimeout(500); };
const cmd = src => frame.evaluate(src => new Promise(res => Asc.editor.callCommand(src, true, r => res(r))), src);

const scenarios = [
  { id: "slide-empty-area", setup: async () => { await goSlide(0); }, target: () => slidePt(0.9, 0.9) },
  { id: "title-text", setup: async () => { await goSlide(0); const p = await slidePt(0.5, 0.3); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); await page.keyboard.press("Control+A"); await page.waitForTimeout(300); }, target: () => slidePt(0.5, 0.3) },
  { id: "title-shape", setup: async () => { await goSlide(0); const p = await slidePt(0.5, 0.3); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); await page.keyboard.press("Escape"); await page.waitForTimeout(300); }, target: () => slidePt(0.5, 0.3) },
  { id: "shape", setup: async () => { await goSlide(0); await cmd(`(function(){ var s = Api.GetPresentation().GetSlideByIndex(0); var sh = Api.CreateShape("rect", 2000000, 1000000, Api.CreateSolidFill(Api.CreateRGBColor(200,220,255)), Api.CreateStroke(0, Api.CreateNoFill())); sh.SetPosition(1000000, 3800000); s.AddObject(sh); return 1; })()`); await page.waitForTimeout(500); const p = await slidePt(0.2, 0.75); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }, target: () => slidePt(0.2, 0.75) },
  { id: "picture", setup: async () => { await goSlide(0); await cmd(`(function(){ var s = Api.GetPresentation().GetSlideByIndex(0); var im = Api.CreateImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 2000000, 1000000); im.SetPosition(1000000, 3800000); s.AddObject(im); return 1; })()`); await page.waitForTimeout(500); const p = await slidePt(0.2, 0.75); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }, target: () => slidePt(0.2, 0.75) },
  { id: "table", setup: async () => { await goSlide(0); await cmd(`(function(){ var s = Api.GetPresentation().GetSlideByIndex(0); var t = Api.CreateTable(2, 2); t.SetPosition(1000000, 3800000); t.SetSize(3000000, 800000); s.AddObject(t); return 1; })()`); await page.waitForTimeout(500); const p = await slidePt(0.2, 0.75); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }, target: () => slidePt(0.2, 0.75) },
  { id: "thumbnail", setup: async () => { await goSlide(0); const p = await thumbPt(0); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }, target: () => thumbPt(0) },
  { id: "thumbnail-2", setup: async () => { await goSlide(1); const p = await thumbPt(1); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }, target: () => thumbPt(1) },
  { id: "thumbnail-empty-area", setup: async () => { await goSlide(0); }, target: async () => { const r = await frame.evaluate(() => { const b = document.querySelector("#id_panel_thumbnails").getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }); return { x: fb.x + r[0] + r[2] / 2, y: fb.y + r[1] + r[3] - 10 }; } },
];

const reset = async () => {
  await page.keyboard.press("Escape");
  await frame.evaluate(() => {
    try { Common.UI.Menu.Manager.hideAll(); } catch (e) {}
    try { $(".asc-window:visible").each(function () { const b = $(this).find(".tool.close:visible, .dlg-btn[result=cancel]:visible, .dlg-btn[result=close]:visible").first(); b.length ? b.click() : $(this).hide(); }); } catch (e) {}
    try { const fm = PE.getController("LeftMenu").leftMenu.menuFile; fm.isVisible() && fm.hide(); } catch (e) {}
    try { $("#pe-preview").is(":visible") && PE.getController("Main").api.EndDemonstration(); } catch (e) {}
    try { const api = PE.getController("Main").api, H = api.WordControl.m_oLogicDocument.History; for (let i = 0; i < 100 && H.Index > window.__eoBase && H.Can_Undo(); i++) api.WordControl.m_oLogicDocument.Document_Undo(); } catch (e) {}
  });
  await frame.waitForFunction(() => !Array.from(document.querySelectorAll(".modals-mask,.asc-window")).some(w => w.getClientRects().length && getComputedStyle(w).display !== "none"), null, { timeout: 4000 }).catch(() => {});
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
};
const cfg = { frame, page, errors, sig: sigSource.slide, reset, maxSub: +opt("max-sub", 4),
  rootFn: () => { const m = PE.getController("DocumentHolder").documentHolder.currentMenu; return m && m.isVisible() ? m.cmpEl[0] : null; } };
let rows = [];
for (const s of scenarios.filter(s => !only || only.includes(s.id))) {
  console.log(`## ${s.id}`);
  try { rows = rows.concat(await sweepContext(cfg, s)); }
  catch (e) { rows.push({ ctx: s.id, item: "(scenario)", status: "fail", reason: String(e).split("\n")[0].slice(0, 200) }); console.log(`FAIL ${s.id} scenario error ${String(e).split("\n")[0]}`); }
}
const pageErr = errors.filter(e => e.kind === "pageerror");   // the ones raised by a click are failures of that item; the others are listed
rows.push({ ctx: "all", item: "(page errors outside the clicks)", status: "info", reason: pageErr.map(e => e.text).join(" | ").slice(0, 300) });
const nf = summarize(rows, outFile);
await browser.close();
process.exit(nf ? 1 : 0);
