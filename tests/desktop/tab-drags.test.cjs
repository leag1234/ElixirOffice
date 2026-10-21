// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{TabDrags}=require('../../desktop/tab-drags.cjs');
test('drag capability is bound to source or validated target and can be consumed once',()=>{
 const drags=new TabDrags(),token=randomUUID();assert.equal(drags.begin('document','source',token),true);
 assert.throws(()=>drags.take(token,{callerWindowId:'foreign',targetWindowId:'target'}),/another window/);
 const copy=drags.peek(token);copy.windowId='foreign';assert.equal(drags.peek(token).windowId,'source');
 assert.equal(drags.take(token,{callerWindowId:'target',targetWindowId:'target'}).documentId,'document');assert.equal(drags.take(token,{callerWindowId:'source'}),null);
});
test('source can finish a drag outside windows but expiration and stale capabilities fail closed',()=>{
 let now=0;const drags=new TabDrags({now:()=>now,ttl:10}),one=randomUUID(),two=randomUUID();drags.begin('a','source',one);drags.begin('b','source',two);
 assert.equal(drags.take(one,{callerWindowId:'source'}).documentId,'a');now=10;assert.equal(drags.peek(two),null);assert.equal(drags.take(two,{callerWindowId:'source'}),null);
});
test('drag storage is bounded and duplicate or malformed capabilities cannot replace an owner',()=>{
 const drags=new TabDrags({limit:1}),token=randomUUID();assert.throws(()=>drags.begin('a','source','not-a-token'),/Invalid/);
 drags.begin('a','source',token);assert.throws(()=>drags.begin('b','other',token),/unavailable/);assert.equal(drags.peek(token).documentId,'a');
 assert.throws(()=>drags.begin('b','source',randomUUID()),/unavailable/);drags.take(token,{callerWindowId:'source'});assert.equal(drags.begin('b','source',randomUUID()),true);
});
