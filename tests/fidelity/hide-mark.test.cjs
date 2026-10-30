// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute actual SDK property methods; native geometry is qualified separately.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const root=path.join(process.env.EO_SDKJS,'word/Editor');
function functionText(source,start){
 const open=source.indexOf('{',start);let end=open+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 return source.slice(start,end);
}
function setup(){
 const c=vm.createContext({c_oSerConstants:{ReadOk:0,ReadUnknown:1},
  IsEqualStyleObjects:(a,b)=>a===b,c_oSerPropLenType:{Byte:1}});
 const styles=fs.readFileSync(path.join(root,'Styles.js'),'utf8');
 vm.runInContext(functionText(styles,styles.indexOf('function CTableCellPr(')),c);
 for(const name of ['Copy','Merge','Is_Equal','Set_FromObject','Write_ToBinary','Read_FromBinary','Is_Empty']){
  const start=styles.indexOf('CTableCellPr.prototype.'+name+' = function');assert(start>0,name);
  vm.runInContext(functionText(styles,start)+';',c);
 }
 const ser=fs.readFileSync(path.join(root,'Serialize2.js'),'utf8');
 const e=ser.indexOf('var c_oSerProp_cellPrType'),end=ser.indexOf('};',e);
 vm.runInContext(ser.slice(e,end+2),c);
 for(const name of ['Read_CellPr','WriteCellPr']){
  const match=new RegExp(name+'\\s*:\\s*function\\(').exec(ser);assert(match,name);
  c[name]=vm.runInContext('('+functionText(ser,ser.indexOf('function',match.index))+')',c);
 }
 const cells=fs.readFileSync(path.join(root,'Table/TableCell.js'),'utf8');
 for(const name of ['Copy_Pr','SetHideMark']){
  const match=new RegExp(name+'\\s*:\\s*function\\(').exec(cells);
  if(match)c[name]=vm.runInContext('('+functionText(cells,cells.indexOf('function',match.index))+')',c);
 }
 return c;
}
for(const value of [true,false]){
 test('read explicit hideMark='+value,()=>{
  const c=setup(),p=new c.CTableCellPr();let reads=0;
  const result=c.Read_CellPr.call({stream:{GetUChar(){reads++;return Number(value)}}},
   c.c_oSerProp_cellPrType.hideMark,1,p);
  assert.equal(result,c.c_oSerConstants.ReadOk);assert.equal(reads,1);assert.equal(p.HideMark,value);
 });
 test('write explicit hideMark='+value,()=>{
  const c=setup(),p=new c.CTableCellPr(),writes=[];p.HideMark=value;p.TableCellBorders=undefined; // Unrelated border serialization is outside this test.
  c.WriteCellPr.call({memory:{WriteByte:v=>writes.push(['byte',v]),WriteBool:v=>writes.push(['bool',v])}},p);
  assert.deepEqual(writes,[['byte',c.c_oSerProp_cellPrType.hideMark],['byte',c.c_oSerPropLenType.Byte],['bool',value]]);
 });
 test('copy preserves hideMark='+value,()=>{
  const c=setup(),p=new c.CTableCellPr();p.HideMark=value;assert.equal(p.Copy().HideMark,value);
 });
 test('merge applies explicit hideMark='+value,()=>{
  const c=setup(),p=new c.CTableCellPr(),other=new c.CTableCellPr();p.HideMark=!value;other.HideMark=value;
  p.Merge(other);assert.equal(p.HideMark,value);
 });
 test('object import preserves hideMark='+value,()=>{
  const c=setup(),p=new c.CTableCellPr(),other=new c.CTableCellPr();other.HideMark=value;
  p.Set_FromObject(other);assert.equal(p.HideMark,value);
 });
}
test('omitted hideMark remains unset and does not override inherited value',()=>{
 const c=setup(),p=new c.CTableCellPr(),other=new c.CTableCellPr();
 assert.equal(p.HideMark,undefined);p.HideMark=true;p.Merge(other);assert.equal(p.HideMark,true);
});
test('cell property equality distinguishes true, false and omitted',()=>{
 const c=setup(),a=new c.CTableCellPr(),b=new c.CTableCellPr();
 assert.equal(a.Is_Equal(b),true);a.HideMark=true;assert.equal(a.Is_Equal(b),false);
 b.HideMark=false;assert.equal(a.Is_Equal(b),false);b.HideMark=true;assert.equal(a.Is_Equal(b),true);
});

for(const value of [true,false,undefined])test('history property stream roundtrip hideMark='+value,()=>{
 const c=setup(),a=new c.CTableCellPr(),b=new c.CTableCellPr(),bytes=Buffer.alloc(128);
 let pos=0;a.HideMark=value;
 const writer={GetCurPosition:()=>pos,Skip:n=>{pos+=n},Seek:n=>{pos=n},
  WriteLong:n=>{bytes.writeInt32LE(n,pos);pos+=4},WriteBool:n=>{bytes[pos++]=Number(n)}};
 a.Write_ToBinary(writer);const length=pos;pos=0;
 b.Read_FromBinary({GetLong:()=>{const n=bytes.readInt32LE(pos);pos+=4;return n},GetBool:()=>!!bytes[pos++]});
 assert.equal(b.HideMark,value);assert.equal(pos,length);
});
for(const value of [true,false])test('explicit hideMark='+value+' is not an empty property set',()=>{
 const c=setup(),p=new c.CTableCellPr();assert.equal(p.Is_Empty(),true);p.HideMark=value;
 assert.equal(p.Is_Empty(),false);
});

for(const value of [true,false])test('copy cell formatting delegates hideMark='+value,()=>{
 const c=setup(),p=new c.CTableCellPr(),calls=[];p.HideMark=value;
 const cell=new Proxy({}, {get:(_,key)=>key==='SetHideMark'?(v=>calls.push(v)):()=>{}});
 c.Copy_Pr.call(cell,p);assert.deepEqual(calls,[value]);
});
for(const value of [true,false,undefined])test('cell setter uses full-property history path for hideMark='+value,()=>{
 const c=setup();assert.equal(typeof c.SetHideMark,'function','Actual cell setter must exist');
 const original=new c.CTableCellPr();original.HideMark=value===true?false:true;original.NoWrap=true;
 const calls=[],cell={Pr:original,private_AddPrChange(){},Set_Pr(p){calls.push(p);this.Pr=p}};
 c.SetHideMark.call(cell,value);assert.equal(calls.length,1);assert.notEqual(cell.Pr,original);
 assert.equal(cell.Pr.HideMark,value);assert.equal(cell.Pr.NoWrap,true);
 c.SetHideMark.call(cell,value);assert.equal(calls.length,1,'Unchanged value must not add history');
});
test('cell setter retains existing tracked property revision metadata',()=>{
 const c=setup(),original=new c.CTableCellPr();original.HideMark=false;
 original.PrChange=new c.CTableCellPr();original.PrChange.HideMark=false;original.PrChange.NoWrap=true;
 original.ReviewInfo={Copy:()=>({retainedRevision:true})};
 const cell={Pr:original,private_AddPrChange(){},Set_Pr(p){this.Pr=p}};
 c.SetHideMark.call(cell,true);
 assert(cell.Pr.PrChange,'Existing property revision must not be discarded');
 assert.equal(cell.Pr.PrChange.HideMark,false);assert.equal(cell.Pr.PrChange.NoWrap,true);
 assert.equal(cell.Pr.ReviewInfo.retainedRevision,true);
});

test('cell setter snapshots revision metadata created before the full-property assignment',()=>{
 const c=setup(),original=new c.CTableCellPr();original.HideMark=false;
 const cell={Pr:original,private_AddPrChange(){
  if(this.Pr.PrChange)return;
  this.Pr.PrChange=new c.CTableCellPr();this.Pr.PrChange.HideMark=false;
  this.Pr.ReviewInfo={Copy:()=>({newRevision:true})};
 },Set_Pr(p){this.private_AddPrChange();this.Pr=p}};
 c.SetHideMark.call(cell,true);assert(cell.Pr.PrChange,'New tracked metadata must survive assignment');
 assert.equal(cell.Pr.PrChange.HideMark,false);assert.equal(cell.Pr.ReviewInfo.newRevision,true);
});

test('cell property history masks reserve hideMark bit without collisions',()=>{
 const source=fs.readFileSync(path.join(root,'Styles.js'),'utf8');
 const body=name=>functionText(source,source.indexOf('CTableCellPr.prototype.'+name+' = function'));
 const writes=[...body('Write_ToBinary').matchAll(/Flags\s*\|=\s*(\d+)/g)].map(m=>Number(m[1]));
 const reads=[...body('Read_FromBinary').matchAll(/if\s*\(\s*(\d+)\s*&\s*Flags\s*\)/g)].map(m=>Number(m[1]));
 assert.equal(writes.filter(n=>n===524288).length,1);
 assert.equal(new Set(writes).size,writes.length,'Two cell properties share a history bit');
 assert(writes.every(n=>n>0&&(n&(n-1))===0),'Masks must be distinct single bits');
 assert.deepEqual([...reads].sort((a,b)=>a-b),[...writes].sort((a,b)=>a-b));
 assert(writes.filter(n=>n!==524288).every(n=>n<524288),'New bit overlaps a legacy cell mask');
});
test('legacy cell binary without hideMark bit loads without consuming following data',()=>{
 for(const populated of [false,true]){
  const c=setup(),p=new c.CTableCellPr(),bytes=Buffer.alloc(populated?17:8);
  bytes.writeInt32LE(populated?(1|65536|131072):0,0);
  const end=populated?13:4;bytes.writeInt32LE(0x12345678,end);
  if(populated){bytes.writeInt32LE(3,4);bytes[8]=1;bytes.writeInt32LE(2,9);}
  let pos=0;
  p.Read_FromBinary({GetLong(){const n=bytes.readInt32LE(pos);pos+=4;return n},GetBool(){return !!bytes[pos++]}});
  assert.equal(p.HideMark,undefined);assert.equal(pos,end);assert.equal(bytes.readInt32LE(pos),0x12345678);
  if(populated){assert.equal(p.GridSpan,3);assert.equal(p.NoWrap,true);assert.equal(p.HMerge,2);}
 }
});
