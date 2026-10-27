// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const wire=require('../../../tools/desktop-updates/signed-metadata.cjs');
const hash=(b,algorithm='sha256')=>crypto.createHash(algorithm).update(b).digest(algorithm==='sha512'?'base64':'hex');
function fixture(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eo-batch-sign-test-')));
 const artifacts=path.join(root,'artifacts'),keys=path.join(root,'keys'),parent=path.join(root,'outputs');
 for(const d of [artifacts,keys,parent])fs.mkdirSync(d,{mode:0o700});
 const pair=crypto.generateKeyPairSync('ed25519'),pass=crypto.randomBytes(24).toString('base64'),key=path.join(keys,'synthetic-encrypted.pem');
 fs.writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:pass}),{mode:0o600});
 const now=Date.now(),records=[];
 const plan={schema:1,mode:'owner-release-batch-v1',tag:'v0.4.0-rc.19',build:19,product:'a'.repeat(40),documentserver:'b'.repeat(40),candidates:[]};
 for(const platform of ['win32','linux']){
  const payload=Buffer.from('synthetic final batch artifact '+platform+'\n'),version='0.4.0-rc.19';
  const c={schema:1,repository:wire.REPOSITORY,tag:'v'+version,version,build:19,sequence:42,channel:'prerelease',platform,arch:'x64',
   packageType:platform==='win32'?'nsis':'AppImage',issuedAt:now-1000,expiresAt:now+86400000,
   metadataName:platform==='win32'?'latest.yml':'latest-linux.yml',metadataSha512:'',
   artifact:{name:'ElixirOffice-'+version+(platform==='win32'?'-win-x64.exe':'-x86_64.AppImage'),size:payload.length,sha512:hash(payload,'sha512')}};
  const metadata=Buffer.from('version: '+version+'\nfiles:\n  - url: '+c.artifact.name+'\n    sha512: '+c.artifact.sha512+'\n    size: '+c.artifact.size+'\n');
  c.metadataSha512=hash(metadata,'sha512');
  fs.writeFileSync(path.join(artifacts,c.artifact.name),payload,{mode:0o600});fs.writeFileSync(path.join(artifacts,c.metadataName),metadata,{mode:0o600});
  const inventory={schema:1,product_revision:plan.product,documentserver_revision:plan.documentserver,context:c};
  const name=c.metadataName+'.candidate.json',bytes=Buffer.from(JSON.stringify(inventory)+'\n');fs.writeFileSync(path.join(artifacts,name),bytes,{mode:0o600});
  const entry={platform,inventory:name,seal:hash(bytes)};plan.candidates.push(entry);records.push({inventory,context:c,metadata,payload,entry});
 }
 const batch=path.join(root,'signing-batch.json'),opts={batch,seal:'',artifacts,key,keyId:'synthetic-batch',
  fingerprint:hash(pair.publicKey.export({type:'spki',format:'der'})),output:path.join(parent,'complete')};
 const f={root,artifacts,keys,parent,pair,pass,now,plan,opts,records,
  rewrite(){const b=Buffer.from(JSON.stringify(plan)+'\n');fs.writeFileSync(batch,b,{mode:0o600});opts.seal=hash(b);},
  rewriteInventory(index){const r=records[index],b=Buffer.from(JSON.stringify(r.inventory)+'\n');fs.writeFileSync(path.join(artifacts,r.entry.inventory),b,{mode:0o600});r.entry.seal=hash(b);f.rewrite();},
  clean(){fs.rmSync(root,{recursive:true,force:true});}
 };f.rewrite();return f;
}
async function using(run){const f=fixture();try{return await run(f);}finally{f.clean();}}
module.exports={fixture,using,hash};
