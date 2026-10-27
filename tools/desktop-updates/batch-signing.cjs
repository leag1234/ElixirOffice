// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Host-only composition: unchanged single signer and hidden-terminal protocol.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadCandidate,signCandidate,MAX_SECRET}=require('./signing.cjs');
const {decodeBatchPlan,MAX_BATCH}=require('./batch-plan.cjs');
const C=fs.constants,fields=['dev','ino','size','mtimeNs','ctimeNs','mode','nlink','uid'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function failure(uncertain=false){const e=Error(uncertain?'Batch committed; durability uncertain':'Batch signing refused');e.code=uncertain?'ERR_BATCH_COMMIT_UNCERTAIN':'ERR_BATCH_SIGNING';return e;}
function same(a,b){return fields.every(k=>a[k]===b[k]);}
function identity(a,b){return ['dev','ino','mode','uid'].every(k=>a[k]===b[k]);}
function full(value){if(typeof value!=='string'||!path.isAbsolute(value)||path.normalize(value)!==value||value.length>4096)throw failure();return value;}
function directory(file,privateMode=false){
 const s=fs.lstatSync(file,{bigint:true});
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==BigInt(process.geteuid())||fs.realpathSync(file)!==file||
  (privateMode?(s.mode&0o7777n)!==0o700n:!!(s.mode&0o022n)))throw failure();
 return s;
}
function snapshot(file){
 const s=fs.lstatSync(file,{bigint:true});
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.uid!==BigInt(process.geteuid())||(s.mode&0o022n)||fs.realpathSync(file)!==file)throw failure();
 return s;
}
function readPublic(file,max){
 const before=snapshot(file);if(before.size<1n||before.size>BigInt(max))throw failure();
 const fd=fs.openSync(file,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);
 try{
  if(!same(before,fs.fstatSync(fd,{bigint:true})))throw failure();
  const b=Buffer.alloc(Number(before.size)+1);let size=0;
  while(size<b.length){const n=fs.readSync(fd,b,size,b.length-size,null);if(!n)break;size+=n;}
  if(size!==Number(before.size)||!same(before,fs.fstatSync(fd,{bigint:true}))||!same(before,snapshot(file)))throw failure();
  return {bytes:b.subarray(0,size),stamp:before};
 }finally{fs.closeSync(fd);}
}
function publicDetails(candidate,opts){
 const c=candidate.context;
 return Object.freeze({artifact:Object.freeze({...c.artifact}),tag:c.tag,build:c.build,sequence:c.sequence,expiresAt:c.expiresAt,fingerprint:opts.fingerprint,
  expiryUTC:new Date(c.expiresAt).toISOString(),product_revision:candidate.product_revision,documentserver_revision:candidate.documentserver_revision,seal:candidate.seal,
  version:c.version,platform:c.platform,arch:c.arch,packageType:c.packageType,issuedAt:c.issuedAt,
  metadata:Object.freeze({name:c.metadataName,sha512:c.metadataSha512}),keyId:opts.keyId});
}
async function signBatch(input,{readSecret,approve,now=Date.now,io=fs,fault=async()=>{}}={}){
 let secret=null,parentFD,reservationFD,stageFD,anchor,targetName,stageName,stageStat,reservation,committed=false;
 const staged=[],expectedNames=new Set(),ownedFiles=new Map();
 try{
  if(process.platform!=='linux'||!input||typeof input!=='object'||Object.keys(input).sort().join(',')!=='artifacts,batch,fingerprint,key,keyId,output,seal'||
   typeof readSecret!=='function'||typeof approve!=='function'||typeof now!=='function'||typeof fault!=='function')throw failure();
  const o=Object.freeze({...input});
  for(const k of ['artifacts','batch','key','output'])full(o[k]);
  if(!/^[a-f0-9]{64}$/.test(o.seal)||!/^[a-f0-9]{64}$/.test(o.fingerprint)||typeof o.keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(o.keyId)||o.keyId.startsWith('eo-qa-'))throw failure();
  const planRecord=readPublic(o.batch,MAX_BATCH);if(hash(planRecord.bytes)!==o.seal)throw failure();
  const plan=decodeBatchPlan(planRecord.bytes),artifactStat=directory(o.artifacts),version=plan.tag.slice(1);
  const members=plan.candidates.map(entry=>{
   const args={inventory:path.join(o.artifacts,entry.inventory),seal:entry.seal,artifacts:o.artifacts,key:o.key,keyId:o.keyId,fingerprint:o.fingerprint,
    tag:plan.tag,build:plan.build,platform:entry.platform,product:plan.product,documentserver:plan.documentserver,output:o.output};
   const names=[args.inventory,path.join(o.artifacts,entry.platform==='win32'?'latest.yml':'latest-linux.yml'),
    path.join(o.artifacts,'ElixirOffice-'+version+(entry.platform==='win32'?'-win-x64.exe':'-x86_64.AppImage'))];
   const stamps=names.map(snapshot),candidate=loadCandidate(args,{now});
   if(names.some((n,i)=>!same(stamps[i],snapshot(n))))throw failure();
   const details=publicDetails(candidate,o);expectedNames.add(candidate.context.metadataName+'.sig.json');
   return {args,names,stamps,candidate,details};
  });
  const first=members[0].candidate.context;
  if(members.some(m=>['sequence','issuedAt','expiresAt','channel'].some(k=>m.candidate.context[k]!==first[k])))throw failure();
  function revalidate(){
   if(!identity(artifactStat,directory(o.artifacts))||!same(planRecord.stamp,snapshot(o.batch)))throw failure();
   const currentPlan=readPublic(o.batch,MAX_BATCH);if(!same(planRecord.stamp,currentPlan.stamp)||hash(currentPlan.bytes)!==o.seal)throw failure();
   for(const m of members){
    if(m.names.some((n,i)=>!same(m.stamps[i],snapshot(n))))throw failure();
    const fresh=loadCandidate(m.args,{now});
    if(JSON.stringify(publicDetails(fresh,o))!==JSON.stringify(m.details)||m.names.some((n,i)=>!same(m.stamps[i],snapshot(n))))throw failure();
   }
  }
  const parent=path.dirname(o.output),basename=path.basename(o.output);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(basename))throw failure();targetName=basename;
  const parentStat=directory(parent,true);parentFD=io.openSync(parent,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
  if(!identity(parentStat,fs.fstatSync(parentFD,{bigint:true})))throw failure();
  anchor='/proc/self/fd/'+parentFD;
  io.mkdirSync(path.join(anchor,basename),{mode:0o700});reservation=fs.lstatSync(path.join(anchor,basename),{bigint:true});
  reservationFD=io.openSync(path.join(anchor,basename),C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
  if(!identity(reservation,fs.fstatSync(reservationFD,{bigint:true})))throw failure();
  stageName='.sign-batch-'+crypto.randomBytes(16).toString('hex');
  io.mkdirSync(path.join(anchor,stageName),{mode:0o700});const stage=path.join(parent,stageName);stageStat=directory(stage,true);
  stageFD=io.openSync(path.join(anchor,stageName),C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
  if(!identity(stageStat,fs.fstatSync(stageFD,{bigint:true})))throw failure();
  const candidates=Object.freeze(members.map(m=>{
   const d=m.details;return Object.freeze({platform:d.platform,artifact:d.artifact,tag:d.tag,build:d.build,sequence:d.sequence,expiresAt:d.expiresAt,
    expiryUTC:d.expiryUTC,inventorySha256:d.seal,product_revision:d.product_revision,documentserver_revision:d.documentserver_revision,
    version:d.version,arch:d.arch,packageType:d.packageType,issuedAt:d.issuedAt,metadata:d.metadata});
  }));
  const details=Object.freeze({schema:1,planSha256:o.seal,candidates,keyId:o.keyId,fingerprint:o.fingerprint});
  const approvalSha256=hash(Buffer.from(JSON.stringify(details)));let approved=false,read=false;
  async function oneSecret(){
   if(!read){read=true;secret=await readSecret();if(!Buffer.isBuffer(secret)||secret.length<1||secret.length>MAX_SECRET||secret.includes(0)||secret.includes(10)||secret.includes(13))throw failure();}
   return Buffer.from(secret);
  }
  const results=[];
  for(let index=0;index<members.length;index++){
   revalidate();await fault('before-sign',{index});revalidate();const m=members[index];
   const result=await signCandidate({...m.args,output:stage},{now,writeIO:io,readSecret:oneSecret,async approve(value){
    if(JSON.stringify(value)!==JSON.stringify(m.details))throw failure();
    if(!approved){
     if(await approve(details)!==true)return false;approved=true;
     await fault('after-approval',{});revalidate();
    }
    revalidate();return true;
   }});
   if(index===members.length-1&&Buffer.isBuffer(secret))secret.fill(0);
   const actual=readPublic(path.join(stage,result.name),16384);
   if(actual.bytes.length!==result.bytes||hash(actual.bytes)!==result.sha256)throw failure();
   results.push(Object.freeze({...result}));ownedFiles.set(result.name,actual.stamp);staged.push({name:result.name,stamp:actual.stamp,sha256:result.sha256,bytes:result.bytes});
   await fault('after-sign',{index});revalidate();
  }
  const receipt=Buffer.from(JSON.stringify({schema:1,planSha256:o.seal,approvalSha256,keyId:o.keyId,fingerprint:o.fingerprint,files:results})+'\n');
  expectedNames.add('BATCH-RECEIPT.json');
  const receiptFile=path.join(stage,'BATCH-RECEIPT.json'),rfd=io.openSync(receiptFile,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);
  try{for(let at=0;at<receipt.length;){const n=io.writeSync(rfd,receipt,at,receipt.length-at,null);if(n<1)throw failure();at+=n;}io.fsyncSync(rfd);}
  finally{try{ownedFiles.set('BATCH-RECEIPT.json',fs.fstatSync(rfd,{bigint:true}));}finally{io.closeSync(rfd);}}
  const receiptRecord=readPublic(receiptFile,MAX_BATCH);if(!receiptRecord.bytes.equals(receipt))throw failure();
  staged.push({name:'BATCH-RECEIPT.json',stamp:receiptRecord.stamp,sha256:hash(receipt),bytes:receipt.length});
  io.fsyncSync(stageFD);
  await fault('before-publish',{});revalidate();
  if(!identity(parentStat,directory(parent,true))||!identity(parentStat,fs.fstatSync(parentFD,{bigint:true}))||
   !identity(stageStat,directory(stage,true))||!identity(stageStat,fs.fstatSync(stageFD,{bigint:true}))||
   !identity(reservation,fs.fstatSync(reservationFD,{bigint:true}))||!identity(reservation,directory(o.output,true))||fs.readdirSync(o.output).length!==0)throw failure();
  if(JSON.stringify(fs.readdirSync(stage).sort())!==JSON.stringify([...expectedNames].sort()))throw failure();
  for(const s of staged){const current=readPublic(path.join(stage,s.name),MAX_BATCH);if(!same(s.stamp,current.stamp)||current.bytes.length!==s.bytes||hash(current.bytes)!==s.sha256)throw failure();}
  // There is no await between final ownership checks and the atomic commit.
  io.renameSync(path.join(anchor,stageName),path.join(anchor,basename));committed=true;
  await fault('after-publish',{});io.fsyncSync(parentFD);
  return Object.freeze({directory:o.output,planSha256:o.seal,approvalSha256,files:Object.freeze(results),receiptSha256:hash(receipt)});
 }catch{throw failure(committed);}
 finally{
  if(Buffer.isBuffer(secret))secret.fill(0);
  if(anchor&&!committed){
   if(stageName&&stageStat)try{
    const stage=path.join(anchor,stageName),s=fs.lstatSync(stage,{bigint:true});
    if(identity(stageStat,s)){
     for(const [name,owned]of ownedFiles){
      const file=path.join(stage,name);let st;try{st=fs.lstatSync(file,{bigint:true});}catch{continue;}
      if(st.isFile()&&!st.isSymbolicLink()&&same(owned,st))io.unlinkSync(file);
     }
     io.rmdirSync(stage);
    }
   }catch{}
   if(reservation)try{const target=path.join(anchor,targetName),s=fs.lstatSync(target,{bigint:true});if(identity(reservation,s))io.rmdirSync(target);}catch{}
  }
  for(const fd of [stageFD,reservationFD,parentFD])if(fd!==undefined)try{io.closeSync(fd);}catch{}
 }
}
module.exports={signBatch};
