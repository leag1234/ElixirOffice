// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{serializedContent}=require('./serialized-content.cjs');
// Small public structural fixtures; native diagnostics parse actual SDK streams.
function fixture(name){
 const header=Buffer.from((name==='word'?'DOCY':'XLSY')+';v10;0;'),directory=Buffer.alloc(16);
 directory[0]=3;
 const stamp=Buffer.from('2026-10-19T12:34:56Z','utf16le'),attributes=Buffer.alloc(7+stamp.length);
 attributes[0]=250;attributes[1]=5;attributes.writeUInt32LE(20,2);stamp.copy(attributes,6);attributes[46]=251;
 const core=Buffer.alloc(5+attributes.length);core[0]=2;core.writeUInt32LE(attributes.length,1);attributes.copy(core,5);
 const body=Buffer.from('EO_TAB_public_content','utf16le'),tail=Buffer.from([1,2,3,4]);
 const start=header.length+directory.length,coreStart=start+body.length;
 // XLSY can reserve a table and fill it later: directory offsets are not sorted.
 const entries=name==='word'?[[1,start],[16,coreStart],[2,coreStart+core.length]]:[[1,coreStart+core.length],[2,start],[7,coreStart]];
 entries.forEach(([type,offset],index)=>{directory[1+index*5]=type;directory.writeUInt32LE(offset,2+index*5)});
 return Buffer.concat([header,directory,body,core,tail]);
}
for(const name of ['word','sheet']){
 const bytes=fixture(name),normalized=serializedContent(bytes);
 const dateStart=bytes.findIndex((value,index)=>value!==normalized[index]),timestampStart=dateStart;
 test(name+' changes only the parsed core modification timestamp and preserves every other byte',()=>{
  const other=Buffer.from(bytes);other[timestampStart]=other[timestampStart]===50?51:50;
  assert.notDeepEqual(bytes,other);assert.deepEqual(serializedContent(other),normalized);
 });
 test(name+' never masks a content edit',()=>{
  const offset=bytes.indexOf(Buffer.from('EO_TAB_','utf16le'));assert(offset>0);
  const other=Buffer.from(bytes);other[offset]^=1;assert.notDeepEqual(serializedContent(other),normalized);
 });
 test(name+' rejects unexpected version and core field length instead of broadening normalization',()=>{
  const version=Buffer.from(bytes);version[7]=57;assert.throws(()=>serializedContent(version));
  const length=Buffer.from(bytes);length.writeUInt32LE(19,timestampStart-4);assert.throws(()=>serializedContent(length));
 });
 test(name+' rejects a table offset inside the count/entry directory and duplicate offsets',()=>{
  const tableStart=11,count=bytes[tableStart],bad=Buffer.from(bytes);bad.writeUInt32LE(tableStart+count*5,tableStart+2);assert.throws(()=>serializedContent(bad));
  const duplicate=Buffer.from(bytes);duplicate.writeUInt32LE(duplicate.readUInt32LE(tableStart+7),tableStart+2);assert.throws(()=>serializedContent(duplicate));
 });
 test(name+' rejects an impossible calendar date rather than masking it',()=>{
  const bad=Buffer.from(bytes);Buffer.from('99','utf16le').copy(bad,timestampStart+10);assert.throws(()=>serializedContent(bad));
 });
 test(name+' rejects malformed date and missing core attribute terminator',()=>{
  const date=Buffer.from(bytes);date[timestampStart]=120;assert.throws(()=>serializedContent(date));
  const end=Buffer.from(bytes);end[timestampStart+40]=250;assert.throws(()=>serializedContent(end));
 });
}
