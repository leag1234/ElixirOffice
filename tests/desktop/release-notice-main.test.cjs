// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports,url='https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0-beta.1';
const releases=async()=>[{tag_name:'v0.4.0-beta.1',html_url:url,draft:false,prerelease:true}];
test('real main starts one anonymous mocked release check and exposes only the trusted candidate',async()=>{
 const e=await boot({releaseTransport:releases});
 try{
  assert.equal(e.releaseRequests.length,1);assert.deepEqual(Object.keys(e.releaseRequests[0]),['signal']);
  assert.equal((await e.invoke('release-options')).enabled,true);
  const candidate=await e.invoke('release-state');assert.equal(candidate.version,'0.4.0-beta.1');assert.equal(candidate.url,url);
  assert.equal(await e.invoke('release-action','download',candidate.version),true);assert.deepEqual(Array.from(e.externalOpened),[url]);
  assert.equal(await e.invoke('release-action','download','99.0.0'),false);assert.equal(e.externalOpened.length,1);
  await e.invoke('release-settings',{enabled:false});assert.equal(await e.invoke('release-state'),null);
  const saved=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.equal(saved.releaseNotice.enabled,false);assert.equal(saved.recents.length,0);
 }finally{await e.cleanup()}
});
test('explicit off and strict capture mode never check release metadata',async()=>{
 for(const config of [{fontSettings:{releaseNotice:{enabled:false}}},{captureLocales:'en'}]){
  const e=await boot({...config,releaseTransport:releases});
  try{
   assert.equal(e.releaseRequests.length,0);assert.equal(await e.invoke('release-state'),null);
   if(config.captureLocales)await assert.rejects(e.invoke('release-settings',{enabled:true}),/capture/i);
  }finally{await e.cleanup()}
 }
});
test('release settings and actions require the registered document main frame and cannot accept another URL',async()=>{
 const e=await boot({releaseTransport:releases});
 try{
  for(const value of [null,[],{enabled:'yes'},{enabled:true,url:'https://evil.invalid/'}])await assert.rejects(e.invoke('release-settings',value),/release|setting/i);
  const shell=e.shell.webContents,frame=e.documents[0].mainFrame;
  await assert.rejects(async()=>e.handlers.get('eo:release-action')({sender:shell,senderFrame:shell.mainFrame},'download','0.4.0-beta.1'),/document|frame|registered/i);
  await assert.rejects(async()=>e.handlers.get('eo:release-settings')({sender:e.documents[0],senderFrame:{url:frame.url}},{enabled:false}),/document|frame|registered/i);
  assert.deepEqual(Array.from(e.externalOpened),[]);
 }finally{await e.cleanup()}
});
test('a slow release API never blocks the Home window or a document initialization',async()=>{
 let resolve;const e=await boot({document:true,waitForRelease:false,releaseTransport:()=>new Promise(r=>{resolve=r})});
 try{
  assert(e.shell.url.endsWith('/tabs.html'));assert(e.selected.token);
  for(let n=0;n<20&&!resolve;n++)await new Promise(setImmediate);
  assert(resolve);assert.equal(e.releaseRequests.length,1);
  resolve(await releases());await e.releaseSettled();
  assert.equal((await e.invoke('release-state')).version,'0.4.0-beta.1');
 }finally{resolve?.([]);await e.cleanup()}
});
test('offline release failure is silent and persisted daily guard remains set',async()=>{
 const e=await boot({releaseTransport:async()=>{throw Error('offline')}});
 try{
  assert.equal(e.releaseRequests.length,1);assert.equal(await e.invoke('release-state'),null);
  assert.deepEqual(Array.from(e.dialogs),[]);
  assert(!e.sent.some(args=>args[1]==='external-error'));
  const saved=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert(Number.isSafeInteger(saved.releaseNotice.lastAttempt));
 }finally{await e.cleanup()}
});
test('opening the release page preserves a dirty document and never enters native save/download',async()=>{
 const e=await boot({document:true,releaseTransport:releases});
 try{
  const file=path.join(e.directory,'test.docx'),before=await fsp.readFile(file);
  e.state.dirty=true;await e.invoke('state',e.selected.token,true);
  await e.invoke('release-action','notes','0.4.0-beta.1');
  assert.equal(e.state.dirty,true);await e.invoke('state',e.selected.token,true);
  assert.deepEqual(await fsp.readFile(file),before);assert.deepEqual(Array.from(e.saveDialogs),[]);assert.deepEqual(Array.from(e.externalOpened),[url]);
 }finally{await e.cleanup()}
});
