// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path');
const STRIP_HEIGHT=44;
const {policy,COMPACT_HEIGHT}=require('./window-chrome.cjs');
function createTabHost({BrowserWindow,WebContentsView,ipcMain,registry,session,root,shellURL,strings,language,direction,actions,navigation=()=>({openInTabs:true}),diagnostics=()=>{},geometry={},platform=process.platform,chrome=()=>({})}){
 let compactDisabled=false,disableReady;const idleWaiters=new Set();
 const reportFailure=owner=>{try{Promise.resolve(actions.failure?.(owner)).catch(()=>{});}catch{}};
 const reportFrameFailure=owner=>{try{Promise.resolve((actions.frameFailure||actions.failure)?.(owner)).catch(()=>{});}catch{}};
 function disableCompact(owner){compactDisabled=true;if(!disableReady)disableReady=Promise.resolve().then(()=>actions.disableCompact?.()).catch(()=>reportFrameFailure(owner));return disableReady;}
 const stripVisible=owner=>owner.openInTabs&&registry.documents(owner.id).some(document=>document.state.current||document.name);
 const contentTop=owner=>owner.frame?.effectiveFrame==='compact'?COMPACT_HEIGHT:(stripVisible(owner)?STRIP_HEIGHT:0);
 const snapshot=owner=>{
  const active=registry.active(owner.id),state=active?.state,quick=state?.current?state.chromeState:null;
  const ready=!!active&&!owner.replacingFrame&&!owner.closeAllPending&&!active.closing&&active.status==='ready'&&!state.busy&&!state.moving&&!state.closePending;
  return {...registry.snapshot(owner.id),openInTabs:owner.openInTabs,stripVisible:!!stripVisible(owner),showHomeTab:navigation().showHomeTab===true,
   effectiveFrame:owner.frame?.effectiveFrame||'native',titleHeight:contentTop(owner),
   quick:quick?Object.fromEntries(Object.entries(quick).map(([name,value])=>[name,{...value,enabled:value.enabled&&ready}])):null};
 };
 const changed=windowId=>{
  const owner=registry.window(windowId);
  if(!owner.window.isDestroyed()&&!owner.window.webContents.isDestroyed()){
   owner.window.webContents.send('eo:tabs-state',snapshot(owner));
   for(const document of registry.documents(owner.id))if(!document.contents.isDestroyed())document.contents.send('eo:chrome-mode',{compact:owner.frame?.effectiveFrame==='compact'});
  }
 };
 registry.on('changed',changed);
 ipcMain.handle('eo:tabs-shell',async(event,command,id,argument=true)=>{
  const owner=registry.authorizeShell(event);
  if(command==='initial')return {state:snapshot(owner),strings:strings(),language:language(),direction:direction()};
  if(command==='appearance'){
   if(!['light','dark'].includes(id))throw Error('Invalid shell appearance');
   if(owner.frame?.effectiveFrame==='compact'){
    if(owner.nativeRecoveryPromise){await owner.nativeRecoveryPromise;return true;}
    try{owner.window.setTitleBarOverlay({height:COMPACT_HEIGHT,color:id==='dark'?'#23252a':'#f2f3f5',symbolColor:id==='dark'?'#f4f4f4':'#252525'});}
    catch{await recoverNative(owner);}
   }
   return true;
  }
  if(command==='home'){if(!owner.openInTabs||navigation().showHomeTab!==true)throw Error('Home tab unavailable');return actions.home(owner);}
  if(command==='end-drag'||command==='drop-drag')return actions.finishDrag(owner,id,command==='drop-drag');
  if(command==='new'){
   if(registry.documents(owner.id).some(document=>document.closing))throw Error('Document close is pending');
   return actions.create(owner);
  }
  if(typeof id!=='string'||!owner.documents.includes(id))throw Error('Document is not in this window');
  const document=registry.document(id);
  if(command==='quick-action'){
   if(typeof argument!=='string'||!['save','undo','redo','search'].includes(argument))throw Error('Invalid quick action');
   if(owner.activeId!==id||owner.replacingFrame||owner.closeAllPending||document.closing||document.status!=='ready'||!document.state.current||document.state.busy||document.state.moving||document.state.closePending)return false;
   return typeof actions.quickAction==='function'?registry.run(document,()=>{document.contents.focus();return actions.quickAction(document,argument)}):false;
  }
  if(command==='activate'){
   if(typeof argument!=='boolean')throw Error('Invalid focus request');
   registry.activate(id,{focus:argument});return true;
  }
  if(command==='close')return actions.close(document);
  if(command==='detach')return actions.detach(document);
  if(command==='begin-drag')return actions.beginDrag(owner,document,argument);
  if(command==='move-menu')return actions.moveMenu(document);
  throw Error('Unknown tab action');
 });
 function bounds(owner){
  if(owner.window.isDestroyed())return;
  const [width,height]=owner.window.getContentSize();
  const top=contentTop(owner);
  for(const document of registry.documents(owner.id))document.view.setBounds({x:0,y:top,width,height:Math.max(1,height-top)});
 }
 function live(owner){return registry.windows().includes(owner)&&!owner.window.isDestroyed();}
 function idle(owner){return live(owner)&&!owner.closeAllPending&&registry.documents(owner.id).every(document=>!document.closing&&!document.state.busy&&!document.state.moving&&!document.state.closePending&&!['opening','loaded'].includes(document.status));}
 function waitForIdle(owner){
  if(!live(owner)||idle(owner))return Promise.resolve(live(owner));
  return new Promise(resolve=>{
   const window=owner.window;
   const finish=value=>{registry.removeListener('changed',check);window.removeListener('closed',stop);idleWaiters.delete(stop);resolve(value);};
   const check=id=>{if(id===owner.id&&(!live(owner)||idle(owner)))finish(live(owner));};
   const stop=()=>finish(false);idleWaiters.add(stop);registry.on('changed',check);window.once('closed',stop);
  });
 }
 function placementOf(window,fallback){
  return {bounds:window.getNormalBounds?.()||window.getBounds?.()||fallback?.bounds,maximized:window.isMaximized?.()===true||fallback?.maximized===true,
   minimized:window.isMinimized?.()===true,fullScreen:window.isFullScreen?.()===true,visible:window.isVisible?.()!==false,focused:window.isFocused?.()!==false};
 }
 function construct(frame,placement,hidden=false){
  return new BrowserWindow({width:1360,height:960,...placement?.bounds,...frame.windowOptions,...(hidden?{show:false}:{}),title:'ElixirOffice',webPreferences:{session,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,preload:path.join(root,'tabs-preload.cjs')}});
 }
 function bindWindow(owner,window){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==shellURL)event.preventDefault();});
  const remember=()=>{if(owner.window===window)geometry.changed?.(window);};
  window.on('resize',()=>{if(owner.window===window){bounds(owner);remember();}});
  for(const event of ['move','maximize','unmaximize','leave-full-screen'])window.on(event,remember);
  window.on('close',event=>{
   if(owner.window!==window){event.preventDefault();return;}
   if(owner.allowClose)return;
   event.preventDefault();
   if(owner.replacingFrame)Promise.resolve(owner.nativeRecoveryPromise).then(()=>{if(live(owner))return actions.closeWindow(owner);}).catch(()=>reportFailure(owner));
   else Promise.resolve(actions.closeWindow(owner)).catch(()=>reportFailure(owner));
  });
  window.on('closed',()=>{
   // Retiring a frame must not close the WebContents now owned by its replacement.
   if(owner.window!==window||!registry.windows().includes(owner))return;
   for(const id of [...owner.documents]){
    const document=registry.remove(id);if(document){actions.destroyed?.(document);if(!document.contents.isDestroyed())document.contents.close();}
   }
   registry.removeWindow(owner.id);
  });
  if(platform!=='darwin')window.setMenuBarVisibility(false);
 }
 function showReplacement(window,placement){
  if(placement.maximized)window.maximize?.();
  if(placement.fullScreen)window.setFullScreen?.(true);
  if(placement.visible){
   if(placement.focused||typeof window.showInactive!=='function')window.show?.();else window.showInactive();
  }
  if(placement.minimized)window.minimize?.();
 }
 function recoverNative(owner,initialPlacement){
  if(owner.nativeRecoveryPromise)return owner.nativeRecoveryPromise;
  const disabled=disableCompact(owner);
  let resolve,reject;
  const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
  owner.nativeRecoveryPromise=promise;owner.ready=promise;promise.catch(()=>{});
  (async()=>{
   await disabled;
   while(live(owner)&&!idle(owner))if(!await waitForIdle(owner))return owner;
   if(!live(owner))return owner;
   const previous=owner.window,previousFrame=owner.frame,placement=placementOf(previous,initialPlacement),activeId=owner.activeId;
   const documents=registry.documents(owner.id),moving=new Map(documents.map(document=>[document,document.state.moving===true])),detached=[];
   let replacement,swapped=false;
   owner.replacingFrame=true;for(const document of documents)document.state.moving=true;
   try{
    replacement=construct(policy({platform,customTitleBar:false}),placement,true);bindWindow(owner,replacement);
    for(const document of documents){previous.contentView.removeChildView(document.view);detached.push(document);replacement.contentView.addChildView(document.view);}
    owner.window=replacement;owner.frame=policy({platform,customTitleBar:false});swapped=true;
    bounds(owner);actions.windowCreated?.(owner);actions.windowReplaced?.(owner,previous);registry.changed(owner.id);
    try{await replacement.loadURL(shellURL);}
    catch(error){
     // A failed empty startup can stop. Live documents instead keep a native
     // frame and their existing SDK/File menu even if its tab shell cannot load.
     if(!owner.documents.length)throw error;
     reportFrameFailure(owner);
    }
    const current=registry.active(owner.id);if(current)registry.activate(current.id,{focus:false});
    showReplacement(replacement,placement);
    if(placement.focused&&current)current.contents.focus();
    previous.destroy();return owner;
   }catch(error){
    const errors=[error];
    if(swapped&&!previous.isDestroyed()){
     owner.window=previous;owner.frame=previousFrame;
     try{actions.windowReplaced?.(owner,replacement);}catch(cleanup){errors.push(cleanup);}
    }
    for(const document of detached){
     try{replacement?.contentView.removeChildView(document.view);}catch(cleanup){errors.push(cleanup);}
     try{previous.contentView.addChildView(document.view);}catch(cleanup){errors.push(cleanup);}
    }
    if(replacement&&owner.window!==replacement)try{replacement.destroy();}catch(cleanup){errors.push(cleanup);}
    if(!owner.documents.length){if(!previous.isDestroyed())previous.destroy();if(registry.windows().includes(owner))registry.removeWindow(owner.id);}
    else if(live(owner)){try{bounds(owner);if(activeId)registry.activate(activeId,{focus:false});}catch(cleanup){errors.push(cleanup);}}
    throw errors.length===1?error:new AggregateError(errors,error.message);
   }finally{
    owner.replacingFrame=false;for(const [document,value] of moving)if(document.live)document.state.moving=value;
    if(live(owner))registry.changed(owner.id);
   }
  })().then(resolve,reject);
  return promise;
 }
 function createWindow(){
  const started=performance.now(),placement=geometry.restore?.(registry.windows().length);
  let frame=policy({platform,...chrome(),...(compactDisabled?{customTitleBar:false}:{})}),window;
  try{window=construct(frame,placement);}
  catch(error){
   if(frame.effectiveFrame!=='compact')throw error;
   disableCompact();frame=policy({platform,customTitleBar:false});window=construct(frame,placement);
  }
  const owner=registry.registerWindow(window);owner.openInTabs=navigation().openInTabs===true;owner.frame=frame;
  diagnostics({stage:'window-create',durationMs:performance.now()-started,outcome:'ok'});
  try{bindWindow(owner,window);actions.windowCreated?.(owner);if(placement?.maximized)window.maximize?.();}
  catch(error){
   if(frame.effectiveFrame==='compact'){owner.ready=recoverNative(owner,placement);return owner;}
   owner.allowClose=true;window.destroy();if(registry.windows().includes(owner)&&!owner.documents.length)registry.removeWindow(owner.id);throw error;
  }
  owner.ready=Promise.resolve().then(()=>window.loadURL(shellURL)).then(async()=>{if(disableReady)await disableReady;return owner;}).catch(error=>{
   if(frame.effectiveFrame==='compact')return recoverNative(owner,placement);
   owner.allowClose=true;window.destroy();throw error;
  });
  owner.ready.catch(()=>{});return owner;
 }
 function addDocument(owner,{preload,state={},name=''}={}){
  registry.assertCapacity(strings().tabLimit);
  const started=performance.now();
  const view=new WebContentsView({webPreferences:{session,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,preload:preload||path.join(root,'preload.cjs')}});
  diagnostics({stage:'view-create',durationMs:performance.now()-started,outcome:'ok'});
  let document;
  try{
  view.setVisible(false);
  document=registry.registerDocument(owner.id,view,{name,state});
  owner.window.contentView.addChildView(view);bounds(owner);
  document.contents.setWindowOpenHandler(()=>({action:'deny'}));
  document.contents.on('will-navigate',(event,url)=>{if(url!==registry.documentURL)event.preventDefault();});
  document.contents.on('render-process-gone',()=>{if(document.live)registry.status(document.id,'crashed');});
  document.contents.on('destroyed',()=>{
   if(!document.live)return;
   const currentOwner=registry.window(document.windowId);
   registry.remove(document.id);actions.destroyed?.(document);
   if(currentOwner.activeId===null&&currentOwner.documents.length)registry.activate(currentOwner.documents[0]);
  });
  return document;
  }catch(error){
   const failures=[error];
   if(document?.live)registry.remove(document.id);
   try{owner.window.contentView.removeChildView(view);}catch(cleanup){failures.push(cleanup);}
   try{if(!view.webContents.isDestroyed())view.webContents.close();}catch(cleanup){failures.push(cleanup);}
   if(failures.length>1)throw new AggregateError(failures,'Could not attach document');
   throw error;
  }
 }
 async function loadDocument(document,{beforeLoad}={}){
  const validate=registry.capture(document.id);
  try{
   if(beforeLoad)await beforeLoad(document);
   validate();await document.contents.loadURL(registry.documentURL);validate();if(document.status==='opening')registry.status(document.id,'loaded');
   return document;
  }catch(error){if(document.live)removeDocument(document);throw error;}
 }
 function removeDocument(document){
  const owner=registry.window(document.windowId);
  registry.remove(document.id);
  try{owner.window.contentView.removeChildView(document.view);}
  finally{
   try{if(!document.contents.isDestroyed())document.contents.close();}
   finally{if(owner.documents.length&&!owner.activeId)registry.activate(owner.documents[0]);}
  }
 }
 function moveDocument(document,target){
  const source=registry.window(document.windowId);
  if(source===target)throw Error('Document is already in this window');
  if(document.state.busy||document.closing||source.closeAllPending||target.closeAllPending)throw Error('Document operation is pending');
  const previous={index:source.documents.indexOf(document.id),sourceActiveId:source.activeId,targetActiveId:target.activeId};
  function restoreActive(owner,id){
   if(id)registry.activate(id,{focus:false});
   else{owner.activeId=null;for(const item of registry.documents(owner.id))item.view.setVisible(false);registry.changed(owner.id);}
  }
  try{
   source.window.contentView.removeChildView(document.view);
   target.window.contentView.addChildView(document.view);
   registry.move(document.id,target.id);
   bounds(source);bounds(target);
   if(source.activeId)registry.activate(source.activeId,{focus:false});
   registry.activate(document.id);return document;
  }catch(error){
   const failures=[error];
   try{target.window.contentView.removeChildView(document.view);}catch(cleanup){failures.push(cleanup);}
   try{source.window.contentView.addChildView(document.view);}catch(cleanup){failures.push(cleanup);}
   try{
    if(document.windowId!==source.id)registry.move(document.id,source.id,{index:previous.index});
    restoreActive(source,previous.sourceActiveId);restoreActive(target,previous.targetActiveId);
    bounds(source);bounds(target);
    if(previous.sourceActiveId)registry.document(previous.sourceActiveId).contents.focus();
   }catch(cleanup){failures.push(cleanup);}
   if(failures.length>1)throw new AggregateError(failures,'Could not move document; restoration needs attention');
   throw error;
  }
 }
 return {contentTop,compactAvailable:()=>!compactDisabled&&policy({platform,...chrome()}).available,setTabbed(owner,value){const previous=owner.openInTabs;owner.openInTabs=value===true;try{bounds(owner);}catch(error){owner.openInTabs=previous;bounds(owner);throw error;}registry.changed(owner.id);},createWindow,addDocument,loadDocument,removeDocument,moveDocument,bounds,dispose(){for(const stop of [...idleWaiters])stop();registry.removeListener('changed',changed);ipcMain.removeHandler('eo:tabs-shell');}};
}
module.exports={createTabHost,STRIP_HEIGHT};
