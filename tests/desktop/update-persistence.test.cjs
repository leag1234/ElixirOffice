// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const network=require('./fixtures/deny-update-network.cjs')();
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function load(name,files,operations={}){
 const target=path.resolve(__dirname,'../../desktop',name),scope={exports:{}};
 vm.runInNewContext(fs.readFileSync(target,'utf8'),{module:scope,exports:scope.exports,Buffer,Uint8Array,process,
  require(key){if(key==='./files.cjs')return files;if(key==='node:fs/promises')return {mkdir:async()=>{},lstat:async()=>({isSymbolicLink:()=>false,isDirectory:()=>true,uid:process.getuid?.()}),chmod:async()=>{},readdir:async()=>[],rm:async()=>{},...operations};return require(key);}});
 return scope.exports;
}
test.after(()=>assert.equal(network.calls,0));
test('settings strict barrier reports a write failure while legacy flush still drains',async()=>{
 let fail=true;const store=load('settings-store.cjs',{atomic:async()=>{if(fail)throw Error('synthetic settings failure');}})('/synthetic/profile');
 await assert.rejects(()=>store.save({automatic:false}),/settings failure/);
 await store.flush();await assert.rejects(()=>store.barrier(),/settings failure/);
 fail=false;await store.save({automatic:false});await store.barrier();await store.flush();
});
test('settings barrier includes a write queued while it is waiting',async()=>{
 const first=deferred(),last=deferred();let calls=0;
 const store=load('settings-store.cjs',{atomic:()=>++calls===1?first.promise:last.promise})('/synthetic/profile');
 const a=store.save({value:1});let drained=false;const barrier=store.barrier().then(()=>{drained=true;});
 const b=store.save({value:2});first.resolve();await a;await tick();assert.equal(drained,false);
 last.resolve();await b;await barrier;assert.equal(drained,true);
});
test('recovery strict barrier preserves a queue failure alongside legacy tail semantics',async()=>{
 let fail=true;const {Recovery}=load('recovery.cjs',{atomic:async()=>{}},{rm:async()=>{if(fail)throw Error('synthetic recovery failure');}});
 const store=new Recovery('/synthetic/profile'),id='00000000-0000-4000-8000-000000000001';
 await assert.rejects(()=>store.remove(id),/recovery failure/);await store.tail;
 await assert.rejects(()=>store.barrier(),/recovery failure/);
 fail=false;await store.remove(id);await store.barrier();await store.tail;
});
test('recovery strict barrier includes cleanup queued during an existing write',async()=>{
 const first=deferred(),last=deferred();let calls=0;
 const {Recovery}=load('recovery.cjs',{atomic:async()=>{}},{rm:()=>++calls===1?first.promise:last.promise});
 const store=new Recovery('/synthetic/profile'),id='00000000-0000-4000-8000-000000000001';
 const a=store.remove(id);let drained=false;const barrier=store.barrier().then(()=>{drained=true;});
 const b=store.remove(id);first.resolve();await a;await tick();assert.equal(drained,false);
 last.resolve();await b;await barrier;assert.equal(drained,true);
});
