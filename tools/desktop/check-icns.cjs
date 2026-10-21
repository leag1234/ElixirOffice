// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict');
function validate(bytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length>=8&&bytes.length<=16*1024*1024,'Invalid ICNS size');
 assert.equal(bytes.subarray(0,4).toString('ascii'),'icns','Invalid ICNS signature');
 assert.equal(bytes.readUInt32BE(4),bytes.length,'ICNS total length mismatch');
 const types=[];let offset=8;
 while(offset<bytes.length){
  assert(offset+8<=bytes.length,'Truncated ICNS entry header');
  const type=bytes.subarray(offset,offset+4).toString('ascii'),length=bytes.readUInt32BE(offset+4);
  assert(length>=8&&length<=bytes.length-offset,'Invalid ICNS entry length');
  assert(!['icp4','icp5'].includes(type),'Unsafe legacy small ICNS entry: '+type);
  assert(!types.includes(type),'Duplicate ICNS entry: '+type);
  types.push(type);offset+=length;
 }
 assert(types.includes('ic04')&&types.includes('ic05'),'Missing native 16/32 pixel ICNS entries');
 return{types,size:bytes.length};
}
module.exports={validate};
