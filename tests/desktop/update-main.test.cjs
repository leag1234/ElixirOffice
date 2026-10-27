// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const core=require('../../desktop/update-controller.cjs'),{createAdapter}=require('../../desktop/update-handoff.cjs');
const helper=path.join(__dirname,'close-recovery.test.cjs'),main=path.resolve(__dirname,'../../desktop/main.cjs'),load=createRequire(helper),tick=()=>new Promise(setImmediate);
const url='https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0';
async function boot(options={}){
 const f=fixture(),calls={factory:0,prepare:0,nativeLaunch:0,release:0,dispose:0},power=new EventEmitter(),scope={exports:{}};let context,controller,pendingResolve;
 const wrappedVM={...vm,runInNewContext(code,ctx,settings){
  if(settings?.filename===main){
   context=ctx;const original=ctx.require;
   ctx.require=name=>{
    if(name==='electron')return {...original(name),powerMonitor:power};
    if(name==='./update-controller.cjs')return {...core,createController:config=>{
     controller=core.createController({...config,policy:f.policy,runtime:f.runtime,eligible:async()=>options.eligible!==false,
      createSession:async()=>{calls.factory++;return {
       async prepare(){calls.prepare++;if(options.pending)return new Promise(resolve=>{pendingResolve=resolve;});return {};},
       async install(){return {adapter:createAdapter({launch(callbacks){calls.nativeLaunch++;callbacks.success();return true;}}),revalidate:async()=>true,release:async()=>{calls.release++;}};},
       dispose(){calls.dispose++;},
      };}});return controller;
    }};
    return original(name);
   };
  }
  return vm.runInNewContext(code,ctx,settings);
 }};
 vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:name==='node:vm'?wrappedVM:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
 const e=await scope.exports.boot({...options,fontSettings:{releaseNotice:{enabled:true},updateAutomatic:options.automatic===true,...options.fontSettings},
  releaseTransport:async()=>[{tag_name:'v0.4.0',html_url:url,draft:false,prerelease:false}]});
 return {...e,calls,power,get removeCalls(){return e.removeCalls;},get controller(){return controller;},resolvePrepare(){pendingResolve?.({});},
  async ready(){for(let n=0;n<100;n++){const value=await e.invoke('release-state');if(value?.install?.phase==='ready')return value;await tick();}throw Error('Main update did not become ready');},
  context,async cleanup(){controller?.dispose();pendingResolve?.({});await tick();await e.cleanup();}};
}
test.after(()=>assert.equal(network.calls,0));
test('real main defaults automatic OFF and validates the extended settings/action boundary',async()=>{
 const e=await boot();
 try{
  assert.equal((await e.invoke('release-options')).automatic,false);assert.equal(e.calls.factory,0);
  for(const value of [null,[],{enabled:true,automatic:'yes'},{enabled:true,automatic:true,url:'https://evil.invalid/'},{enabled:true,policy:true}])
   await assert.rejects(e.invoke('release-settings',value),/setting/i);
  assert.equal(await e.invoke('release-action','install','9.9.9'),false);assert.equal(e.calls.factory,0);
  const doc=e.documents[0],frame=doc.mainFrame;
  await assert.rejects(async()=>e.handlers.get('eo:release-action')({sender:e.shell.webContents,senderFrame:e.shell.webContents.mainFrame},'install','0.4.0'),/document|registered|frame/i);
  await assert.rejects(async()=>e.handlers.get('eo:release-settings')({sender:doc,senderFrame:{url:frame.url}},{enabled:true,automatic:true}),/document|registered|frame/i);
  assert.equal(e.calls.factory,0);
 }finally{await e.cleanup();}
});
test('preparation completion never quits; only a second ready Install click exits after all close barriers',async()=>{
 const e=await boot();
 try{
  assert.equal(await e.invoke('release-action','install','0.4.0'),true);await e.ready();
  assert.equal(e.app.quitCalls||0,0);assert.equal(e.calls.nativeLaunch,0);
  assert.equal(await e.invoke('release-action','install','0.4.0'),true);
  assert.equal(e.calls.nativeLaunch,1);assert.equal(e.app.quitCalls,1);assert.equal(e.calls.release,1);
 }finally{await e.cleanup();}
});
test('explicit File Quit after Discard installs only after actual document cleanup',async()=>{
 const e=await boot({document:true,automatic:true});
 try{
  await e.ready();e.state.dirty=true;await e.invoke('state',e.selected.token,true);e.responses.push(process.platform==='darwin'?2:1);
  assert.equal(await e.invoke('quit'),true);assert.equal(e.calls.nativeLaunch,1);assert.equal(e.app.quitCalls,1);assert.equal(e.removeCalls,1);
 }finally{await e.cleanup();}
});
for(const outcome of ['Cancel','failed save'])test('actual '+outcome+' close path causes zero native installs',async()=>{
 const e=await boot({document:true,automatic:true});
 try{
  await e.ready();e.state.dirty=true;await e.invoke('state',e.selected.token,true);
  if(outcome==='Cancel')e.responses.push(process.platform==='darwin'?1:2);else e.responses.push(0);
  const quitting=e.invoke('quit');
  if(outcome==='failed save'){
   for(let n=0;n<50&&!e.sent.some(v=>v[1]==='save-close');n++)await tick();
   const attempt=e.sent.findLast(v=>v[1]==='save-close')?.[2]?.attemptId;assert(attempt);
   // Failed renderer save leaves dirty true; the real closed-saved guard must
   // reject it, rather than treating receipt of the IPC as successful saving.
   assert.equal(await e.invoke('closed-saved',attempt),false);
  }
  assert.equal(await quitting,false);assert.equal(e.calls.nativeLaunch,0);assert.equal(e.app.quitCalls||0,0);
  assert.equal(e.window.closed,undefined);assert.equal(e.state.dirty,true);
 }finally{await e.cleanup();}
});
for(const name of ['preferences','recovery'])test('failed strict '+name+' barrier prevents install and restores a usable Home',async()=>{
 const e=await boot({automatic:true});
 try{
  await e.ready();vm.runInNewContext(name+'.barrier=()=>Promise.reject(Error("synthetic strict barrier failure"))',e.context);
  assert.equal(await e.invoke('quit'),false);assert.equal(e.calls.nativeLaunch,0);assert.equal(e.app.quitCalls||0,0);
  assert(e.windows.some(w=>!w.isDestroyed()),'A failed post-close install must leave a usable window');
 }finally{await e.cleanup();}
});
test('native window close and unclassified before-quit never confer install authority',async()=>{
 const e=await boot({automatic:true});
 try{
  await e.ready();e.window.close();await e.ownerCloseCompletion();
  let prevented=0;e.app.emit('before-quit',{preventDefault(){prevented++;}});await e.quit();
  assert.equal(prevented,1);assert.equal(e.calls.nativeLaunch,0);assert.equal(e.app.quitCalls,1);
 }finally{await e.cleanup();}
});
test('shutdown revokes even a ready update before a later explicit Quit',async()=>{
 const e=await boot({automatic:true});
 try{
  await e.ready();e.power.emit('shutdown',{});assert.equal(await e.invoke('quit'),true);assert.equal(e.calls.nativeLaunch,0);
 }finally{await e.cleanup();}
});
test('Checks OFF cancels preparation, persists OFF and suppresses late ready state',async()=>{
 const e=await boot({automatic:true,pending:true});
 try{
  for(let n=0;n<50&&!e.calls.prepare;n++)await tick();assert.equal(e.calls.prepare,1);
  await e.invoke('release-settings',{enabled:false,automatic:false});e.resolvePrepare();await tick();await tick();
  assert.equal(await e.invoke('release-state'),null);assert.equal(e.calls.nativeLaunch,0);
  const disk=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.equal(disk.releaseNotice.enabled,false);assert.equal(disk.updateAutomatic,false);
 }finally{await e.cleanup();}
});

test('native menu Quit keeps explicit user authority with the platform shortcut',async()=>{
 const e=await boot({automatic:true});
 try{
  await e.ready();
  function all(items){return items.flatMap(item=>[item,...(Array.isArray(item.submenu)?all(item.submenu):[])]);}
  let quit;
  if(process.platform==='darwin'){
   const appMenu=e.app.menu[0];assert.equal(appMenu.label,'ElixirOffice');
   const item=all(appMenu.submenu).find(item=>item.role==='quit');assert(item);
   assert.equal(require('../../desktop/shortcuts.cjs').command({type:'keyDown',key:'q',meta:true},'darwin','docx'),'quit');
   quit=e.invoke('quit');
  }else{
   const item=all(e.app.menu).find(item=>item.id==='eo-menu-quit');assert(item);
   assert.equal(item.accelerator,undefined);quit=item.click();
  }
  assert.equal(await quit,true);
  assert.equal(e.calls.nativeLaunch,1);assert.equal(e.app.quitCalls,1);
 }finally{await e.cleanup();}
});
