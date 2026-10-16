// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),files=require('./files.cjs');
module.exports=function settingsStore(folder){
 let pending=Promise.resolve();
 return {
  save(value){
   const bytes=Buffer.from(JSON.stringify(value,null,2));
   const write=pending.catch(()=>{}).then(async()=>{await fs.mkdir(folder,{recursive:true});await files.atomic(path.join(folder,'desktop-settings.json'),bytes)});
   // Callers observe their write failure; draining must not replay it forever.
   pending=write.catch(()=>{});return write;
  },
  flush(){return pending}
 };
};
