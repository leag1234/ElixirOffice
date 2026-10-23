// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {DocumentRegistry}=require('../../desktop/document-registry.cjs'),{createTabHost}=require('../../desktop/tabs-host.cjs');
const documentURL='eoapp://desktop.elixiroffice.invalid/index.html',shellURL='eoapp://desktop.elixiroffice.invalid/tabs.html';
function setup(fault={}){
 const views=[],windows=[],attempts=[],replaced=[];let disabled=0,failures=0,closes=0;const handlers=new Map(),registry=new DocumentRegistry({documentURL,shellURL});
 class Contents extends EventEmitter{
  constructor(){super();this.mainFrame={url:''};this.dead=false;}
  isDestroyed(){return this.dead;}send(){}focus(){this.focusCalls=(this.focusCalls||0)+1;}setWindowOpenHandler(){if(this.windowOptions?.titleBarStyle==='hidden'&&fault.compactSetup)throw Error('injected compact setup failure');if(this.document&&fault.setup)throw Error('setup failure');}
  async loadURL(url){if((url===shellURL&&fault.shell)||(url===documentURL&&fault.load))throw Error('load failure');this.mainFrame.url=url;}
  close(){this.dead=true;this.emit('destroyed');}
 }
 class Window extends EventEmitter{
  constructor(options){super();attempts.push(options);if(options.titleBarStyle==='hidden'&&fault.compactConstructor||options.titleBarStyle!=='hidden'&&fault.nativeConstructor)throw Error('injected constructor failure');this.options=options;windows.push(this);this.visible=options.show!==false;this.webContents=new Contents();this.webContents.windowOptions=options;this.dead=false;this.children=[];this.contentView={
   addChildView:view=>{if(fault.attach)throw Error('attachment failure');this.children=this.children.filter(value=>value!==view);this.children.push(view);if(fault.nativeAttach&&options.titleBarStyle!=='hidden')throw Error('injected native attach failure');},
   removeChildView:view=>{this.children=this.children.filter(value=>value!==view);}
  };}
  isDestroyed(){return this.dead;}setMenuBarVisibility(){}getContentSize(){return [800,600];}
  getNormalBounds(){return fault.runtimePlacement?.bounds||{x:this.options.x||0,y:this.options.y||0,width:this.options.width,height:this.options.height};}getBounds(){return this.getNormalBounds();}isMaximized(){return this.maximized===true;}maximize(){this.maximized=true;}isVisible(){return this.visible;}show(){this.visible=true;}isMinimized(){return false;}focus(){}setTitleBarOverlay(){if(fault.overlayThrow)throw Error('injected overlay failure');}
  loadURL(url){if(url===shellURL&&(this.options.titleBarStyle==='hidden'&&fault.compactShell||this.options.titleBarStyle!=='hidden'&&fault.nativeShell))return Promise.reject(Error('injected shell failure'));return this.webContents.loadURL(url);}destroy(){this.dead=true;this.webContents.close();this.emit('closed');}
 }
 if(fault.overlayMissing)Window.prototype.setTitleBarOverlay=undefined;
 class View{
  constructor(options){this.options=options;this.webContents=new Contents();this.webContents.document=true;views.push(this);}
  setVisible(value){this.visible=value;}setBounds(value){this.bounds=value;}
 }
 const host=createTabHost({BrowserWindow:Window,WebContentsView:View,ipcMain:{handle(name,fn){handlers.set(name,fn)},removeHandler(name){handlers.delete(name)}},registry,session:{},root:'/trusted/desktop',shellURL,strings:()=>({}),language:()=> 'en',direction:()=> 'ltr',navigation:()=>({openInTabs:fault.openInTabs!==false}),platform:fault.platform||'linux',chrome:()=>({customTitleBar:fault.compact===true,overlayAvailable:true}),geometry:{restore:()=>fault.placement},actions:{create(){},close(){},closeWindow(){closes++;},quickAction:fault.quickAction,disableCompact(){disabled++;return fault.disableCompact?.();},windowReplaced(owner,previous){replaced.push({owner,previous});},failure(){failures++;}}});
 return {host,registry,views,windows,attempts,replaced,disabled:()=>disabled,failures:()=>failures,closes:()=>closes,owner:host.createWindow(),request:(owner,command,...args)=>handlers.get('eo:tabs-shell')({sender:owner.window.webContents,senderFrame:owner.window.webContents.mainFrame},command,...args),from:(event,command,...args)=>handlers.get('eo:tabs-shell')(event,command,...args)};
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

test('mode A uses the whole client area; enabling B changes bounds without recreating the editor',async()=>{
 const {host,registry,owner}=setup({openInTabs:false});await owner.ready;
 const document=host.addDocument(owner,{state:{current:{format:'docx'}}});await host.loadDocument(document);
 assert.equal(document.view.bounds.y,0);assert.equal(document.view.bounds.height,600);
 const contents=document.contents,generation=document.generation;
 host.setTabbed(owner,true);assert.equal(document.view.bounds.y,44);assert.equal(document.view.bounds.height,556);
 assert.equal(document.contents,contents);assert.equal(document.generation,generation);assert.equal(registry.documents(owner.id).length,1);
});

test('empty startup uses the full client area even when B is selected; the first real document reveals its strip',async()=>{
 const {host,owner}=setup();await owner.ready;
 const document=host.addDocument(owner,{state:{current:null}});
 assert.equal(document.view.bounds.y,0);assert.equal(document.view.bounds.height,600);
 document.state.current={format:'xlsx'};host.bounds(owner);
 assert.equal(document.view.bounds.y,44);assert.equal(document.view.bounds.height,556);
});

for(const command of ['save','undo','redo','search'])test('quick action '+command+' binds the expected active ready document and registry context',async()=>{
 let received;
 const e=setup({quickAction:(document,action)=>{received={document,action,context:e.registry.context()};return true}});await e.owner.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 assert.equal(await e.request(e.owner,'quick-action',document.id,command),true);
 assert.equal(received.document,document);assert.equal(received.context,document);assert.equal(received.action,command);
});
for(const state of ['opening','loaded','crashed','closing','busy','moving','closePending','ownerClosing','empty'])test('quick actions refuse '+state+' without dispatch',async()=>{
 let calls=0;const e=setup({quickAction:()=>{calls++;return true}});await e.owner.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 if(['opening','loaded','crashed'].includes(state))e.registry.status(document.id,state);
 else if(state==='closing')document.closing=true;
 else if(state==='ownerClosing')e.owner.closeAllPending=true;
 else if(state==='empty')document.state.current=null;
 else document.state[state]=true;
 assert.equal(await e.request(e.owner,'quick-action',document.id,'save'),false);assert.equal(calls,0);
});
test('a stale expected document is never silently retargeted after a tab switch',async()=>{
 let calls=0;const e=setup({quickAction:()=>{calls++;return true}});await e.owner.ready;
 const a=e.host.addDocument(e.owner,{state:{current:{token:'a'}}}),b=e.host.addDocument(e.owner,{state:{current:{token:'b'}}});
 await e.host.loadDocument(a);await e.host.loadDocument(b);e.registry.status(a.id,'ready');e.registry.status(b.id,'ready');e.registry.activate(b.id);
 assert.equal(await e.request(e.owner,'quick-action',a.id,'undo'),false);assert.equal(calls,0);assert.equal(e.registry.active(e.owner.id),b);
});
test('quick action names are a bounded whitelist, not arbitrary editor/native operations',async()=>{
 let calls=0;const e=setup({quickAction:()=>{calls++;return true}});await e.owner.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 for(const command of ['executeJavaScript','close','__proto__',null,true,{name:'save'}])await assert.rejects(e.request(e.owner,'quick-action',document.id,command),/quick action/i);
 assert.equal(calls,0);
});
test('document frames, nested/spoofed shell frames and foreign documents cannot use quick actions',async()=>{
 let calls=0;const e=setup({quickAction:()=>{calls++;return true}});await e.owner.ready;const other=e.host.createWindow();await other.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}}),foreign=e.host.addDocument(other,{state:{current:{token:'other'}}});
 await e.host.loadDocument(document);await e.host.loadDocument(foreign);e.registry.status(document.id,'ready');e.registry.status(foreign.id,'ready');e.registry.activate(document.id);
 for(const event of [{sender:document.contents,senderFrame:document.contents.mainFrame},{sender:e.owner.window.webContents,senderFrame:{url:shellURL}},{sender:e.owner.window.webContents,senderFrame:other.window.webContents.mainFrame}]){
  await assert.rejects(e.from(event,'quick-action',document.id,'save'),/shell|frame|trusted/i);
 }
 await assert.rejects(e.request(e.owner,'quick-action',foreign.id,'save'),/not in this window/);assert.equal(calls,0);
});

test('quick actions follow the same live editor after reparenting, never its old shell',async()=>{
 const calls=[];const e=setup({quickAction:(document,action)=>{calls.push({document,action,context:e.registry.context()});return true}});await e.owner.ready;
 const target=e.host.createWindow();await target.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 const contents=document.contents,generation=document.generation;
 e.host.moveDocument(document,target);
 await assert.rejects(e.request(e.owner,'quick-action',document.id,'save'),/not in this window/);
 assert.equal(calls.length,0);
 assert.equal(await e.request(target,'quick-action',document.id,'save'),true);
 assert.equal(calls.length,1);assert.equal(calls[0].document,document);assert.equal(calls[0].context,document);
 assert.equal(document.contents,contents);assert.equal(document.generation,generation);assert.equal(contents.isDestroyed(),false);
});
for(const failure of ['attach','bounds'])test('quick action ownership survives failed reparenting at '+failure,async()=>{
 const calls=[];const e=setup({quickAction:(document,action)=>{calls.push({document,action,context:e.registry.context()});return true}});await e.owner.ready;
 const target=e.host.createWindow();await target.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 if(failure==='attach'){const add=target.window.contentView.addChildView;let once=true;target.window.contentView.addChildView=view=>{add(view);if(once){once=false;throw Error('Injected target attach failure');}};}
 else{let once=true;const size=target.window.getContentSize.bind(target.window);target.window.getContentSize=()=>{if(once){once=false;throw Error('Injected target bounds failure');}return size();};}
 assert.throws(()=>e.host.moveDocument(document,target),/Injected target/);
 await assert.rejects(e.request(target,'quick-action',document.id,'undo'),/not in this window/);
 assert.equal(calls.length,0);
 assert.equal(await e.request(e.owner,'quick-action',document.id,'undo'),true);
 assert.equal(calls.length,1);assert.equal(calls[0].document,document);assert.equal(calls[0].context,document);
 assert.equal(document.windowId,e.owner.id);assert.equal(e.registry.active(e.owner.id),document);assert.equal(document.contents.isDestroyed(),false);
});

for(const openInTabs of [false,true])test('compact native overlay reserves exactly36pixels even on empty Home;tabs='+openInTabs,async()=>{
 const f=setup({compact:true,openInTabs});await f.owner.ready;
 assert.equal(f.owner.window.options.titleBarStyle,'hidden');
 assert.equal(f.owner.window.options.titleBarOverlay.height,36);
 assert.equal(Object.hasOwn(f.owner.window.options,'frame'),false);
 const document=f.host.addDocument(f.owner);assert.equal(document.view.bounds.y,36);assert.equal(document.view.bounds.height,564);
 const value=await f.request(f.owner,'initial');assert.equal(value.state.effectiveFrame,'compact');assert.equal(value.state.titleHeight,36);
 f.host.setTabbed(f.owner,!openInTabs);assert.equal(document.view.bounds.y,36);
});
for(const platform of ['win32','darwin'])test('unqualified '+platform+' retains native frame and normal document bounds',async()=>{
 const f=setup({compact:true,openInTabs:false,platform});await f.owner.ready;const document=f.host.addDocument(f.owner);
 assert.equal(Object.hasOwn(f.owner.window.options,'titleBarStyle'),false);assert.equal(document.view.bounds.y,0);
 assert.equal((await f.request(f.owner,'initial')).state.effectiveFrame,'native');
});

test('a shell quick action returns native focus to its exact document before dispatch',async()=>{
 let focusedAtDispatch=false;
 const e=setup({quickAction:document=>{focusedAtDispatch=document.contents.focusCalls===2;return true}});await e.owner.ready;
 const document=e.host.addDocument(e.owner,{state:{current:{token:'public'}}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 assert.equal(document.contents.focusCalls,1);await e.request(e.owner,'quick-action',document.id,'search');
 assert.equal(focusedAtDispatch,true);
});

test('compact empty Home cannot expose stale quick controls from its former editor',async()=>{
 const e=setup({compact:true});await e.owner.ready;
 const chromeState=Object.fromEntries(['save','undo','redo','search'].map(name=>[name,{visible:true,enabled:true,label:name}]));
 const document=e.host.addDocument(e.owner,{state:{current:null,chromeState}});await e.host.loadDocument(document);e.registry.status(document.id,'ready');e.registry.activate(document.id);
 assert.equal((await e.request(e.owner,'initial')).state.quick,null);
 document.state.current={token:'public'};assert.equal((await e.request(e.owner,'initial')).state.quick.save.enabled,true);
 document.state.busy=true;assert.equal((await e.request(e.owner,'initial')).state.quick.save.enabled,false);
});

test('compact constructor failure retries once natively with original placement',async()=>{
 const placement={bounds:{x:120,y:80,width:990,height:700},maximized:true},f=setup({compact:true,compactConstructor:true,placement});
 await f.owner.ready;assert.equal(f.attempts.length,2);assert.equal(f.windows.length,1);assert.equal(f.owner.frame.effectiveFrame,'native');
 assert.equal(f.owner.window.options.titleBarStyle,undefined);for(const [key,value] of Object.entries(placement.bounds))assert.equal(f.owner.window.options[key],value);
 assert.equal(f.owner.window.isMaximized(),true);assert.equal(f.registry.windows().length,1);assert.equal(f.disabled(),1);
});
test('compact shell failure unregisters/destroys only the failed window and readies native replacement',async()=>{
 const f=setup({compact:true,compactShell:true}),owner=f.owner,old=owner.window;await owner.ready;
 assert.equal(f.attempts.length,2);assert.equal(old.isDestroyed(),true);assert.equal(f.registry.windows().length,1);
 assert.equal(f.registry.window(owner.id),owner);assert.notEqual(owner.window,old);assert.equal(owner.frame.effectiveFrame,'native');
 assert.equal((await f.request(owner,'initial')).state.effectiveFrame,'native');
 await assert.rejects(f.from({sender:old.webContents,senderFrame:old.webContents.mainFrame},'initial'),/shell main frame/);
});
test('compact plus native shell failure is bounded and leaves no partial startup registration',async()=>{
 const f=setup({compact:true,compactShell:true,nativeShell:true});await assert.rejects(f.owner.ready,/shell failure/);
 assert.equal(f.attempts.length,2);assert.equal(f.registry.windows().length,0);assert(f.windows.every(w=>w.isDestroyed()));assert.equal(f.disabled(),1);
});
for(const fault of ['overlayThrow','overlayMissing'])test('runtime '+fault+' replaces the window without replacing live dirty documents',async()=>{
 const f=setup({compact:true,[fault]:true,runtimePlacement:{bounds:{x:80,y:60,width:980,height:680}}});await f.owner.ready;
 const a=f.host.addDocument(f.owner,{name:'Public.docx',state:{current:{token:'public-a'}}}),b=f.host.addDocument(f.owner,{name:'Public.xlsx',state:{current:{token:'public-b'}}});
 for(const d of [a,b]){await f.host.loadDocument(d);f.registry.status(d.id,'ready');}f.registry.update(a.id,{dirty:true});f.registry.activate(b.id);
 const old=f.owner.window,contents=[a.contents,b.contents],id=f.owner.id;
 await Promise.all([f.request(f.owner,'appearance','dark'),f.request(f.owner,'appearance','light')]);
 assert.equal(f.attempts.length,2);assert(old.isDestroyed());assert.equal(f.owner.id,id);assert.equal(f.owner.frame.effectiveFrame,'native');
 assert.equal(f.owner.window.options.x,80);assert.equal(f.owner.window.options.width,980);assert.equal(f.registry.active(id),b);
 for(const [index,d] of [a,b].entries()){assert.equal(d.contents,contents[index]);assert.equal(d.contents.isDestroyed(),false);assert(f.owner.window.children.includes(d.view));assert.equal(d.windowId,id);assert.equal(d.state.moving,false);}
 assert.equal(a.dirty,true);assert.equal(a.state.current.token,'public-a');assert.equal(f.disabled(),1);
 const next=f.host.createWindow();await next.ready;assert.equal(next.frame.effectiveFrame,'native');
});
test('runtime replacement waits for a pending file operation before moving its live view',async()=>{
 const f=setup({compact:true,overlayThrow:true});await f.owner.ready;const d=f.host.addDocument(f.owner,{state:{current:{token:'public'},busy:true}});
 await f.host.loadDocument(d);f.registry.status(d.id,'ready');f.registry.activate(d.id);const old=f.owner.window;
 const pending=f.request(f.owner,'appearance','dark');await new Promise(setImmediate);
 assert.equal(f.windows.length,1);assert.equal(old.isDestroyed(),false);assert(old.children.includes(d.view));
 d.state.busy=false;f.registry.changed(f.owner.id);await pending;
 assert.equal(f.owner.frame.effectiveFrame,'native');assert.equal(d.contents.isDestroyed(),false);
});
test('native constructor failure during recovery preserves every live document and never loops',async()=>{
 const fault={compact:true,overlayThrow:true},f=setup(fault);await f.owner.ready;const d=f.host.addDocument(f.owner,{state:{current:{token:'public'}}});
 await f.host.loadDocument(d);f.registry.status(d.id,'ready');f.registry.activate(d.id);const old=f.owner.window;fault.nativeConstructor=true;
 await assert.rejects(f.request(f.owner,'appearance','dark'),/constructor failure/);const attempts=f.attempts.length;
 await assert.rejects(f.request(f.owner,'appearance','light'),/constructor failure/);assert.equal(f.attempts.length,attempts);
 assert.equal(f.owner.window,old);assert.equal(old.isDestroyed(),false);assert.equal(d.contents.isDestroyed(),false);assert(old.children.includes(d.view));
 fault.nativeConstructor=false;const next=f.host.createWindow();await next.ready;assert.equal(next.frame.effectiveFrame,'native');
});
test('native attachment failure rolls back without closing or unregistering live views',async()=>{
 const fault={compact:true,overlayThrow:true},f=setup(fault);await f.owner.ready;const d=f.host.addDocument(f.owner,{state:{current:{token:'public'}}});
 await f.host.loadDocument(d);f.registry.status(d.id,'ready');f.registry.activate(d.id);const old=f.owner.window;fault.nativeAttach=true;
 await assert.rejects(f.request(f.owner,'appearance','dark'),/native attach failure/);
 assert.equal(f.owner.window,old);assert(old.children.includes(d.view));assert.equal(d.contents.isDestroyed(),false);assert.equal(d.state.moving,false);
 assert.equal(f.registry.windows().length,1);assert(f.windows.slice(1).every(w=>w.isDestroyed()));
});
test('runtime native shell failure retains live data inside the native frame',async()=>{
 const fault={compact:true,overlayThrow:true},f=setup(fault);await f.owner.ready;const d=f.host.addDocument(f.owner,{state:{current:{token:'public'}}});
 await f.host.loadDocument(d);f.registry.status(d.id,'ready');f.registry.activate(d.id);fault.nativeShell=true;
 await f.request(f.owner,'appearance','dark');assert.equal(f.owner.frame.effectiveFrame,'native');assert.equal(d.contents.isDestroyed(),false);assert.equal(d.state.current.token,'public');assert(f.owner.window.children.includes(d.view));assert.equal(f.failures(),1);assert.equal(f.attempts.length,2);
});

test('ordinary native close starts its existing write barrier synchronously',async()=>{
 const f=setup();await f.owner.ready;let prevented=false;
 f.owner.window.emit('close',{preventDefault(){prevented=true}});
 assert.equal(prevented,true);assert.equal(f.closes(),1);
});

test('compact security/setup failure follows the same bounded native startup recovery',async()=>{
 const f=setup({compact:true,compactSetup:true});await f.owner.ready;
 assert.equal(f.attempts.length,2);assert.equal(f.windows[0].isDestroyed(),true);assert.equal(f.registry.windows().length,1);assert.equal(f.owner.frame.effectiveFrame,'native');
});
