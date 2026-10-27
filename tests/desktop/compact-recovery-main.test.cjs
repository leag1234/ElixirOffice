// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const load=createRequire(path.resolve(__dirname,'../../desktop/main.cjs')),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'close-recovery.test.cjs'),'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
async function ready(options){const e=await boot(options);await e.invoke('desktop-ready');return e;}
function failOverlay(e){e.shell.setTitleBarOverlay=()=>{throw Error('Injected overlay failure')};return ()=>e.handlers.get('eo:tabs-shell')({sender:e.shell.webContents,senderFrame:e.shell.webContents.mainFrame},'appearance','dark');}
test('Main persists native fallback and refuses re-enabling the failed capability in this process',{timeout:2000},async()=>{
 const e=await ready({platform:'linux',overlayAvailable:true,fontSettings:{customTitleBar:true}});
 try{await failOverlay(e)();assert.equal((await e.invoke('window-options')).customTitleBar,false);assert.equal((await e.invoke('window-options')).customTitleBarAvailable,false);
  assert.equal(JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8')).customTitleBar,false);
  await assert.rejects(e.invoke('window-settings',{customTitleBar:true}),/system window frame/);
 }finally{await e.cleanup()}
});
test('Main follows the replacement native window and keeps document identity',{timeout:2000},async()=>{
 const e=await ready({platform:'linux',overlayAvailable:true,document:true,fontSettings:{customTitleBar:true}});
 try{const before=await e.invoke('identity');await failOverlay(e)();const replacement=e.windows.at(-1);assert.notEqual(replacement,e.shell);
  const after=await e.invoke('identity');assert.equal(after.documentId,before.documentId);assert.equal(after.windowId,before.windowId);
  const shown=replacement.showCalls||0,oldShown=e.shell.showCalls||0;e.app.emit('second-instance',{},['electron','unused']);assert.equal(replacement.showCalls,shown+1);assert.equal(e.shell.showCalls||0,oldShown);
  assert.equal(e.documents[0].isDestroyed(),false);
 }finally{await e.cleanup()}
});
test('a real pending Save As chooser completes before the old frame is retired',{timeout:2000},async()=>{
 const e=await ready({platform:'linux',overlayAvailable:true,document:true,fontSettings:{customTitleBar:true}});let choose,entered;
 const started=new Promise(resolve=>{entered=resolve});
 try{
  e.saveResponses.push(()=>new Promise(resolve=>{choose=resolve;entered()}));
  const chooser=e.invoke('save-as-choose',e.selected.token,'docx');await started;
  const replacement=failOverlay(e)();await new Promise(setImmediate);
  assert.equal(e.windows.length,1);assert.equal(e.shell.closed,undefined);
  choose({canceled:true});assert.equal(await chooser,null);await replacement;
  assert.equal(e.windows.length,2);assert.equal(e.shell.closed,true);assert.equal(e.documents[0].isDestroyed(),false);
 }finally{choose?.({canceled:true});await e.cleanup()}
});
