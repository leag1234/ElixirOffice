// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {compareVersions,selectRelease,validReleaseURL,fetchReleases,create,DAY,API_URL,TIMEOUT_MS,MAX_BYTES}=require('../../desktop/release-notice.cjs');
const url=tag=>'https://github.com/leag1234/elixiroffice/releases/tag/'+encodeURIComponent(tag);
const release=(tag,extra={})=>({tag_name:tag,html_url:url(tag),draft:false,prerelease:tag.includes('-'),...extra});
for(const [a,b,wanted] of [
 ['0.3.1','0.3.2',-1],['v0.3.2','0.3.2',0],['1.9.0','1.10.0',-1],
 ['1.0.0-alpha','1.0.0-alpha.1',-1],['1.0.0-alpha.1','1.0.0-alpha.beta',-1],
 ['1.0.0-beta.2','1.0.0-beta.11',-1],['1.0.0-rc.1','1.0.0',-1],
 ['1.0.0+one','1.0.0+two',0],['9007199254740993.0.0','9007199254740992.9.9',1]
])test('SemVer precedence '+a+' / '+b,()=>assert.equal(compareVersions(a,b),wanted));
for(const bad of ['1.2','01.2.3','1.2.3-01','1.2.3-','1.2.3+','1.2.3/evil','1.2.3\n',{},'1'.repeat(200)])
 test('invalid release version rejected: '+String(bad).slice(0,30),()=>assert.equal(compareVersions(bad,'0.3.1'),null));
test('release selection includes prereleases, compares SemVer, ignores drafts/unsafe links',()=>{
 const selected=selectRelease([release('v0.3.4-rc.2'),release('v0.3.3'),release('v99.0.0',{draft:true}),release('v90.0.0',{html_url:'https://evil.invalid/'}),release('bad')],'0.3.1');
 assert.deepEqual(selected,{version:'0.3.4-rc.2',url:url('v0.3.4-rc.2')});
 assert.equal(selectRelease([release('v0.3.1'),release('v0.3.0')],'0.3.1'),null);
 assert.equal(selectRelease({},'0.3.1'),null);
});
test('release URL allowlist rejects credentials, extra hosts, ports, routes and encoded path escapes',()=>{
 assert.equal(validReleaseURL(url('v0.4.0')),url('v0.4.0'));
 for(const bad of ['http://github.com/leag1234/elixiroffice/releases/tag/v0.4.0','https://github.com.evil.invalid/leag1234/elixiroffice/releases/tag/v0.4.0','https://user@github.com/leag1234/elixiroffice/releases/tag/v0.4.0','https://github.com:444/leag1234/elixiroffice/releases/tag/v0.4.0','https://github.com/leag1234/other/releases/tag/v0.4.0','https://github.com/leag1234/elixiroffice/releases/download/v0.4.0/app.exe',url('v0.4.0')+'?url=evil',url('v0.4.0')+'#evil','https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0%2f..%2fevil'])
  assert.equal(validReleaseURL(bad),null,bad);
});
function mockHTTP({status=200,headers={},body='[]',stall=false}={}){
 const calls=[],response=new EventEmitter();response.statusCode=status;response.headers={'content-type':'application/json',...headers};response.destroy=()=>{response.destroyed=true};
 const request=(target,options,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{req.destroyed=true};calls.push({target,options,req});
  req.end=()=>queueMicrotask(()=>{callback(response);if(!stall&&!response.destroyed){response.emit('data',Buffer.from(body));response.complete=true;response.emit('end')}});
  return req;
 };
 return {request,calls,response};
}
test('anonymous fixed API request contains no document/user settings or asset URL',async()=>{
 const mock=mockHTTP({body:JSON.stringify([release('v0.4.0')])});
 assert.equal((await fetchReleases({request:mock.request}))[0].tag_name,'v0.4.0');
 assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].target,'https://api.github.com/repos/leag1234/elixiroffice/releases?per_page=20');
 assert.equal(API_URL,mock.calls[0].target);assert.equal(DAY,86400000);assert.equal(MAX_BYTES,524288);assert.equal(TIMEOUT_MS,8000);
 const options=mock.calls[0].options;
 assert.equal(options.method,'GET');assert.equal(options.agent,false);
 assert.equal(options.headers['Accept-Encoding'],'identity');
 assert(!/authorization|cookie|referer|document|filename|token|apiKey/i.test(JSON.stringify(options)));
});
for(const status of [301,302,403,404,429,500])test('HTTP '+status+' is rejected without following or reading another URL',async()=>{
 const mock=mockHTTP({status,headers:{location:'https://evil.invalid/'},body:'error'});
 await assert.rejects(fetchReleases({request:mock.request}));
 assert.equal(mock.calls.length,1);assert.equal(mock.response.destroyed,true);
});
test('response byte bound, Content-Length, content encoding, JSON and total deadline are enforced',async()=>{
 for(const options of [{body:'x'.repeat(MAX_BYTES+1)},{headers:{'content-length':String(MAX_BYTES+1)}},{headers:{'content-encoding':'gzip'}},{body:'not json'},{headers:{'content-type':'text/html'}}]){
  const mock=mockHTTP(options);await assert.rejects(fetchReleases({request:mock.request}));
  assert.equal(mock.calls[0].req.destroyed,true);
 }
 const slow=mockHTTP({stall:true});await assert.rejects(fetchReleases({request:slow.request,timeout:15}),/time/i);
 assert.equal(slow.calls[0].req.destroyed,true);
});
test('abort before or during the request stops the transport',async()=>{
 const first=new AbortController(),never=mockHTTP();first.abort();
 await assert.rejects(fetchReleases({request:never.request,signal:first.signal}));assert.equal(never.calls.length,0);
 const controller=new AbortController(),mock=mockHTTP({stall:true});
 const pending=fetchReleases({request:mock.request,signal:controller.signal});controller.abort();
 await assert.rejects(pending);assert.equal(mock.calls[0].req.destroyed,true);
});
function service({state={},failure=false,saveFailure=false,fetch:transport}={}){
 let time=100000,calls=0;const saved=[],changes=[],opened=[];
 const api=create({version:'0.3.1',state,now:()=>time,save:async value=>{if(saveFailure)throw Error('disk unavailable');saved.push(structuredClone(value));},fetch:transport||(async()=>{calls++;if(failure)throw Error('offline');return [release('v0.4.0-beta.1')]}),changed:value=>changes.push(value),open:async value=>opened.push(value)});
 return {api,saved,changes,opened,get calls(){return calls},advance:ms=>{time+=ms},time:()=>time};
}
test('default-on check is rate limited across repeated calls and restarts',async()=>{
 const s=service();assert.deepEqual(s.api.options(),{enabled:true});
 await Promise.all([s.api.check(),s.api.check()]);assert.equal(s.calls,1);assert(s.saved[0].lastAttempt===s.time());
 await s.api.check();assert.equal(s.calls,1);
 const restarted=service({state:s.saved.at(-1)});await restarted.api.check();assert.equal(restarted.calls,0);assert.equal(restarted.api.notice().version,'0.4.0-beta.1');
 s.advance(DAY);await s.api.check();assert.equal(s.calls,2);
});
test('offline errors remain silent and still reserve the full daily interval',async()=>{
 const s=service({failure:true});await s.api.check();await s.api.check();
 assert.equal(s.calls,1);assert.equal(s.api.notice(),null);assert.deepEqual(s.changes,[]);
 const restarted=service({state:s.saved.at(-1),failure:true});await restarted.api.check();assert.equal(restarted.calls,0);
});
test('failed attempt persistence prevents network access rather than bypassing the daily guard',async()=>{
 const s=service({saveFailure:true});await s.api.check();assert.equal(s.calls,0);assert.equal(s.api.notice(),null);
});
test('remind later and skip persist without hiding a different future version',async()=>{
 const s=service();await s.api.check();
 assert.equal(await s.api.action('later','0.4.0-beta.1'),true);assert.equal(s.api.notice(),null);
 const later=service({state:s.saved.at(-1)});assert.equal(later.api.notice(),null);
 s.advance(DAY);assert.equal(s.api.notice().version,'0.4.0-beta.1');
 assert.equal(await s.api.action('skip','0.4.0-beta.1'),true);assert.equal(s.api.notice(),null);
 const future=service({state:{...s.saved.at(-1),candidate:{version:'0.5.0',url:url('v0.5.0')}}});
 assert.equal(future.api.notice().version,'0.5.0');
});
test('external actions use only the current trusted release, and stale/unknown actions cannot change it',async()=>{
 const s=service();await s.api.check();
 assert.equal(await s.api.action('download','9.0.0'),false);assert.equal(await s.api.action('execute','0.4.0-beta.1'),false);
 assert.equal(await s.api.action('download','0.4.0-beta.1'),true);assert.equal(await s.api.action('notes','0.4.0-beta.1'),true);
 assert.deepEqual(s.opened,[url('v0.4.0-beta.1'),url('v0.4.0-beta.1')]);assert(s.api.notice());
});
test('disabling checks aborts in-flight work, ignores stale responses and retains the choice',async()=>{
 let resolve;const api=service({fetch:()=>new Promise(r=>{resolve=r})});const pending=api.api.check();
 for(let n=0;n<5&&!resolve;n++)await new Promise(setImmediate);
 await api.api.configure(false);resolve([release('v9.0.0')]);await pending;
 assert.deepEqual(api.api.options(),{enabled:false});assert.equal(api.api.notice(),null);assert.equal(api.saved.at(-1).enabled,false);
 assert.deepEqual(api.changes,[null]);
 await assert.rejects(api.api.configure('yes'));
});
test('malformed persisted metadata cannot inject a browser destination or enable network after explicit off',async()=>{
 const s=service({state:{enabled:false,lastAttempt:'bad',candidate:{version:'99.0.0',url:'https://evil.invalid/'}}});
 await s.api.check();assert.equal(s.calls,0);assert.equal(s.api.notice(),null);
});
test('disposal cancels pending transport and suppresses notifications',async()=>{
 let signal;const s=service({fetch:options=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})})});
 const pending=s.api.check();for(let n=0;n<5&&!signal;n++)await new Promise(setImmediate);
 s.api.dispose();await pending;assert.equal(signal.aborted,true);assert.deepEqual(s.changes,[]);
});

test('a synchronous storage failure cannot permanently latch the check promise',async()=>{
 let fail=true,calls=0,time=100000;
 const api=create({version:'0.3.1',save(){if(fail)throw Error('sync disk failure')},now:()=>time,fetch:async()=>{calls++;return []}});
 await api.check();fail=false;time+=DAY;await api.check();assert.equal(calls,1);api.dispose();
});

test('saving an unchanged enabled preference does not abort the current daily check',async()=>{
 let resolve,signal;const api=create({version:'0.3.1',save:async()=>{},fetch:options=>{signal=options.signal;return new Promise(r=>{resolve=r})}});
 const pending=api.check();for(let n=0;n<5&&!resolve;n++)await new Promise(setImmediate);
 await api.configure(true);assert.equal(signal.aborted,false);resolve([release('v0.4.0')]);await pending;
 assert.equal(api.notice().version,'0.4.0');api.dispose();
});
