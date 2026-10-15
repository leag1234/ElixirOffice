// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),flags=require('node:fs').constants;
const reasons=new Set(['console-error','console-warn','recovery-failure','stdio-failure','uncaught-exception','unhandled-rejection','fatal-dialog-failure','capture-cleanup-failure','startup-failure','file-error','EISDIR','EEXIST','EIO','ENOTDIR','EINVAL','ELOOP','EMFILE','ENFILE','UNKNOWN']);
const pipeErrors=new Set(['EPIPE','ERR_STREAM_DESTROYED']);
function create(profile){
 let tail=Promise.resolve(),failed=false;
 function log(reason){
  if(!reasons.has(reason))return Promise.resolve();
  tail=tail.then(async()=>{
   const root=typeof profile==='function'?profile():profile;
   await fs.mkdir(root,{recursive:true});
   const file=await fs.open(path.join(root,'desktop-safety.log'),flags.O_WRONLY|flags.O_CREAT|flags.O_APPEND|flags.O_NOFOLLOW,0o600);
   try{await file.chmod(0o600);const line=Buffer.from(new Date().toISOString()+' '+reason+'\n');if((await file.stat()).size+line.length>65536)await file.truncate(0);await file.write(line);}finally{await file.close();}
  }).catch(()=>{});return tail;
 }
 function install(proc,target,onFatal){
  function fatal(reason){
   if(failed)return;failed=true;log(reason);
   try{Promise.resolve(onFatal(reason)).catch(()=>log('fatal-dialog-failure'));}catch(_error){log('fatal-dialog-failure');}
  }
  const streamError=error=>{if(!pipeErrors.has(error?.code))fatal('stdio-failure');};
  for(const stream of [proc.stdout,proc.stderr])stream?.on('error',streamError);
  const original={};for(const name of ['error','warn','assert','log','info','debug','trace','dir','dirxml','table','count','countReset','time','timeLog','timeEnd','group','groupCollapsed','groupEnd','clear']){
   original[name]=target[name];target[name]=()=>{if(name==='error'||name==='warn')log('console-'+name);};
  }
  const uncaught=()=>fatal('uncaught-exception'),rejection=()=>{void log('unhandled-rejection');};
  proc.on('uncaughtException',uncaught);proc.on('unhandledRejection',rejection);
  return ()=>{for(const stream of [proc.stdout,proc.stderr])stream?.removeListener('error',streamError);proc.removeListener('uncaughtException',uncaught);proc.removeListener('unhandledRejection',rejection);Object.assign(target,original);};
 }
 return {log,install,flush:()=>tail,get failed(){return failed;}};
}
module.exports={create,pipeErrors};
