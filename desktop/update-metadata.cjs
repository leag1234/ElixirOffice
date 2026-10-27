// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Shared pure verifier: no network, filesystem, trust discovery or installation.
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {parseVersion,compareVersions}=require('./release-notice.cjs');
const REPOSITORY='leag1234/elixiroffice',DAY=86400000;
const MAX_ENVELOPE=16*1024,MAX_METADATA=128*1024,MAX_ARTIFACT=2**31;
const CONTEXT=['schema','repository','tag','version','build','sequence','channel','platform','arch','packageType','issuedAt','expiresAt','metadataName','metadataSha512','artifact'];
const ARTIFACT=['name','size','sha512'],verifiedRecords=new WeakSet();
function fail(){throw Error('Invalid signed update');}
function fields(value,names){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const keys=Object.keys(value);if(keys.length!==names.length||names.some(k=>!Object.hasOwn(value,k)))fail();
}
function integer(value,min=1,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||value<min||value>max)fail();}
function base64(value,size){
 if(typeof value!=='string'||value.length!==4*Math.ceil(size/3))fail();
 const bytes=Buffer.from(value,'base64');if(bytes.length!==size||bytes.toString('base64')!==value)fail();
 return bytes;
}
function signingBytes(c){
 return Buffer.from('ElixirOffice signed update v1\n'+JSON.stringify([
  c.schema,c.repository,c.tag,c.version,c.build,c.sequence,c.channel,c.platform,c.arch,c.packageType,
  c.issuedAt,c.expiresAt,c.metadataName,c.metadataSha512,[c.artifact.name,c.artifact.size,c.artifact.sha512]
 ]),'utf8');
}
function encodeEnvelope(context,signatures){return Buffer.from(JSON.stringify({context,signatures})+'\n','utf8');}
function text(bytes,max){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>max)fail();
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
function validateContext(c){
 fields(c,CONTEXT);fields(c.artifact,ARTIFACT);
 if(c.schema!==1||c.repository!==REPOSITORY)fail();
 const version=parseVersion(c.version);
 if(!version||version.version!==c.version||c.tag!=='v'+c.version)fail();
 if(c.channel!==(version.pre.length?'prerelease':'stable'))fail();
 integer(c.build);integer(c.sequence);integer(c.issuedAt);integer(c.expiresAt);
 if(c.expiresAt<=c.issuedAt||c.expiresAt-c.issuedAt>90*DAY)fail();
 const windows=c.platform==='win32'&&c.packageType==='nsis',linux=c.platform==='linux'&&c.packageType==='AppImage';
 if(c.arch!=='x64'||(!windows&&!linux))fail();
 if(c.metadataName!==(windows?'latest.yml':'latest-linux.yml'))fail();
 const name=windows?'ElixirOffice-'+c.version+'-win-x64.exe':'ElixirOffice-'+c.version+'-x86_64.AppImage';
 if(c.artifact.name!==name)fail();
 integer(c.artifact.size,1,MAX_ARTIFACT);base64(c.artifact.sha512,64);base64(c.metadataSha512,64);
}
function canonicalContext(c){return Object.fromEntries(CONTEXT.map(key=>[key,key==='artifact'?Object.fromEntries(ARTIFACT.map(k=>[k,c.artifact[k]])):c[key]]));}
function verifyMetadata(envelope,metadata,{trustedKeys,expected,now}={}){
 integer(now);const raw=text(envelope,MAX_ENVELOPE),value=JSON.parse(raw);
 fields(value,['context','signatures']);validateContext(value.context);
 const c=value.context;
 if(!Array.isArray(value.signatures)||value.signatures.length<1||value.signatures.length>2)fail();
 const ids=new Set();
 for(const item of value.signatures){
  fields(item,['keyId','signature']);
  if(typeof item.keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.keyId)||ids.has(item.keyId))fail();
  ids.add(item.keyId);base64(item.signature,64);
 }
 // A single canonical wire format rejects duplicate JSON keys and ambiguous encodings.
 if(!encodeEnvelope(canonicalContext(c),value.signatures.map(({keyId,signature})=>({keyId,signature}))).equals(envelope))fail();
 fields(expected,['tag','platform','arch','packageType']);
 if(Object.entries(expected).some(([key,v])=>c[key]!==v)||now<c.issuedAt||now>=c.expiresAt)fail();
 if(!trustedKeys||typeof trustedKeys!=='object'||Array.isArray(trustedKeys))fail();
 const bytes=signingBytes(c);
 const valid=value.signatures.some(item=>{
  if(!Object.hasOwn(trustedKeys,item.keyId))return false;
  try{
   const input=trustedKeys[item.keyId],key=input instanceof crypto.KeyObject?input:crypto.createPublicKey(input);
   return key.type==='public'&&key.asymmetricKeyType==='ed25519'&&crypto.verify(null,bytes,key,base64(item.signature,64));
  }catch{return false;}
 });
 if(!valid)fail();
 if(!Buffer.isBuffer(metadata)||metadata.length<1||metadata.length>MAX_METADATA)fail();
 const hash=crypto.createHash('sha512').update(metadata).digest();
 if(!crypto.timingSafeEqual(hash,base64(c.metadataSha512,64)))fail();
 const metadataText=text(metadata,MAX_METADATA);
 Object.freeze(c.artifact);Object.freeze(c);
 const result=Object.freeze({context:c,metadataText,identity:crypto.createHash('sha256').update(bytes).digest('hex'),checkedAt:now});
 verifiedRecords.add(result);return result;
}

function interpretMetadata(c,metadataText){
 const a=c.artifact,lines=metadataText.split(/\r?\n/);
 // A finite scalar grammar, not a general YAML loader. Exact line matching
 // excludes aliases, tags, duplicate/unknown keys and additional documents.
 if(lines.pop()!==''||lines.length<5||lines.length>8)fail();
 const fixed=['version: '+c.version,'files:','  - url: '+a.name,'    sha512: '+a.sha512,'    size: '+a.size];
 if(fixed.some((line,index)=>lines[index]!==line))fail();
 let index=5,releaseDate;
 if(lines[index]?.startsWith('path: ')){
  if(lines[index++]!=='path: '+a.name||lines[index++]!=='sha512: '+a.sha512)fail();
 }
 if(lines[index]?.startsWith('releaseDate: ')){
  const match=/^releaseDate: '([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z)'$/.exec(lines[index++]);
  if(!match||!Number.isFinite(Date.parse(match[1]))||new Date(match[1]).toISOString()!==match[1])fail();
  releaseDate=match[1];
 }
 if(index!==lines.length)fail();
 return Object.freeze({
  version:c.version,artifact:Object.freeze({name:a.name,size:a.size,sha512:a.sha512}),
  ...(releaseDate?{releaseDate}:{})
 });
}

function describeUpdate(verified){
 if(!verifiedRecords.has(verified))fail();
 const d=interpretMetadata(verified.context,verified.metadataText);
 return Object.freeze({version:d.version,artifact:d.artifact,identity:verified.identity,checkedAt:verified.checkedAt,...(d.releaseDate?{releaseDate:d.releaseDate}:{})});
}
// Structural preflight for the owner signer only. This creates no verified
// record: unsigned candidates remain rejected by describeUpdate/assessCandidate.
function validateSigningMetadata(context,metadata){
 validateContext(context);
 const c=canonicalContext(context);
 validateContext(c);
 Object.freeze(c.artifact);Object.freeze(c);
 const metadataText=text(metadata,MAX_METADATA);
 if(!crypto.timingSafeEqual(crypto.createHash('sha512').update(metadata).digest(),base64(c.metadataSha512,64)))fail();
 return Object.freeze({context:c,description:interpretMetadata(c,metadataText)});
}

function assessCandidate(verified,{runningVersion,state}={}){
 if(!verifiedRecords.has(verified)||!parseVersion(runningVersion))fail();
 const c=verified.context;
 if(compareVersions(c.version,runningVersion)<=0)fail();
 let retry=false;
 if(state!==null){
  fields(state,['sequence','identity','checkedAt']);integer(state.sequence);integer(state.checkedAt);
  if(typeof state.identity!=='string'||!/^[0-9a-f]{64}$/.test(state.identity))fail();
  if(c.sequence<state.sequence||verified.checkedAt<state.checkedAt)fail();
  if(c.sequence===state.sequence){if(verified.identity!==state.identity)fail();retry=true;}
 }
 const next=Object.freeze({sequence:c.sequence,identity:verified.identity,checkedAt:verified.checkedAt});
 return Object.freeze({retry,next});
}
module.exports={REPOSITORY,DAY,MAX_ENVELOPE,MAX_METADATA,MAX_ARTIFACT,signingBytes,encodeEnvelope,verifyMetadata,assessCandidate,describeUpdate,validateSigningMetadata};
