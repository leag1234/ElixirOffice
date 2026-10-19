// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const driver=fs.readFileSync(path.join(__dirname,'ltr-compatibility.cjs'),'utf8');
const start=driver.indexOf('       function canonical(table)'),end=driver.indexOf('canonical(value.table);',start);
assert(start>0&&end>start);
const project=vm.runInNewContext('(function(raw){const value=structuredClone(raw);'+driver.slice(start,end)+'canonical(value.table);return value;})',{structuredClone});
const sdk=process.env.EO_SDKJS;assert(sdk,'EO_SDKJS must point to the candidate source');
const source=fs.readFileSync(path.join(sdk,'word/Editor/Table.js'),'utf8'),a=source.indexOf('CTable.prototype.GetSelectionState = function()'),b=source.indexOf('CTable.prototype.SetSelectionState = function(',a);
assert(a>0&&b>a);
const capture=vm.runInNewContext('(function(){const CTable=function(){};'+source.slice(a,b)+';return CTable.prototype.GetSelectionState;})()',{table_Selection_Cell:0,table_Selection_Common:0});
function model(active,data){
 const point={Pos:{Row:1,Cell:1},X:10,Y:20,PageIndex:0,MouseEvent:{ClickCount:1,Type:0,CtrlKey:false}};
 return {Selection:{Start:false,Use:active,Type:active?0:1,StartPos:structuredClone(point),EndPos:structuredClone(point),Data:data,Type2:5,Data2:null,CurRow:1},
  CurCell:{Index:1,Row:{Index:1},Content:{GetSelectionState:()=>[]}}};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('actual official selection contract omits inactive UI caches while preserving raw source state',()=>{
 for(const data of [null,[],[{Row:1,Cell:1}]]){
  const table=model(false,data),before=structuredClone(table.Selection),state=capture.call(table).at(-1);
  assert.deepEqual(plain(state.Selection.Data),[]);assert.equal(state.Selection.Type2,0);
  assert.deepEqual(table.Selection,before,'Capture must not rewrite the raw UI state');
 }
});
test('actual active cell data and model endpoints remain exact negative controls',()=>{
 const a=model(true,[{Row:1,Cell:0}]),b=model(true,[{Row:1,Cell:1}]);
 assert.notDeepEqual(plain(capture.call(a)),plain(capture.call(b)));
 assert.deepEqual(plain(capture.call(a).at(-1).Selection.Data),[{Row:1,Cell:0}]);
 assert.throws(()=>capture.call(model(true,null)),'Malformed active cell data cannot become an empty successful selection');
});
test('paired projection preserves official active data, caret, endpoints, history and border tracking',()=>{
 const state=()=>({table:{cellSelection:true,borderTracking:false,selection:{Use:true,Type:0,Data:[{Row:1,Cell:0}],StartPos:{Row:1,Cell:0},EndPos:{Row:1,Cell:1}},rawSelection:{Data:null},children:[]},cursor:{X:1,Y:2},history:{index:0,points:1,items:2}});
 for(const mutate of [s=>s.cursor.X++,s=>s.history.items++,s=>s.table.selection.StartPos.Cell++,s=>s.table.selection.Type++,s=>s.table.selection.Data[0].Cell++,s=>s.table.borderTracking=true]){
  const a=state(),b=structuredClone(a);mutate(b);assert.notDeepEqual(project(a),project(b));
 }
 const raw=state();assert('rawSelection' in raw.table);assert(!('rawSelection' in project(raw).table));assert('rawSelection' in raw.table,'Raw record remains available');
});


test('recursive border guard rejects active ancestors and children',()=>{
 const a=driver.indexOf('function assertNoBorders(table){'),b=driver.indexOf('\n}',a)+2;assert(a>0&&b>a);
 const guard=vm.runInNewContext('('+driver.slice(a,b)+')',{assert});
 guard({borderTracking:false,children:[{table:{borderTracking:false,children:[]}}]});
 for(const table of [{borderTracking:true,children:[]},{borderTracking:false,children:[{table:{borderTracking:true,children:[]}}]}])assert.throws(()=>guard(table));
});
test('an unknown scoped fixture exits before starting a browser',()=>{
 const os=require('node:os'),{spawnSync}=require('node:child_process'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ltr-cli-')),out=path.join(folder,'result');
 try{
  const result=spawnSync(process.execPath,[path.join(__dirname,'ltr-compatibility.cjs'),'unused-baseline','unused-candidate',out,'missing-public-fixture.docx'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Fixture filter must match a known fixture/);assert(!fs.existsSync(path.join(out,'browser.json')));
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
