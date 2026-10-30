// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Tests execute the actual source methods; callees supply controlled return codes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const read=file=>fs.readFileSync(path.join(process.env.EO_SDKJS,file),'utf8');
const documentSource=read('word/Editor/Document.js');
const constants=[...documentSource.matchAll(/^var (recalcresult\w*)\s*=\s*([^;]+);/gm)]
 .map(m=>'var '+m[1]+'='+m[2]+';').join('\n');
function method(file,name){
 const source=read(file),start=source.indexOf(name+' = function');
 assert(start>=0,name);let end=source.indexOf('{',start)+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 return source.slice(start,end)+';';
}
function context(){
 const c=vm.createContext({CTable:function(){},CBlockLevelSdt:function(){},AscWord:{CCellWidowReplayProtocol:{QualificationError:class CellWidowQualificationError extends Error{}}},recalcresult2_CellReplayRequested:8,window:{AscCommon:{g_specialPasteHelper:null}}});
 vm.runInContext(constants,c);return c;
}
function tableResult(code,page=1){
 const c=context();vm.runInContext(method('word/Editor/Table/TableRecalculate.js','CTable.prototype.Recalculate_Page'),c);
 const t=new c.CTable();let y=0,resets=0;
 Object.assign(t,{InvalidateInteractionGeometry(){},RecalculateKeepNext:()=>c.recalcresult_NextElement,
  SetIsRecalculated(){},private_RecalculateGrid(){},private_RecalculateBorders(){},private_RecalculateHeader(){},
  private_RecalculatePageXY(){},private_RecalculateCheckPageColumnBreak:()=>true,private_RecalculatePositionX(){},
  private_RecalculatePage:()=>code,private_RecalculatePositionY(){y++},Sections:[{endPage:77}],
  RecalcInfo:{Reset(){resets++}},GetId:()=>9});
 const result=t.Recalculate_Page(page);
 return{result,y,resets,sectionEnd:t.Sections[0].endPage};
}
function sdtResult(code,state=false,valid=true){
 const c=context();vm.runInContext(method('word/Editor/StructuredDocumentTags/BlockLevel.js','CBlockLevelSdt.prototype.Recalculate_Page'),c);
 const s=new c.CBlockLevelSdt();
 Object.assign(s,{SetIsRecalculated(){},RecalculateKeepNext:()=>c.recalcresult_NextElement,
  Parent:{RecalcInfo:{}},Sections:[{endPage:77}],Content:{Recalculate_Page:()=>code,GetPagesCount:()=>2,HasCellWidowReplayRequest:()=>valid},GetId:()=>11});
 const result=s.Recalculate_Page(0);return state?{result,sectionEnd:s.Sections[0].endPage}:result;
}
test('existing table current-page result exits before committing row position',()=>{
 assert.deepEqual(tableResult(4),{result:4,y:0,resets:0,sectionEnd:77});
});
test('existing table finished page commits its position and resets',()=>{
 assert.deepEqual(tableResult(1),{result:1,y:1,resets:1,sectionEnd:1});
});
test('existing table forward page keeps its ordinary position path',()=>{
 assert.deepEqual(tableResult(8),{result:8,y:1,resets:0,sectionEnd:1});
});
for(const page of [0,1])test('table rewind must not commit positionY or section end on local page'+page,()=>{
 assert.deepEqual(tableResult(2,page),{result:2,y:0,resets:0,sectionEnd:77});
});
for(const [input,expected] of [[0,1],[1,8],[2,4],[3,256],[4,512],[5,2],[5|0x30000,2|0x30000]])
 test('existing SDT conversion '+input+' is preserved',()=>assert.equal(sdtResult(input),expected));
for(const flags of [0,0x10000,0x20000,0x30000])
 test('new dedicated cell result2 status cannot become successful SDT completion, flags'+flags,()=>{
  assert.equal(sdtResult(8|flags),2|flags);
 });
test('pending cell replay must not commit an SDT section end',()=>{
 assert.deepEqual(sdtResult(8,true),{result:2,sectionEnd:77});
});
test('audited result2 transport8 avoids old table Next/Cur bit tests',()=>{
 const c=context();
 assert(![c.recalcresult2_End,c.recalcresult2_NextPage,c.recalcresult2_CurPage,c.recalcresult2_NextSection,c.recalcresult2_NextSection_Cur,c.recalcresult2_PrevPage].includes(8));
 assert.equal(8&c.recalcresult2_NextPage,0);assert.equal(8&c.recalcresult2_CurPage,0);
 assert.equal(c.recalcresult2_PrevPage&c.recalcresult2_NextPage,1,'old5 is unsafe as an unconverted table result');
});

test('unauthenticated dedicated cell SDT result is a qualification failure',()=>{
 assert.throws(()=>sdtResult(8,false,false),e=>e.constructor.name==='CellWidowQualificationError');
});
for(const name of ['word','cell','slide','visio'])test(name+' registers replay helpers in shared document dependency order',()=>{
 const config=read('configs/'+name+'.json');
 const base=config.indexOf('word/Editor/DocumentContentBase.js');
 const state=config.indexOf('word/Editor/CellWidowReplay.js');
 const controller=config.indexOf('word/Editor/CellWidowReplayController.js');
 const document=config.indexOf('word/Editor/Document.js');
 assert(base>=0 && state>base && controller>state && document>controller);
});

test('root content ledger/cache entry observes freshly updated page limits before paragraph work',()=>{
 const source=read('word/Editor/DocumentContent.js');
 const start=source.indexOf('CDocumentContent.prototype.Recalculate_Page = function');
 const frame=source.indexOf('this.Pages[PageIndex].Update_Limits(contentFrame);',start);
 const tick=source.indexOf('AscWord.CellWidowReplay.tickContent(this);',start);
 const loop=source.indexOf('for (var Index = StartIndex;',frame);
 assert(start>=0 && frame>start && tick>frame && tick<loop);
});
