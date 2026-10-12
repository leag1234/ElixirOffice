// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
function roots() {
  if (process.platform === 'win32') return [path.join(process.env.WINDIR || 'C:\\Windows','Fonts'), path.join(process.env.LOCALAPPDATA || os.homedir(),'Microsoft/Windows/Fonts')];
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
class Fonts {
  constructor() { this.allowed=roots(); this.files=new Map(); }
  async enumerate() {
    this.files.clear(); const found=[];
    const walk=async directory=>{
      let entries;try{entries=await fs.readdir(directory,{withFileTypes:true})}catch(e){if(['ENOENT','EACCES'].includes(e.code))return;throw e}
      for(const entry of entries) {
        if(this.files.size>=5000)throw Error('Too many system fonts');
        const filename=path.join(directory,entry.name);
        if(entry.isDirectory()) { await walk(filename); continue; }
        if(!/\.(ttf|otf|ttc)$/i.test(entry.name))continue;
        let real,bytes;
        try {
          real=await fs.realpath(filename);
          if(!this.allowed.some(root=>real.startsWith(path.resolve(root)+path.sep)))continue;
          const stat=await fs.stat(real);if(!stat.isFile()||stat.size>20*1024*1024)continue;
          bytes=await fs.readFile(real);if(bytes.length>20*1024*1024)continue;
          const offsets=bytes.toString('ascii',0,4)==='ttcf'?Array.from({length:Math.min(bytes.readUInt32BE(8),64)},(_,i)=>bytes.readUInt32BE(12+i*4)):[0];
          for(const offset of offsets) { const face=names(bytes,offset); if(face){const id=crypto.randomUUID();this.files.set(id,{real});found.push({...face,id});} }
        } catch(e) { if(!['ENOENT','EACCES'].includes(e.code) && e instanceof RangeError)continue; }
      }
    };
    for(const root of this.allowed)await walk(root);
    return found;
  }
  async read(id) {
    const font=this.files.get(id);if(!font)throw Error('Unknown font handle');
    const real=await fs.realpath(font.real);
    if(real!==font.real || !this.allowed.some(root=>real.startsWith(path.resolve(root)+path.sep)))throw Error('Font moved outside approved folders');
    const handle=await fs.open(real,require('node:fs').constants.O_RDONLY|require('node:fs').constants.O_NOFOLLOW);
    try{const stat=await handle.stat();if(!stat.isFile()||stat.size>20*1024*1024)throw Error('Invalid font');const bytes=await handle.readFile();if(bytes.length>20*1024*1024)throw Error('Font grew beyond 20 MiB');return new Uint8Array(bytes);}
    finally{await handle.close()}
  }
}
module.exports={Fonts,names,roots};
