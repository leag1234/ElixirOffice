// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sdk=process.env.EO_SDKJS;assert(sdk);
const source=await fs.readFile(path.join(sdk,'common/clientpdf/wasm-fonts.js'),'utf8');
const window={AscFonts:{},AscCommon:{ClientPdf:{fonts:{}}}};
vm.runInNewContext(source,{window,Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,Map,Set});
const inspect=window.EOWasmFonts.inspectFace,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const profiles=JSON.parse(await fs.readFile(process.argv[2],'utf8')),results=[];
const wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
for(const profile of profiles){
 const files=new Map(),rows=[];
 if(profile.assets){
  const text=await fs.readFile(path.join(profile.assets,'sdkjs/common/AllFonts.js'),'utf8');
  const array=name=>JSON.parse(text.match(new RegExp('window\\["'+name+'"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);'))[1]);
  const names=array('__fonts_files');
  for(const info of array('__fonts_infos'))for(let style=0;style<4;style++){
   const index=info[1+style*2],face=info[2+style*2];if(index<0)continue;
   if(!files.has(names[index]))files.set(names[index],new Set());files.get(names[index]).add(face);
  }
  for(const [name,faces] of files){
   const encoded=await fs.readFile(path.join(profile.assets,'fonts',name)),raw=Buffer.from(encoded);
   for(let i=0;i<Math.min(32,raw.length);i++)raw[i]^=wire[i%16];
   rows.push({path:name,encoded_sha256:sha(encoded),raw_sha256:sha(raw),bytes:raw,faces:[...faces]});
  }
 }else{
  async function walk(folder){
   for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    if(entry.name==='.git')continue;
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(/\.(ttf|otf|ttc)$/i.test(entry.name)){
     const raw=await fs.readFile(file),count=raw.subarray(0,4).toString()==='ttcf'?raw.readUInt32BE(8):1;
     assert(count>0&&count<=64);
     rows.push({path:path.relative(profile.rawRoot,file),raw_sha256:sha(raw),bytes:raw,faces:Array.from({length:count},(_,i)=>i)});
    }
   }
  }
  await walk(profile.rawRoot);
 }
 const entries=[];
 for(const row of rows)for(const face of row.faces){
  try{const actual=inspect(new Uint8Array(row.bytes),face);entries.push({...row,bytes:row.bytes.length,faces:undefined,face,status:'PASS',physical:actual.physical,weight:actual.weight,embedding:actual.embedding});}
  catch(error){entries.push({...row,bytes:row.bytes.length,faces:undefined,face,status:'FAIL',error:String(error)});}
 }
 results.push({profile:profile.name,source:profile.assets||profile.rawRoot,files:rows.length,faces:entries.length,passed:entries.filter(x=>x.status==='PASS').length,rejected:entries.filter(x=>x.status==='FAIL').length,entries});
 console.log(profile.name,rows.length+'files',entries.length+'faces',results.at(-1).rejected+'rejected');
}
assert.throws(()=>inspect(new Uint8Array(11),0),/bounds/);
const out={sdk_source_sha256:sha(Buffer.from(source)),calibration:'truncated11bytefont rejected',results};
await fs.writeFile(process.argv[3],JSON.stringify(out,null,2)+'\n');
if(results.some(x=>x.rejected))process.exitCode=1;
