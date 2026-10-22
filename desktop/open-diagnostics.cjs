// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path');
const stages=new Set(['window-create','view-create','renderer-ready','sdk-load','wasm-fetch','wasm-compile','wasm-instantiate','font-discovery','font-install','document-convert','first-paint']);
const outcomes=new Set(['ok','failed','skipped']);
const version=value=>typeof value==='string'&&/^[0-9][0-9a-zA-Z.+-]{0,63}$/.test(value)?value:'unknown';
const ms=value=>Number.isFinite(value)?Math.round(Math.max(0,Math.min(360000,value))*100)/100:0;
module.exports.create=function create(root,info={}){
 const header={diagnostic:'open-performance',app:'ElixirOffice',version:version(info.version),electron:version(info.electron),platform:['win32','linux','darwin'].includes(info.platform)?info.platform:'unknown'};
 const records=[];let pending=Promise.resolve();
 function text(){return JSON.stringify(header)+'\n'+records.map(value=>JSON.stringify(value)).join('\n')+(records.length?'\n':'')}
 function record(input={}){
  const event={trace:Number.isSafeInteger(input.trace)&&input.trace>=0&&input.trace<=1000000?input.trace:0,stage:stages.has(input.stage)?input.stage:'renderer-ready',durationMs:ms(input.durationMs),outcome:outcomes.has(input.outcome)?input.outcome:'failed'};
  records.push(event);if(records.length>256)records.shift();return Promise.resolve();
 }
 function flush(){
  pending=pending.then(async()=>{
   const filename=path.join(root(),'desktop-open-diagnostics.jsonl');let selected;
   try{selected=await fs.lstat(filename);if(!selected.isFile()||selected.isSymbolicLink())return}catch(error){if(error.code!=='ENOENT')return}
   await fs.mkdir(root(),{recursive:true});
   const handle=await fs.open(filename,constants.O_WRONLY|constants.O_CREAT|(constants.O_NOFOLLOW||0),0o600);
   try{
    const stat=await handle.stat(),named=await fs.lstat(filename);
    if(!stat.isFile()||named.isSymbolicLink()||stat.ino!==named.ino||stat.dev!==named.dev||selected&&(stat.ino!==selected.ino||stat.dev!==selected.dev))return;
    await handle.chmod(0o600);await handle.truncate(0);await handle.writeFile(text());
   }finally{await handle.close()}
  }).catch(()=>{});return pending;
 }
 return {record,flush,text};
};
