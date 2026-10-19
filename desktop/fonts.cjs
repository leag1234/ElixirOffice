// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const limits=require('./font-limits.cjs');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const retryWindow=require('./windows-io.cjs');
const registryFonts=require('./font-registry.cjs');
function roots() {
  if (process.platform === 'win32') return [path.join(process.env.WINDIR || 'C:\\Windows','Fonts'), path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),'Microsoft/Windows/Fonts')];
  if (process.platform === 'darwin') return ['/System/Library/Fonts','/Library/Fonts',path.join(os.homedir(),'Library/Fonts')];
  return ['/usr/share/fonts','/usr/local/share/fonts',path.join(os.homedir(),'.local/share/fonts'),path.join(os.homedir(),'.fonts')];
}
function names(bytes, offset) {
  const count = bytes.readUInt16BE(offset+4); let table;
  if (count > 256 || offset+12+count*16 > bytes.length) throw Error('Invalid font tables');
  for(let i=0;i<count;i++) { const at=offset+12+i*16; if(bytes.toString('ascii',at,at+4)==='name')table=bytes.readUInt32BE(at+8); }
  if (table === undefined || table+6 > bytes.length) throw Error('Font has no names');
  const entries=bytes.readUInt16BE(table+2), start=table+bytes.readUInt16BE(table+4), result={};
  if(entries>4096 || table+6+entries*12>bytes.length)throw Error('Invalid font names');
  for(let i=0;i<entries;i++) {
    const at=table+6+i*12, platform=bytes.readUInt16BE(at), lang=bytes.readUInt16BE(at+4), id=bytes.readUInt16BE(at+6);
    if(![1,2,4,6,16,17].includes(id))continue;
    const length=bytes.readUInt16BE(at+8), position=start+bytes.readUInt16BE(at+10);
    if(position+length>bytes.length || length>2048)continue;
    const data=bytes.subarray(position,position+length); let text;
    if(platform===0 || platform===3) { if(length%2)continue; text=Buffer.from(data).swap16().toString('utf16le'); }
    else if(platform===1)text=data.toString('latin1'); else continue;
    if(text && (!result[id] || lang===0x409))result[id]=text.replace(/\0/g,'');
  }
  const family=result[16]||result[1],style=result[17]||result[2]||'Regular';
  if(!family)return null;
  return {family,style,fullName:result[4]||family+' '+style,postscriptName:result[6]||family.replace(/\s/g,'')+'-'+style};
}
function fontPath(filename){
  const resolved=path.resolve(filename);
  return process.platform==='win32'?path.toNamespacedPath(resolved).toLowerCase():resolved;
}
function inside(allowed,filename){
  const real=fontPath(filename);
  return allowed.some(root=>real.startsWith(fontPath(root)+path.sep));
}
async function fontData(allowed,filename,identity,retry,withHandle,registered=new Set()){
  let selected=identity;
  return retry(async()=>{
    const real=await fs.realpath(filename);
    if(!inside(allowed,real)&&!registered.has(fontPath(real)))throw Error('Font moved outside approved folders');
    const named=await fs.lstat(real,{bigint:true});
    if(!named.isFile()||named.isSymbolicLink()||named.size>BigInt(limits.fileBytes))throw Error('Invalid font');
    const same=stat=>!stat.isSymbolicLink()&&stat.isFile()&&stat.dev===selected.dev&&stat.ino===selected.ino&&stat.size===selected.size&&stat.mtimeNs===selected.mtimeNs;
    selected??={real,dev:named.dev,ino:named.ino,size:named.size,mtimeNs:named.mtimeNs};
    if(fontPath(real)!==fontPath(selected.real)||!same(named))throw Error('Font changed during read');
    let bytes;
    if(withHandle){
      const flags=require('node:fs').constants;
      const handle=await fs.open(real,flags.O_RDONLY|(process.platform==='win32'?0:(flags.O_NOFOLLOW||0)));
      try{
        if(!same(await handle.stat({bigint:true})))throw Error('Font changed during read');
        bytes=await handle.readFile();
        if(!same(await handle.stat({bigint:true})))throw Error('Font changed during read');
      }finally{await handle.close()}
    }else bytes=await fs.readFile(real);
    if(bytes.length>limits.fileBytes)throw Error('Font grew beyond the allowed size');
    if(!same(await fs.lstat(real,{bigint:true}))||fontPath(await fs.realpath(filename))!==fontPath(real))throw Error('Font changed during read');
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    if(selected.hash&&selected.hash!==digest)throw Error('Font changed during read');
    return {real,bytes,identity:{...selected,hash:digest}};
  });
}
class Fonts {
  constructor({report=()=>{},registry=registryFonts}={}) { this.report=report;this.registry=registry;this.registered=new Set();this.allowed=roots(); this.files=new Map(); this.byteCache=new Map();this.pendingReads=new Map();this.cachedBytes=0;this.reservedBytes=0;this.readControllers=new Set(); }
  configure(options) { this.options=options;this.catalogue=null;this.readyCatalogue=null; }
  peek() { return this.readyCatalogue||null; }
  async index() {
    if(!this.options)throw Error('Font index is not configured');
    if(this.discoveryFailure)throw this.discoveryFailure;
    if(!this.catalogue){
      const generation=this.generation||0,cold=!this.coldDiscoveryUsed;this.coldDiscoveryUsed=true;
      const {Worker}=require('node:worker_threads');
      this.catalogue=new Promise((resolve,reject)=>{
        const worker=new Worker(path.join(__dirname,'font-index-worker.cjs'),{workerData:{...this.options,roots:this.allowed},resourceLimits:{maxOldGenerationSizeMb:256}});
        this.worker=worker;let answered=false,deadline,stopGrace;const started=Date.now();
        const cleanup=()=>{clearTimeout(deadline);clearTimeout(stopGrace);};
        const arm=warm=>{
          clearTimeout(deadline);
          const duration=warm||!cold?limits.warmIndexMs:limits.coldIndexMs;
          deadline=setTimeout(()=>{
            worker.postMessage({stop:'deadline'});
            stopGrace=setTimeout(()=>{if(answered)return;answered=true;worker.terminate();reject(Error('Computer font indexing timed out'));},limits.indexStopGraceMs);
          },Math.max(1,duration-(Date.now()-started)));
        };
        arm(false);
        worker.on('message',message=>{
          if(answered)return;
          if(message.phase==='file-error'){this.report({code:message.code});return;}
          if(message.phase==='cache'){arm(message.warm===true);return;}
          answered=true;cleanup();
          if((this.generation||0)!==generation){reject(Error('Computer font access changed'));return;}
          if(message.error){reject(Error(message.error));return;}
          const {handles,resolvedRoots,...index}=message.result;
          this.resolvedRoots=resolvedRoots;this.files=new Map(handles.map(file=>[file.id,file]));
          this.readyCatalogue=index;resolve(index);
        });
        worker.once('error',error=>{if(answered)return;answered=true;cleanup();reject(error);});
        worker.once('exit',()=>{cleanup();if(!answered){answered=true;reject(Error('Font index worker stopped'));}});
      }).catch(error=>{
        // Keep a failed discovery for this application session, including after
        // revocation. A new frame or Home refresh must not start a retry loop.
        if((this.generation||0)===generation)this.discoveryFailure=error;
        throw error;
      });
    }
    return this.catalogue;
  }
  clear() { for(const controller of this.readControllers)controller.abort();this.readControllers.clear();this.reservedBytes=0;this.generation=(this.generation||0)+1;this.worker?.terminate();this.worker=null;this.files.clear();this.catalogue=null;this.readyCatalogue=null;this.resolvedRoots=null;this.registered.clear();this.byteCache.clear();this.pendingReads.clear();this.cachedBytes=0;this.reservedBytes=0;this.readControllers=new Set(); }
  async enumerate() {
    if(this.options)return (await this.index()).system;
    const resolved=await canonicalRoots(this.allowed,this.report);this.resolvedRoots=resolved;
    const previous=new Map(Array.from(this.files,([id,file])=>[file.real+'|'+(file.offset||0),{id,hash:file.identity?.hash}])),next=new Map(),found=[],visited=new Set(),scanned=new Set(),registeredPaths=new Set(),retry=retryWindow(process.platform,1000);
    const collect=async filename=>{
        let real,bytes,identity;
        try {
          const canonical=await fs.realpath(filename);if(scanned.has(fontPath(canonical)))return;
          ({real,bytes,identity}=await fontData(resolved,filename,null,retry,false,registeredPaths));
          scanned.add(fontPath(real));
          const offsets=bytes.toString('ascii',0,4)==='ttcf'?Array.from({length:Math.min(bytes.readUInt32BE(8),64)},(_,i)=>bytes.readUInt32BE(12+i*4)):[0];
          for(const offset of offsets) {
            if(next.size>=5000)break;
            try{const face=names(bytes,offset);if(face){const prior=previous.get(real+'|'+offset),id=prior?.hash===identity.hash?prior.id:crypto.randomUUID();next.set(id,{real,offset,identity});found.push({...face,id});}}
            catch(error){await this.report(error)}
          }
        } catch(error) { await this.report(error); }
    };
    const walk=async directory=>{
      let entries;
      try{
        const real=await fs.realpath(directory),key=fontPath(real);
        if(!resolved.some(root=>fontPath(root)===key)&&!inside(resolved,real))return;
        if(visited.has(key))return;
        const stat=await fs.lstat(real);if(!stat.isDirectory()||stat.isSymbolicLink())return;
        visited.add(key);entries=await fs.readdir(directory,{withFileTypes:true});
      }catch(error){if(error.code==='ENOENT')return;await this.report(error);if(error.code)return;throw error}
      for(const entry of entries) {
        if(next.size>=5000)return;
        const filename=path.join(directory,entry.name);
        if(entry.isDirectory()) { await walk(filename); continue; }
        if(!/\.(ttf|otf|ttc)$/i.test(entry.name))continue;
        await collect(filename);
      }
    };
    for(const root of resolved)await walk(root);
    let registered=[];
    try{registered=await this.registry({report:this.report})}catch(error){await this.report(error)}
    for(const filename of registered){
      if(next.size>=5000)break;
      try{
        if(typeof filename!=='string'||!/\.(ttf|otf|ttc)$/i.test(filename))continue;
        const real=await fs.realpath(filename);if(fontPath(real)!==fontPath(filename))throw Error('Registered font path changed');registeredPaths.add(fontPath(real));
        await collect(filename);
      }catch(error){await this.report(error)}
    }
    this.files=next;this.registered=registeredPaths;return found;
  }
  async read(id) {
    const generation=this.generation||0,font=this.files.get(id);
    if(!font)throw Error('Unknown font handle');
    const retry=retryWindow(process.platform,1000);
    const current=()=>{if((this.generation||0)!==generation||this.files.get(id)!==font)throw Error('Computer font access changed');};
    try{
      current();
      if(font.identity){
        const roots=await canonicalRoots(this.allowed,this.report),approved=(this.resolvedRoots||roots).filter(root=>roots.some(value=>fontPath(value)===fontPath(root)));
        const loaded=await fontData(approved,font.real,font.identity,retry,true,this.registered);current();
        return new Uint8Array(loaded.bytes);
      }
      return await retry(async()=>{current();return this.readIndexed(id,font,generation);});
    }catch(error){await this.report(error);throw error}
  }
  async readIndexed(id,font,generation) {
    const real=await fs.realpath(font.real),currentRoots=await canonicalRoots(this.allowed,this.report);
    const approved=this.resolvedRoots||currentRoots;
    const registered=font.registryPath&&fontPath(await fs.realpath(font.registryPath))===fontPath(real);
    if(fontPath(real)!==fontPath(font.real)||!registered&&!approved.some(root=>currentRoots.some(current=>fontPath(current)===fontPath(root))&&inside([root],real)))throw Error('Font moved outside approved folders');
    const named=await fs.lstat(real);
    if(!named.isFile()||named.isSymbolicLink())throw Error('Computer font changed during read');
    const handle=await fs.open(real,require('node:fs').constants.O_RDONLY|(process.platform==='win32'?0:(require('node:fs').constants.O_NOFOLLOW||0)));
    try{
      const stat=await handle.stat(),signature=[stat.size,stat.mtimeMs,stat.ctimeMs,stat.ino].join(':');
      if(stat.ino!==named.ino||stat.dev!==named.dev)throw Error('Computer font changed during read');
      if(!stat.isFile()||stat.size>limits.fileBytes)throw Error('Computer font exceeds 128 MiB limit');
      if(font.signature&&font.signature!==signature){this.clear();throw Error('Computer font changed; reopen the document');}
      if((this.generation||0)!==generation)throw Error('Computer font access changed');
      const key=font.sha256||real,cached=this.byteCache.get(key);
      if(cached){this.byteCache.delete(key);this.byteCache.set(key,cached);return cached;}
      let pending=this.pendingReads.get(key);
      if(!pending){
        while(this.cachedBytes+this.reservedBytes+stat.size>limits.selectedBytes&&this.byteCache.size){
          const oldest=this.byteCache.keys().next().value;this.cachedBytes-=this.byteCache.get(oldest).length;this.byteCache.delete(oldest);
        }
        if(this.cachedBytes+this.reservedBytes+stat.size>limits.selectedBytes)throw Error('Selected computer fonts exceed 192 MiB');
        const controller=new AbortController();this.readControllers.add(controller);this.reservedBytes+=stat.size;
        pending=(async()=>{
          const bytes=await handle.readFile({signal:controller.signal});
          if(bytes.length>limits.fileBytes)throw Error('Computer font grew beyond 128 MiB');
          const after=await handle.stat();
          if([after.size,after.mtimeMs,after.ctimeMs,after.ino].join(':')!==signature||font.sha256&&crypto.createHash('sha256').update(bytes).digest('hex')!==font.sha256){this.clear();throw Error('Computer font changed; reopen the document');}
          const entry=await fs.lstat(real);
          if(entry.isSymbolicLink()||entry.ino!==stat.ino||entry.dev!==stat.dev||fontPath(await fs.realpath(font.real))!==fontPath(real)){this.clear();throw Error('Computer font changed during read');}
          if((this.generation||0)!==generation)throw Error('Computer font access changed');
          while(this.cachedBytes+bytes.length>limits.selectedBytes&&this.byteCache.size){
            const oldest=this.byteCache.keys().next().value;this.cachedBytes-=this.byteCache.get(oldest).length;this.byteCache.delete(oldest);
          }
          const result=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
          this.byteCache.set(key,result);this.cachedBytes+=result.length;return result;
        })().finally(()=>{this.readControllers.delete(controller);if((this.generation||0)===generation)this.reservedBytes-=stat.size;});
        this.pendingReads.set(key,pending);
      }
      try{const bytes=await pending;if((this.generation||0)!==generation)throw Error('Computer font access changed');return bytes;}
      finally{if(this.pendingReads.get(key)===pending)this.pendingReads.delete(key);}
    }finally{await handle.close();}
  }
}
async function canonicalRoots(allowed,report=()=>{}) {
  const result=[];
  for(const root of allowed){
    try{const real=await fs.realpath(root);if((await fs.stat(real)).isDirectory()&&!result.some(previous=>fontPath(previous)===fontPath(real)))result.push(real);}
    catch(error){if(error.code!=='ENOENT')await report(error);if(!error.code)throw error;}
  }
  return result;
}
module.exports={Fonts,names,roots,canonicalRoots,fontPath,inside};
