// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const {storeTest}=require('./fixtures/updater-platform.cjs');
const {createCandidate}=require('../../desktop/update-candidate.cjs'),{createCache}=require('../../desktop/update-cache.cjs');
const roots=[];
async function setup(options={}){const f=fixture(options),dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-update-cache-test-')));roots.push(dir);
 const root=path.join(dir,'cache'),cache=createCache({...f,root,currentVersion:'0.3.2',now:()=>f.now});return {...f,dir,root,cache,c:createCandidate(f)};}
async function stage(f){const tx=await f.cache.begin(f.c);await tx.sink.write(f.payload);await tx.sink.finish();return tx.commit();}
test.after(async()=>{assert.equal(network.calls,0);for(const dir of roots)await fs.rm(dir,{recursive:true,force:true});});
storeTest('private atomic stage, restart reuse and independent read leases reverify full payload',async()=>{
 const f=await setup(),receipt=await stage(f);
 assert.equal((await fs.stat(f.root)).mode&0o777,0o700);
 for(const entry of await fs.readdir(f.root)){assert.equal((await fs.stat(path.join(f.root,entry))).mode&0o777,0o600);}
 const lease=await f.cache.acquire(receipt);assert.equal((await lease.read(0,f.payload.length)).toString(),f.payload.toString());await lease.release();
 const restart=createCache({...f,currentVersion:'0.3.2',now:()=>f.now}),r=await restart.restore();
 assert.equal(r.version,'0.4.0');const l=await restart.acquire(r);await l.validate();await l.release();
 await assert.rejects(()=>restart.acquire(receipt),/cache/i);
});
storeTest('exclusive lease prevents concurrent jobs and cleanup releases only own lock',async()=>{
 const f=await setup(),tx=await f.cache.begin(f.c);
 await assert.rejects(()=>f.cache.begin(f.c),/cache/i);await tx.abort();
 const next=await f.cache.begin(f.c);await next.abort();assert.deepEqual(await fs.readdir(f.root),['guard-v2']);
});
storeTest('wrong digest or truncated bytes never become ready',async()=>{
 for(const bytes of [Buffer.from('bad'),Buffer.alloc(100)]){const f=await setup(),tx=await f.cache.begin(f.c);
 await assert.rejects(async()=>{await tx.sink.write(bytes);await tx.sink.finish();await tx.commit();});await tx.abort();
 await assert.rejects(()=>f.cache.restore());}
});
storeTest('forged receipts and candidates are refused before their getters',async()=>{
 const f=await setup(),evil=new Proxy({},{get(){throw Error('getter touched');}});
 await assert.rejects(()=>f.cache.begin(evil),/candidate/i);await assert.rejects(()=>f.cache.acquire(evil),/cache/i);
 assert.equal(await fs.stat(f.root).catch(()=>null),null);
});
for(const kind of ['symlink-root','public-root','symlink-state','hardlink-state'])storeTest('cache refuses '+kind,async()=>{
 const f=await setup();
 if(kind==='symlink-root'){await fs.mkdir(path.join(f.dir,'other'));await fs.symlink(path.join(f.dir,'other'),f.root);}
 else if(kind==='public-root')await fs.mkdir(f.root,{mode:0o755});
 else{await stage(f);const state=path.join(f.root,'state.json'),outside=path.join(f.dir,'outside');await fs.rename(state,outside);
  if(kind==='symlink-state')await fs.symlink(outside,state);else await fs.link(outside,state);}
 await assert.rejects(()=>kind.endsWith('root')?f.cache.begin(f.c):f.cache.restore(),/cache/i);
});
storeTest('payload mutation and replacement after download fail before install access',async()=>{
 for(const replace of [false,true]){const f=await setup(),r=await stage(f),file=path.join(f.root,'payload-'+f.c.identity+'.exe');
 if(replace){await fs.rename(file,file+'.old');await fs.writeFile(file,f.payload,{mode:0o600});}else await fs.writeFile(file,Buffer.alloc(f.payload.length,1));
 await assert.rejects(()=>f.cache.acquire(r),/cache/i);}
});
storeTest('file lease detects late mutation, is exclusive and cannot be reused after release',async()=>{
 const f=await setup(),r=await stage(f),lease=await f.cache.acquire(r);
 await assert.rejects(()=>f.cache.acquire(r));
 await fs.writeFile(lease.path,Buffer.alloc(f.payload.length,2));await assert.rejects(()=>lease.validate());await lease.release();
 await assert.rejects(()=>lease.read(0,1));
});
storeTest('signature and expiry are checked again after restart and at handoff',async()=>{
 const f=await setup(),r=await stage(f);let clock=f.now;
 const cache=createCache({...f,currentVersion:'0.3.2',now:()=>clock}),restored=await cache.restore();clock+=2*60*60*1000;
 await assert.rejects(()=>cache.acquire(restored));await assert.rejects(()=>cache.restore());
 const sig=path.join(f.root,'envelope-'+f.c.identity);const bytes=await fs.readFile(sig);bytes[bytes.length-5]^=1;await fs.writeFile(sig,bytes);
 await assert.rejects(()=>f.cache.restore());assert(r);
});
storeTest('persisted sequence/version and clock rollback are enforced',async()=>{
 const f=await setup();await stage(f);
 const older=fixture({now:f.now,sequence:41}); // A separately owned policy cannot borrow provenance.
 const owned=createCandidate({...older,policy:f.policy});
 await assert.rejects(()=>f.cache.begin(owned),/cache/i);
 const future=createCache({...f,currentVersion:'0.4.0',now:()=>f.now});await assert.rejects(()=>future.restore());
 const clock=createCache({...f,currentVersion:'0.3.2',now:()=>f.now-60000});await assert.rejects(()=>clock.restore());
});
storeTest('disk exhaustion and cancellation preserve the previous accepted generation',async()=>{
 const f=await setup(),r=await stage(f),signal=AbortSignal.abort();
 await assert.rejects(()=>f.cache.begin(f.c,{signal}));
 const l=await f.cache.acquire(r);await l.release();
 const cache=createCache({...f,currentVersion:'0.3.2',now:()=>f.now,availableBytes:async()=>0});
 await assert.rejects(()=>cache.begin(f.c),/cache/i);
 assert.equal((await f.cache.restore()).identity,f.c.identity);
});
storeTest('explicitly closed policy cannot create a cache or touch disk',async()=>{
 const {createPolicy}=require('../../desktop/update-policy.cjs'),f=await setup();
 assert.throws(()=>createCache({...f,policy:createPolicy(),currentVersion:'0.3.2'}),/cache/i);
 assert.equal(await fs.stat(f.root).catch(()=>null),null);
});
storeTest('atomic replay-state publication fault preserves an independently restorable generation',async()=>{
 const f=await setup();await stage(f);let fail=false;
 const io={...fs,async rename(from,to){if(fail&&to.endsWith('/state.json')){const e=Error('disk full');e.code='ENOSPC';throw e;}return fs.rename(from,to);}};
 const cache=createCache({...f,currentVersion:'0.3.2',now:()=>f.now,io}),newer=fixture({now:f.now,version:'0.4.1',sequence:43}),c=createCandidate({...newer,policy:f.policy});
 const tx=await cache.begin(c);await tx.sink.write(newer.payload);await tx.sink.finish();fail=true;
 await assert.rejects(()=>tx.commit(),/cache/i);
 assert.equal((await f.cache.restore()).identity,f.c.identity);
});
storeTest('retired cache generation is removed only after the newer replay state commits',async()=>{
 const f=await setup();await stage(f);
 const newer=fixture({now:f.now,version:'0.4.1',sequence:43}),c=createCandidate({...newer,policy:f.policy});
 const tx=await f.cache.begin(c);await tx.sink.write(newer.payload);await tx.sink.finish();await tx.commit();
 assert.equal((await f.cache.restore()).identity,c.identity);
 assert(!(await fs.readdir(f.root)).some(n=>n.includes(f.c.identity)));
});
storeTest('abort during publication retains the exclusive lock until the commit has quiesced',async()=>{
 const f=await setup();let signalEntered,releaseRename;const entered=new Promise(r=>signalEntered=r),release=new Promise(r=>releaseRename=r);
 const io={...fs,async rename(from,to){if(to.includes('/payload-')){signalEntered();await release;}return fs.rename(from,to);}},
 cache=createCache({...f,currentVersion:'0.3.2',now:()=>f.now,io}),tx=await cache.begin(f.c);
 await tx.sink.write(f.payload);await tx.sink.finish();const commit=tx.commit();void commit.catch(()=>{});await entered;
 let aborted=false;const abort=tx.abort().then(()=>{aborted=true;});await Promise.race([abort,new Promise(r=>setTimeout(r,100))]);
 assert.equal(aborted,false);await assert.rejects(()=>f.cache.begin(f.c));
 releaseRename();await assert.rejects(()=>commit);await abort;
 const next=await f.cache.begin(f.c);await next.abort();
});
storeTest('successful reuse advances durable clock high-water before a later rollback',async()=>{
 const f=await setup();await stage(f);let clock=f.now+5000;
 const cache=createCache({...f,currentVersion:'0.3.2',now:()=>clock});await cache.restore();clock-=1000;
 await assert.rejects(()=>cache.restore(),/cache/i);
 const state=JSON.parse(await fs.readFile(path.join(f.root,'state.json'),'utf8'));assert.equal(state.replay.checkedAt,f.now+5000);
});
storeTest('a private cache inside a nonsticky writable ancestor is refused',async()=>{
 const f=await setup(),unsafe=path.join(f.dir,'unsafe'),inner=path.join(unsafe,'inner');await fs.mkdir(unsafe,{mode:0o777});await fs.chmod(unsafe,0o777);await fs.mkdir(inner,{mode:0o700});
 const cache=createCache({...f,root:path.join(inner,'cache'),currentVersion:'0.3.2',now:()=>f.now});await assert.rejects(()=>cache.begin(f.c),/cache/i);
});
storeTest('historical cleanup proof authenticates expired bytes without creating install authority',async()=>{
 const f=await setup();await stage(f);
 const next=fixture({now:f.now+7200000,version:'0.4.1',sequence:43}),c=createCandidate({...next,policy:f.policy});
 const cache=createCache({...f,currentVersion:'0.4.0',now:()=>next.now}),tx=await cache.begin(c);
 await tx.sink.write(next.payload);await tx.sink.finish();const receipt=await tx.commit(),lease=await cache.acquire(receipt);
 const old=await lease.retired();assert.equal(old.identity,f.c.identity);assert.equal(old.artifact.sha512,f.c.artifact.sha512);
 assert.equal(Object.hasOwn(old,'envelope'),false);await assert.rejects(()=>cache.acquire(old));await lease.release();
 const file=path.join(f.root,'retired-proof.json'),proof=JSON.parse(await fs.readFile(file,'utf8'));proof.metadata=Buffer.from('bad').toString('base64');await fs.writeFile(file,JSON.stringify(proof),{mode:0o600});
 const l=await cache.acquire(receipt);await assert.rejects(()=>l.retired());await l.release();
});
storeTest('payload close failure still releases the kernel lock and repeated release keeps the error',async()=>{
 const f=await setup();await stage(f);let fail=false;
 const io={...fs,async open(file,...args){const h=await fs.open(file,...args);if(file.includes('/payload-')&&fail){const close=h.close.bind(h);h.close=async()=>{await close();throw Error('close fault');};}return h;}};
 const cache=createCache({...f,currentVersion:'0.3.2',now:()=>f.now,io}),receipt=await cache.restore();fail=true;
 const lease=await cache.acquire(receipt);await assert.rejects(()=>lease.release(),/close fault/);await assert.rejects(()=>lease.release(),/close fault/);
 const another=await f.cache.acquire(await f.cache.restore());await another.release();
});
