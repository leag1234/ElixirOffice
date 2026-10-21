// SPDX-License-Identifier: AGPL-3.0-only
// Run the production harness against in-memory CDP/process/FS transport only.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
function fixture({duplicate=false,single=false,shellReady=true}={}){
 const filename=path.join(__dirname,'harness.cjs'),load=createRequire(filename),documents=load('./document-pages.cjs');
 const context=new EventEmitter(),pages=[],state={windowId:'window-A',activeId:'document-B'},app={pid:99999999,exitCode:null,signalCode:null},kills=[];
 function page(id,url=documents.DOCUMENT_URL){
  const p=Object.assign(new EventEmitter(),{id,url:()=>url,isClosed:()=>false,context:()=>context,waitForFunction:async()=>{},evaluate:async(fn,value)=>{
   if(url===documents.SHELL_URL){if(fn.toString().includes('EOTabShellReady'))return shellReady;if(value!==undefined){state.activeId=value;return true}return fn.toString().includes('.state')?state:{state}}
   return{documentId:id,windowId:'window-A'};
  }});
  const emit=p.emit;p.emit=function(name,...args){const result=emit.call(p,name,...args);if(name==='request'||name==='response')context.emit(name,...args);return result};
  return p;
 }
 const a=page('document-A'),b=page('document-B'),shell=page(null,documents.SHELL_URL);pages.push(a,...(single?[]:[b]),shell);if(single)state.activeId='document-A';
 if(duplicate)pages.push(page('document-B'));
 context.pages=()=>pages;
 const browser={contexts:()=>[context],close:async()=>{app.exitCode=0}};
 const mocks={
  'node:fs/promises':{mkdir:async()=>{},open:async()=>({fd:123,close:async()=>{}}),readFile:async()=>Buffer.from('electron /synthetic/main.cjs')},
  'node:child_process':{spawn:()=>app},
  'node:net':{createServer:()=>({listen(_port,_host,fn){fn()},address:()=>({port:43210}),close(fn){fn()}})},
  'synthetic-playwright':{chromium:{connectOverCDP:async()=>browser}}
 };
 const output={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:output,exports:output.exports,require:name=>mocks[name]||load(name),__dirname,Buffer,setTimeout:fn=>setImmediate(fn),console,process:{platform:'linux',env:{EO_PLAYWRIGHT:'synthetic-playwright',EO_DESKTOP_ROOT:'/synthetic/no-profile-written'},kill:(...args)=>kills.push(args)}},{filename});
 return{a,b,shell,state,browser,context,kills,api:output.exports,newPage(id){const p=page(id);pages.push(p);context.emit('page',p);return p}};
}
module.exports={fixture};
