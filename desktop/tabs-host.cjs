// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path');
const STRIP_HEIGHT=44;
function createTabHost({BrowserWindow,WebContentsView,ipcMain,registry,session,root,shellURL,strings,language,direction,actions,platform=process.platform}){
 const changed=windowId=>{
  const owner=registry.window(windowId);
  if(!owner.window.isDestroyed()&&!owner.window.webContents.isDestroyed())owner.window.webContents.send('eo:tabs-state',registry.snapshot(windowId));
 };
 registry.on('changed',changed);
 ipcMain.handle('eo:tabs-shell',async(event,command,id,focus=true)=>{
  const owner=registry.authorizeShell(event);
  if(command==='initial')return {state:registry.snapshot(owner.id),strings:strings(),language:language(),direction:direction()};
  if(command==='end-drag'||command==='drop-drag')return actions.finishDrag(owner,id,command==='drop-drag');
  if(command==='new'){
   if(registry.documents(owner.id).some(document=>document.closing))throw Error('Document close is pending');
   return actions.create(owner);
  }
  if(typeof id!=='string'||!owner.documents.includes(id))throw Error('Document is not in this window');
  const document=registry.document(id);
  if(command==='activate'){
   if(typeof focus!=='boolean')throw Error('Invalid focus request');
   registry.activate(id,{focus});return true;
  }
  if(command==='close')return actions.close(document);
  if(command==='detach')return actions.detach(document);
  if(command==='begin-drag')return actions.beginDrag(owner,document,focus);
  if(command==='move-menu')return actions.moveMenu(document);
  throw Error('Unknown tab action');
 });
 function bounds(owner){
  if(owner.window.isDestroyed())return;
  const [width,height]=owner.window.getContentSize();
  for(const document of registry.documents(owner.id))document.view.setBounds({x:0,y:STRIP_HEIGHT,width,height:Math.max(1,height-STRIP_HEIGHT)});
 }
 function createWindow(){
  // The system frame is the default and stays available on unqualified systems.
  const window=new BrowserWindow({width:1360,height:960,title:'ElixirOffice',webPreferences:{session,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,preload:path.join(root,'tabs-preload.cjs')}});
  const owner=registry.registerWindow(window);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==shellURL)event.preventDefault();});
  window.on('resize',()=>bounds(owner));
  window.on('close',event=>{
   if(owner.allowClose)return;
   event.preventDefault();Promise.resolve(actions.closeWindow(owner)).catch(()=>actions.failure?.(owner));
  });
  window.on('closed',()=>{
   // A native window can disappear unexpectedly; its child WebContents must not leak.
   for(const id of [...owner.documents]){
    const document=registry.remove(id);if(document){actions.destroyed?.(document);if(!document.contents.isDestroyed())document.contents.close();}
   }
   registry.removeWindow(owner.id);
  });
  if(platform!=='darwin')window.setMenuBarVisibility(false);
  actions.windowCreated?.(owner);
  owner.ready=window.loadURL(shellURL).catch(error=>{owner.allowClose=true;window.destroy();throw error;});
  // Startup still awaits this promise; install a rejection observer immediately.
  owner.ready.catch(()=>{});
  return owner;
 }
 function addDocument(owner,{preload,state={},name=''}={}){
  registry.assertCapacity(strings().tabLimit);
  const view=new WebContentsView({webPreferences:{session,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,preload:preload||path.join(root,'preload.cjs')}});
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
 return {createWindow,addDocument,loadDocument,removeDocument,moveDocument,bounds,dispose(){registry.removeListener('changed',changed);ipcMain.removeHandler('eo:tabs-shell');}};
}
module.exports={createTabHost,STRIP_HEIGHT};
