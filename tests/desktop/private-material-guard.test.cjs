// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {containsPrivateMaterial,privateMaterials,approvedPublishedVector}=require('./fixtures/private-material-guard.cjs');
test('private material guard rejects plaintext and encrypted private PEM without exposing contents',()=>{
 const pair=crypto.generateKeyPairSync('ed25519');
 for(const options of [{type:'pkcs8',format:'pem'},{type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:'ephemeral-test-only'}]){
  const value=pair.privateKey.export(options);
  assert.equal(containsPrivateMaterial(Buffer.from(value)),true);
  assert.equal(containsPrivateMaterial(Buffer.from(JSON.stringify({value}))),true);
 }
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:1024});
 assert.equal(containsPrivateMaterial(Buffer.from(rsa.privateKey.export({type:'pkcs1',format:'pem'}))),true);
 const ec=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 assert.equal(containsPrivateMaterial(Buffer.from(ec.privateKey.export({type:'sec1',format:'pem'}))),true);
});
test('private material guard rejects raw and encoded private DER, including encrypted PKCS8',()=>{
 const pair=crypto.generateKeyPairSync('ed25519');
 for(const options of [{type:'pkcs8',format:'der'},{type:'pkcs8',format:'der',cipher:'aes-256-cbc',passphrase:'ephemeral-test-only'}]){
  const der=pair.privateKey.export(options);
  for(const b of [der,Buffer.from("'"+der.toString('hex')+"'"),Buffer.from('"'+der.toString('base64')+'"')])assert.equal(containsPrivateMaterial(b),true);
 }
});
test('private material guard permits public keys, digests and framing documentation',()=>{
 const pair=crypto.generateKeyPairSync('ed25519');
 for(const value of [pair.publicKey.export({type:'spki',format:'pem'}),pair.publicKey.export({type:'spki',format:'der'}),crypto.randomBytes(32).toString('hex'),'BEGIN ENCRYPTED PRIVATE KEY','/^-----BEGIN ENCRYPTED PRIVATE KEY-----\\r?\\n[A-Za-z0-9+/=]+-----END ENCRYPTED PRIVATE KEY-----/'])
  assert.equal(containsPrivateMaterial(Buffer.from(value)),false);
});
test('private material guard rejects complete OpenSSH and alternate algorithm private framing',()=>{
 const text='-----BEGIN OPENSSH PRIVATE KEY-----\n'+Buffer.from('openssh-key-v1\0'+'x'.repeat(96)).toString('base64')+'\n-----END OPENSSH PRIVATE KEY-----\n';
 assert.equal(containsPrivateMaterial(Buffer.from(text)),true);
 for(const algorithm of ['DSA','RSA','EC','ENCRYPTED']){
  const framed=text.replaceAll('OPENSSH',algorithm);
  assert.equal(containsPrivateMaterial(Buffer.from(framed)),true);
 }
});
test('the entire Git source selection contains no private serialized key material',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 const root=path.resolve(__dirname,'../..');
 const names=cp.execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,maxBuffer:16*1024*1024}).toString().split('\0').filter(Boolean);
 const violations=[];let examined=0,publicVectors=0;
 for(const name of new Set(names)){
  assert(!path.isAbsolute(name)&&!name.split('/').includes('..'),'invalid Git selection path');
  let file=root,linked=false;
  for(const part of name.split('/')){file=path.join(file,part);if(fs.lstatSync(file).isSymbolicLink()){linked=true;break;}}
  if(linked)continue; // Never traverse repository links to private host files.
  if(!fs.lstatSync(file).isFile())continue; // Gitlinks are not file contents.
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
   const stat=fs.fstatSync(fd);assert(stat.isFile(),'source changed type');
   const bytes=fs.readFileSync(fd);
   examined++;
   for(const material of privateMaterials(bytes)){
    if(approvedPublishedVector(name,material))publicVectors++;else violations.push(name);
   }
  }finally{fs.closeSync(fd);}
 }
 // Paths only: never include key payload or crypto/parser error details.
 assert.deepEqual(violations,[],'serialized private key material in repository selection (paths only)');
 assert(examined>100,'nonempty complete Git source selection required');
 assert.equal(publicVectors,4,'exactly four pre-existing public RFC8032 fixture occurrences');
});

test('public-vector exception is exact bytes in exactly four fixture paths, never another private key',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'fixtures/update-test-kit.cjs'),'utf8');
 const vector=Buffer.from(source.match(/Buffer.from\('([a-f0-9]+)','hex'\)/)[1],'hex');
 const files=['tests/desktop/fixtures/update-test-kit.cjs','tests/desktop/signed-update-description.test.cjs','tests/desktop/signed-update.test.cjs','tests/desktop/update-policy.test.cjs'];
 const other=crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'der'});
 assert.equal(containsPrivateMaterial(vector),true);
 for(const file of files){
  assert.equal(approvedPublishedVector(file,vector),true);
  assert.equal(approvedPublishedVector(file,other),false);
  const changed=Buffer.from(vector);changed[changed.length-1]^=1;
  assert.equal(approvedPublishedVector(file,changed),false);
 }
 for(const file of ['desktop/update-policy.cjs','tests/desktop/new-vector.cjs','./'+files[0],'/'+files[0]])
  assert.equal(approvedPublishedVector(file,vector),false);
});
