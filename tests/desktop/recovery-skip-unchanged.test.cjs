// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function loadDigest(){
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
 const match=source.match(/async function recoveryDigest\(snap\)\{[\s\S]*?\n\}/);
 assert.ok(match,'recoveryDigest not found in desktop/renderer.js');
 const context={crypto:globalThis.crypto,TextEncoder,Uint8Array,ArrayBuffer,DataView};
 vm.runInNewContext(match[0]+';recoveryDigest',context);
 return context.recoveryDigest;
}
const recoveryDigest=loadDigest();
const snap=(over={})=>({format:'docx',bytes:new Uint8Array([1,2,3]),resources:[{path:'media/a.png',bytes:new Uint8Array([9,8])}],...over});
test('same snapshot produces the same digest',async()=>{
 assert.equal(await recoveryDigest(snap()),await recoveryDigest(snap()));
});
test('one changed byte in bytes changes the digest',async()=>{
 const changed=snap();changed.bytes=new Uint8Array([1,2,4]);
 assert.notEqual(await recoveryDigest(snap()),await recoveryDigest(changed));
});
test('one changed resource byte changes the digest',async()=>{
 const changed=snap();changed.resources=[{path:'media/a.png',bytes:new Uint8Array([9,7])}];
 assert.notEqual(await recoveryDigest(snap()),await recoveryDigest(changed));
});
test('undefined and empty resources produce the same digest',async()=>{
 const without=snap();delete without.resources;
 assert.equal(await recoveryDigest(without),await recoveryDigest(snap({resources:[]})));
});
test('a different format changes the digest',async()=>{
 assert.notEqual(await recoveryDigest(snap()),await recoveryDigest(snap({format:'odt'})));
});
test('a subarray view of a larger buffer is hashed by its own bytes only',async()=>{
 const big=new Uint8Array([7,7,1,2,3,7,7]);
 assert.equal(await recoveryDigest(snap({bytes:big.subarray(2,5)})),await recoveryDigest(snap()));
});
test('field boundaries are part of the digest',async()=>{
 const a=snap({resources:[{path:'ab',bytes:new Uint8Array([1])}]}),b=snap({resources:[{path:'a',bytes:new Uint8Array([98,1])}]});
 assert.notEqual(await recoveryDigest(a),await recoveryDigest(b));
});

function loadUnchanged(){
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
 const start=source.indexOf('const RECOVERY_REFRESH_MS'),end=source.indexOf('async function recoveryCopy');
 assert.ok(start>0&&end>start,'history helpers not found');
 const context={};vm.runInNewContext(source.slice(start,end)+';this.historyMark=historyMark;this.recoveryUnchanged=recoveryUnchanged;',context);
 return context;
}
test('the undo history decides whether a document changed since the last recovery copy',()=>{
 const {historyMark,recoveryUnchanged}=loadUnchanged();
 const p1={},p2={},h={Points:[p1],Index:0},win={AscCommon:{History:h}};
 const mark=historyMark(win),last={token:'t',version:1,mark,at:0};
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),1000),true,'no edit');
 h.Points.push(p2);h.Index=1;
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),1000),false,'new edit');
 h.Index=0;h.Points.length=1;h.Points[0]=p1;
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),1000),true,'back to the same point');
 h.Points[1]=p2;h.Index=1;h.Points.length=2;h.Index=0;
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),1000),false,'undo leaves a redo point: length differs');
 h.Points.length=1;h.Points[0]={};
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),1000),false,'replaced point after undo and a new edit');
 h.Points[0]=p1;
 assert.equal(recoveryUnchanged(last,'t',2,historyMark(win),1000),false,'new recovery version');
 assert.equal(recoveryUnchanged(last,'u',1,historyMark(win),1000),false,'other document');
 assert.equal(recoveryUnchanged(last,'t',1,historyMark(win),11*60*1000),false,'refreshed after 10 minutes');
 assert.equal(recoveryUnchanged(last,'t',1,historyMark({}),1000),false,'no history: never skipped by history');
});
