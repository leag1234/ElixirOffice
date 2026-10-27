// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// A persistent inode is not a lease: only the main process's open description
// owns the kernel lock. Never unlink guard-v2, including after a crash.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const authorities=new Map();
const WINDOWS_EXCLUSIVE_OPEN=0x10000000;
function windowsExclusiveFlag(versions=process.versions){
 if(!versions||versions.node!=='24.22.0'||versions.uv!=='1.52.1')refused();
 return WINDOWS_EXCLUSIVE_OPEN;
}
function refused(){throw Error('Update cache refused');}
function registerProfileAuthority(profile,check){
 if(typeof profile!=='string'||!path.isAbsolute(profile)||path.normalize(profile)!==profile||typeof check!=='function')refused();
 authorities.set(profile,check);
}
function ownsProfile(root){
 for(const [profile,check]of authorities)if(root.startsWith(profile+path.sep)&&check()===true)return true;
 return false;
}
async function hold(held,{platform,io=fs.promises}){
 if(platform!=='linux')refused();
 const binary='/usr/bin/flock',s=await io.lstat(binary);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)||await io.realpath(binary)!==binary)refused();
 await new Promise((resolve,reject)=>{
  let child,timer,failed=false;
  try{child=cp.spawn(binary,['--exclusive','--nonblock','3'],{shell:false,stdio:['ignore','ignore','ignore',held.h.fd],env:{LANG:'C'}});}
  catch{return reject(Error('Update cache refused'));}
  timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},3000);
  child.once('error',()=>{failed=true;});
  child.once('close',code=>{clearTimeout(timer);if(code===0&&!failed)resolve();else reject(Error('Update cache refused'));});
 });
}
module.exports={hold,windowsExclusiveFlag,registerProfileAuthority,ownsProfile};
