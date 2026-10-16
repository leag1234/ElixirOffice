// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
assert(process.env.EO_UPSTREAM,'Set EO_UPSTREAM to the owned upstream worktree');
const folder=path.join(process.env.EO_UPSTREAM,'web-apps/apps/common/main/lib/elixir-local'),Operation=require(path.join(folder,'Operation.js'));
function setup({onSave,onExport,onError,beforeOperationWork,protection={protected:false,remove:false}}={}){
 let installer,resets=0,dirty=true,conversions=0,serialized=0;const events=[],callbacks={};
 const api={DocInfo:{get_OfflineApp:()=>true},asc_registerCallback:(name,fn)=>callbacks[name]=fn,asc_unregisterCallback:name=>delete callbacks[name],
 isDocumentModified:()=>dirty,SetDocumentModified:value=>dirty=value,WordControl:{m_oLogicDocument:{}}};
 const passwords={install:()=>({save:async fn=>fn({},{}),copyAs:async(_target,fn)=>fn({},protection),saveAs:fn=>fn(),dispose(){},isProtected:()=>false,isRecoveryLocked:()=>false,confirmExport:async()=>true})};
 const images={assertAvailable(){},install:()=>({dispose(){},activate(){}})};
 const define=(_deps,factory)=>{installer=factory(images,{},passwords,Operation,require(path.join(folder,'FileNames.js')))};define.amd=true;
 const context={define,URL,Blob,Map,Promise,Uint8Array,setTimeout,clearTimeout,
 AscCommon:{g_oDocumentUrls:{addImageUrl(){},getLocal(){}},History:{Points:[],Index:0,Reset_SavedIndex(){resets++}}},
 AscCommonWord:{BinaryFileWriter:class{Write(){serialized++;return new Uint8Array([1])}}},
 EOWasmConvert:{formats:{docx:65,odt:67},convert:async(_input,_from,_to,options)=>{conversions++;options.onProgress?.({stage:'converting'});return new Uint8Array([80,75]);}}};
 vm.runInNewContext(fs.readFileSync(path.join(folder,'Controller.js'),'utf8'),context);
 const controller=installer.install(api,{format:'docx',operationScope:'public-document',onOperation:e=>events.push(e),onSave,onExport,onError,beforeOperationWork});
 return {controller,events,api,stats:()=>({resets,dirty,conversions,serialized})};
}
test('real Office controller emits ready only after one awaited commit for duplicate saves',async()=>{
 let commit;const pending=new Promise(resolve=>commit=resolve),env=setup({onSave:()=>pending});
 const first=env.controller.save(),second=env.controller.save();await new Promise(setImmediate);
 assert.equal(env.stats().conversions,1);assert.equal(env.stats().resets,0);assert(!env.events.some(e=>e.phase==='ready'));
 commit({kind:'saved',committed:true,name:'public.docx',bytes:2});await Promise.all([first,second]);
 assert.equal(env.stats().resets,1);assert.equal(env.events.filter(e=>e.phase==='ready').length,1);assert.equal(env.events.at(-1).scope,'public-document');
});
test('real Office cancelled save/error never clear dirty or emit ready',async()=>{
 for(const mode of ['cancel','error']){
  const env=setup({onSave:async()=>{if(mode==='cancel')return {kind:'cancelled'};throw Error('Disk full');}});
  await assert.rejects(env.controller.save(),mode==='cancel'?/cancelled/:/Disk full/);
  assert.equal(env.stats().resets,0);assert.equal(env.stats().dirty,true);assert.equal(env.events.at(-1).phase,mode==='cancel'?'cancelled':'error');
  assert(!env.events.some(e=>e.phase==='ready'));
 }
});
test('real converted-copy exports keep dirty/history and acknowledge only written output',async()=>{
 for(const mode of ['copy','backstage']){
  const env=setup({onExport:async()=>({kind:'download-started',name:'public.odt'})});
  if(mode==='copy')await env.controller.exportCopy('odt',async()=>({kind:'saved',committed:true,name:'public.odt'}));
  else await env.controller.exportAs('odt',{});
  assert.equal(env.stats().dirty,true);assert.equal(env.stats().resets,0);
  assert.equal(env.events.at(-1).phase,mode==='copy'?'ready':'complete');assert.equal(env.events.at(-1).outcome,mode==='copy'?'saved':'download-started');
 }
});
test('converted-copy cancel/IO failure preserve source and never announce file-ready',async()=>{
 for(const mode of ['cancel','error']){
  const env=setup();
  if(mode==='cancel')await env.controller.exportCopy('odt',async()=>({kind:'cancelled'}));
  else await assert.rejects(env.controller.exportCopy('odt',async()=>{throw Error('Destination changed');}),/Destination changed/);
  assert.equal(env.stats().dirty,true);assert.equal(env.stats().resets,0);assert(!env.events.some(e=>e.phase==='ready'));
  assert.equal(env.events.at(-1).phase,mode==='cancel'?'cancelled':'error');
 }
});

test('desktop presentation barrier precedes actual serialization/conversion and native Ready',async()=>{
 let present,writes=0;const gate=new Promise(resolve=>present=resolve),e=setup({beforeOperationWork:()=>gate,onSave:async()=>{writes++;return {kind:'saved',committed:true,name:'public.docx'};}});
 const pending=e.controller.save();await new Promise(setImmediate);
 assert.equal(e.events.at(-1).phase,'preparing');assert.equal(e.stats().serialized,0);assert.equal(e.stats().conversions,0);assert.equal(writes,0);
 present();await pending;assert.equal(e.stats().serialized,1);assert.equal(writes,1);assert.equal(e.events.at(-1).phase,'ready');
});

test('actual Office format downloads forward protection to the destination and preserve dirty/history',async()=>{
 for(const protection of [{protected:true,remove:false},{protected:false,remove:true}]){
  let delivered;const e=setup({protection,onExport:async(bytes,target,options,stats,actual)=>{delivered={bytes,target,actual};return {kind:'saved',committed:true,name:'public.odt',artifactId:'opaque'};}});
  await e.controller.exportAs('odt',{});
  assert.equal(delivered.target,'odt');assert.deepEqual(delivered.actual,protection);
  assert.equal(e.events.at(-1).phase,'ready');assert.equal(e.events.at(-1).artifactId,'opaque');
  assert.equal(e.stats().dirty,true);assert.equal(e.stats().resets,0);
 }
});

test('actual SDK Ctrl+S during an independent PDF job reports mapped busy without an unhandled rejection',async()=>{
 const errors=[],e=setup({onError:error=>errors.push(error)}),job=e.controller.beginOperation('pdf-export');
 assert.equal(e.api.asc_Save(),true);await new Promise(setImmediate);
 assert.equal(errors.length,1);assert.equal(errors[0].code,'operation-busy');assert.equal(e.stats().conversions,0);assert.equal(e.stats().resets,0);
 job.cancel();await e.controller.save();assert.equal(e.stats().conversions,1);
});
