// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'windows-replace.test.cjs'),real=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={fixture};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,TextDecoder,URL,setTimeout,clearTimeout,setImmediate,setInterval,clearInterval});
const {fixture}=scope.exports,fault=code=>Object.assign(Error('Injected Windows flush refusal'),{code});
function windowsFlush(f,{platform='win32',failBackup=false}={}){
 const open=f.proxy.open,events=[];
 f.proxy.open=async(filename,...args)=>{
  const handle=await open(filename,...args),mode=args[0],stat=await handle.stat();
  return new Proxy(handle,{get(target,key){
   if(key==='sync')return async()=>{
    events.push({filename,mode,directory:stat.isDirectory()});
    if(platform==='win32'&&(stat.isDirectory()||String(filename).endsWith('.bak')&&mode==='r'))throw fault('EPERM');
    if(failBackup&&String(filename).endsWith('.bak'))throw fault('EIO');
    return handle.sync();
   };
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 };
 return events;
}
test('Windows first and repeated document saves never flush a read-only backup or directory handle',async()=>{
 const f=await fixture();try{
  const events=windowsFlush(f);
  await f.files.atomic(f.target,Buffer.from('PKsecond'),f.original);
  await f.files.atomic(f.target,Buffer.from('PKthird'),await f.files.read(f.target));
  assert.equal(await io.readFile(f.target,'utf8'),'PKthird');
  const backups=events.filter(value=>value.filename.endsWith('.bak'));assert.equal(backups.length,2);assert(backups.every(value=>value.mode==='r+'));
  assert(!events.some(value=>value.directory));assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('Windows repeated AutoRecover and preference writes use writable backup flushes',async()=>{
 const f=await fixture();try{
  const events=windowsFlush(f),recovery=new(f.load('recovery.cjs').Recovery)(f.directory),id=crypto.randomUUID(),meta={id,name:'Public.docx',format:'docx'};
  await recovery.save(meta,new Uint8Array(Buffer.from('PKfirst')));await recovery.save(meta,new Uint8Array(Buffer.from('PKsecond')));
  assert.equal(Buffer.from((await recovery.read(id)).data).toString(),'PKsecond');
  const preferences=f.load('settings-store.cjs')(f.directory);await preferences.save({fontConsent:false});await preferences.save({fontConsent:true});await preferences.flush();
  assert.equal(JSON.parse(await io.readFile(path.join(f.directory,'desktop-settings.json'),'utf8')).fontConsent,true);
  assert.equal(events.filter(value=>value.filename.endsWith('.bak')).length,2);assert(!events.some(value=>value.directory));
 }finally{await f.cleanup()}
});
test('Linux and macOS adapters retain directory synchronization and equivalent save behavior',async()=>{
 for(const platform of ['linux','darwin']){
  const f=await fixture({platform});try{
   const events=windowsFlush(f,{platform});await f.files.atomic(f.target,Buffer.from('PKequivalent'),f.original);
   assert.equal(await io.readFile(f.target,'utf8'),'PKequivalent');assert.equal(events.filter(value=>value.directory).length,1);
  }finally{await f.cleanup()}
 }
});
test('a genuine backup flush failure keeps the original and never starts in-place replacement',async()=>{
 const f=await fixture();try{
  windowsFlush(f,{failBackup:true});let inplace=0;const open=f.proxy.open;
  f.proxy.open=async(filename,...args)=>{if(filename===f.target&&args[0]==='r+')inplace++;return open(filename,...args)};
  await assert.rejects(f.files.atomic(f.target,Buffer.from('PKnew'),f.original),e=>e.code==='EIO');
  assert.equal(inplace,0);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
 }finally{await f.cleanup()}
});
