// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs');
const {validatePath,saveFailure}=require('./file-policy.cjs');
const formats = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'xls', 'ppt'];
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
    return {target, bytes, hash: hash(bytes), mode: stat.mode, inode: stat.ino, device: stat.dev, embeddedObjects:['odt','ods','odp'].includes(extension(target))?packageGuard.embeddedObjects(bytes):0};
  } finally { await handle.close(); }
}
async function atomic(target,bytes,expected) {
  try {return await atomicWrite(target,bytes,expected)} catch(error) {throw saveFailure(error)}
}
async function atomicWrite(target, bytes, expected) {
  target = validatePath(path.resolve(target));
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length > 512 * 1024 * 1024) throw Error('Invalid output size');
  const parent = await realDirectory(path.dirname(target));
  let original;
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Destination must be a regular file');
    original = {hash: hash(await fs.readFile(target)), mode: stat.mode, inode: stat.ino};
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
      if (!latest.isFile() || latest.isSymbolicLink() || latest.ino !== original.inode || hash(await fs.readFile(target)) !== original.hash) throw Error('Destination changed during save');
      await fs.copyFile(target, backup, constants.COPYFILE_EXCL); backed = true;
      const copy = await fs.open(backup, 'r'); try { await copy.sync(); } finally { await copy.close(); }
      if (hash(await fs.readFile(backup)) !== original.hash) throw Error('Destination changed while its backup was being saved');
      const final = await fs.lstat(target);
      if (!final.isFile() || final.isSymbolicLink() || final.ino !== original.inode || hash(await fs.readFile(target)) !== original.hash) throw Error('Destination changed before replacement');
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
    if (replaced) e.message += ' Replacement completed, but durability could not be confirmed.';
    throw e;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (!replaced) await fs.unlink(temporary).catch(() => {});
  }
}
module.exports = {read, atomic, hash, formats, extension};
