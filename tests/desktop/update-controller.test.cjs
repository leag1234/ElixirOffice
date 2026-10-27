// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const {createAdapter}=require('../../desktop/update-handoff.cjs'),{createPolicy}=require('../../desktop/update-policy.cjs');
const {createController,validateSettings}=require('../../desktop/update-controller.cjs');
const tick=()=>new Promise(setImmediate),notice=Object.freeze({version:'0.4.0',url:'https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0'});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function phase(c,wanted){for(let n=0;n<30&&c.state().phase!==wanted;n++)await tick();assert.equal(c.state().phase,wanted);}
function environment(options={}){
 const f=fixture(),calls={factory:0,prepare:0,install:0,launch:0,dispose:0,release:0,quit:0,restore:0,persist:[],events:[]},receipt=Object.freeze({testReceipt:true});
 let ack;
 const c=createController({version:'0.3.2',runtime:f.runtime,policy:options.policy||f.policy,
  timers:options.timers,initial:{enabled:true,automatic:false,...options.initial},eligible:options.eligible||(async()=>true),
  persist:async value=>{calls.persist.push({...value});await options.persist?.(value);},
  changed:value=>calls.events.push(value),report:code=>{calls.events.push({diagnostic:code});return options.report?.(code);},now:()=>10000,
  createSession:async()=>{
   calls.factory++;return {
    async prepare(candidate,context){calls.prepare++;calls.candidate=candidate;calls.signal=context.signal;calls.progress=context.progress;
     if(options.prepare)return options.prepare(candidate,context);return receipt;},
    async install(value,intent){assert.equal(value,receipt);calls.install++;calls.installIntent=intent;
     if(options.install)throw Error('Synthetic prepare/install failure');
     const adapter=createAdapter({launch(callbacks){calls.launch++;ack=callbacks;if(options.autoAck!==false)callbacks.success();return true;}});
     return {adapter,revalidate:async()=>options.revalidate!==false,release:async()=>{calls.release++;await options.release?.();}};},
    dispose(){calls.dispose++;},
   };
  }});
 const exit=extra=>c.exit({reason:'user',barrier:async()=>true,quit:()=>{calls.quit++;},restore:()=>{calls.restore++;},...extra});
 return {c,calls,exit,get ack(){return ack;}};
}
test.after(()=>assert.equal(network.calls,0));
test('explicitly closed policy refuses before eligibility, dependency/session construction or I/O',async()=>{
 let eligibility=0;const e=environment({policy:createPolicy(),eligible:async()=>{eligibility++;return true;},initial:{automatic:true}});
 await e.c.offer(notice);assert.equal(e.c.options().installationAvailable,false);assert.equal(e.c.options().automatic,false);
 assert.equal((await e.c.request(notice.version)).accepted,false);assert.equal(e.calls.factory,0);assert.equal(eligibility,0);
 assert.equal(await e.exit(),true);assert.equal(e.calls.launch,0);e.c.dispose();
});
test('automatic preference defaults OFF and release discovery alone does not fetch a payload',async()=>{
 const e=environment();await e.c.offer(notice);await tick();
 assert.equal(e.c.options().automatic,false);assert.equal(e.c.options().installationAvailable,true);assert.equal(e.calls.factory,0);
 assert.equal(e.c.decorate(notice).install.phase,'available');assert.equal(await e.exit(),true);assert.equal(e.calls.install,0);e.c.dispose();
});
test('two windows share one preparation job and completion never quits or installs',async()=>{
 const pending=deferred(),e=environment({prepare:()=>pending.promise});await e.c.offer(notice);
 const a=e.c.request(notice.version),b=e.c.request(notice.version);await phase(e.c,'preparing');assert.equal(e.calls.factory,1);
 pending.resolve(Object.freeze({testReceipt:true}));const results=await Promise.all([a,b]);
 assert(results.every(r=>r.accepted&&!r.exitRequested));assert.equal(e.calls.prepare,1);assert.equal(e.calls.install,0);assert.equal(e.calls.quit,0);e.c.dispose();
});
test('a new ready Install click authorizes ordinary exit after barriers and independent ack',async()=>{
 const e=environment({autoAck:false});await e.c.offer(notice);assert.equal((await e.c.request(notice.version)).exitRequested,false);
 assert.equal(e.c.state().phase,'ready');assert.equal((await e.c.request(notice.version)).exitRequested,true);
 const barrier=deferred(),exit=e.exit({barrier:()=>barrier.promise});await tick();assert.equal(e.calls.launch,0);
 barrier.resolve(true);for(let n=0;n<30&&!e.ack;n++)await tick();assert(e.ack);assert.equal(e.calls.quit,0);
 e.ack.success();assert.equal(await exit,true);assert.equal(e.calls.quit,1);assert.equal(e.calls.release,1);e.c.dispose();
});
test('automatic download begins only after durable explicit opt-in, and does not itself install',async()=>{
 const save=deferred(),e=environment({persist:()=>save.promise});await e.c.offer(notice);
 const pending=e.c.configure({enabled:true,automatic:true});await tick();assert.equal(e.calls.factory,0);
 save.resolve();await pending;await phase(e.c,'ready');assert.equal(e.calls.prepare,1);assert.equal(e.calls.quit,0);
 assert.equal(await e.exit(),true);assert.equal(e.calls.launch,1);e.c.dispose();
});
test('failed automatic preference write never starts a job',async()=>{
 const e=environment({persist:async()=>{throw Error('disk full');}});await e.c.offer(notice);
 await assert.rejects(()=>e.c.configure({enabled:true,automatic:true}));assert.equal(e.c.options().automatic,false);assert.equal(e.calls.factory,0);e.c.dispose();
});
for(const reason of ['unknown','window','shutdown','crash','timer'])test('no installation on '+reason+' exit, even with ready automatic update',async()=>{
 const e=environment({initial:{automatic:true}});await e.c.offer(notice);await phase(e.c,'ready');
 assert.equal(await e.exit({reason}),true);assert.equal(e.calls.install,0);assert.equal(e.calls.launch,0);e.c.dispose();
});
for(const name of ['Cancel','failed save','failed settings','failed recovery','unsettled file job'])test(name+' barrier means zero installs and no quit',async()=>{
 const e=environment({initial:{automatic:true}});await e.c.offer(notice);await phase(e.c,'ready');
 const barrier=name==='Cancel'?async()=>false:async()=>{throw Error(name);};
 assert.equal(await e.exit({barrier}),false);assert.equal(e.calls.launch,0);assert.equal(e.calls.quit,0);assert.equal(e.calls.restore,1);e.c.dispose();
});
test('turning Checks OFF aborts active preparation immediately and suppresses its late result',async()=>{
 const pending=deferred(),e=environment({prepare:()=>pending.promise});await e.c.offer(notice);
 const job=e.c.request(notice.version);await phase(e.c,'preparing');await e.c.configure({enabled:false,automatic:false});
 assert.equal(e.calls.signal.aborted,true);assert.equal(e.c.options().enabled,false);
 pending.resolve({testReceipt:true});await job;assert.notEqual(e.c.state().phase,'ready');assert.equal(e.c.decorate(notice).install,undefined);assert.equal(e.calls.launch,0);e.c.dispose();
});
test('turning automatic OFF cancels its background job while a manual job may complete',async()=>{
 for(const automatic of [true,false]){
  const pending=deferred(),e=environment({initial:{automatic},prepare:()=>pending.promise});await e.c.offer(notice);
  const job=automatic?null:e.c.request(notice.version);await phase(e.c,'preparing');await e.c.configure({enabled:true,automatic:false});
  assert.equal(e.calls.signal.aborted,automatic);pending.resolve({testReceipt:true});if(job)await job;else await tick();e.c.dispose();
 }
});
test('candidate change and disposed controller reject stale clicks and never start overlapping jobs',async()=>{
 const pending=deferred(),e=environment({prepare:()=>pending.promise});await e.c.offer(notice);
 const old=e.c.request(notice.version);await phase(e.c,'preparing');
 const next={version:'0.4.1',url:'https://github.com/leag1234/elixiroffice/releases/tag/v0.4.1'};await e.c.offer(next);
 assert.equal(e.calls.signal.aborted,true);assert.equal((await e.c.request('0.4.0')).accepted,false);
 const newer=e.c.request(next.version);await tick();assert.equal(e.calls.factory,1);
 pending.resolve({testReceipt:true});await old;await newer;assert.equal(e.calls.factory,2);e.c.dispose();
 assert.equal((await e.c.request(next.version)).accepted,false);
});
test('Checks OFF during close barriers revokes the captured install transaction',async()=>{
 const e=environment({initial:{automatic:true}});await e.c.offer(notice);await phase(e.c,'ready');const wait=deferred(),job=e.exit({barrier:()=>wait.promise});
 await tick();await e.c.configure({enabled:false,automatic:false});wait.resolve(true);
 assert.equal(await job,false);assert.equal(e.calls.launch,0);assert.equal(e.calls.quit,0);e.c.dispose();
});
test('async install error after true launch restores the application without quit',async()=>{
 const e=environment({initial:{automatic:true},autoAck:false});await e.c.offer(notice);await phase(e.c,'ready');const job=e.exit();
 for(let n=0;n<30&&!e.ack;n++)await tick();assert(e.ack);e.ack.failure();
 assert.equal(await job,false);assert.equal(e.calls.quit,0);assert.equal(e.calls.restore,1);assert.equal(e.calls.release,1);e.c.dispose();
});
test('unsupported package never constructs install-capable dependencies',async()=>{
 const e=environment({eligible:async()=>false,initial:{automatic:true}});await e.c.offer(notice);assert.equal((await e.c.request(notice.version)).accepted,false);
 assert.equal(e.calls.factory,0);assert.equal(e.c.decorate(notice).install,undefined);e.c.dispose();
});
test('candidate and IPC settings cannot supply URLs, paths, executable policy or unexpected fields',async()=>{
 for(const value of [null,[],{}, {enabled:'yes'}, {enabled:true,automatic:'yes'},{enabled:true,url:'https://evil.invalid/'},{enabled:true,path:'/tmp/not-an-update'},{enabled:true,automatic:true,policy:true}])
  assert.throws(()=>validateSettings(value),/setting/i);
 assert.deepEqual(validateSettings({enabled:true}),{enabled:true});
 assert.deepEqual(validateSettings({enabled:false,automatic:false}),{enabled:false,automatic:false});
 const e=environment();
 for(const value of [{version:'0.4.0',url:'https://evil.invalid/'},{version:'0.4.0',url:notice.url+'/other'},{version:'0.4.1',url:notice.url}]){
  await e.c.offer(value);assert.equal((await e.c.request(value.version)).accepted,false);
 }
 assert.equal(e.calls.factory,0);e.c.dispose();
});
test('malformed progress cannot leak arbitrary objects or retarget a displayed version',async()=>{
 const pending=deferred(),e=environment({prepare:()=>pending.promise});await e.c.offer(notice);const job=e.c.request(notice.version);await phase(e.c,'preparing');
 e.calls.progress({downloaded:1,total:10});assert.equal(e.c.state().percent,10);
 for(const bad of [{downloaded:Infinity,total:10},{downloaded:-1,total:10},{downloaded:1,total:0},{downloaded:11,total:10},{downloaded:'secret',total:10}])e.calls.progress(bad);
 assert.equal(e.c.state().percent,10);assert.equal(JSON.stringify(e.c.state()).includes('secret'),false);
 pending.resolve({testReceipt:true});await job;e.c.dispose();
});

test('normal exit Cancel accepts a synchronous restore and never quits',async()=>{
 const e=environment();await e.c.offer(notice);assert.equal(await e.exit({barrier:async()=>false}),false);
 assert.equal(e.calls.quit,0);assert.equal(e.calls.restore,1);e.c.dispose();
});
test('equal or older release cannot create an install-capable session',async()=>{
 const e=environment();
 for(const version of ['0.3.2','0.3.1']){await e.c.offer({version,url:'https://github.com/leag1234/elixiroffice/releases/tag/v'+version});assert.equal((await e.c.request(version)).accepted,false);}
 assert.equal(e.calls.factory,0);e.c.dispose();
});
test('simultaneous user exits share one barrier and one acknowledged launch',async()=>{
 const e=environment({initial:{automatic:true}});await e.c.offer(notice);await phase(e.c,'ready');const wait=deferred();let barriers=0;
 const a=e.exit({barrier:()=>{barriers++;return wait.promise;}}),b=e.exit();assert.equal(a,b);
 await tick();assert.equal(barriers,1);wait.resolve(true);assert.equal(await a,true);assert.equal(e.calls.launch,1);e.c.dispose();
});
test('a later Checks OFF wins over pending opt-in persistence without starting a job',async()=>{
 const save=deferred();let writes=0;const e=environment({persist:()=>++writes===1?save.promise:undefined});await e.c.offer(notice);
 const on=e.c.configure({enabled:true,automatic:true});await tick();const off=e.c.configure({enabled:false,automatic:false});
 save.resolve();await on;await off;assert.equal(e.calls.factory,0);assert.equal(e.c.options().enabled,false);e.c.dispose();
});
test('revocation after launch initiation rejects acknowledgement and never quits',async()=>{
 const e=environment({initial:{automatic:true},autoAck:false});await e.c.offer(notice);await phase(e.c,'ready');const job=e.exit();
 for(let n=0;n<30&&!e.ack;n++)await tick();assert(e.ack);
 await e.c.configure({enabled:false,automatic:false});e.ack.success();
 assert.equal(await job,false);assert.equal(e.calls.quit,0);assert.equal(e.calls.restore,1);e.c.dispose();
});
test('a canceled noncooperative preparation has a bounded drain and cannot block exit forever',async()=>{
 const entries=new Map();let id=0;
 const clock={setTimeout(fn,ms){entries.set(++id,{fn,ms});return id;},clearTimeout(n){entries.delete(n);},fire(ms){for(const [k,v]of [...entries])if(v.ms===ms){entries.delete(k);v.fn();}}};
 const pending=deferred(),e=environment({timers:clock,prepare:()=>pending.promise});await e.c.offer(notice);const prepare=e.c.request(notice.version);await phase(e.c,'preparing');
 const exit=e.exit({reason:'unknown'});
 try{
  await tick();assert([...entries.values()].some(v=>v.ms===3000));clock.fire(3000);
  assert.equal(await exit,false);assert.equal(e.calls.quit,0);assert.equal(e.calls.install,0);assert.equal(e.calls.restore,1);assert.equal(entries.size,0);
 }finally{pending.resolve({testReceipt:true});await prepare;await exit.catch(()=>{});e.c.dispose();}
});

test('only background-authorized ordinary exit requests silent installation',async()=>{
 for(const clicked of [false,true]){
  const e=environment({initial:{automatic:true}});await e.c.offer(notice);await phase(e.c,'ready');
  if(clicked)assert.equal((await e.c.request(notice.version)).exitRequested,true);
  assert.equal(await e.exit(),true);assert.deepEqual(e.calls.installIntent,{automatic:!clicked});e.c.dispose();
 }
});

test('acknowledged handoff awaits cache release before the quit callback can terminate the process',async()=>{
 const cleanup=deferred(),e=environment({initial:{automatic:true},release:()=>cleanup.promise});
 await e.c.offer(notice);await phase(e.c,'ready');const exit=e.exit();
 for(let n=0;n<40&&!e.calls.release;n++)await tick();
 try{
  assert.equal(e.calls.launch,1);assert.equal(e.calls.release,1);
  assert.equal(e.calls.quit,0,'quit cannot race an unresolved lease release');
 }finally{cleanup.resolve();}
 assert.equal(await exit,true);assert.equal(e.calls.quit,1);assert.equal(e.calls.release,1);e.c.dispose();
});
test('quit observes completed cache cleanup rather than relying on an asynchronous finally',async()=>{
 let removed=false;
 const e=environment({initial:{automatic:true},release:async()=>{await tick();removed=true;}});
 await e.c.offer(notice);await phase(e.c,'ready');
 assert.equal(await e.exit({quit:()=>{assert.equal(removed,true,'lease must already be released at real process exit');e.calls.quit++;}}),true);
 assert.equal(e.calls.quit,1);assert.equal(e.calls.release,1);e.c.dispose();
});
test('release failure after ACK prevents automatic quit but preserves and reports the applied install',async()=>{
 const e=environment({initial:{automatic:true},release:async()=>{throw Error('synthetic lease cleanup fault');}});
 await e.c.offer(notice);await phase(e.c,'ready');
 assert.equal(await e.exit(),false);assert.equal(e.calls.launch,1);assert.equal(e.calls.quit,0);assert.equal(e.calls.restore,1);
 assert.equal(e.c.state().acknowledged,true);assert.equal(e.c.state().error,'cleanup');
 assert(e.calls.events.some(x=>x.diagnostic==='update-install-acknowledged'));
 assert(e.calls.events.some(x=>x.diagnostic==='update-lease-release-failure'));
 assert.equal(e.c.options().installationAvailable,false);
 await e.c.offer(notice);assert.equal((await e.c.request(notice.version)).accepted,false);
 assert.equal(e.calls.install,1);assert.equal(e.calls.release,1);e.c.dispose();
});
