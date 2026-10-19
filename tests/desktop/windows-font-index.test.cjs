// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),helper=path.join(__dirname,'font-index-resilience.test.cjs'),real=createRequire(helper),scope={exports:{}};
let source=sync.readFileSync(helper,'utf8');
const marker="id==='node:fs/promises'&&hooks.fs?hooks.fs:";
assert(source.includes(marker));
source=source.replace(marker,marker+"id==='./windows-io.cjs'?(platform,ms)=>localRequire(id)('win32',ms):");
vm.runInNewContext(source+'\nmodule.exports={fixture,isolatedWorker};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,AbortController,Uint8Array,URL,setTimeout,clearTimeout,structuredClone});
const {fixture,isolatedWorker}=scope.exports,fault=code=>Object.assign(Error('Injected font access refusal'),{code});
test('configured Windows font indexing recovers transient system-font opens and retains valid checkpoints',async()=>{
 for(const code of ['EPERM','EACCES','EBUSY']){
  const f=await fixture(2);try{
   let attempts=0;const target=path.join(f.fonts,'0.ttf'),proxy={...fs,async open(file,...args){if(file===target&&attempts++===0)throw fault(code);return fs.open(file,...args)}};
   const result=await isolatedWorker({},[],{fs:proxy})(f.options);
   assert.equal(attempts,2);assert.equal(result.system.length,2);assert.equal(result.stats.skipped,0);
   const checkpoint=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));assert.equal(checkpoint.complete,true);assert.equal(Object.keys(checkpoint.records).length,2);
  }finally{await fs.rm(f.folder,{recursive:true,force:true})}
 }
});
test('permanent configured-font denials keep healthy siblings and publish no unavailable handles',async()=>{
 const f=await fixture(3);try{
  const denied=new Set([path.join(f.fonts,'0.ttf'),path.join(f.fonts,'1.ttf')]),proxy={...fs,async open(file,...args){if(denied.has(file))throw fault('EBUSY');return fs.open(file,...args)}};
  const result=await isolatedWorker({},[],{fs:proxy})(f.options);
  assert.equal(result.system.length,1);assert.equal(result.handles.length,1);assert.equal(result.stats.skipped,2);
  const checkpoint=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));assert.equal(Object.keys(checkpoint.records).length,1);assert.equal(checkpoint.complete,true);
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
test('configured indexing rejects directory cycles and outside directory targets before traversal',async()=>{
 const f=await fixture(1);try{
  const loop=path.join(f.fonts,'loop'),outside=path.join(f.folder,'outside'),external=path.join(f.fonts,'external');
  await fs.mkdir(outside);let badTraversal=0;
  const dirent=name=>({name,isDirectory:()=>true});
  const proxy={...fs,
   async realpath(file,...args){if(file===loop)return f.fonts;if(file===external)return outside;return fs.realpath(file,...args)},
   async readdir(directory,...args){if(directory===loop||directory===external){badTraversal++;throw fault('ELOOP')}const entries=await fs.readdir(directory,...args);return directory===f.fonts?[...entries,dirent('loop'),dirent('external')]:entries;}
  };
  const result=await isolatedWorker({},[],{fs:proxy})(f.options);assert.equal(badTraversal,0);assert.equal(result.system.length,1);
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
test('private font cache retries temporary staging/replacement refusals and acknowledges only a verified installed file',async()=>{
 const cacheFile=path.join(root,'desktop/font-index-cache.cjs'),load=createRequire(cacheFile);
 for(const mode of ['open','rename','committed']){
  const f=await fixture(1);try{
   await fs.mkdir(f.cacheDir);const target=path.join(f.cacheDir,'index-v3.json'),old='original cache';await fs.writeFile(target,old);
   let attempts=0;const proxy={...fs,
    async open(file,...args){if(mode==='open'&&String(file).endsWith('.tmp')&&attempts++===0)throw fault('EACCES');return fs.open(file,...args)},
    async rename(a,b){if(b===target&&mode!=='open'&&attempts++===0){if(mode==='committed')await fs.rename(a,b);throw fault('EPERM')}return fs.rename(a,b)}
   };
   const module={exports:{}},input=id=>id==='node:fs/promises'?proxy:id==='./windows-io.cjs'?(platform,ms)=>load(id)('win32',ms):load(id);
   vm.runInNewContext(sync.readFileSync(cacheFile,'utf8'),{module,require:input,Buffer,process,setTimeout,clearTimeout,JSON});
   await module.exports.save(target,{version:3,records:{}});
   assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),{version:3,records:{}});
   assert.equal(attempts,mode==='committed'?1:2);assert.deepEqual(await fs.readdir(f.cacheDir),['index-v3.json']);
  }finally{await fs.rm(f.folder,{recursive:true,force:true})}
 }
});

test('optional private font-cache reads retry transient Windows denials and fall back cleanly after a permanent denial',async()=>{
 const cacheFile=path.join(root,'desktop/font-index-cache.cjs'),load=createRequire(cacheFile),f=await fixture(1);
 try{
  await fs.mkdir(f.cacheDir);const target=path.join(f.cacheDir,'index-v3.json'),value={version:3,bundleIdentity:'fixture',complete:true,records:{}};
  await fs.writeFile(target,JSON.stringify(value));let attempts=0,permanent=false;
  const proxy={...fs,async open(file,...args){if(file===target&&(permanent||attempts++===0))throw fault('EPERM');return fs.open(file,...args)}};
  const module={exports:{}},input=id=>id==='node:fs/promises'?proxy:id==='./windows-io.cjs'?(platform,ms)=>load(id)('win32',ms):load(id);
  vm.runInNewContext(sync.readFileSync(cacheFile,'utf8'),{module,require:input,Buffer,process,setTimeout,clearTimeout,JSON});
  assert.deepEqual(await module.exports.load(target,'fixture'),value);assert.equal(attempts,2);
  permanent=true;assert.equal(await module.exports.load(target,'fixture'),null);assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),value);
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});

test('a mid-read Windows refusal counts consumed bytes across retries and respects the configured scan budget',async()=>{
 for(const allowRetry of [false,true]){
  const f=await fixture(1);try{
   const chunk=Math.min(1024,Math.floor(f.raw.length/2));assert(chunk>0);let consumed=0,reads=0,denied=false;
   const target=path.join(f.fonts,'0.ttf'),proxy={...fs,async open(file,...args){
    const handle=await fs.open(file,...args);if(file!==target)return handle;
    return {stat:()=>handle.stat(),close:()=>handle.close(),async read(buffer,offset,length,position){
     reads++;if(reads===2&&!denied){denied=true;throw fault('EBUSY')}
     const result=await handle.read(buffer,offset,Math.min(chunk,length),position);consumed+=result.bytesRead;return result;
    }};
   }};
   const budget=f.raw.length+chunk-(allowRetry?0:1),result=await isolatedWorker({indexReadBytes:budget},[],{fs:proxy})(f.options);
   assert(denied);assert.equal(result.stats.readBytes,consumed);assert(consumed<=budget);
   assert.equal(result.system.length,allowRetry?1:0);assert.equal(result.handles.length,allowRetry?1:0);
   assert.equal(result.stats.truncated,!allowRetry);
   if(allowRetry)assert.equal(consumed,f.raw.length+chunk);else assert.equal(result.stats.reason,'bytes');
   const checkpoint=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));
   assert.equal(Object.keys(checkpoint.records).length,allowRetry?1:0);assert.equal(checkpoint.complete,allowRetry);
  }finally{await fs.rm(f.folder,{recursive:true,force:true})}
 }
});
