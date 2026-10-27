// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const guard=require('./fixtures/deny-update-network.cjs')(),cp=require('node:child_process');
const {storeTest}=require('./fixtures/updater-platform.cjs');
const {createStore}=require('../../desktop/update-store.cjs');
storeTest('cold production cannot touch the lock helper; only the exact fd invocation is allowed',async()=>{
 const {production}=require('../../desktop/update-policy.cjs'),{createCache}=require('../../desktop/update-cache.cjs');
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eo-lock-contract-'))),root=path.join(directory,'cache');
 try{
 assert.throws(()=>createCache({root,policy:production,runtime:{platform:'linux',arch:'x64',packageType:'AppImage'}}));
 assert.equal(guard.lockCalls,0);assert.equal(guard.calls,0);assert.equal(fs.existsSync(root),false);
 const unlock=await createStore({root}).lock();assert.equal(guard.lockCalls,1);await unlock();assert.equal(guard.calls,0);
 const fd=fs.openSync(path.join(root,'guard-v2'),'r+');
 try{
 const exact={shell:false,stdio:['ignore','ignore','ignore',fd],env:{LANG:'C'}};
 const bad=[
 ()=>cp.spawn('/bin/sh',['-c','true'],exact),
 ()=>cp.spawn('/usr/bin/flock',['--exclusive','3'],exact),
 ()=>cp.spawn('/usr/bin/flock',['--exclusive','--nonblock','3'],{...exact,shell:true}),
 ()=>cp.spawn('/usr/bin/flock',['--exclusive','--nonblock','3'],{...exact,stdio:['ignore','pipe','ignore',fd]}),
 ()=>cp.spawn('/usr/bin/flock',['--exclusive','--nonblock','3'],{...exact,env:{LANG:'C',PATH:'/tmp'}}),
 ()=>cp.execFile('/usr/bin/flock',['--exclusive','--nonblock','3']),
 ()=>fetch('https://invalid.example/')
 ];
 for(const run of bad)assert.throws(run,/denied/);assert.equal(guard.calls,bad.length);assert.equal(guard.lockCalls,1);
 }finally{fs.closeSync(fd);}
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Windows store puts the qualified libuv exclusive flag on the first guard open',async()=>{
 const root=path.resolve(os.tmpdir(),'eo-lock-win-source'),file=path.join(root,'guard-v2'),opened=[];
 const rootStat={dev:1,ino:1,size:0,mtimeMs:1,ctimeMs:1,mode:0o40700,nlink:1,uid:0,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
 const fileStat={dev:1,ino:2,size:0,mtimeMs:1,ctimeMs:1,mode:0o100600,nlink:1,uid:0,isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false};
 const io={realpath:async value=>value,mkdir:async()=>{},lstat:async value=>value===root?rootStat:fileStat,
  open:async(value,flags)=>{opened.push({value,flags});if(value.endsWith('lease')){const e=Error('missing');e.code='ENOENT';throw e;}return {fd:17,stat:async()=>fileStat,sync:async()=>{},close:async()=>{}};}};
 const security={verify:async()=>true,flush:async()=>true},lock=require('../../desktop/update-lock.cjs'),original=lock.windowsExclusiveFlag;
 lock.windowsExclusiveFlag=versions=>{assert.equal(versions,process.versions);return 0x10000000;};
 try{const release=await createStore({root,platform:'win32',windowsSecurity:security,io}).lock();await release();}
 finally{lock.windowsExclusiveFlag=original;}
 assert.equal(opened[0].value,file);assert.equal(opened[0].flags&0x10000000,0x10000000);assert.equal(opened.length,2);
});
test('Windows lock rejects every unqualified runtime before opening and has no fallback',async()=>{
 const lock=require('../../desktop/update-lock.cjs');
 assert.equal(lock.windowsExclusiveFlag({node:'24.22.0',uv:'1.52.1'}),0x10000000);
 for(const versions of [{node:'24.21.0',uv:'1.52.1'},{node:'24.22.0',uv:'1.51.0'},{node:'24.22.0'},null])assert.throws(()=>lock.windowsExclusiveFlag(versions),/Update cache refused/);
 const root=path.resolve(os.tmpdir(),'eo-lock-win-closed');let opens=0;
 const directory={dev:1,ino:1,size:0,mtimeMs:1,ctimeMs:1,mode:0o40700,nlink:1,uid:0,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
 const io={realpath:async value=>value,mkdir:async()=>{},lstat:async()=>directory,open:async()=>{opens++;throw Error('must stay closed');}};
 const security={verify:async()=>true,flush:async()=>true};
 await assert.rejects(()=>createStore({root,platform:'win32',windowsSecurity:security,io}).lock(),/Update cache refused/);
 assert.equal(opens,0);
});
