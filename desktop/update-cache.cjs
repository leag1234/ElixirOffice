// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {createStore,failure,same,stamp}=require('./update-store.cjs');
const {readCandidate,createCandidate}=require('./update-candidate.cjs'),wire=require('./update-metadata.cjs'),{production}=require('./update-policy.cjs');
const receipts=new WeakMap(),leases=new WeakMap();
function createCache({root,policy=production,runtime,currentVersion,now=Date.now,windowsSecurity,io=fs.promises,
 availableBytes=async directory=>{const s=await fs.promises.statfs(directory);return s.bavail*s.bsize;}}={}){
 const target=Object.freeze({...runtime});if(!policy.capability(target).enabled)throw failure();
 const store=createStore({root,windowsSecurity,io}),owner=Object.freeze({});
 const data=c=>readCandidate(c,policy,{now:now(),runtime:target});
 const filename=c=>'payload-'+c.identity+(target.platform==='win32'?'.exe':'.AppImage');
 function active(signal){if(signal?.aborted||!policy.capability(target).enabled)throw failure();}
 async function state(){
  const bytes=await store.read('state.json',4096,{missing:true});if(!bytes)return null;
  let s;try{s=JSON.parse(bytes.toString('utf8'));}catch{throw failure();}
  if(!s||Object.keys(s).sort().join(',')!=='identity,payloadStat,replay,tag'||!/^[a-f0-9]{64}$/.test(s.identity)||typeof s.tag!=='string'||s.tag.length>100||s.replay?.identity!==s.identity)throw failure();
  return s;
 }
 // Historical signatures authorize deletion of exact stale owned bytes only.
 // This descriptor is never registered as an install candidate or receipt.
 function cleanupDescriptor(proof){
  if(!proof||Object.keys(proof).sort().join(',')!=='envelope,metadata,tag')throw failure();
  const decode=(value,max)=>{if(typeof value!=='string'||value.length>4*Math.ceil(max/3))throw failure();const b=Buffer.from(value,'base64');if(b.toString('base64')!==value)throw failure();return b;};
  const envelope=decode(proof.envelope,wire.MAX_ENVELOPE),metadata=decode(proof.metadata,wire.MAX_METADATA);
  const issuedAt=JSON.parse(envelope.toString('utf8')).context?.issuedAt;
  const verified=policy.verify({runtime:target,selectedTag:proof.tag,envelope,metadata,now:issuedAt});
  const description=wire.describeUpdate(verified);
  return Object.freeze({identity:verified.identity,version:verified.context.version,artifact:description.artifact});
 }
 async function retired(){
  const bytes=await store.read('retired-proof.json',200*1024,{missing:true});
  return bytes?cleanupDescriptor(JSON.parse(bytes.toString('utf8'))):null;
 }
 async function assess(c){const d=data(c),s=await state();const verdict=wire.assessCandidate(d.verified,{runningVersion:currentVersion,state:s?.replay??null});return {d,s,verdict};}
 async function checkFile(held,c,signal){
  active(signal);data(c);
  if(held.stat.size!==c.artifact.size)throw failure();
  const hash=crypto.createHash('sha512'),buf=Buffer.alloc(1024*1024);let offset=0;
  while(offset<held.stat.size){active(signal);const {bytesRead}=await held.h.read(buf,0,Math.min(buf.length,held.stat.size-offset),offset);if(!bytesRead)throw failure();hash.update(buf.subarray(0,bytesRead));offset+=bytesRead;}
  if(hash.digest('base64')!==c.artifact.sha512||!same(held.stat,await held.h.stat())||!same(held.stat,await store.owned(held.file)))throw failure();
  data(c);const checked=await assess(c);active(signal);
  if(checked.s?.identity===c.identity&&checked.verdict.next.checkedAt>checked.s.replay.checkedAt)
   await store.atomic('state.json',Buffer.from(JSON.stringify({...checked.s,replay:checked.verdict.next})+'\n'));
  active(signal);data(c);return true;
 }
 function receipt(c,snapshot){const r=Object.freeze({version:c.version,identity:c.identity});receipts.set(r,{owner,c,snapshot});return r;}
 async function begin(c,{signal}={}){
  data(c);active(signal);let unlock,held,completed=false,finished=false,written=0,aborted=false,writing=false,commitPromise=null,cleanupPromise=null;
  const temp='stage-'+crypto.randomBytes(16).toString('hex');
  function txActive(){active(signal);if(aborted)throw failure();}
  try{
   unlock=await store.lock();await assess(c);txActive();
   const available=await availableBytes(root);if(!Number.isFinite(available)||available<c.artifact.size+1024*1024)throw failure();
   held=await store.open(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL);
  }catch(e){await unlock?.().catch(()=>{});if(e.message==='Update candidate refused')throw e;throw failure();}
  function cleanup(){
   if(!cleanupPromise){completed=true;cleanupPromise=(async()=>{
    await held.h.close().catch(()=>{});await store.removeOwned(temp,held.stat).catch(()=>{});await unlock();
   })();}
   return cleanupPromise;
  }
  async function abort(){
   if(completed)return cleanupPromise;aborted=true;
   // Publication owns the lease until all its I/O has settled. Releasing it
   // early would let another job race a still-pending atomic promotion.
   if(commitPromise)await commitPromise.catch(()=>{});
   await cleanup();
  }
  const sink=Object.freeze({
   async write(bytes){
    txActive();if(completed||finished||writing||!Buffer.isBuffer(bytes)||written+bytes.length>c.artifact.size)throw failure();writing=true;
    try{let at=0;while(at<bytes.length){txActive();const result=await held.h.write(bytes,at,bytes.length-at,written+at);if(!result.bytesWritten)throw failure();at+=result.bytesWritten;}txActive();written+=bytes.length;}finally{writing=false;}
   },
   async finish(){txActive();if(completed||finished||writing||written!==c.artifact.size)throw failure();await held.h.sync();txActive();finished=true;},
   abort,
  });
  function commit(){
   if(commitPromise||completed)return Promise.reject(failure());
   commitPromise=(async()=>{
    try{
     txActive();if(!finished||writing)throw failure();await held.h.close();
     const input=await store.open(temp);
     try{await checkFile(input,c,signal);}finally{await input.h.close();}
     const {d,verdict,s:previous}=await assess(c);txActive();
     if(previous&&previous.identity!==c.identity){
      const proof={tag:previous.tag,envelope:(await store.read('envelope-'+previous.identity,wire.MAX_ENVELOPE)).toString('base64'),
       metadata:(await store.read('metadata-'+previous.identity,wire.MAX_METADATA)).toString('base64')};
      if(cleanupDescriptor(proof).identity!==previous.identity)throw failure();
      // Preserve authentication before promotion can retire the old generation.
      await store.atomic('retired-proof.json',Buffer.from(JSON.stringify(proof)+'\n'));txActive();
     }
     await store.atomic('envelope-'+c.identity,d.envelope);txActive();
     await store.atomic('metadata-'+c.identity,d.metadata);txActive();
     await store.promote(temp,filename(c));txActive();
     const snapshot=stamp(await store.owned(store.name(filename(c))));
     await store.atomic('state.json',Buffer.from(JSON.stringify({identity:c.identity,tag:c.tag,replay:verdict.next,payloadStat:snapshot})+'\n'));
     txActive();data(c);
     if(previous&&previous.identity!==c.identity){
      for(const n of ['payload-'+previous.identity+(target.platform==='win32'?'.exe':'.AppImage'),'envelope-'+previous.identity,'metadata-'+previous.identity]){txActive();await store.removeOwned(n);}
      await store.syncDir();
     }
     txActive();await cleanup();txActive();return receipt(c,snapshot);
    }catch{aborted=true;await cleanup().catch(()=>{});throw failure();}
   })();return commitPromise;
  }
  return Object.freeze({sink,abort,commit});
 }
 async function restore({signal}={}){
  active(signal);
  let unlock;
  try{
   unlock=await store.lock();const s=await state();if(!s)throw failure();
   const c=createCandidate({policy,runtime:target,selectedTag:s.tag,envelope:await store.read('envelope-'+s.identity,wire.MAX_ENVELOPE),metadata:await store.read('metadata-'+s.identity,wire.MAX_METADATA),now:now()});
   if(c.identity!==s.identity)throw failure();await assess(c);const held=await store.open(filename(c));
   try{if(!same(held.stat,s.payloadStat))throw failure();await checkFile(held,c,signal);}finally{await held.h.close();}
   return receipt(c,s.payloadStat);
  }catch{throw failure();}finally{await unlock?.();}
 }
 async function acquire(r,{signal}={}){
  const record=receipts.get(r);if(!record||record.owner!==owner)throw failure();data(record.c);active(signal);
  let unlock,held;
  try{
   unlock=await store.lock();await assess(record.c);held=await store.open(filename(record.c));
   if(!same(held.stat,record.snapshot))throw failure();await checkFile(held,record.c,signal);
   let released=false,releasePromise;
   const live=()=>{active(signal);if(released)throw failure();};
   const lease=Object.freeze({path:held.file,identity:record.c.identity,platform:target.platform,packageType:target.packageType,
    async validate(){live();return checkFile(held,record.c,signal);},
    async read(position,length){live();if(!Number.isSafeInteger(position)||position<0||!Number.isSafeInteger(length)||length<1||length>1024*1024||position+length>record.c.artifact.size)throw failure();const b=Buffer.alloc(length);const {bytesRead}=await held.h.read(b,0,length,position);if(bytesRead!==length)throw failure();return b;},
    get size(){return record.c.artifact.size;},
    async retired(){live();return retired();},
    release(){
     if(!releasePromise){released=true;releasePromise=(async()=>{let error;try{await held.h.close();}catch(e){error=e;}
      try{await unlock();}catch(e){error??=e;}if(error)throw error;})();}
     return releasePromise;
    },
   });
   leases.set(lease,{owner,c:record.c,store,live});return lease;
  }catch{await held?.h.close().catch(()=>{});await unlock?.().catch(()=>{});throw failure();}
 }
 return Object.freeze({root,begin,restore,acquire});
}
function assertLease(lease,{platform,packageType}){
 const record=leases.get(lease);if(!record||record.c===null||lease.platform!==platform||lease.packageType!==packageType)throw failure();record.live();return record.c;
}
module.exports={createCache,assertLease};
