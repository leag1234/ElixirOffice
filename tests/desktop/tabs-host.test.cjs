// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {DocumentRegistry}=require('../../desktop/document-registry.cjs'),{createTabHost}=require('../../desktop/tabs-host.cjs');
const documentURL='eoapp://desktop.elixiroffice.invalid/index.html',shellURL='eoapp://desktop.elixiroffice.invalid/tabs.html';
function setup(fault={}){
 const views=[],registry=new DocumentRegistry({documentURL,shellURL});
 class Contents extends EventEmitter{
  constructor(){super();this.mainFrame={url:''};this.dead=false;}
  isDestroyed(){return this.dead;}send(){}focus(){}setWindowOpenHandler(){if(this.document&&fault.setup)throw Error('setup failure');}
  async loadURL(url){if((url===shellURL&&fault.shell)||(url===documentURL&&fault.load))throw Error('load failure');this.mainFrame.url=url;}
  close(){this.dead=true;this.emit('destroyed');}
 }
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.webContents=new Contents();this.dead=false;this.children=[];this.contentView={
   addChildView:view=>{if(fault.attach)throw Error('attachment failure');this.children=this.children.filter(value=>value!==view);this.children.push(view);},
   removeChildView:view=>{this.children=this.children.filter(value=>value!==view);}
  };}
  isDestroyed(){return this.dead;}setMenuBarVisibility(){}getContentSize(){return [800,600];}
  loadURL(url){return this.webContents.loadURL(url);}destroy(){this.dead=true;this.webContents.close();this.emit('closed');}
 }
 class View{
  constructor(options){this.options=options;this.webContents=new Contents();this.webContents.document=true;views.push(this);}
  setVisible(){}setBounds(){}
 }
 const host=createTabHost({BrowserWindow:Window,WebContentsView:View,ipcMain:{handle(){},removeHandler(){}},registry,session:{},root:'/trusted/desktop',shellURL,strings:()=>({}),language:()=> 'en',direction:()=> 'ltr',actions:{create(){},close(){},closeWindow(){}}});
 return {host,registry,views,owner:host.createWindow()};
}
test('host distinguishes navigation-loaded state from editor-ready state',async()=>{
 const {host,registry,owner}=setup();await owner.ready;
 const document=host.addDocument(owner);assert.equal(document.status,'opening');
 await host.loadDocument(document);
 assert.equal(document.status,'loaded');assert.equal(registry.snapshot(owner.id).documents[0].status,'loaded');
 registry.status(document.id,'ready');assert.equal(document.status,'ready');
 assert.equal(document.view.options.webPreferences.sandbox,true);assert.equal(document.view.options.webPreferences.contextIsolation,true);assert.equal(document.view.options.webPreferences.nodeIntegration,false);
});
for(const fault of ['attach','setup'])test('host rolls back registration and closes contents on '+fault+' failure',async()=>{
 const {host,registry,views,owner}=setup({[fault]:true});await owner.ready;
 assert.throws(()=>host.addDocument(owner),/attach|setup/);
 assert.equal(registry.documents(owner.id).length,0);assert.equal(owner.window.children.length,0);assert.equal(views.length,1);assert.equal(views[0].webContents.isDestroyed(),true);
});
test('host removes and closes a view whose asynchronous document load fails',async()=>{
 const {host,registry,owner}=setup({load:true});await owner.ready;const document=host.addDocument(owner);
 await assert.rejects(host.loadDocument(document),/load failure/);
 assert.equal(document.live,false);assert.equal(document.contents.isDestroyed(),true);assert.equal(registry.documents(owner.id).length,0);assert.equal(owner.window.children.length,0);
});
test('host removes and closes a view whose preparation fails before navigation',async()=>{
 const {host,registry,owner}=setup();await owner.ready;const document=host.addDocument(owner);
 await assert.rejects(host.loadDocument(document,{beforeLoad:async()=>{await Promise.resolve();throw Error('preparation failure');}}),/preparation failure/);
 assert.equal(document.live,false);assert.equal(document.contents.isDestroyed(),true);assert.equal(registry.documents(owner.id).length,0);
});
test('failed shell navigation destroys and unregisters the partial native window',async()=>{
 const {registry,owner}=setup({shell:true});await assert.rejects(owner.ready,/load failure/);assert.equal(owner.window.isDestroyed(),true);assert.equal(registry.windows().length,0);
});

test('ordinary removal closes contents and activates another tab even if native detach throws',async()=>{
 const {host,registry,owner}=setup();await owner.ready;
 const first=host.addDocument(owner),second=host.addDocument(owner);registry.activate(first.id);
 owner.window.contentView.removeChildView=()=>{throw Error('detach failure');};
 assert.throws(()=>host.removeDocument(first),/detach failure/);
 assert.equal(first.live,false);assert.equal(first.contents.isDestroyed(),true);assert.equal(registry.active(owner.id),second);
});

test('navigation completion cannot downgrade an already initialized editor',async()=>{
 const {host,registry,owner}=setup();await owner.ready;const document=host.addDocument(owner);
 await host.loadDocument(document,{beforeLoad:async()=>registry.status(document.id,'ready')});
 assert.equal(document.status,'ready');
});

test('activation raises the selected native view above overlapping siblings',async()=>{
 const {host,registry,owner}=setup();await owner.ready;
 const first=host.addDocument(owner),second=host.addDocument(owner);
 assert.deepEqual(owner.window.children,[first.view,second.view]);
 registry.activate(first.id);
 assert.deepEqual(owner.window.children,[second.view,first.view]);
 registry.activate(second.id);
 assert.deepEqual(owner.window.children,[first.view,second.view]);
});

test('host reparents the same live view and its destruction uses the current owner',async()=>{
 const {host,registry,owner}=setup();await owner.ready;const target=host.createWindow();await target.ready;
 const a=host.addDocument(owner),b=host.addDocument(owner),c=host.addDocument(target);await host.loadDocument(a);await host.loadDocument(b);await host.loadDocument(c);registry.activate(a.id);
 const contents=a.contents,generation=a.generation;host.moveDocument(a,target);
 assert.equal(a.contents,contents);assert.equal(a.generation,generation);assert.equal(a.windowId,target.id);assert.deepEqual(owner.window.children,[b.view]);assert.deepEqual(target.window.children,[c.view,a.view]);
 assert.equal(registry.active(owner.id),b);assert.equal(registry.active(target.id),a);assert.equal(contents.isDestroyed(),false);
 contents.close();assert.equal(a.live,false);assert.equal(registry.active(target.id),c);assert.equal(registry.active(owner.id),b);
});
for(const failure of ['attach','bounds'])test('move rollback preserves live editor and owner order after target '+failure+' failure',async()=>{
 const {host,registry,owner}=setup();await owner.ready;const target=host.createWindow();await target.ready;
 const a=host.addDocument(owner),b=host.addDocument(owner),c=host.addDocument(target);registry.activate(a.id);registry.activate(c.id);
 if(failure==='attach'){const add=target.window.contentView.addChildView;let once=true;target.window.contentView.addChildView=view=>{add(view);if(once){once=false;throw Error('Injected target attach failure');}};}
 else{let once=true;const size=target.window.getContentSize.bind(target.window);target.window.getContentSize=()=>{if(once){once=false;throw Error('Injected target bounds failure');}return size();};}
 assert.throws(()=>host.moveDocument(a,target),/Injected target/);
 assert.equal(a.contents.isDestroyed(),false);assert.equal(a.windowId,owner.id);assert.deepEqual(registry.documents(owner.id),[a,b]);assert.deepEqual(registry.documents(target.id),[c]);
 assert.equal(owner.window.children.includes(a.view),true);assert.equal(target.window.children.includes(a.view),false);
 assert.equal(registry.active(owner.id),a);assert.equal(registry.active(target.id),c);
});
test('busy document move refuses before detaching its native view',async()=>{
 const {host,registry,owner}=setup();await owner.ready;const target=host.createWindow();await target.ready;const a=host.addDocument(owner);a.state.busy=true;
 assert.throws(()=>host.moveDocument(a,target),/operation is pending/);assert.equal(a.windowId,owner.id);assert.deepEqual(owner.window.children,[a.view]);assert.deepEqual(target.window.children,[]);
});

test('host refuses a seventeenth tab before allocating its expensive editor renderer',async()=>{
 const {host,registry,views,owner}=setup();await owner.ready;
 const other=host.createWindow();await other.ready;
 for(let n=0;n<16;n++)host.addDocument(n%2?other:owner);
 assert.equal(views.length,16);
 assert.throws(()=>host.addDocument(owner),{code:'DOCUMENT_LIMIT'});
 assert.equal(views.length,16,'Refusal must precede WebContentsView allocation');
 assert.equal(registry.documents(owner.id).length+registry.documents(other.id).length,16);
});
