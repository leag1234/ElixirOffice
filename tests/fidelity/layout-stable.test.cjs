// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {step,REQUIRED}=require("../../tools/fidelity/layout-stable.cjs");
const ed=(o={})=>({isLongAction:()=>!!o.long,WordControl:{m_oLogicDocument:{FullRecalc:{Id:o.recalc?1:null},Pages:new Array(o.pages??3)},m_oDrawingDocument:{m_lPagesCount:o.count??o.pages??3,m_lCountCalculatePages:o.calc??o.pages??3,m_bIsDocumentCalculating:!!o.busy}}});
const run=(list)=>{let s;for(const e of list)s=step(e,s);return s};
test("stable layout reaches the required streak",()=>{
 assert.equal(run(Array.from({length:REQUIRED},()=>ed())).streak,REQUIRED);
});
test("pending recalculation resets the streak",()=>{
 const l=Array.from({length:REQUIRED-1},()=>ed());l.push(ed({recalc:true}));assert.equal(run(l).streak,0);
});
test("growing page count resets the streak",()=>{
 const l=Array.from({length:REQUIRED-1},()=>ed({pages:3}));l.push(ed({pages:4}));assert.equal(run(l).streak,0);
});
test("pages still being calculated are not stable",()=>{
 assert.equal(run([ed({pages:5,calc:3}),ed({pages:5,busy:true})]).streak,0);
 assert.equal(run([ed({long:true})]).streak,0);
});
