// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdapter,completeHandoff,ACK_TIMEOUT_MS}=require('../../desktop/update-handoff.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function timers(){let pending=null;return {setTimeout(fn,ms){assert.equal(ms,ACK_TIMEOUT_MS);pending=fn;return 17;},clearTimeout(id){assert.equal(id,17);pending=null;},fire(){const f=pending;if(f)f();},get pending(){return !!pending;}};}
test('acknowledgement Promise exists before synchronous install and true is not success',async()=>{
 const t=timers();let hooks,settled=false,adapter;
 adapter=createAdapter({timers:t,launch(h){assert(adapter.acknowledgement instanceof Promise);hooks=h;return true;}});
 const promise=adapter.acknowledgement;promise.then(()=>settled=true);
 assert.equal(t.pending,false);assert.equal(adapter.install(),true);await tick();
 assert.equal(settled,false);assert.equal(t.pending,true);
 hooks.success();await promise;assert.equal(settled,true);assert.equal(t.pending,false);
});
test('async failure after true return prevents quit, discards adapter and restores app',async()=>{
 const t=timers(),calls=[];let hooks;
 const adapter=createAdapter({timers:t,launch(h){calls.push('install');hooks=h;return true;}});
 const result=completeHandoff({adapter,barrier:async()=>{calls.push('barrier');return true;},revalidate:async()=>{calls.push('verify');return true;},quit:()=>calls.push('quit'),restore:async()=>calls.push('restore')});
 await tick();assert.deepEqual(calls,['barrier','verify','install']);
 hooks.failure(Error('private path must not escape'));
 assert.equal(await result,false);assert.deepEqual(calls,['barrier','verify','install','restore']);
 assert.equal(adapter.state,'failed');assert.equal(adapter.install(),false);
});
test('only explicit successful acknowledgement after barriers permits one quit',async()=>{
 const t=timers(),calls=[];let hooks;
 const adapter=createAdapter({timers:t,launch(h){hooks=h;calls.push('install');return true;}});
 const result=completeHandoff({adapter,barrier:async()=>{calls.push('barrier');return true;},revalidate:async()=>{calls.push('verify');return true;},quit:()=>calls.push('quit'),restore:async()=>calls.push('restore')});
 await tick();hooks.success();assert.equal(await result,true);assert.deepEqual(calls,['barrier','verify','install','quit']);
 await assert.rejects(()=>completeHandoff({adapter,barrier:async()=>true,revalidate:async()=>true,quit:()=>calls.push('quit'),restore:async()=>{}}));
 assert.equal(calls.filter(x=>x==='quit').length,1);
});
for(const mode of ['false','throw','early-success-false','early-success-throw','promise'])test('invalid synchronous initiation '+mode+' cannot acknowledge success',async()=>{
 const t=timers();const adapter=createAdapter({timers:t,launch(h){if(mode.startsWith('early'))h.success();if(mode.endsWith('throw'))throw Error('launch failed');return mode==='promise'?Promise.resolve(true):false;}});
 assert.equal(adapter.install(),false);await assert.rejects(adapter.acknowledgement,/handoff/i);assert.equal(adapter.state,'failed');assert.equal(t.pending,false);
});
test('synchronous success is held until true return and then resolves safely',async()=>{
 const adapter=createAdapter({timers:timers(),launch(h){h.success();return true;}});
 assert.equal(adapter.install(),true);await adapter.acknowledgement;assert.equal(adapter.state,'acknowledged');
});
test('timeout rejects pending true return; late success cannot revive it',async()=>{
 const t=timers();let h;const adapter=createAdapter({timers:t,launch(value){h=value;return true;}});
 adapter.install();t.fire();await assert.rejects(adapter.acknowledgement,/handoff/i);h.success();assert.equal(adapter.state,'failed');
});
for(const which of ['barrier-false','barrier-throw','verify-false','verify-throw'])test(which+' prevents launch and restores opening',async()=>{
 let launches=0,quits=0,restores=0;
 const adapter=createAdapter({timers:timers(),launch(){launches++;return true;}});
 const barrier=async()=>{if(which==='barrier-throw')throw Error('write failed');return which!=='barrier-false';};
 const revalidate=async()=>{if(which==='verify-throw')throw Error('mutated');return which!=='verify-false';};
 assert.equal(await completeHandoff({adapter,barrier,revalidate,quit:()=>quits++,restore:async()=>restores++}),false);
 assert.equal(launches,0);assert.equal(quits,0);assert.equal(restores,1);assert.equal(adapter.state,'failed');
});
test('cancel while acknowledgement pending prevents quit and ignores late callbacks',async()=>{
 const controller=new AbortController(),t=timers();let hooks,quits=0,restores=0;
 const adapter=createAdapter({timers:t,launch(h){hooks=h;return true;}});
 const result=completeHandoff({adapter,barrier:async()=>true,revalidate:async()=>true,quit:()=>quits++,restore:async()=>restores++,signal:controller.signal});
 await tick();controller.abort();assert.equal(await result,false);hooks.success();assert.equal(quits,0);assert.equal(restores,1);assert.equal(t.pending,false);
});
test('already aborted handoff does not start a barrier or install',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const adapter=createAdapter({timers:timers(),launch(){calls++;return true;}});
 assert.equal(await completeHandoff({adapter,barrier:async()=>{calls++;return true;},revalidate:async()=>true,quit:()=>calls++,restore:async()=>{},signal:controller.signal}),false);
 assert.equal(calls,0);
});
test('forged/proxied adapters are rejected before reading their getters',async()=>{
 const fake={get acknowledgement(){throw Error('getter evaluated');}},args={barrier:async()=>true,revalidate:async()=>true,quit(){},restore:async()=>{}};
 await assert.rejects(()=>completeHandoff({...args,adapter:fake}),/adapter/i);
 const real=createAdapter({timers:timers(),launch(){return true;}});
 await assert.rejects(()=>completeHandoff({...args,adapter:new Proxy(real,{})}),/adapter/i);
 real.dispose();
});
test('adapter and acknowledgement identity are immutable; dispose is one-shot',async()=>{
 const adapter=createAdapter({timers:timers(),launch(){return true;}});
 assert(Object.isFrozen(adapter));const p=adapter.acknowledgement;
 assert.equal(adapter.dispose(),true);assert.equal(adapter.dispose(),false);assert.equal(adapter.install(),false);
 assert.equal(adapter.acknowledgement,p);await assert.rejects(p,/handoff/i);
});
test('failure during restoration still never quits',async()=>{
 let quit=0;const adapter=createAdapter({timers:timers(),launch(){return false;}});
 assert.equal(await completeHandoff({adapter,barrier:async()=>true,revalidate:async()=>true,quit:()=>quit++,restore:async()=>{throw Error('restore failed');}}),false);
 assert.equal(quit,0);
});
test('a timer callback before registration returns cannot launch or leak a timer',async()=>{
 let calls=0,cleared=0;
 const adapter=createAdapter({timers:{setTimeout(fn){fn();return 17;},clearTimeout(id){assert.equal(id,17);cleared++;}},launch(){calls++;return true;}});
 assert.equal(adapter.install(),false);await assert.rejects(adapter.acknowledgement,/handoff/i);
 assert.equal(calls,0);assert.equal(cleared,1);
});
test('asynchronous quit rejection is contained and never treated as success',async()=>{
 let restored=0;
 const adapter=createAdapter({timers:timers(),launch(h){h.success();return true;}});
 assert.equal(await completeHandoff({adapter,barrier:async()=>true,revalidate:async()=>true,quit:async()=>{throw Error('quit refused');},restore:async()=>restored++}),false);
 assert.equal(restored,1);
});
test('failure rejection is sanitized rather than exposing platform input',async()=>{
 const adapter=createAdapter({timers:timers(),launch(h){h.failure(Error('/private/synthetic-path'));return true;}});
 adapter.install();await assert.rejects(adapter.acknowledgement,error=>error.message==='Update handoff failed'&&error.code==='ERR_UPDATE_HANDOFF');
});
