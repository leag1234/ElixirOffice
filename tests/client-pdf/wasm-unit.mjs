// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
// Resource scanner rejects malformed commands and snapshots reused renderer memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const sdk = process.env.EO_SDKJS || path.join(process.env.HOME, 'elixiroffice/wt/w1/sdkjs');
const context = { URL, Uint8Array, DataView, Map, Number, Promise,
	window: { location: { href: 'http://localhost/web-apps/apps/documenteditor/main/index.html' } },
	AscCommon: { ClientPdf: { registerBackend() {}, unsupported(code) { const e = new Error(code); e.code = code; return e; } } } };
vm.runInNewContext(fs.readFileSync(path.join(sdk, 'common/clientpdf/wasm-pdf.js'), 'utf8'), context);
const Scanner = context.window.EOWasmPdf.Scanner;
const s = new Scanner();
const int = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const str = (text, wide) => { const b = Buffer.from(text, 'utf16le'); const n = wide ? int(b.length) : Buffer.from([text.length & 255, text.length >> 8]); return Buffer.concat([n, b]); };
const stream = Buffer.concat([Buffer.from([202, 41]), str('Fira Sans'), Buffer.from([43]), int(1), Buffer.from([80]), str('text'), Buffer.alloc(8), Buffer.from([111]), str('blob:test', true), Buffer.alloc(16), Buffer.from([203])]);
const output = s.feed(new Uint8Array(stream));
stream.fill(0);
assert.equal(s.pages, 1);
assert.equal(s.fonts.get('Fira Sans|1').style, 1);
assert.equal(s.images.get('blob:test').path, 'media/image0.png');
assert.equal(output[0], 202);
assert.ok(Buffer.from(output).includes(Buffer.from('media/image0.png', 'utf16le')));
for (const broken of [[41, 255, 255], [83, 0], [31, 0], [169, 0, 0, 0, 0], [111, 255, 255, 255, 255], [8]]) {
	assert.throws(() => new Scanner().feed(new Uint8Array(broken)));
}
s.feed(new Uint8Array([202, 203]));
assert.equal(s.style, 0);
assert.equal(s.font, 'Arial');
console.log('wasm scanner: resource paths, font styles, snapshots and malformed input pass');
