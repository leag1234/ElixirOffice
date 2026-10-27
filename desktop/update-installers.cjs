// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {assertLease}=require('./update-cache.cjs'),{createAdapter}=require('./update-handoff.cjs'),{same,stamp,verifyLinuxParents}=require('./update-store.cjs');
const startupRecords=new WeakMap(),C=fs.constants;
function refused(){throw Error('Update installer refused');}
function safeEnvironment(source){
 const result={};for(const key of ['SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'])
  if(typeof source[key]==='string'&&source[key].length<32768&&!source[key].includes('\0'))result[key]=source[key];
 return result;
}
function createNSISAdapter({lease,platform=process.platform,silent=false,relaunch=false,spawn=cp.spawn,environment=process.env,timers,authorize=()=>true}){
 const c=assertLease(lease,{platform:'win32',packageType:'nsis'});
 if(platform!=='win32'||typeof silent!=='boolean'||typeof relaunch!=='boolean'||!path.isAbsolute(lease.path)||!lease.path.endsWith('.exe'))refused();
 const args=Object.freeze(['--updated',...(silent?['/S']:[]),...(relaunch?['--force-run']:[])]);
 let adapter;
 adapter=createAdapter({timers,launch(callbacks){
  if(authorize()!==true)return false;
  void(async()=>{
   try{
    await lease.validate();
    const header=await lease.read(0,Math.min(c.artifact.size,2));if(header.toString()!=='MZ')refused();
    await lease.validate();assertLease(lease,{platform:'win32',packageType:'nsis'});if(adapter.state!=='installing')refused();
    const child=spawn(lease.path,[...args],{shell:false,detached:true,stdio:'ignore',windowsHide:false,env:safeEnvironment(environment)});
    child.once('error',callbacks.failure);child.once('spawn',()=>{if(adapter.state!=='installing')return;child.unref();callbacks.success();});
   }catch{callbacks.failure();}
  })();return true;
 }});
 return adapter;
}
function imageHeader(bytes){
 return bytes.length>=64&&bytes.subarray(0,4).equals(Buffer.from([127,69,76,70]))&&bytes[4]===2&&bytes[5]===1&&bytes[6]===1&&
  bytes.subarray(8,11).equals(Buffer.from([65,73,2]))&&bytes.readUInt16LE(18)===62;
}
async function captureAppImage({file,platform=process.platform,io=fs.promises}){
 if(platform!=='linux'||typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||path.basename(file).length>140)refused();
 const parent=path.dirname(file);await verifyLinuxParents(parent,io);
 if(await io.realpath(parent)!==parent)refused();
 const parentStat=await io.lstat(parent),s=await io.lstat(file),uid=process.getuid?.();
 if(!parentStat.isDirectory()||parentStat.uid!==uid||(parentStat.mode&0o022)||!s.isFile()||s.isSymbolicLink()||s.uid!==uid||s.nlink!==1||
  (s.mode&0o7022)||(s.mode&0o100)===0||(s.size<64||s.size>2**31))refused();
 await io.access(parent,C.W_OK);await io.access(file,C.W_OK);
 const h=await io.open(file,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);
 try{const b=Buffer.alloc(64);await h.read(b,0,64,0);if(!imageHeader(b)||!same(s,await h.stat()))refused();}finally{await h.close();}
 const lockPath=path.join(parent,'.eo-update-'+crypto.createHash('sha256').update(path.basename(file)).digest('hex').slice(0,32)+'.lease');
 const startup=Object.freeze({path:file,lockPath});
 startupRecords.set(startup,{file,parent,parentStat:stamp(parentStat),stat:stamp(s),lockPath});return startup;
}
function createAppImageAdapter({lease,startup,platform=process.platform,io=fs.promises,fault=async()=>{},timers,authorize=()=>true}){
 const c=assertLease(lease,{platform:'linux',packageType:'AppImage'}),record=startupRecords.get(startup);
 if(platform!=='linux'||!record)refused();
 let adapter;
 adapter=createAdapter({timers,launch(callbacks){
  if(authorize()!==true)return false;
  void run(callbacks).catch(callbacks.failure);return true;
 }});
 function live(){if(adapter.state!=='installing')refused();}
 async function target(){
  live();await verifyLinuxParents(record.parent,io);if(await io.realpath(record.parent)!==record.parent)refused();
  const parent=await io.lstat(record.parent),s=await io.lstat(record.file);
  if(parent.ino!==record.parentStat.ino||parent.dev!==record.parentStat.dev||parent.uid!==record.parentStat.uid||(parent.mode&0o022)||!same(s,record.stat))refused();
 }
 async function syncDirectory(){const h=await io.open(record.parent,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
 async function run(callbacks){
  const token=crypto.randomBytes(16).toString('hex'),sibling=path.join(record.parent,'.'+path.basename(record.file)+'.eo-stage-'+token),
   backup=path.join(record.parent,'.'+path.basename(record.file)+'.eo-backup-'+token);
  let lock=null,old=null,newFile=null,backupFile=null,committed=false,backupCreated=false,ok=false,clean=true;
  async function exclusive(file){return io.open(file,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);}
  async function writeAll(h,b,at){let n=0;while(n<b.length){live();const {bytesWritten}=await h.write(b,n,b.length-n,at+n);if(!bytesWritten)refused();n+=bytesWritten;}}
  async function remove(file,h){if(!h)return;const held=await h.stat().catch(()=>null);await h.close().catch(()=>{});
   const s=await io.lstat(file).catch(()=>null);if(held&&s&&s.dev===held.dev&&s.ino===held.ino&&!s.isSymbolicLink()&&s.nlink===1)await io.unlink(file);}
  try{
   await target();await lease.validate();live();lock=await exclusive(record.lockPath);await lock.sync();
   const free=await io.statfs(record.parent);if(!Number.isFinite(free.bavail*free.bsize)||free.bavail*free.bsize<c.artifact.size+record.stat.size+1024*1024)refused();
   old=await io.open(record.file,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);if(!same(await old.stat(),record.stat))refused();
   newFile=await exclusive(sibling);const hash=crypto.createHash('sha512');
   for(let at=0;at<lease.size;){live();await fault('copy-new');const b=await lease.read(at,Math.min(1024*1024,lease.size-at));hash.update(b);await writeAll(newFile,b,at);at+=b.length;}
   if(hash.digest('base64')!==c.artifact.sha512)refused();
   const header=await lease.read(0,Math.min(64,lease.size));if(!imageHeader(header))refused();
   await fault('sync-new');await newFile.sync();live();
   backupFile=await exclusive(backup);backupCreated=true;
   const buf=Buffer.alloc(1024*1024);
   for(let at=0;at<record.stat.size;){live();await fault('copy-backup');const {bytesRead}=await old.read(buf,0,Math.min(buf.length,record.stat.size-at),at);if(!bytesRead)refused();await writeAll(backupFile,buf.subarray(0,bytesRead),at);at+=bytesRead;}
   if(!same(await old.stat(),record.stat))refused();
   await fault('sync-backup');await backupFile.sync();await syncDirectory();
   await fault('before-rename');await lease.validate();await target();live();
   // Verify the actual replacement copy, independently of the download handle.
   const verify=await io.open(sibling,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);
   try{
    const s=await verify.stat();if(s.size!==c.artifact.size||s.nlink!==1||s.uid!==record.stat.uid)refused();
    const copied=crypto.createHash('sha512');let at=0;
    while(at<s.size){live();const {bytesRead}=await verify.read(buf,0,Math.min(buf.length,s.size-at),at);if(!bytesRead)refused();copied.update(buf.subarray(0,bytesRead));at+=bytesRead;}
    if(copied.digest('base64')!==c.artifact.sha512||!same(s,await verify.stat())||!same(s,await io.lstat(sibling)))refused();
   }finally{await verify.close();}
   await newFile.chmod(record.stat.mode&0o777);await newFile.sync();
   await lease.validate();await target();live();await fault('rename');live();assertLease(lease,{platform:'linux',packageType:'AppImage'});
   // Same-directory replacement is atomic; the running image is never unlinked.
   await io.rename(sibling,record.file);committed=true;
   await fault('sync-commit');await syncDirectory();live();ok=true;
  }catch{ok=false;}
  finally{
   await old?.close().catch(()=>{clean=false;});
   if(committed)await newFile?.close().catch(()=>{clean=false;});else await remove(sibling,newFile).catch(()=>{clean=false;});
   // Retain the fsynced backup after commit, including any post-rename error.
   if(committed)await backupFile?.close().catch(()=>{clean=false;});else if(backupCreated)await remove(backup,backupFile).catch(()=>{clean=false;});
   await remove(record.lockPath,lock).catch(()=>{clean=false;});
   await syncDirectory().catch(()=>{clean=false;});
  }
  if(ok&&clean)callbacks.success();else callbacks.failure();
 }
 return adapter;
}
module.exports={createNSISAdapter,captureAppImage,createAppImageAdapter};
