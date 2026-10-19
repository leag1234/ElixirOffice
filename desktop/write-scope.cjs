// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
module.exports=function writeScope(){
 const active=new Set(),warnings=new Map();let stopping=false;
 return {
  start(options={}){
   const controller=new AbortController(),context={...options,signal:controller.signal};if(stopping)controller.abort();
   const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   let finish;const settled=new Promise(resolve=>{finish=resolve}),entry={controller,context,settled};active.add(entry);
   return {context,finish(error){
    if(error?.rollbackUncertain){
     const backupName=String(error.originalBackup||'').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
     if(backupName&&backupName.length<=255&&!/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(backupName)){
      const key=JSON.stringify([context.scope||null,context.id||null,backupName]);warnings.set(key,{key,backupName});
     }
    }
    options.signal?.removeEventListener('abort',abort);active.delete(entry);finish();
   }};
  },
  async cancel({scope,id,deadline=Date.now()+3000}={}){
   if(scope===undefined&&id===undefined)stopping=true;
   const selected=Array.from(active).filter(entry=>(scope===undefined||entry.context.scope===scope)&&(id===undefined||entry.context.id===id));
   for(const entry of selected){entry.context.deadline=deadline;entry.controller.abort();}
   await Promise.all(selected.map(entry=>entry.settled));return selected.length;
  },
  resume:()=>{stopping=false;},
  warnings:()=>Array.from(warnings.values(),warning=>({...warning})),
  acknowledge:key=>warnings.delete(key)
 };
};
