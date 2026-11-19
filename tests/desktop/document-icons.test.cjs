// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),desktop=path.join(root,'desktop');
test('every file association has a family icon in .icns and .ico, and the generated files are valid',()=>{
 const names=new Set();
 for(const item of require('../../desktop/package.json').build.fileAssociations){
  assert(item.icon&&!item.icon.includes('.'),'icon without extension so macOS and Windows each pick their own format');
  assert(!names.has(item.icon),'unique icon basename');names.add(item.icon);
  const icns=fs.readFileSync(path.join(desktop,item.icon+'.icns')),ico=fs.readFileSync(path.join(desktop,item.icon+'.ico'));
  assert.equal(icns.subarray(0,4).toString(),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
  let at=8;while(at<icns.length){const len=icns.readUInt32BE(at+4);assert(len>8&&at+len<=icns.length);at+=len}assert.equal(at,icns.length);
  assert.deepEqual([...ico.subarray(0,4)],[0,0,1,0]);assert.equal(ico.readUInt16LE(4),6);
  assert(fs.existsSync(path.join(desktop,item.icon+'.svg')));
 }
});
