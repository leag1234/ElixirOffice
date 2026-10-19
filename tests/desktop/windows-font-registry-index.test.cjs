// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'font-index-resilience.test.cjs'),real=createRequire(helper),scope={exports:{}};
let source=sync.readFileSync(helper,'utf8'),marker="id==='node:fs/promises'&&hooks.fs?hooks.fs:";
assert(source.includes(marker));
source=source.replace(marker,marker+"id==='./font-registry.cjs'&&hooks.registry?hooks.registry:id==='./windows-io.cjs'?(platform,ms)=>localRequire(id)('win32',ms):");
vm.runInNewContext(source+'\nmodule.exports={fixture,isolatedWorker,Fonts};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,AbortController,Uint8Array,URL,setTimeout,clearTimeout,structuredClone});
const {fixture,isolatedWorker,Fonts}=scope.exports,fault=code=>Object.assign(Error('Injected font refusal'),{code});
test('configured Windows index keeps per-user and exact registered fonts despite denied roots and registered siblings',async()=>{
 const f=await fixture(1);try{
  const user=path.join(f.folder,'user-fonts'),registered=path.join(f.folder,'registered'),denied=path.join(f.folder,'denied-root');
  await fs.mkdir(user);await fs.mkdir(registered);await fs.mkdir(denied);
  const custom=path.join(registered,'installed.ttf'),locked=path.join(registered,'locked.ttf');
  await fs.writeFile(path.join(user,'user.ttf'),f.raw);await fs.writeFile(custom,f.raw);await fs.writeFile(locked,f.raw);await fs.writeFile(path.join(registered,'unregistered.ttf'),f.raw);
  let customOpens=0,parentScans=0;
  const proxy={...fs,
   async readdir(directory,...args){if(directory===registered)parentScans++;if(directory===denied)throw fault('EACCES');return fs.readdir(directory,...args)},
   async open(filename,...args){if(filename===locked)throw fault('EPERM');if(filename===custom&&customOpens++===0)throw fault('EBUSY');return fs.open(filename,...args)}
  };
  const result=await isolatedWorker({},[],{fs:proxy,registry:async()=>[custom,locked]} )({...f.options,roots:[denied,user]});
  assert.equal(result.system.length,2);assert.equal(result.handles.length,2);assert.equal(customOpens,2);assert.equal(parentScans,0);assert(result.stats.skipped>=2);
  const handle=result.handles.find(value=>value.registryPath===custom);assert(handle);
  const fonts=new Fonts();try{
   fonts.allowed=[denied,user];fonts.resolvedRoots=result.resolvedRoots;fonts.files=new Map(result.handles.map(value=>[value.id,value]));
   assert.deepEqual(Buffer.from(await fonts.read(handle.id)),f.raw);
   fonts.clear();await assert.rejects(fonts.read(handle.id),/Unknown font handle/);
  }finally{fonts.clear()}
  const checkpoint=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));assert.equal(checkpoint.complete,true);assert.equal(Object.keys(checkpoint.records).length,2);
  const {handles,resolvedRoots,...publicIndex}=result;assert(!JSON.stringify(publicIndex).includes(f.folder));
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
test('registered font handles preserve content validation and reject redirected entries',async()=>{
 const f=await fixture(0);try{
  const filename=path.join(f.folder,'installed.ttf'),moved=path.join(f.folder,'moved.ttf');await fs.writeFile(filename,f.raw);
  const result=await isolatedWorker({},[],{registry:async()=>[filename]})(f.options),handle=result.handles[0];assert(handle);
  const fonts=new Fonts();try{
   fonts.allowed=[];fonts.resolvedRoots=[];fonts.files=new Map([[handle.id,handle]]);
   const changed=Buffer.from(f.raw);changed[changed.length-1]^=1;await fs.writeFile(filename,changed);
   await assert.rejects(fonts.read(handle.id),/changed/);assert.equal(fonts.files.size,0);
   await fs.writeFile(filename,f.raw);
   const next=await isolatedWorker({},[],{registry:async()=>[filename]})(f.options),selected=next.handles[0];
   fonts.files=new Map([[selected.id,selected]]);await fs.rename(filename,moved);await fs.symlink(moved,filename);
   await assert.rejects(fonts.read(selected.id),/outside approved folders/);
   const redirected=await isolatedWorker({},[],{registry:async()=>[filename]})(f.options);assert.equal(redirected.system.length,0);assert.equal(redirected.handles.length,0);
  }finally{fonts.clear()}
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
test('registered entries share existing index face/read budgets, deduplication and current registry membership',async()=>{
 const f=await fixture(1);try{
  const filename=path.join(f.fonts,'0.ttf'),outside=path.join(f.folder,'installed.ttf');await fs.writeFile(outside,f.raw);
  const result=await isolatedWorker({},[],{registry:async()=>[filename,outside,outside]})(f.options);assert.equal(result.system.length,2);assert.equal(result.stats.readBytes,2*f.raw.length);
  const bounded=await isolatedWorker({indexFaces:1},[],{registry:async()=>[outside]})(f.options);assert.equal(bounded.system.length,1);assert.equal(bounded.stats.reason,'faces');
  const withoutRegistry=await isolatedWorker({},[],{registry:async()=>[]})(f.options);assert.equal(withoutRegistry.system.length,1);assert.equal(withoutRegistry.handles.length,1);
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
test('registry failures retain readable indexed roots, and no readable source publishes no font handles',async()=>{
 const f=await fixture(1);try{
  const result=await isolatedWorker({},[],{registry:async()=>{throw fault('EACCES')}})(f.options);assert.equal(result.system.length,1);
  const empty=await isolatedWorker({},[],{registry:async()=>[]})({...f.options,roots:[]});assert.equal(empty.system.length,0);assert.equal(empty.handles.length,0);
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});

test('registry discovery runs once for an index and repeated selected-font reads reuse its private handles',async()=>{
 const f=await fixture(0);try{
  const filename=path.join(f.folder,'installed.ttf');await fs.writeFile(filename,f.raw);let queries=0;
  const result=await isolatedWorker({},[],{registry:async()=>{queries++;return [filename]}})(f.options),fonts=new Fonts({registry:async()=>{queries++;throw Error('Unexpected rediscovery during a read')}});
  try{fonts.allowed=[];fonts.resolvedRoots=[];fonts.files=new Map(result.handles.map(value=>[value.id,value]));for(let n=0;n<3;n++)assert.deepEqual(Buffer.from(await fonts.read(result.handles[0].id)),f.raw);assert.equal(queries,1);}
  finally{fonts.clear()}
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
