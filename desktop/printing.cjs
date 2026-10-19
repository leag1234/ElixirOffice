// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto');
const READY_TIMEOUT=60000,PRINT_TIMEOUT=600000,FALLBACK_DELAY=6000;
const PDF_VIEWER_ORIGIN='chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/';
function internalUrl(url){return url.startsWith(PDF_VIEWER_ORIGIN)||url.startsWith('chrome://resources/')||url==='about:blank';}
const readinessScript=`/* eo-print-readiness */
(()=>{const viewer=document.querySelector('pdf-viewer');
return viewer?{viewer:true,defined:typeof customElements.get('pdf-viewer')==='function',frameLoaded:document.readyState==='complete',recognized:['loadState_','loadProgress_','initialLoadComplete_','documentDimensions'].every(key=>key in viewer),state:viewer.loadState_,progress:viewer.loadProgress_,initial:viewer.initialLoadComplete_,
pages:viewer.documentDimensions?.pageDimensions?.length}:null})()`;
const fault=code=>Object.assign(Error(code),{code});
const cancelled=()=>Object.assign(Error('Print cancelled'),{name:'AbortError',code:'cancelled'});
function ready(value){return value?.recognized===true&&value?.state==='success'&&value.progress===100&&value.initial===true&&Number.isSafeInteger(value.pages)&&value.pages>0;}
function create({BrowserWindow,session,root,io=fs,readyTimeout=READY_TIMEOUT,printTimeout=PRINT_TIMEOUT,pollMs=50,fallbackDelay=FALLBACK_DELAY,log=()=>{},allowOffscreenRetry=false}){
 let busy=false,publicBusy=false,initialization;
 function note(code){try{Promise.resolve(log(code)).catch(()=>{});}catch{}}
 async function initialize(){
  if(!initialization)initialization=(async()=>{
   await io.mkdir(root,{recursive:true,mode:0o700});
   const info=await io.lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw fault('EOPRINT_CACHE');
   await io.chmod(root,0o700);
   // This namespace belongs to the locked application profile. Reap interrupted
   // jobs at startup; leave unrelated names untouched and never follow links.
   for(const name of await io.readdir(root))if(/^job-[A-Za-z0-9]{6}$/.test(name))
    await io.rm(path.join(root,name),{recursive:true,force:true,maxRetries:10,retryDelay:100});
  })().catch(error=>{initialization=null;throw error;});
  return initialization;
 }
 async function cleanup(){if(busy||publicBusy)throw fault('EOPRINT_BUSY');return initialize();}
 async function printOnce(bytes,{parent,signal,title='Print PDF'}={},contingency=false){
  if(busy)throw Object.assign(Error('A local operation is already running'),{code:'operation-busy'});
  if(!Buffer.isBuffer(bytes)||bytes.length>512*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw fault('EOPRINT_INPUT');
  if(signal?.aborted)return {printed:false,reason:'cancelled'};
  busy=true;let directory,helper,ses,nativeStarted=false,stopped=false,stopError,rejectStop,closing=false;
  const timers=new Set(),listeners=[],stop=new Promise((_,reject)=>{rejectStop=reject;});stop.catch(()=>{});
  function fail(error){if(stopped)return;stopped=true;stopError=error;rejectStop(error);}
  function check(){if(signal?.aborted)throw cancelled();if(stopped)throw stopError;}
  const onAbort=()=>fail(cancelled());signal?.addEventListener('abort',onAbort,{once:true});
  function listen(target,event,fn){target.on(event,fn);listeners.push([target,event,fn]);}
  function bounded(promise,ms,code){
   let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(fault(code)),ms);timers.add(timer);});
   return Promise.race([promise,stop,timeout]).finally(()=>{clearTimeout(timer);timers.delete(timer);});
  }
  try{
   await initialize();check();
   directory=await io.mkdtemp(path.join(root,'job-'));await io.chmod(directory,0o700);
   const file=path.join(directory,'document.pdf');
   await io.writeFile(file,bytes,{mode:0o600,flag:'wx',signal});check();
   const url=pathToFileURL(file).href;
   ses=session.fromPartition('eo-print-'+crypto.randomUUID(),{cache:false});
   ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
   ses.setDevicePermissionHandler?.(()=>false);
   ses.webRequest.onBeforeRequest((details,callback)=>{
    const own=details.url===url||details.url.startsWith(url+'#');
    const internal=internalUrl(details.url);
    callback({cancel:!own&&!internal});
   });
   helper=new BrowserWindow({show:contingency,...(contingency?{x:-32000,y:-32000,skipTaskbar:true}:{}),parent,width:900,height:800,title,webPreferences:{session:ses,
    sandbox:true,contextIsolation:true,nodeIntegration:false,plugins:true,backgroundThrottling:false}});
   helper.setMenuBarVisibility(false);
   if(contingency)helper.minimize();
   const contents=helper.webContents;
   contents.setWindowOpenHandler(()=>({action:'deny'}));
   listen(contents,'will-navigate',(event,next)=>{if(next!==url&&!next.startsWith(url+'#'))event.preventDefault();});
   listen(contents,'will-attach-webview',event=>event.preventDefault());
   listen(contents,'render-process-gone',()=>fail(fault('EOPRINT_RENDERER')));
   listen(helper,'unresponsive',()=>fail(fault('EOPRINT_RENDERER')));
   listen(helper,'closed',()=>{if(!closing)fail(cancelled());});
   if(parent)listen(parent,'closed',()=>fail(cancelled()));
   const waitForReady=(async()=>{
    await contents.loadURL(url);check();
    // loadURL resolves before Chromium's internal PDF frame is ready. Printing
    // then captures the viewer UI (or a blank page) with a false success callback.
    let unknownSince;
    for(;;){
     check();let unknownLoaded=false;
     for(const frame of contents.mainFrame.framesInSubtree){
      if(!frame.url.startsWith(PDF_VIEWER_ORIGIN))continue;
      let state;try{state=await frame.executeJavaScript(readinessScript);}catch{check();continue;}
      check();if(ready(state))return;
      if(state?.state==='failed')throw fault('EOPRINT_VIEWER');
      const incomplete=state?.state==='loading'||(typeof state?.progress==='number'&&state.progress<100)||state?.initial===false||(Number.isFinite(state?.pages)&&state.pages<1);
      if(state?.viewer===true&&state.defined===true&&state.frameLoaded===true&&state.recognized===false&&!incomplete)unknownLoaded=true;
     }
     // An Electron upgrade can rename private viewer fields. A loaded viewer
     // gets one bounded compatibility grace period; known loading/error states
     // never use it. The real-Electron contract test detects such upgrades in CI.
     if(unknownLoaded){unknownSince??=Date.now();if(Date.now()-unknownSince>=fallbackDelay){note('EOPRINT_READY_FALLBACK');return;}}
     else unknownSince=undefined;
     await new Promise(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve();},pollMs);timers.add(timer);});
    }
   })();
   await bounded(waitForReady,readyTimeout,'EOPRINT_READY_TIMEOUT');check();
   const result=await bounded(new Promise((resolve,reject)=>{
    try{nativeStarted=true;contents.print({silent:false,printBackground:true,margins:{marginType:'none'}},(printed,reason)=>{
     if(stopped)return;
     const userCancelled=/cancelled|canceled/i.test(reason||'');
     resolve({printed:printed===true,reason:printed?null:userCancelled?'cancelled':'EOPRINT_JOB'});
    });}catch{reject(fault('EOPRINT_JOB'));}
   }),printTimeout,'EOPRINT_CALLBACK_TIMEOUT');
   check();return result;
  }catch(error){
   if(error?.name==='AbortError'||signal?.aborted)return {printed:false,reason:'cancelled'};
   if(/^EOPRINT_[A-Z_]+$/.test(error?.code||'')){
    error.printRetryable=!nativeStarted&&['EOPRINT_RENDERER','EOPRINT_VIEWER','EOPRINT_READY_TIMEOUT','EOPRINT_FAILED'].includes(error.code);throw error;
   }
   const safe=fault(['EACCES','EPERM','ENOSPC'].includes(error?.code)?error.code:'EOPRINT_FAILED');safe.printRetryable=!nativeStarted&&safe.code==='EOPRINT_FAILED';throw safe;
  }finally{
   closing=true;stopped=true;
   signal?.removeEventListener('abort',onAbort);
   for(const timer of timers)clearTimeout(timer);
   let cleanupFailed=false;
   for(const [target,event,fn]of listeners)try{target.removeListener(event,fn);}catch{cleanupFailed=true;}
   try{if(helper&&!helper.isDestroyed())helper.destroy();}catch{cleanupFailed=true;}
   try{ses?.webRequest.onBeforeRequest(null);}catch{cleanupFailed=true;}
   // A native object or listener can fail during renderer teardown. Still
   // attempt private-file removal rather than leaving document bytes behind.
   try{if(directory)await io.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{cleanupFailed=true;}
   busy=false;
   if(cleanupFailed)throw fault('EOPRINT_CLEANUP');
  }
 }
 async function print(bytes,options={}){
  if(publicBusy)throw Object.assign(Error('A local operation is already running'),{code:'operation-busy'});
  publicBusy=true;
  try{
   let result;
   try{result=await printOnce(bytes,options);}
   catch(error){
    if(!allowOffscreenRetry||!error.printRetryable||options.signal?.aborted)throw error;
    note('EOPRINT_OFFSCREEN_RETRY');return await printOnce(bytes,options,true);
   }
   // An uncertain callback timeout, cleanup failure or user cancellation must
   // never create a duplicate print job. Only an explicitly failed submission
   // can take this opt-in diagnostic route.
   if(allowOffscreenRetry&&result.printed===false&&result.reason==='EOPRINT_JOB'&&!options.signal?.aborted){
    note('EOPRINT_OFFSCREEN_RETRY');return await printOnce(bytes,options,true);
   }
   return result;
  }finally{publicBusy=false;}
 }
 return {print,cleanup};
}
module.exports={create,ready,readinessScript,READY_TIMEOUT,PRINT_TIMEOUT,FALLBACK_DELAY,PDF_VIEWER_ORIGIN,internalUrl};
