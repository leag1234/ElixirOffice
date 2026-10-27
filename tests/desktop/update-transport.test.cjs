// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const {createCandidate}=require('../../desktop/update-candidate.cjs'),{createPolicy}=require('../../desktop/update-policy.cjs');
const {createTransport,isPublicAddress,LIMITS}=require('../../desktop/update-transport.cjs');
const tick=()=>new Promise(setImmediate);
function fakeHTTP(responses){
 const calls=[],requests=[];
 const request=(url,options,callback)=>{
  calls.push({url:new URL(url),options});const req=new EventEmitter();requests.push(req);
  req.destroy=function(){this.destroyed=true;};
  req.end=()=>setImmediate(()=>{
   if(req.destroyed)return;
   options.lookup(new URL(url).hostname,{},(error,address,family)=>{
    if(error){req.emit('error',error);return;}
    assert.equal(address,'140.82.113.3');assert.equal(family,4);
    const item=responses.shift();if(!item)return;
    if(item.error){req.emit('error',item.error);return;}
    const body=new PassThrough();body.statusCode=item.status??200;body.headers=item.headers??{};
    callback(body);
    if(!item.hang)body.end(item.body??Buffer.alloc(0));
   });
  });
  return req;
 };
 return {request,calls,requests};
}
const lookup=async()=>[{address:'140.82.113.3',family:4}];
function transport(f,http,extra={}){return createTransport({...f,request:http.request,lookup,now:()=>f.now,...extra});}
function writer(){const blocks=[];return {aborted:0,finished:0,async write(b){blocks.push(Buffer.from(b));},async finish(){this.finished++;},async abort(){this.aborted++;},bytes(){return Buffer.concat(blocks);}};}
function timers(){let id=0;const pending=new Map();return {setTimeout(fn,ms){pending.set(++id,{fn,ms});return id;},clearTimeout(n){pending.delete(n);},has(ms){return [...pending.values()].some(v=>v.ms===ms);},fire(ms){for(const [n,v]of [...pending])if(v.ms===ms){pending.delete(n);v.fn();}},get count(){return pending.size;}};}
test.after(()=>assert.equal(network.calls,0,'No real network/DNS/process call is permitted'));
test('metadata fetch uses exact release URLs and no identifying/auth/cookie headers',async()=>{
 const f=fixture(),http=fakeHTTP([{body:f.envelope},{body:f.metadata}]),t=transport(f,http);
 const candidate=await t.getCandidate(f.selectedTag);
 assert.equal(candidate.artifact.sha512,f.context.artifact.sha512);assert.equal(http.calls.length,2);
 assert.equal(http.calls[0].url.pathname,'/leag1234/elixiroffice/releases/download/v0.4.0/latest.yml.sig.json');
 for(const call of http.calls){
  assert.equal(call.options.method,'GET');assert.equal(call.options.agent,false);assert.equal(call.options.rejectUnauthorized,true);
  assert.equal(call.options.servername,'github.com');assert.equal(call.options.autoSelectFamily,false);
  assert.deepEqual(call.options.headers,{'User-Agent':'ElixirOffice signed updates','Accept':'application/octet-stream','Accept-Encoding':'identity'});
 }
 t.dispose();
});
test('full artifact download copies bounded chunks and authenticates final size/hash',async()=>{
 const f=fixture(),c=createCandidate(f),http=fakeHTTP([{body:f.payload,headers:{'content-length':String(f.payload.length)}}]),t=transport(f,http),sink=writer(),events=[];
 const result=await t.download(c,sink,{progress:p=>events.push(p)});
 assert(sink.bytes().equals(f.payload));assert.equal(result.bytes,f.payload.length);assert.equal(sink.finished,1);assert.equal(sink.aborted,0);
 assert.equal(events.at(-1).downloaded,f.payload.length);assert.equal(events.at(-1).total,f.payload.length);t.dispose();
});
test('allowlisted redirects preserve constant headers and never expose signed query',async()=>{
 const f=fixture(),http=fakeHTTP([{status:302,headers:{location:'https://release-assets.githubusercontent.com/public?signature=synthetic-secret'}},{body:f.envelope},{body:f.metadata}]),t=transport(f,http);
 await t.getCandidate(f.selectedTag);assert.equal(http.calls.length,3);assert.equal(http.calls[1].url.hostname,'release-assets.githubusercontent.com');
 assert.equal(JSON.stringify(http.calls[1].options.headers).includes('synthetic-secret'),false);t.dispose();
});
for(const [label,location]of [
 ['HTTP','http://release-assets.githubusercontent.com/a'],['foreign host','https://attacker.invalid/a'],
 ['suffix spoof','https://github.com.attacker.invalid/a'],['credentials','https://user:password@github.com/a'],
 ['port','https://release-assets.githubusercontent.com:8443/a'],['fragment','https://release-assets.githubusercontent.com/a#x'],
 ['other repository','https://github.com/attacker/repo/releases/download/v0.4.0/latest.yml'],
 ['private literal','https://127.0.0.1/a'],['oversized location','https://release-assets.githubusercontent.com/'+ 'a'.repeat(5000)],
])test('redirect refuses '+label,async()=>{
 const f=fixture(),http=fakeHTTP([{status:302,headers:{location}}]),t=transport(f,http);
 await assert.rejects(()=>t.getCandidate(f.selectedTag),/transport/i);assert.equal(http.calls.length,1);t.dispose();
});
for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.'+'168.0.1','169.254.1.1','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','192.0.2.1','::1','::','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])test('DNS/address refuses '+address,async()=>{
 assert.equal(isPublicAddress(address),false);
 const f=fixture(),http=fakeHTTP([]),t=transport(f,http,{lookup:async()=>[{address,family:address.includes(':')?6:4}]});
 await assert.rejects(()=>t.getCandidate(f.selectedTag));assert.equal(http.calls.length,0);t.dispose();
});
test('mixed public/private DNS and explicit policy closure refuse before request',async()=>{
 const f=fixture(),http=fakeHTTP([]);
 assert.throws(()=>createTransport({...f,policy:createPolicy(),request:http.request,lookup}));
 const t=transport(f,http,{lookup:async()=>[{address:'140.82.113.3',family:4},{address:'127.0.0.1',family:4}]});
 await assert.rejects(()=>t.getCandidate(f.selectedTag));assert.equal(http.calls.length,0);t.dispose();
 for(const address of ['140.82.113.3','185.199.108.133','2606:50c0:8000::154'])assert.equal(isPublicAddress(address),true);
});
for(const [label,response]of [
 ['wrong status',{status:206,body:Buffer.from('partial')}],
 ['encoded body',{headers:{'content-encoding':'gzip'},body:Buffer.from('bad')}],
 ['oversized length',{headers:{'content-length':String(16*1024+1)},body:Buffer.from('bad')}],
 ['oversized body',{body:Buffer.alloc(16*1024+1)}],
 ['empty body',{body:Buffer.alloc(0)}],
 ['network error',{error:Error('https://private-query.invalid/?token=hidden')}],
])test('metadata refuses '+label,async()=>{
 const f=fixture(),http=fakeHTTP([response]),t=transport(f,http);
 await assert.rejects(()=>t.getCandidate(f.selectedTag),e=>e.message==='Update transport refused');t.dispose();
});
test('redirect count is bounded across a metadata operation',async()=>{
 const f=fixture(),http=fakeHTTP(Array.from({length:5},()=>({status:302,headers:{location:'https://release-assets.githubusercontent.com/redirect'}}))),t=transport(f,http);
 await assert.rejects(()=>t.getCandidate(f.selectedTag));assert.equal(http.calls.length,4);t.dispose();
});
for(const [label,body,length]of [
 ['wrong digest',Buffer.from('synthetic updater payloae'),null],
 ['truncated',Buffer.from('short'),null],
 ['oversized',Buffer.alloc(100),null],
 ['length mismatch',Buffer.from('short'),'5'],
])test('artifact '+label+' aborts without finishing staging',async()=>{
 const f=fixture(),http=fakeHTTP([{body,headers:length?{'content-length':length}:{}}]),t=transport(f,http),sink=writer();
 await assert.rejects(()=>t.download(createCandidate(f),sink));assert.equal(sink.finished,0);assert.equal(sink.aborted,1);t.dispose();
});
for(const mode of ['deadline','idle','abort','dispose'])test(mode+' cancels/destroys outstanding request and clears timers',async()=>{
 const f=fixture(),http=fakeHTTP([{hang:true}]),clock=timers(),control=new AbortController(),t=transport(f,http,{timers:clock});
 const promise=t.getCandidate(f.selectedTag,{signal:control.signal});await tick();await tick();
 if(mode==='deadline')clock.fire(LIMITS.metadataDeadline);
 if(mode==='idle')clock.fire(LIMITS.metadataIdle);
 if(mode==='abort')control.abort();if(mode==='dispose')t.dispose();
 await assert.rejects(promise,/transport/i);assert(http.requests.every(r=>r.destroyed));assert.equal(clock.count,0);t.dispose();
});
test('binary deadline and idle are bounded independently of metadata',async()=>{
 const f=fixture(),http=fakeHTTP([{hang:true}]),clock=timers(),t=transport(f,http,{timers:clock}),sink=writer();
 const promise=t.download(createCandidate(f),sink);await tick();await tick();clock.fire(LIMITS.artifactDeadline);
 await assert.rejects(promise);assert.equal(sink.aborted,1);assert.equal(clock.count,0);t.dispose();
});
test('forged or wrong-policy candidates cannot write or request',async()=>{
 const f=fixture(),http=fakeHTTP([]),t=transport(f,http),sink=writer(),other=fixture();
 await assert.rejects(()=>t.download({...createCandidate(f)},sink));
 await assert.rejects(()=>t.download(createCandidate(other),sink));
 assert.equal(http.calls.length,0);assert.equal(sink.bytes().length,0);t.dispose();
});
test('same-policy cross-platform candidate cannot request or write a payload',async()=>{
 const f=fixture(),other=fixture({platform:'linux'}),candidate=createCandidate({...other,policy:f.policy}),http=fakeHTTP([{body:other.payload}]),t=transport(f,http),sink=writer();
 await assert.rejects(()=>t.download(candidate,sink),/candidate/i);assert.equal(http.calls.length,0);assert.equal(sink.finished,0);t.dispose();
});
test('CDN-relative redirect remains on that approved CDN',async()=>{
 const f=fixture(),http=fakeHTTP([{status:302,headers:{location:'https://release-assets.githubusercontent.com/first'}},{status:302,headers:{location:'/second?sig=public-fixture'}},{body:f.envelope},{body:f.metadata}]),t=transport(f,http);
 await t.getCandidate(f.selectedTag);assert.equal(http.calls[2].url.hostname,'release-assets.githubusercontent.com');assert.equal(http.calls[2].url.pathname,'/second');t.dispose();
});
test('validated DNS address is copied before request creation',async()=>{
 const f=fixture(),address={address:'140.82.113.3',family:4},http=fakeHTTP([{body:f.envelope},{body:f.metadata}]);
 const t=transport(f,http,{lookup:async()=>{address.address='140.82.113.3';return [address];},request(url,options,cb){
  address.address='127.0.0.1';
  let seen;options.lookup(new URL(url).hostname,{},(e,ip)=>{if(e)throw e;seen=ip;});
  assert.equal(seen,'140.82.113.3');return http.request(url,options,cb);
 }});
 await t.getCandidate(f.selectedTag);t.dispose();
});
test('redirect budget is shared by envelope and YAML, not reset between them',async()=>{
 const f=fixture(),redirect={status:302,headers:{location:'https://release-assets.githubusercontent.com/next'}},
 http=fakeHTTP([redirect,redirect,{body:f.envelope},redirect,redirect,{body:f.metadata}]),t=transport(f,http);
 await assert.rejects(()=>t.getCandidate(f.selectedTag),/transport/i);assert.equal(http.calls.length,5);t.dispose();
});
test('documentation IPv6 range is never treated as a public destination',()=>assert.equal(isPublicAddress('3fff::1'),false));

for(const kind of ['metadata','artifact'])test('initial never-settling DNS obeys '+kind+' idle deadline with no publication',async()=>{
 let lookups=0;
 const f=fixture(),http=fakeHTTP([]),clock=timers(),sink=writer(),t=transport(f,http,{lookup:()=>{lookups++;return new Promise(()=>{});},timers:clock});
 const job=kind==='metadata'?t.getCandidate(f.selectedTag):t.download(createCandidate(f),sink);
 const rejection=assert.rejects(job,e=>e.code==='ERR_UPDATE_TRANSPORT');
 try{
  await tick();
  const idle=kind==='metadata'?2000:30000;
  assert.equal(lookups,1,'The initial DNS lookup must really have started');
  assert.equal(clock.has(kind==='metadata'?8000:1800000),true,'The independent total deadline remains armed');
  assert.equal(clock.has(idle),true,'Initial DNS must already be covered by the correct inactivity timer');
  clock.fire(idle);await rejection;
  assert.equal(http.calls.length,0);assert.equal(sink.finished,0);assert.equal(sink.bytes().length,0);
  assert.equal(clock.count,0,'Every total/idle timer must be cleared after rejection');
  assert.equal(sink.aborted,kind==='artifact'?1:0);
 }finally{t.dispose();await rejection;}
});
