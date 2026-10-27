// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {createStore}=require('../../desktop/update-store.cjs');
const roots=[];
async function setup(){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-lock-test-')));roots.push(dir);return {dir,root:path.join(dir,'cache')};}
test.after(async()=>{for(const d of roots)await fs.rm(d,{recursive:true,force:true});});
test('persistent guard survives release without granting a simultaneous second owner',async()=>{
 const f=await setup(),a=createStore(f),b=createStore(f),release=await a.lock();
 await assert.rejects(()=>b.lock());await release();await release();
 assert.deepEqual(await fs.readdir(f.root),['guard-v2']);const before=await fs.stat(path.join(f.root,'guard-v2'));
 const next=await b.lock();await next();assert.equal((await fs.stat(path.join(f.root,'guard-v2'))).ino,before.ino);
});
test('a real crashed holder releases the kernel lock and the next process succeeds',{timeout:10000},async()=>{
 const f=await setup(),source="const {createStore}=require(process.argv[1]);createStore({root:process.argv[2]}).lock().then(()=>{process.stdout.write('LOCKED\\n');setInterval(()=>{},1000);}).catch(()=>process.exit(2));";
 const child=spawn(process.execPath,['-e',source,path.resolve(__dirname,'../../desktop/update-store.cjs'),f.root],{stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',code=>reject(Error('holder exited '+code)));});
 await assert.rejects(()=>createStore(f).lock());const done=once(child,'exit');child.kill('SIGKILL');await done;
 const unlock=await createStore(f).lock();await unlock();assert.deepEqual(await fs.readdir(f.root),['guard-v2']);
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});
test('legacy zero-byte lease needs trusted profile ownership; unsafe legacy files are retained',async()=>{
 for(const kind of ['safe','nonempty','public','link','hardlink']){
 const f=await setup();await fs.mkdir(f.root,{mode:0o700});const old=path.join(f.root,'lease'),other=path.join(f.dir,'other');
 await fs.writeFile(other,'',{mode:0o600});
 if(kind==='link')await fs.symlink(other,old);else if(kind==='hardlink')await fs.link(other,old);else await fs.writeFile(old,kind==='nonempty'?'x':'',{mode:kind==='public'?0o644:0o600});
 await assert.rejects(()=>createStore(f).lock());assert(await fs.lstat(old));
 const store=createStore({...f,legacyAuthority:()=>true});
 if(kind==='safe'){const release=await store.lock();await release();assert.equal(await fs.lstat(old).catch(()=>null),null);}
 else{await assert.rejects(()=>store.lock());assert(await fs.lstat(old));}
 }
});
test('guard symlinks, hardlinks and public mode cannot be acquired',async()=>{
 for(const kind of ['link','hardlink','public']){
 const f=await setup();await fs.mkdir(f.root,{mode:0o700});const file=path.join(f.root,'guard-v2'),other=path.join(f.dir,'other');await fs.writeFile(other,'',{mode:0o600});
 if(kind==='link')await fs.symlink(other,file);else if(kind==='hardlink')await fs.link(other,file);else await fs.writeFile(file,'',{mode:0o644});
 await assert.rejects(()=>createStore(f).lock());assert.equal(await fs.readFile(other,'utf8'),'');
 }
});
