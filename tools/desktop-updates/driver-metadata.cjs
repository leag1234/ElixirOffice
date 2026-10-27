// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Public-only release bridge. All paths are local, operator-selected inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {encodeBatchPlan,MAX_BATCH}=require('./batch-plan.cjs');
const {REPOSITORY,MAX_ARTIFACT,MAX_METADATA,MAX_ENVELOPE,validateSigningMetadata,verifyMetadata,describeUpdate}=require('./signed-metadata.cjs');
function fail(){throw Error('Signed release verification refused');}
const hash=(bytes,algorithm='sha256',encoding='hex')=>crypto.createHash(algorithm).update(bytes).digest(encoding);
function root(folder){
 const p=path.resolve(folder),s=fs.lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(p)!==p||s.uid!==process.getuid()||(s.mode&0o022))fail();
 return p;
}
function name(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(value))fail();return value;}
function record(folder,filename,max,contents=false){
 const p=path.join(folder,name(filename)),fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const a=fs.fstatSync(fd);if(!a.isFile()||a.nlink!==1||a.uid!==process.getuid()||a.size<1||a.size>max||(a.mode&0o022))fail();
  const h256=crypto.createHash('sha256'),h512=crypto.createHash('sha512'),blocks=[];const buffer=Buffer.alloc(1024*1024);let total=0,n;
  while((n=fs.readSync(fd,buffer,0,buffer.length,null))){total+=n;if(total>max)fail();const b=buffer.subarray(0,n);h256.update(b);h512.update(b);if(contents)blocks.push(Buffer.from(b));}
  const b=fs.fstatSync(fd),c=fs.lstatSync(p);
  if(total!==a.size||[b,c].some(x=>x.dev!==a.dev||x.ino!==a.ino||x.size!==a.size||x.mtimeMs!==a.mtimeMs||x.ctimeMs!==a.ctimeMs))fail();
  return {sha256:h256.digest('hex'),sha512:h512.digest('base64'),bytes:total,...(contents?{data:Buffer.concat(blocks)}:{})};
 }finally{fs.closeSync(fd);}
}
function feedNames(folder,allowed=[]){
 for(const n of fs.readdirSync(folder)){
  if((/^(?:latest|beta|alpha).*\.yml(?:\.sig\.json)?$/.test(n)||/^app-update\.yml(?:\.sig\.json)?$/.test(n))&&!allowed.includes(n))fail();
 }
}
// Explicitly private QA provenance never creates publication authority.
function privateQA(info){
 const i=info?.build_identity,version=i?.version;
 const flagged=info?.neverPublish===true||info?.flavor==='elixiroffice-update-qa'||
  (info&&Object.hasOwn(info,'qaRun'))||(typeof version==='string'&&/^0\.0\.0(?:-|$)/.test(version));
 if(!flagged)return null;
 const m=typeof version==='string'?/^0\.0\.0-rc\.([1-9][0-9]{0,4})$/.exec(version):null;
 if(info.neverPublish!==true||info.flavor!=='elixiroffice-update-qa'||typeof info.qaRun!=='string'||
  !/^[a-f0-9]{32}$/.test(info.qaRun)||!m||Number(m[1])>65535||i.build_number!==Number(m[1])||i.channel!=='rc')fail();
 return Object.freeze({neverPublish:true,qaRun:info.qaRun});
}
function inputs(request){
 if(request.config?.mode!=='owner-signed-v1')fail();
 const folder=root(request.folder),info=request.info,i=info?.build_identity,p=info?.inputs;
 if(info?.schema!==1||!i||!p||!/^[a-f0-9]{40}$/.test(i.product_revision)||!/^[a-f0-9]{40}$/.test(i.documentserver_revision)||
   p.product_revision!==i.product_revision||p.documentserver_revision!==i.documentserver_revision||
   !Array.isArray(p.targets)||!p.targets.length||new Set(p.targets).size!==p.targets.length||p.targets.some(x=>!['linux','windows','mac'].includes(x))||
   !['rc','final'].includes(i.channel)||!info.artifacts||!Object.keys(info.artifacts).length)fail();
 for(const n of fs.readdirSync(folder)){
  if((/\.(?:AppImage|zsync|deb|exe|dmg|flatpak)$/.test(n)||n.endsWith("-evidence.tar")||["RELEASE-NOTES.md","MAC-INPUT.tar","elixiroffice-desktop-source.tar.gz"].includes(n))&&!Object.hasOwn(info.artifacts,n))fail();
 }
 for(const [n,r] of Object.entries(info.artifacts)){
  name(n);if(!r||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1)fail();
  const actual=record(folder,n,MAX_ARTIFACT);if(actual.sha256!==r.sha256||actual.bytes!==r.bytes)fail();
 }
 return {folder,info,i,p,qa:privateQA(info)};
}
function candidates(request){
 const {folder,info,i,p,qa}=inputs(request),result=[];
 for(const platform of ['win32','linux']){
  if(!p.targets.includes(platform==='win32'?'windows':'linux'))continue;
  const artifactName='ElixirOffice-'+i.version+(platform==='win32'?'-win-x64.exe':'-x86_64.AppImage');
  if(!Object.hasOwn(info.artifacts,artifactName))fail();
  const a=record(folder,artifactName,MAX_ARTIFACT);
  const metadataName=platform==='win32'?'latest.yml':'latest-linux.yml';
  const metadata=Buffer.from('version: '+i.version+'\nfiles:\n  - url: '+artifactName+'\n    sha512: '+a.sha512+'\n    size: '+a.bytes+'\n');
  const context={schema:1,repository:REPOSITORY,tag:'v'+i.version,version:i.version,build:i.build_number,sequence:request.config.sequence,channel:i.channel==='final'?'stable':'prerelease',
   platform,arch:'x64',packageType:platform==='win32'?'nsis':'AppImage',issuedAt:request.config.issuedAt,expiresAt:request.config.expiresAt,
   metadataName,metadataSha512:hash(metadata,'sha512','base64'),artifact:{name:artifactName,size:a.bytes,sha512:a.sha512}};
  validateSigningMetadata(context,metadata);
  const inventory=metadataName+'.candidate.json',bytes=Buffer.from(JSON.stringify({schema:1,product_revision:i.product_revision,documentserver_revision:i.documentserver_revision,context})+'\n');
  result.push({inventory,inventorySha256:hash(bytes),context,metadata,inventoryBytes:bytes});
 }
 if(!result.length)fail();return {folder,result,qa};
}
function writeExclusive(folder,n,data){
 const fd=fs.openSync(path.join(folder,name(n)),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function batchMaterial(request,result){
 const i=request.info.build_identity,trust=require('../../desktop/update-production-trust.cjs')[0];
 const bytes=encodeBatchPlan({schema:1,mode:'owner-release-batch-v1',tag:'v'+i.version,build:i.build_number,
  product:i.product_revision,documentserver:i.documentserver_revision,
  candidates:result.map(r=>({platform:r.context.platform,inventory:r.inventory,seal:r.inventorySha256}))});
 return {bytes,descriptor:{name:'signing-batch.json',sha256:hash(bytes),bytes:bytes.length,candidates:result.length,keyId:trust.keyId,fingerprint:trust.fingerprint}};
}
function prepare(request){
 const {folder,result,qa}=candidates(request);feedNames(folder);
 for(const r of result)for(const n of [r.inventory,r.context.metadataName])if(fs.existsSync(path.join(folder,n)))fail();
 for(const r of result){writeExclusive(folder,r.context.metadataName,r.metadata);writeExclusive(folder,r.inventory,r.inventoryBytes);}
 let batch;
 if(!qa){const material=batchMaterial(request,result);writeExclusive(folder,material.descriptor.name,material.bytes);batch=material.descriptor;}
 return {schema:1,mode:'owner-signed-v1',config:request.config,candidates:result.map(({inventory,inventorySha256,context})=>({inventory,inventorySha256,context})),...qa,...(batch?{batch}:{})};
}
function verify(request){
 const qa=privateQA(request?.info);
 if(qa){
  if(request.keyId!=='eo-qa-'+qa.qaRun||request.fingerprint==='68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd')fail();
 }else if(typeof request?.keyId==='string'&&request.keyId.startsWith('eo-qa-'))fail();
 const {folder,result}=candidates(request),receipt=request.info.signed_updates;
 if(request.info.state!=='awaiting-owner-signatures'||!receipt||receipt.schema!==1||receipt.mode!=='owner-signed-v1'||
    JSON.stringify(receipt.config)!==JSON.stringify(request.config)||
    JSON.stringify(receipt.candidates)!==JSON.stringify(result.map(({inventory,inventorySha256,context})=>({inventory,inventorySha256,context}))))fail();
 if(qa?(receipt.neverPublish!==true||receipt.qaRun!==qa.qaRun):(Object.hasOwn(receipt,'neverPublish')||Object.hasOwn(receipt,'qaRun')))fail();
 if(qa){if(Object.hasOwn(receipt,'batch'))fail();}
 else{
  const expected=batchMaterial(request,result);
  if(JSON.stringify(receipt.batch)!==JSON.stringify(expected.descriptor))fail();
  const batch=record(folder,expected.descriptor.name,MAX_BATCH,true);
  if(!batch.data.equals(expected.bytes)||batch.sha256!==expected.descriptor.sha256)fail();
 }
 const expectedNames=result.flatMap(r=>[r.context.metadataName,r.context.metadataName+'.sig.json']);
 feedNames(folder,expectedNames);
 const keyPath=path.resolve(request.publicKey),keyBytes=record(root(path.dirname(keyPath)),path.basename(keyPath),16384,true).data;
 // Require precisely a public SPKI PEM. Never derive public trust from a private PEM.
 if(!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(keyBytes.toString('ascii')))fail();
 const key=crypto.createPublicKey(keyBytes);
 if(key.asymmetricKeyType!=='ed25519'||!/^[a-f0-9]{64}$/.test(request.fingerprint)||hash(key.export({format:'der',type:'spki'}))!==request.fingerprint||
    typeof request.keyId!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(request.keyId))fail();
 const envelopes=root(request.envelopes),files=[];
 for(const r of result){
  const inv=record(folder,r.inventory,32768,true);
  if(inv.sha256!==r.inventorySha256||!inv.data.equals(r.inventoryBytes))fail();
  const metadata=record(folder,r.context.metadataName,MAX_METADATA,true);
  if(!metadata.data.equals(r.metadata))fail();
  const envelopeName=r.context.metadataName+'.sig.json',envelope=record(envelopes,envelopeName,MAX_ENVELOPE,true);
  const verified=verifyMetadata(envelope.data,metadata.data,{trustedKeys:{[request.keyId]:key},expected:{tag:r.context.tag,platform:r.context.platform,arch:r.context.arch,packageType:r.context.packageType},now:request.now??Date.now()});
  const description=describeUpdate(verified);
  if(JSON.stringify(verified.context)!==JSON.stringify(r.context)||description.artifact.name!==r.context.artifact.name)fail();
  files.push({name:r.context.metadataName,sha256:metadata.sha256,bytes:metadata.bytes},{name:envelopeName,sha256:envelope.sha256,bytes:envelope.bytes});
 }
 return {schema:1,keyId:request.keyId,keyFingerprint:request.fingerprint,files,...qa};
}
if(require.main===module){
 try{
  let size=0;const chunks=[];for(;;){const b=Buffer.alloc(65536),n=fs.readSync(0,b,0,b.length,null);if(!n)break;size+=n;if(size>1024*1024)fail();chunks.push(b.subarray(0,n));}
  const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const operation=process.argv[2];if(!['prepare','verify'].includes(operation)||process.argv.length!==3)fail();
  process.stdout.write(JSON.stringify(operation==='prepare'?prepare(request):verify(request))+'\n');
 }catch{process.stderr.write('Signed release verification refused.\n');process.exitCode=1;}
}
module.exports={prepare,verify};
