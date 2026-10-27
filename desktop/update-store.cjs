// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Owned private directory operations. Paths never come from update metadata.
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const C=fs.constants;
function failure(){const e=Error('Update cache refused');e.code='ERR_UPDATE_CACHE';return e;}
function same(a,b){return ['dev','ino','size','mtimeMs','ctimeMs','mode','nlink','uid'].every(k=>a[k]===b[k]);}
function stamp(s){return Object.freeze(Object.fromEntries(['dev','ino','size','mtimeMs','ctimeMs','mode','nlink','uid'].map(k=>[k,s[k]])));}
async function verifyLinuxParents(directory,io=p){
 const uid=process.getuid?.();
 for(let current=directory;;current=path.dirname(current)){
  const s=await io.lstat(current);
  if(!s.isDirectory()||s.isSymbolicLink()||![uid,0].includes(s.uid)||((s.mode&0o022)&&!(s.mode&0o1000)))throw failure();
  if(current===path.dirname(current))break;
 }
}
function createStore({root,platform=process.platform,windowsSecurity,io=p,legacyAuthority}){
 if(typeof root!=='string'||!path.isAbsolute(root)||path.normalize(root)!==root||root===path.parse(root).root)throw failure();
 if(platform!=='linux'&&platform!=='win32')throw failure();
 if(platform==='win32'&&!windowsSecurity)windowsSecurity=require('./update-windows-security.cjs').createWindowsSecurity();
 const p=io;
 const uid=process.getuid?.();let identity=null;
 const name=n=>{if(typeof n!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(n)||n==='.'||n==='..')throw failure();return path.join(root,n);};
 async function owned(file,directory=false){
  const s=await p.lstat(file);
  if(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile())||(!directory&&s.nlink!==1))throw failure();
  if(platform==='linux'&&(s.uid!==uid||(s.mode&0o777)!==(directory?0o700:0o600)))throw failure();
  if(platform==='win32'){if(typeof windowsSecurity?.verify!=='function'||await windowsSecurity.verify(file,directory)!==true)throw failure();}
  return s;
 }
 async function guard(){
  if(platform==='linux')await verifyLinuxParents(path.dirname(root),p);
  if(await p.realpath(path.dirname(root))!==path.dirname(root)||await p.realpath(root)!==root)throw failure();
  const s=await owned(root,true);if(identity&&(s.ino!==identity.ino||s.dev!==identity.dev))throw failure();return s;
 }
 async function prepare(){
  if(platform==='linux')await verifyLinuxParents(path.dirname(root),p);
  if(await p.realpath(path.dirname(root))!==path.dirname(root))throw failure();
  if(platform==='win32'&&(typeof windowsSecurity?.verify!=='function'||await windowsSecurity.verify(path.dirname(root),true)!==true))throw failure();
  try{await p.mkdir(root,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw failure();}
  const s=await guard();identity={dev:s.dev,ino:s.ino};return root;
 }
 async function open(n,flags=C.O_RDONLY,{missing=false}={}){
  await guard();const file=name(n);let h;
  try{
   h=await p.open(file,flags|(C.O_NOFOLLOW||0)|(C.O_NONBLOCK||0),0o600);
   const before=await owned(file),held=await h.stat();if(!same(before,held))throw failure();
   return {h,file,stat:stamp(held)};
  }catch(e){await h?.close().catch(()=>{});if(missing&&e.code==='ENOENT')return null;throw failure();}
 }
 async function syncDir(){await guard();if(platform==='win32'){if(typeof windowsSecurity?.flush!=='function'||await windowsSecurity.flush(root)!==true)throw failure();return;}
  const h=await p.open(root,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
 async function read(n,max,{missing=false}={}){
  const held=await open(n,C.O_RDONLY,{missing});if(!held)return null;
  try{
   if(!Number.isSafeInteger(held.stat.size)||held.stat.size<1||held.stat.size>max)throw failure();
   const buffer=Buffer.alloc(held.stat.size+1);let count=0;
   while(count<buffer.length){const {bytesRead}=await held.h.read(buffer,count,buffer.length-count,count);if(!bytesRead)break;count+=bytesRead;}
   const bytes=buffer.subarray(0,count);if(bytes.length!==held.stat.size||!same(held.stat,await held.h.stat())||!same(held.stat,await owned(held.file)))throw failure();return bytes;
  }finally{await held.h.close();}
 }
 async function removeOwned(n,expected){
  await guard();const s=await owned(name(n));if(expected&&(s.ino!==expected.ino||s.dev!==expected.dev))throw failure();await p.unlink(name(n));
 }
 async function atomic(n,bytes){
  await guard();const temp='write-'+crypto.randomBytes(16).toString('hex'),held=await open(temp,C.O_WRONLY|C.O_CREAT|C.O_EXCL);
  try{
   await held.h.writeFile(bytes);await held.h.sync();await held.h.close();
   const previous=await p.lstat(name(n)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(previous)await owned(name(n));
   if(platform==='win32'){if(await windowsSecurity.replace(held.file,name(n))!==true)throw failure();}
   else await p.rename(held.file,name(n));
   await syncDir();
  }catch{await held.h.close().catch(()=>{});await removeOwned(temp,held.stat).catch(()=>{});throw failure();}
 }
 async function lock(){
  await prepare();
  const lockModule=require('./update-lock.cjs');
  const lockFlags=C.O_RDWR|C.O_CREAT|(platform==='win32'?lockModule.windowsExclusiveFlag(process.versions):0);
  const held=await open('guard-v2',lockFlags);let releasePromise;
  try{
   if(held.stat.size!==0)throw failure();
   if(platform==='linux')await lockModule.hold(held,{platform,io:p});
   if(!same(held.stat,await held.h.stat())||!same(held.stat,await owned(held.file)))throw failure();
   const legacy=await open('lease',C.O_RDONLY,{missing:true});
   if(legacy)try{
    const authorized=legacyAuthority?legacyAuthority()===true:require('./update-lock.cjs').ownsProfile(root);
    if(!authorized||legacy.stat.size!==0)throw failure();
    await removeOwned('lease',legacy.stat);await syncDir();
   }finally{await legacy.h.close();}
   await held.h.sync();await syncDir();
  }catch{await held.h.close().catch(()=>{});throw failure();}
  return ()=>releasePromise??=(async()=>{await held.h.close();})();
 }
 async function promote(from,to){
  await guard();await owned(name(from));const old=await p.lstat(name(to)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(old)await owned(name(to));
  if(platform==='win32'){if(await windowsSecurity.replace(name(from),name(to))!==true)throw failure();}else await p.rename(name(from),name(to));
  await syncDir();
 }
 return Object.freeze({promote,root,name,prepare,guard,open,read,atomic,syncDir,removeOwned,lock,owned,stamp,same});
}
module.exports={verifyLinuxParents,createStore,failure,stamp,same};
