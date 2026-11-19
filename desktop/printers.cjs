// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Printer list for the editors' print panel. The editors ask the host for it and show "Waiting for printers"
// until it answers, so this must always settle: an empty list when there is no printer or the print system
// (CUPS, spooler) is absent, unresponsive or fails.
const TIMEOUT=4000,MAX=200;
async function list(contents,{timeout=TIMEOUT}={}){
 let timer;
 try{
  const found=await Promise.race([
   Promise.resolve().then(()=>contents.getPrintersAsync()),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeout);})
  ]);
  const printers=(Array.isArray(found)?found:[]).filter(p=>p&&typeof p.name==='string'&&p.name&&p.name.length<=512).slice(0,MAX)
   .map(p=>({name:p.name,displayName:typeof p.displayName==='string'&&p.displayName?p.displayName:p.name,isDefault:p.isDefault===true}));
  return {status:'ok',printers};
 }catch(error){
  return {status:error?.message==='timeout'?'timeout':'error',printers:[]};
 }finally{clearTimeout(timer);}
}
module.exports={list,TIMEOUT};
