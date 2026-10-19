// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path');
const steps=new Set(['parent-check','target-stat','target-fingerprint','temporary-open','temporary-write','temporary-mode','temporary-sync','temporary-stat','temporary-close','backup-copy','backup-open','backup-sync','backup-close','backup-fingerprint','replace','rename','target-stamp','backup-stamp','output-fingerprint','backup-cleanup','cleanup-target-check','cleanup-backup-check','failed-save-cleanup','fallback-stat','fallback-open','fallback-read','fallback-write','fallback-truncate','fallback-sync','fallback-close','save']);
const codes=new Set(['EPERM','EACCES','EBUSY','EIO','ENOSPC','ENOENT','EEXIST','EROFS','ENAMETOOLONG','EMFILE','ENFILE','ENOTSUP','UNKNOWN','cancelled']);
const version=value=>typeof value==='string'&&/^[0-9][0-9a-zA-Z.+-]{0,63}$/.test(value)?value:'unknown';
module.exports.create=function create(root,info={}){
 const header={app:'ElixirOffice',version:version(info.version),electron:version(info.electron),node:version(info.node),platform:['win32','linux','darwin'].includes(info.platform)?info.platform:'unknown',windowsBuild:info.platform==='win32'?version(info.windowsBuild):'not-windows'};
 const records=[];let pending=Promise.resolve();
 function record(input={}){
  const event={step:steps.has(input.step)?input.step:'save',code:codes.has(input.code)?input.code:'UNKNOWN',retries:Number.isInteger(input.retries)&&input.retries>=0&&input.retries<=1000?input.retries:0,outcome:['failure','deferred','success'].includes(input.outcome)?input.outcome:'failure'};
  records.push(event);if(records.length>128)records.shift();
  const text=JSON.stringify(header)+'\n'+records.map(x=>JSON.stringify(x)).join('\n')+'\n';
  pending=pending.then(async()=>{
   const filename=path.join(root(),'desktop-save-diagnostics.jsonl');
   let selected;try{selected=await fs.lstat(filename);if(!selected.isFile()||selected.isSymbolicLink())return;}catch(e){if(e.code!=='ENOENT')return;}
   const h=await fs.open(filename,constants.O_WRONLY|constants.O_CREAT|(constants.O_NOFOLLOW||0),0o600);
   try{
    const st=await h.stat(),named=await fs.lstat(filename);
    if(!st.isFile()||named.isSymbolicLink()||st.ino!==named.ino||st.dev!==named.dev||selected&&(st.ino!==selected.ino||st.dev!==selected.dev))return;
    await h.chmod(0o600);await h.truncate(0);await h.writeFile(text);
   }finally{await h.close()}
  }).catch(()=>{});return pending;
 }
 return {record,flush:()=>pending,text:()=>JSON.stringify(header)+'\n'+records.map(x=>JSON.stringify(x)).join('\n')+'\n'};
};
