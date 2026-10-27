// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const upstream = process.env.EO_UPSTREAM || path.join(require('node:os').homedir(), 'elixiroffice/DocumentServer');
const web = process.env.EO_WEB_APPS || path.join(upstream, 'web-apps');
const core = fs.readFileSync(path.join(web, 'apps/common/main/lib/elixir-localfonts/Core.js'), 'utf8');

// Execute the full production AMD module. Font discovery and file loading are
// external boundaries; the enable callback and relayout implementation stay real.
function fixture() {
 const calls = [], storage = new Map();
 let completeLoad;
 const AscCommon = {
  g_font_loader: {LoadDocumentFonts() {}, LoadFonts: (_names, callback) => { completeLoad = callback; }},
  g_fontManager2: {ClearFontsRasterCache: () => calls.push('raster')}
 };
 const AscFonts = {g_font_infos: [], g_font_files: [], g_map_font_index: {},
  g_fontApplication: {FontPickerMap: {old: true}}, CFontFileLoader() {}, CFontInfo() {}};
 const window = {AscCommon, AscFonts, Common: {}, console,
  localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
  eoDesktop: {fontConsent() {}, fontPermission: async() => true}};
 vm.runInNewContext(core, {window, AscCommon, define: (_deps, factory) => factory(),
  performance, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, navigator: {}});
 const LF = window.Common.ElixirLocalFonts;
 const api = {WordControl: {
  m_oLogicDocument: {
   GetAllParagraphs: () => [{Recalc_CompiledPr: () => calls.push('paragraph'), Recalc_RunsCompiledPr: () => calls.push('runs')}],
   RecalculateFromStart: (...args) => calls.push(['recalculate', ...args])
  }, m_oDrawingDocument: {ClearCachePages: () => calls.push('pages')}
 }};
 LF.readList = async() => [];
 LF.register = () => [];
 LF.docFonts = ['Public Fixture Font'];
 LF.isLocal = () => true;
 return {LF, api, calls, AscFonts, AscCommon, complete: () => { assert(completeLoad); completeLoad(); }, waitLoad: async() => {
  for (let i = 0; i < 10 && !completeLoad; i++) await Promise.resolve();
  assert(completeLoad, 'The actual enable path must reach the asynchronous font loader');
 }};
}
test('late font-load completion opts into viewport preservation and retains real invalidation order', async() => {
 const f = fixture();
 const pending = f.LF.enable(f.api);
 await f.waitLoad();
 assert.deepEqual(f.calls, [], 'Do not recalculate before actual font loading completes');
 f.complete();
 const result = await pending;
 assert.equal(result.relayout, true);
 assert.deepEqual(f.calls, ['paragraph', 'runs', 'raster', 'pages', ['recalculate', true, true]]);
 assert.deepEqual(Object.keys(f.AscFonts.g_fontApplication.FontPickerMap), []);
});
test('ordinary Word relayout uses the same preserving recalculation contract', () => {
 const f = fixture();
 assert.equal(f.LF.relayout(f.api), true);
 assert.deepEqual(f.calls.at(-1), ['recalculate', true, true]);
});
test('Cell and Slide do not enter the Word-only local-font relayout path', () => {
 const f = fixture();
 assert.equal(f.LF.relayout({wb: {}}), false);
 assert.equal(f.LF.relayout({Presentation: {}}), false);
 assert.deepEqual(f.calls, []);
});

test('the actual packaged Word bundle uses the preserving relayout contract', () => {
 const f = fixture();
 const bundle = process.env.EO_FONT_APP_BUNDLE ||
  path.join(__dirname, '../../desktop/assets/web-apps/apps/documenteditor/main/app.js');
 const packed = fs.readFileSync(bundle, 'utf8');
 const start = packed.indexOf('LF.relayout=function(api)');
 const end = packed.indexOf(',LF.guiFonts=', start);
 assert(start >= 0 && end > start, 'Expected local-font relayout module in the actual production Word bundle');
 const implementation = packed.slice(start + 'LF.relayout='.length, end);
 const relayout = vm.runInNewContext('(' + implementation + ')', {
  engine: () => f.AscFonts, AscCommon: f.AscCommon, window: {console}
 });
 assert.equal(relayout(f.api), true);
 assert.deepEqual(f.calls.at(-1), ['recalculate', true, true],
  'A standalone source copy does not replace the Core module compiled into Word app.js');
});
