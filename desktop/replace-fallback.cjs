// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),path=require('node:path'),retryWindow=require('./windows-io.cjs'),constants=require('node:fs').constants;
const chunkBytes=1024*1024,limit=512*1024*1024;
const failed=message=>Object.assign(Error(message),{code:'EIO'});
const same=(stat,selected)=>stat.isFile()&&!stat.isSymbolicLink()&&stat.ino===selected.inode&&stat.dev===selected.device;
async function named(filename,selected,single=false){
 const stat=await fs.lstat(filename);
 if(!same(stat,selected)||single&&stat.nlink!==1)throw Error('Destination changed before or during fallback');
 return stat;
}
async function digest(handle){
 const before=await handle.stat();
 if(!before.isFile()||before.size>limit)throw failed('Invalid fallback file');
 const buffer=Buffer.alloc(Math.min(chunkBytes,Math.max(1,before.size))),hash=crypto.createHash('sha256');let position=0;
 while(position<before.size){
  const length=Math.min(buffer.length,before.size-position),{bytesRead}=await handle.read(buffer,0,length,position);
  if(!Number.isInteger(bytesRead)||bytesRead<=0||bytesRead>length)throw failed('Incomplete fallback verification');
  hash.update(buffer.subarray(0,bytesRead));position+=bytesRead;
 }
 const after=await handle.stat();
 if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('File changed during fallback verification');
 return {hash:hash.digest('hex'),size:position};
}
async function writeChunk(handle,bytes,position,guard){
 let offset=0;
 while(offset<bytes.length){
  await guard();
  const length=bytes.length-offset,{bytesWritten}=await handle.write(bytes,offset,length,position+offset);
  if(!Number.isInteger(bytesWritten)||bytesWritten<=0||bytesWritten>length)throw failed('Incomplete fallback write');
  offset+=bytesWritten;
 }
}
async function verify(handle,size,hash){
 const actual=await digest(handle);
 if(actual.size!==size||actual.hash!==hash)throw failed('Fallback verification failed');
}
// Last resort for a refused Windows rename. The durable backup is the recovery
// guarantee; this path cannot provide atomicity across a crash or failed rollback.
module.exports=async function replaceInPlace({target,temporary,bytes,original,backup,retained,outputHash,options={}}){
 let handle,source,modified=false;let originalSize;
 const targetState=async()=>{
  await named(target,original,true);
  const stat=await handle.stat();
  if(!same(stat,original)||stat.nlink!==1)throw Error('Unsafe fallback mutation target');
 };
 const writeState=async()=>{retryWindow.check(options);await targetState();};
 const backupState=async()=>{
  await named(backup,retained);
  if(!same(await source.stat(),retained))throw Error('Original backup changed during fallback');
  const actual=await digest(source);
  if(actual.hash!==original.hash)throw Error('Original backup changed during fallback');
  return actual.size;
 };
 try{
  retryWindow.check(options);
  await named(target,original,true);await named(backup,retained);
  source=await fs.open(backup,constants.O_RDONLY|(process.platform==='win32'?0:(constants.O_NOFOLLOW||0)));
  originalSize=await backupState();
  const staging=await fs.open(temporary,constants.O_RDONLY|(process.platform==='win32'?0:(constants.O_NOFOLLOW||0)));
  try{await verify(staging,bytes.length,outputHash)}finally{await staging.close()}
  handle=await fs.open(target,'r+');
  const selected=await handle.stat();
  if(!same(selected,original)||selected.nlink!==1)throw Error('Destination changed before fallback');
  await named(target,original,true);await verify(handle,originalSize,original.hash);await writeState();
  try{
   modified=true;
   for(let position=0;position<bytes.length;position+=chunkBytes)await writeChunk(handle,bytes.subarray(position,Math.min(bytes.length,position+chunkBytes)),position,writeState);
   await writeState();await handle.truncate(bytes.length);await handle.sync();
   await named(target,original,true);await verify(handle,bytes.length,outputHash);await named(target,original,true);
   await backupState();
  }catch(error){
   error.rollbackVerified=false;error.rollbackUncertain=false;error.originalBackup=backup;
   try{
    const size=await backupState(),buffer=Buffer.alloc(Math.min(chunkBytes,Math.max(1,size)));let position=0;
    await targetState();
    while(position<size){
     const length=Math.min(buffer.length,size-position),{bytesRead}=await source.read(buffer,0,length,position);
     if(!Number.isInteger(bytesRead)||bytesRead<=0||bytesRead>length)throw failed('Original backup could not be restored');
     await writeChunk(handle,buffer.subarray(0,bytesRead),position,targetState);position+=bytesRead;
    }
    await targetState();await handle.truncate(size);await handle.sync();await verify(handle,size,original.hash);await named(target,original,true);await backupState();
    error.rollbackVerified=true;
   }catch{
    error.rollbackUncertain=true;
    error.message='SAVE_RESTORE_UNCERTAIN:'+JSON.stringify(path.basename(backup));
   }
   throw error;
  }
 }catch(error){
  error.fallbackAttempted=true;
  if(modified)error.originalBackup=backup;
  throw error;
 }finally{
  if(handle)await handle.close().catch(()=>{});
  if(source)await source.close().catch(()=>{});
 }
};
