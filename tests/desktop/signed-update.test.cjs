// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const golden=require('./fixtures/signed-update-golden.json');
const {signingBytes,encodeEnvelope,verifyMetadata,assessCandidate,MAX_ENVELOPE,MAX_METADATA}=require('../../tools/desktop-updates/signed-metadata.cjs');
// Public RFC8032 vector, never an owner key.
const key=crypto.createPrivateKey({key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex'),format:'der',type:'pkcs8'});
const ctx=()=>structuredClone(golden.context),expected={tag:'v0.4.0',platform:'win32',arch:'x64',packageType:'nsis'};
const options=()=>({trustedKeys:{'rfc8032-test-only':golden.publicKeyPem},expected,now:golden.context.issuedAt+1000});
const wire=c=>encodeEnvelope(c,[{keyId:'rfc8032-test-only',signature:crypto.sign(null,signingBytes(c),key).toString('base64')}]);
const verify=(envelope=Buffer.from(golden.envelope),metadata=Buffer.from(golden.metadata),opts=options())=>verifyMetadata(envelope,metadata,opts);
test('published synthetic golden signing bytes and Ed25519 signature are stable',()=>{
 assert.equal(signingBytes(ctx()).toString('base64'),golden.signingBytesBase64);
 assert.equal(wire(ctx()).toString(),golden.envelope);
 const v=verify();assert.equal(v.context.version,'0.4.0');assert.equal(v.metadataText,golden.metadata);
 assert(Object.isFrozen(v)&&Object.isFrozen(v.context)&&Object.isFrozen(v.context.artifact));
});
test('raw metadata bytes cannot change after signing',()=>assert.throws(()=>verify(undefined,Buffer.from(golden.metadata+' '))));
for(const [name,transform] of [
 ['wrong repository',c=>c.repository='attacker/repo'],
 ['tag/version mismatch',c=>c.tag='v9.0.0'],
 ['malformed version',c=>c.version='01.4.0'],
 ['build not integer',c=>c.build=1.5],
 ['sequence overflow',c=>c.sequence=Number.MAX_SAFE_INTEGER+1],
 ['wrong channel',c=>c.channel='prerelease'],
 ['wrong platform',c=>c.platform='darwin'],
 ['wrong architecture',c=>c.arch='arm64'],
 ['unsupported package',c=>c.packageType='nsis-web'],
 ['wrong manifest name',c=>c.metadataName='other.yml'],
 ['unknown context field',c=>c.key='untrusted'],
 ['unknown artifact field',c=>c.artifact.args=['/S']],
 ['traversal',c=>c.artifact.name='../ElixirOffice-0.4.0-win-x64.exe'],
 ['wrong version artifact',c=>c.artifact.name='ElixirOffice-9.0.0-win-x64.exe'],
 ['empty artifact',c=>c.artifact.size=0],
 ['oversize artifact',c=>c.artifact.size=2**31+1],
 ['noncanonical checksum',c=>c.artifact.sha512=c.artifact.sha512.replace(/=$/,'')],
 ['invalid date',c=>c.issuedAt=-1],
 ['reversed dates',c=>c.expiresAt=c.issuedAt],
 ['validity exceeds90days',c=>c.expiresAt=c.issuedAt+90*86400000+1],
])test('reject signed '+name,()=>{const c=ctx();transform(c);assert.throws(()=>verify(wire(c)));});
test('reject expiry, future issuance, invalid caller clock and mismatched expected identity',()=>{
 assert.throws(()=>verify(undefined,undefined,{...options(),now:ctx().expiresAt}));
 assert.throws(()=>verify(undefined,undefined,{...options(),now:ctx().issuedAt-1}));
 for(const now of [NaN,Infinity,-1,undefined])assert.throws(()=>verify(undefined,undefined,{...options(),now}));
 for(const change of [{tag:'v0.5.0'},{platform:'linux'},{arch:'arm64'},{packageType:'AppImage'}])
  assert.throws(()=>verify(undefined,undefined,{...options(),expected:{...expected,...change}}));
});
test('reject untrusted/missing/bad signature and never trust supplied public key',()=>{
 assert.throws(()=>verify(undefined,undefined,{...options(),trustedKeys:{}}));
 const e=JSON.parse(golden.envelope);e.signatures[0].signature=Buffer.alloc(64).toString('base64');
 assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
 e.publicKey=golden.publicKeyPem;assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
 e.signatures=[];assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
});
test('strict canonical bounded envelope rejects duplicate keys, whitespace, unknown fields and invalid UTF8',()=>{
 const raw=golden.envelope;
 for(const value of [raw+' ',raw.replace('{"context":','{"context":{},"context":'),raw.replace('{"context":','{"extra":1,"context":')])
  assert.throws(()=>verify(Buffer.from(value)));
 assert.throws(()=>verify(Buffer.alloc(MAX_ENVELOPE+1)));
 assert.throws(()=>verify(Buffer.from([0xff])));
 assert.throws(()=>verify(undefined,Buffer.alloc(MAX_METADATA+1)));
});
test('context bit mutation with original signature fails',()=>{
 const e=JSON.parse(golden.envelope);e.context.build++;assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
});
test('matching Linux AppImage and prerelease context works with expected type',()=>{
 const c=ctx();Object.assign(c,{platform:'linux',packageType:'AppImage',metadataName:'latest-linux.yml',version:'0.4.0-beta.1',tag:'v0.4.0-beta.1',channel:'prerelease'});
 c.artifact.name='ElixirOffice-0.4.0-beta.1-x86_64.AppImage';
 const result=verify(wire(c),undefined,{...options(),expected:{tag:c.tag,platform:'linux',arch:'x64',packageType:'AppImage'}});
 assert.equal(result.context.platform,'linux');
});
test('rotation accepts one trusted signature but not unknown keys alone',()=>{
 const e=JSON.parse(golden.envelope);e.signatures.unshift({keyId:'unknown-rotation-key',signature:Buffer.alloc(64).toString('base64')});
 assert.equal(verify(Buffer.from(JSON.stringify(e)+'\n')).context.version,'0.4.0');
});
test('newer candidate advances replay state; identical retry remains allowed',()=>{
 const v=verify(),first=assessCandidate(v,{runningVersion:'0.3.2',state:null});
 assert.equal(first.next.sequence,1);assert.equal(first.retry,false);
 const retry=assessCandidate(v,{runningVersion:'0.3.2',state:first.next});assert.equal(retry.retry,true);
 assert.deepEqual(retry.next,first.next);
});
test('version floor, replay, equal-sequence conflict and corrupt state fail closed',()=>{
 const v=verify(),state=assessCandidate(v,{runningVersion:'0.3.2',state:null}).next;
 for(const runningVersion of ['0.4.0','0.5.0','invalid'])assert.throws(()=>assessCandidate(v,{runningVersion,state:null}));
 assert.throws(()=>assessCandidate(v,{runningVersion:'0.3.2',state:{...state,sequence:2}}));
 assert.throws(()=>assessCandidate(v,{runningVersion:'0.3.2',state:{...state,identity:'0'.repeat(64)}}));
 for(const invalid of [{},{sequence:-1,identity:state.identity},{...state,extra:true}])
  assert.throws(()=>assessCandidate(v,{runningVersion:'0.3.2',state:invalid}));
 assert.throws(()=>assessCandidate({...v},{runningVersion:'0.3.2',state:null}));
});
test('signed renewal advances sequence for the same not-yet-installed version',()=>{
 const first=assessCandidate(verify(),{runningVersion:'0.3.2',state:null}),c=ctx();c.sequence=2;c.issuedAt++;c.expiresAt++;
 const next=assessCandidate(verify(wire(c)),{runningVersion:'0.3.2',state:first.next});
 assert.equal(next.next.sequence,2);assert.equal(next.retry,false);
});
test('strict signature entries reject ambiguous order, duplicate ids and missing fields',()=>{
 const e=JSON.parse(golden.envelope),signature=e.signatures[0].signature;
 for(const signatures of [
  [{signature,keyId:'rfc8032-test-only'}],
  [e.signatures[0],e.signatures[0]],
  [{keyId:'rfc8032-test-only',signature,extra:true}],
  [{keyId:'rfc8032-test-only'}],
  [{keyId:'rfc8032-test-only',signature:signature.slice(0,-1)}]
 ])assert.throws(()=>verify(Buffer.from(JSON.stringify({context:e.context,signatures})+'\n')));
});
test('every signature bit and every raw metadata byte is authenticated',()=>{
 const original=JSON.parse(golden.envelope),signature=Buffer.from(original.signatures[0].signature,'base64');
 for(let bit=0;bit<512;bit++){
  const e=structuredClone(original),changed=Buffer.from(signature);changed[bit>>3]^=1<<(bit%8);
  e.signatures[0].signature=changed.toString('base64');assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
 }
 const metadata=Buffer.from(golden.metadata);
 for(let i=0;i<metadata.length;i++){const changed=Buffer.from(metadata);changed[i]^=1;assert.throws(()=>verify(undefined,changed));}
});
test('wrong trusted key/type and bad raw encodings fail closed',()=>{
 const wrong=crypto.generateKeyPairSync('ed25519').publicKey,other=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey;
 for(const publicKey of [wrong,other,'malformed PEM',key])assert.throws(()=>verify(undefined,undefined,{...options(),trustedKeys:{'rfc8032-test-only':publicKey}}));
 assert.throws(()=>verify(golden.envelope));
 assert.throws(()=>verify(undefined,golden.metadata));
 const e=JSON.parse(golden.envelope);e.context.artifact=null;assert.throws(()=>verify(Buffer.from(JSON.stringify(e)+'\n')));
});
test('a persisted check timestamp detects local clock rollback',()=>{
 const v=verify(),state=assessCandidate(v,{runningVersion:'0.3.2',state:null}).next;
 assert.throws(()=>assessCandidate(v,{runningVersion:'0.3.2',state:{...state,checkedAt:v.checkedAt+1}}));
});
