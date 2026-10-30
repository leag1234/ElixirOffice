// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/Paragraph_Recalculate.js'),'utf8');
const name='Paragraph.prototype.private_RecalculateMoveLineToNextPage';
const start=source.indexOf(name+' = function');assert(start>=0);
let end=source.indexOf('{',start)+1,depth=1;
for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
function run(state){
 const requests=[],raw=[],drawing=[];let lastLine;
 const c=vm.createContext({Paragraph:function(){},CDocument:function(){},CParaLine:function(){},
  recalcresult_CurPage:4,recalcresult_NextPage:8,recalcresultflags_Column:0x10000,
  AscWord:{CellWidowReplay:{request:(owner,p,line,page,direction)=>requests.push({line,page,direction})}}});
 vm.runInContext(source.slice(start,end)+';',c);
 const owner=state.body?new c.CDocument():state.cell?{}:null;
 if(owner)owner.RecalcInfo={Can_RecalcWidowControl:()=>state.can!==false,Set_WidowControl:(p,line)=>raw.push(line)};
 const p=new c.Paragraph();Object.assign(p,{
  Parent:{},Pages:[{StartLine:0,Bounds:{Bottom:99},Set_EndLine(line){lastLine=line;}}],
  Lines:[],private_GetWidowControlOwner:()=>owner,
  private_CheckSkipKeepLinesAndWidowControl:()=>!!state.skip,
  GetPrevDocumentElement:()=>state.previous?{}:null,
  Recalculate_Drawing_AddPageBreak:(...args)=>drawing.push(args)
 });
 const prs={BreakPageLine:!!state.manual,LinePrevBottom:31};
 const result=p.private_RecalculateMoveLineToNextPage(1,0,prs,{WidowControl:state.widow!==false,KeepLines:false});
 return{result,code:prs.RecalcResult,requests,raw,drawing,lastLine};
}
test('eligible first cell paragraph may request current-page replay without a predecessor',()=>{
 const s=run({cell:true});assert.equal(s.result,false);assert.equal(s.code,4|0x10000);
 assert.deepEqual(s.requests,[{line:0,page:0,direction:'current'}]);assert.deepEqual(s.raw,[]);
});
test('eligible later cell paragraph uses the bounded coordinator, not an untracked setter',()=>{
 const s=run({cell:true,previous:true});assert.equal(s.code,4|0x10000);
 assert.deepEqual(s.requests,[{line:0,page:0,direction:'current'}]);assert.deepEqual(s.raw,[]);
});
test('ordinary body owner keeps the existing current-page widow path',()=>{
 const s=run({body:true,previous:true});assert.equal(s.code,4|0x10000);assert.deepEqual(s.raw,[0]);assert.deepEqual(s.requests,[]);
});
test('first body paragraph still requires its ordinary predecessor guard',()=>{
 const s=run({body:true});assert.equal(s.code,8);assert.deepEqual(s.requests,[]);assert.deepEqual(s.raw,[]);
});
for(const [label,state] of [
 ['widow disabled',{cell:true,widow:false}],['explicit break',{cell:true,manual:true}],
 ['existing skip rule',{cell:true,skip:true}],['busy owner',{cell:true,can:false}],['outside eligible owner',{}]
])test(label+' never creates a new cell request',()=>{
 const s=run(state);assert.equal(s.code,8);assert.deepEqual(s.requests,[]);assert.deepEqual(s.raw,[]);
});
