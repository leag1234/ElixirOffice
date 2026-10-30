// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict');
const PHYSICAL=new Set(['y','yLimit','bottom','H','Y','X0','X1','TopDy','MaxTopBorder','MaxBotBorder']);
// One-billionth mm: handle IEEE754 recomputation noise, not layout differences.
const EPSILON_MM=1e-9;
function assertSameModel(actual,expected,message){
 function visit(a,b,path,physical=false){
  if(physical&&typeof a==='number'&&typeof b==='number'){
   assert(Number.isFinite(a)&&Number.isFinite(b),message+' nonfinite '+path);
   assert(Math.abs(a-b)<=EPSILON_MM,message+' geometry '+path+': '+a+' != '+b);
   return;
  }
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){
   assert.deepEqual(a,b,message+' '+path);return;
  }
  assert.equal(Array.isArray(a),Array.isArray(b),message+' shape '+path);
  if(Array.isArray(a))assert.equal(a.length,b.length,message+' array length '+path);
  const keys=Object.keys(a).sort();assert.deepEqual(keys,Object.keys(b).sort(),message+' keys '+path);
  for(const key of keys){
   // Only documented dimension fields within the two geometry subtrees.
   const geometry=path==='model.table'||path.startsWith('model.table.')
    ||path==='model.target.pages'||path.startsWith('model.target.pages.');
   visit(a[key],b[key],path+'.'+key,physical||(geometry&&PHYSICAL.has(key)));
  }
 }
 visit(actual,expected,'model');
}
module.exports={assertSameModel,EPSILON_MM};
