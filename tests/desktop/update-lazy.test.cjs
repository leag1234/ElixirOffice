// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Lazy}=require('../../desktop/vendor/lazy-val-shim');
test('original Lazy is unevaluated until first value and invokes creator once',()=>{
 let count=0;const object={},lazy=new Lazy(()=>{count++;return object;});
 assert.equal(lazy.hasValue,false);assert.equal(count,0);assert.equal(lazy.value,object);
 assert.equal(lazy.hasValue,true);assert.equal(lazy.value,object);assert.equal(count,1);
});
for(const value of [undefined,null,false,0,''])test('Lazy caches falsy '+String(value),()=>{
 let count=0;const lazy=new Lazy(()=>{count++;return value;});
 assert.equal(lazy.value,value);assert.equal(lazy.value,value);assert.equal(lazy.hasValue,true);assert.equal(count,1);
});
test('pending and fulfilled Promise keep their exact identity',async()=>{
 let done,count=0;const promise=new Promise(resolve=>done=resolve),lazy=new Lazy(()=>{count++;return promise;});
 assert.equal(lazy.value,promise);assert.equal(lazy.hasValue,true);assert.equal(lazy.value,promise);
 done('ready');assert.equal(await lazy.value,'ready');assert.equal(count,1);
});
test('a rejected Promise is cached and never invokes creator again',async()=>{
 let count=0;const error=Error('synthetic failure'),promise=Promise.reject(error),lazy=new Lazy(()=>{count++;return promise;});
 await assert.rejects(lazy.value,e=>e===error);await assert.rejects(lazy.value,e=>e===error);assert.equal(count,1);assert.equal(lazy.hasValue,true);
});
test('synchronous creator failure leaves Lazy unevaluated and retryable',()=>{
 let count=0;const lazy=new Lazy(()=>{if(++count===1)throw Error('synthetic failure');return 'retry';});
 assert.throws(()=>lazy.value,/synthetic failure/);assert.equal(lazy.hasValue,false);
 assert.equal(lazy.value,'retry');assert.equal(lazy.hasValue,true);assert.equal(count,2);
});
test('public properties are readonly and factories must be functions',()=>{
 const lazy=new Lazy(()=>42);
 assert.throws(()=>{lazy.value=3;},TypeError);assert.throws(()=>{lazy.hasValue=true;},TypeError);
 for(const value of [null,undefined,1,{},'bad'])assert.throws(()=>new Lazy(value),TypeError);
});
test('owned shim declares original API-contract provenance, AGPL and no hooks/deps',()=>{
 const root=path.resolve(__dirname,'../../desktop/vendor/lazy-val-shim'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.name,'@elixiroffice/lazy-val-shim');assert.equal(pkg.license,'AGPL-3.0-only');assert.equal(pkg.private,true);
 for(const field of ['dependencies','optionalDependencies','peerDependencies','scripts'])assert.deepEqual(pkg[field]??{},{});
 const source=fs.readFileSync(path.join(root,'index.cjs'),'utf8');
 assert.match(source,/API contract/);assert.match(source,/not.*upstream.*code/);
 assert.match(fs.readFileSync(path.join(root,'LICENSE'),'utf8'),/GNU AFFERO GENERAL PUBLIC LICENSE/);
});
