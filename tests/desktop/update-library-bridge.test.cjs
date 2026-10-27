// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const library=createRequire(path.resolve(__dirname,'../../desktop/package.json'))('electron-updater');
const {createCandidate}=require('../../desktop/update-candidate.cjs'),{createCache}=require('../../desktop/update-cache.cjs');
const {createVerifiedProvider,bindVerifiedUpdater}=require('../../desktop/update-provider.cjs'),{createLibraryBridge}=require('../../desktop/update-library-bridge.cjs');
const {createNSISAdapter}=require('../../desktop/update-installers.cjs'),{completeHandoff}=require('../../desktop/update-handoff.cjs');
const roots=[];
async function setup(options={}){
 const f=fixture({payload:Buffer.from('MZ synthetic NSIS'),...options}),dir=options.dir??await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-bridge-test-')));roots.push(dir);await fs.chmod(dir,0o700);
 const root=path.join(dir,'cache'),c=createCandidate(f),cache=createCache({...f,root,currentVersion:'0.3.2',now:()=>f.now}),
 provider=createVerifiedProvider({Provider:library.Provider,...f,now:()=>f.now});provider.setCandidate(c);
 let downloads=0;
 const bridge=createLibraryBridge({cache,provider,async download(candidate,sink){downloads++;assert.equal(candidate.identity,c.identity);await sink.write(f.payload);await sink.finish();}});
 const Bound=bindVerifiedUpdater({Base:library.NsisUpdater,provider,...f,configPath:path.resolve(__dirname,'../../desktop/update-cache.yml'),download:bridge.download,install:bridge.install});
 const app={version:'0.3.2',name:'synthetic',isPackaged:true,baseCachePath:root,whenReady:async()=>{},onQuit(){throw Error('quit hook armed');},get userDataPath(){throw Error('ID');}};
 const u=new Bound(app);u.on('error',()=>{});bridge.attach(u,app);
 return {...f,c,cache,root,dir,u,bridge,get downloads(){return downloads;}};
}
test.after(async()=>{assert.equal(network.calls,0);for(const d of roots)await fs.rm(d,{recursive:true,force:true});});
test('actual library bookkeeping uses only private verified payload; no staging ID or quit hook',async()=>{
 const f=await setup();await f.u.checkForUpdates();const paths=await f.u.downloadUpdate();
 assert.equal(paths.length,1);assert.equal(f.downloads,1);assert.equal(f.u.stagingUserIdPromise.hasValue,false);assert.equal(f.u.quitHandlerAdded,false);
 assert.equal((await fs.stat(paths[0])).mode&0o777,0o600);assert.equal((await fs.stat(path.join(path.dirname(paths[0]),'update-info.json'))).mode&0o777,0o600);
 const receipt=f.bridge.ready(f.u);assert.equal(receipt.identity,f.c.identity);
 // Same-instance library cache only checks existence: our path still repeats
 // a full independent verification and replaces the hint before invoking it.
 await fs.writeFile(paths[0],Buffer.alloc(f.payload.length,3));
 await f.u.downloadUpdate();assert.equal(f.downloads,1);assert((await fs.readFile(paths[0])).equals(f.payload));
});
test('library install is unauthorized until armed, then independently acknowledged before quit',async()=>{
 const f=await setup();await f.u.checkForUpdates();await f.u.downloadUpdate();
 // A failed public install consumes its instance. Use a fresh one for retry.
 assert.equal(f.u.install(false,false),false);
 const other=await setup();await other.u.checkForUpdates();await other.u.downloadUpdate();let calls=0,quits=0;
 const prepared=await other.bridge.prepare(other.u,{silent:false,relaunch:true,makeAdapter(options){return createNSISAdapter({...options,platform:'win32',spawn(exe,args){calls++;assert.deepEqual(args,['--updated','--force-run']);const child=new EventEmitter();child.unref=()=>{};setImmediate(()=>child.emit('spawn'));return child;}});}});
 assert.equal(calls,0);
 const ok=await completeHandoff({...prepared,barrier:async()=>true,quit:()=>{quits++;},restore:()=>{}});
 assert.equal(ok,true);assert.equal(calls,1);assert.equal(quits,1);await prepared.release();assert.equal(other.u.install(),false);
});
test('cancelled close barrier never arms the public installer',async()=>{
 const f=await setup();await f.u.checkForUpdates();await f.u.downloadUpdate();let calls=0;
 const p=await f.bridge.prepare(f.u,{makeAdapter(o){return createNSISAdapter({...o,platform:'win32',spawn(){calls++;}});}});
 assert.equal(await completeHandoff({...p,barrier:async()=>false,quit(){throw Error('quit');},restore:()=>{}}),false);
 assert.equal(calls,0);assert.equal(f.u.quitAndInstallCalled,false);await p.release();
});
test('malicious disk cache hints and unknown pending files are refused before library access',async()=>{
 const f=await setup();await f.u.checkForUpdates();const dir=path.join(f.root,'library','pending');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const outside=path.join(f.dir,'outside');await fs.writeFile(outside,'untouched');
 await fs.symlink(outside,path.join(dir,'update-info.json'));
 await assert.rejects(()=>f.u.downloadUpdate());assert.equal(await fs.readFile(outside,'utf8'),'untouched');assert.throws(()=>f.bridge.ready(f.u));
 await fs.unlink(path.join(dir,'update-info.json'));await fs.writeFile(path.join(dir,'unrelated'),'keep',{mode:0o600});
 await assert.rejects(()=>f.u.downloadUpdate());assert.equal(await fs.readFile(path.join(dir,'unrelated'),'utf8'),'keep');
});
test('late library-path mutation before its returned result cannot produce a ready receipt',async()=>{
 const f=await setup();await f.u.checkForUpdates();
 f.u.on('update-downloaded',event=>require('node:fs').writeFileSync(event.downloadedFile,Buffer.alloc(f.payload.length,7)));
 await assert.rejects(()=>f.u.downloadUpdate());assert.throws(()=>f.bridge.ready(f.u));
});
test('cache-only configuration is explicit and contains no feed',async()=>{
 const pkg=require('../../desktop/package.json');assert(pkg.build.files.includes('update-cache.yml'));
 assert.equal(await fs.readFile(path.resolve(__dirname,'../../desktop/update-cache.yml'),'utf8'),'updaterCacheDirName: library\n');
});
test('actual library cancellation before transfer and after its early downloaded event cannot become ready',async()=>{
 const {CancellationToken}=createRequire(path.resolve(__dirname,'../../desktop/package.json'))('builder-util-runtime');
 for(const early of [true,false]){const f=await setup(),token=new CancellationToken();await f.u.checkForUpdates();
 if(early)token.cancel();else f.u.on('update-downloaded',()=>token.cancel());
 await assert.rejects(()=>f.u.downloadUpdate(token));assert.throws(()=>f.bridge.ready(f.u));
 if(early)assert.equal(f.downloads,0);assert.equal(token.listenerCount('cancel'),0);}
});
test('disposing a ready controller revokes preparation and late pending library results',async()=>{
 const f=await setup();await f.u.checkForUpdates();await f.u.downloadUpdate();f.bridge.dispose();assert.throws(()=>f.bridge.ready(f.u));await assert.rejects(()=>f.bridge.prepare(f.u));
 const other=await setup();await other.u.checkForUpdates();other.u.on('update-downloaded',()=>other.bridge.dispose());
 await assert.rejects(()=>other.u.downloadUpdate());assert.throws(()=>other.bridge.ready(other.u));
});
test('second update after completed first uses the real bridge/cache and purges only after ACK',async()=>{
 const f=await setup();await f.u.checkForUpdates();const files=await f.u.downloadUpdate();
 let quit=false;const prepared=await f.bridge.prepare(f.u,{makeAdapter:o=>createNSISAdapter({...o,platform:'win32',spawn(){const c=new EventEmitter();c.unref=()=>{};setImmediate(()=>c.emit('spawn'));return c;}})});
 assert.equal(await completeHandoff({...prepared,barrier:async()=>true,restore(){},async quit(){quit=true;assert.deepEqual(await fs.readdir(path.dirname(files[0])),[]);}}),true);
 assert.equal(quit,true);await prepared.release();
 const second=await setup({dir:f.dir,version:'0.4.1',sequence:43,now:f.now+1000});
 await second.u.checkForUpdates();const next=await second.u.downloadUpdate();assert.equal(path.basename(next[0]),second.c.artifact.name);
 const lease=await second.cache.acquire(second.bridge.ready(second.u));await lease.release();
});
test('older verified pending residue is removed before preparing the next generation',async()=>{
 const f=await setup();await f.u.checkForUpdates();const files=await f.u.downloadUpdate();
 const next=await setup({dir:f.dir,version:'0.4.1',sequence:43,now:f.now+1000});
 await next.u.checkForUpdates();await next.u.downloadUpdate();
 assert.equal(await fs.stat(files[0]).catch(()=>null),null);
 assert.deepEqual((await fs.readdir(path.dirname(files[0]))).sort(),[next.c.artifact.name,'update-info.json'].sort());
});
for(const kind of ['tampered','symlink','hardlink'])test('older '+kind+' pending artifact is retained and fails closed',async()=>{
 const f=await setup();await f.u.checkForUpdates();const [file]=await f.u.downloadUpdate(),outside=path.join(f.dir,'outside');
 if(kind==='tampered')await fs.writeFile(file,Buffer.alloc(f.payload.length,9));
 else{await fs.rename(file,outside);if(kind==='symlink')await fs.symlink(outside,file);else await fs.link(outside,file);}
 const next=await setup({dir:f.dir,version:'0.4.1',sequence:43,now:f.now+1000});
 await next.u.checkForUpdates();await assert.rejects(()=>next.u.downloadUpdate());assert(await fs.lstat(file));assert.throws(()=>next.bridge.ready(next.u));
});
test('real post-ACK pending cleanup failure blocks quit, preserves ACK and frees cache ownership',async()=>{
 const f=await setup();await f.u.checkForUpdates();const [file]=await f.u.downloadUpdate();let quits=0,restores=0;
 const prepared=await f.bridge.prepare(f.u,{makeAdapter:o=>createNSISAdapter({...o,platform:'win32',spawn(){
 const c=new EventEmitter();c.unref=()=>{};setImmediate(()=>{require('node:fs').writeFileSync(file,Buffer.alloc(f.payload.length,1));c.emit('spawn');});return c;
 }})});
 assert.equal(await completeHandoff({...prepared,barrier:async()=>true,quit(){quits++;},restore(){restores++;}}),false);
 assert.equal(prepared.adapter.state,'acknowledged');assert.equal(quits,0);assert.equal(restores,1);
 await assert.rejects(()=>prepared.release());assert(await fs.stat(file));
 const lease=await f.cache.acquire(f.bridge.ready(f.u));await lease.release();
});
