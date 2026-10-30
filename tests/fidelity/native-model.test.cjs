// SPDX-License-Identifier: AGPL-3.0-only
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertSameModel}=require('../../tools/fidelity/assert-native-model.cjs');
const model=()=>({allText:['public'],hideMark:true,pages:1,
 cellParagraphs:[{spacing:{After:2.822222222222222}}],
 target:{lines:1,pages:[{start:0,end:0,y:3.7,bottom:10.9}]},
 table:{startPage:0,rows:[{index:0,geometry:{StartPage:0,H:[10.90413631863064]},bottom:[26.918155456542966]}]}});
test('accept only the two observed IEEE754 physical rounding differences',()=>{
 const a=model(),b=model();b.table.rows[0].geometry.H[0]=10.904136318630643;b.table.rows[0].bottom[0]=26.91815545654297;
 assertSameModel(a,b,'same physical layout');
});
test('reject real geometry difference',()=>{
 const a=model(),b=model();b.table.rows[0].geometry.H[0]+=1e-6;assert.throws(()=>assertSameModel(a,b,'height changed'));
});
test('reject missing shape or geometry members',()=>{
 const a=model(),b=model();delete b.target.pages[0].bottom;assert.throws(()=>assertSameModel(a,b,'missing'));
});
for(const [label,change]of [
 ['text',b=>b.allText[0]='changed'],['property',b=>b.hideMark=false],
 ['page',b=>b.table.startPage=1],['line allocation',b=>b.target.pages[0].end=1],
 ['paragraph spacing',b=>b.cellParagraphs[0].spacing.After+=1e-12]
])test('keep '+label+' exact',()=>{const a=model(),b=model();change(b);assert.throws(()=>assertSameModel(a,b,label));});

test('reject sparse-array length changes',()=>{
 const a=model(),b=model();a.table.rows[0].bottom=new Array(1);b.table.rows[0].bottom=new Array(2);
 assert.throws(()=>assertSameModel(a,b,'sparse geometry shape'));
});
test('reject nonfinite geometry even in both arms',()=>{
 const a=model(),b=model();a.table.rows[0].geometry.H[0]=NaN;b.table.rows[0].geometry.H[0]=NaN;
 assert.throws(()=>assertSameModel(a,b,'nonfinite'));
});
