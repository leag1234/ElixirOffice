// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const {_electron}=require(process.env.EO_PLAYWRIGHT);
const origin='eoapp://desktop.elixiroffice.invalid',root=path.resolve(process.env.EO_NATIVE_WORK),product=path.resolve(process.env.EO_PRODUCT_ROOT),results=[],errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const native=(...args)=>cp.execFileSync('python3',[path.join(__dirname,'tabs-native-input.py'),...args],{env:process.env,encoding:'utf8'});
async function eventually(run,label,attempts=600){let last;for(let i=0;i<attempts;i++){try{last=await run();if(last)return last;}catch(error){last=error.message;}await sleep(100);}throw Error(label+': '+JSON.stringify(last));}
function record(value){results.push(value);console.log('PASS '+value.case);}
const marker=(bytes,value)=>{const needle=Array.from(value).flatMap(char=>[char.charCodeAt(0),0]);return bytes.some((_byte,index)=>needle.every((byte,j)=>bytes[index+j]===byte));};

const {serializedContent}=require('./serialized-content.cjs');

(async()=>{
 let app,context;
 try{
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(product,'desktop/main.cjs'),'--ozone-platform=x11'],env:process.env,timeout:30000});
  process.env.EO_NATIVE_PID=String(app.process().pid);
  assert(!app.process().spawnargs.includes('--no-sandbox'));
  context=app.context();const observe=page=>page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));context.pages().forEach(observe);context.on('page',observe);
  const shell=await eventually(()=>context.pages().find(p=>p.url()===origin+'/tabs.html'),'shell');
  await shell.waitForFunction(()=>window.EOTabShellReady);
  const state=()=>shell.evaluate(async()=> (await eoTabs.initial()).state);
  const docs=()=>context.pages().filter(p=>p.url()===origin+'/index.html');
  await eventually(()=>docs().length===1,'one initial document');
  const a=docs()[0];await a.waitForFunction(()=>window.EODesktopReady);
  const identityA=await a.evaluate(()=>eoDesktop.identity());
  assert.equal((await state()).documents[0].id,identityA.documentId);
  await a.locator('[data-new=docx]').click();
  await a.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  const windowsA=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({id:'0x'+w.getNativeWindowHandle().readUIntLE(0,4).toString(16),visible:w.isVisible(),title:w.getTitle(),url:w.webContents.getURL()})));await fs.writeFile(path.join(root,'windows-A.json'),JSON.stringify(windowsA,null,2));const windowA=windowsA.find(w=>w.url.endsWith('/tabs.html'));assert(windowA?.visible,'Product shell must be visible');
  native('focus',windowA.id);
  await a.evaluate(()=>{const {api,win}=EOLocalSession;api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_enableKeyEvents(true);const input=win.document.getElementById('area_id');if(!input)throw Error('SDK native input missing');input.focus();});
  native('text','EO_TAB_WORD_A');
  await a.waitForFunction(()=>EOLocalSession.controller.isModified());
  record({case:'actual Product main opens Word in registered view with sender-derived identity',pass:true});
  await shell.getByRole('button',{name:'New document',exact:true}).click();
  await eventually(()=>docs().length===2,'second document');
  const b=docs().find(p=>p!==a);await b.waitForFunction(()=>window.EODesktopReady);
  const identityB=await b.evaluate(()=>eoDesktop.identity());
  assert.notEqual(identityA.documentId,identityB.documentId);assert.equal(identityA.windowId,identityB.windowId);
  await b.locator('[data-new=xlsx]').click();
  await b.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  const windowB=windowA;
  await b.evaluate(()=>{
   window.dirtyTrace=[];
   EOLocalSession.api.asc_registerCallback('asc_onDocumentModifiedChanged',function(value){dirtyTrace.push({event:value,modified:EOLocalSession.controller.isModified(),time:performance.now()});queueMicrotask(()=>dirtyTrace.push({microtask:EOLocalSession.controller.isModified(),time:performance.now()}));});
  });
  native('focus',windowB.id);
  await b.evaluate(()=>{const {api,win}=EOLocalSession;api.asc_enableKeyEvents(true);const input=win.document.getElementById('area_id');if(!input)throw Error('SDK native input missing');input.focus();});
  native('text','EO_TAB_CELL_B');native('return');
  await b.waitForFunction(()=>EOLocalSession.controller.isModified());
  const bytesA=await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),bytesB=await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()));
  assert(marker(bytesA,'EO_TAB_WORD_A'));assert(!marker(bytesA,'EO_TAB_CELL_B'));assert(marker(bytesB,'EO_TAB_CELL_B'));assert(!marker(bytesB,'EO_TAB_WORD_A'));
  record({case:'real Word and spreadsheet serialize independent native keyboard edits with both views retained',pass:true});
  await fs.writeFile(path.join(root,'before-dirty.json'),JSON.stringify({tabs:await state(),a:await a.evaluate(()=>EODesktopState(false)),b:await b.evaluate(()=>EODesktopState(false))},null,2));
  try{await eventually(async()=> (await state()).documents.length===2&&(await state()).documents.every(d=>d.dirty),'two dirty tab indicators',100);}
  finally{await fs.writeFile(path.join(root,'dirty-trace.json'),JSON.stringify(await b.evaluate(()=>({trace:window.dirtyTrace,modified:EOLocalSession.controller.isModified(),history:EOLocalSession.win.AscCommon.History.Have_Changes()})),null,2));}

  await fs.writeFile(path.join(root,'word-before.bin'),Buffer.from(bytesA));await fs.writeFile(path.join(root,'sheet-before.bin'),Buffer.from(bytesB));
  await sleep(1100);
  const repeatedA=await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()));
  assert.notDeepEqual(repeatedA,bytesA);assert.deepEqual(serializedContent(repeatedA),serializedContent(bytesA));
  const repeatedB=await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()));
  assert.notDeepEqual(repeatedB,bytesB,'No-move serialization must demonstrate volatile modified metadata');
  assert.deepEqual(serializedContent(repeatedB),serializedContent(bytesB));
  await fs.writeFile(path.join(root,'no-move-serializer.json'),JSON.stringify({wordDifferentOffsets:bytesA.flatMap((byte,index)=>byte===repeatedA[index]?[]:[index]),spreadsheetDifferentOffsets:bytesB.flatMap((byte,index)=>byte===repeatedB[index]?[]:[index]),sameOutsideUniqueCoreModifiedTime:true,limit:'Experimental check correction pending independent/lead review'}));
  await a.evaluate(()=>{window.retainedEditor=EOLocalSession;window.retainedApi=EOLocalSession.api;window.moveSentinel='live-A';});
  await b.evaluate(()=>{window.retainedEditor=EOLocalSession;window.moveSentinel='live-B';});
  const moved=await shell.evaluate(id=>eoTabs.detach(id),identityA.documentId);
  assert.equal(moved.documentId,identityA.documentId);assert.notEqual(moved.windowId,identityA.windowId);
  const movedShell=await eventually(async()=>{
   for(const page of context.pages().filter(p=>p.url()===origin+'/tabs.html')){
    try{if((await page.evaluate(async()=> (await eoTabs.initial()).state)).windowId===moved.windowId)return page;}catch{}
   }
  },'detached document shell');
  assert.equal(docs().length,2);
  assert.deepEqual(await a.evaluate(()=>({editor:EOLocalSession===window.retainedEditor,api:EOLocalSession.api===window.retainedApi,sentinel:window.moveSentinel})),{editor:true,api:true,sentinel:'live-A'});
  assert.deepEqual(serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),serializedContent(bytesA));
  assert.deepEqual(serializedContent(await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),serializedContent(bytesB));
  assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),true);assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.equal((await state()).documents.length,1);assert.equal((await state()).documents[0].id,identityB.documentId);
  record({case:'detach reparents same real Word editor, identity and independently dirty state into another registered native window',pass:true});
  const roots=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/tabs.html')).map(w=>({id:'0x'+w.getNativeWindowHandle().readUIntLE(0,4).toString(16),title:w.getTitle(),windowId:w.id})));
  assert.equal(roots.length,2);
  const movedWindow=roots.find(w=>w.title.includes('.docx'));assert(movedWindow);
  native('focus',movedWindow.id);
  await a.evaluate(()=>{const {api,win}=EOLocalSession;api.asc_enableKeyEvents(true);win.document.getElementById('area_id').focus();});
  native('savedoc');
  const save=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'detached native Save As',100);
  assert.equal(await movedShell.evaluate(async id=>{try{await eoTabs.detach(id);return false;}catch{return true;}},identityA.documentId),true,'A tab cannot move during its native save dialog');
  assert.equal((await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/tabs.html')).length)),2);
  const target=path.join(root,'detached-word.docx');native('focus',save.id);native('save-path',target);
  await a.waitForFunction(()=>!EOLocalSession.controller.isModified()&&!EODesktopState(false).opening,null,{timeout:120000});
  const saved=await fs.readFile(target);assert.equal(saved[0],80);assert.equal(saved[1],75);
  assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'native Save As belongs to detached Word window and moving during that dialog is refused without a third window',pass:true});
  await shell.evaluate(id=>{window.closePending=eoTabs.close(id);return true;},identityB.documentId);
  const cancel=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'original spreadsheet close prompt',100);native('focus',cancel.id);native('escape');
  assert.equal(await shell.evaluate(()=>window.closePending),false);
  assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),false);assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'native Cancel in original window preserves detached saved Word and original dirty spreadsheet',pass:true});
  await movedShell.getByRole('tab',{selected:true}).focus();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')&&w.getTitle().includes('.docx')).webContents.focus());
  native('focus',movedWindow.id);
  native('tabmenu');await sleep(400);native('down');native('down');native('return');
  await eventually(async()=> (await a.evaluate(()=>eoDesktop.identity())).windowId===identityB.windowId,'reattached document identity');
  await eventually(()=>movedShell.isClosed(),'empty detached root is closed');
  assert.equal((await state()).documents.length,2);
  assert.deepEqual(await a.evaluate(()=>({editor:EOLocalSession===window.retainedEditor,api:EOLocalSession.api===window.retainedApi,sentinel:window.moveSentinel})),{editor:true,api:true,sentinel:'live-A'});
  assert.equal(await b.evaluate(()=>window.retainedEditor===EOLocalSession&&window.moveSentinel==='live-B'),true);
  assert.deepEqual(serializedContent(await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),serializedContent(bytesB));
  await b.evaluate(()=>{window.openPending=eoDesktop.choose();return true;});
  const open=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native re-open chooser after move',100);
  native('focus',open.id);native('path',target);assert.equal(await b.evaluate(()=>window.openPending),null);
  assert.equal((await state()).activeId,identityA.documentId);
  record({case:'native ShiftF10 move-menu selection reparents Word back, preserves both editors and deduplicates its saved file',pass:true});

  const beforeDragA=serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize())));
  async function rootWindows(){return app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/tabs.html')).map(w=>({nativeId:'0x'+w.getNativeWindowHandle().readUIntLE(0,4).toString(16),id:w.id,title:w.getTitle(),bounds:w.getContentBounds()})));}
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).setBounds({x:0,y:0,width:650,height:900}));
  await sleep(300);
  const originalRoot=(await rootWindows())[0],tabBox=await shell.getByRole('tab',{selected:true}).boundingBox();assert(tabBox);
  native('focus',originalRoot.nativeId);
  native('drag',String(Math.round(originalRoot.bounds.x+tabBox.x+Math.min(40,tabBox.width/2))),String(Math.round(originalRoot.bounds.y+tabBox.y+tabBox.height/2)),'1400','400');
  const dragged=await eventually(async()=>{const id=await a.evaluate(()=>eoDesktop.identity());return id.windowId!==identityB.windowId?id:null;},'native drag out creates separate window',150);
  assert.equal(dragged.documentId,identityA.documentId);assert.equal((await state()).documents.length,1);
  assert.deepEqual(serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),beforeDragA);
  record({case:'real XTest tab drag out creates another native window without replacing the live editor',pass:true});
  const dragShell=await eventually(async()=>{for(const p of context.pages().filter(p=>p.url()===origin+'/tabs.html'))if((await p.evaluate(async()=> (await eoTabs.initial()).state)).windowId===dragged.windowId)return p;},'dragged shell');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')&&w.getTitle().includes('.docx')).setBounds({x:700,y:0,width:650,height:900}));
  await sleep(300);const separated=(await rootWindows()).find(w=>w.title.includes('.docx')),dragBox=await dragShell.getByRole('tab',{selected:true}).boundingBox();assert(dragBox);
  native('focus',separated.nativeId);
  native('drag',String(Math.round(separated.bounds.x+dragBox.x+Math.min(40,dragBox.width/2))),String(Math.round(separated.bounds.y+dragBox.y+dragBox.height/2)),String(Math.round(originalRoot.bounds.x+120)),String(Math.round(originalRoot.bounds.y+20)));
  await eventually(async()=> (await a.evaluate(()=>eoDesktop.identity())).windowId===identityB.windowId,'native drag back reattaches to original strip',150);
  await eventually(()=>dragShell.isClosed(),'empty drag-created window closes');
  assert.equal((await rootWindows()).length,1);assert.equal((await state()).documents.length,2);
  assert.deepEqual(serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),beforeDragA);
  assert.deepEqual(serializedContent(await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),serializedContent(bytesB));
  assert.equal(await a.evaluate(()=>window.retainedEditor===EOLocalSession&&window.retainedApi===EOLocalSession.api),true);
  record({case:'real XTest drag back merges live views into original tab strip and closes only empty detached window',pass:true});

  native('focus',originalRoot.nativeId);
  await a.evaluate(()=>{const {api,win}=EOLocalSession;api.asc_enableKeyEvents(true);win.document.getElementById('area_id').focus();});
  native('filemenu');
  const frame=await (await a.locator('iframe[name=frameEditor]').elementHandle()).contentFrame();
  await frame.locator('#fm-btn-eo-move').waitFor({state:'visible',timeout:10000});
  await frame.evaluate(()=>{
   window.eoModalProbe=new Common.UI.Window({width:360,height:170,title:'Modal keyboard probe',modal:true,animate:false,tpl:'<input id="eo-modal-input" aria-label="Probe text"><button id="eo-modal-next" type="button">Next</button>',buttons:['cancel']});
   eoModalProbe.getFocusedComponents=()=>[{cmp:$('#eo-modal-input'),selector:'input'},{cmp:$('#eo-modal-next'),selector:'button'},...eoModalProbe.getFooterButtons()];
   eoModalProbe.getDefaultFocusableComponent=()=>$('#eo-modal-input');
   eoModalProbe.show();document.getElementById('eo-modal-input').focus();
  });
  await frame.locator('.asc-window.modal:visible').waitFor({state:'visible'});
  native('text','EO_MODAL ');
  assert.equal(await frame.locator('#eo-modal-input').inputValue(),'EO_MODAL ');
  for(let n=0;n<8;n++){
   native('tab');
   assert.equal(await frame.evaluate(()=>!!document.activeElement?.closest('.asc-window.modal')),true,'Native Tab must stay inside active modal above File');
  }
  await frame.evaluate(()=>{eoModalProbe.close();delete window.eoModalProbe;});
  await frame.locator('.asc-window.modal:visible').waitFor({state:'hidden'});
  record({case:'real Common.UI modal above File retains native text input and Tab focus without File interception',pass:true});
  await fs.writeFile(path.join(root,'after-modal.json'),JSON.stringify(await frame.evaluate(()=>({active:document.activeElement?.id,moveVisible:$('#fm-btn-eo-move').is(':visible'),modalCount:$('.asc-window.modal:visible').length}))));
  const focusTrace=[];let focusedMove=false;
  for(let n=0;n<80;n++){const focus=await frame.evaluate(()=>{const e=document.activeElement,m=document.getElementById('fm-btn-eo-move');return {id:e?.id,tag:e?.tagName,cls:e?.className,focused:document.hasFocus(),moveAncestor:!!e?.closest?.('#fm-btn-eo-move'),moveIndex:m?.tabIndex,moveRole:m?.getAttribute('role'),moveInert:!!m?.closest('[inert]')};});focusTrace.push({...focus,parent:await a.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName,focused:document.hasFocus()})),shell:await shell.evaluate(()=>({id:document.activeElement?.id,focused:document.hasFocus()}))});if(focus.moveAncestor){focusedMove=true;break;}native('tab');}
  await fs.writeFile(path.join(root,'backstage-focus.json'),JSON.stringify(focusTrace));assert(focusedMove,'Native Tab must reach File Move document from the editor');
  native('return');await sleep(400);native('down');native('return');
  const fileMoved=await eventually(async()=>{const value=await a.evaluate(()=>eoDesktop.identity());return value.windowId!==identityB.windowId?value:null;},'native File Move menu detaches selected Word',150);
  assert.equal(fileMoved.documentId,identityA.documentId);
  record({case:'native File Tab and Enter after modal teardown reaches Move document and detaches via native menu',pass:true});
  const fileShell=await eventually(async()=>{for(const p of context.pages().filter(p=>p.url()===origin+'/tabs.html'))if((await p.evaluate(async()=> (await eoTabs.initial()).state)).windowId===fileMoved.windowId)return p;},'file-moved shell');
  const fileRoot=(await rootWindows()).find(w=>w.title.includes('.docx'));native('focus',fileRoot.nativeId);
  await fileShell.getByRole('button',{name:'Move document',exact:true}).click();await sleep(400);native('down');native('down');native('return');
  await eventually(async()=> (await a.evaluate(()=>eoDesktop.identity())).windowId===identityB.windowId,'visible move button reattaches Word',150);
  await eventually(()=>fileShell.isClosed(),'File-created empty root closes');
  assert.deepEqual(serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),beforeDragA);
  record({case:'visible Move document button opens native menu and reattaches the same live document',pass:true});
  native('undo');await a.waitForFunction(()=>EOLocalSession.controller.isModified());
  assert.notDeepEqual(serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),beforeDragA);
  native('redo');await eventually(async()=>serializedContent(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))).equals(beforeDragA),'native redo restores pre-drag document');
  await a.waitForFunction(()=>!EOLocalSession.controller.isModified());
  assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'native undo and redo retain the same Word history after detach and reattach while spreadsheet edits remain independent',pass:true});
  assert.equal(await shell.evaluate(id=>eoTabs.close(id),identityA.documentId),true);
  assert.equal((await state()).documents.length,1);assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual(errors,[]);
  record({case:'clean reattached Word closes alone while original spreadsheet remains dirty',pass:true});
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:results.length,results,errors,limits:['Linux private authorized Xvfb, no WM','Native drag tested at Linux X11 DPR1 without WM; other compositors/platforms unverified','Word/spreadsheet modified-timestamp normalization is diagnostic only','Physical Windows/macOS/Wayland, OS transport and full sweeps unverified']},null,2));

  const valid=(await shell.evaluate(()=>eoTabs.initial())).state;
  const fake={...valid,revision:valid.revision+1,activeId:'stale-document',documents:[...valid.documents,{id:'stale-document',name:'stale-action-target',dirty:false,closing:false,status:'ready'}]};
  await app.evaluate(({BrowserWindow},snapshot)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.send('eo:tabs-state',snapshot),fake);
  await shell.getByRole('tab').filter({hasText:'stale-action-target'}).click();await shell.getByRole('alert').waitFor({state:'visible'});
  const alertBox=await shell.getByRole('alert').boundingBox();assert(alertBox&&alertBox.y>=0&&alertBox.y+alertBox.height<=44,'Shell failure must be above document view, not hidden behind it');
  assert.equal(await shell.getByRole('alert').innerText(),'Could not finish the document action. Try again.\n×');
  assert.equal((await shell.evaluate(()=>eoTabs.initial())).state.documents.length,1);
  await shell.locator('#tab-error-dismiss').click();await shell.getByRole('alert').waitFor({state:'hidden'});
  await app.evaluate(({BrowserWindow},snapshot)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.send('eo:tabs-state',snapshot),{...valid,revision:valid.revision+2});
  record({case:'stale tab action shows a safe dismissible alert within the visible strip without changing actual documents',pass:true,limit:'Stale presentation state injected to exercise rejected action'});
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:results.length,results,errors,limits:['Linux private authorized Xvfb, X11DPR1 noWM','Bounded modified-timestamp comparison is diagnostic only; raw byte equality is not claimed','Physical platforms/compositors/OS associations/printers/fullsweeps remain unverified']},null,2));
  // Fault injection holds only the renderer acknowledgement; no file write is claimed.
  await b.evaluate(()=>{
   window.eoHeldSaveOriginal=EOLocalSession.controller.save;
   EOLocalSession.controller.save=()=>new Promise((_resolve,reject)=>{window.eoRejectHeldSave=reject;});
  });
  await shell.evaluate(id=>{window.eoWatchdogClose=eoTabs.close(id);window.eoWatchdogResult=null;eoWatchdogClose.then(value=>{window.eoWatchdogResult=value;});},identityB.documentId);
  const dirtyPrompt=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'watchdog dirty document prompt',100);
  native('focus',dirtyPrompt.id);native('save');
  await b.waitForFunction(()=>typeof window.eoRejectHeldSave==='function');
  const waitStarted=Date.now();
  await shell.waitForFunction(()=>window.eoWatchdogResult===false,null,{timeout:40000});
  assert(Date.now()-waitStarted>=28000,'Production watchdog must use its real 30-second budget');
  const warning=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native save timeout warning',100);
  native('focus',warning.id);
  await fs.writeFile(path.join(root,'watchdog-warning-windows.json'),native('windows'));
  assert.equal((await state()).documents.length,1);assert.equal(b.isClosed(),false);
  native('return');
  await b.evaluate(()=>{
   EOLocalSession.controller.save=window.eoHeldSaveOriginal;
   const error=new Error('Injected held acknowledgement cancelled');error.name='AbortError';
   eoRejectHeldSave(error);delete window.eoHeldSaveOriginal;delete window.eoRejectHeldSave;
  });
  await sleep(500);
  assert.equal(b.isClosed(),false);assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual(serializedContent(await b.evaluate(()=>Array.from(EOLocalSession.controller.serialize()))),serializedContent(bytesB));
  record({case:'production 30-second Save-close watchdog shows a native warning and retains the dirty document after a late failed acknowledgement',pass:true,limit:'Renderer save acknowledgement fault-injected; no file write performed'});

  for(let count=2;count<=16;count++){
   await shell.getByRole('button',{name:'New document',exact:true}).click();
   await eventually(()=>docs().length===count,'document count '+count,100);
   await eventually(async()=> (await state()).documents.length===count,'registered count '+count,100);
   const newest=docs().find(p=>p!==b&&!p.eoCapacityReady);
   if(newest){await newest.waitForFunction(()=>window.EODesktopReady);newest.eoCapacityReady=true;}
  }
  await shell.getByRole('button',{name:'New document',exact:true}).click();
  await shell.getByRole('alert').waitFor({state:'visible'});
  assert.match(await shell.getByRole('alert').innerText(),/up to 16 documents/);
  assert.equal(docs().length,16);assert.equal((await state()).documents.length,16);
  const capacityBox=await shell.getByRole('alert').boundingBox();assert(capacityBox&&capacityBox.y>=0&&capacityBox.y+capacityBox.height<=44);
  await shell.locator('#tab-error-dismiss').click();
  // A Home tab may legitimately be reused without exceeding the cap. Select
  // the occupied dirty editor so this OS open would require a seventeenth view.
  assert.equal(await shell.evaluate(id=>eoTabs.activate(id),identityB.documentId),true);
  await app.evaluate(({app},filename)=>app.emit('open-file',{preventDefault(){}},filename),target);
  await shell.getByRole('alert').waitFor({state:'visible'});
  assert.match(await shell.getByRole('alert').innerText(),/up to 16 documents/);
  assert.equal(docs().length,16);assert.equal((await state()).documents.length,16);
  assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual(errors,[]);
  record({case:'16 actual document views refuse New and OS open visibly in the strip while preserving an existing dirty editor',pass:true});
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:results.length,results,errors,limits:['Linux private authorized Xvfb, X11 DPR1 without WM','Bounded modified-timestamp normalization is diagnostic only; no raw-byte or fidelity claim','Save-close watchdog uses injected held renderer acknowledgement and the production 30-second deadline','Physical platforms/compositors/OS associations/printers/full sweeps remain unverified']},null,2));
  console.log(JSON.stringify({passed:results.length}));
 }catch(error){
  const pages=context?.pages()||[];
  await fs.writeFile(path.join(root,'last-states.json'),JSON.stringify(await Promise.all(pages.map(async p=>({url:p.url(),state:await p.evaluate(async()=>({ready:window.EODesktopReady,format:window.EOLocalSession?.format,state:window.EODesktopState?.(false),tabs:window.eoTabs?(await eoTabs.initial()).state:null})).catch(e=>({error:e.message}))}))),null,2));
  await fs.writeFile(path.join(root,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,results,errors,pages:pages.map(p=>p.url())},null,2));console.error(error.stack);process.exitCode=1;
 }finally{
  const child=app?.process();
  if(child&&child.exitCode===null&&child.signalCode===null){
   await Promise.race([app.close().catch(()=>{}),sleep(2000)]);
   if(child.exitCode===null&&child.signalCode===null){
    const stat=await fs.readFile('/proc/'+child.pid+'/stat','utf8').catch(()=>'');
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
    if(Number(fields[2])===child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');
   }
  }
 }
})();
