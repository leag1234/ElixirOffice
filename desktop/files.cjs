// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs');
const {validatePath,saveFailure}=require('./file-policy.cjs');
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
async function read(filename) {
  const target = validatePath(path.resolve(filename));
  if (!formats.includes(extension(target))) throw Error('Unsupported document format');
  const selected=await fs.lstat(target,{bigint:true});
  if(!selected.isFile() || selected.isSymbolicLink()) throw Error('Choose a regular document, not a symbolic link');
  const handle = await fs.open(target, constants.O_RDONLY | (process.platform==='win32'?0:(constants.O_NOFOLLOW || 0)));
  try {
    const identity=await handle.stat({bigint:true}), named=await fs.lstat(target,{bigint:true});
    if(named.isSymbolicLink() || !named.isFile() || identity.ino!==selected.ino || identity.dev!==selected.dev ||
       named.ino!==identity.ino || named.dev!==identity.dev) throw Error('Document changed during open');
    const stat=await handle.stat();
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw Error('Choose a regular document under 512 MiB');
    const bytes = await handle.readFile();
    if (bytes.length > 512 * 1024 * 1024) throw Error('Document grew beyond 512 MiB during read');
    if(['txt','csv'].includes(extension(target))){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('Text and CSV documents must use UTF-8');}}
    return {target, bytes, hash: hash(bytes), mode: stat.mode, inode: stat.ino, device: stat.dev, embeddedObjects:['odt','ods','odp'].includes(extension(target))?packageGuard.embeddedObjects(bytes):0};
  } finally { await handle.close(); }
}
async function atomic(target,bytes,expected) {
  try {return await atomicWrite(target,bytes,expected)} catch(error) {throw saveFailure(error)}
}
async function atomicWrite(target, bytes, expected) {
  target = validatePath(path.resolve(target));
  if (!(bytes instanceof Uint8Array) || bytes.length > 512 * 1024 * 1024) throw Error('Invalid output size');
  const parent = await realDirectory(path.dirname(target));
  let original;
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Destination must be a regular file');
    original = await fingerprint(target);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (expected && (!original || original.hash !== expected.hash || original.inode !== expected.inode)) throw Error('The original changed on disk. Use Save As to preserve both versions.');
  const suffix = crypto.randomUUID();
  const temporary = path.join(parent, '.' + path.basename(target) + '.eo-' + suffix + '.tmp');
  const backup = original ? target + '.eo-' + suffix + '.bak' : null;
  validatePath(temporary);if(backup)validatePath(backup);
  let handle, backed = false, replaced = false;
  try {
    handle = await fs.open(temporary, 'wx', (original?.mode || 0o600) & 0o777);
    await handle.writeFile(bytes); await handle.chmod((original?.mode || 0o600) & 0o777);
    await handle.sync(); await handle.close(); handle = null;
    if (original) {
      const latest = await fs.lstat(target);
      if (!latest.isFile() || latest.isSymbolicLink() || latest.ino !== original.inode || (await fingerprint(target)).hash !== original.hash) throw Error('Destination changed during save');
      await fs.copyFile(target, backup, constants.COPYFILE_EXCL); backed = true;
      const copy = await fs.open(backup, 'r'); try { await copy.sync(); } finally { await copy.close(); }
      if ((await fingerprint(backup)).hash !== original.hash) throw Error('Destination changed while its backup was being saved');
      const final = await fs.lstat(target);
      if (!final.isFile() || final.isSymbolicLink() || final.ino !== original.inode || (await fingerprint(target)).hash !== original.hash) throw Error('Destination changed before replacement');
    }
    await fs.rename(temporary, target); replaced = true;
    if (process.platform !== 'win32') {
      const directory = await fs.open(parent, 'r'); try { await directory.sync(); } finally { await directory.close(); }
    }
    const stat = await fs.stat(target);
    if (backed) await fs.unlink(backup);
    return {target, hash: hash(bytes), mode: stat.mode, inode: stat.ino, device: stat.dev, bytes: bytes.length};
  } catch (e) {
    if (backed) e.message += ' Original backup: ' + backup;
    if (replaced) {e.replacementCompleted=true;e.originalBackup=backed?backup:null;e.message += ' Replacement completed, but durability could not be confirmed.';}
    throw e;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (!replaced) await fs.unlink(temporary).catch(() => {});
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
    if(final.isSymbolicLink()||final.ino!==initial.ino||final.dev!==initial.dev||latest.size!==initial.size||latest.mtimeNs!==initial.mtimeNs)
      throw Error('Document changed during read');
    const stat=await handle.stat();
    return {target,hash:digest.digest('hex'),mode:stat.mode,inode:stat.ino,device:stat.dev};
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
module.exports = {read, atomic, rename, renameName, hash, formats, extension};
