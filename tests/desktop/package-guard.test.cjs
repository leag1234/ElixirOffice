// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const {entries,embeddedObjects,protect}=require('../../desktop/package-guard.cjs');
function zip(names) {
 const parts=[],directory=[];let offset=0;
 for(const name of names){
  const bytes=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(bytes.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(bytes.length,28);central.writeUInt32LE(offset,42);
  parts.push(local,bytes);directory.push(central,bytes);offset+=local.length+bytes.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,central,end]);
}
test('ODF save refuses missing embedded objects before filesystem replacement',()=>{
 const original=zip(['content.xml','Object 1/content.xml','Object 2/content.xml']),lost=zip(['content.xml','Object 1/content.xml']);
 assert.equal(embeddedObjects(original),2);assert.throws(()=>protect(lost,'ods',2),/original file was not changed/);
 assert.doesNotThrow(()=>protect(original,'ods',2));
});
test('untrusted ZIP metadata is bounded and duplicate/split directories refused',()=>{
 assert.throws(()=>entries(Buffer.alloc(5)),/Invalid/);
 assert.throws(()=>entries(zip(['content.xml','content.xml'])),/Duplicate/);
 const split=zip(['content.xml']);split.writeUInt16LE(1,split.length-18);assert.throws(()=>entries(split),/split/);
 const corrupt=zip(['content.xml']);corrupt.writeUInt32LE(0xffffffff,corrupt.length-6);assert.throws(()=>entries(corrupt),/ZIP64/);
});
