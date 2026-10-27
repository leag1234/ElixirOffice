// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const crypto=require('node:crypto');
// Repository QA only. Never searches a home directory, follows links or reads a
// signing key. Recognition covers serialized PEM/DER, not arbitrary bare seeds.
function isPrivateDer(bytes){
 if(bytes.length<32||bytes[0]!==0x30)return false;
 // Encrypted PKCS8 has no decryptable public structure without a passphrase.
 // Recognize its PBES2 algorithm identifier without trying passwords.
 const pbes2=Buffer.from('06092a864886f70d01050d','hex');
 if(bytes.subarray(0,64).includes(pbes2))return true;
 for(const type of ['pkcs8','pkcs1','sec1']){
  try{if(crypto.createPrivateKey({key:bytes,format:'der',type}).type==='private')return true;}catch{}
 }
 return false;
}
function privateMaterials(bytes){
 const found=[];
 if(isPrivateDer(bytes))found.push(bytes);
 // JSON/source often stores escaped newlines. Decoding this framing does not
 // evaluate code, import modules or inspect a private filesystem location.
 const text=bytes.toString('utf8').replace(/\\r\\n|\\n/g,'\n');
 const pem=/-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY)-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END \1-----/g;
 for(const match of text.matchAll(pem)){
  const body=match[2].replace(/\s/g,'');
  if(body.length>=40&&body.length%4===0)found.push(Buffer.from(body,'base64'));
 }
 for(const match of text.matchAll(/['"]([a-fA-F0-9]{64,})['"]/g)){
  if(match[1].length%2===0){const b=Buffer.from(match[1],'hex');if(isPrivateDer(b))found.push(b);}
 }
 for(const match of text.matchAll(/['"]([A-Za-z0-9+/]{40,}={0,2})['"]/g)){
  const b=Buffer.from(match[1],'base64');
  if(b.toString('base64')===match[1]&&isPrivateDer(b))found.push(b);
 }
 return found;
}
// release review: only this published RFC8032 PKCS8 vector, only these four
// pre-existing fixture paths. No exemption for production or other keys.
const vectorPaths=new Set([
 'tests/desktop/fixtures/update-test-kit.cjs',
 'tests/desktop/signed-update-description.test.cjs',
 'tests/desktop/signed-update.test.cjs',
 'tests/desktop/update-policy.test.cjs'
]);
function approvedPublishedVector(file,bytes){
 return vectorPaths.has(file)&&bytes.length===48&&
  crypto.createHash('sha256').update(bytes).digest('hex')==='06ceb2d515aec734d9d42561d1f7f467f53926837e85229814fcf218056240ae';
}
module.exports={privateMaterials,approvedPublishedVector,containsPrivateMaterial:bytes=>privateMaterials(bytes).length>0};
