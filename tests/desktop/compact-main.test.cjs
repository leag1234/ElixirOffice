// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const load=createRequire(path.resolve(__dirname,'../../desktop/main.cjs')),moduleScope={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'close-recovery.test.cjs'),'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:moduleScope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=moduleScope.exports;
for(const platform of ['linux','win32','darwin'])test('real Main applies compact preference only to qualified '+platform,async()=>{
 const e=await boot({platform,overlayAvailable:true,fontSettings:{customTitleBar:true}});
 try{
  const options=await e.invoke('window-options'),mode=await e.invoke('chrome-mode');
  assert.equal(options.customTitleBarAvailable,platform==='linux');assert.equal(mode.compact,platform==='linux');
  assert.equal(options.effectiveFrame,platform==='linux'?'compact':'native');
  assert.equal(e.shell.options.titleBarStyle,platform==='linux'?'hidden':undefined);
 }finally{await e.cleanup()}
});
test('Main frame choice affects only new windows and may always be turned off',async()=>{
 const e=await boot({platform:'linux',overlayAvailable:true});
 try{
  await e.invoke('window-settings',{customTitleBar:true});assert.equal((await e.invoke('chrome-mode')).compact,false);
  assert.equal((await e.invoke('window-options')).customTitleBar,true);
  await e.invoke('window-settings',{customTitleBar:false});assert.equal((await e.invoke('window-options')).customTitleBar,false);
 }finally{await e.cleanup()}
});
test('only live document main frames can publish bounded quick controls',async()=>{
 const e=await boot(),value=Object.fromEntries(['save','undo','redo','search'].map(name=>[name,{visible:true,enabled:true,label:name}]));
 try{
  assert.equal(await e.invoke('chrome-state',value),true);
  await assert.rejects(e.invoke('chrome-state',{...value,save:{visible:true,enabled:true,label:'x'.repeat(201)}}),/compact state/);
  await assert.rejects(async()=>e.invokeFor(e.shell.webContents,'chrome-state',value),/document main frame/);
  const document=e.documents[0],spoof={...document,mainFrame:{url:document.mainFrame.url}};
  await assert.rejects(async()=>e.invokeFor(spoof,'chrome-state',value),/document main frame/);
 }finally{await e.cleanup()}
});

for(const displayBackend of ['wayland','unknown',''])test('Main does not infer qualified X11 from unknown backend '+JSON.stringify(displayBackend),async()=>{
 const e=await boot({platform:'linux',overlayAvailable:true,displayBackend,fontSettings:{customTitleBar:true}});
 try{assert.equal((await e.invoke('window-options')).customTitleBarAvailable,false);assert.equal((await e.invoke('chrome-mode')).compact,false);}
 finally{await e.cleanup()}
});
