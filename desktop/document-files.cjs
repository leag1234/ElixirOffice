// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {validatePath}=require('./file-policy.cjs');
function conflict(){const error=Error('This file is open or selected for saving in another tab. Choose a different destination.');error.code='DOCUMENT_DESTINATION_OPEN';return error;}
// A conservative caseless key joins final sigma, sharp-S and canonical spellings.
// It reserves names only; filesystem identity and atomic write checks stay intact.
const nameKey=(filename,platform)=>['win32','darwin'].includes(platform)?['name:'+path.join(path.dirname(filename),path.basename(filename).normalize('NFC').toLowerCase().toUpperCase().normalize('NFC'))]:[];
async function identity(filename,{missing=false,platform=process.platform}={}){
 if(typeof filename!=='string'||!filename)throw Error('Choose a file from this computer');
 const target=validatePath(path.resolve(filename));
 let stat;
 try{stat=await fs.lstat(target,{bigint:true});}
 catch(error){
  if(error.code!=='ENOENT'||!missing)throw error;
  const parent=await fs.realpath(path.dirname(target));
  return {target,keys:[...new Set(['path:'+target,'path:'+path.join(parent,path.basename(target)),...nameKey(path.join(parent,path.basename(target)),platform)])],absent:true};
 }
 // Keep the same final-component policy as files.read; canonical paths are identity only.
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Choose a regular file');
 const canonical=await fs.realpath(target);
 const keys=[...new Set(['path:'+target,'path:'+canonical,...nameKey(canonical,platform)])];
 if(stat.ino!==0n)keys.push('inode:'+stat.dev+':'+stat.ino);
 return {target,keys,absent:false};
}
class DocumentFiles{
 #claims=new Map();#documents=new Map();#opens=new Map();#reservations=new Map();#uncertain=new Map();#now;#platform;
 constructor({now=Date.now,platform=process.platform}={}){this.#now=now;this.#platform=platform;}
 #identity(filename,options={}){return identity(filename,{...options,platform:this.#platform});}
 #lease(key){
  const lease=this.#reservations.get(key);
  if(lease&&lease.expires<=this.#now()){this.release(lease);return null;}
  return lease;
 }
 #assert(keys,documentId){
  for(const key of keys){
   const owner=this.#claims.get(key),lease=this.#lease(key);
   if(owner&&owner!==documentId||lease&&lease.documentId!==documentId)throw conflict();
  }
 }
 owner(file){
  const owners=new Set(file.keys.map(key=>this.#claims.get(key)).filter(Boolean));
  if(owners.size>1)throw conflict();
  return [...owners][0]||null;
 }
 claim(documentId,file){
  this.#assert(file.keys,documentId);
  const previous=this.#documents.get(documentId)||[];
  for(const key of previous)if(this.#claims.get(key)===documentId)this.#claims.delete(key);
  this.#uncertain.delete(documentId);
  this.#documents.set(documentId,file.keys.slice());
  for(const key of file.keys)this.#claims.set(key,documentId);
 }
 claimPending(documentId,file){
  this.claim(documentId,file);this.#uncertain.set(documentId,{target:file.target});
 }
 async #refreshPending(){
  for(const [documentId,pending] of [...this.#uncertain]){
   const file=await this.#identity(pending.target);
   if(this.#uncertain.get(documentId)===pending)this.claim(documentId,file);
  }
 }
 forget(documentId){
  this.#uncertain.delete(documentId);
  for(const key of this.#documents.get(documentId)||[])if(this.#claims.get(key)===documentId)this.#claims.delete(key);
  this.#documents.delete(documentId);
  for(const lease of new Set(this.#reservations.values()))if(lease.documentId===documentId)this.release(lease);
 }
 async open(filename,create){
  await this.#refreshPending();
  const file=await this.#identity(filename),owner=this.owner(file);
  if(owner)return {documentId:owner,existing:true};
  this.#assert(file.keys,null);
  const pending=file.keys.map(key=>this.#opens.get(key)).find(Boolean);
  if(pending)return {...await pending.promise,existing:true};
  // Reserve synchronously after identity resolution, before asynchronous document preparation.
  let resolve,reject;const entry={promise:new Promise((yes,no)=>{resolve=yes;reject=no;})};
  entry.promise.catch(()=>{});
  for(const key of file.keys)this.#opens.set(key,entry);
  try{
   const result=await create(file);
   this.claim(result.documentId,file);
   resolve(result);return {...result,existing:false};
  }catch(error){reject(error);throw error;}
  finally{for(const key of file.keys)if(this.#opens.get(key)===entry)this.#opens.delete(key);}
 }
 async reserve(documentId,filename){
  await this.#refreshPending();
  const file=await this.#identity(filename,{missing:true});this.#assert(file.keys,documentId);
  if(file.keys.some(key=>this.#opens.has(key)))throw conflict();
  const lease={id:randomUUID(),documentId,target:file.target,keys:file.keys,expires:this.#now()+10*60*1000};
  for(const key of lease.keys)this.#reservations.set(key,lease);
  return lease;
 }
 async validate(lease,{pin=false}={}){
  if(!lease||lease.expires<=this.#now()||lease.keys.some(key=>this.#reservations.get(key)!==lease))throw conflict();
  const file=await this.#identity(lease.target,{missing:true});
  if(lease.expires<=this.#now()||lease.keys.some(key=>this.#reservations.get(key)!==lease))throw conflict();
  this.#assert(file.keys,lease.documentId);
  if(file.keys.some(key=>this.#opens.has(key)))throw conflict();
  // A newly created hard link can expose additional aliases; hold them for this write too.
  for(const key of file.keys){this.#reservations.set(key,lease);if(!lease.keys.includes(key))lease.keys.push(key);}
  if(pin)lease.expires=Infinity;
  return file;
 }
 release(lease){
  if(!lease)return;
  for(const key of lease.keys)if(this.#reservations.get(key)===lease)this.#reservations.delete(key);
  lease.expires=0;
 }
}
module.exports={DocumentFiles,identity};
