// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {EventEmitter}=require('node:events'),{AsyncLocalStorage}=require('node:async_hooks'),{randomUUID}=require('node:crypto');
const MAX_DOCUMENTS=16;
const LIMIT_MESSAGE='You can open up to 16 documents at a time. Close a tab before opening another document.';
class DocumentRegistry extends EventEmitter{
 #windows=new Map();#documents=new Map();#senders=new Map();#context=new AsyncLocalStorage();#report;
 constructor({documentURL,shellURL,report=()=>{}}){super();this.documentURL=documentURL;this.shellURL=shellURL;this.#report=report;}
 registerWindow(window){
  if([...this.#windows.values()].some(item=>item.window===window)||this.#senders.has(window.webContents))throw Error('Window already registered');
  const record={id:randomUUID(),window,documents:[],activeId:null,revision:0};
  this.#windows.set(record.id,record);return record;
 }
 window(id){const record=this.#windows.get(id);if(!record)throw Error('Window unavailable');return record;}
 windows(){return [...this.#windows.values()];}
 assertCapacity(message=LIMIT_MESSAGE){
  if(this.#documents.size>=MAX_DOCUMENTS)throw Object.assign(Error(message||LIMIT_MESSAGE),{code:'DOCUMENT_LIMIT'});
 }
 registerDocument(windowId,view,{name='',state={}}={}){
  this.assertCapacity();
  const owner=this.window(windowId),contents=view.webContents;
  if(this.#senders.has(contents)||[...this.#windows.values()].some(item=>item.window.webContents===contents))throw Error('Document contents already registered');
  const document={id:randomUUID(),generation:randomUUID(),windowId,view,contents,name,dirty:false,status:'opening',state,live:true,closing:false};
  this.#documents.set(document.id,document);this.#senders.set(contents,document);owner.documents.push(document.id);
  this.changed(windowId);return document;
 }
 document(id){const document=this.#documents.get(id);if(!document?.live||document.contents.isDestroyed())throw Error('Document unavailable');return document;}
 documents(windowId){return this.window(windowId).documents.map(id=>this.document(id));}
 active(windowId){const owner=this.window(windowId);return owner.activeId?this.document(owner.activeId):null;}
 authorizeDocument(event){
  const document=this.#senders.get(event.sender);
  if(!document?.live||event.sender.isDestroyed()||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==this.documentURL)throw Error('This command requires a registered document main frame');
  return document;
 }
 authorizeShell(event){
  const owner=[...this.#windows.values()].find(item=>item.window.webContents===event.sender);
  if(!owner||event.sender.isDestroyed()||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==this.shellURL)throw Error('This command requires the tab shell main frame');
  return owner;
 }
 run(document,callback,command=''){
  if(this.document(document.id)!==document)throw Error('Document unavailable');
  return this.#context.run({document,generation:document.generation,command},callback);
 }
 command(){this.context();return this.#context.getStore().command;}
 context(){
  const context=this.#context.getStore();
  if(!context||!context.document.live||context.document.contents.isDestroyed()||context.document.generation!==context.generation||this.#documents.get(context.document.id)!==context.document)throw Error('Document context unavailable');
  return context.document;
 }
 capture(id){
  const document=this.document(id),generation=document.generation;
  return ()=>{if(this.document(id)!==document||document.generation!==generation)throw Error('Document changed');return document;};
 }
 activate(id,{focus=true}={}){
  const document=this.document(id),owner=this.window(document.windowId);
  if(owner.activeId&&owner.activeId!==id&&this.document(owner.activeId).closing)throw Error('Document close is pending');
  owner.activeId=id;
  for(const item of this.documents(owner.id))item.view.setVisible(item===document);
  // Re-adding an attached view raises it without the Electron 44 remove/add reattach bug.
  owner.window.contentView?.addChildView(document.view);
  if(focus)document.contents.focus();
  this.changed(owner.id);return document;
 }
 move(id,windowId,{index}={}){
  const document=this.document(id),source=this.window(document.windowId),target=this.window(windowId);
  if(source===target)throw Error('Document is already in this window');
  if(source.window.isDestroyed?.()||target.window.isDestroyed?.())throw Error('Window unavailable');
  if(document.closing||source.closeAllPending||target.closeAllPending||[...this.documents(source.id),...this.documents(target.id)].some(item=>item.closing))throw Error('Document close is pending');
  if(index===undefined)index=target.documents.length;
  if(!Number.isInteger(index)||index<0||index>target.documents.length)throw Error('Invalid document position');
  const previous={sourceId:source.id,index:source.documents.indexOf(id),sourceActiveId:source.activeId,targetActiveId:target.activeId};
  source.documents.splice(previous.index,1);target.documents.splice(index,0,id);document.windowId=target.id;
  if(source.activeId===id)source.activeId=source.documents[Math.min(previous.index,source.documents.length-1)]||null;
  target.activeId=id;
  this.changed(source.id);this.changed(target.id);return previous;
 }
 status(id,status){
  if(!['opening','loaded','ready','crashed'].includes(status))throw Error('Invalid document status');
  const document=this.document(id);document.status=status;this.changed(document.windowId);
 }
 update(id,{name,dirty}){
  const document=this.document(id);
  if(name!==undefined){if(typeof name!=='string')throw Error('Invalid document name');document.name=name;}
  if(dirty!==undefined){if(typeof dirty!=='boolean')throw Error('Invalid document state');document.dirty=dirty;}
  this.changed(document.windowId);
 }
 remove(id){
  const document=this.#documents.get(id);if(!document)return null;
  const owner=this.window(document.windowId);
  document.live=false;document.generation=randomUUID();this.#senders.delete(document.contents);this.#documents.delete(id);
  owner.documents=owner.documents.filter(value=>value!==id);
  if(owner.activeId===id)owner.activeId=null;
  this.changed(owner.id);return document;
 }
 removeWindow(id){
  const owner=this.window(id);if(owner.documents.length)throw Error('Window still owns documents');
  this.#windows.delete(id);
 }
 snapshot(windowId){
  const owner=this.window(windowId);
  return {windowId,revision:owner.revision,activeId:owner.activeId,documents:owner.documents.map(id=>{const document=this.document(id);return {id,name:document.name,dirty:document.dirty,closing:document.closing,status:document.status};})};
 }
 #notificationFailure(error){try{Promise.resolve(this.#report(error)).catch(()=>{});}catch{}}
 changed(windowId){
  this.window(windowId).revision++;
  for(const listener of this.rawListeners('changed')){
   try{
    const result=listener.call(this,windowId);
    if(result&&typeof result.then==='function')Promise.resolve(result).catch(error=>this.#notificationFailure(error));
   }catch(error){this.#notificationFailure(error);}
  }
 }
}
module.exports={DocumentRegistry,MAX_DOCUMENTS,LIMIT_MESSAGE};
