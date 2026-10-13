// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const inventory=require('../../tools/release/desktop-test-inputs.json');
test('desktop upstream sources match the release test inventory',()=>{
 const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
 for(const name of inventory.files){
  const file=path.join(upstream,'web-apps',name),stat=fs.lstatSync(file);
  assert(stat.isFile()&&!stat.isSymbolicLink(),name);assert(stat.size>0,name);
 }
 let supported;
 for(const [directory,count]of Object.entries(inventory.locales)){
  const names=fs.readdirSync(path.join(upstream,'web-apps',directory)).filter(name=>/^[A-Za-z0-9_-]+\.json$/.test(name)).sort();
  assert.equal(names.length,count,directory);
  if(supported)assert.deepEqual(names,supported,directory);else supported=names;
  for(const name of names)assert.doesNotThrow(()=>JSON.parse(fs.readFileSync(path.join(upstream,'web-apps',directory,name),'utf8')),directory+'/'+name);
 }
});
