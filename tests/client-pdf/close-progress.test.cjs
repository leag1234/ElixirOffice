// SPDX-License-Identifier: AGPL-3.0-only
// Real renderer/main/operation/SDK writer contracts in VM; native OS dialogs are injected.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
assert(process.env.EO_UPSTREAM,'Set EO_UPSTREAM to a full owned checkout');
const root=path.resolve(__dirname,'../..'),helper=path.join(root,'tests/desktop/close-recovery.test.cjs'),load=createRequire(helper),m={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:m,__dirname:path.dirname(helper),process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=m.exports,Feedback=require('../../desktop/feedback.js'),Errors=require('../../desktop/errors.js');
const Operation=require(path.join(process.env.EO_UPSTREAM,'web-apps/apps/common/main/lib/elixir-local/Operation.js'));
const renderer=fs.readFileSync(path.join(root,'desktop/renderer.js'),'utf8');
async function until(check){for(let n=0;n<400;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert(check(),'Timed out waiting for actual operation state');}
test('clean and dirty close during PDF export or print preparation cancels closure or releases the actual worker on Discard',async()=>{
 for(const dirty of [false,true])for(const print of [false,true]){
  const workers=[],events=[];let nativeOutputs=0,disposed=0,tracker;
  class Worker{
   constructor(){workers.push(this);this.stops=0;}postMessage(job){this.job=job;}terminate(){this.stops++;}reply(data){this.onmessage({data});}
  }
  const sdk={window:{location:{href:'https://example.invalid/example/local-assets/web-apps/apps/documenteditor/main/index.html'},EOWasmFonts:{prepareFS:async()=>({bytes:0,written:[]})}},AscCommon:{ClientPdf:{unsupported:(code,message)=>Object.assign(Error(message||code),{code})}},Worker,URL,Uint8Array,DataView,Map,Set,Promise,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(process.env.EO_UPSTREAM,'sdkjs/common/clientpdf/wasm-pdf.js'),'utf8'),sdk);
  const c={openingOperation:null,window:{document:{hidden:true},setTimeout,clearTimeout,dispatchEvent:e=>events.push(e.detail)},opening:false,operationBusy:false,closeCheck:false,pendingRequested:false,statusOperation:null,lastOperation:null,info:{strings:{opPreparing:'Préparation…'}},file:{token:'before-select',format:'docx'},abort:null,main:{api:{}},
   controller:{isModified:()=>dirty,hasPendingImages:()=>false,isSaving:()=>false,beginOperation:kind=>tracker.begin(kind),dispose:()=>{disposed++;tracker.dispose();},confirmUnprotectedExport:async()=>false},
   EOOperationFeedback:Feedback,EODesktopErrors:Errors,feedback:{update(){}},backstage:null,AbortController,Error,Uint8Array,setTimeout,clearTimeout,
   CustomEvent:class{constructor(_name,options){this.detail=options.detail;}},t:key=>key,script:async()=>{},status:(_text,id)=>c.statusOperation=id||null,buttons:value=>c.operationBusy=value,fail:error=>{if(!Errors.cancelled(error))throw error;},drainPending(){},
   eoDesktop:{pdf:async()=>{nativeOutputs++;return null;},onAction:fn=>c.action=fn}};
  c.frame={EODesktopPdf:async(_api,_format,options)=>{const writer=new sdk.window.EOWasmPdf.Writer(options);await writer.feed(new Uint8Array([202,203]));return {bytes:await writer.finish(),stats:{backend:'wasm'}};}};
  c.choosingSaveAs=false;c.saveAsTicket=null;
  vm.createContext(c);
  let start=renderer.indexOf("Object.defineProperty(window,'EODesktopState'"),end=renderer.indexOf('function blockDuringClose(',start);vm.runInContext(renderer.slice(start,end),c);
  start=renderer.indexOf('function operationEvent(');end=renderer.indexOf('async function updateDirty()',start);vm.runInContext(renderer.slice(start,end),c);
  start=renderer.indexOf('async function pdf(');end=renderer.indexOf('async function recoveryCopy(',start);vm.runInContext(renderer.slice(start,end),c);
  start=renderer.indexOf('async function save(');end=renderer.indexOf('function setDocumentName(',start);vm.runInContext(renderer.slice(start,end),c);
  start=renderer.indexOf('eoDesktop.onAction(');end=renderer.indexOf("document.addEventListener('dragover'",start);vm.runInContext(renderer.slice(start,end),c);
  const env=await boot({document:true,getRendererState:expression=>expression.includes('EODesktopCancelOperation')?c.window.EODesktopCancelOperation():c.window.EODesktopState(false),onSend:(channel,action)=>{if(channel==='eo:action')c.action(action);}});
  c.file.token=env.selected.token;tracker=Operation.create(e=>c.operationEvent(e),c.file.token);
  try{
   const original=await fsp.readFile(path.join(env.directory,'test.docx'));
   let running=c.pdf(print);await until(()=>workers[0]?.job);workers[0].reply({type:'progress',stage:'converting'});
   assert.equal(c.window.EODesktopState(false).opening,true);assert.equal(Feedback.canCancel(c.lastOperation),true);assert.equal(await c.save(),false);
   env.responses.push(0);env.window.close();await until(()=>env.sent.some(a=>a[1]==='resume-close'));
   assert.equal(env.window.closed,undefined);assert.equal(c.closeCheck,false);assert.equal(env.dialogs.length,1);assert.equal(workers[0].stops,0);
   c.abort.abort();await running;assert.equal(c.operationBusy,false);assert.equal(tracker.isBusy(),false);
   // A cancelled close/export leaves a reusable editor; retry reaches the destination chooser.
   running=c.pdf(print);await until(()=>workers[1]?.job);workers[1].reply({bytes:new Uint8Array(Buffer.from('%PDF-public-retry'))});await running;
   assert.equal(nativeOutputs,1);assert.equal(c.operationBusy,false);
   running=c.pdf(print);await until(()=>workers[2]?.job);
   env.responses.push(1);env.window.close();await until(()=>env.window.closed);await running;
   assert.equal(disposed,1);assert.equal(c.operationBusy,false);assert.equal(tracker.isBusy(),false);
   assert(workers.every(w=>w.stops===1));assert.equal(nativeOutputs,1,'Discard reached native output');
   assert(!events.some(e=>e.phase==='ready'));assert.equal(events.at(-1).phase,'cancelled');
   assert.deepEqual(await fsp.readFile(path.join(env.directory,'test.docx')),original);
   const partial=(await fsp.readdir(env.directory)).filter(name=>/\.tmp$|\.pdf$/.test(name));assert.deepEqual(partial,[]);
  }finally{c.abort?.abort();await env.cleanup();}
 }
});
