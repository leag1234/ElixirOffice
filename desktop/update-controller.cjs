// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Main-only coordination. No Electron, dependency loader, disk or network import.
const {parseVersion,compareVersions,validReleaseURL}=require('./release-notice.cjs'),{production}=require('./update-policy.cjs');
const {completeHandoff}=require('./update-handoff.cjs');
function failure(){return Error('Invalid update settings');}
function validateSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'enabled')||typeof value.enabled!=='boolean'||
  Object.keys(value).some(k=>!['enabled','automatic'].includes(k))||(Object.hasOwn(value,'automatic')&&typeof value.automatic!=='boolean'))throw failure();
 return Object.freeze({enabled:value.enabled,...(Object.hasOwn(value,'automatic')?{automatic:value.automatic}:{})});
}
function candidate(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','url'].includes(k)))return null;
 const version=parseVersion(value.version),url=validReleaseURL(value.url);
 if(!version||version.version!==value.version||!url||url!=='https://github.com/leag1234/elixiroffice/releases/tag/'+encodeURIComponent('v'+value.version))return null;
 return Object.freeze({version:value.version,url});
}
function createController({version,runtime,policy=production,eligible=async()=>false,createSession,initial={},persist=async()=>{},changed=()=>{},report=async()=>{},now=Date.now,timers={setTimeout,clearTimeout}}={}){
 if(!parseVersion(version)||typeof eligible!=='function'||typeof persist!=='function'||typeof report!=='function')throw failure();
 const target=Object.freeze({...runtime,checksEnabled:true}),qualified=policy.capability(target).enabled;
 let prefs={enabled:initial.enabled!==false,automatic:qualified&&initial.automatic===true},physical=false,eligibility=null;
 let current=null,epoch=0,job=null,ready=null,phase='idle',percent=null,error=null,disposed=false,manualArmed=false;
 let preferenceQueue=Promise.resolve(),preferenceRevision=0,exitFlight=null,exitAbort=null,lastProgress=0,acknowledgedInstall=null;
 const disposedSessions=new WeakSet();
 const active=(generation,signal)=>!disposed&&!acknowledgedInstall&&prefs.enabled&&epoch===generation&&!signal?.aborted;
 const options=()=>Object.freeze({enabled:prefs.enabled,automatic:prefs.automatic,installationAvailable:!disposed&&!acknowledgedInstall&&qualified&&physical});
 const state=()=>Object.freeze({...options(),version:current?.version??null,phase,percent,error,acknowledged:!!acknowledgedInstall});
 function notify(){try{Promise.resolve(changed(state())).catch(()=>{});}catch{}}
 function disposeSession(session){
  if(!session||disposedSessions.has(session))return;disposedSessions.add(session);
  try{Promise.resolve(session.dispose()).catch(()=>{});}catch{}
 }
 function invalidate(){
  epoch++;manualArmed=false;exitAbort?.abort();
  if(job){job.abort.abort();disposeSession(job.session);}
  disposeSession(ready?.session);ready=null;phase=current?'available':'idle';percent=null;error=null;
  return job?.promise.catch(()=>{});
 }
 async function available(){
  if(disposed||acknowledgedInstall||!qualified)return false;
  if(!eligibility)eligibility=Promise.resolve().then(()=>eligible(target)).then(value=>{physical=value===true&&!disposed;return physical;},()=>false);
  return eligibility;
 }
 function decorate(value){
  const base=candidate(value);if(!base)return null;
  if(disposed||acknowledgedInstall||!prefs.enabled||!qualified||!physical||base.version!==current?.version||base.url!==current?.url)return {...base};
  return {...base,install:Object.freeze({phase,percent,error})};
 }
 function progress(record,value){
  if(!active(record.epoch,record.abort.signal)||job!==record||!value||typeof value!=='object')return;
  const {downloaded,total}=value;
  if(!Number.isSafeInteger(downloaded)||!Number.isSafeInteger(total)||downloaded<0||total<1||total>2**31||downloaded>total)return;
  percent=Math.floor(downloaded*100/total);
  if(now()-lastProgress>=100||downloaded===total){lastProgress=now();notify();}
 }
 async function prepare(source){
  if(disposed||!prefs.enabled||!current||!await available())return false;
  const generation=epoch,selected=current;
  if(job){
   if(job.epoch===generation&&!job.abort.signal.aborted)return job.promise;
   await job.promise.catch(()=>{});
   if(!active(generation)||current!==selected)return false;
  }
  if(ready?.epoch===generation)return true;
  if(typeof createSession!=='function')return false;
  const record={epoch:generation,candidate:selected,source,abort:new AbortController(),session:null,promise:null};
  job=record;phase='preparing';percent=null;error=null;notify();
  record.promise=Promise.resolve().then(async()=>{
   try{
    if(!active(generation,record.abort.signal))return false;
    record.session=await createSession({runtime:target,policy,signal:record.abort.signal});
    if(!active(generation,record.abort.signal)){disposeSession(record.session);return false;}
    const receipt=await record.session.prepare(selected,{signal:record.abort.signal,progress:value=>progress(record,value)});
    if(!active(generation,record.abort.signal)){disposeSession(record.session);return false;}
    ready={receipt,session:record.session,epoch:generation,source};phase='ready';percent=100;error=null;notify();return true;
   }catch{
    disposeSession(record.session);
    if(active(generation,record.abort.signal)){phase='error';error='prepare';percent=null;notify();}
    return false;
   }finally{if(job===record)job=null;}
  });
  return record.promise;
 }
 function background(){
  if(prefs.enabled&&prefs.automatic&&current&&!disposed)void prepare('automatic');
 }
 async function offer(value){
  if(disposed||acknowledgedInstall)return state();let next=candidate(value);
  if(next&&compareVersions(next.version,version)<=0)next=null;
  if(next?.version===current?.version&&next?.url===current?.url)return state();
  current=next;invalidate();await available();
  if(disposed)return state();notify();background();return state();
 }
 function configure(value){
  const input=validateSettings(value),revision=++preferenceRevision;
  if(!input.enabled){prefs.enabled=false;invalidate();notify();}
  else if(input.automatic===false){prefs.automatic=false;if(job?.source==='automatic'||ready?.source==='automatic')invalidate();notify();}
  const task=preferenceQueue.catch(()=>{}).then(async()=>{
   if(disposed)throw failure();
   const next={enabled:input.enabled,automatic:input.automatic??prefs.automatic};
   if(next.automatic&&!await available())throw failure();
   await persist(Object.freeze({...next}));
   if(disposed||revision!==preferenceRevision)return options();
   prefs=next;if(!prefs.enabled)invalidate();notify();background();return options();
  });
  preferenceQueue=task.catch(()=>{});return task;
 }
 async function request(expectedVersion){
  const refused=Object.freeze({accepted:false,exitRequested:false});
  if(disposed||!prefs.enabled||typeof expectedVersion!=='string'||expectedVersion!==current?.version||!await available())return refused;
  if(expectedVersion!==current?.version||disposed||!prefs.enabled)return refused;
  if(phase==='ready'&&ready?.epoch===epoch){manualArmed=true;return Object.freeze({accepted:true,exitRequested:true});}
  const accepted=await prepare('manual');
  // Completion never confers exit intent. Only a fresh click on ready does.
  return Object.freeze({accepted,exitRequested:false});
 }
 async function drain(pending){
  if(!pending)return;
  let timer;try{await Promise.race([pending,new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('Update cancellation did not settle')),3000);})]);}
  finally{timers.clearTimeout(timer);}
 }
 function exit({reason='unknown',barrier,quit,restore}){
  if(![barrier,quit,restore].every(f=>typeof f==='function'))throw failure();
  if(exitFlight)return exitFlight;
  exitFlight=Promise.resolve().then(async()=>{
   const selected=ready,generation=epoch,requested=manualArmed;
   const installing=reason==='user'&&!disposed&&!acknowledgedInstall&&prefs.enabled&&qualified&&physical&&selected?.epoch===generation&&(manualArmed||prefs.automatic);
   manualArmed=false;let prepared=null,releasePromise=null,cleanupFailed=false;
   function release(){
    if(!prepared)return Promise.resolve();
    if(!releasePromise)releasePromise=Promise.resolve().then(()=>prepared.release()).catch(async error=>{
     cleanupFailed=true;
     if(acknowledgedInstall)try{await report('update-lease-release-failure');}catch{}
     throw error;
    });
    return releasePromise;
   }
   function handoffFailed(){
    if(acknowledgedInstall){ready=null;phase='acknowledged';error=cleanupFailed?'cleanup':'handoff';percent=null;}
    else{invalidate();phase=current?'error':'idle';error='install';}
    notify();
   }
   if(!installing){
    try{await drain(invalidate());if(await barrier({installing:false})!==true)throw failure();await quit();return true;}
    catch{try{await restore();}catch{}return false;}
   }
   exitAbort=new AbortController();phase='installing';notify();
   try{
    prepared=await selected.session.install(selected.receipt,{automatic:!requested&&prefs.automatic});
    const result=await completeHandoff({adapter:prepared.adapter,signal:exitAbort.signal,
     barrier:async()=>await barrier({installing:true})===true&&active(generation),
     revalidate:async()=>active(generation)&&ready===selected&&await prepared.revalidate()===true,
     acknowledged:async()=>{
      acknowledgedInstall=Object.freeze({version:current?.version??null});
      phase='acknowledged';percent=100;error=null;notify();
      try{await report('update-install-acknowledged');}catch{}
     },
     release,quit,restore});
    if(!result)handoffFailed();
    return result;
   }catch{
    handoffFailed();try{await restore();}catch{}return false;
   }finally{try{await release();}catch{}exitAbort=null;}
  }).finally(()=>{exitFlight=null;});
  return exitFlight;
 }
 return Object.freeze({options,state,decorate,offer,configure,request,exit,
  cancel(){const pending=invalidate();notify();return pending||Promise.resolve();},
  dispose(){if(disposed)return;disposed=true;invalidate();current=null;phase='idle';}});
}
module.exports={createController,validateSettings};
