// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/Document.js'),'utf8');
function method(name){
 const prefix='CDocument.prototype.'+name,at=source.indexOf(prefix+' = function');
 const found=at<0?new RegExp(prefix.replaceAll('.','\\.')+'\\s*=\\s*function').exec(source)?.index:at;
 assert(Number.isInteger(found),name);let end=source.indexOf('{',found)+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 return source.slice(found,end)+';';
}
function run(name,needsFull,on=true){
 const stats={fast:0,restart:0,generationChecks:0};
 const c=vm.createContext({CDocument:function(){},document_recalcresult_NoRecal:0,
  document_recalcresult_FastRange:4097,document_recalcresult_LongRecalc:255,
  AscWord:{CellWidowReplay:{beginGeneration(){stats.generationChecks++;return needsFull;}}}});
 vm.runInContext(method(name),c);
 const d=new c.CDocument();
 Object.assign(d,{RecalcId:1,Is_OnRecalculate:()=>on,RecalcInfo:{Paused:false,Is_NeedRecalculateFromStart:()=>false},
  DocumentOutline:{Update(){}},MathTrackHandler:{Update(){}},private_ClearSearchOnRecalculate(){},
  Action:{Start:false},History:{GetNonRecalculatedChanges:()=>[]},
  private_RecalculateFastRunRange(){stats.fast++;return true;},
  private_RecalculateFastParagraph(){throw Error('First fast path already returned');},
  RecalculateFromStart(){stats.restart++;}});
 const result=name==='private_Recalculate'?d[name](undefined):d[name]([],0,0);
 return{...stats,result};
}
for(const method of ['private_Recalculate','RecalculateByChanges']){
 test(method+' restarts completely when a prior cell generation was incomplete',()=>{
  const s=run(method,true);assert.equal(s.fast,0);assert.equal(s.restart,1);assert.equal(s.generationChecks,1);
 });
 test(method+' keeps its ordinary fast path without pending replay',()=>{
  const s=run(method,false);assert.equal(s.fast,1);assert.equal(s.restart,0);
 });
}
test('paused recalculation does not create a new cell generation',()=>{
 const s=run('private_Recalculate',true,false);assert.equal(s.generationChecks,0);assert.equal(s.fast,0);assert.equal(s.result,0);
});
