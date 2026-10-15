// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const helper=process.env.EO_UPSTREAM;
if(!helper)throw Error('Set EO_UPSTREAM to the integration source tree');
const paths=require(path.join(helper,'document-server-integration/web/documentserver-example/nodejs/helpers/elixirStoragePaths'));
test('stored rename preserves file, force-save and history; copies use the selected folder',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-fileops-'));
 try{
  fs.mkdirSync(path.join(root,'Copies'));fs.writeFileSync(path.join(root,'Original.docx'),'public original');
  fs.mkdirSync(path.join(root,'Original.docx-history'));fs.mkdirSync(path.join(root,'Original.docx-history','1'));
  fs.writeFileSync(path.join(root,'Original.docx-history','Original.docx'),'public current');
  fs.writeFileSync(path.join(root,'Original.docx-history','Original.docx.txt'),'public author');
  fs.writeFileSync(path.join(root,'Original.docx-history','1','key.txt'),'key');
  await paths.rename(root,'/','Original.docx','Renamed.docx');
  assert(!fs.existsSync(path.join(root,'Original.docx')));assert.equal(fs.readFileSync(path.join(root,'Renamed.docx'),'utf8'),'public original');
  assert.equal(fs.readFileSync(path.join(root,'Renamed.docx-history','Renamed.docx'),'utf8'),'public current');
  assert.equal(fs.readFileSync(path.join(root,'Renamed.docx-history','Renamed.docx.txt'),'utf8'),'public author');
  assert.equal(fs.readFileSync(path.join(root,'Renamed.docx-history','1','key.txt'),'utf8'),'key');
  paths.create(root,'/Copies','Copy.docx',Buffer.from('new bytes'));assert.equal(fs.readFileSync(path.join(root,'Copies','Copy.docx'),'utf8'),'new bytes');
  assert.throws(()=>paths.create(root,'/Copies','Copy.docx',Buffer.from('overwrite')),e=>e.status===409);
  await assert.rejects(()=>paths.rename(root,'/','Renamed.docx','Copies'),e=>e.status===409);
  assert.equal(fs.readFileSync(path.join(root,'Renamed.docx'),'utf8'),'public original');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('path traversal, symlinks, invalid names and reserved history conflicts leave originals intact',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-fileops-'));
 try{
  fs.writeFileSync(path.join(root,'A.docx'),'original');fs.symlinkSync('/tmp',path.join(root,'Alias'));
  for(const value of ['../Bad.docx','Bad/Name.docx','..',' A.docx','Bad\x00.docx','X-history'])assert.throws(()=>paths.name(value));
  assert.throws(()=>paths.create(root,'/../','Bad.docx',Buffer.from('x')));
  assert.throws(()=>paths.create(root,'/Alias','Bad.docx',Buffer.from('x')));
  fs.symlinkSync('/missing-public-target',path.join(root,'B.docx-history'));
  await assert.rejects(()=>paths.rename(root,'/','A.docx','B.docx'),e=>e.status===409);
  assert.equal(fs.readFileSync(path.join(root,'A.docx'),'utf8'),'original');
  assert(!fs.existsSync(path.join(root,'B.docx')));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('storage names normalize NFC and reject Windows devices, directional overrides and excess bytes',()=>{
 const devices=['CON','PRN','AUX','NUL',...Array.from({length:9},(_,i)=>'COM'+(i+1)),...Array.from({length:9},(_,i)=>'LPT'+(i+1))];
 for(const device of devices)for(const name of [device,device.toLowerCase()+'.docx',device+'.extra.docx',device+' .docx'])
  assert.throws(()=>paths.name(name),e=>e.status===400,name);
 for(const name of ['Bad\u202e.docx','Bad\u202d.docx','Bad\u2066.docx','界'.repeat(86)])
  assert.throws(()=>paths.name(name),e=>e.status===400);
 assert.equal(paths.name('Cafe\u0301.docx'),'Café.docx');
 assert.equal(paths.name('COM10.docx'),'COM10.docx');
 assert.equal(paths.name('界'.repeat(85)),'界'.repeat(85));
});
test('large stored rename yields to the event loop without synchronous whole-file reads',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-stream-'));
 try{
  fs.writeFileSync(path.join(root,'Large.docx'),Buffer.alloc(4*1024*1024,37));
  const read=fs.readFileSync;let tick=false;
  const scheduled=new Promise(resolve=>setImmediate(()=>{tick=true;resolve()}));
  try{
   fs.readFileSync=()=>{throw Error('Synchronous whole-file read during Rename')};
   await paths.rename(root,'/','Large.docx','Streamed.docx');
   assert(tick,'Rename must let unrelated requests/timers advance');
  }finally{fs.readFileSync=read;await scheduled}
  assert.equal(fs.statSync(path.join(root,'Streamed.docx')).size,4*1024*1024);
  assert(!fs.existsSync(path.join(root,'Large.docx')));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('new names are canonical without breaking lookup of existing decomposed file names',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-nfc-')),old='Cafe\u0301.docx';
 try{
  fs.writeFileSync(path.join(root,old),'public decomposed source');
  assert.equal(paths.file(root,'/',old).target,path.join(root,old));
  const moved=await paths.rename(root,'/',old,'Re\u0301sume\u0301.docx');
  assert.equal(moved.name,'Résumé.docx');assert.equal(fs.readFileSync(moved.target,'utf8'),'public decomposed source');
  const copy=paths.create(root,'/','Cafe\u0301.docx',Buffer.from('canonical copy'));
  assert.equal(copy.name,'Café.docx');assert(fs.existsSync(path.join(root,'Café.docx')));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('legacy Linux-side device-named files and folders stay readable while new device names are denied',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-existing-'));
 try{
  fs.mkdirSync(path.join(root,'NUL'));fs.writeFileSync(path.join(root,'NUL','CON.docx'),'legacy public file');
  assert.equal(paths.folder(root,'/NUL').root,path.join(root,'NUL'));
  assert.equal(paths.file(root,'/NUL','CON.docx').target,path.join(root,'NUL','CON.docx'));
  const copy=paths.create(root,'/NUL','Valid.docx',Buffer.from('valid new file'));
  assert.equal(fs.readFileSync(copy.target,'utf8'),'valid new file');
  assert.throws(()=>paths.name('CON.docx'),e=>e.status===400);
  assert.throws(()=>paths.create(root,'/NUL','AUX.docx',Buffer.from('bad')),e=>e.status===400);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
