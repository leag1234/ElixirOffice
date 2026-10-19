// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),filename=path.join(__dirname,'windows-resilience.test.cjs'),scope={exports:{}},real=createRequire(filename);
vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports={virtualWindows,moduleFor,fontBytes};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,TextDecoder,setTimeout,clearTimeout,setImmediate,AbortController});
const {virtualWindows,moduleFor,fontBytes}=scope.exports;
const fault=code=>Object.assign(Error('Injected font refusal'),{code});
test('font scanning skips approved-root cycles and outside reparse targets, retaining healthy system/user faces',async()=>{
 const virtual=await virtualWindows();try{
  const system='C:\\Windows\\Fonts',user='C:\\Users\\Public\\AppData\\Local\\Microsoft\\Windows\\Fonts',outside='C:\\Outside';
  await virtual.put(system+'\\public.ttf',fontBytes());await virtual.put(user+'\\user.ttf',fontBytes('Public User'));await virtual.put(outside+'\\outside.ttf',fontBytes('Outside'));
  const originalRead=virtual.io.readdir,originalReal=virtual.io.realpath,calls={loop:0,outside:0};
  const dirent=name=>({name,isDirectory:()=>true,isSymbolicLink:()=>false});
  virtual.io.realpath=async value=>value===system+'\\loop'?system:value===system+'\\external'?outside:originalReal(value);
  virtual.io.readdir=async(value,...args)=>{
   if(value===system+'\\loop'){calls.loop++;throw fault('ELOOP')}
   if(value===system+'\\external'){calls.outside++;throw fault('EPERM')}
   const entries=await originalRead(value,...args);return value===system?[...entries,dirent('loop'),dirent('external')]:entries;
  };
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),faces=await fonts.enumerate();
  assert.equal(calls.loop,0);assert.equal(calls.outside,0);assert(faces.some(x=>x.family==='Public Sans'));assert(faces.some(x=>x.family==='Public User'));assert(!faces.some(x=>x.family==='Outside'));
 }finally{await virtual.cleanup()}
});
test('missing optional font roots are quiet; real permission failures retain code-only diagnostics',async()=>{
 const virtual=await virtualWindows();try{
  const system='C:\\Windows\\Fonts';await virtual.put(system+'\\public.ttf',fontBytes());const reports=[];
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts({report:error=>reports.push(error.code||'INVALID_FONT')});
  assert.equal((await fonts.enumerate()).length,1);assert(!reports.includes('ENOENT'));reports.length=0;
  virtual.injections.push({name:'readdir',target:system,code:'EPERM'});
  assert.equal((await fonts.enumerate()).length,0);assert.deepEqual(reports,['EPERM']);
 }finally{await virtual.cleanup()}
});
test('authorized lazy font reads retry transient access refusals, but never accept a changed identity',async()=>{
 for(const code of ['EPERM','EACCES','EBUSY']){
  const virtual=await virtualWindows();try{
   const target='C:\\Windows\\Fonts\\public.ttf';await virtual.put(target,fontBytes());
   const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),faces=await fonts.enumerate(),originalOpen=virtual.io.open;
   let attempts=0;virtual.io.open=async(value,...args)=>{if(value===target&&attempts++===0)throw fault(code);return originalOpen(value,...args)};
   assert((await fonts.read(faces[0].id)).byteLength>0);assert.equal(attempts,2);
   let swapped=false;virtual.io.open=async(value,...args)=>{
    if(value===target&&!swapped){swapped=true;const physical=virtual.translate(target);await io.rename(physical,physical+'.retained');await io.writeFile(physical,fontBytes('Different'));throw fault('EPERM')}
    return originalOpen(value,...args);
   };
   await assert.rejects(fonts.read(faces[0].id),/changed/i);
  }finally{await virtual.cleanup()}
 }
});
test('an exhausted lazy font read remains a failure and cannot block reading a different face',async()=>{
 const virtual=await virtualWindows();try{
  const system='C:\\Windows\\Fonts';await virtual.put(system+'\\locked.ttf',fontBytes('Locked'));await virtual.put(system+'\\good.ttf',fontBytes('Good'));
  const reports=[],{Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts({report:e=>reports.push(e.code)}),faces=await fonts.enumerate();
  virtual.injections.push({name:'open',target:system+'\\locked.ttf',code:'EBUSY'});
  await assert.rejects(fonts.read(faces.find(f=>f.family==='Locked').id),e=>e.code==='EBUSY');
  assert((await fonts.read(faces.find(f=>f.family==='Good').id)).byteLength>0);assert(reports.includes('EBUSY'));
 }finally{await virtual.cleanup()}
});

test('enumeration recovers a transient file-read refusal and pins the enumerated identity before the first lazy read',async()=>{
 for(const change of ['replace','edit']){
  const virtual=await virtualWindows();try{
   const target='C:\\Windows\\Fonts\\public.ttf';await virtual.put(target,fontBytes());
   const originalRead=virtual.io.readFile;let reads=0;
   virtual.io.readFile=async(value,...args)=>{if(value===target&&reads++===0)throw fault('EPERM');return originalRead(value,...args)};
   const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),faces=await fonts.enumerate();
   assert.equal(faces.length,1);assert.equal(reads,2);
   const physical=virtual.translate(target);
   if(change==='replace')await io.rename(physical,physical+'.retained');
   await io.writeFile(physical,fontBytes('Different'));
   await assert.rejects(fonts.read(faces[0].id),/changed/i);
  }finally{await virtual.cleanup()}
 }
});

test('refreshing font enumeration retains unchanged IDs and invalidates stale IDs for changed content',async()=>{
 const virtual=await virtualWindows();try{
  const target='C:\\Windows\\Fonts\\public.ttf';await virtual.put(target,fontBytes());
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),initial=await fonts.enumerate(),same=await fonts.enumerate();
  assert.equal(same[0].id,initial[0].id);
  await io.writeFile(virtual.translate(target),fontBytes('Replacement'));
  const fresh=await fonts.enumerate();assert.notEqual(fresh[0].id,initial[0].id);
  await assert.rejects(fonts.read(initial[0].id),/Unknown font handle/);
  assert((await fonts.read(fresh[0].id)).byteLength>0);
 }finally{await virtual.cleanup()}
});
