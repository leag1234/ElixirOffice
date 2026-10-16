// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),moduleScope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:moduleScope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=moduleScope.exports,Errors=require('../../desktop/errors.js'),Feedback=require('../../desktop/feedback.js'),catalogs=require('../../tools/desktop/i18n-extra.json'),tick=()=>new Promise(setImmediate);

test('actual saved-file IPC handlers authorize, revalidate copies, guard unsaved open and hide missing paths',async()=>{
 const shown=[],e=await boot({document:true,onShow:target=>shown.push(target)});
 try{
  const original=await fsp.readFile(path.join(e.directory,'test.docx')),target=path.join(e.directory,'public-copy.docx');
  e.saveResponses.push({canceled:false,filePath:target});
  const copy=await e.invoke('export',e.selected.token,new Uint8Array(Buffer.from('PKpublic-copy')),'docx',undefined,'job');
  await assert.rejects(e.invoke('saved-show',target),/Saved file unavailable/);
  assert(copy.artifactId);assert.equal(await e.invoke('saved-show',copy.artifactId),true);assert.deepEqual(shown,[target]);
  const handler=e.handlers.get('eo:saved-show');
  assert.throws(()=>handler({sender:{},senderFrame:{}},copy.artifactId),/desktop start window/i);
  e.state.dirty=true;e.responses.push(0);assert.equal(await e.invoke('saved-open',copy.artifactId),null);assert.equal(e.window.closed,undefined);
  await fsp.rename(target,target+'.moved');
  for(const action of ['saved-show','saved-open']){
   await assert.rejects(e.invoke(action,copy.artifactId),error=>{
    const ipc=Error("Error invoking remote method 'eo:"+action+"': Error: "+error.message);
    const mapped=Errors.message(ipc,catalogs.fr);
    assert.equal(mapped,catalogs.fr.opFileMissing);assert(!mapped.includes(e.directory));assert(!error.message.includes(e.directory));return true;
   });
  }
  e.state.dirty=false;const other=path.join(e.directory,'second-copy.docx');e.saveResponses.push({canceled:false,filePath:other});
  const next=await e.invoke('export',e.selected.token,new Uint8Array(Buffer.from('PKpublic-second')),'docx',undefined,'next-job');
  const opened=await e.invoke('saved-open',next.artifactId);assert.equal(opened.name,'second-copy.docx');assert.notEqual(opened.token,e.selected.token);
  await assert.rejects(e.invoke('saved-show',next.artifactId),/Saved file unavailable/);
  assert.deepEqual(await fsp.readFile(path.join(e.directory,'test.docx')),original);
 }finally{await e.cleanup();}
});

test('terminal feedback preserves unrelated status while busy Ctrl+S uses translated operation status',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8'),statuses=[];
 const start=source.indexOf('function operationEvent('),end=source.indexOf('function outputOutcome(',start);
 const c={file:{token:'doc'},statusOperation:'different-operation',lastOperation:null,info:{strings:catalogs.fr},EODesktopErrors:Errors,status:s=>{statuses.push(s);c.statusOperation=null;},window:{dispatchEvent(){}},CustomEvent:class{},feedback:{update(){}},backstage:null};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 c.operationEvent({id:'job',scope:'doc',phase:'cancelled'});assert.deepEqual(statuses,[]);
 c.statusOperation='job';c.operationEvent({id:'job',scope:'doc',phase:'cancelled'});assert.deepEqual(statuses,['']);
 c.opening=false;c.choosingSaveAs=false;c.operationBusy=true;c.closeCheck=false;c.abort=null;c.openingOperation=null;c.controller={isModified:()=>false,hasPendingImages:()=>false,isSaving:()=>false};
 const a=source.indexOf("Object.defineProperty(window,'EODesktopState'"),b=source.indexOf('function blockDuringClose(',a);vm.runInContext(source.slice(a,b),c);
 assert.equal(c.window.EODesktopState(false).opening,false,'The UI lock for Choose/Open must not block its own native discard guard');
 c.choosingSaveAs=true;assert.equal(c.window.EODesktopState(false).opening,true);c.choosingSaveAs=false;
 c.lastOperation={id:'running',phase:'converting'};assert.equal(c.window.EODesktopState(false).opening,true);
 assert.equal(Errors.message(Object.assign(Error('A local operation is already running'),{code:'operation-busy'}),catalogs.fr),catalogs.fr.opPreparing);
});

test('actual print handler waits for native callback and reports submission/cancellation without file-ready',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8'),start=source.indexOf('function outputOutcome('),end=source.indexOf('async function exportOutput(',start),context={};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const up=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer'),Operation=require(path.join(up,'web-apps/apps/common/main/lib/elixir-local/Operation.js'));
 for(const success of [true,false]){
  let respond;const e=await boot({document:true,onPrint:(options,callback)=>{assert.equal(options.silent,false);respond=callback;}}),events=[],tracker=Operation.create(value=>events.push(value),'public'),job=tracker.begin('print',{name:'public.docx'});
  try{
   const printing=e.invoke('pdf',e.selected.token,new Uint8Array(Buffer.from('%PDF-public-print')),true,false,job.id);
   for(let n=0;n<100&&!respond;n++)await new Promise(resolve=>setTimeout(resolve,5));assert(respond);assert(tracker.isBusy());assert(!events.some(e=>e.phase==='ready'||e.phase==='complete'));
   respond(success,success?null:'cancelled');job.finish(context.outputOutcome(await printing,true));
   assert.equal(events.at(-1).phase,success?'complete':'cancelled');
   if(success){assert.equal(events.at(-1).outcome,'print-started');assert.equal(Feedback.label(events.at(-1)),'Sent to the print system');}
   assert(!events.some(e=>e.phase==='ready'));assert.equal((await fsp.readdir(e.directory)).filter(name=>name.endsWith('.pdf')).length,0);
  }finally{await e.cleanup();}
 }
});
