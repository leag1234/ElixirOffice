// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {app, screen, BrowserWindow, WebContentsView, ipcMain, dialog:nativeDialog, Menu, session, protocol, net, shell, clipboard} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs'),password=require('./password.cjs');
const saveAs=require('./save-as.cjs');
const files = require('./files.cjs'), resources = require('./resources.cjs'), {Fonts} = require('./fonts.cjs');
// Keep the existing profile location while correcting the native app identity.
const defaultProfile=app.getPath('userData');
app.setName?.('ElixirOffice');app.setPath('userData',defaultProfile);
if (process.env.EO_DESKTOP_PROFILE) app.setPath('userData',path.resolve(process.env.EO_DESKTOP_PROFILE));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
protocol.registerSchemesAsPrivileged([{scheme:resources.SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,codeCache:true,corsEnabled:true}}]);
const assets = app.isPackaged ? path.join(process.resourcesPath,'assets') : path.join(__dirname,'assets');
let conversionRuntime;
let win, settings={recents:[],fontConsent:false},tabHost,appClosing=false,documentHandlersReady=false;
const {DocumentRegistry,MAX_DOCUMENTS}=require('./document-registry.cjs');
const registry=new DocumentRegistry({documentURL:resources.ORIGIN+'/index.html',shellURL:resources.ORIGIN+'/tabs.html',report:()=>safety.log('tab-notification-failure')});
const documentState=()=>registry.context().state;
const docContents=()=>registry.context().contents;
const documentWindow=()=>registry.window(registry.context().windowId).window;
const pendingPaths=[];let pendingLimitNotice=false;
registry.on('changed',windowId=>{
 const owner=registry.window(windowId);if(owner.window.isDestroyed())return;
 const document=registry.active(windowId),current=document?.state.current;
 owner.window.setTitle((document?.dirty?'* ':'')+(current?.name?current.name+' — ':'')+'ElixirOffice');
});
const fonts = new Fonts({report:error=>{void safety.log('font-error');void safety.log(error?.code)}});
const captureConsoleError=console.error.bind(console);
const safety=require('./safety-log.cjs').create(()=>app.getPath('userData'));
let saveDiagnostics;
safety.install(process,console,async()=>{
 appClosing=true;
 try{
  if(!app.isReady?.()){app.exit(1);return;}
  const options={type:'error',message:t('fatalMessage'),detail:t('fatalDetail'),buttons:[t('close')],normalizeAccessKeys:true,defaultId:0,cancelId:0};
  if(win&&!win.isDestroyed())await nativeDialog.showMessageBox(win,options);else await nativeDialog.showMessageBox(options);
 }catch{await safety.log('fatal-dialog-failure');}
 finally{await safety.flush();app.exit(1);}
});

let preferences,recovery;
const locale=require('./locale.cjs'),capture=require('./capture.cjs'),decisions=require('./decisions.cjs');
let captureOptions,captureStartupError;
let languageInfo;
const fatalFallback={fatalMessage:'ElixirOffice encountered an unexpected problem and needs to close.',fatalDetail:'Changes not yet saved may be lost. Open the app again to continue.',close:'Close'};
const tabEnglish=require('./tab-strings.json');
function localizedStrings(){
 const strings={...languageInfo?.strings};
 for(const [key,value] of Object.entries(tabEnglish))if(typeof strings[key]!=='string'||!strings[key].trim())strings[key]=value;
 return strings;
}
const t=key=>{const value=languageInfo?.strings[key];return typeof value==='string'&&value.trim()?value:tabEnglish[key]||fatalFallback[key]||key;};
// Invalid capture requests fail before startup, without Electron's uncaught-error dialog.
try{
 captureOptions=capture.parse(process.argv.slice(app.isPackaged?1:2));
 if(captureOptions){
  const sync=require('node:fs');sync.mkdirSync(captureOptions.folder,{recursive:true});
  if(sync.readdirSync(captureOptions.folder).length)throw Error('Choose an empty capture output folder');
  captureOptions.profile=sync.mkdtempSync(path.join(captureOptions.folder,'.capture-profile-'));
  app.setPath('userData',captureOptions.profile);
 }
}catch(error){captureStartupError=error;}

// Bind print cleanup only after capture has selected its private profile.
const printer=require('./printing.cjs').create({BrowserWindow,session,root:path.join(app.getPath('userData'),'print-jobs'),log:code=>safety.log(code),allowOffscreenRetry:process.env.EO_PRINT_OFFSCREEN_RETRY==='1'});

const {documentPath}=require('./document-path.cjs');
const argument=argv=>argv.map(documentPath).find(Boolean);
const initial = captureOptions||captureStartupError?null:argument(process.argv.slice(app.isPackaged?1:2)); if(initial)pendingPaths.push(initial);
if(captureStartupError){try{captureConsoleError('ElixirOffice capture startup failed:\n'+captureStartupError.stack);}catch{void safety.log('console-error');}app.exit(1);}
else if(!app.requestSingleInstanceLock()){if(captureOptions)cleanupCapture().catch(()=>safety.log('capture-cleanup-failure')).then(()=>app.exit(1)).catch(()=>{void safety.log('capture-cleanup-failure');app.exit(1)});else app.quit();}
else {
app.on('second-instance',(_event,argv)=>{if(captureOptions)return;const file=argument(argv.slice(1));if(file)enqueueFile(file);win?.show();win?.focus();});
app.on('open-file',(event,file)=>{event.preventDefault();if(captureOptions)return;const selected=documentPath(file);if(selected)enqueueFile(selected);});
app.whenReady().then(start).catch(async error=>{
 if(captureOptions){console.error(error.message);appClosing=true;if(win&&!win.isDestroyed())win.destroy();try{await cleanupCapture()}catch{await safety.log('capture-cleanup-failure')}finally{app.exit(1)}}
 else {dialog.showErrorBox('ElixirOffice',t('error'));app.quit();}
}).catch(()=>{void safety.log('startup-failure');app.exit(1)});
}
async function cleanupCapture(){
 if(captureOptions?.profile){app.releaseSingleInstanceLock();await fs.rm(captureOptions.profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
let showHelpAction,showAboutAction;
function withActive(run){
 let focused=BrowserWindow.getFocusedWindow?.(),owner;
 if(!focused)return false;
 while(focused&&!owner){owner=registry.windows().find(item=>item.window===focused);focused=focused.getParentWindow?.();}
 if(!owner?.activeId)return false;
 const document=registry.document(owner.activeId);return registry.run(document,run);
}
function sendAction(name){
 if(name==='quit')return quitApplication();
 if(name==='move-menu')return showMoveMenu(registry.context());
 if(name==='close-tab')return closeDocument(registry.context());
 if(name==='help')return showHelpAction?.();
 if(name==='about')return showAboutAction?.();
 docContents().send('eo:action',name);
}
const documentFiles=new (require('./document-files.cjs').DocumentFiles)({platform:process.platform});
const recoveryRestores=new Map();let recoveryOffered=false;
const documentDialogs=new (require('./document-dialogs.cjs').DocumentDialogs)();
const dialog={showErrorBox:(...args)=>nativeDialog.showErrorBox(...args)};
for(const method of ['showMessageBox','showSaveDialog','showOpenDialog'])dialog[method]=(parent,options)=>{
 const document=registry.context(),validate=registry.capture(document.id);
 if(document.state.moving)throw Error(t('tabMoveBusy'));
 return documentDialogs.run(document.windowId,validate,()=>registry.run(document,()=>{focusDocument(document.id);return nativeDialog[method](parent,options);}));
};

function dispatchDocumentAction(document,name){
 const failed=()=>{void safety.log('tab-action-failure');if(document.live&&!document.contents.isDestroyed())document.contents.send('eo:action','external-error');return false;};
 try{focusDocument(document.id);return Promise.resolve(registry.run(document,()=>sendAction(name))).catch(failed);}
 catch{return Promise.resolve(failed());}
}
function installShellShortcuts(owner){
 require('./shortcuts.cjs').install(owner.window.webContents,process.platform,()=>registry.active(owner.id)?.state.current?.format,name=>{
  const document=registry.active(owner.id);if(document)return dispatchDocumentAction(document,name);
 },()=>!captureOptions&&!!registry.active(owner.id));
}
function createSession(windowId,{pending=[]}={}){
 const document=tabHost.addDocument(registry.window(windowId),{state:{current:null,dirty:false,busy:false,closing:false,ready:false,pending,closePending:false,finishClosePending:null,destinations:new saveAs.Destinations(),artifacts:new (require('./artifacts.cjs').Artifacts)(),closePromise:null,closeResolve:null,waitingSave:false,closeAttempt:null,initialSelection:null,destinationLease:null,aiJobs:new Map()}});
 document.contents.setWindowOpenHandler(require('./external.cjs').handler(url=>shell.openExternal(url),()=>{if(document.live)document.contents.send('eo:action','external-error');}));
 require('./shortcuts.cjs').install(document.contents,process.platform,()=>document.state.current?.format,name=>{if(document.live)return dispatchDocumentAction(document,name);},()=>!captureOptions&&document.live);
 return document;
}
async function loadSession(document){
 await registry.run(document,()=>tabHost.loadDocument(document));
 if(document.live)registry.activate(document.id);
 return document;
}
async function moveSession(document,target,{point}={}){
 if(captureOptions)throw Error('Capture mode unavailable');
 const source=registry.window(document.windowId),state=document.state,validate=registry.capture(document.id);
 function available(){
  validate();
  if(state.busy||state.closing||state.closePending||document.closing||source.closeAllPending||documentDialogs.has(source.id)||registry.documents(source.id).some(item=>item.closing))throw Error(t('tabMoveBusy'));
  if(target&&(target.window.isDestroyed()||target.closeAllPending||documentDialogs.has(target.id)||registry.documents(target.id).some(item=>item.closing)))throw Error(t('tabMoveBusy'));
 }
 if(state.moving)throw Error(t('tabMoveBusy'));available();state.moving=true;
 let created=false;
 try{
  const renderer=await registry.run(document,()=>rendererState(false));available();
  if(renderer.opening)throw Error(t('tabMoveBusy'));
  if(!target){
   target=tabHost.createWindow();created=true;await target.ready;available();
   if(point){const area=screen.getDisplayNearestPoint(point).workArea,size=target.window.getBounds();
    target.window.setPosition(Math.round(Math.max(area.x,Math.min(point.x,area.x+Math.max(0,area.width-size.width)))),Math.round(Math.max(area.y,Math.min(point.y,area.y+Math.max(0,area.height-size.height)))));}
  }
  tabHost.moveDocument(document,target);win=target.window;
  target.window.show();target.window.focus();document.contents.focus();
  if(!source.documents.length){
   const documents=registry.windows().reduce((count,owner)=>count+owner.documents.length,0);
   if(process.platform==='darwin'){
    if(documents<MAX_DOCUMENTS)await loadSession(createSession(source.id));
   }else{source.allowClose=true;source.window.destroy();}
  }
  return {documentId:document.id,windowId:document.windowId};
 }catch(error){
  if(created&&target&&!target.window.isDestroyed()&&!target.documents.length){target.allowClose=true;target.window.destroy();}
  throw error;
 }finally{state.moving=false;}
}
const tabDrags=new (require('./tab-drags.cjs').TabDrags)();
function beginTabDrag(owner,document,token){
 if(captureOptions||document.state.busy||document.state.moving||document.closing||owner.closeAllPending||documentDialogs.has(owner.id))throw Error(t('tabMoveBusy'));
 return tabDrags.begin(document.id,owner.id,token);
}
function containsPoint(rect,point){return point.x>=rect.x&&point.x<rect.x+rect.width&&point.y>=rect.y&&point.y<rect.y+rect.height;}
function inTabStrip(owner,point){
 if(owner.window.isDestroyed())return false;
 const rect=owner.window.getContentBounds();return containsPoint({...rect,height:require('./tabs-host.cjs').STRIP_HEIGHT},point);
}
async function finishTabDrag(caller,token,drop){
 // The destination renderer's drop can arrive on a different IPC connection.
 // Give it time to consume the capability before the source's dragend fallback.
 if(!drop)await new Promise(resolve=>setTimeout(resolve,100));
 const entry=tabDrags.peek(token);if(!entry)return false;
 if(!screen?.getCursorScreenPoint)throw Error('Document drag unavailable');
 const point=screen.getCursorScreenPoint();
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('Invalid document position');
 if(drop&&!inTabStrip(caller,point))return false;
 const consumed=tabDrags.take(token,{callerWindowId:caller.id,targetWindowId:drop?caller.id:undefined});if(!consumed)return false;
 let document,source;
 try{document=registry.document(consumed.documentId);source=registry.window(document.windowId);}catch{return false;}
 if(source.id!==consumed.windowId)return false;
 if(drop)return caller===source?false:moveSession(document,caller);
 if(containsPoint(source.window.getBounds(),point))return false;
 const target=registry.windows().slice().reverse().find(owner=>owner!==source&&inTabStrip(owner,point));
 return moveSession(document,target,{point});
}
function showMoveMenu(document){
 if(captureOptions)throw Error('Capture mode unavailable');
 const source=registry.window(document.windowId);
 const move=target=>{void moveSession(document,target).catch(()=>{if(document.live)document.contents.send('eo:action','external-error');});};
 const display=value=>'\u2068'+String(value).replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/&/g,'&&')+'\u2069';
 const template=[{label:t('tabDetach'),click:()=>move()}];
 for(const owner of registry.windows())if(owner!==source&&!owner.window.isDestroyed()){
  const name=registry.active(owner.id)?.name||t('tabUntitled');
  template.push({label:t('tabMoveWindow').replace('{name}',()=>display(name)),click:()=>move(owner)});
 }
 const menu=Menu.buildFromTemplate(template);menu.popup({window:source.window});return true;
}
function showTabLimit(document){
 pendingLimitNotice=true;
 const owner=registry.windows().find(item=>!item.window.isDestroyed()&&(!document||item.id===document.windowId));
 if(owner&&documentHandlersReady){
  owner.window.show();owner.window.focus();owner.window.webContents.send('eo:tabs-limit');pendingLimitNotice=false;
 }
 return false;
}
function enqueueFile(filename){
 if(!tabHost||!documentHandlersReady){
  if(pendingPaths.includes(filename))return true;
  if(pendingPaths.length>=require('./document-registry.cjs').MAX_DOCUMENTS)return showTabLimit();
  pendingPaths.push(filename);return true;
 }
 let owner,source;
 const refused=error=>{
  if(error?.code==='DOCUMENT_LIMIT')return showTabLimit(source);
  void safety.log('file-error');
  if(source?.live&&!source.contents.isDestroyed())source.contents.send('eo:action','external-error');
  return false;
 };
 try{
  owner=registry.windows()[0]||tabHost.createWindow();win=owner.window;
  source=registry.active(owner.id)||createSession(owner.id);
 }catch(error){return refused(error);}
 const ready=source.status==='opening'?loadSession(source):Promise.resolve();
 return ready.then(()=>registry.run(source,()=>openFile(filename,{reuse:!source.state.busy}))).then(selection=>{
  if(selection&&source.live){source.state.initialSelection=selection;source.contents.send('eo:action','pending');}
  owner.window.show();owner.window.focus();return true;
 }).catch(refused);
}
function releaseSession(document){
 documentFiles.forget(document.id);
 for(const [id,entry] of recoveryRestores)if(entry.documentId===document.id)recoveryRestores.delete(id);
 for(const job of document.state.aiJobs.values())job.abort();document.state.aiJobs.clear();
}
function focusDocument(id){
 const document=registry.document(id),owner=registry.window(document.windowId);
 registry.activate(id);owner.window.show();owner.window.focus();return document;
}
async function restoreRecovery(id){
 if(captureOptions)throw Error('Capture mode unavailable');
 let entry=recoveryRestores.get(id);
 if(entry){if(entry.promise)await entry.promise;focusDocument(entry.documentId);return null;}
 entry={documentId:null,promise:null};recoveryRestores.set(id,entry);
 entry.promise=prepareDocument(async()=>{
  const restored=await recovery.read(id);
  const token=crypto.randomUUID(),document=registry.context(),validate=registry.capture(document.id);
  documentState().current={token,recoveryId:token,restoredFrom:id,name:restored.name,format:restored.format,target:null,embeddedObjects:['odt','ods','odp'].includes(restored.format)?packageGuard.embeddedObjects(restored.data):0};
  documentState().current.protected=password.encrypted(restored.data,restored.format);documentState().current.recoveryLocked=documentState().current.protected;
  documentState().dirty=true;title();entry.documentId=document.id;recoveryRestores.set(token,entry);
  // A restored copy has its own durable recovery identity. Do not let it share
  // the original editor's AutoRecover file when both documents remain open.
  await files.scoped({scope:token,id:'recovery-restore'},options=>recovery.save({id:token,name:restored.name,format:restored.format},restored.data,options));validate();
  const otherOwner=registry.windows().some(owner=>registry.documents(owner.id).some(other=>other!==document&&other.state.current&&(other.state.current.recoveryId||other.state.current.token)===id));
  if(!otherOwner){await recovery.remove(id);validate();}
  return {token:documentState().current.token,name:documentState().current.name,format:documentState().current.format,bytes:restored.data,recovered:true,runtime:conversionRuntime};
 });
 try{return await entry.promise;}
 catch(error){for(const [key,value] of recoveryRestores)if(value===entry)recoveryRestores.delete(key);throw error;}
 finally{entry.promise=null;}
}
function clearDestination(){
 const state=documentState();state.destinations.clear();documentFiles.release(state.destinationLease);state.destinationLease=null;
}
async function withDestination(target,{copy=false,adopt=false}={},run){
 const document=registry.context(),state=documentState(),validate=registry.capture(document.id);
 if(state.destinationLease&&state.destinationLease.target!==path.resolve(target)){documentFiles.release(state.destinationLease);state.destinationLease=null;}
 const lease=state.destinationLease?.target===path.resolve(target)?state.destinationLease:await documentFiles.reserve(document.id,target);
 try{
  validate();const destination=await documentFiles.validate(lease,{pin:true});validate();
  if(copy){
   const source=state.current?.sourceTarget||state.current?.target;
   if(source){
    let original;
    try{original=await require('./document-files.cjs').identity(source,{platform:process.platform});}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(original?.keys.some(key=>destination.keys.includes(key)))throw Error('Export to a different file. Your original file was not changed.');
   }
  }
  validate();const saved=await run();validate();
  if(adopt){
   // Keep path ownership immediately after a committed save even if a scanner
   // briefly refuses metadata access; exact alias identity is refreshed below.
   documentFiles.claimPending(document.id,{target:saved.target,keys:lease.keys.filter(key=>key.startsWith('path:'))});
   try{documentFiles.claim(document.id,await require('./document-files.cjs').identity(saved.target,{platform:process.platform}));}
   catch(error){await safety.log('file-error');await safety.log(error?.code);}
  }
  return saved;
 }catch(error){if(error.code==='DOCUMENT_DESTINATION_OPEN')throw Error(t('tabDestinationBusy'));throw error;}
 finally{documentFiles.release(lease);if(state.destinationLease===lease)state.destinationLease=null;}
}
async function prepareDocument(prepare){
 const source=registry.context(),validate=registry.capture(source.id);
 if(captureOptions||!source.state.current)return prepare();
 const document=createSession(source.windowId);
 try{
  const selection=await registry.run(document,prepare);validate();
  document.state.initialSelection=selection;await loadSession(document);return null;
 }catch(error){documentFiles.forget(document.id);if(document.live)tabHost.removeDocument(document);throw error;}
}
async function openFile(filename,{reuse=true}={}){
 const source=registry.context(),validate=registry.capture(source.id);
 let result;
 try{
 result=await documentFiles.open(filename,async file=>{
  if(!reuse||source.state.current)registry.assertCapacity(t('tabLimit'));
  let opened;
  try{opened=await files.read(file.target);}
  catch(error){await safety.log('file-error');await safety.log(error?.code);throw Error(require('./errors.js').openMessage(error,languageInfo?.strings,process.platform));}
  validate();
  const after=await require('./document-files.cjs').identity(file.target,{platform:process.platform});
  if(!file.keys.every(key=>after.keys.includes(key)))throw Error('The file changed while opening. Choose it again.');
  validate();
  const document=reuse&&!source.state.current?source:createSession(source.windowId);
  try{
   const selection=await registry.run(document,()=>select(file.target,opened));validate();
   if(document!==source){document.state.initialSelection=selection;await loadSession(document);}
   return {documentId:document.id,selection};
  }catch(error){if(document!==source&&document.live)tabHost.removeDocument(document);throw error;}
 });
 }catch(error){if(error.code==='DOCUMENT_LIMIT')throw Object.assign(Error(t('tabLimit')),{code:error.code});if(error.code==='DOCUMENT_DESTINATION_OPEN')throw Error(t('tabDestinationBusy'));if(error?.code){await safety.log('file-error');await safety.log(error.code);throw Error(require('./errors.js').openMessage(error,languageInfo?.strings,process.platform));}throw error;}
 validate();
 const document=registry.document(result.documentId),owner=registry.window(document.windowId);
 registry.activate(document.id);owner.window.show();owner.window.focus();
 return !result.existing&&document===source?result.selection:null;
}
const CLOSE_SAVE_TIMEOUT=30000;
function settleClose(document,result){
 const state=document.state,resolve=state.closeResolve;
 clearTimeout(state.closeSaveTimer);state.closeSaveTimer=null;
 state.closeResolve=null;state.closePromise=null;state.closePending=false;state.waitingSave=false;state.closeAttempt=null;document.closing=false;
 if(document.live&&!document.contents.isDestroyed()){
  try{document.contents.send('eo:action','resume-close');registry.changed(document.windowId);}catch{void safety.log('close-notification-failure');}
 }
 resolve?.(result);return result;
}
function waitForCloseSave(document){
 const state=document.state,attempt=state.closeAttempt;
 clearTimeout(state.closeSaveTimer);
 state.closeSaveTimer=setTimeout(()=>{
  if(state.closeAttempt!==attempt||!state.waitingSave)return;
  if(!document.live||document.contents.isDestroyed()){settleClose(document,true);return;}
  // Release only this close attempt. A still-running atomic write keeps its
  // own busy/rollback protection, and a late save acknowledgement cannot close.
  settleClose(document,false);
  try{
   void registry.run(document,()=>dialog.showMessageBox(documentWindow(),{type:'warning',title:'ElixirOffice',message:t('tabSaveWaitTimeout'),buttons:['OK'],defaultId:0,cancelId:0})).catch(()=>safety.log('close-save-timeout-dialog'));
  }catch{void safety.log('close-save-timeout-dialog');}
 },CLOSE_SAVE_TIMEOUT);
 state.closeSaveTimer.unref?.();
}
function pauseCloseSave(document){
 const state=document.state;
 clearTimeout(state.closeSaveTimer);state.closeSaveTimer=null;
 return state.closePending&&state.waitingSave?state.closeAttempt:null;
}
function finishCloseSaveChooser(document,attempt,selected){
 const state=document.state;
 if(typeof attempt!=='string'||state.closeAttempt!==attempt||!state.closePending||!state.waitingSave)return;
 if(selected)waitForCloseSave(document);
 else settleClose(document,false);
}
function matchesCloseAttempt(attemptId){
 const state=documentState();
 return typeof attemptId==='string'&&state.closeAttempt===attemptId&&state.closePending&&state.waitingSave;
}
function closeDocument(document){
 if(!document.live||document.contents.isDestroyed())return Promise.resolve(true);
 return registry.run(document,()=>{
  const state=documentState();if(state.moving)return Promise.resolve(false);if(state.closePromise)return state.closePromise;
  const owner=registry.window(document.windowId);
  if(registry.documents(owner.id).some(other=>other!==document&&other.closing))return Promise.resolve(false);
  registry.activate(document.id);
  state.closeAttempt=crypto.randomUUID();state.closePending=true;document.closing=true;registry.changed(document.windowId);
  state.closePromise=new Promise(resolve=>{state.closeResolve=resolve;});
  performClose(document).catch(()=>{if(document.live)closeReason('dialog-failure');settleClose(document,false);}).finally(()=>{
   if(owner.writeBarrier){owner.writeBarrier=false;files.resumeWrites();}
  }).catch(()=>{settleClose(document,false);void safety.log('window-close-failure');});
  return state.closePromise;
 });
}
async function performClose(document){
 const validate=registry.capture(document.id);
 try{
  const state=await rendererState();validate();
  if(documentState().busy||state.opening)throw Error('close-busy');
  await closeDeadline(preferences.flush());validate();
  const confirmed=await rendererState(false);validate();
  if(documentState().busy||confirmed.opening)throw Error('close-busy');
  documentState().dirty=confirmed.dirty===true;title();
  if(!documentState().dirty){
   if(documentState().current)await closeDeadline(recovery.remove(documentState().current.recoveryId||documentState().current.token));
   validate();await finishClose();return;
  }
  const result=await dialog.showMessageBox(documentWindow(),decisions.unsaved(t,true,documentState().current?.name,process.platform));validate();
  if(result.response===0){documentState().waitingSave=true;waitForCloseSave(document);docContents().send('eo:action','save-close',{attemptId:documentState().closeAttempt});return;}
  if(decisions.discard(result,true,process.platform)){
   if(documentState().current){documentState().current.recoveryVersion=(documentState().current.recoveryVersion||0)+1;await closeDeadline(recovery.remove(documentState().current.recoveryId||documentState().current.token));}
   validate();await finishClose();return;
  }
  settleClose(document,false);
 }catch(error){
  clearTimeout(document.state.closeSaveTimer);document.state.closeSaveTimer=null;document.state.waitingSave=false;
  if(!document.live||document.contents.isDestroyed()){settleClose(document,true);return;}
  closeReason(error.message==='close-busy'?'busy-choice':'state-or-cleanup-failure');
  documentWindow().show();
  const result=await dialog.showMessageBox(documentWindow(),decisions.busy(t,documentState().current?.name));validate();
  if(result.response===1){await cancelRendererOperation();validate();await finishClose();}
  else settleClose(document,false);
 }
}
function closeWindow(owner){
 if(owner.closePromise)return owner.closePromise;
 owner.closeAllPending=true;
 owner.closePromise=(async()=>{
  for(const id of [...owner.documents]){
   let document;
   try{document=registry.document(id);}catch{
    const unavailable=registry.remove(id);
    if(unavailable){
     try{releaseSession(unavailable);settleClose(unavailable,true);owner.window.contentView.removeChildView(unavailable.view);}
     catch{void safety.log('window-close-failure');}
    }
    continue;
   }
   try{if(!await closeDocument(document)&&document.live&&!document.contents.isDestroyed())return false;}
   catch{
    if(!document.live||document.contents.isDestroyed())continue;
    settleClose(document,false);void safety.log('window-close-failure');return false;
   }
  }
  if(!owner.window.isDestroyed()){owner.allowClose=true;owner.window.destroy();}
  return true;
 })().catch(()=>{owner.allowClose=false;void safety.log('window-close-failure');return false;}).finally(()=>{owner.closePromise=null;owner.closeAllPending=false;});
 return owner.closePromise;
}
let quitPending;
function quitApplication(){
 if(quitPending)return quitPending;
 quitPending=(async()=>{
  for(const owner of registry.windows())if(!await closeWindow(owner))return false;
  appClosing=true;app.quit();return true;
 })().catch(()=>{appClosing=false;void safety.log('application-quit-failure');return false;}).finally(()=>{quitPending=null;});
 return quitPending;
}

function authorize(event) {
 if(safety.failed)throw Error(t('fatalMessage'));
 return registry.authorizeDocument(event);
}
function persist(){return preferences.save(settings)}

function title(){
 const document=registry.context(),owner=registry.window(document.windowId);
 registry.update(document.id,{name:documentState().current?.name||'',dirty:documentState().dirty});
 if(owner.activeId===document.id)owner.window.setTitle((documentState().dirty?'* ':'')+(documentState().current?.name?documentState().current.name+' — ':'')+'ElixirOffice');
}

function finishClose(){
 const document=registry.context(),state=documentState(),validate=registry.capture(document.id);
 if(state.finishClosePending)return state.finishClosePending;
 state.finishClosePending=(async()=>{
  const token=state.current?.token;
  for(const warning of files.writeWarnings()){
   const scope=JSON.parse(warning.key)[0];if(!token||scope!==token)continue;
   const error={rollbackUncertain:true,message:'SAVE_RESTORE_UNCERTAIN:'+JSON.stringify(warning.backupName)};
   await dialog.showMessageBox(documentWindow(),{type:'warning',title:'ElixirOffice',message:require('./errors.js').message(error,languageInfo?.strings),buttons:[t('close')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
   validate();files.acknowledgeWriteWarning(warning.key);
  }
  await files.cleanupBackups();validate();await saveDiagnostics.flush();validate();
  const owner=registry.window(document.windowId);state.closing=true;
  releaseSession(document);tabHost.removeDocument(document);settleClose(document,true);
  if(!owner.documents.length){
   if(process.platform!=='darwin'||owner.closeAllPending){owner.allowClose=true;owner.window.destroy();}
   else await loadSession(createSession(owner.id));
  }
 })().finally(()=>{state.finishClosePending=null;});
 return state.finishClosePending;
}
let closeLogWrite=Promise.resolve();
function closeReason(reason) {
  // Fixed reason codes only; serialize writes and retain at most 64 KiB.
  closeLogWrite=closeLogWrite.then(async()=>{
    const flags=require('node:fs').constants;
    const handle=await fs.open(path.join(app.getPath('userData'),'desktop-close.log'),flags.O_WRONLY|flags.O_CREAT|flags.O_APPEND|flags.O_NOFOLLOW,0o600);
    try{
      await handle.chmod(0o600);
      const line=Buffer.from(new Date().toISOString()+' '+reason+'\n');
      if((await handle.stat()).size+line.length>64*1024)await handle.truncate(0);
      await handle.write(line);
    }finally{await handle.close()}
  }).catch(async error=>{await safety.log('font-list-error');await safety.log(error?.code);});
  return closeLogWrite;
}
async function closeDeadline(work,deadline=Date.now()+3000) {
  let timer;
  try{return await Promise.race([work,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Close state unavailable')),Math.max(0,deadline-Date.now()))})])}
  finally{clearTimeout(timer)}
}
async function cancelRendererOperation(){
  const deadline=Date.now()+3000,token=documentState().current?.token;
  const owner=registry.window(registry.context().windowId);
  const lastDocument=registry.windows().reduce((count,item)=>count+item.documents.length,0)===1;
  const stopAll=lastDocument&&(owner.closeAllPending||process.platform!=='darwin');
  if(stopAll)owner.writeBarrier=true;
  const settled=stopAll?files.cancelPending({deadline}):token?files.cancelPending({scope:token,deadline}):Promise.resolve(0);
  try{await closeDeadline(docContents().executeJavaScript('globalThis.EODesktopCancelOperation?.()'),deadline);}
  catch{closeReason('operation-cancel-unavailable');}
  // A timeout keeps the window alive; rollback/backup cleanup must settle first.
  await closeDeadline(settled,deadline);
}
async function savedTarget(id){
  try{return await documentState().artifacts.resolve(id,documentState().current?.token);}
  catch{throw Error('Saved file unavailable');}
}
async function rendererState(lock=true) {
  const state=await closeDeadline(docContents().executeJavaScript('globalThis.EODesktopState ? globalThis.EODesktopState(false) : {dirty:true,opening:true}'));
  if(lock)docContents().send('eo:action','prepare-close');return state;
}
async function discard(allowSave=false) {
  if(!documentState().current)return true;
  try{
  const state=await rendererState();
  if(state.opening)throw Error('Wait for the document to finish opening');
  documentState().dirty=state.dirty===true;
        await preferences.flush();
  if(allowSave){const confirmed=await rendererState(false);if(confirmed.opening)throw Error('Wait for the document to finish opening');documentState().dirty=confirmed.dirty===true;}
  if(!documentState().dirty){if(documentState().current)await recovery.remove(documentState().current.recoveryId||documentState().current.token);return true;}
  const result=await dialog.showMessageBox(documentWindow(),decisions.unsaved(t,allowSave,documentState().current?.name,process.platform));
  // Choose the shared destination-ticket path before saving a document without a target.
  if(allowSave&&result.response===0)return documentState().current.target?'save':'save-as';
  const discarded=decisions.discard(result,allowSave,process.platform);
  if(discarded&&documentState().current){documentState().current.recoveryVersion=(documentState().current.recoveryVersion||0)+1;await recovery.remove(documentState().current.recoveryId||documentState().current.token);}
  return discarded;
  }finally{docContents().send('eo:action','resume-close')}
}
async function remember(target) {
  settings.recents=settings.recents.filter(item=>item.target!==target);
  settings.recents.unshift({id:crypto.randomUUID(),target,name:path.basename(target)});settings.recents=settings.recents.slice(0,15);
  try{await persist();return true}
  catch(error){await safety.log('file-error');await safety.log(error?.code);return false}
}
async function select(filename,prepared) {
  let opened;
  try{opened=prepared||await files.read(filename)}
  catch(error){
    await safety.log('file-error');await safety.log(error?.code);
    throw Error(require('./errors.js').openMessage(error,languageInfo?.strings,process.platform));
  }
  const {bytes,...metadata}=opened;
  const sourceFormat=files.extension(opened.target),format=require('./formats.cjs').canonical[sourceFormat]||sourceFormat;
  documentState().artifacts.clear();clearDestination();
  documentState().current={...metadata,sourceTarget:opened.target,token:crypto.randomUUID(),name:path.basename(opened.target),format,sourceFormat};
  documentState().current.protected=password.encrypted(bytes,sourceFormat);documentState().current.recoveryLocked=documentState().current.protected;
  if(format!==sourceFormat){documentState().current.target=null;documentState().current.name=path.basename(opened.target).replace(/\.[^.]+$/,'.'+format)}
  documentState().dirty=false;title();await remember(opened.target);
  return {token:documentState().current.token,name:documentState().current.name,bytes:new Uint8Array(bytes),format:documentState().current.format,sourceFormat,runtime:conversionRuntime};
}
let homeFontDiscovery,homeFontGeneration;
function discoverFontsInBackground(){
 const generation=fonts.generation||0;
 if(homeFontDiscovery&&homeFontGeneration===generation)return;
 homeFontGeneration=generation;
 homeFontDiscovery=fonts.index();
 homeFontDiscovery.then(()=>{
  if(!captureOptions&&settings.fontConsent===true&&generation===(fonts.generation||0)&&win&&!win.isDestroyed())
   for(const owner of registry.windows())for(const document of registry.documents(owner.id))document.contents.send('eo:action','font-index-ready');
 }).catch(()=>{});
}
function templateFonts(templates,language){
 if(!templates.some(template=>template.systemLocales?.includes(language))||captureOptions||settings.fontConsent!==true)return {};
 const index=fonts.peek();
 if(index)return {index};
 discoverFontsInBackground();
 return {};
}
function active(token) { if(!documentState().current||typeof token!=='string'||documentState().current.token!==token)throw Error('No active document handle'); }
function output(input,pdf=false) {
  if(!(input instanceof Uint8Array)||input.byteLength>512*1024*1024)throw Error('Invalid document output');
  const bytes=Buffer.from(input);
  if(pdf ? bytes.subarray(0,5).toString()!=='%PDF-' : bytes[0]!==80||bytes[1]!==75)throw Error('Invalid document output');
  return bytes;
}
async function operation(run){
 const state=documentState(),command=registry.command();
 if(state.closePending&&command==='recovery-save')return false;
 if(state.busy||state.moving)throw Error('Another file operation is running');
 const closeSave=['save','save-as-choose','save-as-info','save-as-cancel','password-lock','recovery-clear','export','pdf'];
 if(state.closePending&&!(state.waitingSave&&closeSave.includes(command)))throw Error('Document close is pending');
 const validate=registry.capture(registry.context().id);
 state.busy=true;try{const result=await run();validate();return result;}catch(error){if(['save','save-as-choose','export','pdf','rename'].includes(command))clearDestination();if(error.code==='DOCUMENT_DESTINATION_OPEN')throw Error(t('tabDestinationBusy'));throw error;}finally{state.busy=false;}
}
function operationStage(scope,id,phase){
 if(typeof id==='string'&&/^local-operation-[0-9]+$/.test(id))docContents().send('eo:operation-stage',{scope,id,phase});
}
async function takeDestination(ticket,format,route){
  try{return await documentState().destinations.take(ticket,documentState().current,format,route)}
  catch(error){if(error.code==='SAVE_AS_SELECTION')throw Error(t('saveDestinationChanged'));throw error;}
}
function handle(name,run){
 ipcMain.handle('eo:'+name,(event,...args)=>{
  const document=authorize(event);
  return registry.run(document,async()=>{
   try{return await run(...args);}
   catch(error){if(/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||'')){await safety.log('file-error');await safety.log(error.code);}throw error;}
  },name);
 });
}
async function start() {
  saveDiagnostics=require('./save-diagnostics.cjs').create(()=>app.getPath('userData'),{version:app.getVersion(),electron:process.versions?.electron,node:process.versions?.node,platform:process.platform,windowsBuild:require('node:os').release()});
  files.setDiagnostics(event=>saveDiagnostics.record(event));
  await printer.cleanup().catch(()=>safety.log('print-cleanup-failure'));
  preferences=require('./settings-store.cjs')(app.getPath('userData'));
  recovery=new (require('./recovery.cjs').Recovery)(app.getPath('userData'));
  const preferred=captureOptions?captureOptions.locales:[...(app.getPreferredSystemLanguages?.()||[]),app.getLocale()];
  languageInfo=await locale.load(assets,preferred);
  let buildIdentity;
  try{buildIdentity=require('./build-identity.cjs').validate(JSON.parse(await fs.readFile(path.join(__dirname,'build-info.json'),'utf8')));}
  catch(error){if(app.isPackaged||error.code!=='ENOENT')throw error;}
  const aboutText=buildIdentity?require('./build-identity.cjs').label(buildIdentity):'Development';
  app.setAboutPanelOptions(buildIdentity?require('./build-identity.cjs').aboutOptions(buildIdentity):{applicationName:'ElixirOffice',applicationVersion:aboutText});
  const showAbout=()=>process.platform==='darwin'?app.showAboutPanel():dialog.showMessageBox(documentWindow(),{type:'info',title:t('about')+' ElixirOffice',message:'ElixirOffice',detail:aboutText,buttons:['OK'],defaultId:0,cancelId:0});

  if(captureOptions&&captureOptions.locales.some(value=>!languageInfo.supported.includes(value)))throw Error('Unsupported capture locale');

  try{settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'desktop-settings.json'),'utf8'));settings.recents=require('./recent-files.cjs').normalize(settings.recents);settings.fontConsent=settings.fontConsent===true;}
  catch(error){if(error.code!=='ENOENT')throw error}
  settings=require('./font-preferences.cjs').migrate(settings,{capture:!!captureOptions});
  if(!captureOptions)await persist();
  const manifestBytes=await fs.readFile(path.join(assets,'desktop-manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  if(!/^[a-zA-Z0-9-]+$/.test(manifest.conversion.artifact_version))throw Error('Invalid bundled conversion runtime');
  conversionRuntime=resources.ORIGIN+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+manifest.conversion.artifact_version+'/';
  const assetIdentity=crypto.createHash('sha256').update(manifestBytes).digest('hex').slice(0,16);
  fonts.configure({cacheDir:path.join(app.getPath('userData'),'font-index'),bundled:assets,bundleIdentity:assetIdentity});
  const ses=session.fromPartition((captureOptions?'elixiroffice-capture-':'persist:elixiroffice-desktop-')+assetIdentity);
  ses.protocol.handle(resources.SCHEME,await resources.createHandler(assets,__dirname,resources.createFileFetch({net,session,capture:!!captureOptions,identity:assetIdentity})));
  ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*','file://*/*']},(_details,callback)=>callback({cancel:true}));
  ses.setPermissionCheckHandler(()=>false);
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ses.on('will-download',event=>event.preventDefault());
  tabHost=require('./tabs-host.cjs').createTabHost({
   BrowserWindow,WebContentsView,ipcMain,registry,platform:process.platform,session:ses,root:__dirname,shellURL:resources.ORIGIN+'/tabs.html',
   strings:localizedStrings,language:()=>languageInfo.language,direction:()=>['ar','he','ur'].includes(languageInfo.language)?'rtl':'ltr',
   actions:{
    windowCreated:installShellShortcuts,
    detach:document=>moveSession(document),moveMenu:showMoveMenu,beginDrag:beginTabDrag,finishDrag:finishTabDrag,
    create:async owner=>{const document=createSession(owner.id);await loadSession(document);return document.id;},
    close:closeDocument,closeWindow,destroyed:document=>{releaseSession(document);settleClose(document,false);},failure:()=>safety.log('window-close-failure')
   }
  });
  const owner=tabHost.createWindow();win=owner.window;await owner.ready;
  const initialDocument=createSession(owner.id,{pending:pendingPaths.splice(0)});
  await registry.run(initialDocument,async()=>{
  handle('identity',()=>({documentId:registry.context().id,windowId:registry.context().windowId}));
  handle('desktop-ready',()=>{const document=registry.context();registry.status(document.id,'ready');if(pendingLimitNotice)showTabLimit(document);return true;});
  handle('move-menu',()=>showMoveMenu(registry.context()));
  handle('close-tab',()=>{if(captureOptions)throw Error('Capture mode unavailable');return closeDocument(registry.context());});
  handle('close-cancelled',attemptId=>matchesCloseAttempt(attemptId)?settleClose(registry.context(),false):false);
  handle('initial',()=>operation(async()=>{
    documentState().ready=true;if(documentState().initialSelection){const selected=documentState().initialSelection;documentState().initialSelection=null;return selected;}if(!documentState().pending.length)return null;
    const selected=await openFile(documentState().pending.shift());return {...selected,morePending:documentState().pending.length>0};
  }));
  handle('author',()=>typeof settings.author==='string'&&settings.author.trim()?settings.author:'ElixirOffice');
  handle('author-save',async value=>{if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f]/.test(value))throw Error('Invalid author name');settings.author=value.trim();await persist();return settings.author;});
  handle('help',()=>help());
  handle('about',()=>showAbout());
  handle('quit',()=>quitApplication());
  // Authorized top-frame action, with no renderer-supplied clipboard text.
  handle('copy-save-diagnostics',async()=>{await saveDiagnostics.flush();clipboard.writeText(saveDiagnostics.text());return true;});
  handle('locale',async()=>({...languageInfo,strings:localizedStrings(),capture:!!captureOptions}));
  handle('capture-locale',async language=>{
    if(!captureOptions||!captureOptions.locales.includes(language))throw Error('Capture locale unavailable');
    languageInfo=await locale.load(assets,[language]);return {...languageInfo,strings:localizedStrings(),capture:true};
  });
  handle('home',async()=>{
    const recents=await require('./recent-files.cjs').metadata(settings.recents,async error=>{
      await safety.log('file-error');await safety.log(error?.code);
    });
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    const fontOptions=await templateFonts(templates,languageInfo.language);
    return {templates:templates.map(item=>require('./templates.cjs').resolve(item,languageInfo.language,fontOptions)),recents};
  });
  handle('return-home',()=>operation(async()=>{
    const decision=await discard(true);if(decision!==true)return decision;
    releaseSession(registry.context());clearDestination();documentState().current=null;documentState().dirty=false;title();return true;
  }));
  handle('template',id=>operation(()=>prepareDocument(async()=>{
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    const selected=templates.find(item=>item.id===id);if(!selected)throw Error('Unknown template');
    const fontOptions=await templateFonts([selected],languageInfo.language);
    const template=require('./templates.cjs').resolve(selected,languageInfo.language,fontOptions);
    const bytes=await fs.readFile(path.join(assets,'desktop-home/templates',template.file));
    clearDestination();documentState().current={token:crypto.randomUUID(),name:(template.title||t(template.titleKey))+'.'+template.format,format:template.format,target:null};documentState().dirty=false;title();
    return {token:documentState().current.token,name:documentState().current.name,format:documentState().current.format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  })));
  handle('open',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode uses generated documents only');
    const result=await dialog.showOpenDialog(documentWindow(),{title:t('open'),properties:['openFile'],filters:[{name:t('file'),extensions:files.formats}]});
    return result.canceled?null:openFile(result.filePaths[0]);
  }));
  handle('drop',filename=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');if(typeof filename!=='string'||!filename)throw Error('Drop a file from this computer');return openFile(filename)}));
  handle('saved-open',(id)=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    const target=await savedTarget(id);
    await savedTarget(id);return openFile(target);
  }));
  handle('saved-show',async id=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    const target=await savedTarget(id);shell.showItemInFolder(target);return true;
  });
  handle('recents',()=>settings.recents.map(({id,name})=>({id,name})));
  handle('recent',id=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');const file=settings.recents.find(item=>item.id===id);if(!file)throw Error('Unknown recent file');return openFile(file.target)}));
  handle('new',format=>operation(()=>prepareDocument(async()=>{
    if(!['docx','xlsx','pptx'].includes(format))throw Error('Unsupported template');
    const bytes=await fs.readFile(format==='docx'?path.join(assets,'desktop-home/blanks',languageInfo.language+'.docx'):path.join(assets,'templates','new.'+format));
    clearDestination();documentState().current={token:crypto.randomUUID(),name:t('untitled')+'.'+format,format,target:null};documentState().dirty=false;title();
    return {token:documentState().current.token,name:documentState().current.name,format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  })));
  handle('state',(token,modified)=>{if(!documentState().current||token!==documentState().current.token)return false;documentState().dirty=modified===true;title();return true});
  handle('rename',(token,name)=>operation(async()=>{
    active(token);if(captureOptions)throw Error('Rename is unavailable in capture mode');
    if(documentState().current.target){
      const previous=documentState().current.target;
      const target=path.join(path.dirname(previous),files.renameName(name,path.extname(previous)));
      const {bytes,...renamed}=await withDestination(target,{adopt:true},()=>files.rename(documentState().current,name));
      documentState().current={...documentState().current,...renamed,sourceTarget:renamed.target};
      settings.recents=settings.recents.filter(item=>item.target!==previous);
      await remember(documentState().current.target);
    }else documentState().current.name=files.renameName(name,'.'+documentState().current.format);
    documentState().current.recoveryVersion=(documentState().current.recoveryVersion||0)+1;title();
    return {name:documentState().current.name,recoveryVersion:documentState().current.recoveryVersion};
  }));
  handle('password-lock',async token=>{
    active(token);const collided=documentState().busy,version=await password.lock(documentState().current,recovery);active(token);
    if(collided)throw Error('Another file operation is running');return {recoveryVersion:version};
  });
  handle('save',(token,input,as,protection,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);if(documentState().current.format==='pdf'&&protection?.protected)throw Error('PDF password protection is unavailable');const bytes=documentState().current.format==='pdf'?output(input,documentState().current.format):password.validate(input,documentState().current.format,protection||{protected:documentState().current.protected===true,remove:false},documentState().current);let target=documentState().current.target,copy=false;
    const selected=ticket?await takeDestination(ticket,documentState().current.format,'save'):null;
    try{packageGuard.protect(bytes,documentState().current.format,documentState().current.embeddedObjects)}
    catch(error){
      if(error.code!=='OBJECT_LOSS')throw error;
      operationStage(token,operationId,'awaiting-user');
      const result=await dialog.showMessageBox(documentWindow(),{type:'warning',message:t('objectsWarning'),detail:t('saveError'),buttons:[t('cancel'),t('saveCopy')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
      if(result.response!==1)throw Error('Save cancelled: embedded objects could not be preserved');
      copy=true;
    }
    if(selected&&!copy)target=selected.target;
    else if(as||!target||copy){
      const defaultPath=copy?(target||documentState().current.name).replace(/\.[^.]+$/, '-copy.'+documentState().current.format):(target||documentState().current.name);
      operationStage(token,operationId,'awaiting-user');
      const closingDocument=registry.context(),closingAttempt=pauseCloseSave(closingDocument);let destinationSelected=false;
      try{
       const result=await dialog.showSaveDialog(documentWindow(),{defaultPath,filters:[{name:t('file'),extensions:[documentState().current.format]}]});
       if(result.canceled)throw Error('Save cancelled');target=result.filePath;
       if(files.extension(target)!==documentState().current.format)throw Error('Save with the current document extension');
       destinationSelected=true;
      }finally{finishCloseSaveChooser(closingDocument,closingAttempt,destinationSelected)}
    }
    if(copy&&documentState().current.target){
      if(path.resolve(target)===documentState().current.target)throw Error('Save the copy to a different file. Your original file was not changed.');
      try{
        const destination=await fs.lstat(target);
        if(destination.dev===documentState().current.device&&destination.ino===documentState().current.inode)throw Error('Save the copy to a different file. Your original file was not changed.');
        const original=await fs.lstat(documentState().current.target);
        if(destination.dev===original.dev&&destination.ino===original.ino)throw Error('Save the copy to a different file. Your original file was not changed.');
      }catch(error){if(error.code!=='ENOENT')throw error}
    }
    operationStage(token,operationId,'writing');
    const saved=await withDestination(target,{adopt:true},()=>password.write(files,target,bytes,selected&&!copy?selected.state||{absent:true}:!as&&!copy&&documentState().current.target?documentState().current:undefined,writeOptions));
    documentState().current={...documentState().current,...saved,sourceTarget:target,sourceFormat:documentState().current.format,protected:password.encrypted(bytes,documentState().current.format),name:path.basename(target),embeddedObjects:['odt','ods','odp'].includes(documentState().current.format)?packageGuard.embeddedObjects(bytes):0};const preferencesSaved=await remember(target);title();
    documentState().current.recoveryVersion=(documentState().current.recoveryVersion||0)+1;
    return {artifactId:documentState().artifacts.register(saved,documentState().current.token),name:documentState().current.name,bytes:saved.bytes,recoveryVersion:documentState().current.recoveryVersion,preferencesSaved,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('write-cancel',async(token,id)=>{
    active(token);
    if(typeof id!=='string'||!/^local-operation-[0-9]+$/.test(id))throw Error('Invalid save operation');
    return (await files.cancelPending({scope:token,id,deadline:Date.now()+3000}))>0;
  });
  handle('save-as-info',token=>{
    active(token);
    return {formats:saveAs.choices(documentState().current).map(value=>({value,name:t(saveAs.labels[value]),description:t(saveAs.labels[value]+'Desc')})),
      defaultFormat:saveAs.preferred(documentState().current),nativeFormats:saveAs.nativeFormats(process.platform,process.env.EO_NATIVE_SAVE_AS==='1'),platform:process.platform};
  });
  handle('save-as-cancel',token=>{active(token);clearDestination();return true});
  handle('save-as-choose',(token,format,pdfCopy=false)=>operation(async()=>{
    active(token);clearDestination();
    const closingDocument=registry.context(),closingAttempt=pauseCloseSave(closingDocument);let destinationSelected=false;
    try{
     if(captureOptions)throw Error('Save As is unavailable in capture mode');
     const multi=saveAs.nativeFormats(process.platform,process.env.EO_NATIVE_SAVE_AS==='1');
     if(!multi&&!saveAs.available(documentState().current).includes(format))throw Error('Choose a Save As format');
     if(typeof pdfCopy!=='boolean')throw Error('Invalid PDF copy selection');
     let defaultPath=saveAs.suggestion(documentState().current,format||saveAs.preferred(documentState().current),t('saveCopy'));
     for(;;){
      const result=await dialog.showSaveDialog(documentWindow(),{title:t('saveAs'),defaultPath,
        filters:saveAs.filters(documentState().current,t,multi?undefined:format),properties:['showOverwriteConfirmation']});
      active(token);if(result.canceled)return null;
      let selectedFormat;
      try{selectedFormat=saveAs.extension(result.filePath,documentState().current,multi?undefined:format)}
      catch(error){
        if(error.code!=='SAVE_AS_EXTENSION')throw error;
        await dialog.showMessageBox(documentWindow(),{type:'warning',message:t('saveError'),
          detail:t('saveFormat')+': '+(multi?saveAs.available(documentState().current):[format]).map(value=>'*.'+value).join(', '),
          buttons:[t('ok')],defaultId:0,cancelId:0});
        active(token);defaultPath=result.filePath;continue;
      }
      const route=selectedFormat==='pdf'&&(documentState().current.format!=='pdf'||pdfCopy)?'pdf':selectedFormat===documentState().current.format?'save':'export';
      if(route==='pdf')await require('./pdf-policy.cjs').assertCopyDestination(documentState().current,result.filePath);
      documentState().destinationLease=await documentFiles.reserve(registry.context().id,result.filePath);
      const selected=await documentState().destinations.issue(documentState().current,result.filePath,selectedFormat,route);
      active(token);
      // GTK overwrite prompts vary with the native backend. Bind an explicit
      // Linux confirmation to the destination snapshot before conversion.
      if(process.platform==='linux'&&documentState().destinations.pending.state){
        const accepted=await dialog.showMessageBox(documentWindow(),{type:'warning',message:t('saveReplace'),detail:path.basename(result.filePath),
          buttons:[t('cancel'),t('replace')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
        active(token);if(accepted.response!==1){clearDestination();return null;}
      }
      const warning=saveAs.warning(documentState().current,selectedFormat);
      if(warning){
        const accepted=await dialog.showMessageBox(documentWindow(),{type:'warning',message:t(warning),
          buttons:[t('cancel'),t('saveCopy')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
        active(token);if(accepted.response!==1){clearDestination();return null;}
      }
      if(route==='pdf'&&!await require('./pdf-policy.cjs').confirmCopy(documentState().current,dialog,documentWindow(),t)){clearDestination();return null;}
      active(token);destinationSelected=true;return selected;
     }
    }finally{finishCloseSaveChooser(closingDocument,closingAttempt,destinationSelected)}
  }));
  handle('export-formats',token=>{active(token);return require('./formats.cjs').exports[require('./formats.cjs').kind(documentState().current.format)]});
  handle('export',(token,input,format,protection,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);const formats=require('./formats.cjs');
    if(!formats.exports[formats.kind(documentState().current.format)]?.includes(format)||format==='pdf')throw Error('Unsupported export format');
    if(documentState().current.protected&&protection?.protected!==true&&protection?.remove!==true)throw Error('Confirm an unprotected export copy');
    const bytes=['docx','xlsx','pptx','odt','ods','odp'].includes(format)?password.validate(input,format,protection||{protected:false,remove:false},documentState().current):formats.output(input,format);
    if(['odt','ods','odp'].includes(format))packageGuard.protect(bytes,format,documentState().current.embeddedObjects);
    if(!ticket)operationStage(token,operationId,'awaiting-user');
    const selected=ticket?await takeDestination(ticket,format,'export'):null;
    const result=selected?{filePath:selected.target}:await dialog.showSaveDialog(documentWindow(),{defaultPath:saveAs.suggestion(documentState().current,format,t('saveCopy')),filters:saveAs.filters(documentState().current,t,format)});
    if(result.canceled)throw Error('Save cancelled');
    if(files.extension(result.filePath)!==format)throw Error('Choose the selected format extension');
    if(documentState().current.target){
      if(path.resolve(result.filePath)===documentState().current.target)throw Error('Export to a different file');
      try{const stat=await fs.stat(result.filePath);if(stat.dev===documentState().current.device&&stat.ino===documentState().current.inode)throw Error('Export to a different file');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    operationStage(token,operationId,'writing');
    const saved=await withDestination(result.filePath,{copy:true},()=>files.atomic(result.filePath,bytes,selected?(selected.state||{absent:true}):undefined,writeOptions));
    return {artifactId:documentState().artifacts.register(saved,documentState().current.token),name:path.basename(saved.target),bytes:saved.bytes,format,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('recovery-failure',()=>safety.log('recovery-failure').then(()=>true));
  handle('window-options',()=>({
    customTitleBar:settings.customTitleBar===true,
    // No native overlay platform has completed the required interaction gates yet.
    customTitleBarAvailable:false,effectiveFrame:'native'
  }));
  handle('window-settings',async value=>{
    if(!value||typeof value.customTitleBar!=='boolean')throw Error('Invalid window settings');
    if(value.customTitleBar&&settings.customTitleBar!==true)throw Error(t('nativeTitleBarUnavailable'));
    settings.customTitleBar=value.customTitleBar;await persist();return true;
  });
  handle('recovery-options',()=>({enabled:settings.recoveryEnabled!==false,seconds:[15,30,60,120,300].includes(settings.recoverySeconds)?settings.recoverySeconds:60}));
  handle('recovery-settings',async(value)=>{
    if(!value||typeof value.enabled!=='boolean'||![15,30,60,120,300].includes(value.seconds))throw Error('Invalid recovery settings');
    settings.recoveryEnabled=value.enabled;settings.recoverySeconds=value.seconds;await persist();return true;
  });
  handle('recovery-list',()=>captureOptions?[]:recovery.list());
  handle('recovery-offer',async()=>{
    if(captureOptions||recoveryOffered)return [];
    recoveryOffered=true;
    try{return await recovery.list();}
    catch(error){recoveryOffered=false;throw error;}
  });
  handle('recovery-save',(token,version,input)=>operation(()=>files.scoped({scope:token,id:'recovery-'+version},async writeOptions=>{
    active(token);
    if(documentState().current.format==='pdf')return false;
    if(captureOptions||documentState().closing||documentState().closePending||settings.recoveryEnabled===false||documentState().current.recoveryLocked)return false;
    if(version!==(documentState().current.recoveryVersion||0))return false;
    const state=await rendererState(false);if(state.opening||!state.dirty||documentState().current.recoveryLocked||version!==(documentState().current.recoveryVersion||0))return false;
    const bytes=output(input);packageGuard.protect(bytes,documentState().current.format,documentState().current.embeddedObjects);
    return recovery.save({id:documentState().current.recoveryId||documentState().current.token,name:documentState().current.name,format:documentState().current.format},bytes,writeOptions);
  })));
  handle('recovery-clear',token=>operation(async()=>{
    active(token);const state=await rendererState(false);
    if(state.dirty||state.opening)return false;await recovery.remove(documentState().current.recoveryId||documentState().current.token);return true;
  }));
  handle('recovery-remove',id=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    if(recoveryRestores.has(id)||registry.windows().some(owner=>registry.documents(owner.id).some(document=>document.state.current&&(document.state.current.recoveryId||document.state.current.token)===id)))throw Error(t('tabRecoveryOpen'));
    await recovery.remove(id);return true;
  }));
  handle('recovery-restore',id=>operation(()=>restoreRecovery(id)));
  const ai=require('./ai.cjs'),aiJobs=()=>documentState().aiJobs;
  const cancelAllAI=()=>{for(const owner of registry.windows())for(const document of registry.documents(owner.id))for(const job of document.state.aiJobs.values())job.abort();};
  const publicAI=()=>{if(!settings.ai)return {};const {encryptedKey,...value}=settings.ai;return {...value,hasKey:!!encryptedKey}};
  handle('ai-settings',()=>captureOptions?{}:publicAI());
  handle('ai-configure',value=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode cannot configure AI');
    const config=ai.configuration(value);
    if(!config){cancelAllAI();settings.ai=null;await persist();return {};}
    const selected=ai.endpoint(config.endpoint);
    const result=await dialog.showMessageBox(documentWindow(),{type:'question',message:t('aiConsent'),detail:config.endpoint+'\n\n'+t(selected.local?'aiLocal':'aiRemote'),buttons:decisions.buttons([t('cancel'),t('allow')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1)return false;
    if(value.apiKey){
      const storage=require('electron').safeStorage;
      if(!storage.isEncryptionAvailable()||storage.getSelectedStorageBackend?.()==='basic_text')throw Error('Encrypted AI key storage unavailable');
      config.encryptedKey=storage.encryptString(value.apiKey).toString('base64');
    }else if(config.endpoint===settings.ai?.endpoint)config.encryptedKey=settings.ai.encryptedKey;
    cancelAllAI();settings.ai=config;await persist();return publicAI();
  }));
  handle('ai-request',async(id,body)=>{
    if(captureOptions||!settings.ai?.consented||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||aiJobs().size>=2||aiJobs().has(id))throw Error('AI request unavailable');
    const abort=new AbortController(),config={...settings.ai},jobs=aiJobs();jobs.set(id,abort);
    try{
      const key=config.encryptedKey?require('electron').safeStorage.decryptString(Buffer.from(config.encryptedKey,'base64')):'';
      return await ai.request(config,body,key,abort.signal);
    }finally{jobs.delete(id)}
  });
  handle('ai-cancel',id=>{aiJobs().get(id)?.abort();return true});
  handle('font-choice',async()=>{await preferences.flush();return settings.fontConsent===true?'granted':settings.fontChoice==='declined'?'declined':'unset'});
  handle('font-dismiss',async()=>{settings.fontChoice='declined';await persist();return true});
  handle('font-disable',async()=>{settings.fontChoice='declined';settings.fontConsent=false;fonts.clear();homeFontDiscovery=null;await persist();return true});
  handle('font-permission',async()=>!captureOptions&&settings.fontConsent===true);
  handle('font-consent',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode does not read computer fonts');
    if(settings.fontConsent===true)return true;
    const result=await dialog.showMessageBox(documentWindow(),{type:'question',title:'ElixirOffice',message:t('fontAsk'),detail:t('fontDetail'),buttons:decisions.buttons([t('cancel'),t('allow')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1){settings.fontChoice='declined';await persist();return false;}
    settings.fontChoice='granted';settings.fontConsent=true;await persist();return true;
  }).catch(async error=>{await safety.log('font-consent-error');throw error}));
  handle('fonts',async()=>{
    try{return !captureOptions&&settings.fontConsent===true?await fonts.enumerate():[]}
    catch(error){await safety.log('font-list-error');throw error}
  });
  handle('font-index',async readyOnly=>{
    if(captureOptions||settings.fontConsent!==true)throw Error('Computer fonts are disabled');
    if(readyOnly!==undefined&&typeof readyOnly!=='boolean')throw Error('Invalid font index request');
    const index=fonts.peek();
    if(readyOnly===true&&!index){discoverFontsInBackground();return null;}
    try{return index||await fonts.index()}catch(error){await safety.log('font-list-error');throw error}
  });
  handle('font',async id=>{
    if(captureOptions||settings.fontConsent!==true)throw Error('Font permission required');
    try{return await fonts.read(id)}catch(error){await safety.log('font-read-error');throw error}
  });
  handle('pdf',(token,input,print,plainCopy,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);if(documentState().current.protected&&plainCopy!==true)throw Error('Confirm an unprotected PDF copy');const bytes=output(input,true);
    if(print){operationStage(token,operationId,'awaiting-user');return printer.print(bytes,{parent:documentWindow(),signal:writeOptions.signal,title:t('print')+' PDF'});}
    const policy=require('./pdf-policy.cjs');
    if(!ticket)operationStage(token,operationId,'awaiting-user');
    const selected=ticket?await takeDestination(ticket,'pdf','pdf'):null;
    if(!selected&&!await policy.confirmCopy(documentState().current,dialog,documentWindow(),t))return null;
    const result=selected?{filePath:selected.target}:await dialog.showSaveDialog(documentWindow(),{defaultPath:policy.defaultPath(documentState().current),filters:[{name:'PDF',extensions:['pdf']}]});
    if(result.canceled)return null;
    if(files.extension(result.filePath)!=='pdf')throw Error('Choose a PDF destination');
    await policy.assertCopyDestination(documentState().current,result.filePath);
    operationStage(token,operationId,'writing');
    const saved=await withDestination(result.filePath,{copy:true},()=>files.atomic(result.filePath,bytes,selected?(selected.state||{absent:true}):undefined,writeOptions));
    return {artifactId:documentState().artifacts.register(saved,documentState().current.token),name:path.basename(saved.target),bytes:saved.bytes,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('closed-saved',async attemptId=>{
    if(!matchesCloseAttempt(attemptId))return false;
    const document=registry.context(),validate=registry.capture(document.id);
    // Recheck edits and pending pictures after the save snapshot.
    const state=await rendererState(false);validate();
    if(!matchesCloseAttempt(attemptId))return false;
    documentState().dirty=state.dirty===true;
    if(!documentState().dirty&&!documentState().busy&&!state.opening){
      documentState().waitingSave=false;
      try{await finishClose();return true;}
      catch(error){settleClose(document,!document.live);throw error;}
    }
    return settleClose(document,false);
  });
  const action=name=>()=>dispatchDocumentAction(registry.context(),name);
  const help=async()=>{
    const editor=['xlsx','ods'].includes(documentState().current?.format)?'spreadsheeteditor':['pptx','odp'].includes(documentState().current?.format)?'presentationeditor':'documenteditor';
    const base=path.join(assets,'web-apps/apps',editor,'main/resources/help');
    let language=languageInfo.language;
    try{await fs.access(path.join(base,language,'index.htm'))}catch{language='en'}
    const prefix=resources.ORIGIN+'/example/local-assets/web-apps/apps/'+editor+'/main/resources/help/'+language+'/';
    const helpWindow=new BrowserWindow({parent:documentWindow(),width:1000,height:800,title:'ElixirOffice '+t('help'),webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    if(process.platform!=="darwin")helpWindow.setMenuBarVisibility(false);
    helpWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(prefix))event.preventDefault()});
    await helpWindow.loadURL(prefix+'index.htm');
  };
  showHelpAction=help;showAboutAction=showAbout;
  Menu.setApplicationMenu(Menu.buildFromTemplate(require('./menu.cjs').template(process.platform,name=>()=>withActive(name==='about'?showAbout:action(name)),()=>withActive(()=>help().catch(()=>dialog.showErrorBox(t('help'),t('error')))),t)));
  if(process.platform!=="darwin")win.setMenuBarVisibility(false);

  documentHandlersReady=true;
  await tabHost.loadDocument(initialDocument);registry.activate(initialDocument.id);
  if(captureOptions){
    (async()=>{
      for(let i=0;i<600;i++){if(await docContents().executeJavaScript('!!window.EODesktopCapture'))break;await new Promise(resolve=>setTimeout(resolve,200));if(i===599)throw Error('Capture shell did not become ready')}
      const document=registry.context(),owner=registry.window(document.windowId),validate=registry.capture(document.id);
      const target={webContents:document.contents,window:owner.window,view:document.view,validate:()=>{const live=validate();return [live.id,live.generation,live.windowId,registry.window(live.windowId).revision].join(':')}};
      owner.window.setContentSize(1360,944);await capture.run(target,captureOptions);
    })().then(async()=>{
      documentState().closing=true;win.destroy();try{await cleanupCapture();app.exit(0)}catch(error){console.error('Capture profile cleanup: '+error.message);app.exit(1)}
    },async error=>{
      console.error(error.message);documentState().closing=true;win.destroy();try{await cleanupCapture()}catch{await safety.log('capture-cleanup-failure')}finally{app.exit(1)}
    }).catch(()=>{void safety.log('capture-cleanup-failure');app.exit(1)});
  }

  });
}
app.on('window-all-closed',()=>{if(!captureOptions&&process.platform!=='darwin')app.quit();});
app.on('before-quit',event=>{if(appClosing||captureOptions)return;event.preventDefault();void quitApplication();});
app.on('activate',()=>{if(tabHost&&!registry.windows().length){const owner=tabHost.createWindow();win=owner.window;owner.ready.then(()=>loadSession(createSession(owner.id))).catch(()=>safety.log('startup-failure'));}});
