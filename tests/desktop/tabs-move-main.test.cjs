// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{randomUUID}=require('node:crypto');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
let point={x:0,y:0};
const code=fs.readFileSync(helper,'utf8').replace('const electron={clipboard:','const electron={screen:screenFixture,clipboard:')
 .replace('getContentSize(){return [1360,960]}',"getContentSize(){return [1360,960]} getBounds(){return this.bounds||{x:0,y:0,width:1360,height:960}} getContentBounds(){return this.getBounds()} setPosition(x,y){this.bounds={...this.getBounds(),x,y}}");
vm.runInNewContext(code+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate,screenFixture:{getCursorScreenPoint:()=>point,getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1440,height:1000}})}});
const {boot}=scope.exports;
const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
const tabs=(env,window,command,...args)=>env.handlers.get('eo:tabs-shell')(event(window),command,...args);
async function prepare(env){assert.equal(await env.invoke('new','xlsx'),null);const b=env.documents.at(-1);return {b,selection:await env.invokeFor(b,'initial'),a:await env.invoke('identity')};}
test('actual main detach retains document sender and token, with save and close routed to its new owner',async()=>{
 const e=await boot({document:true});
 try{
  const {b,a}=await prepare(e),view=e.documents[0],originalToken=e.selected.token;
  const moved=await tabs(e,e.shell,'detach',a.documentId),target=e.windows.at(-1);
  assert.equal(moved.documentId,a.documentId);assert.notEqual(moved.windowId,a.windowId);
  assert.deepEqual(await e.invoke('identity'),moved);assert.equal(view.isDestroyed(),false);
  await assert.rejects(tabs(e,e.shell,'close',a.documentId),/not in this window/);
  const snapshot=(await tabs(e,target,'initial')).state;assert.deepEqual(snapshot.documents.map(d=>d.id),[a.documentId]);
  const saved=await e.invoke('save',originalToken,new Uint8Array(Buffer.from('PKmoved-public-save')),false);assert(saved.artifactId);
  assert.equal(await fsp.readFile(path.join(e.directory,'test.docx'),'utf8'),'PKmoved-public-save');
  assert.equal(await tabs(e,target,'close',a.documentId),true);assert.equal(target.closed,true);assert.equal(e.shell.closed,undefined);assert.equal(b.isDestroyed(),false);
 }finally{await e.cleanup();}
});
test('a pending move prevents close and another file operation until its renderer guard settles',async()=>{
 let hold=false,release;const e=await boot({document:true,getRendererState:(_expression,wc)=>hold?new Promise(resolve=>{release=()=>resolve({...wc.state,opening:false})}):({...wc.state,opening:false})});
 try{
  const {a}=await prepare(e);hold=true;
  const pending=tabs(e,e.shell,'detach',a.documentId);
  for(let n=0;n<100&&!release;n++)await new Promise(setImmediate);assert(release);
  assert.equal(await e.invoke('close-tab'),false);await assert.rejects(e.invoke('new','docx'),/Another file operation/);
  hold=false;release();assert.equal((await pending).documentId,a.documentId);assert.equal(e.documents[0].isDestroyed(),false);
 }finally{release?.();await e.cleanup();}
});
test('drag completion uses trusted main cursor and one-use capability for detach and reattach',async()=>{
 const e=await boot({document:true});
 try{
  const {a}=await prepare(e),one=randomUUID();
  assert.equal(await tabs(e,e.shell,'begin-drag',a.documentId,one),true);point={x:1400,y:500};
  const moved=await tabs(e,e.shell,'end-drag',one),detached=e.windows.at(-1);assert.notEqual(moved.windowId,a.windowId);
  assert.equal(await tabs(e,e.shell,'end-drag',one),false);assert.equal(e.windows.length,2);
  const two=randomUUID();assert.equal(await tabs(e,detached,'begin-drag',a.documentId,two),true);
  point={x:200,y:500};assert.equal(await tabs(e,e.shell,'drop-drag',two),false,'A drop outside the target tab strip cannot consume the drag');
  point={x:200,y:20};assert.equal((await tabs(e,e.shell,'drop-drag',two)).windowId,a.windowId);
  assert.equal(detached.closed,true);assert.equal((await tabs(e,e.shell,'initial')).state.documents.length,2);
  assert.equal(await tabs(e,e.shell,'end-drag',two),false);
 }finally{await e.cleanup();}
});
