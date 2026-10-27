// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const crypto=require('node:crypto'),golden=require('./signed-update-golden.json');
const wire=require('../../../desktop/update-metadata.cjs'),{createPolicy}=require('../../../desktop/update-policy.cjs');
const key=crypto.createPrivateKey({key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex'),format:'der',type:'pkcs8'});
const fingerprint=crypto.createHash('sha256').update(crypto.createPublicKey(golden.publicKeyPem).export({type:'spki',format:'der'})).digest('hex');
function fixture({platform='win32',payload=Buffer.from('synthetic updater payload'),now=Date.now(),sequence=42,version='0.4.0'}={}){
 const policy=createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:[{keyId:'rfc8032-test-only',pem:golden.publicKeyPem,fingerprint}]});
 const runtime=Object.freeze({platform,arch:'x64',packageType:platform==='linux'?'AppImage':'nsis',electronVersion:'44.9.1',checksEnabled:true});
 const c={...golden.context,tag:'v'+version,version,sequence,issuedAt:now-1000,expiresAt:now+3600000,platform,packageType:runtime.packageType,
 metadataName:platform==='linux'?'latest-linux.yml':'latest.yml',
 artifact:{name:'ElixirOffice-'+version+(platform==='linux'?'-x86_64.AppImage':'-win-x64.exe'),size:payload.length,sha512:crypto.createHash('sha512').update(payload).digest('base64')}};
 const metadata=Buffer.from('version: '+c.version+'\nfiles:\n  - url: '+c.artifact.name+'\n    sha512: '+c.artifact.sha512+'\n    size: '+c.artifact.size+'\n');
 c.metadataSha512=crypto.createHash('sha512').update(metadata).digest('base64');
 const envelope=wire.encodeEnvelope(c,[{keyId:'rfc8032-test-only',signature:crypto.sign(null,wire.signingBytes(c),key).toString('base64')}]);
 return {policy,runtime,context:c,payload,metadata,envelope,selectedTag:c.tag,now};
}
module.exports={fixture};
