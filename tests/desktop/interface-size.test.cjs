// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../../desktop/interface-size.cjs');
test('an absent or corrupt stored interface preference preserves the OS-derived default',()=>{
 for(const value of [undefined,null,'125',NaN,Infinity,-Infinity,0,79,89,91,99,101,124,151,201,{},[],true])assert.equal(policy.read(value),100);
 for(const value of [80,90,100,110,125,150,175,200])assert.equal(policy.read(value),value);
 assert(Object.isFrozen(policy.levels));assert.deepEqual(policy.levels,[80,90,100,110,125,150,175,200]);
});
test('the IPC boundary refuses coercion, nonfinite and out-of-policy values',()=>{
 for(const value of [undefined,null,'125',NaN,Infinity,0,79,95,201,{},[],true])assert.throws(()=>policy.validate(value),/interface size/i);
 for(const value of policy.levels)assert.equal(policy.validate(value),value);
});
test('repeated stepping is bounded, reversible across adjacent presets and never accumulates rounding drift',()=>{
 let value=100;
 for(let i=0;i<100;i++)value=policy.step(value,1);
 assert.equal(value,200);
 for(let i=0;i<100;i++)value=policy.step(value,-1);
 assert.equal(value,80);
 for(let i=0;i<100;i++){value=policy.step(value,1);value=policy.step(value,-1);}
 assert.equal(value,80);
 assert.equal(policy.step(125,-1),110);assert.equal(policy.step(110,1),125);
 for(const direction of [0,2,-2,'1',null,{},NaN])assert.throws(()=>policy.step(100,direction),/direction/i);
 assert.throws(()=>policy.step(123,1),/interface size/i);
});
