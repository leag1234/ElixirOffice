// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const crypto=require('node:crypto'),{validateEndpoint}=require('./transport.cjs');
const APP_ID='org.elixiroffice.desktop.updateqa',PRODUCT='ElixirOffice Update QA';
const ns=Buffer.from('50e065bc313411e69bab38c9862bdaf3','hex');
const uuid=crypto.createHash('sha1').update(ns).update(APP_ID).digest().subarray(0,16);
uuid[6]=(uuid[6]&15)|0x50;uuid[8]=(uuid[8]&63)|0x80;
const h=uuid.toString('hex'),NSIS_GUID=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(){throw Error('QA manifest refused');}
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))fail();}
function safePath(p){return typeof p==='string'&&p.length<240&&!p.startsWith('/')&&p.split('/').every(s=>s!=='.'&&s!=='..'&&/^[A-Za-z0-9_@.-]+$/.test(s));}
function validate(m){
 exact(m,['schema','flavor','role','platform','currentBuild','nextBuild','productRevision','documentserverRevision','endpoint','tag','trust','inputs']);
 if(m.schema!==1||m.flavor!=='elixiroffice-update-qa'||!['old','new'].includes(m.role)||!['linux','win32'].includes(m.platform)||
  ![m.currentBuild,m.nextBuild].every(n=>Number.isInteger(n)&&n>0&&n<=65535)||
  (m.role==='old'?m.currentBuild>=m.nextBuild:m.currentBuild!==m.nextBuild)||
  m.tag!=='v0.0.0-rc.'+m.nextBuild||![m.productRevision,m.documentserverRevision].every(x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x)))fail();
 validateEndpoint(m.endpoint);
 exact(m.trust,['keyId','pem','fingerprint']);
 if(m.trust.keyId!=='eo-qa-'+m.endpoint.prefix.split('/')[2]||
  typeof m.trust.pem!=='string'||!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n$/.test(m.trust.pem)||
  typeof m.trust.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(m.trust.fingerprint))fail();
 try{
  const key=crypto.createPublicKey(m.trust.pem);
  // No production-key exception, including relabelling its public bytes.
  if(key.asymmetricKeyType!=='ed25519'||hash(key.export({type:'spki',format:'der'}))!==m.trust.fingerprint||
   m.trust.fingerprint==='68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd')fail();
 }catch{fail();}
 if(!m.inputs||typeof m.inputs!=='object'||Array.isArray(m.inputs)||Object.keys(m.inputs).length<10||Object.keys(m.inputs).length>2000)fail();
 for(const [p,d] of Object.entries(m.inputs))if(!safePath(p)||!(p.startsWith('desktop/')||p.startsWith('tools/desktop-updates/qa/'))||typeof d!=='string'||!/^[a-f0-9]{64}$/.test(d))fail();
 return m;
}
function read(bytes,seal){
 if(!Buffer.isBuffer(bytes)||bytes.length>1024*1024||typeof seal!=='string'||!/^[a-f0-9]{64}$/.test(seal)||hash(bytes)!==seal)fail();
 let m;try{m=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 if(!bytes.equals(Buffer.from(JSON.stringify(m)+'\n')))fail();
 validate(m);return m;
}
module.exports={APP_ID,PRODUCT,NSIS_GUID,hash,safePath,validate,read,fail};
