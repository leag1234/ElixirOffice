// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute the SDK's real methods; only the unrelated editor environment is stubbed.
// Full pagination is covered separately by tools/fidelity/measure-widow.cjs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
const sdk=process.env.EO_SDKJS;
assert(sdk,'Explicit EO_SDKJS source tree required');
const root=path.join(sdk,'word/Editor');
function method(file,name,context){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const start=source.indexOf(name+' = function');
 // Existing SDK aligns some assignments with multiple spaces.
 const match=start<0?new RegExp(name.replaceAll('.','\\.')+'\\s*=\\s*function').exec(source):null;
 const offset=start<0?match?.index:start;
 assert(Number.isInteger(offset),'Missing SDK method '+name);
 const open=source.indexOf('{',offset);let level=1,end=open+1;
 // These selected methods contain no brace literals in strings/comments.
 for(;level&&end<source.length;end++){if(source[end]==='{')level++;else if(source[end]==='}')level--;}
 vm.runInContext(source.slice(offset,end)+';',context,{filename:file,timeout:1000});
}
function environment(){
 const c=vm.createContext({CDocument:function(){},CDocumentContent:function(){},
  Paragraph:function(){},CBlockLevelSdt:function(){},CParaLine:function(){},
  AscWord:{CellWidowReplay:{getOwner:()=>null}},window:{AscCommon:{}},recalcresult2_CellReplayRequested:8,recalcresult2_End:0,recalcresult2_NextPage:1,recalcresult2_CurPage:2,
  recalcresult2_NextSection:3,recalcresult2_NextSection_Cur:4,recalcresult2_PrevPage:5,
  recalcresult_NextElement:1,recalcresult_PrevPage:2,recalcresult_CurPage:4,
  recalcresult_NextPage:8,recalcresult_NextSection:256,recalcresult_NextSection_Cur:512,
  recalcresultflags_Column:0x10000,recalcresultflags_Page:0x20000});
 method('DocumentContent.js','CDocumentContent.prototype.GetDocumentContentForRecalcInfo',c);
 method('Paragraph_Recalculate.js','Paragraph.prototype.private_GetWidowControlOwner',c);
 method('Paragraph_Recalculate.js','Paragraph.prototype.private_RecalculateLineWidow',c);
 method('StructuredDocumentTags/BlockLevel.js','CBlockLevelSdt.prototype.Recalculate_Page',c);
 return c;
}
function content(c,parent,isSdt){
 const value=new c.CDocumentContent();
 value.Parent=parent;
 value.IsBlockLevelSdtContent=()=>isSdt;
 value.GetTopDocumentContent=()=>value;
 return value;
}
for(const depth of [0,1,2,5])test('main body owner through '+depth+' content controls',()=>{
 const c=environment(),doc=new c.CDocument();doc.IsBlockLevelSdtContent=()=>false;
 let parent=doc;
 for(let i=0;i<depth;i++){const above=parent;parent=content(c,{GetTopDocumentContent:()=>above},true);}
 const p=new c.Paragraph();p.Parent=parent;
 assert.equal(p.private_GetWidowControlOwner(),doc);
});
for(const kind of ['cell','shape','header','footer','footnote','endnote'])
 for(const depth of [0,2])test(kind+' remains outside main body (depth '+depth+')',()=>{
  const c=environment();let parent=content(c,{},false);
  for(let i=0;i<depth;i++){const above=parent;parent=content(c,{GetTopDocumentContent:()=>above},true);}
  const p=new c.Paragraph();p.Parent=parent;
  assert.equal(p.private_GetWidowControlOwner(),null);
 });
test('widow replay uses shared owner state and preserves column request',()=>{
 const c=environment(),doc=new c.CDocument();doc.IsBlockLevelSdtContent=()=>false;
 let checked,reset=0,end;
 doc.RecalcInfo={Check_WidowControl:(p,line)=>(checked=[p,line],true),Need_ResetWidowControl:()=>reset++};
 const p=new c.Paragraph();p.Parent=content(c,{GetTopDocumentContent:()=>doc},true);
 p.Pages=[{Set_EndLine:line=>end=line}];p.Lines=[];
 const prs={};
 assert.equal(p.private_RecalculateLineWidow(0,0,prs,{}),false);
 assert.equal(checked[0],p);assert.equal(checked[1],0);assert.equal(reset,1);
 assert.equal(end,-1);assert.equal(prs.RecalcResult,c.recalcresult_NextPage|c.recalcresultflags_Column);
});
for(const flags of [0,0x10000,0x20000])test('nested wrapper preserves previous-page flags '+flags,()=>{
 const c=environment(),wrapper=new c.CBlockLevelSdt(),shared={};
 wrapper.SetIsRecalculated=()=>{};wrapper.Parent={RecalcInfo:shared};
 wrapper.Content={Recalculate_Page:()=>5|flags,GetPagesCount:()=>2};wrapper.Sections=[{}];
 assert.equal(wrapper.Recalculate_Page(1),2|flags);assert.equal(wrapper.Content.RecalcInfo,shared);
});
