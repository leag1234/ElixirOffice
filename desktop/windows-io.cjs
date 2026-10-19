// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {performance}=require('node:perf_hooks'),transient=new Set(['EPERM','EACCES','EBUSY']);
function check(options={}){
 if(options.signal?.aborted||Number.isFinite(options.deadline)&&Date.now()>=options.deadline)throw Object.assign(Error('Save cancelled'),{name:'AbortError',code:'cancelled'});
}
function pause(milliseconds,options){
 return new Promise((resolve,reject)=>{
  let timer;const finish=()=>{options.signal?.removeEventListener('abort',abort);resolve();};
  const abort=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);try{check({...options,signal:{aborted:true}})}catch(error){reject(error)}};
  options.signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(finish,milliseconds);if(options.signal?.aborted)abort();
 });
}
// One shared monotonic budget; check cancellation/deadline before each syscall.
module.exports=function retryWindow(platform=process.platform,milliseconds=3000,options={}){
 let deadline;
 return async function retry(run,cleanup=false){
  const active=cleanup?{}:options;
  let delay=25,lastError;
  for(;;){
   check(active);
   if(lastError&&performance.now()>=deadline){lastError.retryExpired=true;throw lastError;}
   try{return await run()}
   catch(error){
    if(platform!=='win32'||error.replacementCompleted||!transient.has(error.code))throw error;
    check(active);const now=performance.now();deadline??=now+milliseconds;lastError=error;
    const remaining=Number.isFinite(active.deadline)?active.deadline-Date.now():Infinity;
    const wait=Math.min(delay,deadline-now,remaining);
    if(wait<=0){check(active);error.retryExpired=true;throw error;}
    await pause(wait,active);delay=Math.min(delay*2,400);
   }
  }
 };
};
module.exports.check=check;
module.exports.saveBudget=function saveBudget(env=process.env){
 const value=env?.EO_WINDOWS_SAVE_RETRY_MS;
 return typeof value==='string'&&/^(0|[1-9][0-9]{0,4})$/.test(value)&&Number(value)<=15000?Number(value):5000;
};
