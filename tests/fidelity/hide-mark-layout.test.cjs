// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
function setup(options={}){
 const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/DocumentContent.js'),'utf8');
 const name='CDocumentContent.prototype.IsHiddenCellEndParagraph';
 const start=source.indexOf(name+' = function'),c=vm.createContext({CDocumentContent:function(){}});
 if(start>=0){
  const open=source.indexOf('{',start);let end=open+1,depth=1;
  for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  vm.runInContext(source.slice(start,end)+';',c);
 }
 assert.equal(typeof c.CDocumentContent.prototype.IsHiddenCellEndParagraph,'function','Actual hidden end-cell predicate must exist');
 const p={IsParagraph:()=>options.paragraph!==false,IsEmpty:props=>{assert.equal(props.SkipPlcHldr,false);return options.empty!==false},
  HaveNumbering:()=>!!options.numbering,Get_SectionPr:()=>options.section?{}:undefined,
  Get_CompiledPr2:()=>({ParaPr:{PageBreakBefore:!!options.pageBefore,Brd:{}}}),
  Internal_Is_NullBorders:()=>!options.border,GetAllDrawingObjects:()=>options.drawing?[{}]:[]};
 const cell={Get_CompiledPr:()=>({HideMark:options.flag}),GetContent:()=>({GetLastParagraph:()=>options.last===false?{}:p})};
 const content=new c.CDocumentContent();content.Content=options.interior?[p,{}]:[p];
 content.IsTableCellContent=()=>options.cell===false?null:cell;
 return {content,p};
}
for(const flag of [true,false,undefined])test('only explicit hideMark=true can exclude the final empty marker: '+flag,()=>{
 const {content}=setup({flag});assert.equal(content.IsHiddenCellEndParagraph(0),flag===true);
});
for(const option of ['numbering','section','pageBefore','border','drawing','interior'])
 test('preserve '+option+' instead of hiding printing/break content',()=>{
  const {content}=setup({flag:true,[option]:true});assert.equal(content.IsHiddenCellEndParagraph(0),false);
 });
for(const option of ['paragraph','empty','last','cell'])
 test('preserve nonmatching '+option+' scope',()=>{
  const {content}=setup({flag:true,[option]:false});assert.equal(content.IsHiddenCellEndParagraph(0),false);
 });
test('ignore invalid content indexes',()=>{
 const {content}=setup({flag:true});assert.equal(content.IsHiddenCellEndParagraph(-1),false);
 assert.equal(content.IsHiddenCellEndParagraph(1),false);
});
