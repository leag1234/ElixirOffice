// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Dormant protected/public library seams. Disk hints are replaced, not parsed;
// only our signed cache receipt can authorize the eventual platform adapter.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createStore,same}=require('./update-store.cjs'),{assertLease}=require('./update-cache.cjs'),{compareVersions}=require('./release-notice.cjs'),{createNSISAdapter}=require('./update-installers.cjs');
function refused(){throw Error('Update library bridge refused');}
function createLibraryBridge({cache,provider,download,windowsSecurity}){
 if(typeof cache?.begin!=='function'||typeof provider?.candidateFor!=='function'||typeof download!=='function')refused();
 const attached=new WeakSet(),readyRecords=new WeakMap(),lifetime=new AbortController();let armed=null,disposed=false;
 function attach(updater,app){
  active();if(attached.has(updater)||app.baseCachePath!==cache.root||typeof updater.install!=='function')refused();
  attached.add(updater);
 }
 function active(signal=lifetime.signal){if(disposed||signal.aborted)refused();}
 async function copy(lease,store,name,signal){
  const held=await store.open(name,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL);
  try{
   for(let at=0;at<lease.size;){active(signal);const b=await lease.read(at,Math.min(1024*1024,lease.size-at));let wrote=0;
    while(wrote<b.length){const {bytesWritten}=await held.h.write(b,wrote,b.length-wrote,at+wrote);if(!bytesWritten)refused();wrote+=bytesWritten;}at+=b.length;}
   await held.h.sync();
  }finally{await held.h.close();}
  await store.syncDir();
 }
 async function verify(lease,c,store,name,signal){
  active(signal);
  const held=await store.open(name);
  try{
   if(held.stat.size!==c.artifact.size)refused();const hash=crypto.createHash('sha512'),b=Buffer.alloc(1024*1024);let at=0;
   while(at<held.stat.size){active(signal);const {bytesRead}=await held.h.read(b,0,Math.min(b.length,held.stat.size-at),at);if(!bytesRead)refused();hash.update(b.subarray(0,bytesRead));at+=bytesRead;}
   if(hash.digest('base64')!==c.artifact.sha512||!same(held.stat,await held.h.stat())||!same(held.stat,await store.owned(held.file)))refused();
   await lease.validate();active(signal);
  }finally{await held.h.close();}
 }
 async function perform({updater,options,candidate,execute}){
  active();if(!attached.has(updater)||provider.candidateFor(options.updateInfoAndProvider.info)!==candidate)refused();
  readyRecords.delete(updater);let lease;
  const cancellation=new AbortController(),token=options.cancellationToken,cancel=()=>cancellation.abort();
  token?.onCancel(cancel);const signal=AbortSignal.any([lifetime.signal,cancellation.signal]);
  try{
   active(signal);let receipt=await cache.restore({signal}).catch(()=>null);active(signal);
   if(receipt?.identity!==candidate.identity){
    const tx=await cache.begin(candidate,{signal});
    try{await download(candidate,tx.sink,{signal});active(signal);receipt=await tx.commit();}catch(e){await tx.abort();throw e;}
   }
   lease=await cache.acquire(receipt,{signal});
   const lib=createStore({root:path.join(cache.root,'library'),windowsSecurity});await lib.prepare();
   const pending=createStore({root:path.join(lib.root,'pending'),windowsSecurity});await pending.prepare();
   const older=await lease.retired(),stale=older&&compareVersions(older.version,candidate.version)<0?older:null;
   const names=await fs.promises.readdir(pending.root),allowed=new Set([candidate.artifact.name,'update-info.json',...(stale?[stale.artifact.name]:[])]);
   // Unknown files and links fail closed. No broad clear or JSON-supplied path
   // reaches the library, even across restart or its in-memory cache shortcut.
   if(names.some(n=>!allowed.has(n)))refused();
   if(stale&&names.includes(stale.artifact.name))await verify(lease,stale,pending,stale.artifact.name,signal);
   const previous=[];
   for(const n of names){const h=await pending.open(n);await h.h.close();previous.push([n,h.stat]);}
   for(const [n,s]of previous)await pending.removeOwned(n,s);
   const free=await fs.promises.statfs(pending.root);if(!Number.isFinite(free.bavail*free.bsize)||free.bavail*free.bsize<lease.size+1024*1024)refused();
   await copy(lease,pending,candidate.artifact.name,signal);await verify(lease,candidate,pending,candidate.artifact.name,signal);
   // Preseed only the fixed library bookkeeping shape, atomically and privately.
   // This avoids its default-permission JSON writer and unsafe restart hints.
   await pending.atomic('update-info.json',Buffer.from(JSON.stringify({fileName:candidate.artifact.name,sha512:candidate.artifact.sha512,isAdminRightsRequired:false})+'\n'));
   active(signal);const paths=await execute({fileExtension:lease.platform==='win32'?'exe':'AppImage',fileInfo:provider.resolveFiles(options.updateInfoAndProvider.info)[0],downloadUpdateOptions:options,
    task:async()=>refused()});
   const expected=pending.name(candidate.artifact.name);
   if(!Array.isArray(paths)||paths.length!==1||paths[0]!==expected)refused();
   await verify(lease,candidate,pending,candidate.artifact.name,signal);active(signal);
   readyRecords.set(updater,{receipt});return Object.freeze([expected]);
  }catch{readyRecords.delete(updater);refused();}finally{token?.removeListener('cancel',cancel);await lease?.release();}
 }
 function install({updater,options}){
  if(disposed||!armed||armed.updater!==updater||armed.used||options.isSilent!==armed.silent||options.isForceRunAfter!==armed.relaunch||options.isAdminRightsRequired!==false)return false;
  armed.used=true;return true;
 }
 function ready(updater){active();if(!attached.has(updater)||!readyRecords.has(updater))refused();return readyRecords.get(updater).receipt;}
 async function prepare(updater,{silent=false,relaunch=false,makeAdapter=createNSISAdapter}={}){
  if(typeof silent!=='boolean'||typeof relaunch!=='boolean'||typeof makeAdapter!=='function')refused();
  const receipt=ready(updater),lease=await cache.acquire(receipt,{signal:lifetime.signal});
  let attempted=false;
  try{
   const authorize=()=>{
    if(disposed||attempted||armed)return false;attempted=true;
    const transaction={updater,silent,relaunch,used:false};armed=transaction;
    try{return updater.install(silent,relaunch)===true&&transaction.used;}finally{armed=null;}
   };
   const adapter=makeAdapter({lease,silent,relaunch,authorize});
   const candidate=assertLease(lease,{platform:lease.platform,packageType:lease.packageType});let releasePromise;
   return Object.freeze({adapter,revalidate:()=>lease.validate(),release(){
    return releasePromise??=(async()=>{
     try{
      if(adapter.state==='acknowledged'){
       const lib=createStore({root:path.join(cache.root,'library'),windowsSecurity});await lib.prepare();
       const pending=createStore({root:path.join(lib.root,'pending'),windowsSecurity});await pending.prepare();
       const names=await fs.promises.readdir(pending.root);
       if(names.some(n=>n!==candidate.artifact.name&&n!=='update-info.json'))refused();
       if(names.includes(candidate.artifact.name)){
        await verify(lease,candidate,pending,candidate.artifact.name,lifetime.signal);
        const held=await pending.open(candidate.artifact.name);await held.h.close();await pending.removeOwned(candidate.artifact.name,held.stat);
       }
       if(names.includes('update-info.json')){const held=await pending.open('update-info.json');await held.h.close();await pending.removeOwned('update-info.json',held.stat);}
       await pending.syncDir();
      }
     }finally{await lease.release();}
    })();
   }});
  }catch{await lease.release();refused();}
 }
 return Object.freeze({attach,download:perform,install,ready,prepare,dispose(){disposed=true;lifetime.abort();}});
}
module.exports={createLibraryBridge};
