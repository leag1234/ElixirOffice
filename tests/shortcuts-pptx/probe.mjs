// Debug helper: node probe.mjs <base> — prints the editor state around the title edit
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, 'elixiroffice/pw/node_modules/playwright'));
const base = process.argv[2];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const fx = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fixtures/pptx/p02-blank-16x9.pptx');
const r = await ctx.request.post(base + '/example/upload', { multipart: { uploadedFile: { name: 'p02.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: fs.readFileSync(fx) } } });
const j = await r.json(); await p.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`);
const f = await (await p.waitForSelector('iframe[name=frameEditor]')).contentFrame();
await f.waitForFunction(() => { try { return PE.getController('Main').api.getCountPages() > 0; } catch (e) { return false; } }, null, { timeout: 90000 });
await p.waitForTimeout(4000);
const st = () => f.evaluate(() => { const a = PE.getController('Main').api; return { sel: a.getSelectedElements().map(e => e.get_ObjectType()), text: a.asc_GetSelectedText && a.asc_GetSelectedText(), al: PE.getController('Toolbar')._state.pralign, fs: PE.getController('Toolbar').toolbar.cmbFontSize.getValue(), act: document.activeElement.id || document.activeElement.tagName }; });
const box = await f.evaluate(() => { const e = document.querySelector('#id_main_view'); const r = (e || document.querySelector('#editor_sdk')).getBoundingClientRect(); return [r.left, r.top, r.width, r.height, !!e]; });
console.log('main view', box);
const x = box[0] + box[2] / 2, y = box[1] + box[3] / 2 - 60;
for (const step of (process.argv[3] || 'click,Control+A,Control+R,Control+Shift+Period').split(',')) {
  const api = 'PE.getController("Main").api';
  if (step === 'enable') { console.log('fullscreen', await f.evaluate(() => !!document.fullscreenElement)); await f.evaluate(() => PE.getController('Main').api.asc_enableKeyEvents(true)); }
  else if (step === 'ribbon') await f.evaluate(() => PE.getController('SlideRibbon').startShow(false));
  else if (step === 'fsbtn') await f.click('#btn-preview-fullscreen');
  else if (step === 'state') console.log('state', await f.evaluate(() => { const a = PE.getController('Main').api; return [a.isPreviewMode ? 'pm' : '', !!document.fullscreenElement, $('#pe-preview').is(':visible'), a.WordControl && a.WordControl.DemonstrationManager && a.WordControl.DemonstrationManager.Mode, a.isViewMode, a.asc_IsFocus && a.asc_IsFocus()]; }));
  else if (step === 'cm') console.log('comments', await f.evaluate(() => [$('#left-panel-comments').is(':visible'), $('#comments-box textarea:visible').length, $('.elx-comments-dock').is(':visible'), PE.getController('LeftMenu').leftMenu.btnComments.pressed, PE.getCollection('Common.Collections.Comments').length, !!(PE.getController('Main').appOptions.canComments)]));
  else if (step === 'bold?') console.log('bold', await f.evaluate(() => PE.getController('Toolbar').toolbar.btnBold.pressed));
  else if (/^dy/.test(step)) { await p.mouse.click(x, y + parseInt(step.slice(2))); }
  else if (step === 'stock') await f.evaluate(() => PE.getController('Toolbar').onPreview(0, false, false));
  else if (step === 'go0') await f.evaluate(() => PE.getController('Main').api.goToPage(0));
  else if (step === 'click') await p.mouse.click(x, y);
  else if (step === 'dbl') await p.mouse.dblclick(x, y);
  else await p.keyboard.press(step);
  await p.waitForTimeout(600);
  console.log(step.padEnd(22), JSON.stringify(await st()));
}
await p.screenshot({ path: process.env.HOME + '/elixiroffice/wt/slide-work/probe.png' }); await b.close();
