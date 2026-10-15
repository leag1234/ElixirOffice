// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const zlib=require('node:zlib'),path=require('node:path'),guard=require('./package-guard.cjs');
const office=new Set(['docx','xlsx','pptx']),odf=new Set(['odt','ods','odp']);
const signature=Buffer.from([208,207,17,224,161,177,26,225]);
function compound(input){
 const bytes=Buffer.from(input),bad=()=>{throw Error('Invalid encrypted Office package')};
 if(bytes.length<512||!bytes.subarray(0,8).equals(signature)||bytes.readUInt16LE(28)!==0xfffe)bad();
 const major=bytes.readUInt16LE(26),shift=bytes.readUInt16LE(30);
 if((major!==3||shift!==9)&&(major!==4||shift!==12))bad();
 const sectorSize=2**shift,count=bytes.length/sectorSize-1;if(!Number.isInteger(count)||count<1||bytes.readUInt16LE(32)!==6)bad();
 function sector(id){if(!Number.isInteger(id)||id<0||id>=count)bad();return bytes.subarray((id+1)*sectorSize,(id+2)*sectorSize);}
 const free=0xffffffff,end=0xfffffffe,fats=[],difatSeen=new Set();
 for(let at=76;at<512;at+=4){const id=bytes.readUInt32LE(at);if(id!==free)fats.push(id);}
 let next=bytes.readUInt32LE(68),difatCount=bytes.readUInt32LE(72);
 if(difatCount>count)bad();
 for(let i=0;i<difatCount;i++){
  if(difatSeen.has(next))bad();difatSeen.add(next);const data=sector(next);
  for(let at=0;at<sectorSize-4;at+=4){const id=data.readUInt32LE(at);if(id!==free)fats.push(id);}
  next=data.readUInt32LE(sectorSize-4);
 }
 if(fats.length!==bytes.readUInt32LE(44)||fats.length>count||new Set(fats).size!==fats.length)bad();
 const table=fats.map(sector),per=sectorSize/4;
 function follow(id){const page=table[Math.floor(id/per)];if(!page)bad();return page.readUInt32LE((id%per)*4);}
 let root;const names=new Map(),seen=new Set();next=bytes.readUInt32LE(48);
 while(next!==end){
  if(seen.has(next)||seen.size>=count||seen.size*sectorSize/128>=65536)bad();seen.add(next);const data=sector(next);
  for(let at=0;at<sectorSize;at+=128){
   const type=data[at+66];if(type===5){if(root)bad();root={first:data.readUInt32LE(at+116),size:Number(data.readBigUInt64LE(at+120))};}if(type!==2)continue;
   const length=data.readUInt16LE(at+64);if(length<2||length>64||length%2||data.readUInt16LE(at+length-2)!==0)bad();
   const name=data.toString('utf16le',at,at+length-2),size=data.readBigUInt64LE(at+120);
   if(name==='EncryptionInfo'||name==='EncryptedPackage'){if(names.has(name)||size<8n||size>BigInt(bytes.length))bad();names.set(name,{first:data.readUInt32LE(at+116),size:Number(size)});}
  }
  next=follow(next);
 }
 if(!names.has('EncryptionInfo')||!names.has('EncryptedPackage'))bad();
 // Validate bounded stream chains as well as directory names. Native code checks
 // structure; only the worker can authenticate encrypted contents with the password.
 const used=new Set([...fats,...difatSeen,...seen]),miniUsed=new Set();
 function chain(first,size){
  if(!Number.isSafeInteger(size)||size<0||size>bytes.length)bad();
  const ids=[];let id=first;
  for(let i=0;i<Math.ceil(size/sectorSize);i++){if(used.has(id))bad();used.add(id);sector(id);ids.push(id);id=follow(id);}
  if(id!==end)bad();return ids;
 }
 let rootIds,miniFat;
 function read(entry,limit){
  let parts=[],id=entry.first,remaining=entry.size;
  if(entry.size>=4096){for(const sid of chain(id,entry.size)){const data=sector(sid);if(limit>0){parts.push(data.subarray(0,Math.min(limit,remaining,sectorSize)));limit-=parts.at(-1).length;}remaining-=Math.min(remaining,sectorSize);}}
  else{
   if(bytes.readUInt32LE(56)!==4096||!root)bad();
   if(!rootIds){rootIds=chain(root.first,root.size);miniFat=chain(bytes.readUInt32LE(60),bytes.readUInt32LE(64)*sectorSize);}
   for(let i=0;i<Math.ceil(entry.size/64);i++){
    if(miniUsed.has(id)||id*64+Math.min(remaining,64)>root.size)bad();miniUsed.add(id);
    const data=sector(rootIds[Math.floor(id*64/sectorSize)]).subarray(id*64%sectorSize,id*64%sectorSize+64);
    if(limit>0){parts.push(data.subarray(0,Math.min(limit,remaining,64)));limit-=parts.at(-1).length;}remaining-=Math.min(remaining,64);
    const fat=miniFat[Math.floor(id/per)];if(fat===undefined)bad();id=sector(fat).readUInt32LE(id%per*4);
   }
   if(id!==end)bad();
  }
  return Buffer.concat(parts);
 }
 const info=names.get('EncryptionInfo'),pkg=names.get('EncryptedPackage');
 if(info.size>2*1024*1024||pkg.size<=8||(pkg.size-8)%16)bad();
 read(info,8);const header=read(pkg,8),plain=header.readBigUInt64LE(0);
 if(plain===0n||plain>BigInt(pkg.size-8))bad();return true;
}
function manifest(input){
 const bytes=Buffer.from(input);guard.entries(bytes);
 let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&(bytes.readUInt32LE(end)!==0x06054b50||end+22+bytes.readUInt16LE(end+20)!==bytes.length))end--;
 let at=bytes.readUInt32LE(end+16),count=bytes.readUInt16LE(end+10);
 for(let i=0;i<count;i++){
  const nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),name=bytes.toString('utf8',at+46,at+46+nameLength);
  if(name==='META-INF/manifest.xml'){
   const method=bytes.readUInt16LE(at+10),size=bytes.readUInt32LE(at+20),unpacked=bytes.readUInt32LE(at+24),local=bytes.readUInt32LE(at+42);
   if(local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50||unpacked>2*1024*1024)throw Error('Invalid OpenDocument protection manifest');
   const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+size>bytes.length)throw Error('Invalid OpenDocument protection manifest');
   const data=bytes.subarray(start,start+size),xml=method===0?data:method===8?zlib.inflateRawSync(data,{maxOutputLength:2*1024*1024}):null;
   if(!xml||xml.length!==unpacked)throw Error('Invalid OpenDocument protection manifest');
   return xml.toString('utf8');
  }
  at+=46+nameLength+extra+comment;
 }
 throw Error('Missing OpenDocument protection manifest');
}
function encrypted(input,format){
 const bytes=Buffer.from(input);
 if(office.has(format)&&bytes.subarray(0,8).equals(signature))return compound(bytes);
 if(odf.has(format)){
  const entries=require('./protection-manifest.cjs').protectedEntries(manifest(bytes)),protectedFiles=[...entries.values()].filter(e=>e.encrypted);
  if(!protectedFiles.length)return false;
  const members=guard.entries(bytes);
  if(!entries.get('content.xml')?.encrypted)throw Error('Partially encrypted OpenDocument files are unavailable locally');
  for(const name of members){if(name.endsWith('/')||name==='mimetype'||name==='META-INF/manifest.xml')continue;if(!entries.get(name)?.encrypted)throw Error('Partially encrypted OpenDocument files are unavailable locally');}
  return true;
 }
 return false;
}
function validate(input,format,protection,current){
 if(!(input instanceof Uint8Array)||input.byteLength>512*1024*1024)throw Error('Invalid document output');
 if(!protection||typeof protection.protected!=='boolean'||typeof protection.remove!=='boolean')throw Error('Invalid document protection state');
 const bytes=Buffer.from(input),actual=encrypted(bytes,format);
 if(actual!==protection.protected)throw Error('Document output does not match the requested password protection');
 if(current.protected&&!actual&&!protection.remove)throw Error('Use explicit Remove password to save an unprotected document');
 if(actual&&!current.recoveryLocked)throw Error('Disable document recovery before password protection');
 if(!actual&&(bytes[0]!==80||bytes[1]!==75))throw Error('Invalid document output');
 return bytes;
}
async function write(files,target,bytes,expected){
 try{return await files.atomic(target,bytes,expected)}catch(error){
  if(!error.replacementCompleted)throw error;
  // A filesystem failure after replacement must not leave the renderer using
  // the old password. Acknowledge only bytes verified at the saved destination.
  let actual;try{actual=await files.read(target)}catch{throw error;}
  if(actual.hash!==files.hash(bytes))throw error;
  return {...actual,bytes:actual.bytes.length,durabilityUnconfirmed:true,backupName:error.originalBackup?path.basename(error.originalBackup):null};
 }
}
async function lock(current,recovery){
 // The synchronous part closes the race before awaiting any previous write.
 current.recoveryLocked=true;current.recoveryVersion=(current.recoveryVersion||0)+1;
 await recovery.tail;await recovery.remove(current.recoveryId||current.token);
 return current.recoveryVersion;
}
module.exports={encrypted,validate,lock,compound,write};
