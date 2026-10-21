// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict');
function serializedContent(bytes){
 const data=Buffer.from(bytes),header=/^(DOCY|XLSY);v10;0;/.exec(data.subarray(0,80).toString('latin1'));
 assert(header,'Expected binary document header');const tableStart=header[0].length,count=data[tableStart];
 assert(count>0&&count<=128);assert(tableStart+1+count*5<=data.length);
 const entries=Array.from({length:count},(_,index)=>({type:data[tableStart+1+index*5],offset:data.readUInt32LE(tableStart+2+index*5)}));
 assert(entries.every(entry=>entry.offset>=tableStart+1+count*5&&entry.offset<data.length));
 assert.equal(new Set(entries.map(entry=>entry.offset)).size,entries.length,'Table offsets must be unique');
 const core=entries.filter(entry=>entry.type===(header[1]==='DOCY'?16:7));assert.equal(core.length,1);
 const begin=core[0].offset,end=Math.min(data.length,...entries.filter(entry=>entry.offset>begin).map(entry=>entry.offset));
 assert.equal(data[begin],2,'Expected core-properties outer record');
 assert.equal(begin+5+data.readUInt32LE(begin+1),end,'Core record length must match its table boundary');
 let cursor=begin+5;assert.equal(data[cursor++],250);const fields=new Set();let modified;
 while(cursor<end&&data[cursor]!==251){
  const field=data[cursor++];assert(field<=5&&!fields.has(field));fields.add(field);
  const length=data.readUInt32LE(cursor);cursor+=4;assert(cursor+length*2<=end);
  if(field===5){assert.equal(length,20);const value=data.subarray(cursor,cursor+40).toString('utf16le');assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value));const date=new Date(value);assert(!Number.isNaN(date.getTime())&&date.toISOString()===value.replace('Z','.000Z'));modified=cursor;}
  cursor+=length*2;
 }
 assert(modified!==undefined);assert.equal(data[cursor],251);assert.equal(modified+40,cursor,'Modified timestamp must be the final core attribute');
 data.fill(0,modified,modified+40);return data;
}

module.exports={serializedContent};
