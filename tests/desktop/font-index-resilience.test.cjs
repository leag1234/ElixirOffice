// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events'),{Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'../..'),workerFile=path.join(root,'desktop/font-index-worker.cjs'),fontsFile=path.join(root,'desktop/fonts.cjs'),localRequire=createRequire(workerFile);
const limits=localRequire('./font-limits.cjs'),cache=localRequire('./font-index-cache.cjs'),{Fonts}=localRequire('./fonts.cjs');
async function rawFont(){
 const metadata=await fs.readFile(path.join(root,'desktop/assets/sdkjs/common/AllFonts.js'),'utf8');
 const array=name=>JSON.parse(metadata.match(new RegExp('window\\["'+name+'"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);'))[1]);
 const info=array('__fonts_infos').find(value=>value[0]==='Carlito'),file=array('__fonts_files')[info[1]];
 const bytes=Buffer.from(await fs.readFile(path.join(root,'desktop/assets/fonts',file))),wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
 for(let i=0;i<Math.min(32,bytes.length);i++)bytes[i]^=wire[i%16];
 return bytes;
}
function isolatedWorker(overrides={},saves=[],hooks={}){
 const module={exports:{}};
 const require=id=>id==='node:fs/promises'&&hooks.fs?hooks.fs:id==='node:worker_threads'?{parentPort:null}:id==='./font-limits.cjs'?{...limits,...overrides}:id==='./font-index-cache.cjs'?{...cache,...hooks.cache,async save(file,value){await cache.save(file,value);saves.push({complete:value.complete,records:Object.keys(value.records).length});}}:localRequire(id);
 vm.runInNewContext('(function(require,module){'+sync.readFileSync(workerFile,'utf8')+'})(require,module)',{require,module,Buffer,AbortController,Uint8Array,Date,setTimeout,clearTimeout});
 return module.exports.build;
}
async function fixture(count=3){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-font-resilience-')),raw=await rawFont(),fonts=path.join(folder,'fonts'),cacheDir=path.join(folder,'cache');
 await fs.mkdir(fonts);for(let i=0;i<count;i++)await fs.writeFile(path.join(fonts,String(i)+'.ttf'),raw);
 return {folder,fonts,cacheDir,raw,options:{roots:[fonts],cacheDir,bundleIdentity:'public-resilience'}};
}
test('byte budget keeps the indexed prefix, checkpoints it and resumes from the partial cache',async()=>{
 const f=await fixture();try{
  const saves=[],build=isolatedWorker({indexReadBytes:f.raw.length+1},saves),partial=await build(f.options);
  assert.equal(partial.system.length,1);assert.equal(partial.stats.reason,'bytes');assert.equal(partial.stats.truncated,true);assert(partial.stats.readBytes<=f.raw.length+1);
  const saved=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));
  assert.equal(saved.complete,false);assert.equal(Object.keys(saved.records).length,1);
  assert(saves.some(x=>!x.complete&&x.records===1),'A populated checkpoint must exist before finalization');
  const resumed=await isolatedWorker()(f.options);assert.equal(resumed.system.length,3);assert.equal(resumed.stats.cacheHits,1);assert.equal(resumed.stats.truncated,false);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8')).complete,true);
 }finally{await fs.rm(f.folder,{recursive:true,force:true});}
});
test('eligible-face budget truncates normally instead of discarding already indexed faces',async()=>{
 const f=await fixture();try{
  const result=await isolatedWorker({indexFaces:1})(f.options);
  assert.equal(result.stats.eligibleFaces,1);assert.equal(result.system.length,1);assert.equal(result.stats.reason,'faces');assert.equal(result.stats.truncated,true);
  const saved=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));assert.equal(saved.complete,false);assert(Object.keys(saved.records).length>=1);
 }finally{await fs.rm(f.folder,{recursive:true,force:true});}
});
test('cache schema mismatches rebuild real metadata and private cache directory checks stay strict',async()=>{
 const f=await fixture(1);try{
  const build=isolatedWorker();await build(f.options);const file=path.join(f.cacheDir,'index-v3.json'),good=JSON.parse(await fs.readFile(file,'utf8'));
  const mutations=[v=>{v.records=[];},v=>{Object.values(v.records)[0].faces[0].coverage=[[5,3]];},
   v=>{Object.values(v.records)[0].faces[0].family=null;},v=>{Object.values(v.records)[0].faces[0].faceIndex=0x7fffffff;},
   v=>{Object.values(v.records)[0].faces[0].id='not-a-handle';},v=>{Object.values(v.records)[0].faces[0].faceIndex=2**32;},v=>{Object.values(v.records)[0].sha256=[Object.values(v.records)[0].sha256];},v=>{Object.values(v.records)[0].faces[0].id=['11111111-1111-4111-8111-111111111111'];},v=>{Object.values(v.records)[0].bytes=1;}];
  for(const mutate of mutations){
   const bad=structuredClone(good);mutate(bad);await fs.writeFile(file,JSON.stringify(bad));const result=await build(f.options);
   assert.equal(result.system.length,1);assert.equal(result.stats.cacheHits,0);assert.equal(result.stats.readBytes,f.raw.length);
  }
  await fs.writeFile(file,'{invalid JSON');assert.equal((await build(f.options)).system.length,1);
  const link=path.join(f.folder,'cache-link');await fs.symlink(f.cacheDir,link,'dir');
  await assert.rejects(build({...f.options,cacheDir:link}),/Invalid private font cache/);
  assert.equal((await fs.stat(file)).mode&511,384);
 }finally{await fs.rm(f.folder,{recursive:true,force:true});}
});
test('symlink roots index and read inside their canonical snapshot while outside links and retargets stay blocked',async()=>{
 const f=await fixture(1);const fonts=new Fonts();try{
  const outside=path.join(f.folder,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'outside.ttf'),f.raw);
  await fs.symlink(path.join(outside,'outside.ttf'),path.join(f.fonts,'escape.ttf'));
  const link=path.join(f.folder,'root-link');await fs.symlink(f.fonts,link,'dir');
  fonts.allowed=[link];fonts.configure({cacheDir:f.cacheDir,bundleIdentity:'symlink-root'});
  const index=await fonts.index();assert.equal(index.system.length,1);assert(!JSON.stringify(index).includes(f.folder));
  assert.deepEqual(Buffer.from(await fonts.read(index.system[0].id)),f.raw);
  await fs.unlink(link);await fs.symlink(outside,link,'dir');
  await assert.rejects(fonts.read(index.system[0].id),/outside approved folders/);
 }finally{fonts.clear();await fs.rm(f.folder,{recursive:true,force:true});}
});
function fakeService(){
 const timers=[],workers=[];
 class FakeWorker extends EventEmitter{
  constructor(file,options){super();this.options=options;workers.push(this);}
  postMessage(value){this.sent=value;}
  terminate(){this.emit('exit');}
 }
 const module={exports:{}},require=createRequire(fontsFile);
 vm.runInNewContext('(function(require,module){'+sync.readFileSync(fontsFile,'utf8')+'})(require,module)',{
  require:id=>id==='node:worker_threads'?{Worker:FakeWorker}:require(id),module,Buffer,process,__dirname:path.dirname(fontsFile),
  setTimeout:(callback,ms)=>{const value={callback,ms};timers.push(value);return value;},clearTimeout:()=>{}
 });
 const fonts=new module.exports.Fonts();fonts.allowed=[];fonts.configure({bundleIdentity:'session'});
 return {fonts,timers,workers};
}
test('failed discovery remains failed across clear and repeated frame requests without spawning retries',async()=>{
 const {fonts,timers,workers}=fakeService(),one=fonts.index(),two=fonts.index();
 assert.equal(workers.length,1);assert(timers[0].ms>limits.warmIndexMs&&timers[0].ms<=limits.coldIndexMs);
 workers[0].emit('message',{phase:'cache',warm:true});assert(timers.at(-1).ms<=limits.warmIndexMs);
 workers[0].emit('message',{error:'fixture discovery failure'});
 await assert.rejects(one,/fixture discovery failure/);await assert.rejects(two,/fixture discovery failure/);
 fonts.clear();await assert.rejects(fonts.index(),/fixture discovery failure/);assert.equal(workers.length,1);assert.equal(fonts.peek(),null);
});
test('only the first cold discovery gets the long deadline and timeout requests a checkpoint before termination',async()=>{
 const {fonts,timers,workers}=fakeService(),first=fonts.index();
 workers[0].emit('message',{result:{id:'ready',handles:[],resolvedRoots:[],system:[],bundled:[],stats:{}}});await first;assert.equal(fonts.peek().id,'ready');
 fonts.clear();const second=fonts.index();assert.equal(workers.length,2);assert(timers.at(-1).ms<=limits.warmIndexMs);
 timers.at(-1).callback();assert.equal(workers[1].sent.stop,'deadline');assert.equal(timers.at(-1).ms,limits.indexStopGraceMs);
 workers[1].emit('message',{result:{id:'partial',handles:[],resolvedRoots:[],system:[],bundled:[],stats:{truncated:true,reason:'deadline'}}});
 assert.equal((await second).stats.reason,'deadline');fonts.clear();
});
test('a real worker cooperatively stops at its deadline and leaves an atomic partial checkpoint',async()=>{
 const f=await fixture(3);try{
  const result=await new Promise((resolve,reject)=>{
   const worker=new Worker(workerFile,{workerData:f.options});
   worker.on('message',message=>{if(message.phase==='cache')worker.postMessage({stop:'deadline'});else if(message.error)reject(Error(message.error));else if(message.result)resolve(message.result);});
   worker.once('error',reject);
  });
  assert.equal(result.stats.truncated,true);assert.equal(result.stats.reason,'deadline');
  const file=path.join(f.cacheDir,'index-v3.json'),value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.complete,false);
  assert.equal((await fs.stat(file)).mode&511,384);assert(!(await fs.readdir(f.cacheDir)).some(name=>name.endsWith('.tmp')));
 }finally{await fs.rm(f.folder,{recursive:true,force:true});}
});

test('changing files cannot overrun the byte budget or publish unstable metadata',async()=>{
 for(const mutation of ['grow','truncate']){
  const f=await fixture(1);let requested=0,actual=0,opened=false;
  try{
   const instrumented={...fs,async open(file,...args){
    const handle=await fs.open(file,...args);if(!file.endsWith('.ttf'))return handle;
    opened=true;let changed=false;
    return {stat:()=>handle.stat(),close:()=>handle.close(),async read(buffer,offset,length,position){
     requested+=length;
     if(mutation==='truncate'&&!changed){await fs.truncate(file,Math.floor(f.raw.length/2));changed=true;}
     const result=await handle.read(buffer,offset,length,position);actual+=result.bytesRead;
     if(mutation==='grow'&&!changed){await fs.appendFile(file,Buffer.alloc(f.raw.length*2));changed=true;}
     return result;
    }};
   }};
   const result=await isolatedWorker({indexReadBytes:f.raw.length},[],{fs:instrumented})(f.options);
   assert(opened);assert.equal(result.system.length,0);assert.equal(result.handles.length,0);
   assert.equal(result.stats.skipped,1);assert.equal(result.stats.readBytes,actual);
   assert(actual<=f.raw.length);assert(requested<=f.raw.length*2);
   assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8')).records,{});
  }finally{await fs.rm(f.folder,{recursive:true,force:true});}
 }
});
test('metadata cap publishes only the persisted prefix and resumes without dangling handles',async()=>{
 const f=await fixture(1);
 try{
  await isolatedWorker()(f.options);
  const file=path.join(f.cacheDir,'index-v3.json'),first=await fs.readFile(file,'utf8');
  await fs.writeFile(path.join(f.fonts,'1.ttf'),f.raw);
  const partial=await isolatedWorker({},[],{cache:{MAX_BYTES:Buffer.byteLength(first)+128}})(f.options);
  assert.equal(partial.stats.reason,'metadata');assert.equal(partial.stats.truncated,true);
  const saved=JSON.parse(await fs.readFile(file,'utf8')),records=Object.values(saved.records);
  assert.equal(saved.complete,false);assert.equal(records.length,1);assert.equal(partial.system.length,1);assert.equal(partial.handles.length,1);
  assert.equal(partial.stats.eligibleFaces,1);assert.equal(partial.handles[0].id,records[0].faces[0].id);
  const resumed=await isolatedWorker()(f.options);assert.equal(resumed.system.length,2);assert.equal(resumed.stats.cacheHits,1);
 }finally{await fs.rm(f.folder,{recursive:true,force:true});}
});

test('system font directory/file denials keep readable siblings and valid cache checkpoints',async()=>{
 const f=await fixture(3);
 try{
  const protectedFolder=path.join(f.fonts,'protected');await fs.mkdir(protectedFolder);await fs.writeFile(path.join(protectedFolder,'hidden.ttf'),f.raw);
  for(const code of ['EPERM','EBUSY','EACCES','UNKNOWN','ENOTSUP']){
   const instrumented={...fs,
    async readdir(directory,...args){if(directory===protectedFolder)throw Object.assign(Error('Injected directory denial'),{code});return fs.readdir(directory,...args)},
    async open(file,...args){if(file===path.join(f.fonts,'0.ttf'))throw Object.assign(Error('Injected font denial'),{code});return fs.open(file,...args)}
   };
   const result=await isolatedWorker({},[],{fs:instrumented})(f.options);
   assert.equal(result.system.length,2);assert.equal(result.handles.length,2);assert(result.stats.skipped>=2);
   const saved=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index-v3.json'),'utf8'));assert.equal(saved.complete,true);assert.equal(Object.keys(saved.records).length,2);
   assert(!JSON.stringify(result.system).includes(f.folder));
  }
  const realpath=fs.realpath,outside=path.join(f.folder,'unreadable-root');await fs.mkdir(outside);
  try{
   fs.realpath=async(value,...args)=>{if(value===outside)throw Object.assign(Error('Injected root denial'),{code:'EPERM'});return realpath(value,...args)};
   const result=await isolatedWorker()( {...f.options,roots:[outside,f.fonts]} );assert(result.system.length>=2);
  }finally{fs.realpath=realpath}
 }finally{await fs.rm(f.folder,{recursive:true,force:true})}
});
