// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{fork}=require('node:child_process');
const {create}=require('../../desktop/safety-log.cjs');
test('safe logger ignores only broken pipes, never logs content and reports one fatal event',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-safety-')),proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stderr=new EventEmitter();
 const target={error(){throw Error('closed sink');},warn(){throw Error('closed sink');},log(){throw Error('closed sink');}},fatal=[];
 const safety=create(folder),restore=safety.install(proc,target,reason=>fatal.push(reason));
 try{
  assert.doesNotThrow(()=>target.error('SYNTHETIC_PRIVATE_ERROR'));assert.doesNotThrow(()=>target.log('SYNTHETIC_PRIVATE_LOG'));assert.doesNotThrow(()=>target.table({secret:'SYNTHETIC_PRIVATE_TABLE'}));assert.doesNotThrow(()=>target.dir({secret:'SYNTHETIC_PRIVATE_DIR'}));
  proc.stdout.emit('error',{code:'EPIPE'});proc.stderr.emit('error',{code:'ERR_STREAM_DESTROYED'});assert.equal(fatal.length,0);assert.equal(safety.failed,false);
  proc.stdout.emit('error',{code:'EIO'});proc.emit('uncaughtException',Error('SYNTHETIC_PRIVATE_EXCEPTION'));proc.emit('unhandledRejection','SYNTHETIC_PRIVATE_REJECTION');
  assert.deepEqual(fatal,['stdio-failure']);assert.equal(safety.failed,true);await safety.flush();
  const log=await fs.readFile(path.join(folder,'desktop-safety.log'),'utf8');assert(log.includes('console-error')&&log.includes('stdio-failure'));assert(!log.includes('SYNTHETIC_PRIVATE'));assert.equal((await fs.stat(path.join(folder,'desktop-safety.log'))).mode&0o777,0o600);
 }finally{restore();await fs.rm(folder,{recursive:true,force:true})}
});
test('safe logger retains bounded code-only records and refuses unknown reason content',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-safety-')),file=path.join(folder,'desktop-safety.log');await fs.writeFile(file,Buffer.alloc(65530,120),{mode:0o666});const safety=create(folder);
 try{await safety.log('SYNTHETIC_PRIVATE_UNKNOWN');assert.equal((await fs.stat(file)).size,65530);await safety.log('recovery-failure');const log=await fs.readFile(file,'utf8');assert(log.includes('recovery-failure'));assert(log.length<65536);assert.equal((await fs.stat(file)).mode&0o777,0o600);}finally{await fs.rm(folder,{recursive:true,force:true})}
});
test('closed stdout and stderr pipes cannot turn console/IPC-style error logging into an uncaught failure',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-safety-child-'));
 const child=fork(path.join(__dirname,'fixtures/closed-stdio.cjs'),[folder],{stdio:['ignore','pipe','pipe','ipc']});
 try{
  const receipt=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Closed-pipe child timed out')),5000);
   child.on('message',message=>{if(message.ready){child.stdout.destroy();child.stderr.destroy();child.send('probe');}else{clearTimeout(timer);resolve(message);}});
   child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(Error('Closed-pipe child exited '+code));});
  });
  assert.deepEqual(receipt,{survived:true,fatal:0});await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
  const log=await fs.readFile(path.join(folder,'desktop-safety.log'),'utf8');assert(log.includes('console-error'));assert(!log.includes('SYNTHETIC_PRIVATE'));
 }finally{if(child.exitCode===null)child.kill('SIGKILL');await fs.rm(folder,{recursive:true,force:true})}
});

test('logger resolves the active profile lazily after a capture profile switch',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-safety-profile-')),original=path.join(folder,'original'),capture=path.join(folder,'capture');let active=original;const safety=create(()=>active);
 try{active=capture;await safety.log('console-error');assert.equal(await fs.stat(original).then(()=>true,()=>false),false);assert((await fs.readFile(path.join(capture,'desktop-safety.log'),'utf8')).includes('console-error'));}
 finally{await fs.rm(folder,{recursive:true,force:true})}
});

test('forgotten rejection records only a code and does not mark the app unsafe',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-rejection-')),proc=new EventEmitter(),fatal=[];
 const safety=create(folder),restore=safety.install(proc,{},reason=>fatal.push(reason));
 try{proc.emit('unhandledRejection',Error('SYNTHETIC_PRIVATE_REJECTION'));await safety.flush();
 assert.equal(safety.failed,false);assert.deepEqual(fatal,[]);
 const log=await fs.readFile(path.join(folder,'desktop-safety.log'),'utf8');assert(log.includes('unhandled-rejection'));assert(!log.includes('SYNTHETIC_PRIVATE'));
 proc.emit('uncaughtException',Error('fatal'));assert.equal(safety.failed,true);assert.deepEqual(fatal,['uncaught-exception']);
 }finally{restore();await fs.rm(folder,{recursive:true,force:true})}
});
