// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fixture}=require('./harness-fixture.cjs');
const request=id=>({url:()=> 'https://synthetic.invalid/'+id,method:()=> 'GET'});
test('launch selects the shell active identity rather than first matching document order',async()=>{
 const f=fixture(),env=await f.api.launch();assert.equal(env.page,f.b);assert.equal(env.shell,f.shell);
});
test('all existing document and shell errors and console failures remain observed after selection',async()=>{
 const f=fixture(),env=await f.api.launch();await env.selectDocument('document-B');
 for(const [page,label] of [[f.a,'initial'],[f.b,'selected'],[f.shell,'shell']]){page.emit('pageerror',Error(label));page.emit('console',{type:()=> 'error',text:()=>label+' console'})}
 assert.deepEqual(Array.from(env.errors),['initial','initial console','selected','selected console','shell','shell console']);
});
test('existing and later-view requests are recorded exactly once through repeated explicit selections',async()=>{
 const f=fixture(),env=await f.api.launch();await env.selectDocument('document-A');await env.selectDocument('document-B');await env.selectDocument('document-A');
 const later=f.newPage('document-C');for(const [page,id] of [[f.a,'A'],[f.b,'B'],[f.shell,'shell'],[later,'C']])page.emit('request',request(id));
 assert.deepEqual(Array.from(env.requests,r=>r.url),['A','B','shell','C'].map(x=>'https://synthetic.invalid/'+x));
 later.emit('pageerror',Error('later'));assert(Array.from(env.errors).includes('later'));
});
test('failed responses from another view preserve the original error oracle',async()=>{
 const f=fixture(),env=await f.api.launch(),later=f.newPage('document-C');
 later.emit('response',{status:()=>503,url:()=> 'https://synthetic.invalid/unavailable'});
 assert.deepEqual(Array.from(env.errors),['503 https://synthetic.invalid/unavailable']);
});
test('the captured document handle stays fixed until an explicit selection',async()=>{
 const f=fixture(),env=await f.api.launch(),captured=env.page;
 f.state.activeId=captured===f.a?'document-B':'document-A';assert.notEqual(await env.activeDocument(),captured);assert.equal(env.page,captured);
 await env.selectDocument(f.state.activeId);assert.notEqual(env.page,captured);
});
test('ambiguous initial active identities fail closed instead of choosing another page',async()=>{
 const f=fixture({duplicate:true});await assert.rejects(f.api.launch(),/exactly one/);assert.deepEqual(Array.from(f.kills),[[99999999,'SIGTERM'],[-99999999,'SIGKILL']]);
});
test('stop removes lifecycle observers after owned shutdown without late metric mutation',async()=>{
 const f=fixture(),env=await f.api.launch();await f.api.stop(env);
 const before={errors:env.errors.length,requests:env.requests.length};
 f.a.emit('pageerror',Error('late'));f.context.emit('request',request('late'));
 assert.equal(env.errors.length,before.errors);assert.equal(env.requests.length,before.requests);
});

test('one exact document retains the original early-window startup allowance while the strip initializes',async()=>{
 const f=fixture({single:true,shellReady:false}),env=await f.api.launch();assert.equal(env.page,f.a);assert.equal(env.shell,f.shell);
});

test('native input identity retains the observed PID kernel start executable and command',async()=>{
 const env=await fixture().api.launch();
 assert.equal(env.nativeIdentity.pid,99999999);assert.equal(env.nativeIdentity.executable,'/synthetic/electron');assert.equal(env.nativeIdentity.startTime,'123456');
 assert.equal(env.nativeIdentity.commandSha256,require('node:crypto').createHash('sha256').update('electron /synthetic/main.cjs').digest('hex'));
 assert.equal(env.nativeIdentity.profile,env.directory);
});
test('secondary launch retains the exact selected runtime private display and isolated environment',async()=>{
 const env=await fixture({environment:{EO_SOURCE_ELECTRON:'/synthetic/owned-electron',EO_DESKTOP_DISPLAY:':321',AT_SPI_BUS_ADDRESS:'unix:path=/synthetic/unrelated-bus'}}).api.launch();
 assert.equal(env.launchSpec.executable,'/synthetic/owned-electron');assert.equal(env.launchSpec.environment.DISPLAY,':321');
 assert.equal(env.launchSpec.environment.EO_DESKTOP_PROFILE,env.directory);
 assert.equal(env.launchSpec.environment.DBUS_SESSION_BUS_ADDRESS,'unix:path='+env.directory+'/no-session-bus');
 assert.equal(env.launchSpec.environment.AT_SPI_BUS_ADDRESS,'unix:path='+env.directory+'/no-a11y-bus');
 assert.deepEqual(Array.from(env.launchSpec.entry),['/synthetic/no-profile-written/desktop']);
});

test('disabled desktop buses encode profile separators as one endpoint',async()=>{
 const env=await fixture().api.launch({profile:'private;unix:path=foreign,bus'});
 for(const [name,leaf] of [['DBUS_SESSION_BUS_ADDRESS','no-session-bus'],['AT_SPI_BUS_ADDRESS','no-a11y-bus']]){
  const address=env.launchSpec.environment[name];
  assert.equal(address,'unix:path='+encodeURIComponent(env.directory+'/'+leaf).replace(/%2F/g,'/'));
  assert(!address.includes(';')&&!address.includes(','));
 }
});
