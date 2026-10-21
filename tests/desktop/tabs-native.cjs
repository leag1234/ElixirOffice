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
  await shell.evaluate(id=>eoTabs.activate(id),identityA.documentId);
  assert.equal((await state()).activeId,identityA.documentId);
  assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),true);assert.equal(await b.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'tab activation preserves both dirty editor sessions and routes selected identity',pass:true});
  await shell.evaluate(id=>eoTabs.activate(id),identityB.documentId);
  await shell.evaluate(id=>{window.closePending=eoTabs.close(id);return true;},identityA.documentId);
  const cancel=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native A prompt',100);
  native('focus',cancel.id);native('escape');assert.equal(await shell.evaluate(()=>window.closePending),false);
  assert.equal((await state()).documents.length,2);assert.equal((await state()).activeId,identityA.documentId);
  record({case:'native Cancel for dirty Word while spreadsheet was active preserves both and selects Word',pass:true});
  await shell.evaluate(id=>{window.closePending=eoTabs.close(id);return true;},identityB.documentId);
  const discard=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native B prompt',100);
  native('focus',discard.id);native('discard');assert.equal(await shell.evaluate(()=>window.closePending),true);
  await eventually(()=>docs().length===1,'B contents destruction');
  const final=await state();assert.deepEqual(final.documents.map(d=>d.id),[identityA.documentId]);assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert(marker(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),'EO_TAB_WORD_A'));
  record({case:'native Dont Save closes spreadsheet only, preserving Word edits',pass:true});
  await app.evaluate(({webContents})=>{
   global.closeActions=[];
   for(const wc of webContents.getAllWebContents()){
    const send=wc.send.bind(wc);wc.send=(channel,...args)=>{if(channel==='eo:action'&&args[0]==='save-close')global.closeActions.push(args[1].attemptId);return send(channel,...args);};
   }
  });
  async function startSaveClose(){
   await shell.evaluate(id=>{window.closeSettled=false;window.closePending=eoTabs.close(id).then(result=>{window.closeSettled=true;return result;});return true;},identityA.documentId);
   const prompt=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'save prompt',100);native('focus',prompt.id);native('return');
   return eventually(()=>JSON.parse(native('windows')).find(w=>w.transient&&w.name!==prompt.name),'Save As native dialog',100);
  }
  const firstSave=await startSaveClose();
  const firstId=await app.evaluate(()=>global.closeActions.at(-1));assert.equal(typeof firstId,'string');
  native('focus',firstSave.id);native('escape');assert.equal(await shell.evaluate(()=>window.closePending),false);
  const secondSave=await startSaveClose();
  const secondId=await app.evaluate(()=>global.closeActions.at(-1));assert.notEqual(firstId,secondId);
  assert.equal(await a.evaluate(id=>eoDesktop.closeCancelled(id),firstId),false);
  assert.equal(await a.evaluate(id=>eoDesktop.closeSaved(id),firstId),false);
  assert.equal(await shell.evaluate(()=>window.closeSettled),false);
  assert.equal((await state()).documents[0].closing,true);
  native('focus',secondSave.id);native('escape');assert.equal(await shell.evaluate(()=>window.closePending),false);
  assert.equal((await state()).documents[0].closing,false);
  record({case:'native Save As cancellation preserves edits and stale Save/Cancel acknowledgements cannot settle a newer close',pass:true});
  // Authorized document IPC and injected native chooser results exercise actual main routing;
  // these do not qualify real OS file-picker UI.
  assert.equal(await a.evaluate(()=>eoDesktop.create('xlsx')),null);
  await eventually(()=>docs().length===2,'new from populated Word creates view');
  const newCell=docs().find(p=>p!==a);await newCell.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  assert(marker(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),'EO_TAB_WORD_A'));
  record({case:'New from populated Word opens another tab and preserves original edits',pass:true});
  const publicFile=path.join(root,'public-open.docx'),alias=path.join(root,'public-alias.docx');
  await fs.copyFile(path.join(product,'desktop/assets/desktop-home/blanks/en.docx'),publicFile);await fs.link(publicFile,alias);
  async function chooseFile(target){
   await app.evaluate(({dialog},target)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});},target);
   return a.evaluate(()=>eoDesktop.choose());
  }
  assert.equal(await chooseFile(publicFile),null);
  await eventually(()=>docs().length===3,'open creates document view');
  const opened=docs().find(p=>p!==a&&p!==newCell);await opened.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  const openedId=(await opened.evaluate(()=>eoDesktop.identity())).documentId;
  await chooseFile(publicFile);assert.equal(docs().length,3);assert.equal((await state()).activeId,openedId);
  await chooseFile(alias);assert.equal(docs().length,3);assert.equal((await state()).activeId,openedId);
  assert(marker(await a.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),'EO_TAB_WORD_A'));
  record({case:'Open adds a tab, same-path and hard-link duplicates focus it with original edits retained',pass:true});
  const before=await fs.readFile(publicFile),token=await a.evaluate(()=>EOLocalSession.file.token);
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},publicFile);
  const rejected=await a.evaluate(async ({token,bytes})=>{try{await eoDesktop.save(token,new Uint8Array(bytes),false);return null;}catch(error){return error.message;}},{token,bytes:Array.from(before)});
  assert.match(rejected,/another tab/);assert.deepEqual(await fs.readFile(publicFile),before);
  assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'Save cannot overwrite another open document; bytes and original dirty edits remain intact',pass:true});
  const failed=path.join(root,'missing.docx');
  await assert.rejects(chooseFile(failed));assert.equal(docs().length,3);
  record({case:'failed open leaves no orphan tab',pass:true});
  const savedA=path.join(root,'saved-A.docx');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},savedA);
  const firstTicket=await a.evaluate(token=>eoDesktop.saveAsChoose(token,'docx'),token);assert(firstTicket.ticket);
  const openedToken=await opened.evaluate(()=>EOLocalSession.file.token);
  await assert.rejects(opened.evaluate(token=>eoDesktop.saveAsChoose(token,'docx'),openedToken),/another tab/);
  await a.evaluate(token=>eoDesktop.saveAsCancel(token),token);
  const nextTicket=await opened.evaluate(token=>eoDesktop.saveAsChoose(token,'docx'),openedToken);assert(nextTicket.ticket);
  await opened.evaluate(token=>eoDesktop.saveAsCancel(token),openedToken);
  record({case:'pending Save As selection blocks another tab and cancellation releases its reservation',pass:true});
  const saveReceipt=await a.evaluate(async()=>{const bytes=await EOLocalSession.controller.save();return {length:bytes.length,header:Array.from(bytes.slice(0,2))};});assert(saveReceipt.length>4);assert.deepEqual(saveReceipt.header,[80,75]);
  await eventually(async()=>await a.evaluate(()=>!EOLocalSession.controller.isModified()),'actual SDK save acknowledges Word snapshot');
  assert.equal((await fs.readFile(savedA)).subarray(0,2).toString(),'PK');
  assert.equal(await opened.evaluate(()=>EOLocalSession.controller.isModified()),false);
  await chooseFile(savedA);assert.equal(docs().length,3);assert.equal((await state()).activeId,identityA.documentId);
  const renamed=await a.evaluate(async token=>{const result=await eoDesktop.rename(token,'renamed-A.docx');EOLocalSession.file.name=result.name;EOLocalSession.file.recoveryVersion=result.recoveryVersion;return result;},token);assert.equal(renamed.name,'renamed-A.docx');
  const renamedPath=path.join(root,'renamed-A.docx');await chooseFile(renamedPath);assert.equal(docs().length,3);assert.equal((await state()).activeId,identityA.documentId);
  await assert.rejects(fs.access(savedA),{code:'ENOENT'});
  assert.deepEqual(await fs.readFile(publicFile),before);
  record({case:'actual Wasm save and rename rekey document ownership without changing another open file',pass:true});
  await shell.getByRole('button',{name:'New document',exact:true}).click();
  await eventually(()=>docs().length===4,'new Home for OS event');
  const home=docs().find(p=>p!==a&&p!==newCell&&p!==opened);await home.waitForFunction(()=>window.EODesktopReady);
  const osFile=path.join(root,'os-open.docx');await fs.copyFile(publicFile,osFile);
  await app.evaluate(({app},file)=>{app.emit('open-file',{preventDefault(){}},file);},osFile);
  await home.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});assert.equal(docs().length,4);
  assert.equal(await home.evaluate(()=>EOLocalSession.file.name),'os-open.docx');
  record({case:'main OS open-file event into empty Home delivers the selection and opens the actual editor',pass:true});
  async function edit(page,text,cell=false){
   await shell.evaluate(id=>eoTabs.activate(id), (await page.evaluate(()=>eoDesktop.identity())).documentId);
   native('focus',windowA.id);
   await page.evaluate(()=>{EOLocalSession.api.asc_enableKeyEvents(true);EOLocalSession.win.document.getElementById('area_id').focus();});
   native('text',text);if(cell)native('return');
   await page.waitForFunction(()=>EOLocalSession.controller.isModified());
  }
  async function recover(page){
   return page.evaluate(async()=>{
    const {controller,win,file}=EOLocalSession,snap=await controller.snapshot();
    const bytes=await win.EOWasmConvert.convert(snap.bytes,snap.format,file.format,{resources:snap.resources});
    const record=await eoDesktop.recoverySave(file.token,file.recoveryVersion||0,bytes);
    return {id:file.token,record};
   });
  }
  await edit(a,'EO_RECOVERY_WORD_A');await edit(newCell,'EO_RECOVERY_CELL_B',true);
  const recoveryA=await recover(a),recoveryB=await recover(newCell);
  assert(recoveryA.record);assert(recoveryB.record);assert.notEqual(recoveryA.id,recoveryB.id);
  assert.deepEqual((await a.evaluate(()=>eoDesktop.recoveryList())).map(r=>r.id).sort(),[recoveryA.id,recoveryB.id].sort());
  record({case:'actual Word and spreadsheet snapshots create separate scoped recovery copies',pass:true});
  await a.evaluate(token=>eoDesktop.passwordLock(token),token);
  assert.deepEqual((await newCell.evaluate(()=>eoDesktop.recoveryList())).map(r=>r.id),[recoveryB.id]);
  assert.equal((await recover(a)).record,false);assert((await recover(newCell)).record);
  record({case:'password lock removes and disables only Word recovery, retaining spreadsheet recovery',pass:true});
  assert.equal(await a.evaluate(id=>eoDesktop.recoveryRestore(id),recoveryB.id),null);
  await eventually(()=>docs().length===5,'recovery opens new document view');
  const restored=docs().find(p=>![a,newCell,opened,home].includes(p));
  await restored.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  const restoredId=(await restored.evaluate(()=>eoDesktop.identity())).documentId;
  assert.equal(await restored.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert(marker(await restored.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),'EO_RECOVERY_CELL_B'));
  await a.evaluate(id=>eoDesktop.recoveryRestore(id),recoveryB.id);assert.equal(docs().length,5);assert.equal((await state()).activeId,restoredId);
  await assert.rejects(a.evaluate(id=>eoDesktop.recoveryRemove(id),recoveryB.id),/in use/);
  assert.deepEqual(await a.evaluate(()=>eoDesktop.recoveryOffer()),[]);
  record({case:'restore opens and deduplicates a dirty recovered copy while its source editor remains alive',pass:true});
  const restoredRecovery=await recover(restored);assert(restoredRecovery.record);assert.notEqual(restoredRecovery.id,recoveryB.id);
  assert.deepEqual((await restored.evaluate(()=>eoDesktop.recoveryList())).map(r=>r.id).sort(),[recoveryB.id,restoredRecovery.id].sort());
  assert((await recover(newCell)).record);
  assert.deepEqual((await restored.evaluate(()=>eoDesktop.recoveryList())).map(r=>r.id).sort(),[recoveryB.id,restoredRecovery.id].sort());
  await a.evaluate(id=>eoDesktop.recoveryRestore(id),restoredRecovery.id);assert.equal(docs().length,5);assert.equal((await state()).activeId,restoredId);
  await assert.rejects(a.evaluate(id=>eoDesktop.recoveryRemove(id),restoredRecovery.id),/in use/);
  record({case:'original and restored spreadsheet persist distinct recovery identities; either recovery ID focuses the restored tab',pass:true});
  const picturePdf=path.join(root,'pending-picture.pdf');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},picturePdf);
  await a.evaluate(async()=>{
   const frame=EOLocalSession.win;
   for(const name of ['/example/local-assets/sdkjs/common/clientpdf/clientpdf.js','/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js','/example/local-assets/sdkjs/common/desktop/pdf.js']){
    await new Promise((resolve,reject)=>{const script=frame.document.createElement('script');script.src=name;script.onload=resolve;script.onerror=reject;frame.document.head.append(script);});
   }
   const build=frame.EODesktopPdf;window.pdfBuildStarted=false;frame.EODesktopPdf=(...args)=>{window.pdfBuildStarted=true;const logic=EOLocalSession.api.WordControl.m_oLogicDocument;window.pdfPictureAtBuild={drawings:logic.DrawingObjects.drawingObjects.length,pages:EOLocalSession.api.WordControl.m_oDrawingDocument.m_lPagesCount,hidden:frame.document.hidden,recalc:logic.RecalcInfo?.FullRecalc};return build(...args);};
   const snapshot=EOLocalSession.controller.snapshot;window.pdfSnapshotStarted=false;EOLocalSession.controller.snapshot=(...args)=>{window.pdfSnapshotStarted=true;return snapshot(...args);};
   const canvas=frame.document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d');context.fillStyle='#124bed';context.fillRect(0,0,32,32);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),bytes=await blob.arrayBuffer();
   const gate=new Promise(resolve=>{window.releasePicture=resolve;});window.pictureReadStarted=false;
   window.pendingPicture=EOLocalSession.controller.addImage({size:bytes.byteLength,arrayBuffer:async()=>{window.pictureReadStarted=true;await gate;return bytes;}});
  });
  await a.waitForFunction(()=>window.pictureReadStarted&&EOLocalSession.controller.hasPendingImages());
  await app.evaluate(({webContents},id)=>{const wc=webContents.fromId(id);wc.send('eo:action','pdf');},await app.evaluate(async({webContents},documentId)=>{for(const wc of webContents.getAllWebContents()){if(wc.getURL().endsWith('/index.html')&&await wc.executeJavaScript('window.EODocumentId')===documentId)return wc.id;}},identityA.documentId));
  await a.waitForFunction(()=>window.pdfSnapshotStarted||window.pdfBuildStarted,null,{timeout:20000});
  assert.equal(await a.evaluate(()=>window.pdfSnapshotStarted),true,'PDF must wait on the local controller picture queue');
  assert.equal(await a.evaluate(()=>window.pdfBuildStarted),false,'PDF drawing must not start while picture import is pending');
  await shell.evaluate(id=>eoTabs.activate(id),(await newCell.evaluate(()=>eoDesktop.identity())).documentId);
  await a.evaluate(()=>{window.releasePicture();return true;});await a.evaluate(()=>window.pendingPicture);
  await a.waitForFunction(()=>window.EOLastPdf?.bytes>0||window.EOLocalFailure,null,{timeout:120000});
  assert.equal(await a.evaluate(()=>window.EOLocalFailure||null),null);
  assert.equal(await a.evaluate(()=>EOLastPdf.stats.backend),'wasm');
  await fs.writeFile(path.join(root,'picture-diagnostic.json'),JSON.stringify(await a.evaluate(async()=>({atBuild:window.pdfPictureAtBuild,drawings:EOLocalSession.api.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length,resources:(await EOLocalSession.controller.snapshot()).resources.map(r=>({path:r.path,bytes:r.bytes.length})),pdf:window.EOLastPdf})),null,2));
  assert((await a.evaluate(()=>EOLastPdf.stats.images))>=1);assert((await a.evaluate(()=>EOLastPdf.stats.imageBytes))>0);
  cp.execFileSync('pdftoppm',['-r','96','-f','1','-singlefile','-png',picturePdf,path.join(root,'pending-picture-render')]);
  const bluePixels=Number(cp.execFileSync('python3',['-c',"from PIL import Image;import sys;i=Image.open(sys.argv[1]).convert('RGB');print(sum(b>150 and r<70 and g<130 for r,g,b in i.getdata()))",path.join(root,'pending-picture-render.png')],{encoding:'utf8'}));assert(bluePixels>500,'Imported blue picture must be visible in rendered PDF');
  const pdfText=cp.execFileSync('pdftotext',[picturePdf,'-'],{encoding:'utf8'});assert(pdfText.includes('EO_RECOVERY_WORD_A'));assert(!pdfText.includes('EO_RECOVERY_CELL_B'));
  record({case:'PDF awaits actual pending picture import and retains originating Word context across tab switch',pass:true});
  const ownedPdf=path.join(root,'owned-open.pdf');await fs.copyFile(picturePdf,ownedPdf);await chooseFile(ownedPdf);
  await eventually(()=>docs().length===6,'open owned PDF view');
  const pdfView=docs().find(p=>![a,newCell,opened,home,restored].includes(p));await pdfView.waitForFunction(()=>window.EOLocalSession?.format==='pdf',null,{timeout:120000});
  const pdfBytes=Array.from(await fs.readFile(picturePdf)),ownedBefore=await fs.readFile(ownedPdf);
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},ownedPdf);
  await assert.rejects(a.evaluate(({token,bytes})=>eoDesktop.pdf(token,new Uint8Array(bytes),false),{token,bytes:pdfBytes}),/another tab/);
  await assert.rejects(a.evaluate(token=>eoDesktop.saveAsChoose(token,'pdf'),token),/another tab/);
  assert.deepEqual(await fs.readFile(ownedPdf),ownedBefore);
  record({case:'direct and ticketed PDF output refuse another open PDF destination without changing it',pass:true});
  const ticketPdf=path.join(root,'ticket-copy.pdf');
  await app.evaluate(({dialog},target)=>{global.originalMessageBox=dialog.showMessageBox;dialog.showMessageBox=async(_parent,options)=>{if(options.type!=='warning')throw Error('Unexpected injected PDF prompt');return {response:1};};dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},ticketPdf);
  const pdfTicket=await a.evaluate(token=>eoDesktop.saveAsChoose(token,'pdf'),token);
  const pdfSaved=await a.evaluate(({token,bytes,ticket})=>eoDesktop.pdf(token,new Uint8Array(bytes),false,false,undefined,ticket),{token,bytes:pdfBytes,ticket:pdfTicket.ticket});assert(pdfSaved.bytes>0);
  const cellToken=await newCell.evaluate(()=>EOLocalSession.file.token);
  const reused=await newCell.evaluate(token=>eoDesktop.saveAsChoose(token,'pdf'),cellToken);assert(reused.ticket);await newCell.evaluate(token=>eoDesktop.saveAsCancel(token),cellToken);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=global.originalMessageBox;});
  record({case:'successful ticketed PDF copy releases its destination for a later selection by another tab',pass:true});
  await a.evaluate(({token,bytes})=>{window.nativePrint=eoDesktop.pdf(token,new Uint8Array(bytes),true);return true;},{token,bytes:pdfBytes});
  const printPrompt=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient&&/print/i.test(w.name)),'native Print dialog',250);
  const concurrentPrint=await newCell.evaluate(async({token,bytes})=>{try{await eoDesktop.pdf(token,new Uint8Array(bytes),true);return null;}catch(error){return error.message;}},{token:cellToken,bytes:pdfBytes});assert.match(concurrentPrint,/operation.*running|busy/i);
  native('focus',printPrompt.id);native('escape');
  const printResult=await a.evaluate(()=>window.nativePrint);assert.equal(printResult.printed,false);
  assert.equal(await a.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.equal(await newCell.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual((await fs.readdir(path.join(root,'profile','print-jobs'))).filter(name=>name.startsWith('job-')),[]);
  record({case:'actual native Print cancel cleans only its helper, preserves both dirty tabs, and concurrent Print is refused safely',pass:true});
  await shell.evaluate(id=>{window.closePending=eoTabs.close(id);return true;},identityA.documentId);
  const savePrompt=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native Save before tab close',100);
  native('focus',savePrompt.id);native('return');assert.equal(await shell.evaluate(()=>window.closePending),true);
  await eventually(()=>!docs().includes(a),'Word close after committed save');
  const contains=cp.execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);s=''.join(E.fromstring(z.read('word/document.xml')).itertext());print('yes' if 'EO_RECOVERY_WORD_A' in s else 'no')",renamedPath],{encoding:'utf8'}).trim();assert.equal(contains,'yes');
  assert.equal(await newCell.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.equal(await restored.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'native Save commits latest Word edits before closing only that tab, retaining both dirty spreadsheets',pass:true});
  const openedIdentity=(await opened.evaluate(()=>eoDesktop.identity())).documentId;
  await shell.evaluate(id=>eoTabs.activate(id),openedIdentity);
  const fileFrame=opened.frames().find(frame=>frame.url().includes('/documenteditor/main/'));assert(fileFrame);
  await fileFrame.locator('#file[role=tab]').click();
  await fileFrame.locator('#fm-btn-elx-close').click();
  await eventually(()=>!docs().includes(opened),'File Close removes its view');
  assert.equal(docs().length,4);assert.equal(await newCell.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'visible Word File Close removes only its clean tab and retains dirty spreadsheets',pass:true});
  await shell.evaluate(id=>eoTabs.activate(id),(await home.evaluate(()=>eoDesktop.identity())).documentId);
  await app.evaluate(({Menu})=>{const flatten=items=>items.flatMap(item=>[item,...(item.submenu?flatten(item.submenu.items):[])]);const close=flatten(Menu.getApplicationMenu().items).find(item=>item.accelerator==='CommandOrControl+W');if(!close)throw Error('Close document menu missing');close.click();});
  await eventually(()=>!docs().includes(home),'native File menu Close removes active view');assert.equal(docs().length,3);
  record({case:'native File menu Close captures active document exactly once',pass:true});
  await shell.evaluate(id=>eoTabs.activate(id),(await newCell.evaluate(()=>eoDesktop.identity())).documentId);
  await newCell.evaluate(()=>EOLocalSession.win.document.getElementById('area_id').focus());native('focus',windowA.id);
  for(const chord of ['tabclose','ctrlf4']){
   native('focus',windowA.id);await newCell.evaluate(()=>EOLocalSession.win.document.getElementById('area_id').focus());native(chord);
   const question=await eventually(()=>JSON.parse(native('windows')).find(w=>w.transient),'native dirty close prompt '+chord,100);native('focus',question.id);native('escape');
   await eventually(async()=>!(await state()).documents.some(d=>d.closing),'close cancellation settled');
   assert.equal(docs().length,3);assert.equal(await newCell.evaluate(()=>EOLocalSession.controller.isModified()),true);
  }
  record({case:'real CtrlW and CtrlF4 use dirty active-tab Cancel without destroying or changing other editors',pass:true});
  const pdfId=(await pdfView.evaluate(()=>eoDesktop.identity())).documentId;
  await shell.evaluate(id=>eoTabs.activate(id),pdfId);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.focus());native('focus',windowA.id);native('tabclose');
  await eventually(()=>!docs().includes(pdfView),'shell-focused CtrlW closes active PDF');assert.equal(docs().length,2);
  record({case:'shell-focused native CtrlW routes to selected document while tab strip owns focus',pass:true});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.focus());native('focus',windowA.id);native('newdoc');
  await eventually(()=>docs().length===3,'shell-focused CtrlN creates exactly one document');
  const keyboardNew=docs().find(p=>p!==newCell&&p!==restored);await keyboardNew.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  assert.equal(await newCell.evaluate(()=>EOLocalSession.controller.isModified()),true);assert.equal(await restored.evaluate(()=>EOLocalSession.controller.isModified()),true);
  record({case:'shell-focused CtrlN uses active spreadsheet format and preserves both editors without double dispatch',pass:true});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.focus());native('focus',windowA.id);native('saveas');
  await keyboardNew.locator('.eo-format-dialog').waitFor({state:'visible'});assert.equal(await keyboardNew.locator('.eo-format-dialog').count(),1);assert.equal(await restored.locator('.eo-format-dialog').count(),0);
  await keyboardNew.locator('.eo-format-dialog button[type=button]').click();await keyboardNew.locator('.eo-format-dialog').waitFor({state:'hidden'});
  record({case:'shell-focused F12 opens one Save As chooser in its active document with working Cancel',pass:true});
  const cellSave=path.join(root,'keyboard-cell.xlsx');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},cellSave);
  await shell.evaluate(id=>eoTabs.activate(id),(await newCell.evaluate(()=>eoDesktop.identity())).documentId);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).webContents.focus());native('focus',windowA.id);native('savedoc');
  await newCell.waitForFunction(()=>window.EOLastSave?.bytes>0&&!EOLocalSession.controller.isModified(),null,{timeout:120000});
  assert.equal((await fs.readFile(cellSave)).subarray(0,2).toString(),'PK');assert.equal(await restored.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual((await restored.evaluate(()=>eoDesktop.recoveryList())).map(r=>r.id),[restoredRecovery.id]);
  record({case:'shell-focused CtrlS saves the originating spreadsheet and clears only its recovery record',pass:true});
  const windowOptions=await restored.evaluate(()=>eoDesktop.windowOptions());assert.equal(windowOptions.customTitleBar,false);assert.equal(windowOptions.customTitleBarAvailable,false);assert.equal(windowOptions.effectiveFrame,'native');
  await assert.rejects(restored.evaluate(()=>eoDesktop.windowSettings({customTitleBar:true})),/system window frame/);
  await assert.rejects(restored.evaluate(()=>eoDesktop.windowSettings({customTitleBar:'yes'})),/Invalid window settings/);
  await shell.evaluate(id=>eoTabs.activate(id),restoredId);
  await app.evaluate(async({webContents},documentId)=>{for(const wc of webContents.getAllWebContents())if(wc.getURL().endsWith('/index.html')&&await wc.executeJavaScript('window.EODocumentId')===documentId){wc.send('eo:action','settings');break;}},restoredId);
  const optionsBox=restored.locator('dialog.desktop-options');await optionsBox.waitFor({state:'visible'});
  const frameOption=optionsBox.locator('#custom-title-bar');await frameOption.waitFor();assert.equal(await frameOption.isChecked(),false);assert.equal(await frameOption.isDisabled(),true);
  assert.equal(await frameOption.getAttribute('aria-describedby'),'custom-title-bar-description custom-title-bar-note');assert.match(await optionsBox.locator('#custom-title-bar-note').textContent(),/system window frame/);
  await optionsBox.getByRole('button',{name:'Save',exact:true}).click();await optionsBox.waitFor({state:'hidden'});
  const persisted=JSON.parse(await fs.readFile(path.join(root,'profile','desktop-settings.json'),'utf8'));assert.equal(persisted.customTitleBar,false);
  assert.equal(await restored.evaluate(()=>EOLocalSession.controller.isModified()),true);assert.equal(await shell.evaluate(()=>navigator.windowControlsOverlay?.visible===true),false);
  record({case:'Options exposes named custom-titlebar preference with persisted native default and enforced fallback on unqualified platform',pass:true});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:results.length,results,errors,limits:['Source and asset provenance must be recorded by the caller; this script does not build assets','Native XTest text enters actual SDK inputs; full shortcuts/menu sweep remains later','Native XTest controls real GTK prompts on private Xvfb without WM','Physical Windows/macOS/Wayland and native OS chooser/launch transport unverified; shared full regression gates, Options/overlay and detach remain pending']},null,2));
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
