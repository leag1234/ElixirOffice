// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/Paragraph_Recalculate.js'),'utf8');
const start=source.indexOf('Paragraph.prototype.Recalculate_FastWholeParagraph = function');
assert(start>=0);let end=source.indexOf('{',start)+1,depth=1;
for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
function run(state={}){
 const context=vm.createContext({Paragraph:function(){},AscWord:{CellWidowReplay:{shouldUseSlowParagraph:()=>!!state.cellReplay}},tbllayout_AutoFit:0,
  recalcresult_NextElement:1,recalcresult_NextPage:2,paralineinfo_BreakPage:4,paralineinfo_BreakRealPage:8});
 vm.runInContext(source.slice(start,end)+';',context);
 const p=new context.Paragraph();let recalcs=0;
 const other={};
 const localPage={Check_EndSectionPara:q=>!!state.cached&&q===p};
 const pages=[];pages[state.page||0]=localPage;
 const content={Pages:pages,IsHiddenCellEndParagraph:index=>!!state.hidden&&index===0,
  IsHdrFtr:()=>!!state.header,Check_AutoFit:()=>!!state.parentAutoFit};
 const rootContent=state.nested?{Pages:[],IsHiddenCellEndParagraph:()=>false}:content;
 const cell={GetContent:()=>rootContent,GetTable:()=>({Get_CompiledPr:()=>({TablePr:{TableLayout:state.autoFit?0:1}})}),
  IsInHeader:()=>!!state.repeatedHeader};
 if(state.otherMarker)localPage.Check_EndSectionPara=q=>q===other;
 Object.assign(p,{Parent:content,Index:0,bFromDocument:true,Pages:[{Bounds:{Compare:()=>true}}],Lines:[{Info:0}],
  LogicDocument:{Pages:[{Check_EndSectionPara:()=>!!state.bodySectionEnd}]},
  IsTableCellContent:()=>state.body?null:cell,Is_Inline:()=>true,SetIsRecalculated(){},
  GetEndInfo:()=>({Copy:()=>({}),IsEqual:()=>true}),GetRelativeStartPage:()=>state.page||0,GetAbsoluteStartPage:()=>0,GetAbsolutePage:()=>0,
  Recalculate_Page(){recalcs++;return 1}});
 return{pages:[...p.Recalculate_FastWholeParagraph()],recalcs};
}
for(const [name,state] of [
 ['printing-to-hidden cell',{hidden:true}],
 ['hidden-to-printing cell',{cached:true}],
 ['printing-to-hidden cell SDT',{hidden:true,nested:true}],
 ['hidden-to-printing cell SDT',{cached:true,nested:true}],
 ['cached marker on later cell page',{cached:true,page:2}],
 ['semantic marker on later SDT page',{hidden:true,nested:true,page:2}],
])test(name+' falls back before ordinary paragraph geometry is used',()=>{
 assert.deepEqual(run(state),{pages:[],recalcs:0});
});
for(const [name,state] of [
 ['ordinary fixed cell',{}],['another marker in the same cell',{otherMarker:true}],
 ['ordinary body paragraph',{body:true}],
])test(name+' keeps the existing whole-paragraph fast path',()=>{
 assert.deepEqual(run(state),{pages:[0],recalcs:1});
});
for(const [name,state] of [
 ['header',{header:true}],['autofit cell',{autoFit:true}],
 ['repeated table header',{repeatedHeader:true}],['parent autofit',{parentAutoFit:true}],
 ['existing global section end',{body:true,bodySectionEnd:true}],
])test(name+' retains its existing slow-path guard',()=>{
 assert.deepEqual(run(state),{pages:[],recalcs:0});
});

test('eligible cross-page replay guard stops the actual fast method before recalculation',()=>{
 assert.deepEqual(run({cellReplay:true}),{pages:[],recalcs:0});
});
test('cell replay predicate does not alter body fast recalculation',()=>{
 assert.deepEqual(run({body:true,cellReplay:true}),{pages:[0],recalcs:1});
});
