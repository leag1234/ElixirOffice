// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),files=require('../../desktop/files.cjs');
test('rename keeps real bytes/permissions and subsequent atomic saves use the new name',async()=>{
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'eo-rename-'));
 try{
  const old=path.join(root,'Public.txt');await fs.writeFile(old,'Public UTF8 café');await fs.chmod(old,0o640);
  const initial=await files.read(old),renamed=await files.rename(initial,'Renamed');
  assert.equal(renamed.target,path.join(root,'Renamed.txt'));assert.equal(await fs.readFile(renamed.target,'utf8'),'Public UTF8 café');
  await assert.rejects(fs.stat(old),{code:'ENOENT'});assert.equal((await fs.stat(renamed.target)).mode&0o777,0o640);
  await files.atomic(renamed.target,Buffer.from('Later edit'),renamed);assert.equal(await fs.readFile(renamed.target,'utf8'),'Later edit');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('rename rejects collisions, paths, aliases and changed originals without replacing either file',async()=>{
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'eo-rename-'));
 try{
  const old=path.join(root,'Public.txt'),other=path.join(root,'Other.txt');await fs.writeFile(old,'Original');await fs.writeFile(other,'Other');const initial=await files.read(old);
  await assert.rejects(files.rename(initial,'Other.txt'),/already exists/);
  for(const name of ['../Escape','dir/file','dir\\file','..','bad\u0000name'])await assert.rejects(files.rename(initial,name),/valid file name/);
  await fs.symlink(other,path.join(root,'Alias.txt'));await assert.rejects(files.rename(initial,'Alias.txt'),/already exists/);
  assert.equal(await fs.readFile(old,'utf8'),'Original');assert.equal(await fs.readFile(other,'utf8'),'Other');
  await fs.writeFile(old,'External edit');await assert.rejects(files.rename(initial,'New'),/changed on disk/);assert.equal(await fs.readFile(old,'utf8'),'External edit');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('case-only rename preserves the selected file on the actual filesystem',async()=>{
 const directory=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'eo-case-')),source=path.join(directory,'PublicCase.docx');
 try{
  await fs.writeFile(source,Buffer.from('public case bytes'));const selected=await files.read(source);
  const renamed=await files.rename(selected,'publiccase.docx');
  assert.equal(renamed.name,'publiccase.docx');assert.deepEqual(await fs.readFile(renamed.target),Buffer.from('public case bytes'));
  assert((await fs.readdir(directory)).includes('publiccase.docx'));assert(!(await fs.readdir(directory)).includes('PublicCase.docx'));
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});

test('downloadable names reject Windows devices, bidi overrides and excessive UTF8 bytes; normalize NFC',()=>{
 const devices=['CON','PRN','AUX','NUL',...Array.from({length:9},(_,i)=>'COM'+(i+1)),...Array.from({length:9},(_,i)=>'LPT'+(i+1))];
 for(const device of devices)for(const name of [device,device.toLowerCase()+'.txt',device+'.extra.txt',device+' .txt'])
  assert.throws(()=>files.renameName(name,'.txt'),/valid file name/,name);
 for(const name of ['Bad\u202e.txt','Bad\u202d.txt','Bad\u2066.txt','界'.repeat(85), 'é'.repeat(126)+'.txt'])
  assert.throws(()=>files.renameName(name,'.txt'),/valid file name/);
 assert.equal(files.renameName('Cafe\u0301','.txt'),'Café.txt');
 assert.equal(files.renameName('COM10','.txt'),'COM10.txt');
 assert.equal(files.renameName('LPT0.txt','.txt'),'LPT0.txt');
 assert.equal(files.renameName('界'.repeat(83),'.txt'),'界'.repeat(83)+'.txt');
});
