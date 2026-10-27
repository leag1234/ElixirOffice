// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const {createCandidate}=require('../../desktop/update-candidate.cjs'),{createCache}=require('../../desktop/update-cache.cjs');
const {createNSISAdapter,captureAppImage,createAppImageAdapter}=require('../../desktop/update-installers.cjs');
const {completeHandoff}=require('../../desktop/update-handoff.cjs');
const roots=[],tick=()=>new Promise(setImmediate);
function image(value=1){const b=Buffer.alloc(256,value);b.set([0x7f,69,76,70,2,1,1],0);b.set([65,73,2],8);b.writeUInt16LE(62,18);return b;}
async function setup(platform='linux',payload=image(2)){
 const f=fixture({platform,payload}),dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-installer-test-')));roots.push(dir);
 await fs.chmod(dir,0o700);const cache=createCache({...f,root:path.join(dir,'cache'),currentVersion:'0.3.2',now:()=>f.now}),c=createCandidate(f),tx=await cache.begin(c);
 await tx.sink.write(f.payload);await tx.sink.finish();const r=await tx.commit(),lease=await cache.acquire(r);
 const target=path.join(dir,'Synthetic app.AppImage');if(platform==='linux')await fs.writeFile(target,image(1),{mode:0o755});
 return {...f,dir,target,cache,lease};
}
async function handoff(adapter,lease){let quits=0,restores=0;const result=await completeHandoff({adapter,barrier:async()=>true,revalidate:()=>lease.validate(),quit:()=>{quits++;},restore:()=>{restores++;}});
 return {result,quits,restores};}
test.after(async()=>{assert.equal(network.calls,0);for(const dir of roots)await fs.rm(dir,{recursive:true,force:true});});
test('NSIS holds independent spawn acknowledgement and only fixed arguments/environment',async()=>{
 const f=await setup('win32',Buffer.from('MZ synthetic NSIS')),events=[],child=new EventEmitter();child.unref=()=>events.push('unref');
 const a=createNSISAdapter({lease:f.lease,platform:'win32',silent:true,relaunch:false,environment:{SystemRoot:'C:\\Windows',TEMP:'C:\\Temp',OPENAI_API_KEY:'do-not-copy',NODE_OPTIONS:'bad'},
 spawn(exe,args,options){events.push({exe,args,options});setImmediate(()=>child.emit('spawn'));return child;}});
 assert.equal(a.state,'prepared');const result=await handoff(a,f.lease);assert.deepEqual(result,{result:true,quits:1,restores:0});
 assert.equal(events[0].exe,f.lease.path);assert.deepEqual(events[0].args,['--updated','/S']);assert.equal(events[0].options.shell,false);
 assert.equal(events[0].options.detached,true);assert(!('OPENAI_API_KEY'in events[0].options.env));assert(!('NODE_OPTIONS'in events[0].options.env));await f.lease.release();
});
test('NSIS delayed spawn error never quits or falls back to a shell',async()=>{
 const f=await setup('win32',Buffer.from('MZ synthetic NSIS')),child=new EventEmitter();child.unref=()=>{};
 const a=createNSISAdapter({lease:f.lease,platform:'win32',spawn(){setImmediate(()=>child.emit('error',Error('private details')));return child;}});
 assert.deepEqual(await handoff(a,f.lease),{result:false,quits:0,restores:1});await f.lease.release();
});
test('NSIS late mutation, forged capability, unsupported host and cancellation refuse launch',async()=>{
 const f=await setup('win32',Buffer.from('MZ synthetic NSIS'));let calls=0;
 assert.throws(()=>createNSISAdapter({lease:{...f.lease},platform:'win32'}));
 assert.throws(()=>createNSISAdapter({lease:f.lease,platform:'linux'}));
 const a=createNSISAdapter({lease:f.lease,platform:'win32',spawn(){calls++;throw Error('not reached');}});
 await fs.writeFile(f.lease.path,Buffer.from('changed'));assert.equal((await handoff(a,f.lease)).quits,0);assert.equal(calls,0);await f.lease.release();
 const other=await setup('win32',Buffer.from('MZ synthetic NSIS')),b=createNSISAdapter({lease:other.lease,platform:'win32',spawn(){calls++;}});
 b.dispose();assert.equal(b.install(),false);assert.equal(calls,0);await other.lease.release();
});
test('AppImage commits verified same-directory sibling, retains private old backup, then acknowledges',async()=>{
 const f=await setup(),startup=await captureAppImage({file:f.target}),a=createAppImageAdapter({lease:f.lease,startup});
 assert.deepEqual(await handoff(a,f.lease),{result:true,quits:1,restores:0});assert((await fs.readFile(f.target)).equals(f.payload));assert.equal((await fs.stat(f.target)).mode&0o777,0o755);
 const backups=(await fs.readdir(f.dir)).filter(x=>x.includes('.eo-backup-'));assert.equal(backups.length,1);const b=path.join(f.dir,backups[0]);
 assert((await fs.readFile(b)).equals(image(1)));assert.equal((await fs.stat(b)).mode&0o777,0o600);
 assert(!(await fs.readdir(f.dir)).some(x=>x.endsWith('.lease')||x.includes('.eo-stage-')));await f.lease.release();
});
for(const point of ['copy-new','sync-new','copy-backup','sync-backup','before-rename','rename','sync-commit'])test('AppImage fault at '+point+' preserves old or durable backup',async()=>{
 const f=await setup(),startup=await captureAppImage({file:f.target});
 const a=createAppImageAdapter({lease:f.lease,startup,fault(where){if(where===point){const e=Error('synthetic disk failure');e.code=point==='rename'?'EXDEV':'ENOSPC';throw e;}}});
 const result=await handoff(a,f.lease);assert.equal(result.quits,0);assert.equal(result.result,false);
 const actual=await fs.readFile(f.target),backups=(await fs.readdir(f.dir)).filter(x=>x.includes('.eo-backup-'));
 if(point==='sync-commit'){assert(actual.equals(f.payload));assert.equal(backups.length,1);assert((await fs.readFile(path.join(f.dir,backups[0]))).equals(image(1)));}
 else assert(actual.equals(image(1)));await f.lease.release();
});
test('AppImage validates both target identity and copied payload at commit boundary',async()=>{
 for(const changed of ['target','cache']){const f=await setup(),startup=await captureAppImage({file:f.target});
 const a=createAppImageAdapter({lease:f.lease,startup,async fault(point){if(point==='before-rename')await fs.writeFile(changed==='target'?f.target:f.lease.path,Buffer.alloc(256,3));}});
 assert.equal((await handoff(a,f.lease)).quits,0);if(changed==='cache')assert((await fs.readFile(f.target)).equals(image(1)));await f.lease.release();}
});
for(const kind of ['symlink','hardlink','public-write','non-executable','not-AppImage','parent-write'])test('AppImage startup refuses '+kind,async()=>{
 const f=await setup();
 if(kind==='symlink'){await fs.rename(f.target,f.target+'.real');await fs.symlink(f.target+'.real',f.target);}
 if(kind==='hardlink')await fs.link(f.target,f.target+'.link');
 if(kind==='public-write')await fs.chmod(f.target,0o777);
 if(kind==='non-executable')await fs.chmod(f.target,0o600);
 if(kind==='not-AppImage')await fs.writeFile(f.target,Buffer.from('not executable'));
 if(kind==='parent-write')await fs.chmod(f.dir,0o777);
 await assert.rejects(()=>captureAppImage({file:f.target}));if(kind==='parent-write')await fs.chmod(f.dir,0o700);await f.lease.release();
});
test('AppImage target lock is exclusive, stale locks fail closed and fake startup is rejected',async()=>{
 const f=await setup(),startup=await captureAppImage({file:f.target});assert.throws(()=>createAppImageAdapter({lease:f.lease,startup:{...startup}}));
 await fs.writeFile(startup.lockPath,'stale',{mode:0o600});const a=createAppImageAdapter({lease:f.lease,startup});
 assert.equal((await handoff(a,f.lease)).quits,0);assert.equal(await fs.readFile(startup.lockPath,'utf8'),'stale');await f.lease.release();
});
test('AppImage cancellation during copy prevents the atomic commit and releases own lock',async()=>{
 const f=await setup(),startup=await captureAppImage({file:f.target});let a;
 a=createAppImageAdapter({lease:f.lease,startup,fault(point){if(point==='copy-new')a.dispose();}});
 assert.equal((await handoff(a,f.lease)).quits,0);assert((await fs.readFile(f.target)).equals(image(1)));await f.lease.release();
});
test('AppImage acknowledgement is issued after transaction cleanup',async()=>{
 const f=await setup(),startup=await captureAppImage({file:f.target}),a=createAppImageAdapter({lease:f.lease,startup});
 assert.equal(a.install(),true);await a.acknowledgement;
 assert.equal(await fs.lstat(startup.lockPath).catch(()=>null),null);await f.lease.release();
});
test('AppImage refuses a private destination inside a nonsticky writable ancestor',async()=>{
 const f=await setup(),unsafe=path.join(f.dir,'unsafe'),inner=path.join(unsafe,'inner');await fs.mkdir(unsafe);await fs.chmod(unsafe,0o777);await fs.mkdir(inner,{mode:0o700});
 const file=path.join(inner,'app.AppImage');await fs.writeFile(file,image(1),{mode:0o700});await assert.rejects(()=>captureAppImage({file}));await f.lease.release();
});
