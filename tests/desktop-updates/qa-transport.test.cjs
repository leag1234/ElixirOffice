// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {fixture}=require('../desktop/fixtures/update-test-kit.cjs'),wire=require('../../desktop/update-candidate.cjs');
const {createQATransport}=require('../../tools/desktop-updates/qa/transport.cjs');
async function checkpoint(promise){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('QA fixture checkpoint deadline')),2000);})]);}
 finally{clearTimeout(timer);}
}
async function until(predicate){
 const end=require('node:perf_hooks').performance.now()+2000;
 while(!predicate()&&require('node:perf_hooks').performance.now()<end)await new Promise(setImmediate);
 assert(predicate(),'QA fixture request must arrive within2s');
}

async function using(fn,options={}){
 const f=fixture({platform:'linux'}),requests=[];
 const rows=new Map([['latest-linux.yml',f.metadata],['latest-linux.yml.sig.json',f.envelope],[f.context.artifact.name,f.payload]]);
 const server=http.createServer((req,res)=>{
  requests.push({url:req.url,host:req.headers.host});
  if(options.handle)return options.handle(req,res,rows);
  const b=rows.get(decodeURIComponent(req.url.split('/').at(-1)));if(!b){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-length':String(b.length)});res.end(b);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const endpoint={host:'127.0.0.1',port:server.address().port,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'};
 const transport=createQATransport({...f,now:()=>f.now,endpoint,tag:f.selectedTag,wire});
 try{return await fn({f,endpoint,transport,requests,rows});}
 finally{transport.dispose();await new Promise(r=>server.close(r));}
}
test('QA transport serves exactly pinned loopback paths and retains signed provenance and artifact hash',()=>using(async e=>{
 const c=await e.transport.getCandidate(e.f.selectedTag),chunks=[];let finished=0,aborted=0;
 await e.transport.download(c,{async write(b){chunks.push(b);},async finish(){finished++;},async abort(){aborted++;}});
 assert.deepEqual(Buffer.concat(chunks),e.f.payload);assert.equal(finished,1);assert.equal(aborted,0);
 assert.deepEqual(e.requests.map(x=>x.url),['latest-linux.yml.sig.json','latest-linux.yml',e.f.context.artifact.name].map(x=>e.endpoint.prefix+x));
 assert(e.requests.every(x=>x.host==='127.0.0.1:'+e.endpoint.port));
 await assert.rejects(()=>e.transport.getCandidate('v0.4.1'));assert.equal(e.requests.length,3);
}));
test('QA endpoint rejects DNS names, other addresses, port coercion, credentials and path tricks before requests',()=>{
 const f=fixture();
 for(const endpoint of [
  {host:'localhost',port:8000,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'},
  {host:'127.0.0.2',port:8000,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'},
  {host:'::1',port:8000,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'},
  {host:'127.0.0.1',port:'8000',prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'},
  {host:'127.0.0.1',port:8000,prefix:'/../'},
  {host:'127.0.0.1',port:8000,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/',extra:true}
 ])assert.throws(()=>createQATransport({...f,endpoint,tag:f.selectedTag,wire}));
});
test('QA actual socket uses no DNS or proxy even with hostile proxy environment',async()=>{
 const dns=require('node:dns'),before=dns.lookup,env=process.env.HTTP_PROXY;let lookups=0;
 await using(async e=>{
  // Binding the owned server is setup, not client transport. Node's listen
  // resolves even its numeric bind address, so arm the guard after binding.
  dns.lookup=()=>{lookups++;throw Error('DNS forbidden');};process.env.HTTP_PROXY='http://invalid.invalid:1';
  try{await e.transport.getCandidate(e.f.selectedTag);assert.equal(lookups,0);}
  finally{dns.lookup=before;if(env===undefined)delete process.env.HTTP_PROXY;else process.env.HTTP_PROXY=env;}
 });
});
test('QA redirect, compressed, oversized, truncated and altered signed bytes fail with no fallback',async()=>{
 for(const mode of ['redirect','compressed','oversized','truncated','tampered']){
  let requests=0;
  await using(async e=>{await assert.rejects(()=>e.transport.getCandidate(e.f.selectedTag));assert.equal(requests,1);},{
   handle(req,res,rows){requests++;const b=rows.get('latest-linux.yml.sig.json');
    if(mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1:1/'});return res.end();}
    if(mode==='compressed'){res.writeHead(200,{'content-encoding':'gzip'});return res.end(b);}
    if(mode==='oversized'){res.writeHead(200,{'content-length':'16385'});return res.end(b);}
    if(mode==='truncated'){res.writeHead(200,{'content-length':String(b.length+1)});return res.end(b);}
    res.writeHead(200);res.end(Buffer.from('tampered'));
   }
  });
 }
});
test('QA artifact mutation aborts sink without publishing',()=>using(async e=>{
 const c=await e.transport.getCandidate(e.f.selectedTag);e.rows.set(e.f.context.artifact.name,Buffer.alloc(e.f.payload.length,1));
 let finish=0,abort=0;
 await assert.rejects(()=>e.transport.download(c,{async write(){},async finish(){finish++;},async abort(){abort++;}}));
 assert.equal(finish,0);assert.equal(abort,1);
}));
test('QA user cancellation closes a stalled actual loopback response and publishes no sink',()=>using(async e=>{
 const controller=new AbortController(),p=e.transport.getCandidate(e.f.selectedTag,{signal:controller.signal});
 await new Promise(r=>setTimeout(r,25));controller.abort();
 await assert.rejects(()=>p);
},{handle(req,res){res.writeHead(200);res.write('x');}}));
test('QA initial HTTP stall has the 2s idle and shared 8s metadata deadline, both timers removed',()=>using(async e=>{
 const timers=new Map(),events=[];let next=1;
 const fake={setTimeout(fn,ms){events.push(ms);const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
 const t=createQATransport({...e.f,now:()=>e.f.now,endpoint:e.endpoint,tag:e.f.selectedTag,wire,timers:fake});
 try{
  const pending=t.getCandidate(e.f.selectedTag);
  await until(()=>e.requests.length>0);
  assert(events.some(ms=>ms<=8000&&ms>7900));assert(events.includes(2000));
  const idle=[...timers.values()].find(x=>x.ms===2000);assert(idle);idle.fn();
  await assert.rejects(()=>pending);assert.equal(timers.size,0);assert.equal(e.requests.length,1);
 }finally{t.dispose();}
},{handle(){}}));
test('QA artifact stall retains the 30s idle and 30min total budget and aborts the sink',()=>using(async e=>{
 const c=await e.transport.getCandidate(e.f.selectedTag),timers=new Map(),events=[];let next=1,finished=0,aborted=0;
 const fake={setTimeout(fn,ms){events.push(ms);const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
 const t=createQATransport({...e.f,now:()=>e.f.now,endpoint:e.endpoint,tag:e.f.selectedTag,wire,timers:fake});
 const before=e.requests.length;
 try{
  // Same validated candidate and owner policy; real socket, artificial clock.
  const p=t.download(c,{async write(){},async finish(){finished++;},async abort(){aborted++;}});
  await until(()=>e.requests.length>before);
  assert(events.includes(1800000));assert(events.includes(30000));
  [...timers.values()].find(x=>x.ms===30000).fn();
  await assert.rejects(()=>p);assert.equal(finished,0);assert.equal(aborted,1);assert.equal(timers.size,0);
 }finally{t.dispose();}
},{handle(req,res,rows){
 const name=req.url.split('/').at(-1);if(!name.endsWith('.yml')&&!name.endsWith('.json'))return;
 const b=rows.get(name);res.writeHead(200,{'content-length':String(b.length)});res.end(b);
}}));
test('QA envelope and YAML share one 8s total budget rather than each receiving 8s',()=>using(async e=>{
 const before=Date.now;let clock=1000000,id=0;const events=[],active=new Set();
 const fake={setTimeout(fn,ms){events.push(ms);const n=++id;active.add(n);return n;},clearTimeout(n){active.delete(n);}};
 const t=createQATransport({...e.f,now:()=>e.f.now,endpoint:e.endpoint,tag:e.f.selectedTag,wire,timers:fake});
 Date.now=()=>clock;e.advanceClock=()=>{clock+=5000;};
 sharedClockAdvance=e.advanceClock;
 try{await t.getCandidate(e.f.selectedTag);assert(events.includes(8000));assert(events.includes(3000));assert.equal(events.filter(n=>n===8000).length,1);assert.equal(active.size,0);}
 finally{Date.now=before;sharedClockAdvance=null;t.dispose();}
},{handle(req,res,rows){
 if(req.url.endsWith('.sig.json'))sharedClockAdvance();
 const b=rows.get(req.url.split('/').at(-1));res.writeHead(200,{'content-length':String(b.length)});res.end(b);
}}));
let sharedClockAdvance=null;
test('QA artifact deadline remains armed through sink publication and aborts a stalled finish',()=>using(async e=>{
 const c=await e.transport.getCandidate(e.f.selectedTag),timers=new Map();let id=0,entered,release,aborted=0;
 const reached=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const fake={setTimeout(fn,ms){const n=++id;timers.set(n,{fn,ms});return n;},clearTimeout(n){timers.delete(n);}};
 const t=createQATransport({...e.f,now:()=>e.f.now,endpoint:e.endpoint,tag:e.f.selectedTag,wire,timers:fake});
 const p=t.download(c,{async write(){},async finish(){entered();await hold;},async abort(){aborted++;}});
 try{
  await checkpoint(reached);const idle=[...timers.values()].find(x=>x.ms===30000);assert(idle,'artifact timeout must cover sink.finish');idle.fn();
  await assert.rejects(()=>p);assert.equal(aborted,1);assert.equal(timers.size,0);
 }finally{release();await p.catch(()=>{});t.dispose();}
}));
