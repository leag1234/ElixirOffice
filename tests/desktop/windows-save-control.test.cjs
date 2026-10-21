// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'windows-replace.test.cjs'),real=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={fixture,bootMain};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,TextDecoder,URL,setTimeout,clearTimeout,setImmediate,setInterval,clearInterval});
const {fixture}=scope.exports,fault=code=>Object.assign(Error('Injected save-control failure'),{code});
function wrap(handle,changes){return new Proxy(handle,{get(target,key){if(key in changes)return changes[key];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})}
test('Windows rename retry uses metadata guards without hashing whole originals on every refusal',async()=>{
 const f=await fixture();try{
  let streams=0;const open=f.proxy.open;
  f.proxy.open=async(filename,...args)=>{const handle=await open(filename,...args);return wrap(handle,{createReadStream(...values){streams++;return handle.createReadStream(...values)}})};
  f.state.remaining=8;await f.files.atomic(f.target,Buffer.from('PKnew'),f.original);
  assert.equal(f.calls.rename,9);assert(streams<=5,'Whole-file hashing must not scale with retry count');
 }finally{await f.cleanup()}
});
test('an already-aborted save has no staging, backup or destination mutation',async()=>{
 const f=await fixture();try{
  const control=new AbortController();control.abort();await assert.rejects(f.files.atomic(f.target,Buffer.from('PKnew'),f.original,{signal:control.signal}),e=>e.name==='AbortError');
  assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('scoped cancellation interrupts retry and resolves only after owned staging/backup cleanup',async()=>{
 const f=await fixture();try{
  assert.equal(typeof f.files.cancelPending,'function');f.state.remaining=Infinity;let cancelled;f.clock.onWait=()=>{f.clock.onWait=null;cancelled=f.files.cancelPending({scope:'public-scope',id:'local-operation-1',deadline:Date.now()+100})};
  await assert.rejects(f.files.atomic(f.target,Buffer.from('PKnew'),f.original,{scope:'public-scope',id:'local-operation-1'}),e=>e.name==='AbortError');
  assert.equal(await cancelled,1);assert.equal(f.calls.rename,1);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('a close deadline bounds a longer retry configuration without entering the fallback',async()=>{
 const f=await fixture({fakeTime:false,env:{EO_WINDOWS_SAVE_RETRY_MS:'15000'}});try{
  f.state.remaining=Infinity;let inplace=0;const open=f.proxy.open;
  f.proxy.open=async(filename,...args)=>{if(filename===f.target&&args[0]==='r+')inplace++;return open(filename,...args)};
  const started=Date.now();await assert.rejects(f.files.atomic(f.target,Buffer.from('PKnew'),f.original,{deadline:Date.now()+40}),e=>e.name==='AbortError');
  assert(Date.now()-started<600);assert.equal(inplace,0);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
 }finally{await f.cleanup()}
});
test('cancellation after an in-place short write restores the original before settling and deletes the verified backup',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'0'}});try{
  f.state.remaining=Infinity;const control=new AbortController(),open=f.proxy.open;let writes=0;
  f.proxy.open=async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;return wrap(handle,{async write(buffer,offset,length,position){
   writes++;if(writes===1){const result=await handle.write(buffer,offset,3,position);control.abort();return result}return handle.write(buffer,offset,length,position);
  }})};
  const error=await f.files.atomic(f.target,Buffer.from('PKnew longer output'),f.original,{signal:control.signal}).then(()=>assert.fail('Cancelled save must reject'),e=>e);
  assert.equal(error.name,'AbortError');assert.equal(error.rollbackVerified,true);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('an uncertain cancelled rollback remains an error and names only its retained backup basename',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'0'}});try{
  f.state.remaining=Infinity;const control=new AbortController(),open=f.proxy.open;let writes=0;
  f.proxy.open=async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;return wrap(handle,{async write(buffer,offset,length,position){
   if(++writes===1){const result=await handle.write(buffer,offset,3,position);control.abort();return result}throw fault('EIO');
  }})};
  const error=await f.files.atomic(f.target,Buffer.from('PKnew longer output'),f.original,{signal:control.signal}).then(()=>assert.fail('Uncertain save must reject'),e=>e),errors=real('../../desktop/errors.js');
  assert.equal(error.rollbackUncertain,true);assert.equal(errors.cancelled(error),false);
  const name=(await io.readdir(f.directory)).find(value=>value.endsWith('.bak'));assert(name);
  const message=errors.message(error);assert(message.includes(name));assert(!message.includes(f.directory));
  const serialized={message:"Error invoking remote method 'eo:save': Error: "+error.message};assert.equal(errors.cancelled(serialized),false);assert.equal(errors.message(serialized),message);
   for(const mark of ['\u061c','\u200e','\u200f','\u202e','\u2066']){
    const name='public'+mark+'.bak',scope=real('../../desktop/write-scope.cjs')(),entry=scope.start();
    entry.finish({rollbackUncertain:true,originalBackup:'C:\\private\\'+name});
    assert.equal(scope.warnings()[0].backupName,'public.bak');
    const label=errors.message({message:'SAVE_RESTORE_UNCERTAIN:'+JSON.stringify(name)});
    assert(label.includes('public.bak'));assert(!label.includes(mark));
   }
 }finally{await f.cleanup()}
});
test('verified rollback failures can be retried without accumulating one backup per save attempt',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'0'}});try{
  f.state.remaining=Infinity;const open=f.proxy.open;
  for(let attempt=0;attempt<3;attempt++){
   let failed=false;f.proxy.open=async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;return wrap(handle,{async sync(){if(!failed){failed=true;throw fault('EIO')}return handle.sync()}})};
   const error=await f.files.atomic(f.target,Buffer.from('PKnew longer output'),f.original).then(()=>assert.fail('Injected failure must reject'),e=>e);
   assert.equal(error.rollbackVerified,true);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
  }
 }finally{await f.cleanup()}
});

async function until(predicate){for(let n=0;n<400;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Timed out waiting for the actual main state');}
test('a committed rename is hash-verified once before deleting the original backup',async()=>{
 const f=await fixture();try{
  const rename=f.proxy.rename;f.proxy.rename=async(a,b)=>{await rename(a,b);if(b===f.target)await io.writeFile(b,'PKunexpected committed bytes')};
  const error=await f.files.atomic(f.target,Buffer.from('PKexpected'),f.original).then(()=>assert.fail('Changed committed output must fail'),e=>e);
  assert.equal(error.replacementCompleted,true);assert.equal(error.outputVerificationFailed,true);assert.equal(error.rollbackUncertain,true);
  const name=(await io.readdir(f.directory)).find(value=>value.endsWith('.bak'));assert(name);assert.equal(await io.readFile(path.join(f.directory,name),'utf8'),'PKoriginal');
  assert(real('../../desktop/errors.js').message(error).includes(name));
 }finally{await f.cleanup()}
});
test('actual main cancellation validates the scope and interrupts only the matching save',async()=>{
 const f=await fixture({fakeTime:false,env:{EO_WINDOWS_SAVE_RETRY_MS:'15000'}});let env;
 try{
  env=await scope.exports.bootMain(f);const token=env.selected.token,target=path.join(env.directory,'test.docx'),original=await io.readFile(target);let attempts=0,settled=false;
  f.proxy.rename=async(a,b)=>{if(b===target){attempts++;throw fault('EPERM')}return io.rename(a,b)};
  const saving=env.invoke('save',token,new Uint8Array(Buffer.from('PKcancelled output')),false,{protected:false,remove:false},'local-operation-71').then(()=>assert.fail('Cancelled native save must fail'),e=>{settled=true;return e});
  await until(()=>attempts>0);
  assert.equal(await env.invoke('write-cancel',token,'local-operation-72'),false);assert.equal(settled,false);
  await assert.rejects(env.invoke('write-cancel','wrong-token','local-operation-71'));
  assert.equal(await env.invoke('write-cancel',token,'local-operation-71'),true);
  assert.equal((await saving).name,'AbortError');assert.deepEqual(await io.readFile(target),original);
 }finally{if(env)await env.cleanup();await f.cleanup()}
});
test('actual main force-close waits for cancelled write cleanup before destroying its window',async()=>{
 const f=await fixture({fakeTime:false,env:{EO_WINDOWS_SAVE_RETRY_MS:'15000'}});let env,release;
 try{
  env=await scope.exports.bootMain(f);env.state.dirty=true;const token=env.selected.token,target=path.join(env.directory,'test.docx'),original=await io.readFile(target);let attempts=0,cleaning=false,settled=false;
  const gate=new Promise(resolve=>{release=resolve});
  f.proxy.rename=async(a,b)=>{if(b===target){attempts++;throw fault('EPERM')}return io.rename(a,b)};
  f.proxy.unlink=async filename=>{if(String(filename).startsWith(target)&&String(filename).endsWith('.bak')){cleaning=true;await gate}return io.unlink(filename)};
  const saving=env.invoke('save',token,new Uint8Array(Buffer.from('PKclose cancelled output')),false,{protected:false,remove:false},'local-operation-73').then(()=>assert.fail('Cancelled native save must fail'),e=>{settled=true;return e});
  await until(()=>attempts>0);env.responses.push(1);env.window.close();await until(()=>cleaning);
  assert.notEqual(env.window.closed,true);assert.equal(settled,false);
  await assert.rejects(f.files.atomic(path.join(env.directory,'queued-settings.json'),Buffer.from('{}')),error=>error.name==='AbortError');
  await assert.rejects(io.stat(path.join(env.directory,'queued-settings.json')),error=>error.code==='ENOENT');
  release();assert.equal((await saving).name,'AbortError');await until(()=>env.window.closed);
  assert.deepEqual(await io.readFile(target),original);
 }finally{release?.();if(env)await env.cleanup();await f.cleanup()}
});

test('final-tab File Close waits for cancelled write cleanup and blocks new writes before closing its window',async()=>{
 const f=await fixture({fakeTime:false,env:{EO_WINDOWS_SAVE_RETRY_MS:'15000'}});let env,release;
 try{
  env=await scope.exports.bootMain(f);env.state.dirty=true;const token=env.selected.token,target=path.join(env.directory,'test.docx'),original=await io.readFile(target);let attempts=0,cleaning=false,settled=false;
  const gate=new Promise(resolve=>{release=resolve});
  f.proxy.rename=async(a,b)=>{if(b===target){attempts++;throw fault('EPERM')}return io.rename(a,b)};
  f.proxy.unlink=async filename=>{if(String(filename).startsWith(target)&&String(filename).endsWith('.bak')){cleaning=true;await gate}return io.unlink(filename)};
  const saving=env.invoke('save',token,new Uint8Array(Buffer.from('PKclose cancelled output')),false,{protected:false,remove:false},'local-operation-73').then(()=>assert.fail('Cancelled native save must fail'),e=>{settled=true;return e});
  await until(()=>attempts>0);env.responses.push(1);const closing=env.invoke('close-tab');closing.catch(()=>{});await until(()=>cleaning);
  assert.notEqual(env.window.closed,true);assert.equal(settled,false);
  await assert.rejects(f.files.atomic(path.join(env.directory,'queued-settings.json'),Buffer.from('{}')),error=>error.name==='AbortError');
  await assert.rejects(io.stat(path.join(env.directory,'queued-settings.json')),error=>error.code==='ENOENT');
  release();assert.equal((await saving).name,'AbortError');await until(()=>env.window.closed);
  assert.deepEqual(await io.readFile(target),original);
 }finally{release?.();if(env)await env.cleanup();await f.cleanup()}
});

test('force-close acknowledges one sanitized retained-backup warning; a failed warning keeps the window alive',async()=>{
 for(const acknowledge of [true,false]){
  const f=await fixture({fakeTime:false,env:{EO_WINDOWS_SAVE_RETRY_MS:'0'}});let env,releaseWrite,releaseWarning;
  try{
   env=await scope.exports.bootMain(f);env.state.dirty=true;const token=env.selected.token,target=path.join(env.directory,'test.docx');let writes=0,partial=false,warningShown=false;
   const gate=new Promise(resolve=>{releaseWrite=resolve}),open=f.proxy.open;
   f.proxy.rename=async(a,b)=>{if(b===target)throw fault('EPERM');return io.rename(a,b)};
   f.proxy.open=async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==target||args[0]!=='r+')return handle;return wrap(handle,{async write(buffer,offset,length,position){
    if(++writes===1){const result=await handle.write(buffer,offset,3,position);partial=true;await gate;return result}throw fault('EIO');
   }})};
   const saving=env.invoke('save',token,new Uint8Array(Buffer.from('PKuncertain close output')),false,{protected:false,remove:false},'local-operation-74').then(()=>assert.fail('Uncertain save must fail'),e=>e);
   await until(()=>partial);
   env.responses.push(1,()=>{warningShown=true;if(!acknowledge)return Promise.reject(Error('Injected warning display failure'));return new Promise(resolve=>{releaseWarning=resolve})});
   env.window.close();await until(()=>env.dialogs.length>0);releaseWrite();await until(()=>warningShown);
   const error=await saving;assert.equal(error.rollbackUncertain,true);
   const name=(await io.readdir(env.directory)).find(value=>value.startsWith('test.docx')&&value.endsWith('.bak'));assert(name);
   const warning=env.dialogs[1];assert(warning.message.includes(name));assert(!warning.message.includes(env.directory));assert.equal(env.dialogs.length,2);
   assert.notEqual(env.window.closed,true);assert.equal(f.files.writeWarnings().length,1);
   if(acknowledge){releaseWarning({response:0});await until(()=>env.window.closed);assert.equal(f.files.writeWarnings().length,0);}
   else{await until(()=>env.sent.some(value=>value[0]==='eo:action'&&value[1]==='resume-close'));assert.notEqual(env.window.closed,true);assert.equal(f.files.writeWarnings().length,1);
    const after=path.join(env.directory,'after-cancel.docx');await f.files.atomic(after,Buffer.from('PKavailable'));assert.equal(await io.readFile(after,'utf8'),'PKavailable');
     env.state.dirty=true;let acknowledged=false;
     env.responses.push(0,()=>new Promise(resolve=>{releaseWarning=resolve}));
     env.window.close();
     await until(()=>env.sent.some(value=>value[0]==='eo:action'&&value[1]==='save-close'));
     env.state.dirty=false;
     const closedSaved=env.invoke('closed-saved').then(()=>{acknowledged=true});
     const concurrentClose=env.invoke('closed-saved');
     await until(()=>env.dialogs.length===4);await new Promise(setImmediate);
     assert.equal(acknowledged,false,'Saved-close acknowledgement must await the retained-backup warning');assert.notEqual(env.window.closed,true);
     releaseWarning({response:0});await Promise.all([closedSaved,concurrentClose]);assert.equal(env.dialogs.length,4,'The genuine Save prompt plus concurrent acknowledgements produce only one warning');assert.equal(env.window.closed,true);assert.equal(f.files.writeWarnings().length,0);}
  }finally{releaseWrite?.();releaseWarning?.({response:0});if(env)await env.cleanup();await f.cleanup()}
 }
});
