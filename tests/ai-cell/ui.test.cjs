// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function bar({same=false,word=false}={}){
 let AI={Strings:{en:{}},langOf:()=> 'en',cellText:k=>'cell:'+k},undo=0,reject=0,journal=0,status,actions;
 const window={Common:{ElixirAI:AI}};
 vm.runInNewContext(fs.readFileSync(path.join(process.env.EO_WEB_APPS,'apps/common/main/lib/elixir-ai/View.js'),'utf8'),{window,Common:window.Common,define:(_d,f)=>f(),setTimeout:()=>0,AbortController});
 const ts={canRejectAfterEdit:word?undefined:false,undo:async()=>undo++,reject:async()=>reject++};
 const instance=new AI.CommandBar({toolsetFactory:()=>ts,historyIndex:()=>same?1:2});
 instance.historyIndex=1;instance.result={ctx:{},entry:{id:1}};
 instance.setStatus=(...s)=>status=s;instance.setActions=a=>actions=a;instance.journalOutcome=()=>journal++;instance.finishReview=()=>{};
 return {instance,AI,counts:()=>({undo,reject,journal,status,actions})};
}
test('stale spreadsheet Discard does not undo user edits or reject nonexistent tracked changes',()=>{
 const e=bar();e.instance.discard();const c=e.counts();assert.equal(c.undo,0);assert.equal(c.reject,0);assert.equal(c.journal,0);assert.equal(c.status[0],'cell:staleDiscard');assert(c.actions.some(a=>a.id==='accept'));
});
test('same-history spreadsheet Discard still uses exactly one native Undo',async()=>{
 const e=bar({same:true});e.instance.discard();await new Promise(r=>setImmediate(r));assert.equal(e.counts().undo,1);assert.equal(e.counts().reject,0);
});
test('Word stale Discard retains its existing tracked-change rejection',async()=>{
 const e=bar({word:true});e.instance.discard();await new Promise(r=>setImmediate(r));assert.equal(e.counts().reject,1);assert.equal(e.counts().undo,0);
});

test('actual command-bar failure handler never shows reverted or unchanged when cancellation is unconfirmed',async()=>{
 for(const outcome of ['error','cancelled']){
  const e=bar(),b=e.instance;e.AI.Settings={get:()=>({}),isConfigured:()=>true};
  e.AI.Orchestrator={run:async()=>({ok:false,rollbackUnverified:true,error:Error('Synthetic missing callback'),entry:{outcome}})};
  b.input={value:'Authored request'};b.btnSend={};b.el={classList:{add(){},remove(){}},setAttribute(){}};
  b.reset=()=>{};b.showPanel=()=>{};b.submit();await new Promise(r=>setImmediate(r));
  assert.equal(e.counts().status[0],'cell:rollbackUnverified');assert.equal(e.counts().status[1],true);
 }
});
