// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Inspect ZIP directory metadata only; never extract or execute document entries.
function entries(input) {
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input.buffer,input.byteOffset,input.byteLength),floor=Math.max(0,bytes.length-65557);let end=-1;
 for(let at=bytes.length-22;at>=floor;at--){
  if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break}
 }
 if(end<0)throw Error('Invalid Office package directory');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||count===65535||offset===0xffffffff||size===0xffffffff)throw Error('Unsupported split or ZIP64 package directory');
 if(offset+size>end)throw Error('Invalid Office package directory');
 const names=new Set();let at=offset;
 for(let i=0;i<count;i++){
  if(at+46>offset+size||bytes.readUInt32LE(at)!==0x02014b50)throw Error('Invalid Office package entry');
  const length=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),next=at+46+length+extra+comment;
  if(next>offset+size)throw Error('Invalid Office package entry');
  const name=bytes.toString('utf8',at+46,at+46+length);
  if(names.has(name))throw Error('Duplicate Office package entry');
  names.add(name);at=next;
 }
 if(at!==offset+size)throw Error('Invalid Office package directory size');
 return names;
}
function embeddedObjects(bytes) {
 return [...entries(bytes)].filter(name=>/^Object[^/]*\/content\.xml$/i.test(name)).length;
}
function protect(bytes,format,originalCount) {
 if(!['odt','ods','odp'].includes(format)||!originalCount)return;
 if(embeddedObjects(bytes)<originalCount){
  const error=Error('The local converter could not preserve all embedded objects. Your original file was not changed. Save a copy only if you accept the missing objects.');
  error.code='OBJECT_LOSS';throw error;
 }
}
module.exports={entries,embeddedObjects,protect};
