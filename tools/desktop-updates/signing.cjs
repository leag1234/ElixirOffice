// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Owner-only, unshipped tooling. No package/build hooks, network or installer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {validateSigningMetadata,verifyMetadata,describeUpdate,signingBytes,encodeEnvelope,MAX_METADATA,MAX_ENVELOPE}=require('./signed-metadata.cjs');
const records=new WeakMap(),MAX_INVENTORY=32768,MAX_KEY=16384,MAX_SECRET=4096;
function fail(){throw Error('Invalid signing input');}
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
function directory(name,privateMode=false){
 if(typeof name!=='string'||!name)fail();
 const full=path.resolve(name),st=fs.lstatSync(full,{bigint:true});
 if(fs.realpathSync(full)!==full||!st.isDirectory()||st.uid!==BigInt(process.geteuid()))fail();
 if(privateMode&&(st.mode&0o7777n)!==0o700n)fail();
 return full;
}
function record(name,max,collect=false,privateMode=false){
 const full=path.resolve(name);if(fs.realpathSync(full)!==full)fail();
 const fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 const buffer=Buffer.alloc(65536),chunks=[],sha=crypto.createHash('sha512'),seal=crypto.createHash('sha256');
 try{
  const before=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.uid!==BigInt(process.geteuid())||before.size<1n||before.size>BigInt(max))fail();
  if(privateMode&&(before.mode&0o7777n)!==0o600n)fail();
  let size=0;
  for(;;){
   const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,max-size+1),null);if(!n)break;
   size+=n;if(size>max)fail();const chunk=buffer.subarray(0,n);sha.update(chunk);seal.update(chunk);
   if(collect)chunks.push(Buffer.from(chunk));
  }
  if(size!==Number(before.size)||!same(before,fs.fstatSync(fd,{bigint:true}))||!same(before,fs.lstatSync(full,{bigint:true})))fail();
  return {bytes:collect?Buffer.concat(chunks):null,size,sha512:sha.digest('base64'),sha256:seal.digest('hex'),stamp:before};
 }finally{buffer.fill(0);fs.closeSync(fd);}
}
function validOptions(o){
 if(process.platform!=='linux'||!o||typeof o!=='object')fail();
 for(const key of ['seal','fingerprint'])if(typeof o[key]!=='string'||!/^[0-9a-f]{64}$/.test(o[key]))fail();
 for(const key of ['product','documentserver'])if(typeof o[key]!=='string'||!/^[0-9a-f]{40}$/.test(o[key]))fail();
 if(typeof o.keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(o.keyId))fail();
 if(!Number.isSafeInteger(o.build)||o.build<1||o.build>65535||!['win32','linux'].includes(o.platform)||typeof o.tag!=='string')fail();
}
function clock(c,now){
 const n=now();if(!Number.isSafeInteger(n)||n<c.issuedAt||n>=c.expiresAt)fail();
}
function loadCandidate(options,{now=Date.now}={}){
 validOptions(options);const o=Object.freeze({...options}),root=directory(o.artifacts),raw=record(o.inventory,MAX_INVENTORY,true);
 if(raw.sha256!==o.seal)fail();
 const inventory=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw.bytes));
 if(inventory.schema!==1||inventory.product_revision!==o.product||inventory.documentserver_revision!==o.documentserver)fail();
 const c=inventory.context;if(!c||c.tag!==o.tag||c.build!==o.build||c.platform!==o.platform)fail();
 // Basenames are fixed by the signed schema before they are used as paths.
 const expectedName=o.platform==='win32'?'latest.yml':'latest-linux.yml';
 if(c.metadataName!==expectedName)fail();
 const metadata=record(path.join(root,expectedName),MAX_METADATA,true);
 const prepared=validateSigningMetadata(c,metadata.bytes),context=prepared.context;
 const canonical=Buffer.from(JSON.stringify({schema:1,product_revision:o.product,documentserver_revision:o.documentserver,context})+'\n');
 if(!canonical.equals(raw.bytes))fail();
 clock(context,now);
 const artifact=record(path.join(root,context.artifact.name),context.artifact.size);
 if(artifact.size!==context.artifact.size||artifact.sha512!==context.artifact.sha512)fail();
 clock(context,now);
 const candidate=Object.freeze({context,product_revision:o.product,documentserver_revision:o.documentserver,seal:o.seal});
 records.set(candidate,{o,root,raw,metadata,artifact});return candidate;
}
function inside(root,target){const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function signingKey(o,root){
 const name=path.resolve(o.key);directory(path.dirname(name),true);
 if(inside(root,name)||inside(path.resolve(o.output),name))fail();
 const key=record(name,MAX_KEY,true,true);
 if(!key.bytes.every(byte=>byte<128)||!/^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=]{1,64}\r?\n)+-----END ENCRYPTED PRIVATE KEY-----\r?\n?$/.test(key.bytes.toString('ascii'))){key.bytes.fill(0);fail();}
 return key.bytes;
}
function writeEnvelope(output,name,bytes,io=fs){
 const root=directory(output,true),dir=io.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 const anchor='/proc/self/fd/'+dir,temporary=path.join(anchor,'.sign-update-'+crypto.randomBytes(16).toString('hex')),final=path.join(anchor,name);
 let fd,stamp,promoted=false;
 try{
  if(io.existsSync(final)||io.lstatSync(root,{bigint:true}).ino!==io.fstatSync(dir,{bigint:true}).ino)fail();
  fd=io.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  io.fchmodSync(fd,0o600);stamp=io.fstatSync(fd,{bigint:true});
  for(let offset=0;offset<bytes.length;){const n=io.writeSync(fd,bytes,offset,bytes.length-offset,null);if(n<1)fail();offset+=n;}
  io.fsyncSync(fd);io.closeSync(fd);fd=undefined;
  if(directory(output,true)!==root||io.lstatSync(root,{bigint:true}).ino!==io.fstatSync(dir,{bigint:true}).ino)fail();
  io.linkSync(temporary,final);promoted=true;io.unlinkSync(temporary);io.fsyncSync(dir);
 }catch(error){
  if(promoted){try{const st=io.lstatSync(final,{bigint:true});if(st.dev===stamp.dev&&st.ino===stamp.ino)io.unlinkSync(final);}catch{}}
  throw error;
 }finally{
  try{
   if(fd!==undefined)io.closeSync(fd);
   try{io.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}
  }finally{io.closeSync(dir);}
 }
}
function publicDetails(candidate,o,fingerprint){
 const c=candidate.context;
 // Stable operator order is part of the approval contract (release review).
 return Object.freeze({
  artifact:Object.freeze({name:c.artifact.name,size:c.artifact.size,sha512:c.artifact.sha512}),
  tag:c.tag,build:c.build,sequence:c.sequence,expiresAt:c.expiresAt,fingerprint,
  expiryUTC:new Date(c.expiresAt).toISOString(),
  product_revision:candidate.product_revision,documentserver_revision:candidate.documentserver_revision,seal:candidate.seal,
  version:c.version,platform:c.platform,arch:c.arch,packageType:c.packageType,issuedAt:c.issuedAt,
  metadata:Object.freeze({name:c.metadataName,sha512:c.metadataSha512}),keyId:o.keyId
 });
}
async function signCandidate(options,{readSecret,approve,now=Date.now,writeIO=fs}={}){
 const candidate=loadCandidate(options,{now}),initial=records.get(candidate),o=initial.o;
 directory(o.output,true);
 const encrypted=signingKey(o,initial.root);
 let secret;
 try{
  if(typeof readSecret!=='function'||typeof approve!=='function')fail();
  secret=await readSecret();
  if(!Buffer.isBuffer(secret)||secret.length<1||secret.length>MAX_SECRET||secret.includes(0)||secret.includes(10)||secret.includes(13))fail();
  const key=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:secret});
  secret.fill(0);encrypted.fill(0);
  if(key.type!=='private'||key.asymmetricKeyType!=='ed25519')fail();
  const publicKey=crypto.createPublicKey(key),fingerprint=sha256(publicKey.export({type:'spki',format:'der'}));
  if(fingerprint!==o.fingerprint)fail();
  const details=publicDetails(candidate,o,fingerprint);
  if(await approve(details)!==true)fail();
  const fresh=loadCandidate(o,{now}),checked=records.get(fresh);
  for(const name of ['raw','metadata','artifact'])if(!same(initial[name].stamp,checked[name].stamp))fail();
  if(JSON.stringify(publicDetails(fresh,o,fingerprint))!==JSON.stringify(details))fail();
  const c=fresh.context;clock(c,now);
  const envelope=encodeEnvelope(c,[{keyId:o.keyId,signature:crypto.sign(null,signingBytes(c),key).toString('base64')}]);
  if(envelope.length>MAX_ENVELOPE)fail();
  const verified=verifyMetadata(envelope,checked.metadata.bytes,{trustedKeys:{[o.keyId]:publicKey},expected:{tag:o.tag,platform:o.platform,arch:'x64',packageType:c.packageType},now:now()});
  describeUpdate(verified);
  const name=c.metadataName+'.sig.json';writeEnvelope(o.output,name,envelope,writeIO);
  return Object.freeze({name,sha256:sha256(envelope),bytes:envelope.length});
 }finally{encrypted.fill(0);if(Buffer.isBuffer(secret))secret.fill(0);}
}
module.exports={loadCandidate,signCandidate,MAX_SECRET};
