// SPDX-License-Identifier: AGPL-3.0-only
// W2 ten-page acceptance: selective fonts, persistent cache, memory and missing-font fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.join(os.homedir(), 'elixiroffice/pw/package.json'));
const { chromium } = require('playwright');
const base = process.env.EO_BASE;
assert.ok(base && !/:8080(?:\/|$)/.test(base), 'explicit own EO_BASE required');
const out = process.env.EO_FONT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-fonts-'));
fs.mkdirSync(out, { recursive: true });
const fixture = path.join(out, 'fonts-ten-pages.docx');
execFileSync('python3', ['-c', "import zipfile,sys\nns=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"\nbody=\"\"\nfor i in range(10):\n body+='<w:p><w:r><w:rPr><w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\"/><w:sz w:val=\"24\"/></w:rPr><w:t>Font selection page '+str(i+1)+'. Only this document font is needed.</w:t></w:r></w:p>'\n if i<9:body+='<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>'\ndoc='<w:document xmlns:w=\"'+ns+'\"><w:body>'+body+'<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:right=\"1440\"/></w:sectPr></w:body></w:document>'\nwith zipfile.ZipFile(sys.argv[1],\"w\",zipfile.ZIP_DEFLATED) as z:\n z.writestr(\"[Content_Types].xml\",'<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>')\n z.writestr(\"_rels/.rels\",'<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>')\n z.writestr(\"word/document.xml\",doc)\n", fixture]);
const browser = await chromium.launch({ args: ['--disable-gpu', '--enable-precise-memory-info'] });
try {
 const ctx = await browser.newContext({ acceptDownloads: true });
 let fontResponseBytes = 0, requests = [], phase = 'editor startup';
 ctx.on('response', async response => {
  if (/\/fonts\//.test(response.url())) {
   const body = await response.body().catch(() => Buffer.alloc(0));
   fontResponseBytes += body.length; requests.push({ phase, url: response.url(), decodedResponseBytes: body.length });
  }
 });
 const page = await ctx.newPage();
 const upload = await ctx.request.post(base + '/example/upload', { multipart: { uploadedFile: {
  name: 'fonts-ten-pages.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: fs.readFileSync(fixture)
 } } });
 const uploaded = await upload.json(); assert.ok(!uploaded.error);
 await page.goto(base + '/example/editor?fileName=' + encodeURIComponent(uploaded.filename) + '&lang=en');
 const frame = await (await page.waitForSelector('iframe[name=frameEditor]', { timeout: 90000 })).contentFrame();
 await frame.waitForFunction(() => {
  const e = window.editor, w = e && e.WordControl, d = w && w.m_oDrawingDocument, l = w && w.m_oLogicDocument;
  return d && l && d.m_lPagesCount === 10 && d.m_lCountCalculatePages >= 10 && !(l.FullRecalc && l.FullRecalc.Id) && !e.isLongAction();
 }, null, { timeout: 120000 });
 const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
 let peakJsHeap = 0;
 const sample = async () => { const m = await cdp.send('Performance.getMetrics'); peakJsHeap = Math.max(peakJsHeap, m.metrics.find(x => x.name === 'JSHeapUsedSize')?.value || 0); };
 phase = 'wasm PDF export';
 const timer = setInterval(() => sample().catch(() => {}), 100);
 try {
  const download = page.waitForEvent('download', { timeout: 120000 });
  await frame.evaluate(() => window.editor.asc_DownloadAs(new window.Asc.asc_CDownloadOptions(window.Asc.c_oAscFileType.PDF)));
  await (await download).saveAs(path.join(out, 'ten-pages.pdf'));
 } finally { clearInterval(timer); await sample(); }
 phase = 'post-export checks';
 const stats = await frame.evaluate(() => AscCommon.ClientPdf.last);
 assert.equal(stats.backend, 'wasm'); assert.ok(!stats.fallbacks); assert.equal(stats.pages, 10);
 assert.ok(stats.fontFiles > 0 && stats.fontFiles <= 2); assert.ok(stats.fontBytes < 2 * 1024 * 1024);
 const cached = await frame.evaluate(async () => {
  const cache = await caches.open('eo-wasm-fonts-v1');
  return { keys: (await cache.keys()).map(x => x.url), totalFonts: AscFonts.g_font_infos.length };
 });
 assert.equal(requests.filter(r => r.phase === 'wasm PDF export').length, 0);
 assert.equal(cached.keys.length, stats.fontFiles); assert.ok(stats.fontFiles < cached.totalFonts);
 const cacheResult = await frame.evaluate(async () => {
  const name = AscCommon.ClientPdf.last.fonts[0].name;
  const info = AscFonts.g_font_infos[AscFonts.g_map_font_index[name]];
  const id = info.GetFontID(AscCommon.g_font_loader, 0), old = id.file.Status;
  id.file.Status = -1;
  try {
   const result = await EOWasmFonts.ensureFonts([{ name, style: 0 }]);
   return { missing: result.missing.length, cacheHit: result.written[0]?.cacheHit };
  } finally { id.file.Status = old; }
 });
 assert.equal(cacheResult.missing, 0); assert.equal(cacheResult.cacheHit, true);
 const cold = await frame.evaluate(async () => {
  const name = AscCommon.ClientPdf.last.fonts[0].name;
  const info = AscFonts.g_font_infos[AscFonts.g_map_font_index[name]];
  const id = info.GetFontID(AscCommon.g_font_loader, 0), old = id.file.Status;
  const expected = await AscCommon.ClientPdf.fonts.get(name, 0);
  await caches.delete('eo-wasm-fonts-v1');
  id.file.Status = -1;
  try {
   const result = await EOWasmFonts.ensureFonts([{ name, style: 0 }]);
   return { files: result.written.length, bytes: result.bytes, downloadedBytes: result.written[0]?.downloadBytes, missing: result.missing.length,
    matchesEditorBytes: result.written[0]?.bytes.length === expected.bytes.length && result.written[0].bytes.every((x, i) => x === expected.bytes[i]) };
  } finally { id.file.Status = old; }
 });
 assert.equal(cold.matchesEditorBytes, true);
 assert.equal(cold.missing, 0); assert.equal(cold.files, 1); assert.equal(cold.downloadedBytes, stats.fontBytes);
 // Use that cold-fetched/cache-backed font in the real native PDF conversion.
 const coldLoader = await frame.evaluate(() => {
  const name = AscCommon.ClientPdf.last.fonts[0].name;
  const id = AscFonts.g_font_infos[AscFonts.g_map_font_index[name]].GetFontID(AscCommon.g_font_loader, 0);
  const old = id.file.Status; id.file.Status = -1; return { name, old };
 });
 try {
  const coldDl = page.waitForEvent('download', { timeout: 120000 });
  await frame.evaluate(() => window.editor.asc_DownloadAs(new window.Asc.asc_CDownloadOptions(window.Asc.c_oAscFileType.PDF)));
  await (await coldDl).saveAs(path.join(out, 'cold-font.pdf'));
  const coldStats = await frame.evaluate(() => AscCommon.ClientPdf.last);
  assert.equal(coldStats.backend, 'wasm'); assert.ok(!coldStats.fallbacks);
  for (const file of ['ten-pages', 'cold-font']) execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-r', '72', '-png', path.join(out, file + '.pdf'), path.join(out, file)]);
  assert.deepEqual(fs.readFileSync(path.join(out, 'ten-pages.png')), fs.readFileSync(path.join(out, 'cold-font.png')));
 } finally {
  await frame.evaluate(({ name, old }) => {
   AscFonts.g_font_infos[AscFonts.g_map_font_index[name]].GetFontID(AscCommon.g_font_loader, 0).file.Status = old;
  }, coldLoader);
 }
 const acceptanceRequests = requests.slice();
 phase = 'injected missing-font fallback';
 const missing = await frame.evaluate(async () => {
  const result = await EOWasmFonts.ensureFonts([{ name: 'EO Missing Synthetic Font', style: 0 }]);
  // Inject the real missing-font error into the existing wasm -> JS fallback path.
  EOWasmFonts.prepareFS = async () => { const e = new Error('client PDF: unsupported font (' + result.missing[0].reason + ')'); e.eoUnsupported = true; e.code = 'font'; throw e; };
  return result.missing[0].reason;
 });
 assert.match(missing, /not in editor font index/);
 const fallbackDl = page.waitForEvent('download', { timeout: 120000 });
 await frame.evaluate(() => window.editor.asc_DownloadAs(new window.Asc.asc_CDownloadOptions(window.Asc.c_oAscFileType.PDF)));
 await (await fallbackDl).saveAs(path.join(out, 'fallback.pdf'));
 const fallback = await frame.evaluate(() => AscCommon.ClientPdf.last);
 assert.equal(fallback.backend, 'js'); assert.ok(JSON.stringify(fallback.fallbacks).includes('EO Missing Synthetic Font'));
 const report = { pages: stats.pages, fontFiles: stats.fontFiles, fontBytes: stats.fontBytes,
  exportFontDownloadedBytes: stats.fontDownloadedBytes, coldSelectedFontDownload: cold,
  fontResponseBytesBeforeFallback: acceptanceRequests.reduce((n, r) => n + r.decodedResponseBytes, 0),
  requests: acceptanceRequests, cacheEntries: cached.keys.length, availableFonts: cached.totalFonts,
  peakMainJsHeapBytesSampled100ms: peakJsHeap, workerLinearMemoryBytes: stats.heapBytes,
  cacheHit: true, coldFontNativeRenderMatches: true, missingReason: missing, fallbackBackend: fallback.backend };
 fs.writeFileSync(path.join(out, 'fonts-report.json'), JSON.stringify(report, null, 2) + '\n');
 console.log(JSON.stringify(report, null, 2));
 await ctx.close();
} finally { await browser.close(); }
