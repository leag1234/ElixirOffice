// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
assert(process.env.EO_UPSTREAM,'Set EO_UPSTREAM to the owned upstream worktree');
const Operation=require(path.join(process.env.EO_UPSTREAM,'web-apps/apps/common/main/lib/elixir-local/Operation.js'));
test('operation ready requires a native committed acknowledgement, never conversion bytes alone',async()=>{
 const events=[],tracker=Operation.create(e=>events.push(e),'document-one'),job=tracker.begin('pdf-export');
 job.phase('loading-runtime');job.progress({stage:'converting',completed:2,total:4});job.phase('awaiting-output');
 assert(!events.some(e=>e.phase==='ready'));let acknowledge;
 const commit=new Promise(resolve=>acknowledge=resolve);const done=commit.then(result=>job.finish(result));
 assert(tracker.isBusy());assert(!events.some(e=>e.phase==='ready'));
 acknowledge({kind:'saved',committed:true,name:'public.pdf',bytes:42});await done;
 assert.equal(events.at(-1).phase,'ready');assert.equal(events.at(-1).name,'public.pdf');assert.equal(events.at(-1).scope,'document-one');assert(!tracker.isBusy());
 const next=tracker.begin('export');next.finish({kind:'saved',bytes:42});
 assert.equal(events.at(-1).phase,'complete');assert.equal(events.at(-1).outcome,'completion-unconfirmed');
});
test('cancel/error outcomes are terminal, deduplicated and keep actual failure reasons',()=>{
 for(const mode of ['destination','abort','save-cancel','failure']){
  const events=[],job=Operation.create(e=>events.push(e)).begin('save');
  if(mode==='destination')job.finish({kind:'cancelled'});
  else if(mode==='abort')job.fail(Object.assign(Error('Aborted'),{name:'AbortError'}));
  else if(mode==='save-cancel')job.fail(Error('Save cancelled'));
  else job.fail(Error('Reading cancelled.marker failed'));
  const last=events.at(-1);assert.equal(last.phase,mode==='failure'?'error':'cancelled');
  if(mode==='failure')assert.equal(last.reason,'Reading cancelled.marker failed');
  assert.equal(job.finish({kind:'saved',committed:true}),false);assert.equal(job.cancel(),false);assert.equal(job.progress({stage:'converting'}),false);
  assert.equal(events.length,2);assert(!events.some(e=>e.phase==='ready'));
 }
});
test('stale/disposed/reentrant callbacks cannot emit a duplicate ready notification',()=>{
 const events=[];let current,reentered;
 const tracker=Operation.create(e=>{events.push(e);if(e.phase==='ready'){reentered=current.finish({kind:'saved',committed:true});}});
 current=tracker.begin('save');current.finish({kind:'saved',committed:true});assert.equal(reentered,false);
 const previous=current,next=tracker.begin('export');assert.equal(previous.phase('writing'),false);
 tracker.dispose();assert.throws(()=>tracker.begin('save'),/closed/);assert.equal(next.finish({kind:'saved',committed:true}),false);assert.equal(events.filter(e=>e.phase==='ready').length,1);
});
test('real phase counters remain scoped, invalid counters do not manufacture a percentage',()=>{
 const events=[],job=Operation.create(e=>events.push(e)).begin('export');
 assert.equal(job.progress({stage:'made-up',completed:4,total:4}),false);
 job.progress({stage:'converting',completed:3,total:0});assert.equal(events.at(-1).total,undefined);
 job.progress({stage:'converting',completed:2,total:3});assert.equal(events.at(-1).completed,2);assert.equal(events.at(-1).total,3);
 job.progress({stage:'converting',cancellable:false});assert.equal(events.at(-1).cancellable,false);job.progress({stage:'initializing'});assert.equal(events.at(-1).cancellable,undefined);
 assert(events.every(e=>e.percent===undefined));job.cancel();
});
test('observer failures cannot turn a committed save into a file failure',async()=>{
 const tracker=Operation.create(()=>{throw Error('Toast failed')}),job=tracker.begin('save');
 assert.equal(job.finish({kind:'saved',committed:true}),true);
 const asyncJob=Operation.create(()=>Promise.reject(Error('Observer failed'))).begin('save');
 assert.equal(asyncJob.finish({kind:'saved',committed:true}),true);await new Promise(setImmediate);
});
test('browser download initiation, print submission and durability warnings are distinct from ready',()=>{
 const events=[],tracker=Operation.create(e=>events.push(e));
 for(const kind of ['download-started','print-started','printed']){tracker.begin('export').finish({kind,name:'public.pdf'});assert.equal(events.at(-1).phase,'complete');assert.equal(events.at(-1).outcome,kind);}
 tracker.begin('save').finish({kind:'saved',committed:true,durabilityUnconfirmed:true,name:'public.pdf'});assert.equal(events.at(-1).phase,'warning');assert.equal(events.at(-1).reason,'durability-unconfirmed');
 assert(!events.some(e=>e.phase==='ready'));
});
