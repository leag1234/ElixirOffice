// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;
assert(web&&path.isAbsolute(web),'Explicit candidate EO_WEB_APPS required');
let factory;
vm.runInNewContext(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/app/elixir-ai/CellPolicy.js'),'utf8'),{define:(_d,f)=>factory=f()});
const P=factory(),plain=x=>JSON.parse(JSON.stringify(x));
test('bounded canonical A1 rectangles reject workbook, multiple areas and whole-column references',()=>{
 assert.deepEqual(plain(P.range('$b$2:$D$4')),{r1:2,c1:2,r2:4,c2:4,rows:3,cols:3,cells:9,address:'B2:D4'});
 for(const s of ['A0','XFE1','A1048577','A2:A1','Sheet1!A1','[x]A1','A:A','1:2','A1,B2','A1:A10001','A1;alert(1)',''])assert.throws(()=>P.range(s),s);
 assert.equal(P.range('XFD1048576').cells,1);
});
test('strict tool schemas reject unknown tools, keys, coercions and unsafe planner entries',()=>{
 const good={range:'A2:A4',formula:'=SUM(B2:C2)'};
 assert.equal(P.validate('write_formula',good),null);
 for(const [n,a] of [['write_formula',{...good,sheet:'Other'}],['write_formula',{...good,fill:'true'}],['write_formula',{...good,formula:'=WEBSERVICE("https://example.invalid")'}],['sort_range',{range:'A1:C4',header:true,keys:[{column:0,order:'asc'}]}],['clean_range',{range:'A1',operation:'numbers',decimal:',',group:','}],['create_pivot',{range:'A1:C4',rows:[1],values:[{column:2,aggregation:'Execute'}]}],['submit_plan',{goal:'x',steps:[{tool:'eval',purpose:'x'}]}],['evil',{}]])assert(P.validate(n,a),JSON.stringify([n,a]));
});
test('formula allowlist preserves quoted strings and absolute references without allowing dynamic or external access',()=>{
 for(const f of ['=SUM(B2:C2)','=IF(B2>10,"good","bad")','=ROUND(B2*$D$1,2)','=COUNTIF(A2:A10,"import")'])assert.equal(P.formula(f),f);
 for(const f of ['=INDIRECT("A1")','=RTD("x")','=HYPERLINK("x")','=WEBSERVICE("x")','=Other!A1','=SUM(A:A)','=SUM(A1:A10001)','=CUSTOM(A1)','=A1[0]','=A1;fetch("x")','=SUM(A1:A4)+SUM(A1:A4)/*x*/'])assert.throws(()=>P.formula(f),f);
 assert.equal(P.translate('=SUM(B2:C2)+$D$1+E$3+$F4+"A1"',2,1),'=SUM(C4:D4)+$D$1+F$3+$F6+"A1"');
 assert.throws(()=>P.translate('=A1',-1,0));assert.throws(()=>P.translate('=XFD1',0,1));
});
test('numeric normalization requires explicit unambiguous separators and full-string validation',()=>{
 assert.equal(P.number('1 234,50',',',' '),1234.5);
 assert.equal(P.number('-1,234.50','.',','),-1234.5);
 for(const x of ['1 23,50','1,2,3','Infinity','12abc','1e309','=2+2'])assert.throws(()=>P.number(x,',',' '),x);
 assert.throws(()=>P.number('1.2','.','.'));
 assert.equal(P.number('',',',' '),null);
});
test('date normalization is explicit, leap-year checked and never guessed',()=>{
 assert.deepEqual(plain(P.date('26/10/2026','DD/MM/YYYY')),[2026,10,26]);
 assert.deepEqual(plain(P.date('10/26/2026','MM/DD/YYYY')),[2026,10,26]);
 assert.deepEqual(plain(P.date('2024-02-29','YYYY-MM-DD')),[2024,2,29]);
 for(const [v,f]of [['29/02/2023','DD/MM/YYYY'],['2026-13-01','YYYY-MM-DD'],['01/02/26','DD/MM/YYYY'],['26/10/2026','guess']])assert.throws(()=>P.date(v,f));
});
test('cleaning preflight preserves literal formula-looking strings and refuses structural formula loss',()=>{
 const cell=(value,formula=null)=>({value,formula});
 const trimmed=P.clean([[cell(' =1+2 '),cell(' 0012 '),cell('3','=A1+1')]],{operation:'trim'});
 assert.deepEqual(plain(trimmed),[[{value:'=1+2',formula:null},{value:'0012',formula:null},{value:'3',formula:'=A1+1'}]]);
 const dedupe=P.clean([[cell('a'),cell('b|c')],[cell('a|b'),cell('c')],[cell('a'),cell('b|c')]],{operation:'dedupe',header:false});
 assert.equal(dedupe.length,2);
 assert.throws(()=>P.clean([[cell('3','=A1+1')]],{operation:'dedupe',header:false}));
 assert.throws(()=>P.clean([[cell('a;b')]],{operation:'split',delimiter:''}));
 assert.deepEqual(plain(P.clean([[cell('A;B')]],{operation:'split',delimiter:';'})),[[{value:'A',formula:null},{value:'B',formula:null}]]);
});
test('bounded summary reports deterministic numeric facts without evaluating text or silently counting text as numbers',()=>{
 const r=P.summary([[{value:'Name',formula:null,kind:'text'},{value:'Amount',formula:null,kind:'text'}],[{value:'A',kind:'text'},{value:'20',kind:'number'}],[{value:'B',kind:'text'},{value:'30',kind:'number'}],[{value:'',kind:'blank'},{value:'0012',kind:'text'}]]);
 assert.deepEqual(plain(r.columns[1]),{column:2,numeric:2,sum:50,min:20,max:30,mean:25,blank:0});
});
test('formula references exclude string literals and stay explicit for captured-scope checks',()=>{
 assert.deepEqual(plain(P.references('=SUM(B2:C3)+$D$1+"A99"')).map(r=>r.address),['B2:C3','D1']);
});
test('canonical formulas are localized only through captured public API metadata, never by rewriting quoted text',()=>{
 const locale={decimal:',',separator:';',functions:{IF:'SI',SUM:'SOMME'}};
 assert.equal(P.localFormula('=IF(B2>=1.5,SUM(A2:A4),"1.5, SUM(A1)")',locale),'=SI(B2>=1,5;SOMME(A2:A4);"1.5, SUM(A1)")');
 assert.equal(P.localFormula('=ROUND(B2*1.25,2)',{decimal:'.',separator:',',functions:{}}),'=ROUND(B2*1.25,2)');
 assert.throws(()=>P.localFormula('=A1',{decimal:'malformed',separator:';',functions:{}}));
});
test('read-only plans cannot include mutation steps, and mode is explicit',()=>{
 assert.equal(P.validate('submit_plan',{goal:'Explain',read_only:true,steps:[{tool:'explain_formula',purpose:'Read'}]}),null);
 assert(P.validate('submit_plan',{goal:'Explain',read_only:true,steps:[{tool:'write_formula',purpose:'Scratch total'}]}));
 assert(P.validate('submit_plan',{goal:'Explain',steps:[]}));
});
test('formula readback comparison ignores only syntactic case/spacing and preserves literal content',()=>{
 assert.equal(P.canonicalFormula('= sum( b2 : C4 ) + "a B"'),'=SUM(B2:C4)+"a B"');
 assert.notEqual(P.canonicalFormula('="a B"'),P.canonicalFormula('="A B"'));
});
test('number errors report exact observed grouping characters without guessing or silently normalizing them',()=>{
 assert.throws(()=>P.number('1 234,50',',','\u00a0'),/U\+0020/);
 assert.throws(()=>P.number('1\u00a0234,50',',',' '),/U\+00A0/);
});
test('pivot output cardinality is bounded before creating any worksheet',()=>{
 const cell=v=>({value:String(v),kind:typeof v==='number'?'number':'text',formula:null});
 const small=[['Class','Name','Score'],['A','Ada',12],['B','Grace',18],['A','Linus',16]].map(r=>r.map(cell));
 assert(P.pivotEstimate(small,{rows:[1],columns:[],values:[{column:3,aggregation:'Average'}]})<=2000);
 const large=[['R','C','V'],...Array.from({length:200},(_,i)=>['R'+i,'C'+i,i])].map(r=>r.map(cell));
 assert.throws(()=>P.pivotEstimate(large,{rows:[1],columns:[2],values:[{column:3,aggregation:'Sum'}]}),/limit|large|bound/i);
});
