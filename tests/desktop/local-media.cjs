// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root}=require('./harness.cjs'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const file=process.env.EO_MEDIA_FIXTURE||path.join(root,'tmp/media/public-media.pptx'),before=await fs.readFile(file),env=await launch({file,profile:'embedded-media-'+Date.now()});
 try{
  await editable(env);
  const result=await env.page.evaluate(async()=>{
   const {api,controller,win}=EOLocalSession,shapes=api.WordControl.m_oLogicDocument.Slides[0].cSld.spTree;
   const media=shapes.filter(s=>[7,8].includes(s.getUniMedia?.().type)).map(s=>({video:s.getUniMedia().type===7,audio:s.getUniMedia().type===8,name:s.getMediaFileName()}));
   const snap=await controller.snapshot(),resources=snap.resources.filter(r=>/\.(webm|wav)$/i.test(r.path));const decoded=[];
   for(const item of resources){
    const element=win.document.createElement(item.path.endsWith('.wav')?'audio':'video'),url=win.URL.createObjectURL(new win.Blob([item.bytes],{type:item.path.endsWith('.wav')?'audio/wav':'video/webm'}));
    element.src=url;win.document.body.append(element);
    try{const duration=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Embedded media metadata timed out')),10000);element.onloadedmetadata=()=>{clearTimeout(timer);resolve(element.duration)};element.onerror=()=>{clearTimeout(timer);reject(Error('Embedded media blocked/undecodable '+element.error?.code))};element.load()});decoded.push({path:item.path,duration});}
    finally{element.remove();win.URL.revokeObjectURL(url)}
   }
   const output=await win.EOWasmConvert.convert(snap.bytes,snap.format,'pptx',{resources:snap.resources});
   return {media,decoded,shapes:shapes.map(s=>({type:s.getObjectType?.(),media:s.getUniMedia?.(),name:s.getMediaFileName?.()})),resources:snap.resources.map(r=>({path:r.path,bytes:r.bytes.length})),output:Array.from(output)};
  });
  console.log('MEDIA DIAGNOSTIC',JSON.stringify({media:result.media,decoded:result.decoded,shapes:result.shapes,resources:result.resources}));
  assert(result.media.some(m=>m.video));assert(result.media.some(m=>m.audio));assert.equal(result.decoded.length,2);assert(result.decoded.every(item=>item.duration>=0.8));
  const output=path.join(root,'tmp/media/roundtrip.pptx');await fs.writeFile(output,Buffer.from(result.output));
  const count=Number(require('node:child_process').execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(sum(n.endswith(('.webm','.wav')) for n in z.namelist()))",output],{encoding:'utf8'}));assert.equal(count,2);
  assert.deepEqual(await fs.readFile(file),before);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  console.log('PASS imported slide audio/video shapes, actual local media decode under CSP, export preserves both, original intact',result.media,result.decoded);
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
