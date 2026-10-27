// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const golden=require('./fixtures/signed-update-golden.json');
const {signingBytes,encodeEnvelope,verifyMetadata,describeUpdate,MAX_METADATA}=require('../../tools/desktop-updates/signed-metadata.cjs');
// Public RFC8032 test vector only; never a production key.
const key=crypto.createPrivateKey({key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex'),format:'der',type:'pkcs8'});
function context(linux=false,version='0.4.0'){
 const c=structuredClone(golden.context);c.version=version;c.tag='v'+version;c.channel=version.includes('-')?'prerelease':'stable';
 if(linux)Object.assign(c,{platform:'linux',packageType:'AppImage',metadataName:'latest-linux.yml'});
 c.artifact.name='ElixirOffice-'+version+(linux?'-x86_64.AppImage':'-win-x64.exe');return c;
}
function metadata(c,{legacy=true,date=true,eol='\n'}={}){
 const a=c.artifact,lines=['version: '+c.version,'files:','  - url: '+a.name,'    sha512: '+a.sha512,'    size: '+a.size];
 if(legacy)lines.push('path: '+a.name,'sha512: '+a.sha512);
 if(date)lines.push("releaseDate: '2026-10-23T12:00:00.000Z'");
 return lines.join(eol)+eol;
}
function verified(text,c=context()){
 const bytes=Buffer.from(text),signed=structuredClone(c);
 signed.metadataSha512=crypto.createHash('sha512').update(bytes).digest('base64');
 const envelope=encodeEnvelope(signed,[{keyId:'rfc8032-test-only',signature:crypto.sign(null,signingBytes(signed),key).toString('base64')}]);
 return verifyMetadata(envelope,bytes,{trustedKeys:{'rfc8032-test-only':golden.publicKeyPem},expected:{tag:c.tag,platform:c.platform,arch:c.arch,packageType:c.packageType},now:c.issuedAt+1000});
}
for(const linux of [false,true])for(const version of ['0.4.0','0.4.0-beta.1'])for(const legacy of [false,true])for(const date of [false,true])
 test('describe signed '+(linux?'Linux':'Windows')+' '+version+' legacy='+legacy+' date='+date,()=>{
  const c=context(linux,version),v=verified(metadata(c,{legacy,date}),c),d=describeUpdate(v);
  assert.deepEqual(d,{version,artifact:c.artifact,identity:v.identity,checkedAt:v.checkedAt,...(date?{releaseDate:'2026-10-23T12:00:00.000Z'}:{})});
  assert(Object.isFrozen(d)&&Object.isFrozen(d.artifact));
  assert.notEqual(d.artifact,v.context.artifact,'Description owns its artifact record');
 });
test('CRLF metadata retains authenticated raw-byte identity while describing the same artifact',()=>{
 const c=context(),a=describeUpdate(verified(metadata(c))),b=describeUpdate(verified(metadata(c,{eol:'\r\n'})));
 assert.deepEqual(b.artifact,a.artifact);assert.equal(b.version,a.version);assert.notEqual(a.identity,b.identity);
});
const changes=[
 ['missing version',s=>s.replace('version: 0.4.0\n','')],
 ['different version',s=>s.replace('version: 0.4.0','version: 0.5.0')],
 ['quoted version',s=>s.replace('version: 0.4.0',"version: '0.4.0'")],
 ['different artifact',s=>s.replace('url: ElixirOffice-','url: Other-')],
 ['absolute artifact URL',s=>s.replace('url: ','url: https://example.invalid/')],
 ['relative path artifact',s=>s.replace('url: ','url: ../')],
 ['encoded path artifact',s=>s.replace('url: ','url: %2e%2e%2f')],
 ['quoted artifact',s=>s.replace(/url: ([^\n]+)/,"url: '$1'")],
 ['different size',s=>s.replace('size: 28','size: 29')],
 ['zero size',s=>s.replace('size: 28','size: 0')],
 ['negative size',s=>s.replace('size: 28','size: -1')],
 ['fractional size',s=>s.replace('size: 28','size: 28.0')],
 ['exponent size',s=>s.replace('size: 28','size: 2.8e1')],
 ['quoted size',s=>s.replace('size: 28',"size: '28'")],
 ['leading zero size',s=>s.replace('size: 28','size: 028')],
 ['oversize number',s=>s.replace('size: 28','size: 9007199254740992')],
 ['different checksum',s=>s.replace('sha512: U','sha512: A')],
 ['missing file checksum',s=>s.replace(/    sha512: [^\n]+\n/,'')],
 ['missing file size',s=>s.replace('    size: 28\n','')],
 ['legacy artifact mismatch',s=>s.replace('path: ElixirOffice-','path: Other-')],
 ['legacy checksum mismatch',s=>s.replace('\nsha512: U','\nsha512: A')],
 ['legacy path without hash',s=>s.replace(/\nsha512: [^\n]+/,'')],
 ['legacy hash without path',s=>s.replace(/\npath: [^\n]+/,'')],
 ['duplicate version',s=>'version: 0.4.0\n'+s],
 ['duplicate files',s=>s+'files:\n'],
 ['duplicate file url',s=>s.replace('    size: 28','    url: duplicate.exe\n    size: 28')],
 ['duplicate file size',s=>s.replace('    size: 28','    size: 28\n    size: 28')],
 ['duplicate file checksum',s=>s.replace('    size: 28','    sha512: duplicate\n    size: 28')],
 ['duplicate legacy path',s=>s+'\npath: duplicate.exe\n'],
 ['duplicate release date',s=>s+"releaseDate: '2026-10-23T12:00:00.000Z'\n"],
 ['unknown root key',s=>s+'installerArgs: /S\n'],
 ['unknown file key',s=>s.replace('    size: 28','    blockMapSize: 100\n    size: 28')],
 ['prototype key',s=>s+'__proto__: polluted\n'],
 ['constructor key',s=>s+'constructor: polluted\n'],
 ['second artifact',s=>s.replace('path: ','  - url: extra.exe\npath: ')],
 ['flow array',s=>s.replace('files:','files: []')],
 ['flow map',s=>s.replace('files:','files: {}')],
 ['anchor',s=>s.replace('files:','files: &payload')],
 ['alias',s=>s.replace('files:','files: *payload')],
 ['merge key',s=>s+'<<: *payload\n'],
 ['tag',s=>s.replace('version: ','version: !!str ')],
 ['custom tag',s=>s.replace('version: ','version: !release ')],
 ['document marker',s=>'---\n'+s],
 ['second document',s=>s+'---\nversion: 0.4.0\n'],
 ['document end',s=>s+'...\n'],
 ['YAML directive',s=>'%YAML 1.2\n'+s],
 ['block scalar',s=>s.replace('version: 0.4.0','version: |\n  0.4.0')],
 ['multiline quote',s=>s.replace('version: 0.4.0',"version: '0.4.\n  0'")],
 ['inline comment',s=>s.replace('size: 28','size: 28 # comment')],
 ['comment line',s=>'# comment\n'+s],
 ['trailing spaces',s=>s.replace('size: 28','size: 28 ')],
 ['tab indentation',s=>s.replace('    size:','\tsize:')],
 ['alternate indentation',s=>s.replace('  - url:',' - url:')],
 ['extra blank line',s=>s+'\n'],
 ['missing final newline',s=>s.slice(0,-1)],
 ['bare carriage return',s=>s.replace('files:\n','files:\r')],
 ['BOM',s=>'\ufeff'+s],
 ['NUL',s=>s.replace('size: 28','size: 28\0')],
 ['Unicode separator',s=>s.replace('files:\n','files:\u2028')],
 ['Unicode key lookalike',s=>s.replace('version:','versi\u043en:')],
 ['invalid release date',s=>s.replace('2026-10-23','2026-02-30')],
 ['unquoted release date',s=>s.replace("'2026-10-23T12:00:00.000Z'",'2026-10-23T12:00:00.000Z')],
 ['date without milliseconds',s=>s.replace('.000Z','Z')],
 ['date with offset',s=>s.replace('.000Z','.000+00:00')],
 ['unknown trailing bytes',s=>s+'x'],
];
for(const [name,change] of changes)test('reject authenticated YAML '+name,()=>{
 const c=context(),text=change(metadata(c)),v=verified(text,c);
 assert.equal(v.metadataText,text,'Negative fixture must pass signature/raw-byte verification first');
 assert.throws(()=>describeUpdate(v),/Invalid signed update/);
});
test('existing slice1 golden authenticates but lacks the mandatory artifact descriptor fields',()=>{
 const v=verifyMetadata(Buffer.from(golden.envelope),Buffer.from(golden.metadata),{trustedKeys:{'rfc8032-test-only':golden.publicKeyPem},expected:{tag:'v0.4.0',platform:'win32',arch:'x64',packageType:'nsis'},now:golden.context.issuedAt+1000});
 assert.throws(()=>describeUpdate(v),/Invalid signed update/);
});
test('the parser accepts only actual verifier records and never reads forged getters',()=>{
 const c=context(),v=verified(metadata(c));let reads=0;
 const getter={get metadataText(){reads++;throw Error('FORGED_GETTER_READ');}};
 for(const forged of [null,undefined,{},getter,{...v},structuredClone(v),JSON.parse(JSON.stringify(v)),Object.create(v),new Proxy(v,{})])
  assert.throws(()=>describeUpdate(forged),/Invalid signed update/);
 assert.equal(reads,0);
});
test('description and nested artifact are immutable copies with no raw YAML escape hatch',()=>{
 const c=context(),text=metadata(c),v=verified(text),d=describeUpdate(v);
 assert.throws(()=>{d.version='9.0.0';},TypeError);
 assert.throws(()=>{d.artifact.name='evil.exe';},TypeError);
 assert.throws(()=>{d.artifact.extra=true;},TypeError);
 assert.equal(Object.hasOwn(d,'metadataText'),false);
 assert.deepEqual(describeUpdate(v),d);
 assert.throws(()=>describeUpdate(d),/Invalid signed update/);
});
test('the maximum authenticated text budget stays fail closed without general YAML processing',()=>{
 const text='#'.repeat(MAX_METADATA),v=verified(text);
 assert.equal(Buffer.byteLength(v.metadataText),MAX_METADATA);
 assert.throws(()=>describeUpdate(v),/Invalid signed update/);
 assert.throws(()=>verified(text+'#'),/Invalid signed update/);
});
test('signed context is authoritative even when all YAML checksum occurrences agree with each other',()=>{
 const c=context(),text=metadata(c).replaceAll(c.artifact.sha512,Buffer.alloc(64).toString('base64'));
 assert.throws(()=>describeUpdate(verified(text,c)),/Invalid signed update/);
});
test('a valid leap-day release date is allowed by the narrow ISO grammar',()=>{
 const c=context(),d=describeUpdate(verified(metadata(c).replace('2026-10-23','2028-02-29')));
 assert.equal(d.releaseDate,'2028-02-29T12:00:00.000Z');
});
test('Linux descriptors cannot name the Windows installer from the same version',()=>{
 const c=context(true),text=metadata(c).replaceAll(c.artifact.name,'ElixirOffice-0.4.0-win-x64.exe');
 assert.throws(()=>describeUpdate(verified(text,c)),/Invalid signed update/);
});
test('signed exact artifact size boundaries require no allocation of the artifact',()=>{
 for(const size of [1,2**31]){
  const c=context();c.artifact.size=size;
  assert.equal(describeUpdate(verified(metadata(c),c)).artifact.size,size);
 }
});
test('mixed line endings remain one unambiguous finite scalar document',()=>{
 const c=context(),text=metadata(c).replace('files:\n','files:\r\n');
 assert.equal(describeUpdate(verified(text,c)).version,c.version);
});
test('out-of-order root fields and out-of-order descriptor fields are outside the supported subset',()=>{
 const c=context(),text=metadata(c);
 for(const changed of [
  text.replace('version: 0.4.0\nfiles:\n','files:\nversion: 0.4.0\n'),
  text.replace('    sha512: '+c.artifact.sha512+'\n    size: 28','    size: 28\n    sha512: '+c.artifact.sha512)
 ])assert.throws(()=>describeUpdate(verified(changed,c)),/Invalid signed update/);
});
