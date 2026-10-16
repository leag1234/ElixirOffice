// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
class Artifacts {
 constructor(){this.records=new Map();}
 register(saved,scope){
  if(!saved||!path.isAbsolute(saved.target)||!Number.isFinite(saved.inode)||!Number.isFinite(saved.device))throw Error('Invalid committed file');
  const id=crypto.randomUUID();this.records.set(id,{target:saved.target,inode:saved.inode,device:saved.device,hash:saved.hash,scope});
  while(this.records.size>8)this.records.delete(this.records.keys().next().value);
  return id;
 }
 clear(){this.records.clear();}
 async resolve(id,scope){
  const item=typeof id==='string'&&this.records.get(id);
  if(!item||item.scope!==scope)throw Error('This saved file action has expired');
  const stat=await fs.lstat(item.target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==item.inode||stat.dev!==item.device)throw Error('The saved file has changed. Open it with Browse.');
  const identity=await require('./files.cjs').fingerprint(item.target);
  if(identity.hash!==item.hash||identity.inode!==item.inode||identity.device!==item.device)throw Error('The saved file has changed. Open it with Browse.');
  return item.target;
 }
}
module.exports={Artifacts};
