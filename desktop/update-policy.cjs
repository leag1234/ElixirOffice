// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const crypto=require('node:crypto');
const metadata=require('./update-metadata.cjs');
const QUALIFIED_ELECTRON='44.9.1';
function refuse(){throw Error('Update policy refused');}
function disabled(reason){return Object.freeze({enabled:false,reason});}
// Main-process construction only. No renderer preference or downloaded field
// may provide qualification or keys. Production embeds public trust but stays closed.
function createPolicy({qualifiedElectronVersion=null,trustedKeys=[],qualification=null}={}){
 if(qualifiedElectronVersion!==null&&qualifiedElectronVersion!==QUALIFIED_ELECTRON)refuse();
 let approval=null;
 if(qualification!==null){
  const q=qualification;
  if(!q||typeof q!=='object'||Object.keys(q).sort().join(',')!=='electronVersion,platforms,reviewed'||
     typeof q.reviewed!=='boolean'||q.electronVersion!==qualifiedElectronVersion||
     !q.platforms||typeof q.platforms!=='object'||Object.keys(q.platforms).sort().join(',')!=='AppImage,nsis'||
     typeof q.platforms.nsis!=='boolean'||typeof q.platforms.AppImage!=='boolean')refuse();
  approval=Object.freeze({reviewed:q.reviewed,platforms:Object.freeze({nsis:q.platforms.nsis,AppImage:q.platforms.AppImage})});
 }
 if(!Array.isArray(trustedKeys)||trustedKeys.length>2)refuse();
 const keys=Object.create(null);
 for(const pin of trustedKeys){
  if(!pin||typeof pin.keyId!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(pin.keyId)||Object.hasOwn(keys,pin.keyId)||
     typeof pin.pem!=='string'||!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(pin.pem)||
     typeof pin.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(pin.fingerprint))refuse();
  let key;
  try{key=crypto.createPublicKey(pin.pem);}catch{refuse();}
  if(key.asymmetricKeyType!=='ed25519'||crypto.createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex')!==pin.fingerprint)refuse();
  keys[pin.keyId]=key;
 }
 Object.freeze(keys);
 function snapshot(value){
  if(!value||typeof value!=='object')return null;
  const {platform,arch,packageType,electronVersion,checksEnabled}=value;
  return Object.freeze({platform,arch,packageType,electronVersion,checksEnabled});
 }
 function eligible(value){
  if(!value)return disabled('unsupported');
  if(value.arch!=='x64'||!((value.platform==='win32'&&value.packageType==='nsis')||(value.platform==='linux'&&value.packageType==='AppImage')))return disabled('unsupported');
  if(value.checksEnabled!==undefined&&value.checksEnabled!==true)return disabled('checks-disabled');
  if(approval&&(!approval.reviewed||!approval.platforms[value.packageType]))return disabled('qualification-pending');
  if(qualifiedElectronVersion===null||value.electronVersion!==qualifiedElectronVersion)return disabled('runtime-pending');
  if(Object.keys(keys).length===0)return disabled('key-pending');
  return Object.freeze({enabled:true,reason:null});
 }
 function capability(value){return eligible(snapshot(value));}
 function verify({envelope,metadata:bytes,selectedTag,runtime,now}){
  const target=snapshot(runtime);
  if(!eligible(target).enabled)refuse();
  const verified=metadata.verifyMetadata(envelope,bytes,{trustedKeys:keys,expected:{tag:selectedTag,platform:target.platform,arch:target.arch,packageType:target.packageType},now:now??Date.now()});
  metadata.describeUpdate(verified);
  return verified;
 }
 return Object.freeze({capability,verify});
}
const qualification=require('./update-production-qualification.cjs');
const production=createPolicy({
 trustedKeys:require('./update-production-trust.cjs'),
 qualifiedElectronVersion:qualification.electronVersion,
 qualification
});
module.exports=Object.freeze({createPolicy,production,QUALIFIED_ELECTRON});
