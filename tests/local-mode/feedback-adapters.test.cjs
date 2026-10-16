// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
assert(process.env.EO_UPSTREAM,'Set EO_UPSTREAM to a full owned checkout');
const folder=path.join(process.env.EO_UPSTREAM,'web-apps/apps/common/main/lib/elixir-local'),Operation=require(path.join(folder,'Operation.js')),tick=()=>new Promise(setImmediate);
function setup(){
 let installer,passwords,dirty=true,resets=0,writes=0,locks=0,before=0,after=0,abort=new AbortController(),commit;
 const events=[],dialogs=[],callbacks={},secret=crypto.randomBytes(20).toString('hex'),delivered=new Promise(resolve=>commit=resolve);
 class Dialog{constructor(options){this.options=options;dialogs.push(this);this.inputPwd={setValue(){}};this.repeatPwd={setValue(){}};}show(){}close(){this.closed=true;}}
 Dialog.prototype.txtTitleProtected='Protected file';Dialog.prototype.txtPassword='Password';Dialog.prototype.txtDescription='Password';
 const Common={Views:{OpenDialog:Dialog,PasswordDialog:Dialog,Protection:{prototype:{}}},Utils:{importTextType:{DRM:1}},UI:{alert:options=>new Dialog(options),warning:options=>new Dialog(options)}};
 const api={eoLocalMode:true,documentFormat:'docx',documentTitle:'public-protected.docx',DocInfo:{get_OfflineApp:()=>true},isViewMode:false,asc_isProtectionSupport:()=>true,sendEvent(){},asc_setCurrentPassword(){},asc_resetPassword(){},
 asc_registerCallback:(name,fn)=>callbacks[name]=fn,asc_unregisterCallback:name=>delete callbacks[name],isDocumentModified:()=>dirty,SetDocumentModified:value=>dirty=value,WordControl:{m_oLogicDocument:{}},asc_openDocumentFromBytes:()=>setImmediate(()=>callbacks.asc_onDocumentContentReady?.())};
 const context={Common,window:null,Uint8Array,Map,URL,Blob,Promise,setTimeout,clearTimeout,
 AscCommon:{History:{Points:[],Index:0,Reset_SavedIndex(){resets++;}},g_oDocumentUrls:{addImageUrl(){},getLocal(){}}},
 AscCommonWord:{BinaryFileWriter:class{Write(){return new Uint8Array([80,75]);}}},
 EOWasmConvert:{formats:{docx:65,odt:67},validatePassword:value=>{if(typeof value!=='string'||!value)throw Error('Invalid test password');},convert:async(bytes,_from,_to,options)=>{
  for(const stage of ['loading-runtime','initializing','converting'])options.onProgress?.({stage});
  if(bytes[0]===208&&options.openPassword!==secret)throw Object.assign(Error('Password needed'),{code:options.openPassword?'password-incorrect':'password-required'});
  const out=new Uint8Array([80,75]);out.resources=[];out.stats={worker:true};return out;
 }}};
 context.window=context;vm.createContext(context);
 context.define=(_deps,fn)=>passwords=fn((_names,resolve)=>resolve());vm.runInContext(fs.readFileSync(path.join(folder,'Password.js'),'utf8'),context);
 passwords.prepare(api,{appOptions:{isEdit:true},permissions:{protect:true}});
 context.define=(_deps,fn)=>installer=fn({assertAvailable(){},install:()=>({activate(){},dispose(){}})},{},passwords,Operation,require(path.join(folder,'FileNames.js')));context.define.amd=true;
 vm.runInContext(fs.readFileSync(path.join(folder,'Controller.js'),'utf8'),context);
 const controller=installer.install(api,{format:'docx',operationScope:'public',name:api.documentTitle,onOperation:e=>events.push(e),getSignal:()=>abort.signal,beforeOperationWork:async()=>{},onBeforeSave:()=>{before++;abort=new AbortController();},onAfterSave:()=>after++,onProtectionLock:async()=>locks++,onSave:async()=>{writes++;return delivered;}});
 return {controller,api,events,dialogs,secret,commit,encrypted:new Uint8Array([208,207,17,224,161,177,26,225]),stats:()=>({dirty,resets,writes,locks,before,after})};
}
test('real Password/Controller prompts and crypto conversion expose content-free states; Ready waits for acknowledgement',async()=>{
 const e=setup(),opened=e.controller.open(e.encrypted);await tick();
 assert.equal(e.events.at(-1).phase,'awaiting-user');assert.equal(e.events.at(-1).kind,'open');assert.equal(e.events.at(-1).name,'public-protected.docx');
 e.dialogs.at(-1).options.handler('ok',{drmOptions:{asc_getPassword:()=>e.secret}});await opened;
 assert.equal(e.events.at(-1).outcome,'opened');assert.equal(e.events.at(-1).phase,'complete');assert(e.events.some(x=>x.purpose==='decrypting'));assert(!e.events.some(x=>x.phase==='ready'));
 const saved=e.controller.save();await tick();assert(e.events.some(x=>x.purpose==='encrypting'));assert.equal(e.stats().writes,1);assert.equal(e.stats().resets,0);assert(e.stats().dirty);
 e.commit({kind:'saved',committed:true,name:'public-protected.docx'});await saved;
 assert.equal(e.events.at(-1).phase,'ready');assert.equal(e.stats().resets,1);assert.equal(e.stats().dirty,false);
 assert(!JSON.stringify(e.events).includes(e.secret),'Progress must contain no password');
});
test('Save As owns one job before the protection choice; Cancel performs no write and balances busy hooks',async()=>{
 const e=setup(),opened=e.controller.open(e.encrypted);await tick();e.dialogs.at(-1).options.handler('ok',{drmOptions:{asc_getPassword:()=>e.secret}});await opened;
 const saving=e.controller.saveAs(),rejected=assert.rejects(saving,error=>error.code==='cancelled');await tick();
 assert.equal(e.events.at(-1).kind,'save-as');assert.equal(e.events.at(-1).phase,'awaiting-user');assert.equal(e.stats().before,1);assert.equal(e.stats().after,0);
 e.dialogs.at(-1).options.callback('cancel');await rejected;
 assert.equal(e.stats().writes,0);assert.equal(e.stats().after,1);assert.equal(e.stats().resets,0);assert(e.stats().dirty);assert.equal(e.events.at(-1).phase,'cancelled');
 const retried=e.controller.saveAs();await tick();e.dialogs.at(-1).options.callback('keep');await tick();
 e.commit({kind:'saved',committed:true,name:'public-copy.docx'});await retried;
 assert.equal(e.stats().before,2);assert.equal(e.stats().after,2);assert.equal(e.stats().writes,1);assert.equal(e.events.at(-1).phase,'ready');
});
test('external named open job stays pending until desktop hooks finish, with a distinct shell namespace',async()=>{
 const e=setup(),outer=Operation.create(value=>e.events.push(value),'public','desktop-open'),job=outer.begin('open',{name:'public-large.docx'});
 await e.controller.open(new Uint8Array([80,75]),job);
 assert(outer.isBusy());assert(job.isRunning());await assert.rejects(e.controller.save(),error=>error.code==='operation-busy');assert.equal(e.stats().writes,0);assert(!e.events.some(x=>x.phase==='complete'||x.phase==='ready'));assert(e.events.every(x=>x.id===job.id));assert.match(job.id,/^desktop-open-/);
 job.finish({kind:'opened'});assert.equal(e.events.at(-1).outcome,'opened');assert.equal(outer.isBusy(),false);assert.equal(e.stats().resets,0);assert.equal(e.stats().writes,0);
});
