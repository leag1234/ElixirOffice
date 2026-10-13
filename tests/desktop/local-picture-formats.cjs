// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 const env=await launch({file:await fixture('sample.docx'),profile:'picture-formats-'+Date.now()});
 try{
  await editable(env);
  for(const [extension,type] of [['png','image/png'],['jpg','image/jpeg'],['gif','image/gif'],['bmp','image/bmp'],['svg','image/svg+xml'],['webp','image/webp']]){
   const filename=path.join(root,'tmp/pictures/public.'+extension),before=await fs.readFile(filename);
   await env.page.evaluate(async({bytes,name,type})=>{const {controller,win}=EOLocalSession;await controller.addImage(new win.File([new win.Uint8Array(bytes)],name,{type}))},{bytes:Array.from(before),name:path.basename(filename),type});
   assert.deepEqual(await fs.readFile(filename),before);console.log('PASS actual desktop picture import',extension);
  }
  const result=await env.page.evaluate(async()=>{
   const {win,controller}=EOLocalSession,snap=await controller.snapshot(),local=snap.resources.filter(r=>r.path.includes('local-'));
   const dimensions=[];
   for(const item of local){const url=win.URL.createObjectURL(new win.Blob([item.bytes]));try{const image=new win.Image();image.src=url;await image.decode();dimensions.push({width:image.naturalWidth,height:image.naturalHeight})}finally{win.URL.revokeObjectURL(url)}}
   return {count:local.length,dimensions,bytes:Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'docx',{resources:snap.resources}))};
  });
  assert.equal(result.count,6);assert(result.dimensions.every(d=>d.width===12&&d.height===8));
  const output=path.join(root,'tmp/pictures/all-six.docx');await fs.writeFile(output,Buffer.from(result.bytes));
  const media=Number(cp.execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(sum(n.startswith('word/media/') for n in z.namelist()))",output],{encoding:'utf8'}));assert(media>=6);
  assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  console.log('PASS all6pictures actualdecode/dimensions/export/originals and zero external requests');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
