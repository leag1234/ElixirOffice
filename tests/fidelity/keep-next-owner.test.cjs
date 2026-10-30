// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual SDK pagination methods, with unrelated editor geometry stubbed.
// Native/compiled paired documents provide separate integration evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const root=path.join(process.env.EO_SDKJS,'word/Editor');
function method(file,name,c){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 const match=new RegExp(name.replaceAll('.','\\.')+'\\s*=\\s*function').exec(s);assert(match,name);
 const open=s.indexOf('{',match.index);let end=open+1,depth=1;
 for(;depth;end++){if(s[end]==='{')depth++;else if(s[end]==='}')depth--;}
 vm.runInContext(s.slice(match.index,end)+';',c,{filename:file,timeout:1000});
}
function setup(){
 const c=vm.createContext({CDocument:function(){},CDocumentContentBase:function(){},
  CDocumentContentElementBase:function(){},CDocumentContent:function(){},Paragraph:function(){},
  CBlockLevelSdt:function(){},CTable:function(){},CParaLine:function(){},
  AscWord:{CellWidowReplay:{getOwner:()=>null}},type_Unknown:0,type_Paragraph:1,
  recalcresult_NextElement:1,recalcresult_PrevPage:2,recalcresult_NextPage:8,recalcresultflags_Column:0x10000});
 for(const name of ['Paragraph','CBlockLevelSdt','CTable'])c[name].prototype=Object.create(c.CDocumentContentElementBase.prototype);
 c.CDocumentContent.prototype=Object.create(c.CDocumentContentBase.prototype);
 for(const name of ['GetType','IsParagraph','Get_DocumentPrev','GetPrevDocumentElement','RecalculateKeepNext'])
  method('DocumentContentElementBase.js','CDocumentContentElementBase.prototype.'+name,c);
 method('DocumentContentBase.js','CDocumentContentBase.prototype.GetPrevDocumentElement',c);
 for(const name of ['GetDocumentContentForRecalcInfo','GetTopDocumentContent','IsBlockLevelSdtContent'])
  method('DocumentContent.js','CDocumentContent.prototype.'+name,c);
 method('StructuredDocumentTags/BlockLevel.js','CBlockLevelSdt.prototype.GetTopDocumentContent',c);
 for(const name of ['private_GetWidowControlOwner','private_RecalculatePageKeepNext','private_RecalculatePageBreak'])
  method('Paragraph_Recalculate.js','Paragraph.prototype.'+name,c);
 const doc=new c.CDocument(),calls=[];
 doc.IsBlockLevelSdtContent=()=>false;doc.GetTopDocumentContent=()=>doc;doc.GetPrevDocumentElement=()=>null;
 doc.RecalcInfo={Can_RecalcObject:()=>true,Set_KeepNext:(start,end)=>calls.push({start,end}),
  Check_KeepNextEnd:()=>false,Check_KeepNext:()=>false,Reset:()=>calls.push('reset')};
 return {c,doc,calls};
}
function paragraph(c,parent,{keep=false,section,breakPage=false,pages=1}={}){
 const p=new c.Paragraph();p.Parent=parent;p.Prev=null;
 p.IsParagraph=()=>true;p.Get_SectionPr=()=>section;
 p.Get_CompiledPr2=()=>({ParaPr:{KeepNext:keep}});
 p.getPageCount=()=>pages;p.IsInline=()=>true;p.Check_PageBreak=()=>breakPage;
 return p;
}
function wrap(c,parent,child,depth,previous){
 let container=parent;
 for(let i=0;i<depth;i++){
  const block=new c.CBlockLevelSdt(),content=new c.CDocumentContent();
  block.Parent=container;block.Prev=i===0?previous:null;block.Content=content;
  content.Parent=block;content.Content=[];container=content;
 }
 child.Parent=container;child.Prev=depth?null:previous;return child;
}
function firstAfterHeading({depth=1,kind='paragraph',keep=true}={}){
 const e=setup(),{c,doc}=e;
 const before=paragraph(c,doc),heading=paragraph(c,doc,{keep});heading.Prev=before;
 const target=kind==='table'?new c.CTable():paragraph(c,doc);
 wrap(c,doc,target,depth,heading);target.IsEmptyPage=i=>i===0;
 return {...e,before,heading,target};
}
for(const depth of [0,1,2,4])for(const kind of ['paragraph','table'])
 test('keep heading before '+kind+' through '+depth+' body SDTs',()=>{
  const {c,heading,target,calls}=firstAfterHeading({depth,kind});
  assert.equal(target.RecalculateKeepNext(1),c.recalcresult_PrevPage|c.recalcresultflags_Column);
  assert.equal(calls.length,1);assert.equal(calls[0].start,heading);assert.equal(calls[0].end,target);
 });
for(const depth of [0,1,2])test('keepNext false stays separate through '+depth+' controls',()=>{
 const {c,target,calls}=firstAfterHeading({depth,keep:false});
 assert.equal(target.RecalculateKeepNext(1),c.recalcresult_NextElement);assert.deepEqual(calls,[]);
});
test('preceding SDT is transparent to the last flow paragraph',()=>{
 const {c,doc,calls}=setup(),before=paragraph(c,doc),heading=paragraph(c,doc,{keep:true});
 const previous=new c.CBlockLevelSdt();previous.Parent=doc;previous.Prev=before;
 heading.Parent=new c.CDocumentContent();heading.Parent.Parent=previous;heading.Prev=null;
 previous.GetLastElement=()=>heading;
 const target=paragraph(c,doc);target.Prev=previous;target.IsEmptyPage=()=>true;
 assert.equal(target.RecalculateKeepNext(1),c.recalcresult_PrevPage|c.recalcresultflags_Column);
 assert.equal(calls[0].start,heading);
});
test('nested preceding SDTs peel only transparent wrappers',()=>{
 const {c,doc,calls}=setup(),before=paragraph(c,doc),heading=paragraph(c,doc,{keep:true});
 const outer=new c.CBlockLevelSdt(),inner=new c.CBlockLevelSdt();
 outer.Parent=doc;outer.Prev=before;inner.Parent=new c.CDocumentContent();inner.Parent.Parent=outer;inner.Prev=null;
 heading.Parent=new c.CDocumentContent();heading.Parent.Parent=inner;heading.Prev=null;
 inner.GetLastElement=()=>heading;outer.GetLastElement=()=>inner;
 const target=paragraph(c,doc);target.Prev=outer;target.IsEmptyPage=()=>true;
 assert.equal(target.RecalculateKeepNext(1),c.recalcresult_PrevPage|c.recalcresultflags_Column);
 assert.equal(calls[0].start,heading);
});
test('keep chain can cross a control boundary in both directions',()=>{
 const {c,doc,calls}=setup(),before=paragraph(c,doc),first=paragraph(c,doc,{keep:true}),last=paragraph(c,doc,{keep:true});
 first.Prev=before;wrap(c,doc,last,1,first);
 const target=paragraph(c,last.Parent);target.Prev=last;target.IsEmptyPage=()=>true;
 assert.equal(target.RecalculateKeepNext(1),c.recalcresult_PrevPage|c.recalcresultflags_Column);
 assert.equal(calls[0].start,first);assert.equal(calls[0].end,target);
});
for(const boundary of ['manual-break','section-break','multi-page','no-space-to-recalculate'])
 test('retain '+boundary+' guard',()=>{
  const {c,doc,heading,target,calls}=firstAfterHeading();
  if(boundary==='manual-break')heading.Check_PageBreak=()=>true;
  if(boundary==='section-break')heading.Get_SectionPr=()=>({});
  if(boundary==='multi-page')heading.getPageCount=()=>2;
  if(boundary==='no-space-to-recalculate')doc.RecalcInfo.Can_RecalcObject=()=>false;
  assert.equal(target.RecalculateKeepNext(1),c.recalcresult_NextElement);assert.deepEqual(calls,[]);
 });
test('explicit pageBreakBefore bypasses keep-next before owner handling',()=>{
 const {c,doc}=setup(),p=paragraph(c,doc);
 p.RecalculateKeepNext=()=>{throw Error('Explicit break must take precedence')};
 assert.equal(p.private_RecalculatePageKeepNext(1,{}, {PageBreakBefore:true}),true);
});
for(const domain of ['cell','shape','header','footer','footnote'])
 test('do not recalculate non-body '+domain+' through a nested SDT',()=>{
  const {c,doc,calls}=setup(),owner=new c.CDocumentContent();
  owner.Parent={kind:domain};const heading=paragraph(c,owner,{keep:true}),target=paragraph(c,owner);
  wrap(c,owner,target,2,heading);target.IsEmptyPage=()=>true;
  assert.equal(target.RecalculateKeepNext(1),c.recalcresult_NextElement);assert.deepEqual(calls,[]);
 });
test('reset the same body owner at the recorded end paragraph',()=>{
 const {c,doc,target,calls}=firstAfterHeading();
 doc.RecalcInfo.Check_KeepNextEnd=p=>p===target;
 assert.equal(target.RecalculateKeepNext(0),c.recalcresult_NextElement);assert.deepEqual(calls,['reset']);
});
test('empty control predecessor cannot manufacture a paragraph or loop',()=>{
 const {c,doc,calls}=setup(),empty=new c.CBlockLevelSdt();
 empty.Parent=doc;empty.Prev=null;empty.GetLastElement=()=>null;
 const target=paragraph(c,doc);target.Prev=empty;target.IsEmptyPage=()=>true;
 assert.equal(target.RecalculateKeepNext(1),c.recalcresult_NextElement);assert.deepEqual(calls,[]);
});
for(const depth of [1,2])test('replay requested heading through '+depth+' SDTs',()=>{
 const {c,doc,target}=firstAfterHeading({depth});
 doc.RecalcInfo.Check_KeepNext=p=>p===target;
 target.GetLogicDocument=()=>doc;target.GetRelativePage=x=>x;target.GetRelativeStartPage=()=>0;
 target.IsEmpty=()=>false;target.Is_Inline=()=>false;
 let end;target.Pages=[{Set_EndLine:n=>end=n}];target.Lines=[];
 const prs={GetTopDocument:()=>doc,IsInTable:()=>false};
 assert.equal(target.private_RecalculatePageBreak(0,0,prs,{}),false);
 assert.equal(prs.RecalcResult,c.recalcresult_NextPage);assert.equal(end,-1);
});

for(const depth of [0,1,2])test('active cell widow owner cannot enable body keep-next at SDT depth '+depth,()=>{
 const {c,doc,calls}=setup(),owner=new c.CDocumentContent();
 owner.Parent={kind:'cell'};
 owner.RecalcInfo={Check_KeepNext(){throw Error('Cell widow ownership must not enable body keep-next');}};
 c.AscWord.CellWidowReplay.getOwner=()=>owner;
 const target=paragraph(c,owner);wrap(c,owner,target,depth,null);
 target.GetLogicDocument=()=>doc;target.Is_Inline=()=>false;
 const prs={GetTopDocument:()=>doc,IsInTable:()=>true};
 assert.equal(target.private_GetWidowControlOwner(),owner);
 assert.equal(target.private_RecalculatePageBreak(0,0,prs,{}),true);
 assert.deepEqual(calls,[]);
});
