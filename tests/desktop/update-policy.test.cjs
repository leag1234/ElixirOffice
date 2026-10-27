// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const policy=require('../../desktop/update-policy.cjs');
const wire=require('../../tools/desktop-updates/signed-metadata.cjs');
const golden=require('./fixtures/signed-update-golden.json');
const key=crypto.createPrivateKey({key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex'),format:'der',type:'pkcs8'});
const fingerprint=crypto.createHash('sha256').update(crypto.createPublicKey(golden.publicKeyPem).export({type:'spki',format:'der'})).digest('hex');
const pin=()=>({keyId:'rfc8032-test-only',pem:golden.publicKeyPem,fingerprint});
const runtime=()=>({platform:'win32',arch:'x64',packageType:'nsis',electronVersion:'44.9.1',checksEnabled:true});
const qualified=()=>policy.createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:[pin()]});
function candidate(override){
 const c=structuredClone(golden.context),a=c.artifact;
 const metadata=Buffer.from(override??('version: '+c.version+'\nfiles:\n  - url: '+a.name+'\n    sha512: '+a.sha512+'\n    size: '+a.size+'\n'));
 c.metadataSha512=crypto.createHash('sha512').update(metadata).digest('base64');
 const envelope=wire.encodeEnvelope(c,[{keyId:'rfc8032-test-only',signature:crypto.sign(null,wire.signingBytes(c),key).toString('base64')}]);
 return {envelope,metadata,selectedTag:c.tag,runtime:runtime(),now:c.issuedAt+1000};
}
test('production policy qualifies reviewed AppImage and NSIS and has no embedded test key',()=>{
 assert(Object.isFrozen(policy.production));
 assert.equal(policy.production.capability({...runtime(),platform:'linux',packageType:'AppImage'}).enabled,true);
 assert.equal(policy.production.capability({...runtime(),packageType:'nsis'}).enabled,true);
 assert.throws(()=>policy.production.verify(candidate()));
});
test('authoritative verifier is one shared module across app and host tools',()=>{
 assert.equal(require('../../desktop/update-metadata.cjs'),wire);
 const verified=qualified().verify(candidate());
 assert.equal(wire.describeUpdate(verified).version,'0.4.0');
});
test('synthetic qualified policy verifies exact selected candidate without I/O',()=>{
 const p=qualified(),r=runtime();
 assert.deepEqual(p.capability(r),{enabled:true,reason:null});
 const verified=p.verify(candidate());assert(Object.isFrozen(verified));assert.equal(verified.context.platform,'win32');
});
for(const [label,change] of [
 ['old runtime',r=>r.electronVersion='44.7.0'],['unreviewed runtime',r=>r.electronVersion='44.10.0'],
 ['prerelease runtime',r=>r.electronVersion='44.9.1-beta.1'],['Mac',r=>r.platform='darwin'],
 ['arm64',r=>r.arch='arm64'],['DEB',r=>r.packageType='deb'],['Flatpak',r=>r.packageType='flatpak'],
 ['web installer',r=>r.packageType='nsis-web'],['checks disabled',r=>r.checksEnabled=false],
 ['invalid flag',r=>r.checksEnabled='true'],
])test('policy refuses '+label,()=>{
 const p=qualified(),r=runtime();change(r);
 assert.equal(p.capability(r).enabled,false);
 assert.throws(()=>p.verify({...candidate(),runtime:r}));
});
test('only an explicitly qualified runtime and reviewed key together can enable',()=>{
 for(const args of [{},{qualifiedElectronVersion:'44.9.1'},{trustedKeys:[pin()]}]){
  const p=policy.createPolicy(args);assert.equal(p.capability(runtime()).enabled,false);assert.throws(()=>p.verify(candidate()));
 }
 assert.throws(()=>policy.createPolicy({qualifiedElectronVersion:'44.7.0',trustedKeys:[pin()]}));
});
for(const [label,change] of [
 ['unknown key',p=>p.keyId='not-the-signer'],['fingerprint mismatch',p=>p.fingerprint='0'.repeat(64)],
 ['private PEM',p=>p.pem=key.export({type:'pkcs8',format:'pem'})],['wrong algorithm',p=>p.pem='invalid public key'],
 ['malformed ID',p=>p.keyId='../key'],
])test('public trust refuses '+label,()=>{
 const k=pin();change(k);
 if(label==='unknown key'){
  const p=policy.createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:[k]});assert.throws(()=>p.verify(candidate()));
 }else assert.throws(()=>policy.createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:[k]}));
});
test('key pins are copied; caller mutation never changes trust',()=>{
 const k=pin(),keys=[k],p=policy.createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:keys});
 k.pem='bad';k.fingerprint='0'.repeat(64);keys.length=0;
 assert.equal(wire.describeUpdate(p.verify(candidate())).version,'0.4.0');
 assert.throws(()=>policy.createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:[pin(),pin()]}));
});
for(const [label,change] of [
 ['wrong tag',v=>v.selectedTag='v9.0.0'],['changed metadata',v=>v.metadata=Buffer.from('bad')],
 ['changed envelope',v=>v.envelope=Buffer.from('{}')],['expired',v=>v.now=golden.context.expiresAt+1],
 ['cross-platform',v=>v.runtime={...runtime(),platform:'linux',packageType:'AppImage'}],
])test('verification refuses '+label,()=>{const v=candidate();change(v);assert.throws(()=>qualified().verify(v));});

test('a valid signature cannot admit metadata outside the strict description subset',()=>{
 assert.throws(()=>qualified().verify(candidate('version: 0.4.0\nfiles: []\nunknown: true\n')));
});
test('runtime identity is captured once before eligibility and signature context',()=>{
 let reads=0;const r=runtime();
 Object.defineProperty(r,'platform',{get(){reads++;return reads===1?'win32':'darwin';}});
 const v=qualified().verify({...candidate(),runtime:r});
 assert.equal(v.context.platform,'win32');assert.equal(reads,1);
});
test('production primitives import and reject invalid candidates with all I/O modules denied',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 const script=[
 "const Module=require('node:module'),load=Module._load;",
 "Module._load=function(name,...args){if(/^(?:node:)?(?:electron(?:-updater)?|https?|net|tls|fs(?:\\/promises)?|child_process)$/.test(name))throw Error('Unexpected I/O '+name);return load.call(this,name,...args);};",
 "const p=require(process.argv[1]+'/desktop/update-policy.cjs');",
 "require(process.argv[1]+'/desktop/update-handoff.cjs');",
 "if(!p.production.capability({platform:'win32',arch:'x64',packageType:'nsis',electronVersion:'44.9.1'}).enabled)throw Error('production disabled');",
 "try{p.production.verify({runtime:{platform:'win32',arch:'x64',packageType:'nsis',electronVersion:'44.9.1'}});throw Error('accepted');}catch(e){if(e.message!=='Invalid signed update')throw e;}",
 "console.log('PASS production has no update I/O');"
 ].join('\n');
 const result=spawnSync(process.execPath,['-e',script,path.resolve(__dirname,'../..')],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS production has no update I\/O/);
});
