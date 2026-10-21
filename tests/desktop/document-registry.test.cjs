// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DocumentRegistry}=require('../../desktop/document-registry.cjs');
const documentURL='eoapp://desktop.elixiroffice.invalid/index.html',shellURL='eoapp://desktop.elixiroffice.invalid/tabs.html';
function contents(url){return {mainFrame:{url},dead:false,isDestroyed(){return this.dead;},focus(){this.focused=true;}};}
function fixture(){
 const registry=new DocumentRegistry({documentURL,shellURL});
 const window={webContents:contents(shellURL)},owner=registry.registerWindow(window);
 const view=()=>({webContents:contents(documentURL),setVisible(value){this.visible=value;}});
 const a=registry.registerDocument(owner.id,view(),{name:'A',state:{value:'alpha'}}),b=registry.registerDocument(owner.id,view(),{name:'B',state:{value:'bravo'}});
 return {registry,owner,a,b};
}
const event=contents=>({sender:contents,senderFrame:contents.mainFrame});
test('document and shell privileges require exact live registered sender, main frame and URL',()=>{
 const {registry,owner,a}=fixture();
 assert.equal(registry.authorizeDocument(event(a.contents)),a);
 assert.equal(registry.authorizeShell(event(owner.window.webContents)),owner);
 assert.throws(()=>registry.authorizeShell(event(a.contents)),/shell main frame/);
 assert.throws(()=>registry.authorizeDocument(event(owner.window.webContents)),/document main frame/);
 assert.throws(()=>registry.authorizeDocument(event(contents(documentURL))),/document main frame/);
 assert.throws(()=>registry.authorizeDocument({sender:a.contents,senderFrame:{url:documentURL}}),/document main frame/);
 a.contents.mainFrame.url=documentURL+'?other=1';assert.throws(()=>registry.authorizeDocument(event(a.contents)),/document main frame/);
 a.contents.mainFrame.url=documentURL;a.contents.dead=true;assert.throws(()=>registry.authorizeDocument(event(a.contents)),/document main frame/);
});
test('document scope survives interleaved async work and active-tab changes',async()=>{
 const {registry,owner,a,b}=fixture();let release;
 const barrier=new Promise(resolve=>{release=resolve;});
 registry.activate(a.id);
 const first=registry.run(a,async()=>{assert.equal(registry.context(),a);await barrier;registry.context().state.value+='!';return registry.context().id;});
 const second=registry.run(b,async()=>{registry.activate(b.id);await Promise.resolve();assert.equal(registry.context(),b);release();return registry.context().id;});
 assert.deepEqual(await Promise.all([first,second]),[a.id,b.id]);
 assert.equal(a.state.value,'alpha!');assert.equal(b.state.value,'bravo');assert.equal(registry.active(owner.id),b);
 assert.throws(()=>registry.context(),/context unavailable/);
});
test('closed document invalidates outstanding captures, sender privileges and async context',async()=>{
 const {registry,a,b}=fixture(),captured=registry.capture(a.id);
 await registry.run(a,async()=>{
  await Promise.resolve();registry.remove(a.id);
  assert.throws(captured,/unavailable/);assert.throws(()=>registry.context(),/context unavailable/);
  assert.throws(()=>registry.authorizeDocument(event(a.contents)),/document main frame/);
 });
 assert.equal(registry.document(b.id),b);
});
test('activation exposes one owner view and cannot switch away from a closing document',()=>{
 const {registry,owner,a,b}=fixture();registry.activate(a.id);assert.equal(a.view.visible,true);assert.equal(b.view.visible,false);
 a.closing=true;assert.throws(()=>registry.activate(b.id),/close is pending/);
 a.closing=false;registry.activate(b.id,{focus:false});assert.equal(a.view.visible,false);assert.equal(b.view.visible,true);assert.equal(registry.active(owner.id),b);
});
test('shell snapshot exposes presentation metadata only and removing one tab preserves the other',()=>{
 const {registry,owner,a,b}=fixture();a.state.password='secret-fixture';a.state.target='/not-public';
 registry.activate(b.id);registry.remove(a.id);
 assert.deepEqual(registry.snapshot(owner.id),{windowId:owner.id,revision:owner.revision,activeId:b.id,documents:[{id:b.id,name:'B',dirty:false,closing:false,status:'opening'}]});
 assert.throws(()=>registry.removeWindow(owner.id),/still owns documents/);
 registry.remove(b.id);registry.removeWindow(owner.id);assert.equal(registry.windows().length,0);
});
test('duplicate native identities cannot cross document and shell registrations',()=>{
 const {registry,owner,a}=fixture();
 assert.throws(()=>registry.registerWindow(owner.window),/already registered/);
 assert.throws(()=>registry.registerDocument(owner.id,a.view),/already registered/);
 assert.throws(()=>registry.registerDocument(owner.id,{webContents:owner.window.webContents}),/already registered/);
});

test('post-await generation guard prevents a commit after the document closes',async()=>{
 const {registry,a}=fixture();let release,committed=false;
 const gate=new Promise(resolve=>{release=resolve;});
 const pending=registry.run(a,async()=>{const validate=registry.capture(a.id);await gate;validate();committed=true;});
 registry.remove(a.id);release();await assert.rejects(pending,/unavailable/);assert.equal(committed,false);
});
test('readiness and crash state are explicit and invalid statuses are rejected',()=>{
 const {registry,owner,a}=fixture();
 assert.equal(registry.snapshot(owner.id).documents[0].status,'opening');
 registry.status(a.id,'ready');assert.equal(registry.document(a.id).status,'ready');
 registry.status(a.id,'crashed');assert.equal(registry.document(a.id).status,'crashed');
 assert.throws(()=>registry.status(a.id,'anything'),/Invalid document status/);
});

test('command identity remains scoped across interleaved asynchronous handlers',async()=>{
 const {registry,a,b}=fixture();let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const save=registry.run(a,async()=>{assert.equal(registry.command(),'save');await gate;return registry.command();},'save');
 const other=registry.run(b,async()=>{assert.equal(registry.command(),'export');release();await Promise.resolve();return registry.command();},'export');
 assert.deepEqual(await Promise.all([save,other]),['save','export']);
});
test('failed notifications cannot interrupt registry mutation or later observers',async()=>{
 const reports=[],registry=new DocumentRegistry({documentURL,shellURL,report:error=>reports.push(error.message)});
 const owner=registry.registerWindow({webContents:contents(shellURL)});let observed=0;
 registry.on('changed',()=>{throw Error('notification failed');});registry.on('changed',()=>{observed++;});
 const document=registry.registerDocument(owner.id,{webContents:contents(documentURL),setVisible(){}});
 assert.equal(registry.documents(owner.id).length,1);assert.equal(observed,1);
 registry.remove(document.id);assert.equal(registry.documents(owner.id).length,0);assert.equal(observed,2);
 assert.deepEqual(reports,['notification failed','notification failed']);
});

test('moving a live document preserves sender identity, async scope and state while changing window ownership',async()=>{
 const {registry,owner,a,b}=fixture(),target=registry.registerWindow({webContents:contents(shellURL)}),guard=registry.capture(a.id),generation=a.generation;
 registry.activate(a.id);
 await registry.run(a,async()=>{
  await Promise.resolve();const previous=registry.move(a.id,target.id);assert.equal(previous.index,0);assert.equal(registry.context(),a);
  assert.equal(a.generation,generation);assert.equal(guard(),a);assert.equal(registry.authorizeDocument(event(a.contents)),a);
  assert.equal(a.windowId,target.id);assert.equal(a.state.value,'alpha');assert.equal(registry.active(owner.id),b);assert.equal(registry.active(target.id),a);
 });
 assert.deepEqual(registry.snapshot(owner.id).documents.map(d=>d.id),[b.id]);assert.deepEqual(registry.snapshot(target.id).documents.map(d=>d.id),[a.id]);
});
test('move rejects closing owners and invalid target position without changing document ownership',()=>{
 const {registry,owner,a}=fixture(),target=registry.registerWindow({webContents:contents(shellURL)});
 target.closeAllPending=true;assert.throws(()=>registry.move(a.id,target.id),/close is pending/);target.closeAllPending=false;
 assert.throws(()=>registry.move(a.id,target.id,{index:-1}),/Invalid document position/);assert.throws(()=>registry.move(a.id,owner.id),/already in this window/);
 assert.equal(a.windowId,owner.id);assert.equal(registry.documents(owner.id).length,2);assert.equal(registry.documents(target.id).length,0);
});

test('sixteen-document cap is global across windows and removing a tab releases one slot',()=>{
 const {registry,owner}=fixture(),other=registry.registerWindow({webContents:contents(shellURL)});
 const view=()=>({webContents:contents(documentURL),setVisible(){}});
 while(registry.documents(owner.id).length+registry.documents(other.id).length<16)registry.registerDocument(other.id,view());
 assert.throws(()=>registry.registerDocument(owner.id,view()),{code:'DOCUMENT_LIMIT'});
 assert.equal(registry.documents(owner.id).length+registry.documents(other.id).length,16);
 registry.remove(registry.documents(other.id)[0].id);
 registry.registerDocument(owner.id,view());
 assert.equal(registry.documents(owner.id).length+registry.documents(other.id).length,16);
});
