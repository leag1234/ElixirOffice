// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),{modal,keys,edit}=require('./lifecycle.cjs'),fileAction=require('./file-action.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const report=[];
async function log(value){report.push(value);console.log('PASS',value);await fs.writeFile(path.join(root,'results/local-formats.json'),JSON.stringify(report,null,2))}
async function exportsFor(format,outputs,variants){
 const source=await fixture('sample.'+format),original=await fs.readFile(source),env=await launch({file:source,profile:'formats-'+format+'-'+Date.now()});
 try{
  await editable(env);await edit(env);
  for(const output of [...outputs.filter(value=>value!==format),format]){
   const target=path.join(root,'tmp','export-'+Date.now()+'.'+output);
   await env.page.evaluate(()=>{window.EOLastSave=null;window.EOLastExport=null;window.EOLastPdf=null});
   if(process.env.EO_CONVERT_ONLY==='1'){
    const bytes=await env.page.evaluate(async output=>{
     const {controller,win,api,file}=EOLocalSession;
     if(output==='pdf'){
      for(const name of ['clientpdf/clientpdf.js','clientpdf/wasm-pdf.js','desktop/pdf.js'])await new Promise((resolve,reject)=>{const element=win.document.createElement('script');element.src='/example/local-assets/sdkjs/common/'+name;element.onload=resolve;element.onerror=reject;win.document.head.append(element)});
      return Array.from((await win.EODesktopPdf(api,file.format)).bytes);
     }
     const snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,output,{resources:snap.resources}));
    },output);
    await fs.writeFile(target,Buffer.from(bytes));
   }else{
    await fileAction(env.page,'save-as',output);await modal(env);keys(env,'save-path',target);
    await env.page.waitForFunction(()=>window.EOLastSave||window.EOLastExport||window.EOLastPdf||window.EOLocalFailure,null,{timeout:120000});
    assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
   }
   const bytes=await fs.readFile(target);assert(bytes.length);
   if(output!==format)assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),true,'Different-format export reset the source saved state');
   assert.deepEqual(await fs.readFile(source),original,'Save As overwrote the opened fixture');
   if(output==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
   else{
    const reopened=await env.page.evaluate(async({bytes,from,to})=>{
     const {win}=EOLocalSession,result=await win.EOWasmConvert.convert(new win.Uint8Array(bytes),from,to);
     const internal=await win.EOWasmConvert.convert(result,to,{docx:'doct',xlsx:'xlst',pptx:'pptt'}[to]);
     const needle=Array.from('EODESKTOP').flatMap(c=>[c.charCodeAt(0),0]);
     return new Uint8Array(internal).some((_value,i)=>needle.every((v,j)=>internal[i+j]===v));
    },{bytes:Array.from(bytes),from:output,to:format});
    assert(reopened,'Marker lost in '+output+' roundtrip');
   }
   await log({check:process.env.EO_CONVERT_ONLY==='1'?'sandboxed Wasm conversion / marker roundtrip / original intact (no native dialog)':'native Save As / marker roundtrip / original intact',format,output,bytes:bytes.length});
   if(['rtf','txt','csv'].includes(output))variants.push({from:output,to:format,filename:target});
  }
  for(const from of {docx:['dotx','docm'],xlsx:['xltx','xlsm'],pptx:['potx','ppsx']}[format]){
   const bytes=await env.page.evaluate(async from=>{const {win,file}=EOLocalSession;return Array.from(await win.EOWasmConvert.convert(new win.Uint8Array(file.bytes),file.format,from))},from);
   const filename=path.join(root,'tmp','public-template-'+Date.now()+'.'+from);await fs.writeFile(filename,Buffer.from(bytes));variants.push({from,to:format,filename});
  }
  assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>!/^https?:|^wss?:/.test(r.url)));
 }finally{await stop(env)}
}
(async()=>{
 await fs.mkdir(path.join(root,'tmp'),{recursive:true});const variants=[];
 for(const [format,outputs] of [['docx',['docx','odt','rtf','txt','pdf']],['xlsx',['xlsx','ods','csv']],['pptx',['pptx','odp','pdf']]])await exportsFor(format,outputs,variants);
 for(const item of variants){
  const original=await fs.readFile(item.filename),env=await launch({file:item.filename,profile:'open-'+item.from+'-'+Date.now()});
  try{
   assert.equal((await editable(env)).format,item.to);assert((await env.page.evaluate(()=>EOLocalSession.file.name)).endsWith('.'+item.to));
   assert.deepEqual(await fs.readFile(item.filename),original);assert.equal(await env.page.evaluate(()=>EOLocalSession.api.isAutoSave),false);
   assert.equal(await env.page.evaluate(()=>{const w=EOLocalSession.win;return (w.DE||w.SSE||w.PE).getController('Main').editorConfig.customization.macros}),false);
   await log({check:'real added format open as converted copy / original intact / macros disabled',from:item.from,to:item.to});
   assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>!/^https?:|^wss?:/.test(r.url)));
 }finally{await stop(env)}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
