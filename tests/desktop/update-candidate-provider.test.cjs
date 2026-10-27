// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const network=require('./fixtures/deny-update-network.cjs')();
const {fixture}=require('./fixtures/update-test-kit.cjs');
const {createCandidate,readCandidate,describeCandidate}=require('../../desktop/update-candidate.cjs');
const {createVerifiedProvider,bindVerifiedUpdater}=require('../../desktop/update-provider.cjs');
const {production,createPolicy}=require('../../desktop/update-policy.cjs');
const {createRequire}=require('node:module'),path=require('node:path'),load=createRequire(path.resolve(__dirname,'../../desktop/package.json'));
const library=load('electron-updater');
function candidate(f){return createCandidate(f);}
test('opaque candidate freezes description and clones every raw buffer',()=>{
 const f=fixture(),c=candidate(f),description=describeCandidate(c);
 assert(Object.isFrozen(c)&&Object.isFrozen(c.artifact)&&Object.isFrozen(description));
 f.envelope.fill(0);f.metadata.fill(0);
 const first=readCandidate(c,f.policy,{now:f.now});first.envelope.fill(0);first.metadata.fill(0);
 assert.equal(readCandidate(c,f.policy,{now:f.now}).verified.context.tag,'v0.4.0');
});
test('cross-policy, copied and proxied candidate authority is refused before getters',()=>{
 const f=fixture(),c=candidate(f),other=fixture();
 for(const value of [{...c},new Proxy(c,{}),{get tag(){throw Error('getter read');}}])assert.throws(()=>readCandidate(value,f.policy),/candidate/i);
 assert.throws(()=>readCandidate(c,other.policy),/candidate/i);
});
test('every candidate read rechecks signature policy and expiry',()=>{
 const f=fixture(),c=candidate(f);
 assert.throws(()=>readCandidate(c,f.policy,{now:f.context.expiresAt+1}));
 assert.throws(()=>createCandidate({...f,policy:production}));
 assert.throws(()=>createCandidate({...f,metadata:Buffer.from('changed')}));
});
test('provider returns only its actual immutable library info and fixed artifact URL',async()=>{
 const f=fixture(),c=candidate(f),p=createVerifiedProvider({Provider:library.Provider,...f,now:()=>f.now});
 p.setCandidate(c);const info=await p.getLatestVersion();
 assert(Object.isFrozen(info)&&Object.isFrozen(info.files)&&Object.isFrozen(info.files[0]));
 assert.equal(info.version,'0.4.0');
 const files=p.resolveFiles(info);assert.equal(files.length,1);
 assert.equal(files[0].url.toString(),'https://github.com/leag1234/elixiroffice/releases/download/v0.4.0/'+f.context.artifact.name);
 files[0].url.hostname='attacker.invalid';
 assert.equal(p.resolveFiles(info)[0].url.hostname,'github.com');
 for(const value of [{...info},new Proxy(info,{}),{get files(){throw Error('getter read');}}])assert.throws(()=>p.resolveFiles(value),/provider/i);
 p.clear();assert.throws(()=>p.resolveFiles(info));await assert.rejects(()=>p.getLatestVersion());
});
test('provider refuses identifying/auth headers and differential blockmap requests',()=>{
 const f=fixture(),p=createVerifiedProvider({Provider:library.Provider,...f,now:()=>f.now});
 for(const value of [{'x-user-staging-id':'tracking'},{Authorization:'secret'},{Cookie:'secret'},{'User-Agent':'per-user'}])assert.throws(()=>p.setRequestHeaders(value));
 assert.doesNotThrow(()=>p.setRequestHeaders(null));assert.equal(p.fileExtraDownloadHeaders,null);
 assert.throws(()=>p.getBlockMapFiles());
});
test('repeated actual library startup/checks create no staging ID, request or quit hook',async()=>{
 const f=fixture(),c=candidate(f);
 for(let run=0;run<3;run++){
  const p=createVerifiedProvider({Provider:library.Provider,...f,now:()=>f.now});p.setCandidate(c);
  const Bound=bindVerifiedUpdater({Base:library.NsisUpdater,provider:p,...f});
  const app={version:'0.3.3',name:'synthetic',isPackaged:true,whenReady:async()=>{},quit(){throw Error('quit');},onQuit(){throw Error('quit hook');},get userDataPath(){throw Error('staging ID path read');}};
  const u=new Bound(app);const result=await u.checkForUpdates();
  assert.equal(result.isUpdateAvailable,true);assert.equal(result.downloadPromise,null);
  assert.equal(u.stagingUserIdPromise.hasValue,false);assert.equal(u.quitHandlerAdded,false);
  for(const [name,value] of [['autoDownload',true],['autoInstallOnAppQuit',true],['allowDowngrade',true],['disableWebInstaller',false],['disableDifferentialDownload',false]])assert.throws(()=>{u[name]=value;});
  assert.throws(()=>u.quitAndInstall());
 }
 assert.equal(network.calls,0);
});
test('explicitly closed policy refuses before invoking any library constructor',()=>{
 let calls=0;class Base{constructor(){calls++;}}
 const closed=createPolicy();
 assert.throws(()=>createVerifiedProvider({Provider:Base,policy:closed,runtime:fixture().runtime}));
 assert.throws(()=>bindVerifiedUpdater({Base,provider:{},policy:closed,runtime:fixture().runtime}));
 assert.equal(calls,0);
});
test('a valid same-policy candidate for another platform is refused by provider',()=>{
 const f=fixture(),other=fixture({platform:'linux'}),c=createCandidate({...other,policy:f.policy});
 const p=createVerifiedProvider({Provider:library.Provider,...f,now:()=>f.now});
 assert.throws(()=>p.setCandidate(c));
});
