// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),fault=code=>Object.assign(Error('Injected filesystem refusal'),{code});
function modules(proxy,{platform='win32',fakeTime=true,env={...process.env,EO_WINDOWS_SAVE_RETRY_MS:'3000'}}={}){
 const cache=new Map(),clock={time:0,waits:[],onWait:null};
 function load(name){
  if(cache.has(name))return cache.get(name);
  const filename=path.join(root,'desktop',name),real=createRequire(filename),scope={exports:{}};
  const requireModule=n=>n==='node:fs/promises'?proxy:n==='node:perf_hooks'&&fakeTime?{performance:{now:()=>clock.time}}:
   ['./files.cjs','./windows-io.cjs','./replace-fallback.cjs','./settings-store.cjs','./recovery.cjs'].includes(n)?load(n.slice(2)):real(n);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:scope,require:requireModule,process:{platform,env,getuid:process.getuid},Buffer,Uint8Array,TextDecoder,
   setTimeout:fakeTime?(fn,ms)=>{clock.waits.push(ms);clock.time+=ms;return setImmediate(async()=>{await clock.onWait?.();fn()})}:setTimeout,clearTimeout});
  cache.set(name,scope.exports);return scope.exports;
 }
 return {load,clock};
}
async function fixture(options={}){
 const directory=await io.mkdtemp(path.join(process.env.EO_TEST_TMP||os.tmpdir(),'eo-replace-'));
 const target=path.join(directory,'public.docx'),calls={rename:0,open:0},state={armed:false,stage:'rename',code:'EPERM',remaining:0};
 const proxy=Object.create(io);
 proxy.rename=async(a,b)=>{if(state.armed&&b===target){calls.rename++;if(state.stage==='rename'&&state.remaining-->0)throw fault(state.code)}return io.rename(a,b)};
 proxy.open=async(a,...args)=>{if(state.armed&&String(a).endsWith('.tmp')){calls.open++;if(state.stage==='temporary-open'&&state.remaining-->0)throw fault(state.code)}return io.open(a,...args)};
 const graph=modules(proxy,options),files=graph.load('files.cjs');
 await files.atomic(target,Buffer.from('PKoriginal'));const original=await files.read(target);state.armed=true;
 return {directory,target,calls,state,proxy,...graph,files,original,async cleanup(){await io.rm(directory,{recursive:true,force:true})}};
}
test('transient Windows replacement and exclusive temp-open refusals settle without losing original or leaving debris',async()=>{
 for(const stage of ['rename','temporary-open'])for(const code of ['EPERM','EACCES','EBUSY']){
  const f=await fixture();try{
   Object.assign(f.state,{stage,code,remaining:2});
   const saved=await f.files.atomic(f.target,Buffer.from('PKchanged'),f.original);
   assert.equal(await io.readFile(f.target,'utf8'),'PKchanged');assert.equal(saved.hash,f.files.hash(Buffer.from('PKchanged')));
   assert.equal(f.calls[stage==='rename'?'rename':'open'],3);assert.equal(f.clock.waits.reduce((a,b)=>a+b,0),75);
   assert.deepEqual(await io.readdir(f.directory),['public.docx']);
  }finally{await f.cleanup()}
 }
});
test('permanent Windows lock exhausts one bounded budget; original/backup survive and a later save still works',async()=>{
 for(const stage of ['rename','temporary-open'])for(const code of ['EPERM','EACCES','EBUSY']){
  const f=await fixture();try{
   Object.assign(f.state,{stage,code,remaining:Infinity});
   const open=f.proxy.open;f.proxy.open=async(a,...args)=>{if(a===f.target&&args[0]==='r+')throw fault(code);return open(a,...args)};
   await assert.rejects(f.files.atomic(f.target,Buffer.from('PKchanged'),f.original),e=>e.code===code);
   assert.equal(f.clock.time,3000);assert(f.calls[stage==='rename'?'rename':'open']<=16);
   assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
   const entries=await io.readdir(f.directory);assert(!entries.some(n=>n.endsWith('.tmp')));
   const backup=entries.find(n=>n.endsWith('.bak'));assert.equal(!!backup,false);
   if(backup)assert.equal(await io.readFile(path.join(f.directory,backup),'utf8'),'PKoriginal');
   f.state.armed=false;await f.files.atomic(f.target,Buffer.from('PKrecovered'),f.original);
   assert.equal((await f.files.read(f.target)).bytes.toString(),'PKrecovered');
  }finally{await f.cleanup()}
 }
});
test('other platforms and non-transient errors fail immediately',async()=>{
 for(const [platform,code]of [['linux','EPERM'],['darwin','EBUSY'],['win32','EIO'],['win32','ENOSPC'],['win32','EEXIST'],['win32','ENOENT']]){
  const f=await fixture({platform});try{
   Object.assign(f.state,{code,remaining:Infinity});
   await assert.rejects(f.files.atomic(f.target,Buffer.from('PKchanged'),f.original),e=>e.code===code);
   assert.equal(f.calls.rename,1);assert.equal(f.clock.waits.length,0);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
  }finally{await f.cleanup()}
 }
});
test('every retry preserves a concurrent target edit/replacement and a newly appeared destination',async()=>{
 for(const change of ['edit','replace','appeared','backup']){
  const f=await fixture();try{
   const target=change==='appeared'?path.join(f.directory,'new.docx'):f.target;
   f.proxy.rename=async(a,b)=>{if(b===target){f.calls.rename++;if(f.calls.rename===1)throw fault('EPERM')}return io.rename(a,b)};
   f.clock.onWait=async()=>{
    f.clock.onWait=null;
    if(change==='replace'){await io.rename(target,path.join(f.directory,'external-old.docx'));await io.writeFile(target,'PKexternal')}
    else if(change==='backup'){const name=(await io.readdir(f.directory)).find(n=>n.endsWith('.bak'));assert(name);await io.writeFile(path.join(f.directory,name),'PKexternal-backup')}
    else await io.writeFile(target,'PKexternal');
   };
   await assert.rejects(f.files.atomic(target,Buffer.from('PKchanged'),change==='appeared'?{absent:true}:f.original),/changed/i);
   assert.equal(f.calls.rename,1);
   assert.equal(await io.readFile(target,'utf8'),change==='backup'?'PKoriginal':'PKexternal');
   assert(!(await io.readdir(f.directory)).some(n=>n.endsWith('.tmp')));
  }finally{await f.cleanup()}
 }
});
test('temp creation and replacement share the same retry deadline',async()=>{
 const f=await fixture();try{
  let opens=0;f.proxy.open=async(a,...args)=>{if(a===f.target&&args[0]==='r+')throw fault('EACCES');if(String(a).endsWith('.tmp')&&opens++<2)throw fault('EBUSY');return io.open(a,...args)};
  f.proxy.rename=async(a,b)=>{if(b===f.target)throw fault('EACCES');return io.rename(a,b)};
  await assert.rejects(f.files.atomic(f.target,Buffer.from('PKchanged'),f.original),e=>e.code==='EACCES');
  assert.equal(f.clock.time,3000);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
 }finally{await f.cleanup()}
});
test('backoff yields the event loop while the original remains intact until commit',async()=>{
 const f=await fixture({fakeTime:false});try{
  f.state.remaining=2;let settled=false,ticks=0;
  const timer=setInterval(()=>ticks++,5),saving=f.files.atomic(f.target,Buffer.from('PKchanged'),f.original).finally(()=>settled=true);
  saving.catch(()=>{});
  try{
   await new Promise(resolve=>setTimeout(resolve,10));assert.equal(settled,false);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
   await saving;assert(ticks>=2);assert.equal(await io.readFile(f.target,'utf8'),'PKchanged');
  }finally{clearInterval(timer);await saving.catch(()=>{})}
 }finally{await f.cleanup()}
});
function bootMain(graph,{fontModule}={}){
 const filename=path.join(__dirname,'close-recovery.test.cjs'),real=createRequire(filename),scope={exports:{}};
 let source=fs.readFileSync(filename,'utf8');
 source=source.replace("const Base=load('./recovery.cjs').Recovery","const Base=override('./recovery.cjs',load).Recovery");
 assert(source.includes(':load(name),module:'));
 source=source.replace(':load(name),module:',':override(name,load),module:');
 const override=(name,load)=>fontModule&&name==='./fonts.cjs'?fontModule:['./files.cjs','./settings-store.cjs','./recovery.cjs'].includes(name)?graph.load(name.slice(2)):load(name);
 vm.runInNewContext(source+'\nmodule.exports={boot};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate,override});
 return scope.exports.boot({platform:'win32',document:true});
}
test('font consent persistence recovers from a transient Windows replacement refusal before listing fonts',async()=>{
 const proxy=Object.create(io),graph=modules(proxy);let settingsWrites=0,armed=false,env,listCalls=0;
 const publicFaces=[{id:'public-font',family:'Public Sans',style:'Regular'}],fontModule={Fonts:class{configure(){} clear(){} peek(){return null} async enumerate(){listCalls++;return publicFaces}}};
 proxy.rename=async(a,b)=>{if(armed&&String(b).endsWith('desktop-settings.json')&&settingsWrites++===0)throw fault('EPERM');return io.rename(a,b)};
 try{
  env=await bootMain(graph,{fontModule});await env.invoke('font-disable');armed=true;env.responses.push(1);
  assert.equal(await env.invoke('font-consent'),true);assert.equal(settingsWrites,2);
  assert.equal(JSON.parse(await io.readFile(path.join(env.directory,'desktop-settings.json'))).fontConsent,true);
  assert.equal(await env.invoke('font-permission'),true);assert.equal(await env.invoke('font-choice'),'granted');
  assert.equal(listCalls,0);assert.deepEqual(await env.invoke('fonts'),publicFaces);assert.equal(listCalls,1);
 }finally{if(env)await env.cleanup()}
});
test('failed save/recovery/preferences do not poison later autosave, save, Home or document opens',async()=>{
 const proxy=Object.create(io),graph=modules(proxy);let blocked=null,env;
 proxy.rename=async(a,b)=>{if(blocked&&String(b).endsWith(blocked))throw fault('EBUSY');return io.rename(a,b)};
 proxy.open=async(filename,...args)=>{if(blocked&&String(filename).endsWith(blocked)&&args[0]==='r+')throw fault('EBUSY');return io.open(filename,...args)};
 try{
  env=await bootMain(graph);const token=env.selected.token,target=path.join(env.directory,'test.docx'),original=await io.readFile(target);
  env.state.dirty=true;
  blocked='test.docx';await assert.rejects(env.invoke('save',token,new Uint8Array(Buffer.from('PKfailed-save')),false,{protected:false,remove:false}),e=>e.code==='EBUSY');
  assert.deepEqual(await io.readFile(target),original);
  blocked='.recovery';await assert.rejects(env.invoke('recovery-save',token,0,new Uint8Array(Buffer.from('PKfailed-recovery'))),e=>e.code==='EBUSY');
  blocked=null;assert(await env.invoke('recovery-save',token,0,new Uint8Array(Buffer.from('PKgood-recovery'))));
  assert.equal((await env.invoke('recovery-list')).length,1);
  blocked='desktop-settings.json';await assert.rejects(env.invoke('font-dismiss'),e=>e.code==='EBUSY');
  env.state.dirty=false;assert.equal((await env.invoke('home')).recents.length,1);
  assert.equal(await env.invoke('drop',target),null,'An already open file focuses its existing document');
  blocked=null;await env.invoke('return-home');const reopened=await env.invoke('drop',target);
  const saved=await env.invoke('save',reopened.token,new Uint8Array(Buffer.from('PKlater-save')),false,{protected:false,remove:false});
  assert(saved.artifactId);assert.equal(await io.readFile(target,'utf8'),'PKlater-save');await env.invoke('return-home');
  assert((await env.invoke('new','xlsx')).token);
 }finally{if(env)await env.cleanup()}
});

test('an exclusive open that leaves a refused temp rotates its name and cleans all owned staging files',async()=>{
 const f=await fixture();try{
  const opened=[],realOpen=f.proxy.open;let failed=false;
  f.proxy.open=async(a,...args)=>{
   if(String(a).endsWith('.tmp')){
    opened.push(a);if(!failed){failed=true;const handle=await io.open(a,...args);await handle.writeFile('partial staging');await handle.close();throw fault('EPERM')}
   }
   return realOpen(a,...args);
  };
  await f.files.atomic(f.target,Buffer.from('PKchanged'),f.original);
  assert.equal(new Set(opened).size,2);assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('an acknowledged post-commit rename error never replaces twice and preserves the durable backup',async()=>{
 const f=await fixture();try{
  let attempts=0;f.proxy.rename=async(a,b)=>{if(b===f.target){attempts++;await io.rename(a,b);throw fault('EBUSY')}return io.rename(a,b)};
  const failure=await f.files.atomic(f.target,Buffer.from('PKcommitted'),f.original).then(()=>assert.fail('Durability warning required'),e=>e);
  assert.equal(attempts,1);assert.equal(failure.replacementCompleted,true);
  assert.equal(await io.readFile(f.target,'utf8'),'PKcommitted');
  assert.equal(await io.readFile(failure.originalBackup,'utf8'),'PKoriginal');assert(!(await io.readdir(f.directory)).some(n=>n.endsWith('.tmp')));
 }finally{await f.cleanup()}
});
test('main retains the writing operation and busy guard during asynchronous replacement backoff',async()=>{
 const proxy=Object.create(io),graph=modules(proxy,{fakeTime:false});let env,attempts=0,armed=false;
 proxy.rename=async(a,b)=>{if(armed&&String(b).endsWith('test.docx')&&attempts++<2)throw fault('EPERM');return io.rename(a,b)};
 try{
  env=await bootMain(graph);armed=true;
  const saving=env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('PKpending-save')),false,{protected:false,remove:false},'local-operation-1');saving.catch(()=>{});
  while(!attempts)await new Promise(setImmediate);
  await assert.rejects(env.invoke('new','xlsx'),/Another file operation/);
  assert(env.sent.some(([channel,event])=>channel==='eo:operation-stage'&&event.id==='local-operation-1'&&event.phase==='writing'));
  assert.equal(await io.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKtest-public-document');
  assert((await saving).artifactId);assert.equal(await env.invoke('new','xlsx'),null);
  assert.equal((await env.invokeFor(env.documents.at(-1),'initial')).format,'xlsx');
 }finally{if(env)await env.cleanup()}
});

test('exhausted access failures use translated save guidance without exposing filesystem paths',async()=>{
 const errors=require('../../desktop/errors.js');
 for(const code of ['EPERM','EACCES','EBUSY']){
  const message=errors.message({code,message:code+': private filesystem path'},{savePermission:'Translated permission guidance',saveBusy:'Translated busy guidance'});
  assert.equal(message,code==='EACCES'?'Translated permission guidance':'Translated busy guidance');
  assert(!message.includes('private'));
 }
});
