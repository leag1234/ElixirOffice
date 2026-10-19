// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),flags=require('node:fs').constants;
const {fallbackFamilies,eligible}=require('./font-resolver.js');
const retryWindow=require('./windows-io.cjs');
const registryFonts=require('./font-registry.cjs');
const {names,canonicalRoots,inside,fontPath}=require('./fonts.cjs'),sfnt=require('./font-sfnt.cjs'),limits=require('./font-limits.cjs'),cache=require('./font-index-cache.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
let stopRequested=false;
if(parentPort)parentPort.on('message',message=>{if(message?.stop){stopRequested=true;}});
function reportFileError(error){
 if(error?.code!=='ENOENT'&&/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||''))parentPort?.postMessage({phase:'file-error',code:error.code});
}
async function build(options){
 const {cacheDir,bundled,bundleIdentity}=options,resolvedRoots=await canonicalRoots(options.roots||[],reportFileError);
 let old={records:{}},cachePath;
 if(cacheDir){
  await fs.mkdir(cacheDir,{recursive:true,mode:0o700});const st=await fs.lstat(cacheDir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Invalid private font cache');
  await fs.chmod(cacheDir,0o700);cachePath=path.join(cacheDir,'index-v3.json');
  old=await cache.load(cachePath,bundleIdentity)||{records:{}};
 }
 parentPort?.postMessage({phase:'cache',warm:old.complete===true&&Object.keys(old.records).length>0});
 const records={},handles=[],system=[],bundledFaces=[],stats={files:0,cacheHits:0,readBytes:0,skipped:0,eligibleFaces:0,ineligibleFaces:0,truncated:false,reason:null};
 const visited=new Set(),directories=new Set(),identities=new Map(),retry=retryWindow(undefined,1000);let checkpointFiles=0,lastCheckpoint=0;
 const headerBytes=Buffer.byteLength(JSON.stringify({version:3,bundleIdentity,complete:false,records:{}}));let metadataBytes=headerBytes;
 function stop(reason){stats.truncated=true;stats.reason=stats.reason||reason;}
 async function checkpoint(complete=false,force=false){
  if(!cachePath)return;
  if(!force&&checkpointFiles>0&&stats.files-checkpointFiles<16&&Date.now()-lastCheckpoint<1000)return;
  await cache.save(cachePath,{version:3,bundleIdentity,complete,records});
  checkpointFiles=stats.files;lastCheckpoint=Date.now();
 }
 // An empty cold checkpoint survives a deadline before the first file completes.
 // A previously validated checkpoint stays intact until new records are ready.
 if(cachePath&&!Object.keys(old.records).length)await checkpoint(false,true);
 async function scanFile(real,source,decode=false){
  if(stopRequested){stop('deadline');return null;}
  const st=await fs.lstat(real);
  if(st.isSymbolicLink()||fontPath(await fs.realpath(real))!==fontPath(real)){const error=Error('Font changed during indexing');error.code='FONT_CHANGED';throw error;}
  if(!st.isFile()||st.size>limits.fileBytes){stats.skipped++;return null;}
  const key=source+':'+real,signature=[st.size,st.mtimeMs,st.ctimeMs,st.ino].join(':');let record=old.records[key];
  if(record?.signature===signature&&cache.validRecord(record)){stats.cacheHits++;}
  else{
   if(stats.readBytes+st.size>limits.indexReadBytes){stop('bytes');return null;}
   const handle=await fs.open(real,flags.O_RDONLY|(flags.O_NOFOLLOW||0));let raw;
   try{
    const opened=await handle.stat();
    if([opened.size,opened.mtimeMs,opened.ctimeMs,opened.ino].join(':')!==signature){const error=Error('Font changed during indexing');error.code='FONT_CHANGED';throw error;}
    raw=Buffer.alloc(st.size);let position=0;
    while(position<raw.length){
     if(stopRequested){stop('deadline');return null;}
     const {bytesRead}=await handle.read(raw,position,Math.min(1024*1024,raw.length-position),position);
     stats.readBytes+=bytesRead;if(!bytesRead)break;position+=bytesRead;
    }
    const after=await handle.stat();
    const final=await fs.lstat(real);
    if(final.isSymbolicLink()||final.ino!==st.ino||final.dev!==st.dev||fontPath(await fs.realpath(real))!==fontPath(real)||position!==raw.length||[after.size,after.mtimeMs,after.ctimeMs,after.ino].join(':')!==signature){const error=Error('Font changed during indexing');error.code='FONT_CHANGED';throw error;}
   }finally{await handle.close();}
   const bytes=decode?Buffer.from(raw):raw;if(decode)for(let i=0;i<Math.min(bytes.length,32);i++)bytes[i]^=wire[i%16];
   const faces=sfnt.offsets(bytes).flatMap((offset,faceIndex)=>{
    const face=names(bytes,offset);if(!face)return [];
    const inspected=sfnt.inspect(bytes,offset),base={...face,...inspected};
    return [{...base,faceIndex},...sfnt.instances(bytes,offset).map(instance=>({...base,style:instance.style,fullName:face.family+' '+instance.style,postscriptName:instance.postscriptName||face.postscriptName,instanceDefault:instance.isDefault,faceIndex:faceIndex|(instance.instance<<16)}))];
   });
   record={signature,sha256:sha(raw),bytes:raw.length,faces};
  }
  stats.files++;return {record,key,real};
 }
 function retain(entry){
  if(records[entry.key])return true;
  const size=Buffer.byteLength(JSON.stringify(entry.key))+1+Buffer.byteLength(JSON.stringify(entry.record))+1;
  if(metadataBytes+size>cache.MAX_BYTES){stop('metadata');return false;}
  metadataBytes+=size;records[entry.key]=entry.record;identities.set(entry.key,entry.record.sha256);
  return true;
 }
 async function collect(filename,registered=false){
   try{
    const real=await fs.realpath(filename);if(visited.has(fontPath(real))||(registered?fontPath(real)!==fontPath(filename):!inside(resolvedRoots,real)))return;visited.add(fontPath(real));
    const scanned=await retry(()=>scanFile(real,'system'));if(!scanned)return;const record=scanned.record,pendingFaces=[],pendingHandles=[];let eligibleCount=0,ineligibleCount=0;
    for(const face of record.faces){
     const usable=eligible({...face,source:'system'});
     if(usable&&stats.eligibleFaces+eligibleCount>=limits.indexFaces){stop('faces');break;}
     if(usable)eligibleCount++;else ineligibleCount++;
     const previous=old.records['system:'+real]?.sha256===record.sha256?old.records['system:'+real].faces.find(x=>x.faceIndex===face.faceIndex):null;
     const id=previous?.id||crypto.randomUUID();face.id=id;
     // Ineligible named-instance metadata remains available for safe name aliases;
     // only eligible faces consume the registration budget.
     pendingFaces.push({...face,source:'system',bytes:record.bytes,fileId:record.sha256});
     pendingHandles.push({id,real,offset:face.faceIndex,sha256:record.sha256,signature:record.signature,...(registered?{registryPath:filename}:{})});
    }
    if(retain(scanned)){
     for(const face of pendingFaces)system.push(face);
     for(const handle of pendingHandles)handles.push(handle);
     stats.eligibleFaces+=eligibleCount;stats.ineligibleFaces+=ineligibleCount;
    }
   }catch(error){
    if(stopRequested){stop('deadline');return;}
    if(error.code||error instanceof RangeError||/Invalid|Unsupported|Font has no names/.test(error.message)){stats.skipped++;reportFileError(error);return;}
    throw error;
   }
   await checkpoint();
 }
 async function walk(directory){
  if(stats.truncated||stopRequested){if(stopRequested)stop('deadline');return;}
  let entries;
  try{
   const real=await fs.realpath(directory),key=fontPath(real);
   if(!resolvedRoots.some(root=>fontPath(root)===key)&&!inside(resolvedRoots,real))return;
   if(directories.has(key))return;
   const stat=await fs.lstat(real);if(!stat.isDirectory()||stat.isSymbolicLink())return;
   directories.add(key);entries=await fs.readdir(directory,{withFileTypes:true});
  }catch(error){if(error.code){stats.skipped++;reportFileError(error);return;}throw error;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(stats.truncated||stopRequested){if(stopRequested)stop('deadline');break;}
   const filename=path.join(directory,entry.name);
   if(entry.isDirectory()){await walk(filename);continue;}
   if(!/\.(ttf|otf|ttc)$/i.test(entry.name))continue;
   await collect(filename);
  }
 }
 if(bundled){
  const text=await fs.readFile(path.join(bundled,'sdkjs/common/AllFonts.js'),'utf8');
  function array(name){const match=text.match(new RegExp('window\\["'+name+'"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);'));if(!match)throw Error('Bundled font metadata missing');return JSON.parse(match[1]);}
  const files=array('__fonts_files'),infos=array('__fonts_infos'),loaded=new Map();
  for(const info of infos)for(let style=0;style<4;style++){
   if(info.length!==9)throw Error('Invalid bundled font record');
   const index=info[1+style*2],faceIndex=info[2+style*2];if(index<0)continue;
   const file=files[index];if(typeof file!=='string'||!/^\d+$/.test(file))throw Error('Invalid bundled font path');
   if(!loaded.has(file)){const scanned=await scanFile(path.join(bundled,'fonts',file),'bundled',true);if(!scanned)throw Error('Bundled font indexing incomplete');if(!retain(scanned))throw Error('Bundled font metadata budget exceeded');loaded.set(file,scanned.record);await checkpoint();}
   const record=loaded.get(file),face=record.faces.find(f=>f.faceIndex===faceIndex);if(!face)throw Error('Bundled font face missing');
   bundledFaces.push({...face,family:info[0],styleCode:(style&1?2:0)|(style&2?1:0),source:fallbackFamilies.includes(info[0])?'fallback':'bundled',bytes:record.bytes,file,faceIndex});
  }
 }
 for(const root of resolvedRoots)await walk(root);
 let registered=[];
 try{registered=await registryFonts({report:reportFileError});}catch(error){reportFileError(error);}
 for(const filename of registered){
  if(stats.truncated||stopRequested){if(stopRequested)stop('deadline');break;}
  if(typeof filename==='string'&&/\.(ttf|otf|ttc)$/i.test(filename))await collect(filename,true);
 }
 if(stopRequested)stop('deadline');
 await checkpoint(!stats.truncated,true);
 const id=sha(Buffer.from(JSON.stringify({bundleIdentity,fonts:Array.from(identities)})));
 return {id,system,bundled:bundledFaces,handles,resolvedRoots,stats};
}
if(parentPort)build(workerData).then(result=>parentPort.postMessage({result}),error=>{reportFileError(error);parentPort.postMessage({error:'Cannot index computer fonts'});}).finally(()=>parentPort.close());
module.exports={build,canonicalRoots};
