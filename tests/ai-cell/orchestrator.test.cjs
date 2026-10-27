// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup({mutated=true,fatal=false,word=false,rollbackFail=false,commitFail=false}={}){
 let ai;
 const window={localStorage:{getItem:()=>null},fetch:()=>assert.fail('Deterministic test forbids network')};
 vm.runInNewContext(fs.readFileSync(path.join(process.env.EO_WEB_APPS,'apps/common/main/lib/elixir-ai/Core.js'),'utf8'),{window,define:(_d,f)=>ai=f(),URL,performance,setTimeout,clearTimeout,AbortController,TextDecoder});
 const ended=[],ctx=word?{scope:'selection',from:1,to:2,context:{blocks:[{},{}]}}:{scope:'range',range:'A1:B3',sheet:'Owned',groupOpen:true,context:{cells:[]}};
 let calls=0,begin=0;
 const messages=[],ts={id:word?'word':'cell',tools:[],init:async()=>ctx,scopeInfo:c=>({kind:c.scope,address:c.range,sheet:c.sheet}),systemPrompt:()=>'',userMessage:()=>'',isMutating:n=>n==='write_formula',validate:()=>null,execute:async()=>({ok:!fatal,mutated,fatal,error:fatal?{message:'uncertain mutation'}:undefined}),begin:async()=>begin++,requireConfirmedRollback:!word,end:async(c,ok)=>{ended.push(ok);if(ok&&commitFail){c.rollbackUnverified=true;throw Error('Commit callback missing');}if(!ok&&rollbackFail)throw Error('Cancel callback missing');},untrackedNote:()=>null,didMutate:(n,r)=>r.mutated===true,verifyState:async()=>({cells:[]}),verificationInstructions:()=> 'Verify formulas, values, dates, visible rows, charts and pivots.'};
 if(word){delete ts.scopeInfo;delete ts.didMutate;delete ts.verificationInstructions;}
 ai.Journal.add=async()=>1;ai.Connector.chat=async o=>{messages.push(o.messages.map(x=>x.content));return{ms:1,usage:{},message:{role:'assistant',content:'',tool_calls:++calls===1?[{id:'1',function:{name:'write_formula',arguments:'{}'}}]:[]}};};
 return {run:()=>ai.Orchestrator.run({instruction:'Authored fixture',toolset:ts,settings:{endpoint:'https://example.invalid/v1',model:'synthetic',mode:'scaffold',verify:'always',maxRounds:4}}),ended,messages,begin:()=>begin};
}
test('cell context needs no Word blocks, recognizes an early group and uses cell verification',async()=>{
 const e=setup(),r=await e.run();assert.equal(r.ok,true);assert.equal(r.changed,true);assert.equal(r.entry.scope.address,'A1:B3');assert.equal(e.begin(),0);assert.deepEqual(e.ended,[true]);assert(e.messages.flat().some(m=>m.includes('Verify formulas, values')));
});
test('cell no-op keeps changed false and still closes its read-only early group',async()=>{
 const e=setup({mutated:false}),r=await e.run();assert.equal(r.ok,true);assert.equal(r.changed,false);assert.deepEqual(e.ended,[true]);
});
test('uncertain cell mutation aborts and cancels the whole action instead of reporting success',async()=>{
 const e=setup({fatal:true}),r=await e.run();assert.equal(r.ok,false);assert.equal(r.changed,false);assert.deepEqual(e.ended,[false]);
});
test('Word adapter without optional hooks retains lazy grouping and its existing scope and verification wording',async()=>{
 const e=setup({word:true}),r=await e.run();assert.equal(r.ok,true);assert.equal(r.changed,true);assert.equal(r.entry.scope.blocks,2);assert.equal(e.begin(),1);assert.deepEqual(e.ended,[true]);assert(e.messages.flat().some(m=>m.includes('text, styles, alignment')));
});
test('unconfirmed spreadsheet rollback never claims the workbook was reverted',async()=>{
 const e=setup({fatal:true,rollbackFail:true}),r=await e.run();assert.equal(r.ok,false);assert.equal(r.rollbackUnverified,true);assert.equal(r.changed,true);assert.equal(r.entry.rollbackUnverified,true);
});
test('a commit callback failure is caught and reported as unconfirmed, rather than escaping the command UI',async()=>{
 const e=setup({commitFail:true}),r=await e.run();assert.equal(r.ok,false);assert.equal(r.rollbackUnverified,true);
});
test('Word retains its original finalization rejection boundary without opting into Cell cleanup semantics',async()=>{
 const e=setup({word:true,commitFail:true});await assert.rejects(e.run(),/Commit callback missing/);
});
