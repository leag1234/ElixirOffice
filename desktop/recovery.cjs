// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),files=require('./files.cjs');
const formats=new Set(['docx','odt','xlsx','ods','pptx','odp']),limit=512*1024*1024;
function id(value){if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value||''))throw Error('Invalid recovery handle');return value;}
class Recovery {
 constructor(profile){this.root=path.join(profile,'recovery');this.tail=Promise.resolve();}
 async directory(){await fs.mkdir(this.root,{recursive:true,mode:0o700});const stat=await fs.lstat(this.root);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Invalid recovery directory');if(process.platform!=='win32'){if(stat.uid!==process.getuid())throw Error('Invalid recovery directory owner');await fs.chmod(this.root,0o700);}}
 queue(run){const next=this.tail.then(run);this.tail=next.catch(()=>{});return next;}
 save(meta,input,writeOptions){return this.queue(async()=>{
  await this.directory();id(meta.id);
  if(!formats.has(meta.format)||!(input instanceof Uint8Array)||input.length<4||input.length>limit||input[0]!==80||input[1]!==75)throw Error('Invalid recovery document');
  const record={id:meta.id,name:path.basename(meta.name).slice(0,240),format:meta.format,modified:new Date().toISOString(),bytes:input.length,hash:crypto.createHash('sha256').update(input).digest('hex')};
  const header=Buffer.from(JSON.stringify(record)+'\n');
  let used=0;
  for(const entry of await fs.readdir(this.root)){
   if(entry===meta.id+'.recovery'||!entry.endsWith('.recovery'))continue;
   const stat=await fs.lstat(path.join(this.root,entry));if(stat.isFile())used+=stat.size;
  }
  if(used+header.length+input.length>limit)throw Error('Recovery storage is full; remove older recovery copies first');
  await files.atomic(path.join(this.root,meta.id+'.recovery'),Buffer.concat([header,Buffer.from(input)]),undefined,writeOptions);
  return record;
 });}
 async read(value){await this.directory();const filename=path.join(this.root,id(value)+'.recovery'),stat=await fs.lstat(filename);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>limit+4096)throw Error('Invalid recovery file');
  const input=await fs.readFile(filename),end=input.indexOf(10);if(end<0||end>4096)throw Error('Invalid recovery header');
  const record=JSON.parse(input.subarray(0,end)),bytes=input.subarray(end+1);
  if(record.id!==value||!formats.has(record.format)||typeof record.name!=='string'||path.basename(record.name)!==record.name||record.bytes!==bytes.length||crypto.createHash('sha256').update(bytes).digest('hex')!==record.hash)throw Error('Damaged recovery copy');
  return {...record,data:new Uint8Array(bytes)};
 }
 async list(){await this.tail;await this.directory();const entries=[];
  for(const name of await fs.readdir(this.root)){
   if(!/^[a-f0-9-]{36}\.recovery$/.test(name))continue;
   try{const {data,...record}=await this.read(name.slice(0,-9));entries.push(record)}catch(error){entries.push({id:name.slice(0,-9),name,damaged:true})}
  }
  return entries.sort((a,b)=>(b.modified||'').localeCompare(a.modified||''));
 }
 remove(value){return this.queue(async()=>{await this.directory();await fs.rm(path.join(this.root,id(value)+'.recovery'),{force:true})});}
}
module.exports={Recovery};
