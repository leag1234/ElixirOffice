// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
const bytes=value=>new Uint8Array(Buffer.from('PK'+value));
async function second(env){assert.equal(await env.invoke('new','xlsx'),null);const view=env.documents.at(-1);return {view,selected:await env.invokeFor(view,'initial')};}
const shellEvent=env=>({sender:env.shell.webContents,senderFrame:env.shell.webContents.mainFrame});
test('main keeps document handles, dirty state and Cancel/Discard private to each tab',async()=>{
 const e=await boot({fontSettings:{openInTabs:true},document:true});
 try{
  e.state.dirty=true;await e.invoke('state',e.selected.token,true);
  const b=await second(e),aIdentity=await e.invoke('identity'),bIdentity=await e.invokeFor(b.view,'identity');
  assert.notEqual(aIdentity.documentId,bIdentity.documentId);assert.equal(aIdentity.windowId,bIdentity.windowId);
  await assert.rejects(e.invokeFor(b.view,'save',e.selected.token,bytes('wrong-owner'),false),/active document handle/);
  const tabs=(command,...args)=>e.handlers.get('eo:tabs-shell')(shellEvent(e),command,...args);
  let state=(await tabs('initial')).state;assert.equal(state.documents.find(d=>d.id===aIdentity.documentId).dirty,true);assert.equal(state.documents.find(d=>d.id===bIdentity.documentId).dirty,false);
  b.view.state.dirty=true;await e.invokeFor(b.view,'state',b.selected.token,true);
  e.responses.push(process.platform==='darwin'?1:2);assert.equal(await tabs('close',bIdentity.documentId),false);
  assert.equal(e.documents.filter(w=>!w.isDestroyed()).length,2);assert.equal(b.view.state.dirty,true);
  e.responses.push(process.platform==='darwin'?2:1);assert.equal(await tabs('close',bIdentity.documentId),true);
  assert.equal(b.view.isDestroyed(),true);assert.equal(e.documents[0].isDestroyed(),false);assert.equal(e.state.dirty,true);
  assert.equal((await e.invoke('initial')),null);assert.equal((await e.invoke('identity')).documentId,aIdentity.documentId);
  assert.equal(await fsp.readFile(path.join(e.directory,'test.docx'),'utf8'),'PKtest-public-document');
 }finally{await e.cleanup();}
});
test('recovery restore owns a fresh durable record and password lock removes only its own tab record',async()=>{
 const e=await boot({fontSettings:{openInTabs:true},document:true});
 try{
  const b=await second(e);e.state.dirty=true;b.view.state.dirty=true;
  await Promise.all([e.invoke('recovery-save',e.selected.token,0,bytes('public-A')),e.invokeFor(b.view,'recovery-save',b.selected.token,0,bytes('public-B'))]);
  const recovery=()=>fsp.readdir(path.join(e.directory,'recovery'));
  let names=await recovery();assert(names.some(n=>n.startsWith(e.selected.token)));assert(names.some(n=>n.startsWith(b.selected.token)));
  assert.equal(await e.invoke('recovery-restore',b.selected.token),null);
  const c=e.documents.at(-1),restored=await e.invokeFor(c,'initial');assert.notEqual(restored.token,b.selected.token);c.state.dirty=true;
  names=await recovery();for(const id of [e.selected.token,b.selected.token,restored.token])assert(names.some(n=>n.startsWith(id)),id);
  assert.equal(await e.invoke('recovery-restore',b.selected.token),null);assert.equal(e.documents.length,3,'Restore focuses the existing copy');
  await e.invoke('password-lock',e.selected.token);
  names=await recovery();assert(!names.some(n=>n.startsWith(e.selected.token)));for(const id of [b.selected.token,restored.token])assert(names.some(n=>n.startsWith(id)));
 }finally{await e.cleanup();}
});
test('shell and document IPC cannot impersonate each other or a document subframe',async()=>{
 const e=await boot({fontSettings:{openInTabs:true},document:true});
 try{
  assert.throws(()=>e.handlers.get('eo:identity')(shellEvent(e)),/registered document main frame/);
  const view=e.documents[0];assert.throws(()=>e.handlers.get('eo:identity')({sender:view,senderFrame:{url:view.getURL()}}),/registered document main frame/);
  await assert.rejects(e.handlers.get('eo:tabs-shell')({sender:view,senderFrame:view.mainFrame},'initial'),/tab shell main frame/);
 }finally{await e.cleanup();}
});
