#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),{signBatch}=require('./batch-signing.cjs'),{createTerminal,readPrivateFD}=require('./signing-terminal.cjs');
function parseArgs(args){
 const names={batch:'batch',seal:'seal',artifacts:'artifacts',key:'key','key-id':'keyId',fingerprint:'fingerprint',output:'output','passphrase-fd':'passphraseFD'},out={};
 if(!Array.isArray(args)||args.length<14||args.length>16||args.length%2)throw Error('Invalid batch arguments');
 for(let i=0;i<args.length;i+=2){
  const flag=args[i],value=args[i+1],raw=typeof flag==='string'&&flag.startsWith('--')?flag.slice(2):'',name=Object.hasOwn(names,raw)?names[raw]:null;
  if(!name||Object.hasOwn(out,name)||typeof value!=='string'||!value||value.length>4096||value.startsWith('--'))throw Error('Invalid batch arguments');
  if(name==='passphraseFD'){const n=Number(value);if(!Number.isSafeInteger(n)||String(n)!==value||n<3||n>1024)throw Error('Invalid private descriptor');out[name]=n;}else out[name]=value;
 }
 for(const name of Object.values(names).filter(n=>n!=='passphraseFD'))if(!Object.hasOwn(out,name))throw Error('Missing batch argument');
 return Object.freeze(out);
}
async function main(args){
 if(args.length===1&&args[0]==='--help'){
  process.stdout.write('Owner batch signer (Linux, unshipped).\nRequired: --batch FILE --seal SHA256 --artifacts DIR --key FILE --key-id ID --fingerprint SHA256 --output NEWDIR\nOptional: --passphrase-fd N (private inherited FD >=3). One hidden secret and whole-set controlling-TTY approval; no argv/environment secret or --yes option.\n');return;
 }
 const {passphraseFD,...opts}=parseArgs(args),terminal=createTerminal();let result;
 try{result=await signBatch(opts,{readSecret:async()=>passphraseFD===undefined?terminal.readSecret():readPrivateFD(passphraseFD),approve:details=>terminal.approve(details)});}
 finally{
  let cleanupFailed=false;try{terminal.close();}catch{cleanupFailed=true;}
  if(passphraseFD!==undefined)try{fs.closeSync(passphraseFD);}catch{cleanupFailed=true;}
  if(cleanupFailed&&result){const e=Error('Batch committed; cleanup uncertain');e.code='ERR_BATCH_COMMIT_UNCERTAIN';throw e;}
 }
 process.stdout.write('Signed batch '+result.planSha256+' '+result.files.length+' envelopes\n');
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{
 process.stderr.write(error?.code==='ERR_BATCH_COMMIT_UNCERTAIN'?'Batch committed; durability or cleanup uncertain. Inspect the complete bundle; do not retry automatically.\n':'Batch signing refused.\n');
 process.exitCode=error?.code==='ERR_BATCH_COMMIT_UNCERTAIN'?2:1;
});
module.exports={parseArgs,main};
