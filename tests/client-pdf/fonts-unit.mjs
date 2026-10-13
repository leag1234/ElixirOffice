// SPDX-License-Identifier: AGPL-3.0-only
// W2 shared font service: selective IO, persistent cache, consent and native FS records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const source = fs.readFileSync(process.env.EO_FONT_SOURCE || path.resolve(process.env.UPSTREAM || path.join(os.homedir(), 'elixiroffice/DocumentServer'), 'sdkjs/common/clientpdf/wasm-fonts.js'), 'utf8');
const font = new Uint8Array(fs.readFileSync(process.env.LF_FONT_FILE || path.join(os.homedir(), '.local/share/fonts/elixir-localfonts-test/FiraSans-Regular.ttf')));
const guid = [160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
const wire = font.slice(); for (let i = 0; i < 32; i++) wire[i] ^= guid[i % 16];
const cache = new Map(); let fetched = [], localReads = 0, permission = 'granted', allowed = false, queried = 0, permissionQueries = 0;
function context(availableStyles, desktopBridge) {
  const file = { Id: 'selected.ttf', Status: -1, stream_index: -1 };
  const localFile = { Id: 'local-font:Fira', Status: -1, localFontData: {} };
  const info = { GetFontID: (_, style) => !availableStyles || availableStyles.includes(style) ? ({ file, faceIndex: 0 }) : null, GetNeedInfo: () => ({}) };
  const localInfo = { isLocalFont: true, GetFontID: () => ({ file: localFile, faceIndex: 0 }) };
  const window = { location: { href: 'https://editor.test/editor/' },
    AscFonts: { g_map_font_index: { Selected: 0, Local: 1 }, g_font_infos: [info, localInfo], g_fonts_streams: [] },
    AscCommon: { g_font_loader: { fontFilesPath: '/fonts/' }, ClientPdf: { fonts: { get: async () => { localReads++; return { key: 'local', bytes: font, faceIndex: 0 }; } } } },
    Common: { ElixirLocalFonts: { hasConsent: () => allowed, isLocal: n => n === 'Local' } },
    navigator: { permissions: { query: async () => { permissionQueries++; return { state: permission }; } } },
    queryLocalFonts: () => { queried++; throw new Error('must never enumerate'); },
    caches: { open: async name => { assert.equal(name, 'eo-wasm-fonts-v1'); return {
      match: async key => cache.has(key) ? new Response(cache.get(key)) : undefined,
      put: async (key, response) => { cache.set(key, await response.arrayBuffer()); }
    }; } } };
  if(desktopBridge)window.parent=desktopBridge==='cross-origin'?Object.defineProperty({},'eoDesktop',{get(){throw new Error('Cross-origin parent')}}):{eoDesktop:desktopBridge};
  vm.runInNewContext(source, { window, Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, URL, Response,
    Map, Set, fetch: async url => { fetched.push(url); return new Response(wire); } });
  return window.EOWasmFonts;
}
let api = context(), result = await api.ensureFonts([{ name: 'Selected', style: 0 }]);
assert.equal(result.missing.length, 0); assert.equal(result.bytes, font.length);
assert.deepEqual(Buffer.from(result.written[0].bytes), Buffer.from(font));
assert.deepEqual(fetched, ['https://editor.test/fonts/selected.ttf']);
assert.equal(cache.size, 1);
api = context();
result = await api.ensureFonts([{ name: 'Selected', style: 0 }, { name: 'Selected', style: 1 }]);
assert.equal(fetched.length, 1); assert.equal(result.bytes, font.length);
assert.equal(result.written[0].cacheHit, true); assert.equal(result.written[0].path, result.written[1].path);
const files = new Map();
await api.prepareFS({ FS: { mkdirTree: p => assert.equal(p, '/fonts'), writeFile: (p, u) => files.set(p, u) } }, [{ name: 'Selected', style: 0 }]);
assert.equal(files.size, 2); assert.equal(files.get('/fonts/font0.ttf').length, font.length);
const selection = files.get('/font_selection.bin'), dv = new DataView(selection.buffer);
assert.equal(dv.getInt32(0, true), 1);
assert.equal(dv.getInt32(4, true), selection.length - 4);
assert.ok(new TextDecoder().decode(selection).includes('/fonts/font0.ttf'));
let recordPos = 8;
recordPos += 4 + dv.getUint32(recordPos, true);
recordPos += 4; // zero aliases
recordPos += 4 + dv.getUint32(recordPos, true);
const fontView = new DataView(font.buffer, font.byteOffset, font.byteLength), tables = {};
for (let i = 0; i < fontView.getUint16(4); i++) {
 const p = 12 + i * 16;
 tables[String.fromCharCode(...font.subarray(p, p + 4))] = fontView.getUint32(p + 8);
}
assert.equal(dv.getInt16(recordPos + 62, true), Math.trunc(fontView.getInt16(tables['OS/2'] + 2) * 1000 / fontView.getUint16(tables.head + 18)));
const deduplicated = api.selection([
 { name: 'Selected', path: '/fonts/font0.ttf', bytes: font, faceIndex: 0, style: 0 },
 { name: 'Selected', path: '/fonts/font0.ttf', bytes: font, faceIndex: 0, style: 1 }
]);
assert.equal(new DataView(deduplicated.buffer).getUint32(0, true), 1);
result = await api.ensureFonts(['Missing']);
assert.equal(result.written.length, 0); assert.match(result.missing[0].reason, /not in editor font index/);
await assert.rejects(api.prepareFS({ FS: {} }, ['Missing']), /unsupported font.*Missing/);
result = await api.ensureFonts([{ name: 'Local', style: 0 }]);
assert.match(result.missing[0].reason, /consent/); assert.equal(localReads, 0); assert.equal(queried, 0);
allowed = true; permission = 'denied';
result = await api.ensureFonts([{ name: 'Local', style: 0 }]);
assert.match(result.missing[0].reason, /consent/); assert.equal(localReads, 0);
permission = 'granted';
result = await api.ensureFonts([{ name: 'Local', style: 0 }]);
assert.equal(result.missing.length, 0); assert.equal(localReads, 1); assert.equal(cache.size, 1);
allowed = false;
result = await api.ensureFonts([{ name: 'Local', style: 0 }]);
assert.equal(result.written.length, 0); assert.equal(localReads, 1); assert.equal(queried, 0);
// Desktop PDF font loading must check native consent without prompting or browser permissions.
allowed=true;let desktopGranted=false,desktopChecks=0,desktopPrompts=0;
const desktopApi=context(undefined,{fontConsent:async()=>{desktopPrompts++;throw Error('PDF must not prompt')},fontPermission:async()=>{desktopChecks++;return desktopGranted}});
const browserChecks=permissionQueries,readsBefore=localReads;
result=await desktopApi.ensureFonts([{name:'Local',style:0}]);
assert.equal(result.written.length,0);assert.equal(localReads,readsBefore);assert.equal(permissionQueries,browserChecks);
desktopGranted=true;result=await desktopApi.ensureFonts([{name:'Local',style:0}]);
assert.equal(result.missing.length,0);assert.equal(localReads,readsBefore+1);assert.equal(permissionQueries,browserChecks);assert.equal(desktopPrompts,0);
allowed=false;const checksBefore=desktopChecks;result=await desktopApi.ensureFonts([{name:'Local',style:0}]);
assert.equal(result.written.length,0);assert.equal(desktopChecks,checksBefore);assert.equal(permissionQueries,browserChecks);
console.log('PASS desktop PDF native consent/no prompt/no browser permissions; web font behavior retained');
allowed=true;permission='granted';const webEmbedded=context(undefined,'cross-origin');
result=await webEmbedded.ensureFonts([{name:'Local',style:0}]);assert.equal(result.missing.length,0);
console.log('PASS web Local Font Access unchanged inside cross-origin embedding');
function str(s) { const u = Buffer.from(s, 'utf16le'), n = Buffer.alloc(2); n.writeUInt16LE(s.length); return Buffer.concat([n, u]); }
const drawing = Uint8Array.from(Buffer.concat([Buffer.from([202,41]), str('Selected'), Buffer.from([80]), str('hello'), Buffer.alloc(8), Buffer.from([203])]));
const entries = api.fontsOfDocument(drawing);
assert.deepEqual(JSON.parse(JSON.stringify(entries)), [{ name: 'Selected', style: 0 }]);
const regularOnly = context([0]);
result = await regularOnly.ensureFonts(regularOnly.fontsOfDocument(drawing));
assert.equal(result.missing.length, 0); assert.equal(result.written.length, 1);
const regularFiles = new Map();
await regularOnly.prepareFS({ FS: { mkdirTree() {}, writeFile: (p, u) => regularFiles.set(p, u) } }, regularOnly.fontsOfDocument(drawing));
assert.equal(regularFiles.size, 2);
result = await regularOnly.ensureFonts(['Selected']);
assert.deepEqual(Array.from(result.missing, f => f.style), [1, 2, 3]);
const boldStyle = Buffer.alloc(5); boldStyle[0] = 43; boldStyle.writeInt32LE(1, 1);
const boldDrawing = Uint8Array.from(Buffer.concat([Buffer.from([202,41]), str('Selected'), boldStyle, Buffer.from([80]), str('bold'), Buffer.alloc(8), Buffer.from([203])]));
assert.deepEqual(JSON.parse(JSON.stringify(api.fontsOfDocument([drawing, boldDrawing, drawing]))), [
 { name: 'Selected', style: 0 }, { name: 'Selected', style: 1 }
]);
assert.throws(() => api.fontsOfDocument(drawing.slice(0, -5)));
const name = Buffer.from('Selected', 'utf16le'), field = Buffer.alloc(5); field[0] = 1; field.writeUInt32LE(name.length, 1);
const row = Buffer.concat([field, name]), record = Buffer.alloc(5); record.writeUInt32LE(row.length, 1);
const table = Buffer.concat([record, row]), len = Buffer.alloc(4); len.writeUInt32LE(table.length);
const header = Buffer.from('DOCY;v10;0;'), directory = Buffer.alloc(6); directory[0] = 1; directory[1] = 22; directory.writeUInt32LE(header.length + directory.length, 2);
assert.deepEqual(Array.from(api.fontsOfDocument(Uint8Array.from(Buffer.concat([header, directory, len, table])))), ['Selected']);
assert.throws(() => api.fontsOfDocument(new Uint8Array([1,2])), /unsupported document/);
console.log('PASS selective server/cache/FS/native selection/missing/consent/revocation/drawing/binary checks');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'font-subset-'));
fs.mkdirSync(path.join(temp, 'fonts'));
fs.writeFileSync(path.join(temp, 'fonts/font0.ttf'), font);
const native = api.selection([
 { name: 'Selected', path: '/fonts/font0.ttf', bytes: font, faceIndex: 0, style: 0 },
 { name: 'Unrelated', path: '/fonts/must-not-be-opened.ttf', bytes: font, faceIndex: 0, style: 0 }
]);
fs.writeFileSync(path.join(temp, 'selection.bin'), native);
fs.writeFileSync(path.join(temp, 'names.json'), JSON.stringify(['Selected']));
const tool = new URL('../../tools/wasm/subset-fonts.py', import.meta.url).pathname;
const report = JSON.parse(execFileSync('python3', [tool, path.join(temp, 'selection.bin'), path.join(temp, 'names.json'), path.join(temp, 'subset'), '--font-root', temp], { encoding: 'utf8' }));
assert.equal(report.files, 1); assert.equal(report.records, 1); assert.equal(report.bytes, font.length);
assert.deepEqual(fs.readFileSync(path.join(temp, 'subset/fonts/font0.ttf')), Buffer.from(font));
fs.writeFileSync(path.join(temp, 'missing.json'), JSON.stringify(['Missing']));
assert.throws(() => execFileSync('python3', [tool, path.join(temp, 'selection.bin'), path.join(temp, 'missing.json'), path.join(temp, 'missing-out'), '--font-root', temp], { stdio: 'pipe' }), /Command failed/);
console.log('PASS native subset generator opens selected files only and rejects missing families');
fs.rmSync(temp, { recursive: true, force: true });
