// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const upstream=process.env.EO_UPSTREAM;assert(upstream,'Explicit owned EO_UPSTREAM required');
function setup({offline=true,protect=true,view=false}={}){
 const dialogs=[],events=[],errors=[],writes=[];let module,locks=0,busy=false,state;const abort=new AbortController();
 class Dialog{constructor(options){this.options=options;this.inputPwd={setValue(){}};this.repeatPwd={setValue(){}};dialogs.push(this)}show(){}close(){this.closed=true}}
 Dialog.prototype.txtTitleProtected='Protected file';Dialog.prototype.txtPassword='Password';Dialog.prototype.txtDescription='Password required';
 const Common={Views:{OpenDialog:Dialog,PasswordDialog:Dialog,Protection:{prototype:{}}},Utils:{importTextType:{DRM:1}},UI:{alert(options){return new Dialog(options)},warning(options){return new Dialog(options)}}};
 const window={document:{currentScript:{src:'https://office.example.invalid/sdkjs/common/wasm-convert/api.js'}},location:{origin:'https://office.example.invalid'}};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'sdkjs/common/wasm-convert/api.js'),'utf8'),{window,document:window.document,URL});
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/Password.js'),'utf8'),{define:(_deps,fn)=>{module=fn((_deps,resolve)=>resolve())},window,Common,Promise});
 const oldSet=function(){events.push('hosted-set')},oldReset=function(){events.push('hosted-reset')},send=function(name,value){events.push({name,value})};
 const api={documentFormat:'docx',asc_isProtectionSupport:()=>true,eoLocalMode:offline,DocInfo:{get_OfflineApp:()=>offline},isViewMode:view,sendEvent:send,asc_setCurrentPassword:oldSet,asc_resetPassword:oldReset};
 module.prepare(api,{appOptions:{isEdit:!view},permissions:{protect}});
 function install(){state=module.install(api,{getSignal:()=>abort.signal,onProtectionLock:async()=>{locks++},onError:e=>errors.push(e.code),isBusy:()=>busy,
 save:choice=>state.save(async(options,metadata)=>{writes.push({options,metadata});return new Uint8Array([1])},choice)});return state;}
 return {module,Common,window,api,abort,install,dialogs,events,errors,writes,oldSet,oldReset,send,get locks(){return locks},set busy(value){busy=value},get state(){return state}};
}
const tick=()=>new Promise(setImmediate);
test('hosted and read-only protection remain unavailable',async()=>{
 const hosted=setup({offline:false});assert.throws(hosted.install,/local offline/);assert.equal(hosted.api.asc_setCurrentPassword,hosted.oldSet);assert.equal(hosted.api.asc_resetPassword,hosted.oldReset);
 for(const props of [{protect:false},{view:true}]){const s=setup(props);s.install();s.api.asc_setCurrentPassword('new-password');await tick();assert.deepEqual(s.errors,['permission']);assert.equal(s.writes.length,0);}
});
test('password open retries, save preserves, failure rolls back and removal is omission',async()=>{
 const s=setup(),state=s.install(),secret=crypto.randomBytes(16).toString('hex');let attempts=0;
 const opening=state.open(new Uint8Array([80,75]),async options=>{attempts++;if(options.openPassword===secret)return new Uint8Array([1]);const e=new Error('Fixed password error');e.code=attempts===1?'password-required':'password-incorrect';throw e});
 await tick();assert.equal(s.locks,1);s.dialogs.at(-1).options.handler('ok',{drmOptions:{asc_getPassword:()=> 'wrong-password'}});await tick();assert.equal(s.dialogs.length,2);s.dialogs.at(-1).options.handler('ok',{drmOptions:{asc_getPassword:()=>secret}});await opening;assert(state.isProtected());
 await state.save(async options=>{assert(options.savePassword===secret,'Save retains password');return true});
 await assert.rejects(state.save(async()=>{throw Error('Injected save failure')},'changed-password'),/Injected/);
 await state.save(async options=>{assert(options.savePassword===secret,'Failed write retains original password');return true});
 const removal=state.save(async(options,metadata)=>{assert(!Object.hasOwn(options,'savePassword'));assert(metadata.remove);assert(!metadata.protected)},null);
 await tick();assert.deepEqual(Array.from(s.dialogs.at(-1).options.buttons),['no','yes']);s.dialogs.at(-1).options.callback('yes');await removal;assert(!state.isProtected());assert(state.isRecoveryLocked());
 assert(!JSON.stringify(state).includes(secret));assert(s.events.every(e=>typeof e==='string'||typeof e.value==='boolean'));
});
test('successful delivered write commits even if cancellation arrives during atomic write',async()=>{
 const s=setup(),state=s.install();await state.open(new Uint8Array([80,75]),async()=>new Uint8Array([1]));
 await state.save(async()=>{s.abort.abort();return true;},'changed-password');assert(state.isProtected(),'Delivered protected write commits despite late abort');
});
test('disposed password dialog cancels instead of retaining a pending open',async()=>{
 const s=setup(),state=s.install();const opening=state.open(new Uint8Array([80,75]),async()=>{const e=new Error('Password required');e.code='password-required';throw e});
 const stopped=assert.rejects(opening,e=>e.code==='cancelled');await tick();state.dispose();await stopped;assert(s.dialogs[0].closed);assert.equal(s.api.sendEvent,s.send);assert.equal(s.api.asc_setCurrentPassword,s.oldSet);assert.equal(s.api.currentPassword,'');
});
test('Save As copy changes password without mutating active password and default denies plaintext export',async()=>{
 const s=setup(),state=s.install();await state.open(new Uint8Array([80,75]),async()=>new Uint8Array([1]));await state.save(async()=>true,'original-password');
 const copy=state.copyAs('docx',async options=>{assert(options.savePassword==='copy-password');return true});await tick();s.dialogs.at(-1).options.callback('change');await tick();s.dialogs.at(-1).options.handler('ok','copy-password');await copy;
 await state.save(async options=>{assert(options.savePassword==='original-password');return true});
 const blocked=state.confirmExport(),checked=assert.rejects(blocked,e=>e.code==='cancelled');await tick();s.dialogs.at(-1).options.callback('no');await checked;
});

test('Save As Remove explicitly authorizes an unprotected copy while keeping the active password',async()=>{
 const s=setup(),state=s.install();await state.open(new Uint8Array([80,75]),async()=>new Uint8Array([1]));await state.save(async()=>true,'original-password');
 const copy=state.copyAs('odt',async(options,metadata)=>{assert(!Object.hasOwn(options,'savePassword'));assert(metadata.remove===true&&metadata.protected===false);return true});
 await tick();s.dialogs.at(-1).options.callback('remove');await copy;
 await state.save(async options=>{assert(options.savePassword==='original-password');return true});
});

for(const mode of ['throw','cancel'])test('post-conversion '+mode+' clears the private password and API hooks',async()=>{
 const s=setup(),callbacks=new Map(),api=s.api;let controller;
 api.asc_registerCallback=(name,fn)=>callbacks.set(name,fn);api.asc_unregisterCallback=(name,fn)=>{if(callbacks.get(name)===fn)callbacks.delete(name)};
 api.asc_openDocumentFromBytes=()=>{if(mode==='throw')throw Error('Injected content opening failure');s.abort.abort();};
 const images={assertAvailable(){},install(){return {activate(){},dispose(){},insert(){}}}};
 const FileNames=require(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/FileNames.js'));
 const define=(_deps,fn)=>{controller=fn(images,{},s.module,require(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/Operation.js')),FileNames)};define.amd=true;
 const context={define,Common:s.Common,Uint8Array,URL,Blob,Map,Promise,setTimeout,clearTimeout,AscCommon:{g_oDocumentUrls:{addImageUrl(){},getLocal(){}}},
 EOWasmConvert:{formats:{docx:65},convert:async(_bytes,_from,_to,options)=>{if(!options.openPassword){const e=Error('Password required');e.code='password-required';throw e;}return new Uint8Array([1]);}}};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/Controller.js'),'utf8'),context);
 const session=controller.install(api,{format:'docx',getSignal:()=>s.abort.signal});
 const opening=session.open(new Uint8Array([208,207,17,224,161,177,26,225])),checked=assert.rejects(opening,mode==='throw'?/Injected/:/cancelled/);
 await tick();s.dialogs.at(-1).options.handler('ok',{drmOptions:{asc_getPassword:()=>crypto.randomBytes(16).toString('hex')}});await checked;
 assert.equal(session.isProtected(),false);assert.equal(api.sendEvent,s.send);assert.equal(api.asc_setCurrentPassword,s.oldSet);assert.equal(api.currentPassword,'');assert(!callbacks.has('asc_onDocumentContentReady'));session.dispose();
});

test('resetPassword removal defaults to refusal and cannot overwrite until explicit consent',async()=>{
 const s=setup(),state=s.install();await state.open(new Uint8Array([80,75]),async()=>new Uint8Array([1]));await state.save(async()=>true,'original-password');
 s.api.asc_resetPassword();await tick();assert.equal(s.writes.length,0);assert(state.isProtected());
 assert.match(s.dialogs.at(-1).options.msg,/overwrite the encrypted original with an unprotected file/);
 s.dialogs.at(-1).options.callback('no');await tick();assert.deepEqual(s.errors,['cancelled']);assert.equal(s.writes.length,0);assert(state.isProtected());
 await state.save(async options=>{assert.equal(options.savePassword,'original-password');return true});
 s.api.asc_resetPassword();await tick();assert.equal(s.writes.length,0);s.dialogs.at(-1).options.callback('yes');await tick();
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].metadata.remove,true);assert(!state.isProtected());assert(state.isRecoveryLocked());
});
