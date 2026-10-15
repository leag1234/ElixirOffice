#!/usr/bin/env node
// PowerPoint keyboard shortcuts suite for the ElixirOffice presentation editor.
//
// Usage (on the dev host, Playwright installed in /srv/elixiroffice/pw):
//   node tests/shortcuts-pptx/run.mjs http://localhost:32773 [--only id1,id2] [--out dir] [--platform win|mac]
//
// Each case of cases.mjs plays one shortcut of docs/shortcuts-powerpoint.csv
// in a real editor (Chromium, headless) and checks its effect through the
// editor state (API, toolbar state, visible panels). Writes results.json and
// prints one line per case. Exit code 1 when a case fails.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cases } from './cases.mjs';

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT || path.join(process.env.HOME, 'elixiroffice/pw/node_modules/playwright');
const { chromium } = require(pwPath);
const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const base = (argv[0] || 'http://localhost:8080').replace(/\/$/, '');
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const only = opt('only') ? opt('only').split(',') : null;
const outDir = opt('out', path.join(here, 'out'));
const platform = opt('platform', 'win');
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// macOS keys of a case: `mac` when given (verbatim; null: no shortcut on macOS), else `keys` with Control+ as Cmd+
const keysFor = c => (platform !== 'mac' ? [].concat(c.keys) : c.mac === null ? null : c.mac ? [].concat(c.mac) : [].concat(c.keys).map(k => k.replace(/Control\+/g, 'Meta+')));
const fixture = path.resolve(here, '../fixtures/pptx', opt('file', 'p02-blank-16x9.pptx'));
fs.mkdirSync(outDir, { recursive: true });

async function openEditor(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(platform === 'mac' ? { userAgent: MAC_UA } : {}) });
  if (platform === 'mac') await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const r = await ctx.request.post(base + '/example/upload', {
    multipart: { uploadedFile: { name: path.basename(fixture), mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: fs.readFileSync(fixture) } },
  });
  const j = await r.json();
  await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`);
  const fh = await page.waitForSelector('iframe[name=frameEditor]', { timeout: 60000 });
  const f = await fh.contentFrame();
  await f.waitForFunction(() => window.PE && PE.getController('Main') && PE.getController('Main').api && PE.getController('Main').api.getCountPages() > 0, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  return { ctx, page, f, errors };
}

function helpers(page, f) {
  const t = {
    page, f, mod: platform === 'mac' ? 'Meta' : 'Control',
    ev: (fn, arg) => f.evaluate(fn, arg),
    wait: ms => page.waitForTimeout(ms),
    press: async k => { await page.keyboard.press(k); await page.waitForTimeout(500); },
    // the slide area (centre of the editing canvas)
    slideCenter: async () => {
      const b = await f.evaluate(() => { const r = (document.querySelector('#id_main_view') || document.querySelector('#editor_sdk')).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      const fb = await (await f.frameElement()).boundingBox();
      return [fb.x + b[0] + b[2] / 2, fb.y + b[1] + b[3] / 2];
    },
    goSlide: async n => { await f.evaluate(n => PE.getController('Main').api.goToPage(n), n); await page.waitForTimeout(600); },
    // put the caret in the title placeholder of slide 1 and select its text
    editTitle: async () => {
      await t.goSlide(0);
      const [x, y] = await t.slideCenter();
      await page.mouse.click(x, y - 60);
      await page.waitForTimeout(400);
      await page.keyboard.press(platform === 'mac' ? 'Meta+A' : 'Control+A');
      await page.waitForTimeout(300);
    },
    // select the title shape itself (not its text)
    selectShape: async () => { await t.editTitle(); await page.keyboard.press('Escape'); await page.waitForTimeout(400); },
    clickCanvas: async () => { const [x, y] = await t.slideCenter(); await page.mouse.click(x + 300, y + 200); await page.waitForTimeout(300); },
    // spy on an API method or a function path: returns how many times it was called since the spy
    spy: name => f.evaluate(name => {
      const api = PE.getController('Main').api;
      window.__elxSpy = window.__elxSpy || {};
      window.__elxSpy[name] = 0;
      if (!api['__orig_' + name]) {
        api['__orig_' + name] = api[name];
        api[name] = function () { window.__elxSpy[name]++; return api['__orig_' + name].apply(this, arguments); };
      }
    }, name),
    spied: name => f.evaluate(name => (window.__elxSpy || {})[name] || 0, name),
    count: () => f.evaluate(() => PE.getController('Main').api.getCountPages()),
    current: () => f.evaluate(() => PE.getController('Main').api.getCurrentPage()),
    tb: (expr) => f.evaluate(new Function('return (function(tb){ return ' + expr + '; })(PE.getController("Toolbar").toolbar)')),
    visible: sel => f.evaluate(sel => $(sel).filter(':visible').length > 0, sel),
    // back to a neutral state between cases: no dialog, menu, backstage or slide show
    closeAll: async () => {
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
      await f.evaluate(() => {
        try { $('.asc-window:visible .tool.close').each(function () { this.click(); }); } catch (e) {}
        try { const fm = PE.getController('LeftMenu').leftMenu.menuFile; fm.isVisible() && fm.hide(); } catch (e) {}
        try { Common.UI.Menu.Manager.hideAll(); } catch (e) {}
        try { $('#pe-preview').is(':visible') && PE.getController('Main').api.EndDemonstration(); } catch (e) {}
        try { const lm = PE.getController('LeftMenu').leftMenu; lm.btnSearchBar && lm.btnSearchBar.pressed && PE.getController('LeftMenu').onShowHideSearch(false); } catch (e) {}
      });
      await page.waitForTimeout(300);
    },
    clickThumb: async n => {
      const fb = await (await f.frameElement()).boundingBox();
      const r = await f.evaluate(() => { const e = document.querySelector('#id_panel_thumbnails'); const b = e.getBoundingClientRect(); return [b.left, b.top, b.width]; });
      await page.mouse.click(fb.x + r[0] + r[2] / 2, fb.y + r[1] + 60 + n * 134);
      await page.waitForTimeout(400);
    },
  };
  return t;
}

const browser = await chromium.launch();
let session = await openEditor(browser);
let t = helpers(session.page, session.f);
const results = [];
for (const c of cases) {
  if (only && !only.includes(c.id)) continue;
  const keys = keysFor(c);
  if (!keys) continue;
  if (c.fresh) { await session.ctx.close(); session = await openEditor(browser); t = helpers(session.page, session.f); }
  let ok = false, info = '';
  try {
    if (c.setup) await c.setup(t);
    for (const k of keys) await t.press(k);
    await t.wait(c.wait || 300);
    const r = await c.check(t);
    ok = r === true; info = r === true ? '' : String(r);
  } catch (e) { info = 'error: ' + String(e).slice(0, 200); }
  try { if (c.teardown) await c.teardown(t); await t.closeAll(); } catch (e) {}
  results.push({ id: c.id, platform, keys: keys.join(' '), ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id.padEnd(28)} ${keys.join(' ').padEnd(22)} ${info}`);
}
fs.writeFileSync(path.join(outDir, platform === 'mac' ? 'results-mac.json' : 'results.json'), JSON.stringify({ base, date: new Date().toISOString(), errors: session.errors, results }, null, 1));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${session.errors.length ? ', page errors: ' + session.errors.length : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
