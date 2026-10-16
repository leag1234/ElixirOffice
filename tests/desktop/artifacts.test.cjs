// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Artifacts}=require('../../desktop/artifacts.cjs'),files=require('../../desktop/files.cjs');
test('committed-file actions are opaque, scoped, bounded and expire on replacement',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-artifacts-'));
 try{
  const target=path.join(dir,'public.txt'),saved=await files.atomic(target,Buffer.from('public'));
  const broker=new Artifacts(),id=broker.register(saved,'one');
  assert(!id.includes(target));assert.equal(await broker.resolve(id,'one'),target);
  await assert.rejects(broker.resolve(target,'one'),/expired/);
  await assert.rejects(broker.resolve(id,'two'),/expired/);
  await fs.writeFile(target,'in-place changed');await assert.rejects(broker.resolve(id,'one'),/changed/);
  await files.atomic(target,Buffer.from('replacement'));await assert.rejects(broker.resolve(id,'one'),/changed/);
  const current=await files.atomic(target,Buffer.from('public'));
  const first=broker.register(current,'one');for(let i=0;i<8;i++)broker.register(current,'one');
  assert.equal(broker.records.size,8);await assert.rejects(broker.resolve(first,'one'),/expired/);
  const last=broker.register(current,'one');broker.clear();await assert.rejects(broker.resolve(last,'one'),/expired/);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('committed-file action rejects removed and symlink destinations',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-artifacts-'));
 try{
  const target=path.join(dir,'public.txt'),other=path.join(dir,'other.txt');const saved=await files.atomic(target,Buffer.from('public'));
  const broker=new Artifacts(),id=broker.register(saved,'one');await fs.unlink(target);await assert.rejects(broker.resolve(id,'one'),/ENOENT/);
  await fs.writeFile(other,'other');await fs.symlink(other,target);await assert.rejects(broker.resolve(id,'one'),/changed/);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
