// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),limits=require('./font-limits.cjs');
const retryWindow=require('./windows-io.cjs');
const MAX_BYTES=32*1024*1024;
function plain(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function text(value){return typeof value==='string'&&value.length>0&&value.length<=2048;}
function validRecord(record){
 if(!plain(record)||typeof record.signature!=='string'||record.signature.split(':').length!==4||
    !record.signature.split(':').every(value=>value!==''&&Number.isFinite(Number(value)))||
    typeof record.sha256!=='string'||!/^[a-f0-9]{64}$/.test(record.sha256)||!Number.isSafeInteger(record.bytes)||record.bytes<=0||
    record.bytes>limits.fileBytes||Number(record.signature.split(':')[0])!==record.bytes||!Array.isArray(record.faces)||record.faces.length>262208)return false;
 return record.faces.every(face=>{
  if(!plain(face)||!['family','style','fullName','postscriptName'].every(key=>text(face[key]))||
     !Number.isSafeInteger(face.faceIndex)||face.faceIndex<0||face.faceIndex>0x7fffffff||(face.faceIndex&65535)>=64||(face.faceIndex>>>16)>4096||
     typeof face.variable!=='boolean'||!Number.isSafeInteger(face.embedding)||face.embedding<0||face.embedding>65535||
     face.instanceDefault!==undefined&&typeof face.instanceDefault!=='boolean'||
     face.id!==undefined&&(typeof face.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(face.id))||
     !Array.isArray(face.coverage)||face.coverage.length>200000)return false;
  let previous=-1;
  return face.coverage.every(range=>{
   if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||
      range[0]<0||range[0]>range[1]||range[1]>0x10ffff||range[0]<=previous)return false;
   previous=range[1];return true;
  });
 });
}
async function load(file,identity){
 const retry=retryWindow(undefined,1000);
 try{return await retry(async()=>{
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES)return null;
  const handle=await fs.open(file,require('node:fs').constants.O_RDONLY|require('node:fs').constants.O_NOFOLLOW);
  let bytes;
  try{
   const before=await handle.stat(),signature=value=>[value.size,value.mtimeMs,value.ctimeMs,value.ino].join(':');
   if(!before.isFile()||before.size>MAX_BYTES||signature(before)!==signature(st))return null;
   bytes=Buffer.alloc(before.size);let position=0;
   while(position<bytes.length){
    const {bytesRead}=await handle.read(bytes,position,Math.min(1024*1024,bytes.length-position),position);
    if(!bytesRead)break;position+=bytesRead;
   }
   if(position!==bytes.length||signature(await handle.stat())!==signature(before))return null;
  }finally{await handle.close();}
  const value=JSON.parse(bytes.toString('utf8'));
  if(!plain(value)||value.version!==3||value.bundleIdentity!==identity||!plain(value.records)||
     value.complete!==undefined&&typeof value.complete!=='boolean')return null;
  if(!Object.entries(value.records).every(([key,record])=>/^(system|bundled):/.test(key)&&validRecord(record)))return null;
  return value;
 })}catch(error){
  if(['ENOENT','EACCES','EPERM','EBUSY','ELOOP'].includes(error.code)||error instanceof SyntaxError)return null;
  // Malformed optional cache data is never authoritative.
  if(error instanceof TypeError||error instanceof RangeError)return null;
  throw error;
 }
}
async function save(file,value){
 const serialized=JSON.stringify(value);
 if(Buffer.byteLength(serialized)>MAX_BYTES)throw Error('Computer font metadata exceeds 32 MiB limit');
 const retry=retryWindow(undefined,1000),temporaries=[];let temporary;
 try{
  const handle=await retry(async()=>{
   temporary=file+'.'+crypto.randomUUID()+'.tmp';temporaries.push(temporary);
   return fs.open(temporary,'wx',0o600);
  });
  let staged;
  try{await handle.writeFile(serialized);await handle.sync();staged=await handle.stat();}finally{await handle.close();}
  await retry(async()=>{
   try{await fs.rename(temporary,file)}
   catch(error){
    const installed=await fs.lstat(file).catch(()=>null);
    if(installed?.isFile()&&!installed.isSymbolicLink()&&installed.ino===staged.ino&&installed.dev===staged.dev&&await fs.readFile(file,'utf8')===serialized)return;
    throw error;
   }
  });
 }finally{for(const filename of temporaries)await fs.rm(filename,{force:true});}
}
module.exports={load,save,validRecord,MAX_BYTES};
