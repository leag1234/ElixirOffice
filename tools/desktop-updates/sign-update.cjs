#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs');
const {signCandidate}=require('./signing.cjs');
const {readPrivateFD,createTerminal}=require('./signing-terminal.cjs');
function parseArgs(args){
 const mapping={inventory:'inventory',seal:'seal',artifacts:'artifacts',key:'key','key-id':'keyId',fingerprint:'fingerprint',tag:'tag',build:'build',platform:'platform',product:'product',documentserver:'documentserver',output:'output','passphrase-fd':'passphraseFD'};
 const result={},seen=new Set();
 if(args.length>32||args.length%2)throw Error('Invalid signing arguments');
 for(let index=0;index<args.length;index+=2){
  const flag=args[index],value=args[index+1],name=mapping[flag.slice(2)];
  if(!flag.startsWith('--')||!Object.hasOwn(mapping,flag.slice(2))||seen.has(name)||typeof value!=='string'||!value||value.length>4096||value.startsWith('--'))throw Error('Invalid signing arguments');
  seen.add(name);
  if(name==='build'||name==='passphraseFD'){
   const number=Number(value);if(!Number.isSafeInteger(number)||String(number)!==value)throw Error('Invalid signing arguments');
   result[name]=number;
  }else result[name]=value;
 }
 for(const name of Object.values(mapping).filter(name=>name!=='passphraseFD'))if(!seen.has(name))throw Error('Missing signing argument');
 if(result.passphraseFD!==undefined&&(result.passphraseFD<3||result.passphraseFD>1024))throw Error('Invalid private descriptor');
 return Object.freeze(result);
}
async function main(args){
 if(args.length===1&&args[0]==='--help'){
  process.stdout.write('Owner-only sign-update (Linux; unshipped).\nRequired: --inventory FILE --seal SHA256 --artifacts DIR --key FILE --key-id ID --fingerprint SHA256 --tag TAG --build N --platform win32|linux --product REV --documentserver REV --output DIR\nOptional: --passphrase-fd N (private inherited FD >=3). Otherwise use a hidden controlling-TTY prompt. Approval always requires the controlling TTY. No argv/environment secret or --yes option.\n');return;
 }
 const options=parseArgs(args),terminal=createTerminal();
 try{
  const result=await signCandidate(options,{readSecret:async()=>options.passphraseFD===undefined?terminal.readSecret():readPrivateFD(options.passphraseFD),approve:details=>terminal.approve(details)});
  process.stdout.write('Signed '+result.name+' SHA256 '+result.sha256+'\n');
 }finally{
  terminal.close();
  if(options.passphraseFD!==undefined){try{fs.closeSync(options.passphraseFD);}catch{}}
 }
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{process.stderr.write('Signing refused.\n');process.exitCode=1;});
module.exports={parseArgs,main};
