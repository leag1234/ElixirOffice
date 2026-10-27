// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {createStore}=require('../../desktop/update-store.cjs');
const STEP_TIMEOUT_MS=15000,WHOLE_TIMEOUT_MS=90000,CLEANUP_TIMEOUT_MS=30000;
function exited(child){return child.exitCode!==null||child.signalCode!==null;}
function timed(promise,milliseconds,message){
 let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),Math.max(1,milliseconds));});
 return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
function exitResult(child,milliseconds,label){
 if(exited(child))return Promise.resolve([child.exitCode,child.signalCode]);
 return new Promise((resolve,reject)=>{
  let timer;const clear=()=>{clearTimeout(timer);child.off('error',error);child.off('exit',done);};
  const error=value=>{clear();reject(value instanceof Error?value:Error(label+' child error'));};
  const done=(code,signal)=>{clear();resolve([code,signal]);};
  child.once('error',error);child.once('exit',done);
  timer=setTimeout(()=>error(Error(label+' child exit timed out')),Math.max(1,milliseconds));
 });
}
function locked(child,milliseconds){
 if(!child.stdout||typeof child.stdout.on!=='function')return Promise.reject(Error('Holder stdout unavailable'));
 return new Promise((resolve,reject)=>{
  let bytes='',timer;
  const clear=()=>{clearTimeout(timer);child.stdout.off('data',data);child.off('error',error);child.off('exit',early);};
  const fail=value=>{clear();reject(value instanceof Error?value:Error(String(value)));};
  const data=value=>{bytes+=Buffer.from(value).toString('utf8');if(!'LOCKED\n'.startsWith(bytes))fail(Error('Invalid holder readiness'));else if(bytes==='LOCKED\n'){clear();resolve();}};
  const error=value=>fail(value instanceof Error?value:Error('Holder child error'));
  const early=(code,signal)=>fail(Error('Holder exited before readiness: '+String(code??signal)));
  child.stdout.on('data',data);child.once('error',error);child.once('exit',early);
  if(exited(child))early(child.exitCode,child.signalCode);
  else timer=setTimeout(()=>fail(Error('Holder readiness timed out')),Math.max(1,milliseconds));
 });
}
async function qualification({
 platform=process.platform,versions=process.versions,base,spawnProcess=spawn,createStoreFn=createStore,
 fsApi=fs,pathApi=path,execPath=process.execPath,self=__filename,pid=process.pid,
 stepTimeoutMs=STEP_TIMEOUT_MS,wholeTimeoutMs=WHOLE_TIMEOUT_MS,cleanupTimeoutMs=CLEANUP_TIMEOUT_MS
}={}){
 assert.equal(platform,'win32','Windows-only native qualification');
 assert.equal(versions.node,'24.22.0');assert.equal(versions.uv,'1.52.1');
 assert(base&&pathApi.isAbsolute(base)&&pathApi.normalize(base)===base,'Explicit private EO_WINDOWS_LOCK_ROOT required');
 const expires=Date.now()+wholeTimeoutMs,children=new Set(),releases=new Set(),pendingLocks=new Set();let stopping=false;
 const bodyWait=(promise,label)=>timed(promise,Math.min(stepTimeoutMs,expires-Date.now()),label+' exceeded qualification deadline');
 const root=pathApi.join(base,'cache-'+pid);
 const acquire=()=>{
  const pending=Promise.resolve().then(()=>createStoreFn({root}).lock()).then(async release=>{
   if(typeof release!=='function')throw Error('Invalid lock release');
   if(stopping){await release();throw Error('Qualification cleanup started');}
   releases.add(release);return release;
  });
  pendingLocks.add(pending);pending.then(()=>pendingLocks.delete(pending),()=>pendingLocks.delete(pending));
  return bodyWait(pending,'Lock acquisition');
 };
 const release=async owned=>{if(owned&&releases.has(owned)){await bodyWait(Promise.resolve().then(owned),'Lock release');releases.delete(owned);}};
 const launch=args=>{const child=spawnProcess(execPath,[self,...args],{stdio:args[0]==='--hold'?['ignore','pipe','inherit']:'ignore'});children.add(child);return child;};
 const reap=async(child,label)=>{const result=await exitResult(child,Math.min(stepTimeoutMs,expires-Date.now()),label);children.delete(child);return result;};
 let failure;
 try{
  assert.deepEqual(await bodyWait(fsApi.readdir(base),'Private root read'),[],'Qualification root must start empty');
  const first=await acquire();
  let child=launch(['--probe',root]),result=await reap(child,'Contending probe');assert.equal(result[0],3,'simultaneous process must be refused');
  await release(first);child=launch(['--probe',root]);result=await reap(child,'Released probe');assert.equal(result[0],0,'graceful close must release');
  const holder=launch(['--hold',root]);await locked(holder,Math.min(stepTimeoutMs,expires-Date.now()));
  await assert.rejects(()=>acquire());
  const dead=exitResult(holder,Math.min(stepTimeoutMs,expires-Date.now()),'Killed holder');assert.equal(holder.kill('SIGKILL'),true,'Holder termination failed');await dead;children.delete(holder);
  const finalRelease=await acquire();await release(finalRelease);
  assert.deepEqual(await bodyWait(fsApi.readdir(root),'Guard inventory'),['guard-v2']);
 }catch(error){failure=error;}
 stopping=true;const cleanupExpires=Date.now()+cleanupTimeoutMs,cleanupErrors=[];
 const cleanupWait=(promise,label)=>timed(promise,Math.min(stepTimeoutMs,cleanupExpires-Date.now()),label+' cleanup timed out');
 for(const owned of [...releases])try{await cleanupWait(Promise.resolve().then(owned),'Parent lock release');releases.delete(owned);}catch(error){cleanupErrors.push(error);}
 for(const pending of [...pendingLocks])try{await cleanupWait(pending.catch(()=>{}),'Pending lock');}catch(error){cleanupErrors.push(error);}
 for(const child of [...children])try{
  const dead=exitResult(child,stepTimeoutMs,'Owned child');
  if(!exited(child)&&child.kill('SIGKILL')!==true)throw Error('Owned child termination failed');
  await cleanupWait(dead,'Owned child');children.delete(child);
 }catch(error){cleanupErrors.push(error);}
 if(!cleanupErrors.length)try{await cleanupWait(fsApi.rm(root,{recursive:true,force:true}),'Cache removal');}catch(error){cleanupErrors.push(error);}
 if(failure||cleanupErrors.length)throw new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'Windows lock qualification failed');
 return {verdict:'PASS',platform,node:versions.node,uv:versions.uv,checks:5};
}
async function probe(root){try{const release=await createStore({root}).lock();await release();return 0;}catch{return 3;}}
async function child(mode,root){
 if(mode==='--probe')process.exitCode=await probe(root);
 else if(mode==='--hold'){
  const release=await createStore({root}).lock();process.stdout.write('LOCKED\n');setInterval(()=>{},1000);
  process.on('SIGTERM',async()=>{await release();process.exit(0);});
 }
}
async function main(){const result=await qualification({base:process.env.EO_WINDOWS_LOCK_ROOT});console.log(JSON.stringify(result));}
if(require.main===module){
 const mode=process.argv[2];
 (mode==='--probe'||mode==='--hold'?child(mode,process.argv[3]):main()).catch(error=>{console.error(error);process.exitCode=mode?2:1;});
}
module.exports={qualification,locked,exitResult,timed};
