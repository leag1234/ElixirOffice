// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function icon(entries){const parts=entries.map(([type,data=Buffer.alloc(4)])=>{const header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(data.length+8,4);return Buffer.concat([header,data])});const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+parts.reduce((n,b)=>n+b.length,0),4);return Buffer.concat([header,...parts])}
test('Mac build uses the checked-in Apple ICNS rather than the PNG converter',()=>{
 const base=require('../../desktop/package.json').build,config=require('../../tools/desktop/mac-config.cjs').configuration({});
 assert.equal(path.extname(base.mac.icon),'.icns');assert.equal(path.resolve(root,'desktop',base.mac.icon),config.mac.icon);
 assert(fs.readFileSync(config.mac.icon).subarray(0,4).equals(Buffer.from('icns')));
 assert.equal(base.linux.icon,'icon.png');assert.equal(base.win.icon,'icon.png');
});
test('ICNS parser rejects either noisy legacy small-size entry even with valid PNG bytes',()=>{
 const {validate}=require('../../tools/desktop/check-icns.cjs');
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
 for(const type of ['icp4','icp5'])assert.throws(()=>validate(icon([['ic04'],['ic05'],[type,png]])),/legacy/);
 assert.deepEqual(validate(icon([['ic04'],['ic05'],['ic09']])).types,['ic04','ic05','ic09']);
});
test('ICNS parser fails closed on corrupt lengths, missing small icons and trailing bytes',()=>{
 const {validate}=require('../../tools/desktop/check-icns.cjs');
 const good=icon([['ic04'],['ic05']]),shortChunk=Buffer.from(good);shortChunk.writeUInt32BE(7,12);
 const hugeChunk=Buffer.from(good);hugeChunk.writeUInt32BE(0xffffffff,12);
 for(const bytes of [Buffer.alloc(0),Buffer.from('not an icon'),good.subarray(0,-1),Buffer.concat([good,Buffer.alloc(1)]),shortChunk,hugeChunk,icon([['ic04']]),icon([['ic05']]),icon([['ic04'],['ic05'],['ic04']])])assert.throws(()=>validate(bytes));
});
test('Pinned icon has safe small-size entries and the package audit checks the actual bundled icon',()=>{
 const {validate}=require('../../tools/desktop/check-icns.cjs'),config=require('../../tools/desktop/mac-config.cjs').configuration({});
 const report=validate(fs.readFileSync(config.mac.icon));assert(report.types.includes('ic04'));assert(report.types.includes('ic05'));
 const audit=fs.readFileSync(path.join(root,'tools/desktop/check-mac.cjs'),'utf8');
 assert.match(audit,/require\('\.\/check-icns\.cjs'\)\.validate\(fs\.readFileSync\(icon\)\)/);
 assert(!audit.includes("'.icon-icns'"));assert.match(audit,/hash\(icon\),hash\(.*mac\.icon\)/);
});
