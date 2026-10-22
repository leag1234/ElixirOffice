// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
test('default A creates a separate native window and preserves the original dirty document',async()=>{
 const e=await boot({document:true});try{
  const options=await e.invoke('window-options');assert.equal(options.openInTabs,false);assert.equal(options.showHomeTab,false);
  const a=await e.invoke('identity');e.state.dirty=true;await e.invoke('state',e.selected.token,true);
  assert.equal(await e.invoke('new','xlsx'),null);const b=e.documents.at(-1),id=await e.invokeFor(b,'identity');
  assert.notEqual(id.windowId,a.windowId);assert.equal(e.windows.length,2);assert.equal(e.state.dirty,true);assert.equal((await e.invokeFor(b,'initial')).format,'xlsx');
  assert.equal((await e.invoke('initial')),null);assert.equal(e.documents[0].isDestroyed(),false);
 }finally{await e.cleanup()}
});
test('empty A startup reuses its window and opens the chosen blank without a second session',async()=>{
 const e=await boot();try{const selected=await e.invoke('new','pptx');assert.equal(selected.format,'pptx');assert.equal(e.windows.length,1);assert.equal(e.documents.length,1);}finally{await e.cleanup()}
});
test('B/C settings persist, validate input and affect future opens without moving existing documents',async()=>{
 const e=await boot({document:true});try{
  const a=await e.invoke('identity');
  await e.invoke('window-settings',{openInTabs:true,showHomeTab:true});
  assert.equal((await e.invoke('window-options')).showHomeTab,true);
  const stored=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));assert.equal(stored.openInTabs,true);assert.equal(stored.showHomeTab,true);
  await e.invoke('new','xlsx');const b=e.documents.at(-1),id=await e.invokeFor(b,'identity');assert.equal(id.windowId,a.windowId);
  await e.invokeFor(b,'window-settings',{openInTabs:false,showHomeTab:true});await e.invokeFor(b,'new','pptx');const c=e.documents.at(-1);
  assert.notEqual((await e.invokeFor(c,'identity')).windowId,a.windowId);assert.equal((await e.invoke('identity')).windowId,a.windowId);assert.equal((await e.invokeFor(b,'identity')).windowId,a.windowId);
  await assert.rejects(e.invoke('window-settings',{openInTabs:'yes',showHomeTab:false}),/Invalid/);
  await assert.rejects(e.invoke('window-settings',{openInTabs:true,showHomeTab:'yes'}),/Invalid/);
 }finally{await e.cleanup()}
});
test('A reopening an already-open file from another window focuses its existing owner without a duplicate',async()=>{
 const e=await boot({document:true});try{
  await e.invoke('new','xlsx');const b=e.documents.at(-1),before=e.documents.length;
  assert.equal(await e.invokeFor(b,'drop',path.join(e.directory,'test.docx')),null);assert.equal(e.documents.length,before);assert.equal(e.windows.length,2);
  assert.equal((await e.invoke('identity')).windowId,(await e.invokeFor(e.documents[0],'identity')).windowId);
  let focused; e.shell.focus=()=>{focused=e.shell};e.windows[1].focus=()=>{focused=e.windows[1]};
  await e.invokeFor(b,'drop',path.join(e.directory,'test.docx'));assert.equal(focused,e.shell);
 }finally{await e.cleanup()}
});
test('shell plus creates a current-family blank in B instead of another empty Home',async()=>{
 for(const format of ['docx','xlsx','pptx']){
  const e=await boot({fontSettings:{openInTabs:true}});try{
   await e.invoke('new',format);
   const event={sender:e.shell.webContents,senderFrame:e.shell.webContents.mainFrame};
   await e.handlers.get('eo:tabs-shell')(event,'new');
   const b=e.documents.at(-1);assert.equal((await e.invokeFor(b,'initial')).format,format);assert.equal(e.windows.length,1);
  }finally{await e.cleanup()}
 }
});

for(const platform of ['linux','win32','darwin'])test(platform+': last File Close returns to one full-window Home while native Close still closes the window',async()=>{
 const e=await boot({platform,document:true});try{
  assert.equal(await e.invoke('close-tab'),true);assert.equal(e.documents[0].isDestroyed(),true);
  assert.equal(e.shell.isDestroyed(),false);const home=e.documents.at(-1);
  assert.equal(await e.invokeFor(home,'initial'),null);assert.equal(e.windows.length,1);
  e.shell.close();for(let n=0;n<100&&!e.shell.isDestroyed();n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(e.shell.isDestroyed(),true);
 }finally{await e.cleanup()}
});
test('A global sixteen-document limit refuses before allocating a window and still focuses an already-open file',async()=>{
 const e=await boot({document:true});try{
  for(let n=1;n<16;n++)await e.invoke('new','docx');
  assert.equal(e.windows.length,16);assert.equal(e.documents.length,16);
  await e.invoke('desktop-ready');const extra=path.join(e.directory,'extra-public.docx');await fsp.writeFile(extra,'PKpublic');
  e.app.emit('open-file',{preventDefault(){}},extra);
  for(let n=0;n<100&&!e.sent.some(args=>args[0]==='eo:action'&&args[1]==='tab-limit');n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(e.sent.some(args=>args[0]==='eo:action'&&args[1]==='tab-limit'),'A capacity notice must reach its visible document, not the covered shell');
  await assert.rejects(e.invoke('new','docx'),/16 documents/);assert.equal(e.windows.length,16);assert.equal(e.documents.length,16);
  assert.equal(await e.invokeFor(e.documents.at(-1),'drop',path.join(e.directory,'test.docx')),null);assert.equal(e.windows.length,16);
 }finally{await e.cleanup()}
});
test('C Home affordance opens existing document Backstage without consuming a document slot or its handle',async()=>{
 const e=await boot({document:true,fontSettings:{openInTabs:true,showHomeTab:true}});try{
  const event={sender:e.shell.webContents,senderFrame:e.shell.webContents.mainFrame},id=await e.invoke('identity');
  await e.handlers.get('eo:tabs-shell')(event,'home');
  assert.equal(e.documents.length,1);assert.equal((await e.invoke('identity')).documentId,id.documentId);
  assert(e.sent.some(args=>args[0]==='eo:action'&&args[1]==='backstage-home'));
 }finally{await e.cleanup()}
});
