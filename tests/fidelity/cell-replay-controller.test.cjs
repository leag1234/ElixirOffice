// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
class CDocument {
 constructor(){this.Content=[];this.RecalcId=1;this.word=true;}
 GetRecalcId(){return this.RecalcId;}
 IsDocumentEditor(){return this.word;}
}
class CDocumentContent {
 constructor(parent){
  this.Parent=parent;this.Content=[];
  this.Pages=[{X:0,Y:0,XLimit:100,YLimit:100},{X:0,Y:0,XLimit:100,YLimit:100}];
  this.RecalcInfo={WidowControlParagraph:null,WidowControlLine:-1,WidowControlReset:false,
   FlowObject:{sentinel:true},Set_WidowControl(p,line){this.WidowControlParagraph=p;this.WidowControlLine=line;}};
 }
 GetDocumentContentForRecalcInfo(){
  let c=this;while(c.Parent instanceof CBlockLevelSdt)c=c.Parent.Parent;return c;
 }
 Recalculate_Page(){return 0;}
}
class CBlockLevelSdt {
 constructor(parent){this.Parent=parent;this.Index=0;this.Content=new CDocumentContent(this);}
}
const c=vm.createContext({window:{AscWord:{},Asc:{linerule_Exact:1}},
 CDocument,CDocumentContent,CBlockLevelSdt,vmerge_Continue:2,recalcresult_PrevPage:2,
 recalcresult2_CellReplayRequested:8,recalcresult2_End:0,recalcresult2_NextPage:1,recalcresult2_CurPage:2,
 recalcresultflags_Column:0x10000,recalcresultflags_Page:0x20000});
for(const name of ['CellWidowReplay.js','CellWidowReplayController.js'])
 vm.runInContext(fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor',name),'utf8'),c);
const api=c.window.AscWord.CellWidowReplay;
assert.equal(typeof api,'object');
const isQualification=e=>e.name==='CellWidowQualificationError';
function fixture(){
 const doc=new CDocument();
 const table={Parent:doc,Index:0,LogicDocument:doc,Content:[],HeaderInfo:{Count:0},PageNum:0,inline:true,
  Is_Inline(){return this.inline;},GetAbsolutePage(p){return this.PageNum+p;}};
 const row={Index:0,Table:table,Content:[],rule:0,Get_Height(){return{HRule:this.rule};}};
 const cell={Row:row,Index:0,Content:null,vertical:false,header:false,merge:1,
  GetTable:()=>table,IsVerticalText(){return this.vertical;},IsInHeader(){return this.header;},GetVMerge(){return this.merge;}};
 const owner=cell.Content=new CDocumentContent(cell);
 const paragraph={Parent:owner,Index:0,Pages:[{StartLine:0}]};owner.Content=[paragraph];
 row.Content=[cell];table.Content=[row];doc.Content=[table];
 return{doc,table,row,cell,owner,paragraph,element:table};
}
function run(s,fn,{column=0,columns=1,page=1}={}){
 return api.withDocument(s.doc,s.element,page,column,columns,fn);
}
function request(s,flags=0){
 let packet;
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   assert.equal(api.getOwner(s.owner),s.owner);
   api.request(s.owner,s.paragraph,0,0);
   assert.equal(api.hasRequest(s.owner),true);
   return 8|flags;
  };
  packet=api.calculateCell(s.table,s.cell,1,1);
 });
 return packet;
}
test('no scheduler capability means no owner frame',()=>{
 const s=fixture();assert.equal(api.enterCell(s.table,s.cell,1,1),null);
 assert.equal(api.getOwner(s.owner),null);
});
test('live direct body cell is active only inside the actual delegate',()=>{
 const s=fixture();let calls=0;
 s.owner.Recalculate_Page=(page,start)=>{calls++;assert.equal(page,1);assert.equal(start,true);assert.equal(api.getOwner(s.owner),s.owner);return 0;};
 const packet=run(s,()=>api.calculateCell(s.table,s.cell,1,1));
 assert.equal(packet.result,0);assert.equal(calls,1);assert.equal(api.getOwner(s.owner),null);
 assert.equal(api.snapshot(s.doc).failed,false);
});
test('body SDT ancestry must have exact live membership',()=>{
 const s=fixture(),tag=new CBlockLevelSdt(s.doc);
 s.doc.Content=[tag];tag.Content.Content=[s.table];s.table.Parent=tag.Content;s.element=tag;
 run(s,()=>{const frame=api.enterCell(s.table,s.cell,1,1);assert(frame);assert.equal(api.getOwner(s.owner),s.owner);api.leaveCell(frame,0);});
});
test('cell SDT resolves to the same active root',()=>{
 const s=fixture(),tag=new CBlockLevelSdt(s.owner);s.owner.Content=[tag];tag.Content.Content=[s.paragraph];s.paragraph.Parent=tag.Content;
 run(s,()=>{const frame=api.enterCell(s.table,s.cell,1,1);assert.equal(api.getOwner(tag.Content),s.owner);api.leaveCell(frame,0);});
});
for(const [name,alter] of [
 ['floating table',s=>s.table.inline=false],
 ['detached real-LogicDocument preview',s=>s.table.Parent=new CDocumentContent(null)],
 ['wrong body membership',s=>s.doc.Content=[{}]],
 ['wrong current body element',s=>s.element={}],
 ['presentation document',s=>s.doc.word=false],
 ['vertical text',s=>s.cell.vertical=true],
 ['repeated-header cell',s=>s.cell.header=true],
 ['repeated-header table',s=>s.table.HeaderInfo.Count=1],
 ['exact-height row',s=>s.row.rule=1],
 ['vertical merge continuation',s=>s.cell.merge=2],
 ['header clone identity',s=>s.row.Content=[{...s.cell}]],
 ['nested cell table',s=>s.table.Parent=new CDocumentContent({})],
])test(name+' cannot acquire replay capability',()=>{
 const s=fixture();alter(s);run(s,()=>assert.equal(api.enterCell(s.table,s.cell,1,1),null));
 assert.equal(api.getOwner(s.owner),null);assert.equal(api.snapshot(s.doc).requestsUsed,0);
});
test('multiple columns stay on the existing path',()=>{
 const s=fixture();run(s,()=>assert.equal(api.enterCell(s.table,s.cell,1,1),null),{columns:2});
});
test('request mapping is explicit and does not mutate row geometry',()=>{
 const s=fixture();s.table.RowsInfo={sentinel:77};const packet=request(s,0x10000);
 assert.equal(api.getOwner(s.owner),null);
 assert.deepEqual({...api.rewind(packet.context)},{result:2|0x10000,tablePage:0,documentPage:0,rowIndex:0});
 assert.deepEqual(s.table.RowsInfo,{sentinel:77});assert.equal(api.snapshot(s.doc).pending,1);
});
test('the matched cut consumes only under its original cell',()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 run(s,()=>{s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;};api.calculateCell(s.table,s.cell,0,0);},{page:0});
 assert.equal(api.snapshot(s.doc).pending,0);assert.equal(api.snapshot(s.doc).failed,false);
});
test('a request lost as ordinary completion is a qualification failure',()=>{
 const s=fixture();run(s,()=>{
  s.owner.Recalculate_Page=()=>{api.request(s.owner,s.paragraph,0,0);return 0;};
  assert.throws(()=>api.calculateCell(s.table,s.cell,1,1),isQualification);
 });
 assert.equal(api.getOwner(s.owner),null);
});
test('frame cleanup occurs when the actual callee throws',()=>{
 const s=fixture(),failure=new Error('original callee error');
 run(s,()=>{s.owner.Recalculate_Page=()=>{throw failure;};assert.throws(()=>api.calculateCell(s.table,s.cell,1,1),e=>e===failure);});
 assert.equal(api.getOwner(s.owner),null);
});
test('same generation callbacks preserve the global work ledger',()=>{
 const s=fixture();
 run(s,()=>api.calculateCell(s.table,s.cell,1,1));const before=api.snapshot(s.doc).workUsed;
 run(s,()=>api.calculateCell(s.table,s.cell,1,1));assert(api.snapshot(s.doc).workUsed>before);
});
test('new generation clears only owned widow state, preserving flow state',()=>{
 const s=fixture();request(s);const flow=s.owner.RecalcInfo.FlowObject;s.doc.RecalcId++;s.owner.Recalculate_Page=()=>0;
 run(s,()=>api.calculateCell(s.table,s.cell,1,1));
 assert.equal(s.owner.RecalcInfo.WidowControlParagraph,null);assert.equal(s.owner.RecalcInfo.WidowControlLine,-1);
 assert.equal(s.owner.RecalcInfo.FlowObject,flow);assert.equal(api.snapshot(s.doc).pending,0);
});
test('an active stale generation fails instead of disabling widow',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);s.doc.RecalcId++;
  assert.throws(()=>api.getOwner(s.owner),isQualification);api.leaveCell(frame,undefined);
 });
});
test('a foreign paragraph cannot register under this owner',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  assert.throws(()=>api.request(s.owner,{Parent:new CDocumentContent(null),Index:0,Pages:[{StartLine:0}]},0,0),isQualification);
  api.leaveCell(frame,undefined);
 });
});
test('rewind cannot underflow the first table page',()=>{
 const s=fixture();let packet;
 run(s,()=>{s.owner.Recalculate_Page=()=>{api.request(s.owner,s.paragraph,0,0);return 8;};packet=api.calculateCell(s.table,s.cell,0,0);},{page:0});
 assert.throws(()=>api.rewind(packet.context),isQualification);
});
test('recursive content ticks are bounded without another frame',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  assert.throws(()=>{for(let i=0;i<131073;i++)api.tickContent(s.owner);},isQualification);
  api.leaveCell(frame,undefined);
 });
 assert.equal(api.getOwner(s.owner),null);assert.equal(api.snapshot(s.doc).failed,true);
});
test('a stale scheduler capability cannot admit a new cell frame',()=>{
 const s=fixture();run(s,()=>{
  s.doc.RecalcId++;let unexpected;
  try{assert.throws(()=>{unexpected=api.enterCell(s.table,s.cell,1,1);},isQualification);}
  finally{if(unexpected)api.leaveCell(unexpected,undefined);}
 });
});
test('a restored outer capability retains its original generation',()=>{
 const s=fixture();run(s,()=>{
  s.doc.RecalcId++;run(s,()=>{});let unexpected;
  try{assert.throws(()=>{unexpected=api.enterCell(s.table,s.cell,1,1);},isQualification);}
  finally{if(unexpected)api.leaveCell(unexpected,undefined);}
 });
});
test('nested unsupported scheduling shadows an outer capability',()=>{
 const s=fixture();run(s,()=>run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  if(frame)api.leaveCell(frame,undefined);
  assert.equal(frame,null);
 },{columns:2}));
});
test('an outer active owner is not eligible inside an unsupported nested scope',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  try{run(s,()=>assert.equal(api.getOwner(s.owner),null),{columns:2});}
  finally{api.leaveCell(frame,undefined);}
 });
});
test('another supported root scope cannot inherit this cell active owner',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1),saved=s.element;s.element={};
  try{run(s,()=>assert.equal(api.getOwner(s.owner),null));}
  finally{s.element=saved;api.leaveCell(frame,undefined);}
 });
});
test('eligibility depth exhaustion fails qualification instead of disabling widow',()=>{
 const s=fixture();let parent=s.doc,top;
 for(let i=0;i<34;i++){
  const tag=new CBlockLevelSdt(parent);parent.Content=[tag];if(!top)top=tag;parent=tag.Content;
 }
 parent.Content=[s.table];s.table.Parent=parent;s.element=top;
 run(s,()=>assert.throws(()=>api.enterCell(s.table,s.cell,1,1),isQualification));
});
test('a cyclic transparent-owner chain is a qualification failure',()=>{
 const s=fixture(),tag=new CBlockLevelSdt(s.doc);
 tag.Parent=tag.Content;tag.Content.Content=[tag,s.table];s.table.Index=1;s.table.Parent=tag.Content;s.element=tag;
 run(s,()=>assert.throws(()=>api.enterCell(s.table,s.cell,1,1),isQualification));
});
test('current-page orphan repair replays without a backward page mapping',()=>{
 const s=fixture();let packet;
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{api.request(s.owner,s.paragraph,0,0,'current');return 2|0x10000;};
  packet=api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 assert.equal(packet.result,2|0x10000);assert.equal(api.requiresRecalculation(packet.context),true);
 assert.equal(api.snapshot(s.doc).pending,1);
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;};
  api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 assert.equal(api.snapshot(s.doc).pending,0);
});
test('a local recursive cell pass may consume its cut before returning',()=>{
 const s=fixture();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   api.request(s.owner,s.paragraph,0,0,'current');
   api.tickContent(s.owner);s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;
  };
  api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 assert.equal(api.snapshot(s.doc).pending,0);assert.equal(api.snapshot(s.doc).failed,false);
});
test('the coordinator restores its pending cut after a core info reset',()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 s.owner.RecalcInfo.WidowControlParagraph=null;s.owner.RecalcInfo.WidowControlLine=-1;
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   assert.equal(s.owner.RecalcInfo.WidowControlParagraph,s.paragraph);
   assert.equal(s.owner.RecalcInfo.WidowControlLine,0);
   s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;
  };
  api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 assert.equal(api.snapshot(s.doc).pending,0);
});
test('an earlier cell return frame cannot steal a later request',()=>{
 const s=fixture(),first=request(s);api.rewind(first.context);
 run(s,()=>{s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;};api.calculateCell(s.table,s.cell,0,0);},{page:0});
 s.paragraph={Parent:s.owner,Index:0,Pages:[{StartLine:0}]};s.owner.Content=[s.paragraph];
 s.owner.RecalcInfo.WidowControlReset=false;request(s);
 assert.throws(()=>api.rewind(first.context),isQualification);
});
test('rollback signatures use the owning page even if paragraph pages were discarded',()=>{
 const s=fixture();s.paragraph.Pages=[];
 const packet=request(s);assert.equal(packet.result,8);assert.equal(api.snapshot(s.doc).pending,1);
});
test('a non-integer paragraph page cannot enter a request signature',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  assert.throws(()=>api.request(s.owner,s.paragraph,0,NaN),isQualification);
  api.leaveCell(frame,undefined);
 });
});
test('unknown replay direction cannot silently become a previous-page request',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);
  assert.throws(()=>api.request(s.owner,s.paragraph,0,0,'sideways'),isQualification);
  api.leaveCell(frame,undefined);
 });
});
test('a new generation with pending work requires a complete document restart',()=>{
 const s=fixture();request(s);s.doc.RecalcId++;
 assert.equal(api.beginGeneration(s.doc),true);
 assert.equal(api.snapshot(s.doc).pending,0);assert.equal(s.owner.RecalcInfo.WidowControlParagraph,null);
 assert.equal(api.beginGeneration(s.doc),false);
});
test('same-generation callbacks never cancel an outstanding request',()=>{
 const s=fixture();request(s);assert.equal(api.beginGeneration(s.doc),false);
 assert.equal(api.snapshot(s.doc).pending,1);
});
test('an aborted cell calculation forces a full restart in the next generation',()=>{
 const s=fixture();run(s,()=>{
  s.owner.Recalculate_Page=()=>{throw Error('aborted native calculation');};
  assert.throws(()=>api.calculateCell(s.table,s.cell,1,1));
 });
 assert.equal(api.snapshot(s.doc).failed,true);s.doc.RecalcId++;
 assert.equal(api.beginGeneration(s.doc),true);assert.equal(api.snapshot(s.doc).failed,false);
});
for(const invalid of [undefined,NaN])test('invalid eligible cell return '+invalid+' is never ordinary success',()=>{
 const s=fixture();run(s,()=>{
  s.owner.Recalculate_Page=()=>invalid;
  assert.throws(()=>api.calculateCell(s.table,s.cell,1,1),isQualification);
 });
 assert.equal(api.snapshot(s.doc).failed,true);
});
test('stale frame cleanup cannot clear newer-generation widow state',()=>{
 const s=fixture();run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,1,1);s.doc.RecalcId++;
  run(s,()=>{});
  const newer={};s.owner.RecalcInfo.WidowControlParagraph=newer;
  assert.throws(()=>api.leaveCell(frame,undefined),isQualification);
  assert.equal(s.owner.RecalcInfo.WidowControlParagraph,newer);
 });
});

function fastFixture(){
 const s=fixture();
 s.table.ColumnsCount=1;
 s.paragraph.Pages=[{StartLine:0},{StartLine:1}];
 s.paragraph.IsTableCellContent=returnCell=>returnCell?s.cell:true;
 s.paragraph.Get_CompiledPr2=()=>({ParaPr:{WidowControl:true}});
 return s;
}
test('cross-page eligible widow cell requires slow paragraph without creating a pass',()=>{
 const s=fastFixture();
 const before={...api.snapshot(s.doc)};
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),true);
 assert.deepEqual({...api.snapshot(s.doc)},before);
 assert.equal(s.owner.RecalcInfo.WidowControlParagraph,null);
});
test('one-page ordinary widow cell keeps fast paragraph path',()=>{
 const s=fastFixture();s.paragraph.Pages=[{StartLine:0}];
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),false);
});
test('cross-page placeholder page still requires slow paragraph path',()=>{
 const s=fastFixture();s.paragraph.Pages=[{StartLine:0,EndLine:-1},{StartLine:0}];
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),true);
});
for(const [name,alter] of [
 ['widow off',s=>s.paragraph.Get_CompiledPr2=()=>({ParaPr:{WidowControl:false}})],
 ['body paragraph',s=>s.paragraph.IsTableCellContent=()=>null],
 ['two columns',s=>s.table.ColumnsCount=2],
 ['non-Word document',s=>s.doc.word=false],
 ['floating table',s=>s.table.inline=false],
 ['detached preview',s=>s.table.Parent=new CDocumentContent(null)],
 ['stale paragraph identity',s=>s.owner.Content=[{}]],
 ['wrong cell identity',s=>s.row.Content=[{}]],
 ['vertical text',s=>s.cell.vertical=true],
 ['header cell',s=>s.cell.header=true],
 ['repeated header',s=>s.table.HeaderInfo.Count=1],
 ['exact row height',s=>s.row.rule=1],
 ['vertical merge continuation',s=>s.cell.merge=2],
])test('fast guard excludes '+name+' without altering replay state',()=>{
 const s=fastFixture();alter(s);
 const before={...api.snapshot(s.doc)};
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),false);
 assert.deepEqual({...api.snapshot(s.doc)},before);
});
test('pending cut requires full paragraph even after pages and widow setting change',()=>{
 const s=fastFixture();request(s);
 s.paragraph.Pages=[{StartLine:0}];
 s.paragraph.Get_CompiledPr2=()=>({ParaPr:{WidowControl:false}});
 const before={...api.snapshot(s.doc)};
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),true);
 assert.deepEqual({...api.snapshot(s.doc)},before);
});
test('pending request for another paragraph does not disable this one-page fast path',()=>{
 const s=fastFixture();request(s);
 const other={Parent:s.owner,Index:1,Pages:[{StartLine:0}],
 IsTableCellContent:()=>s.cell,Get_CompiledPr2:()=>({ParaPr:{WidowControl:true}})};
 s.owner.Content.push(other);
 assert.equal(api.shouldUseSlowParagraph(other),false);
});
test('fast guard accepts live body SDT ancestry without allocating a generation',()=>{
 const s=fastFixture(),tag=new CBlockLevelSdt(s.doc);
 s.doc.Content=[tag];tag.Content.Content=[s.table];s.table.Parent=tag.Content;
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),true);
 assert.equal(api.snapshot(s.doc).workUsed,0);
});

function actualParagraphFixture(){
 const s=fixture();
 c.Paragraph=function(){};c.CParaLine=function(){};
 Object.assign(c,{AscWord:c.window.AscWord,recalcresult_NextElement:1,recalcresult_NextPage:8,recalcresult_CurPage:4,
  recalcresult_NextSection:256});
 c.window.AscCommon={};
 const read=name=>fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor',name),'utf8');
 function extract(source,needle){
  const start=source.indexOf(needle);assert(start>=0,needle);
  const open=source.indexOf('{',start);let end=open+1,depth=1;
  for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  return source.slice(start,end);
 }
 const source=read('Paragraph_Recalculate.js');
 for(const name of ['Recalculate_Page','private_RecalculateLineWidow','private_GetWidowControlOwner','private_RecalculateMoveLineToNextPage']){
  const match=new RegExp('Paragraph\\.prototype\\.'+name+'\\s*=\\s*function').exec(source);assert(match);
  vm.runInContext(extract(source,match[0])+';',c);
 }
 const document=read('Document.js');
 for(const name of ['Reset_WidowControl','Need_ResetWidowControl','Check_WidowControl','Set_WidowControl']){
  const match=new RegExp(name+'\\s*:\\s*function').exec(document);assert(match);
  s.owner.RecalcInfo[name]=vm.runInContext('({'+extract(document,match[0])+'}).'+name,c);
 }
 const p=s.paragraph;Object.setPrototypeOf(p,c.Paragraph.prototype);
 for(const name of ['ShapeText','HyphenateText','Clear_NearestPosArray','SetIsRecalculated','RequestSpellCheck','RecalculateEndInfo','private_CheckColumnBreak','UpdateLineNumbersInfo'])
  p[name]=()=>{};
 p.FontMap={};p.CurPos={};p.Sections=[{}];p.Get_SectionPr=()=>undefined;
 p.Pages=[{StartLine:0,Set_EndLine(line){this.EndLine=line;}}];p.Lines=[];
 p.private_RecalculatePage=()=>{
  const prs={};
  return p.private_RecalculateLineWidow(0,0,prs,{})===false?prs.RecalcResult:1;
 };
 return s;
}
function actualCurrentReplay(){
 const s=actualParagraphFixture();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{api.request(s.owner,s.paragraph,0,0,'current');return 2|0x10000;};
  api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 s.owner.Recalculate_Page=()=>{
  const code=s.paragraph.Recalculate_Page(0);
  assert.equal(code,8|0x10000,'actual matched cut produces the empty first fragment');
  assert.equal(s.owner.RecalcInfo.WidowControlReset,false,'actual Paragraph method has already reset its flag before content returns');
  assert.equal(s.owner.RecalcInfo.WidowControlParagraph,null);
  return 1;
 };
 run(s,()=>api.calculateCell(s.table,s.cell,0,0),{page:0});
 return s;
}
test('actual Paragraph reset cannot hide matched-cut consumption from the cell protocol',()=>{
 const s=actualCurrentReplay();
 assert.equal(api.snapshot(s.doc).pending,0,'consumption must be acknowledged before Paragraph clears the old reset flag');
 assert.equal(api.snapshot(s.doc).requestsUsed,1);
});
test('next page after actual empty first fragment must not rehydrate the consumed cut',()=>{
 const s=actualCurrentReplay();
 s.owner.Recalculate_Page=()=>{
  assert.equal(s.paragraph.Recalculate_Page(0),1,'fresh cell placement must make progress; never repeat an already consumed cut');
  return 0;
 };
 run(s,()=>api.calculateCell(s.table,s.cell,1,0),{page:1});
 assert.equal(api.snapshot(s.doc).pending,0);
 assert.equal(api.snapshot(s.doc).failed,false);
});

test('reset flag alone is not an authenticated matched-cut acknowledgment',()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;return 1;};
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});
for(const kind of ['wrong line','wrong paragraph'])test('cut acknowledgment rejects '+kind,()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   s.owner.RecalcInfo.WidowControlReset=true;
   api.consumeCut(s.owner,kind==='wrong paragraph'?{}:s.paragraph,kind==='wrong line'?1:0);
   return 1;
  };
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:0});
});

function overflowingFirstCell(s){
 const p=s.paragraph;
 // Drawing and other layout concerns are controlled; real cut/first-orphan/reset
 // source methods execute, including their authenticated coordinator calls.
 p.Recalculate_Drawing_AddPageBreak=()=>{};
 p.private_CheckSkipKeepLinesAndWidowControl=()=>false;
 p.GetPrevDocumentElement=()=>null;
 s.owner.RecalcInfo.Can_RecalcWidowControl=()=>true;
 p.private_RecalculatePage=()=>{
  const prs={BreakPageLine:false};
  if(p.private_RecalculateLineWidow(0,0,prs,{})===false)return prs.RecalcResult;
  p.private_RecalculateMoveLineToNextPage(1,0,prs,{WidowControl:true,KeepLines:false});
  return prs.RecalcResult;
 };
}
function siblingRequest(s){
 const cell={...s.cell,Index:1},owner=cell.Content=new CDocumentContent(cell);
 const paragraph={Parent:owner,Index:0,Pages:[{StartLine:0}]};
 owner.Content=[paragraph];s.row.Content.push(cell);
 run(s,()=>{
  owner.Recalculate_Page=()=>{api.request(owner,paragraph,0,0,'current');return 2|0x10000;};
  api.calculateCell(s.table,cell,0,0);
 },{page:0});
 return{cell,owner,paragraph};
}
test('sibling current-page retry reuses the matched first-cell cut without a fresh duplicate request',()=>{
 const s=actualCurrentReplay(),other=siblingRequest(s);overflowingFirstCell(s);
 s.owner.Recalculate_Page=()=>{
  api.tickContent(s.owner);
  assert.equal(s.paragraph.Recalculate_Page(0),8|0x10000,'cached matched cut must replay before the real first-orphan branch can request again');
  return 1;
 };
 run(s,()=>api.calculateCell(s.table,s.cell,0,0),{page:0});
 assert.equal(api.snapshot(s.doc).requestsUsed,2,'one request per actual owner; no duplicate request for the first cell');
 assert.equal(api.snapshot(s.doc).pending,1,'sibling still awaits its own matched cut');
 run(s,()=>{
  other.owner.Recalculate_Page=()=>{other.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(other.owner,other.paragraph,0);return 1;};
  api.calculateCell(s.table,other.cell,0,0);
 },{page:0});
 assert.equal(api.snapshot(s.doc).pending,0);assert.equal(api.snapshot(s.doc).failed,false);
 assert.equal(api.snapshot(s.doc).cacheHits,1,'one authenticated cached cut reused across the sibling retry');
});
test('completed-cut reuse must not bypass the unchanged request repeat guard',()=>{
 const s=actualCurrentReplay();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   api.tickContent(s.owner);
   api.request(s.owner,s.paragraph,0,0,'current');
   return 2|0x10000;
  };
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});
test('fresh changed geometry invalidates the completed-cut cache before paragraph work',()=>{
 const s=actualCurrentReplay();overflowingFirstCell(s);s.owner.Pages[0].Y=1;
 s.owner.Recalculate_Page=()=>{
  api.tickContent(s.owner);
  assert.equal(s.paragraph.Recalculate_Page(0),4|0x10000,'changed layout needs a fresh bounded request, not the old empty fragment');
  return 2|0x10000;
 };
 run(s,()=>api.calculateCell(s.table,s.cell,0,0),{page:0});
 assert.equal(api.snapshot(s.doc).requestsUsed,2);
});
test('different document placement cannot reuse an equal-geometry completed cut',()=>{
 const s=actualCurrentReplay();overflowingFirstCell(s);
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   api.tickContent(s.owner);
   const result=s.paragraph.Recalculate_Page(0);
   return result===(4|0x10000)?(2|0x10000):1;
  };
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:1});
});
test('new generation discards completed-cut cache and retains ordinary first-request behavior',()=>{
 const s=actualCurrentReplay();overflowingFirstCell(s);s.doc.RecalcId++;
 s.owner.Recalculate_Page=()=>{
  api.tickContent(s.owner);
  assert.equal(s.paragraph.Recalculate_Page(0),4|0x10000);
  return 2|0x10000;
 };
 run(s,()=>api.calculateCell(s.table,s.cell,0,0),{page:0});
 assert.equal(api.snapshot(s.doc).requestsUsed,1);
 assert.equal(api.snapshot(s.doc).failed,false);
});
test('cached cut abandoned as successful cell completion must fail qualification',()=>{
 const s=actualCurrentReplay();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{api.tickContent(s.owner);return 0;};
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});

test('cached-prefix replay cannot reset or bypass the global work budget',()=>{
 const s=actualCurrentReplay();overflowingFirstCell(s);
 s.owner.Recalculate_Page=()=>{
  api.tickContent(s.owner);
  assert.equal(s.paragraph.Recalculate_Page(0),8|0x10000);
  return 1;
 };
 assert.throws(()=>{
  for(let i=0;i<40000;i++)run(s,()=>api.calculateCell(s.table,s.cell,0,0),{page:0});
 },isQualification);
 const snapshot=api.snapshot(s.doc);
 assert.equal(snapshot.failed,true);
 assert.equal(snapshot.requestsUsed,1);
 assert.equal(snapshot.workUsed,65536);
 assert(snapshot.cacheHits>0);
});
test('cached matched-cut acknowledgment still rejects another paragraph',()=>{
 const s=actualCurrentReplay();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{
   api.tickContent(s.owner);s.owner.RecalcInfo.WidowControlReset=true;
   api.consumeCut(s.owner,{},0);return 1;
  };
  assert.throws(()=>api.calculateCell(s.table,s.cell,0,0),isQualification);
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});

test('fast predicate uses the real Paragraph/content/cell object-return contract',()=>{
 const s=fastFixture();
 function actualFunction(file,pattern){
  const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor',file),'utf8');
  const match=pattern.exec(source);assert(match);
  const start=source.indexOf('function',match.index),open=source.indexOf('{',start);
  let end=open+1,depth=1;
  for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  return vm.runInNewContext('('+source.slice(start,end)+')');
 }
 s.paragraph.IsTableCellContent=actualFunction('Paragraph.js',/Paragraph\.prototype\.IsTableCellContent\s*=\s*function/);
 s.owner.IsTableCellContent=actualFunction('DocumentContent.js',/CDocumentContent\.prototype\.IsTableCellContent\s*=\s*function/);
 s.cell.IsCell=actualFunction('Table/TableCell.js',/IsCell\s*:\s*function/);
 assert.equal(s.paragraph.IsTableCellContent(),true,'the ordinary overload returns a boolean');
 assert.equal(s.paragraph.IsTableCellContent(true),s.cell,'true requests the actual cell object');
 assert.equal(api.shouldUseSlowParagraph(s.paragraph),true);
});

// release review reference 459 B3: a genuine pending cut must reach its authenticated destination.
for(const [name,page,tablePage,cellPage] of [
 ['wrong document page',7,0,0],['wrong table page',0,7,0],
 ['wrong cell page',0,0,7],['unrelated destination for every page',7,7,7],
])test('previous-page pending replay rejects '+name+' before reseeding legacy state',()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 let reseeds=0;const original=s.owner.RecalcInfo.Set_WidowControl;
 s.owner.RecalcInfo.Set_WidowControl=function(...args){reseeds++;return original.apply(this,args);};
 s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;};
 assert.throws(()=>run(s,()=>api.calculateCell(s.table,s.cell,tablePage,cellPage),{page}),isQualification);
 assert.equal(reseeds,0);assert.equal(api.snapshot(s.doc).failed,true);
});
for(const [name,page,tablePage,cellPage] of [
 ['wrong document page',7,0,0],['wrong table page',0,7,0],['wrong cell page',0,0,7],
])test('current-page pending replay rejects '+name+' before reseeding legacy state',()=>{
 const s=fixture();
 run(s,()=>{
  s.owner.Recalculate_Page=()=>{api.request(s.owner,s.paragraph,0,0,'current');return 2;};
  api.calculateCell(s.table,s.cell,0,0);
 },{page:0});
 let reseeds=0;const original=s.owner.RecalcInfo.Set_WidowControl;
 s.owner.RecalcInfo.Set_WidowControl=function(...args){reseeds++;return original.apply(this,args);};
 s.owner.Recalculate_Page=()=>{s.owner.RecalcInfo.WidowControlReset=true;api.consumeCut(s.owner,s.paragraph,0);return 1;};
 assert.throws(()=>run(s,()=>api.calculateCell(s.table,s.cell,tablePage,cellPage),{page}),isQualification);
 assert.equal(reseeds,0);assert.equal(api.snapshot(s.doc).failed,true);
});
for(const [name,alter] of [
 ['changed table-to-document mapping',s=>s.table.GetAbsolutePage=()=>7],
 ['lost paragraph membership',s=>s.paragraph.Parent.Content=[]],
 ['lost live body membership',s=>s.doc.Content=[]],
 ['changed live row index',s=>s.cell.Row.Index=7],
])test('pending replay rechecks '+name+' at matched-cut consumption',()=>{
 const s=fixture(),packet=request(s);api.rewind(packet.context);
 run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,0,0);
  alter(s);s.owner.RecalcInfo.WidowControlReset=true;
  try{assert.throws(()=>api.consumeCut(s.owner,s.paragraph,0),isQualification);}
  finally{api.leaveCell(frame,undefined);}
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});
test('pending cut cannot consume through a detached inner cell content control',()=>{
 const s=fixture(),tag=new CBlockLevelSdt(s.owner);
 s.owner.Content=[tag];tag.Content.Content=[s.paragraph];s.paragraph.Parent=tag.Content;
 const packet=request(s);api.rewind(packet.context);
 run(s,()=>{
  const frame=api.enterCell(s.table,s.cell,0,0);s.owner.Content=[];
  s.owner.RecalcInfo.WidowControlReset=true;
  try{assert.throws(()=>api.consumeCut(s.owner,s.paragraph,0),isQualification);}
  finally{api.leaveCell(frame,undefined);}
 },{page:0});
 assert.equal(api.snapshot(s.doc).failed,true);
});
for(const nested of [false,true])test('32769 distinct ordinary cells '+(nested?'with content controls':'without controls')+' do not exhaust replay work',()=>{
 const s=fixture(),cells=[];
 s.row.Content=[];
 for(let index=0;index<32769;index++){
  const cell={...s.cell,Index:index},owner=new CDocumentContent(cell);
  cell.Content=owner;let child=null;
  if(nested){const tag=new CBlockLevelSdt(owner);owner.Content=[tag];child=tag.Content;}
  owner.Recalculate_Page=()=>{api.tickContent(owner);if(child)api.tickContent(child);return 0;};
  cells.push(cell);s.row.Content.push(cell);
 }
 assert.doesNotThrow(()=>{for(const cell of cells)run(s,()=>api.calculateCell(s.table,cell,0,0),{page:0});});
 assert.equal(api.snapshot(s.doc).requestsUsed,0);assert.equal(api.snapshot(s.doc).pending,0);
 assert.equal(api.snapshot(s.doc).workUsed,0);assert.equal(api.snapshot(s.doc).failed,false);
});
