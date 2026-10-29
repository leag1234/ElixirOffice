// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs');
const retryWindow=require('./windows-io.cjs');
const replaceInPlace=require('./replace-fallback.cjs');
const writes=require('./write-scope.cjs')();
const {validatePath,saveFailure}=require('./file-policy.cjs');
const deferredBackups=new Map();
let diagnostic=()=>{};
function report(step,error,retries=0,outcome='failure'){
  try{diagnostic({step,code:error?.code,retries,outcome});}catch{}
}
async function cleanupBackups(run=(_step,work)=>work(),fresh){
  for(const [filename,selected] of deferredBackups){
    if(fresh&&filename!==fresh)continue;
    try{
      if(!selected.target||path.dirname(filename)!==path.dirname(selected.target)||!filename.startsWith(selected.target+'.eo-')||!/^.+\.eo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bak$/.test(filename)){deferredBackups.delete(filename);continue;}
      let actual;
      if(filename===fresh){
        // This copy was hashed before replacement; unchanged metadata binds that
        // verification without reading a large original again after every save.
        const stat=await run('cleanup-backup-check',()=>fs.lstat(filename),true);
        if(!stat.isFile()||stat.isSymbolicLink()){deferredBackups.delete(filename);continue;}
        actual={inode:stat.ino,device:stat.dev,size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,hash:selected.hash};
      }else actual=await run('cleanup-backup-check',()=>fingerprint(filename),true);
      if(actual.inode!==selected.inode||actual.device!==selected.device||actual.hash!==selected.hash||actual.size!==selected.size||actual.mtimeMs!==selected.mtimeMs||actual.ctimeMs!==selected.ctimeMs){deferredBackups.delete(filename);continue;}
      await run('backup-cleanup',()=>fs.unlink(filename),true);deferredBackups.delete(filename);
      report('backup-cleanup',null,0,'success');
    }catch(error){if(error.code==='ENOENT')deferredBackups.delete(filename);else report('backup-cleanup',error,0,'deferred');}
  }
}
const formats = Object.keys(require('./formats.cjs').codes);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const extension = filename => path.extname(filename).slice(1).toLowerCase();
async function realDirectory(directory) {
  let cursor=path.parse(directory).root;
  for(const part of directory.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,part);
    const stat=await fs.lstat(cursor);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Saving through a symbolic-link folder is unavailable');
  }
  return fs.realpath(directory);
}
async function read(filename,options={}) {
  const target = validatePath(path.resolve(filename));
  if (!formats.includes(extension(target))) throw Error('Unsupported document format');
  const maxBytes=options.maxBytes===undefined?512*1024*1024:options.maxBytes;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>512*1024*1024)throw Error('Invalid document read limit');
  let selected;
  for(let attempt=0;;attempt++){
    try{
      // Keep the selected identity across the retry: a replacement is not consent.
      if(!selected){
        selected=await fs.lstat(target,{bigint:true});
        if(!selected.isFile() || selected.isSymbolicLink()) throw Error('Choose a regular document, not a symbolic link');
      }
      return await readSelected(target,selected,maxBytes);
    }catch(error){
      if(error.code!=='EBUSY'||attempt!==0)throw error;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
}
async function readSelected(target,selected,maxBytes){
  const handle = await fs.open(target, constants.O_RDONLY | (process.platform==='win32'?0:(constants.O_NOFOLLOW || 0)));
  try {
    const identity=await handle.stat({bigint:true}), named=await fs.lstat(target,{bigint:true});
    if(named.isSymbolicLink() || !named.isFile() || identity.ino!==selected.ino || identity.dev!==selected.dev ||
       named.ino!==identity.ino || named.dev!==identity.dev) throw Error('Document changed during open');
    const stat=await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw Error(maxBytes===20*1024*1024?'Choose a recipient file under 20 MiB':'Choose a regular document under 512 MiB');
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) throw Error(maxBytes===20*1024*1024?'Recipient file grew beyond 20 MiB during read':'Document grew beyond 512 MiB during read');
    if(['txt','csv'].includes(extension(target))){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('Text and CSV documents must use UTF-8');}}
    return {target, bytes, hash: hash(bytes), mode: stat.mode, inode: stat.ino, device: stat.dev, embeddedObjects:['odt','ods','odp'].includes(extension(target))?packageGuard.embeddedObjects(bytes):0};
  } finally { await handle.close(); }
}
async function atomic(target,bytes,expected,options={}) {
  const entry=writes.start(options);
  let failure;
  try {return await atomicWrite(target,bytes,expected,entry.context)} catch(error) {failure=saveFailure(error);throw failure} finally {entry.finish(failure)}
}
async function atomicWrite(target, bytes, expected,options) {
  retryWindow.check(options);
  target = validatePath(path.resolve(target));
  if (!(bytes instanceof Uint8Array) || bytes.length > 512 * 1024 * 1024) throw Error('Invalid output size');
  // All existing-file operations share one transient-error deadline.
  const retry=retryWindow(process.platform,retryWindow.saveBudget(process.env),options);
  const run=async(step,work,cleanup=false)=>{
    let retries=0;
    try{return await retry(async()=>{try{return await work()}catch(error){if(!(step==='target-stat'&&error.code==='ENOENT'))report(error.saveStep||step,error,retries);retries++;throw error;}},cleanup)}
    catch(error){error.saveStep=step;throw error;}
  };
  // Old deferred work gets one attempt, never this save's retry budget.
  await cleanupBackups();
  const parent = await run('parent-check',()=>realDirectory(path.dirname(target)));
  let original;
  try {
    const stat = await run('target-stat',()=>fs.lstat(target));
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Destination must be a regular file');
    original = await run('target-fingerprint',()=>fingerprint(target));
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (expected && (expected.absent ? !!original : !original || original.hash !== expected.hash || original.inode !== expected.inode || expected.device !== undefined && original.device !== expected.device)) throw Error('The original changed on disk. Use Save As to preserve both versions.');
  const backup = original ? target + '.eo-' + crypto.randomUUID() + '.bak' : null;
  if(backup)validatePath(backup);
  const temporaries=[],outputHash=hash(bytes);
  let temporary,handle,backed=false,replaced=false,retained,staged;
  const unchanged=(actual,selected)=>actual.hash===selected.hash&&actual.inode===selected.inode&&actual.device===selected.device;
  try {
    handle = await run('temporary-open',async()=>{
      // A refused exclusive open may leave a quarantined file: use a fresh name.
      temporary=validatePath(path.join(parent,'.'+path.basename(target)+'.eo-'+crypto.randomUUID()+'.tmp'));
      temporaries.push(temporary);
      return fs.open(temporary,'wx',(original?.mode||0o600)&0o777);
    });
    retryWindow.check(options);
    // Do not repeat writeFile: a partially advanced handle is not idempotent.
    try{await handle.writeFile(bytes);}catch(error){report('temporary-write',error);throw error;}
    await run('temporary-mode',()=>handle.chmod((original?.mode || 0o600) & 0o777));
    await run('temporary-sync',()=>handle.sync());staged=await run('temporary-stat',()=>handle.stat());await run('temporary-close',()=>handle.close());handle=null;
    retryWindow.check(options);
    if (original) {
      const latest = await run('target-stat',()=>fs.lstat(target));
      if (!latest.isFile() || latest.isSymbolicLink() || latest.ino !== original.inode || (await run('target-fingerprint',()=>fingerprint(target))).hash !== original.hash) throw Error('Destination changed during save');
      await run('backup-copy',()=>fs.copyFile(target, backup, constants.COPYFILE_EXCL)); backed = true;
      // Windows FlushFileBuffers requires a write-capable handle.
      const copy = await run('backup-open',()=>fs.open(backup, process.platform==='win32'?'r+':'r')); try { await run('backup-sync',()=>copy.sync()); } finally { await run('backup-close',()=>copy.close()); }
      retained=await run('backup-fingerprint',()=>fingerprint(backup));
      if(retained.hash!==original.hash)throw Error('Destination changed while its backup was being saved');
    }
    retryWindow.check(options);
    if(original&&!unchanged(await run('target-fingerprint',()=>fingerprint(target)),original))throw Error('Destination changed before replacement');
    const stamp=(stat,selected)=>stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===selected.device&&stat.ino===selected.inode&&stat.size===selected.size&&stat.mtimeMs===selected.mtimeMs&&stat.ctimeMs===selected.ctimeMs;
    try{
    await run('replace',async()=>{
      // A wait is not consent to overwrite an external edit, replacement or new file.
      if(original){
        if(!stamp(await fs.lstat(target).catch(error=>{error.saveStep='target-stamp';throw error}),original))throw Error('Destination changed before replacement');
        if(!stamp(await fs.lstat(backup).catch(error=>{error.saveStep='backup-stamp';throw error}),retained))throw Error('Original backup changed before replacement');
      }else{
        try{await fs.lstat(target);throw Error('Destination changed before replacement');}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
      try{await fs.rename(temporary,target)}
      catch(error){
        error.saveStep='rename';
        // Some filesystems can report an error after committing. Never retry it.
        try{
          const named=await fs.lstat(target);
          if(named.isFile()&&!named.isSymbolicLink()&&named.ino===staged.ino&&named.dev===staged.dev&&(await fingerprint(target)).hash===hash(bytes)){
            replaced=true;error.replacementCompleted=true;
          }
        }catch{}
        throw error;
      }
    });
    }catch(error){
      if(process.platform!=='win32'||replaced||!original||!backed||!error.retryExpired||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
      await replaceInPlace({target,temporary,bytes,original,backup,retained,outputHash,options,run});
    }
    replaced = true;
    if (process.platform !== 'win32') {
      const directory = await fs.open(parent, 'r'); try { await directory.sync(); } finally { await directory.close(); }
    }
    const verified=await run('output-fingerprint',()=>fingerprint(target));
    if(verified.hash!==outputHash||verified.size!==bytes.length){
      const error=Object.assign(Error(backup?'SAVE_RESTORE_UNCERTAIN:'+JSON.stringify(path.basename(backup)):'Invalid document output'),{code:'EIO',rollbackUncertain:!!backup,outputVerificationFailed:true});throw error;
    }
    const stat = verified;
    if (backed) {
      // Queue only this process's known name/identity, never scan a directory.
      // Recheck identity and bytes even on the immediate cleanup path.
      if(deferredBackups.size<128)deferredBackups.set(backup,{...retained,target});
      await cleanupBackups(run,backup);
    }
    return {target, hash: hash(bytes), mode: stat.mode, inode: stat.inode, device: stat.device, bytes: bytes.length};
  } catch (e) {
    // Remove only our still-verified backup when the original is confirmed intact.
    if(process.platform==='win32'&&backed&&!replaced&&!e.rollbackUncertain){
      try{
        const targetState=await run('cleanup-target-check',()=>fingerprint(target),true),copyState=await run('cleanup-backup-check',()=>fingerprint(backup),true);
        if(unchanged(targetState,original)&&(!retained||unchanged(copyState,retained))&&copyState.hash===original.hash){await run('failed-save-cleanup',()=>fs.unlink(backup),true);backed=false;e.originalBackup=null;}
      }catch{e.backupCleanupFailed=true;}
    }
    if (backed&&!e.rollbackUncertain) e.message += ' Original backup: ' + backup;
    if (replaced) {e.replacementCompleted=true;e.originalBackup=backed?backup:null;if(!e.rollbackUncertain)e.message += ' Replacement completed, but durability could not be confirmed.';}
    throw e;
  } finally {
    if (handle) await handle.close().catch(() => {});
    for(const filename of temporaries)await fs.unlink(filename).catch(()=>{});
  }
}
// Rename the selected file without replacing another file or changing its bytes.
function renameName(name,ext) {
  if (typeof name !== 'string') throw Error('Choose a valid file name without a folder path');
  name = name.normalize('NFC');
  const leaf = name.trim(), stem = leaf.split('.')[0].replace(/ +$/, '');
  const result = leaf.toLowerCase().endsWith(ext.toLowerCase()) ? leaf : leaf + ext;
  if (!leaf || /[\x00-\x1f\x7f\\/:*?"<>|\u202a-\u202e\u2066-\u2069]/.test(name)
      || leaf === '.' || leaf === '..' || /[. ]$/.test(name) || name.length > 200
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) || Buffer.byteLength(result,'utf8') > 255)
    throw Error('Choose a valid file name without a folder path');
  return result;
}
async function fingerprint(filename) {
  const target=validatePath(path.resolve(filename)), selected=await fs.lstat(target,{bigint:true});
  if(!selected.isFile()||selected.isSymbolicLink())throw Error('Choose a regular document, not a symbolic link');
  const handle=await fs.open(target,constants.O_RDONLY|(process.platform==='win32'?0:(constants.O_NOFOLLOW||0)));
  try{
    const initial=await handle.stat({bigint:true}), named=await fs.lstat(target,{bigint:true});
    if(initial.ino!==selected.ino||initial.dev!==selected.dev||named.isSymbolicLink()||named.ino!==initial.ino||named.dev!==initial.dev)
      throw Error('Document changed during open');
    if(initial.size>512n*1024n*1024n)throw Error('Choose a regular document under 512 MiB');
    const digest=crypto.createHash('sha256');let size=0;
    for await(const chunk of handle.createReadStream({autoClose:false})){
      size+=chunk.length;if(size>512*1024*1024)throw Error('Document grew beyond 512 MiB during read');digest.update(chunk);
    }
    const latest=await handle.stat({bigint:true}), final=await fs.lstat(target,{bigint:true});
    if(final.isSymbolicLink()||final.ino!==initial.ino||final.dev!==initial.dev||latest.size!==initial.size||latest.mtimeNs!==initial.mtimeNs||latest.ctimeNs!==initial.ctimeNs)
      throw Error('Document changed during read');
    const stat=await handle.stat();
    return {target,hash:digest.digest('hex'),mode:stat.mode,inode:stat.ino,device:stat.dev,size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs};
  }finally{await handle.close()}
}

async function rename(expected, name) {
  if (!expected || typeof expected.target !== 'string') throw Error('Save this document before renaming its file');
  name = renameName(name,path.extname(expected.target));
  const parent = await realDirectory(path.dirname(expected.target));
  const target = validatePath(path.join(parent, name));
  const selected = await fingerprint(expected.target);
  if (selected.hash !== expected.hash || selected.inode !== expected.inode || selected.device !== expected.device)
    throw Error('The original changed on disk. Reopen it before renaming.');
  if (target === selected.target) return {...selected, name};
  let alias;
  try {alias=await fs.lstat(target)} catch (error) {if(error.code!=='ENOENT')throw error}
  // A case-insensitive filesystem resolves the new spelling to the same entry.
  if(alias && alias.ino===selected.inode && alias.dev===selected.device && !(await fs.readdir(parent)).includes(name)){
    const current=await fingerprint(selected.target);
    if(current.hash!==selected.hash||current.inode!==selected.inode||current.device!==selected.device)throw Error('The file changed during rename');
    await fs.rename(selected.target,target);
    const renamed=await fingerprint(target);
    if(renamed.hash!==selected.hash || renamed.inode!==selected.inode || renamed.device!==selected.device)
      throw Error('The file changed during rename');
    if(process.platform!=='win32'){
      const directory=await fs.open(parent,'r');try{await directory.sync()}finally{await directory.close()}
    }
    return {...renamed,name};
  }
  let linked = false;
  try {
    // link is exclusive: it rejects an existing destination instead of overwriting it.
    await fs.link(selected.target, target);linked = true;
    const original = await fingerprint(selected.target), destination = await fs.lstat(target);
    if (original.hash !== selected.hash || original.inode !== selected.inode || original.device !== selected.device
        || destination.ino !== selected.inode || destination.dev !== selected.device)
      throw Error('The file changed during rename');
    await fs.unlink(selected.target);linked = false;
    if (process.platform !== 'win32') {
      const directory = await fs.open(parent, 'r');try {await directory.sync()} finally {await directory.close()}
    }
    return {...selected, target, name};
  } catch (error) {
    if (linked) {
      const stat = await fs.lstat(target).catch(()=>null);
      if (stat && stat.ino === selected.inode && stat.dev === selected.device) await fs.unlink(target);
    }
    if (error.code === 'EEXIST') throw Error('A file with this name already exists. Choose another name.');
    throw saveFailure(error);
  }
}
async function scoped(options,run){
 const entry=writes.start(options);
 let failure;
 try{retryWindow.check(entry.context);return await run(entry.context)}catch(error){failure=error;throw error}finally{entry.finish(failure)}
}
module.exports = {setDiagnostics:callback=>{diagnostic=typeof callback==='function'?callback:()=>{}},cleanupBackups,resumeWrites:()=>writes.resume(),writeWarnings:()=>writes.warnings(),acknowledgeWriteWarning:key=>writes.acknowledge(key),scoped,cancelPending:options=>writes.cancel(options),fingerprint, read, atomic, rename, renameName, hash, formats, extension};
