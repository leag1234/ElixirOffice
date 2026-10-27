// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const driver=require('../../tools/desktop-updates/driver-metadata.cjs');
const wire=require('../../tools/desktop-updates/signed-metadata.cjs');
const hash=(b,alg='sha256',encoding='hex')=>crypto.createHash(alg).update(b).digest(encoding);
const now=Date.now();
function fixture({qa=false}={}){
 const keyId=qa?'eo-qa-'+'a'.repeat(32):'synthetic-test';
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eo-driver-'))),out=path.join(root,'release'),envelopes=path.join(root,'envelopes');
 fs.mkdirSync(out,{mode:0o700});fs.mkdirSync(envelopes,{mode:0o700});
 const keys=crypto.generateKeyPairSync('ed25519'),pem=keys.publicKey.export({type:'spki',format:'pem'}),publicKey=path.join(root,'public.pem');fs.writeFileSync(publicKey,pem,{mode:0o600});
 const identity={version:qa?'0.0.0-rc.2':'0.4.0-rc.99',channel:'rc',build_number:qa?2:99,product_revision:'a'.repeat(40),documentserver_revision:'b'.repeat(40)};
 const names=['ElixirOffice-'+identity.version+'-x86_64.AppImage','ElixirOffice-'+identity.version+'-win-x64.exe','ElixirOffice-'+identity.version+'-x86_64.AppImage.zsync','RELEASE-NOTES.md'];
 const artifacts={};for(const name of names){const bytes=Buffer.from('FINAL post-repack '+name);fs.writeFileSync(path.join(out,name),bytes,{mode:0o600});artifacts[name]={sha256:hash(bytes),bytes:bytes.length};}
 const info={schema:1,state:'awaiting-owner-signatures',build_identity:identity,inputs:{product_revision:identity.product_revision,documentserver_revision:identity.documentserver_revision,targets:['linux','windows'],build_only:true},artifacts};
 if(qa)Object.assign(info,{neverPublish:true,flavor:'elixiroffice-update-qa',qaRun:'a'.repeat(32)});
 const config={mode:'owner-signed-v1',sequence:42,issuedAt:now-1000,expiresAt:now+3600000};
 const req={folder:out,info,config};
 const fingerprint=hash(keys.publicKey.export({type:'spki',format:'der'}));
 const verification={...req,envelopes,publicKey,keyId,fingerprint};
 function prepare(){const receipt=driver.prepare(req);info.signed_updates=receipt;return receipt;}
 function sign(){for(const c of info.signed_updates.candidates){const signature=crypto.sign(null,wire.signingBytes(c.context),keys.privateKey).toString('base64');fs.writeFileSync(path.join(envelopes,c.context.metadataName+'.sig.json'),wire.encodeEnvelope(c.context,[{keyId,signature}]),{mode:0o600});}}
 return {root,out,info,req,verification,keys,prepare,sign,clean(){fs.rmSync(root,{recursive:true,force:true});}};
}
function using(fn,options){const f=fixture(options);try{fn(f);}finally{f.clean();}}
test('final artifacts generate exact strict YAML and canonical owner inventories',()=>using(f=>{
 const receipt=f.prepare();assert.equal(receipt.candidates.length,2);
 for(const row of receipt.candidates){
  const bytes=fs.readFileSync(path.join(f.out,row.context.metadataName));
  assert.equal(row.context.artifact.sha512,hash(fs.readFileSync(path.join(f.out,row.context.artifact.name)),'sha512','base64'));
  assert.equal(row.context.metadataSha512,hash(bytes,'sha512','base64'));
  assert.equal(wire.validateSigningMetadata(row.context,bytes).description.version,f.info.build_identity.version);
  const inv=fs.readFileSync(path.join(f.out,row.inventory));assert.equal(hash(inv),row.inventorySha256);
  assert.equal(inv.toString(),JSON.stringify({schema:1,product_revision:'a'.repeat(40),documentserver_revision:'b'.repeat(40),context:row.context})+'\n');
 }
}));
test('verification uses explicit public trust and matches both final artifacts',()=>using(f=>{
 f.prepare();f.sign();const result=driver.verify(f.verification);
 assert.equal(result.files.length,4);assert.equal(result.keyFingerprint,f.verification.fingerprint);
 assert.equal(result.files.filter(x=>x.name.endsWith('.sig.json')).length,2);
}));
for(const [label,change] of [
 ['not opt in',f=>f.req.config.mode='off'],
 ['source mismatch',f=>f.info.inputs.product_revision='c'.repeat(40)],
 ['invalid sequence',f=>f.req.config.sequence=0],
 ['invalid expiry',f=>f.req.config.expiresAt=now+91*86400000],
 ['missing artifact',f=>fs.unlinkSync(path.join(f.out,Object.keys(f.info.artifacts)[0]))],
 ['changed final bytes',f=>fs.appendFileSync(path.join(f.out,Object.keys(f.info.artifacts)[0]),'changed')],
 ['unknown feed',f=>fs.writeFileSync(path.join(f.out,'beta.yml'),'bad')],
 ['artifact symlink',f=>{const p=path.join(f.out,Object.keys(f.info.artifacts)[0]);fs.renameSync(p,p+'.old');fs.symlinkSync(p+'.old',p);}],
 ['hardlinked artifact',f=>fs.linkSync(path.join(f.out,Object.keys(f.info.artifacts)[0]),path.join(f.root,'alias'))],
])test('preparation refuses '+label,()=>using(f=>{change(f);assert.throws(()=>f.prepare());}));
for(const [label,change] of [
 ['missing envelope',f=>fs.unlinkSync(path.join(f.verification.envelopes,'latest.yml.sig.json'))],
 ['wrong fingerprint',f=>f.verification.fingerprint='0'.repeat(64)],
 ['wrong key ID',f=>f.verification.keyId='untrusted'],
 ['wrong key',f=>fs.writeFileSync(f.verification.publicKey,crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}))],
 ['private key instead of public',f=>fs.writeFileSync(f.verification.publicKey,f.keys.privateKey.export({type:'pkcs8',format:'pem'}))],
 ['changed YAML',f=>fs.appendFileSync(path.join(f.out,'latest.yml'),'unknown: value\n')],
 ['changed artifact',f=>fs.appendFileSync(path.join(f.out,Object.keys(f.info.artifacts)[0]),'changed')],
 ['changed inventory',f=>fs.appendFileSync(path.join(f.out,f.info.signed_updates.candidates[0].inventory),' ')],
 ['unknown feed',f=>fs.writeFileSync(path.join(f.out,'latest-extra.yml'),'bad')],
 ['unexpected installer',f=>fs.writeFileSync(path.join(f.out,'unexpected.exe'),'extra',{mode:0o600})],
 ['unsigned fallback',f=>fs.writeFileSync(path.join(f.verification.envelopes,'latest.yml.sig.json'),'{}')],
 ['wrong signed context',f=>{const row=f.info.signed_updates.candidates[0],c={...row.context,build:100};fs.writeFileSync(path.join(f.verification.envelopes,c.metadataName+'.sig.json'),wire.encodeEnvelope(c,[{keyId:'synthetic-test',signature:crypto.sign(null,wire.signingBytes(c),f.keys.privateKey).toString('base64')}]));}],
 ['forged receipt',f=>f.info.signed_updates.candidates.pop()],
 ['not pending',f=>f.info.state='review-candidate'],
 ['envelope symlink',f=>{const p=path.join(f.verification.envelopes,'latest.yml.sig.json');fs.renameSync(p,p+'.old');fs.symlinkSync(p+'.old',p);}],
])test('verification refuses '+label,()=>using(f=>{f.prepare();f.sign();change(f);assert.throws(()=>driver.verify(f.verification));}));
test('expired and future metadata cannot become release ready',()=>using(f=>{
 f.prepare();f.sign();
 assert.throws(()=>driver.verify({...f.verification,now:now+7200000}));
 assert.throws(()=>driver.verify({...f.verification,now:now-3600000}));
}));
test('driver never imports signing, subprocess, network or private-key operations',()=>{
 const source=fs.readFileSync(require.resolve('../../tools/desktop-updates/driver-metadata.cjs'),'utf8');
 for(const pattern of [/require\(['"].*signing/,/crypto\.sign\(/,/createPrivateKey/,/child_process/,/https?:/,/fetch\(/])assert.doesNotMatch(source,pattern);
});

test('generated inventories load directly in the existing owner signer',()=>using(f=>{
 f.prepare();const signer=require('../../tools/desktop-updates/signing.cjs');
 for(const row of f.info.signed_updates.candidates){
  const c=row.context;
  const candidate=signer.loadCandidate({inventory:path.join(f.out,row.inventory),seal:row.inventorySha256,
   artifacts:f.out,key:path.join(f.root,'never-read-private-key'),keyId:'synthetic-test',fingerprint:f.verification.fingerprint,
   tag:c.tag,build:c.build,platform:c.platform,product:'a'.repeat(40),documentserver:'b'.repeat(40),output:f.verification.envelopes},{now:()=>now});
  assert.deepEqual(candidate.context,c);
 }
}));
test('public finalization refuses a cryptographically valid QA-key signature on an ordinary-version candidate',()=>using(f=>{
 f.prepare();const keyId='eo-qa-'+'a'.repeat(32);
 for(const row of f.info.signed_updates.candidates)fs.writeFileSync(path.join(f.verification.envelopes,row.context.metadataName+'.sig.json'),
  wire.encodeEnvelope(row.context,[{keyId,signature:crypto.sign(null,wire.signingBytes(row.context),f.keys.privateKey).toString('base64')}]),{mode:0o600});
 assert.throws(()=>driver.verify({...f.verification,keyId}));
}));
test('explicit private neverPublish QA prepare and pinned QA-root verify succeed without a publication authority',()=>using(f=>{
 const prepared=f.prepare();assert.equal(prepared.neverPublish,true);assert.equal(prepared.qaRun,f.info.qaRun);
 f.sign();const result=driver.verify(f.verification);
 assert.equal(result.neverPublish,true);assert.equal(result.qaRun,f.info.qaRun);assert.equal(result.keyId,f.verification.keyId);
 assert.equal(result.files.length,4);assert.equal(result.state,undefined);assert.equal(f.info.state,'awaiting-owner-signatures');
},{qa:true}));
for(const [label,change]of [
 ['missing marker',f=>delete f.info.neverPublish],
 ['wrong flavor',f=>f.info.flavor='ordinary'],
 ['malformed run',f=>f.info.qaRun='../bad'],
 ['ordinary version',f=>f.info.build_identity.version='0.4.0-rc.99'],
 ['wrong build',f=>f.info.build_identity.build_number=3]
])test('private QA preparation refuses '+label,()=>using(f=>{
 change(f);assert.throws(()=>f.prepare());
 assert.equal(fs.readdirSync(f.out).some(n=>n.endsWith('.yml')||n.endsWith('.candidate.json')),false);
},{qa:true}));
for(const [label,change]of [
 ['stripped info provenance',f=>delete f.info.neverPublish],
 ['stripped prepared provenance',f=>delete f.info.signed_updates.neverPublish],
 ['changed prepared run',f=>f.info.signed_updates.qaRun='b'.repeat(32)],
 ['wrong signature run ID',f=>f.verification.keyId='eo-qa-'+'b'.repeat(32)],
 ['production ID',f=>f.verification.keyId='eo-2026-1'],
 ['production fingerprint',f=>f.verification.fingerprint='68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd']
])test('private QA verification refuses '+label,()=>using(f=>{
 f.prepare();f.sign();change(f);assert.throws(()=>driver.verify(f.verification));
},{qa:true}));
test('actual standalone CLI prepares and public-verifies the explicit private QA route',()=>using(f=>{
 const {spawnSync}=require('node:child_process'),command=require.resolve('../../tools/desktop-updates/driver-metadata.cjs');
 function invoke(operation,request){
  const result=spawnSync(process.execPath,[command,operation],{input:JSON.stringify(request),encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 }
 f.info.signed_updates=invoke('prepare',f.req);assert.equal(f.info.signed_updates.neverPublish,true);
 f.sign();const result=invoke('verify',f.verification);assert.equal(result.neverPublish,true);assert.equal(result.files.length,4);
 assert.equal(result.keyId,'eo-qa-'+'a'.repeat(32));
},{qa:true}));
test('ordinary preparation emits one sealed canonical batch plan for every eligible platform',()=>using(f=>{
 const r=f.prepare();assert.equal(r.batch.name,'signing-batch.json');
 const bytes=fs.readFileSync(path.join(f.out,r.batch.name));assert.equal(hash(bytes),r.batch.sha256);assert.equal(bytes.length,r.batch.bytes);
 const p=require('../../tools/desktop-updates/batch-plan.cjs').decodeBatchPlan(bytes);
 assert.equal(p.tag,'v'+f.info.build_identity.version);assert.equal(p.build,f.info.build_identity.build_number);
 assert.deepEqual(p.candidates,r.candidates.map(c=>({platform:c.context.platform,inventory:c.inventory,seal:c.inventorySha256})));
 assert.equal(r.batch.keyId,'eo-2026-1');assert.equal(r.batch.fingerprint,'68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd');
}));
for(const kind of ['removed plan','mutated plan','removed batch receipt','changed batch seal'])test('public verification refuses '+kind,()=>using(f=>{
 f.prepare();f.sign();
 if(kind==='removed plan')fs.unlinkSync(path.join(f.out,'signing-batch.json'));
 if(kind==='mutated plan')fs.appendFileSync(path.join(f.out,'signing-batch.json'),' ');
 if(kind==='removed batch receipt')delete f.info.signed_updates.batch;
 if(kind==='changed batch seal')f.info.signed_updates.batch.sha256='0'.repeat(64);
 assert.throws(()=>driver.verify(f.verification));
}));
test('private QA metadata helper never emits a real-owner signing batch or command',()=>using(f=>{
 const r=f.prepare();assert.equal(r.neverPublish,true);assert.equal(Object.hasOwn(r,'batch'),false);
 assert.equal(fs.existsSync(path.join(f.out,'signing-batch.json')),false);assert.equal(fs.existsSync(path.join(f.out,'OWNER-SIGNING.txt')),false);
 f.sign();assert.equal(driver.verify(f.verification).neverPublish,true);
},{qa:true}));
for(const platform of ['win32','linux'])test('one-platform release freezes its entire eligible batch '+platform,()=>using(f=>{
 f.info.inputs.targets=[platform==='win32'?'windows':'linux'];
 for(const name of Object.keys(f.info.artifacts)){
  if((platform==='win32'&&(name.endsWith('.AppImage')||name.endsWith('.zsync')))||(platform==='linux'&&name.endsWith('.exe'))){
   fs.unlinkSync(path.join(f.out,name));delete f.info.artifacts[name];
  }
 }
 const r=f.prepare(),p=require('../../tools/desktop-updates/batch-plan.cjs').decodeBatchPlan(fs.readFileSync(path.join(f.out,r.batch.name)));
 assert.equal(r.batch.candidates,1);assert.equal(p.candidates.length,1);assert.equal(p.candidates[0].platform,platform);
 f.sign();assert.equal(driver.verify(f.verification).files.length,2);
}));
