// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports,discard=process.platform==='darwin'?2:1,cancel=process.platform==='darwin'?1:2;
const bytes=value=>new Uint8Array(Buffer.from('PK'+value));
const shellEvent=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
const tabs=(e,window,command,...args)=>e.handlers.get('eo:tabs-shell')(shellEvent(window),command,...args);
async function add(e,source,format='xlsx'){
 await e.invokeFor(source,'new',format);const view=e.documents.at(-1),selection=await e.invokeFor(view,'initial');
 return {view,selection,id:(await e.invokeFor(view,'identity')).documentId};
}
async function dirty(e,view,selection){
 view.state.dirty=true;await e.invokeFor(view,'state',selection.token,true);
 await e.invokeFor(view,'recovery-save',selection.token,0,bytes('public recovery'));
}
const menuItems=items=>items.flatMap(item=>[item,...(item.submenu?menuItems(item.submenu):[])]);
test('New and OS open refusal at sixteen documents preserve existing dirty tabs and allow exact-file focus',async()=>{
 const e=await boot({document:true});
 try{
  e.state.dirty=true;await e.invoke('state',e.selected.token,true);
  for(let n=1;n<16;n++)await add(e,e.documents[0]);
  assert.equal(e.documents.length,16);
  await assert.rejects(e.invoke('new','docx'),/16 documents/);
  assert.equal(e.documents.length,16,'No seventeenth renderer is allocated');
  await e.invoke('desktop-ready');
  const extra=path.join(e.directory,'new-public.docx');await fsp.writeFile(extra,'PKpublic extra');
  e.app.emit('open-file',{preventDefault(){}},extra);
  for(let n=0;n<100&&!e.sent.some(args=>args[0]==='eo:tabs-limit');n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(e.sent.some(args=>args[0]==='eo:tabs-limit'),'OS refusal must be visible');
  assert.equal(e.state.dirty,true);assert.equal(e.documents[0].isDestroyed(),false);
  assert.equal(await e.invokeFor(e.documents[15],'drop',path.join(e.directory,'test.docx')),null,'An already-open file focuses its owner even at capacity');
  assert.equal(e.documents.length,16);
 }finally{await e.cleanup()}
});
test('startup OS-open queue is bounded and reports overflow after a document becomes ready',async()=>{
 const e=await boot({document:true,queuedPaths:Array.from({length:22},(_,i)=>'/tmp/eo-public-queued-'+i+'.docx')});
 try{
  assert.equal(e.pendingCount(),15,'One of at most sixteen queued opens was consumed by initial');
  await e.invoke('desktop-ready');assert(e.sent.some(args=>args[0]==='eo:tabs-limit'));
  assert.equal(e.documents.length,1);
 }finally{await e.cleanup()}
});
test('window close stops at Cancel and preserves later tabs after earlier explicit Discard',async()=>{
 const e=await boot({document:true});
 try{
  const a=e.documents[0],b=await add(e,a),c=await add(e,a,'pptx');
  await dirty(e,a,e.selected);await dirty(e,b.view,b.selection);await dirty(e,c.view,c.selection);
  e.responses.push(discard,cancel,discard);e.window.close();
  assert.equal(await e.closeCompletion(),false);
  assert.equal(e.dialogs.length,2);assert.deepEqual(Array.from(e.dialogParents),[e.shell,e.shell]);
  assert.equal(a.isDestroyed(),true);assert.equal(b.view.isDestroyed(),false);assert.equal(c.view.isDestroyed(),false);
  assert.equal(e.responses.length,1,'No later Discard choice can run after Cancel');
  assert.equal(e.shell.isDestroyed(),false);assert.equal(e.app.quitCalls,undefined);
  const records=await fsp.readdir(path.join(e.directory,'recovery'));
  assert(!records.some(name=>name.startsWith(e.selected.token)));
  for(const id of [b.selection.token,c.selection.token])assert(records.some(name=>name.startsWith(id)));
 }finally{await e.cleanup()}
});
test('quit across two windows stops on second-window Cancel without prompting later documents',async()=>{
 const e=await boot({document:true});
 try{
  const a=e.documents[0],b=await add(e,a),c=await add(e,a,'pptx');
  await tabs(e,e.shell,'detach',c.id);const target=e.windows.at(-1),d=await add(e,c.view,'docx');
  await dirty(e,a,e.selected);for(const item of [b,c,d])await dirty(e,item.view,item.selection);
  e.responses.push(discard,discard,cancel,discard);
  assert.equal(await e.quit(),false);
  assert.deepEqual(Array.from(e.dialogParents),[e.shell,e.shell,target]);assert.equal(e.dialogs.length,3);
  assert.equal(e.shell.isDestroyed(),true);assert.equal(target.isDestroyed(),false);
  assert.equal(a.isDestroyed(),true);assert.equal(b.view.isDestroyed(),true);
  assert.equal(c.view.isDestroyed(),false);assert.equal(d.view.isDestroyed(),false);
  assert.equal(e.responses.length,1);assert.equal(e.app.quitCalls,undefined);
  assert.deepEqual((await tabs(e,target,'initial')).state.documents.map(doc=>doc.id),[c.id,d.id]);
  const records=await fsp.readdir(path.join(e.directory,'recovery'));
  for(const item of [c,d])assert(records.some(name=>name.startsWith(item.selection.token)));
 }finally{await e.cleanup()}
});
test('a document destroyed after the close snapshot is treated as already closed',async()=>{
 const e=await boot({document:true});
 try{
  const a=e.documents[0],b=await add(e,a);a.state.dirty=true;
  e.responses.push(()=>{b.view.close();return {response:discard}});
  e.window.close();assert.equal(await e.closeCompletion(),true);assert.equal(e.shell.isDestroyed(),true);
 }finally{await e.cleanup()}
});
test('quit catches native app failure and permits a later explicit retry',async()=>{
 const e=await boot();
 try{
  e.app.quit=()=>{throw Error('Injected native quit failure')};
  assert.equal(await e.quit(),false);assert.equal(e.app.exitCode,undefined);
  let calls=0;e.app.quit=()=>{calls++};assert.equal(await e.quit(),true);assert.equal(calls,1);
 }finally{await e.cleanup()}
});
test('application menu actions do nothing when no native window is focused',async()=>{
 const e=await boot({document:true});
 try{
  e.state.dirty=true;e.setFocusedWindow(null);
  const close=menuItems(e.app.menu).find(item=>item.accelerator==='CommandOrControl+W');assert(close);
  assert.equal(close.click(),false);assert.equal(e.dialogs.length,0);assert.equal(e.documents[0].isDestroyed(),false);
  e.setFocusedWindow(e.shell);e.responses.push(cancel);assert.equal(await close.click(),false);assert.equal(e.dialogs.length,1);
 }finally{await e.cleanup()}
});
test('hung save-close has a visible watchdog, aborts quit and rejects its late acknowledgement',async()=>{
 const e=await boot({document:true,timerDelay:ms=>ms===30000?30:ms});
 try{
  e.state.dirty=true;e.responses.push(0);
  const pending=e.quit();
  const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('hung'),500))]);
  assert.equal(result,false,'A missing renderer save acknowledgement must not stall Quit');
  const attempt=e.sent.find(args=>args[1]==='save-close')?.[2]?.attemptId;assert.equal(typeof attempt,'string');
  assert.equal(e.documents[0].isDestroyed(),false);assert.equal(e.app.quitCalls,undefined);
  for(let n=0;n<100&&e.dialogs.length<2;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(e.dialogs[1]?.message||'',/Saving has not finished and may still complete/);assert.equal(e.dialogParents[1],e.shell);
  assert.equal(await e.invoke('closed-saved',attempt),false);assert.equal(e.documents[0].isDestroyed(),false);
 }finally{await e.cleanup()}
});

test('untitled close pauses its watchdog during native Save As and restarts it after selection',async()=>{
 const e=await boot({document:true,timerDelay:ms=>ms===30000?30:ms});
 try{
  const untitled=await add(e,e.documents[0]);await dirty(e,untitled.view,untitled.selection);
  e.responses.push(0);
  let chooseDestination;
  e.saveResponses.push(()=>new Promise(resolve=>{chooseDestination=resolve}));
  const closing=tabs(e,e.shell,'close',untitled.id);
  for(let n=0;n<100&&!e.sent.some(args=>args[1]==='save-close');n++)await new Promise(resolve=>setTimeout(resolve,5));
  const attempt=e.sent.find(args=>args[1]==='save-close')?.[2]?.attemptId;assert.equal(typeof attempt,'string');
  const saving=e.invokeFor(untitled.view,'save',untitled.selection.token,bytes('untitled-close'),false,{protected:false,remove:false},'local-operation-501');
  for(let n=0;n<100&&!chooseDestination;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(chooseDestination,'The native destination dialog must be open');
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(e.dialogs.length,1,'Browsing longer than the watchdog must not queue a timeout warning');
  assert.equal(untitled.view.isDestroyed(),false);
  chooseDestination({canceled:false,filePath:path.join(e.directory,'saved-untitled.xlsx')});
  await saving;untitled.view.state.dirty=false;await e.invokeFor(untitled.view,'state',untitled.selection.token,false);
  for(let n=0;n<100&&e.dialogs.length<2;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(e.dialogs[1]?.message||'',/Saving has not finished and may still complete/);
  assert.equal(await closing,false,'The restarted watchdog releases the close attempt');
  assert.equal(await e.invokeFor(untitled.view,'closed-saved',attempt),false,'A late save acknowledgement cannot close the document');
  assert.equal(untitled.view.isDestroyed(),false);
 }finally{await e.cleanup()}
});

test('native Save As cancel and rejection settle tab close and Quit without a hang',{timeout:5000},async()=>{
 for(const chooser of ['save','save-as-choose'])for(const closeMode of ['tab','quit'])for(const outcome of ['cancel','reject']){
  const e=await boot({document:true,timerDelay:ms=>ms===30000?30:ms});
  try{
   const untitled=await add(e,e.documents[0]);await dirty(e,untitled.view,untitled.selection);
   e.responses.push(0);
   const closing=closeMode==='tab'?tabs(e,e.shell,'close',untitled.id):e.quit();
   for(let n=0;n<100&&!e.sent.some(args=>args[1]==='save-close');n++)await new Promise(resolve=>setTimeout(resolve,5));
   assert(e.sent.some(args=>args[1]==='save-close'),closeMode+' '+outcome+' must request a save');
   e.saveResponses.push(outcome==='cancel'?{canceled:true}:()=>Promise.reject(Error('Injected native Save As rejection')));
   const choosing=chooser==='save'
    ?e.invokeFor(untitled.view,'save',untitled.selection.token,bytes('cancelled-close'),false,{protected:false,remove:false},'local-operation-'+(closeMode==='tab'?'61':'62')+(outcome==='cancel'?'1':'2'))
    :e.invokeFor(untitled.view,'save-as-choose',untitled.selection.token,'xlsx',false);
   if(outcome==='reject')await assert.rejects(choosing,/Injected native Save As rejection/);
   else if(chooser==='save')await assert.rejects(choosing,/Save cancelled/);
   else assert.equal(await choosing,null);
   const result=await Promise.race([closing,new Promise(resolve=>setTimeout(()=>resolve('hung'),500))]);
   assert.equal(result,false,chooser+' '+closeMode+' '+outcome+' must cancel the close attempt');
   assert.equal(untitled.view.isDestroyed(),false);assert.equal(e.app.quitCalls,undefined);
  }finally{await e.cleanup()}
 }
});

test('macOS can detach a sole tab at the global cap without allocating a placeholder',async()=>{
 const e=await boot({document:true,platform:'darwin'});
 try{
  for(let n=1;n<16;n++)await add(e,e.documents[0]);
  const moved=e.documents.at(-1),id=(await e.invokeFor(moved,'identity')).documentId;
  await tabs(e,e.shell,'detach',id);
  const oneTabWindow=e.windows.at(-1);assert.deepEqual((await tabs(e,oneTabWindow,'initial')).state.documents.map(item=>item.id),[id]);
  await tabs(e,oneTabWindow,'detach',id);
  const detached=e.windows.at(-1),emptyState=(await tabs(e,oneTabWindow,'initial')).state;
  assert.deepEqual(emptyState.documents,[],'The empty source window does not need a seventeenth placeholder');
  assert.deepEqual((await tabs(e,detached,'initial')).state.documents.map(item=>item.id),[id]);
  assert.equal(e.documents.filter(document=>!document.isDestroyed()).length,16);
 }finally{await e.cleanup()}
});

test('dead contents without a destroyed event cannot strand the earlier document close promise',async()=>{
 const e=await boot({document:true});
 try{
  const a=e.documents[0],b=await add(e,a);a.state.dirty=true;
  e.responses.push(()=>{b.view.dead=true;return {response:discard}});
  e.window.close();
  const result=await Promise.race([e.closeCompletion(),new Promise(resolve=>setTimeout(()=>resolve('hung'),500))]);
  assert.equal(result,true);assert.equal(e.shell.isDestroyed(),true);assert.equal(a.isDestroyed(),true);
 }finally{await e.cleanup()}
});
test('an active document crash during a close prompt is closed and later Cancel still stops the window',async()=>{
 const e=await boot({document:true});
 try{
  const a=e.documents[0],b=await add(e,a),c=await add(e,a,'pptx');
  await dirty(e,a,e.selected);await dirty(e,b.view,b.selection);await dirty(e,c.view,c.selection);
  e.responses.push(()=>{a.close();return {response:discard}},cancel,discard);
  e.window.close();assert.equal(await e.closeCompletion(),false);
  assert.equal(e.dialogs.length,2);assert.equal(e.responses.length,1);
  assert.equal(a.isDestroyed(),true);assert.equal(b.view.isDestroyed(),false);assert.equal(c.view.isDestroyed(),false);
  assert.equal(e.shell.isDestroyed(),false);
  const records=await fsp.readdir(path.join(e.directory,'recovery'));
  assert(records.some(name=>name.startsWith(e.selected.token)),'A crash must retain its recovery record');
 }finally{await e.cleanup()}
});
test('the shared printer captures the originating document window and allows only one native job across windows',async()=>{
 let start,callbacks=[];
 const e=await boot({document:true,onPrint:(_options,callback)=>{callbacks.push(callback);start?.()}});
 try{
  const a=e.documents[0],b=await add(e,a);await dirty(e,a,e.selected);await dirty(e,b.view,b.selection);
  await tabs(e,e.shell,'detach',b.id);const other=e.windows.at(-1),pdf=new Uint8Array(Buffer.from('%PDF-public-vector'));
  let started=new Promise(resolve=>{start=resolve});
  const first=e.invoke('pdf',e.selected.token,pdf,true);await started;
  const helper=e.windows.find(window=>window.options.show===false);assert(helper);
  assert.equal(helper.options.parent,e.shell);
  e.setFocusedWindow(other);
  await assert.rejects(e.invokeFor(b.view,'pdf',b.selection.token,pdf,true),error=>error.code==='operation-busy');
  await assert.rejects(tabs(e,e.shell,'detach',(await e.invoke('identity')).documentId),/current document operation|dialog/);
  assert.equal(e.windows.filter(window=>window.options.show===false).length,1);
  callbacks[0](false,'cancelled');assert.equal((await first).printed,false);assert(helper.isDestroyed());
  assert.deepEqual(await fsp.readdir(path.join(e.directory,'print-jobs')),[]);
  started=new Promise(resolve=>{start=resolve});
  const second=e.invokeFor(b.view,'pdf',b.selection.token,pdf,true);await started;
  const next=e.windows.filter(window=>window.options.show===false).at(-1);assert.equal(next.options.parent,other);
  callbacks[1](false,'cancelled');assert.equal((await second).printed,false);assert(next.isDestroyed());
  assert.equal(e.state.dirty,true);assert.equal(b.view.state.dirty,true);
  assert.equal(e.shell.isDestroyed(),false);assert.equal(other.isDestroyed(),false);
 }finally{await e.cleanup()}
});
