// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sdk=process.env.EO_SDKJS;
assert(sdk,'EO_SDKJS is required');
const context={window:{AscFonts:{MEASURE_FONTSIZE:576,GRAPHEME_STRING_MAX_LEN:32,GRAPHEME_COEF:1}},AscCommon:{FontNameMap:{GetName:()=> 'Missing'}}};
context.AscFonts=context.window.AscFonts;context.AscCommon=context.window.AscCommon;
vm.runInNewContext(fs.readFileSync(path.join(sdk,'common/libfont/grapheme.js'),'utf8'),context);
const fonts=context.AscFonts;
function missing(codepoint){
 fonts.InitGrapheme(1,0);fonts.AddGlyphToGrapheme(0,64,0,0,0);
 return fonts.GetGrapheme({getCount:()=>1,get:()=>codepoint});
}
const first=missing(0x65E5),second=missing(0x672C);
assert.notEqual(first,second,'missing glyphs with different code points must not share a cached grapheme');
assert.deepEqual(Array.from(fonts.GetGraphemeCodePoints(first)),[0x65E5]);
assert.deepEqual(Array.from(fonts.GetGraphemeCodePoints(second)),[0x672C]);
const repeated=Array.from({length:10000},()=>missing(0x1F9D1));
assert.equal(new Set(repeated).size,1,'identical missing glyph requests must reuse one bounded cache entry');
assert.deepEqual(Array.from(fonts.GetGraphemeCodePoints(repeated[0])),[0x1F9D1]);
console.log('PASS missing-glyph grapheme cache preserves distinct Unicode and reuses identical requests');
