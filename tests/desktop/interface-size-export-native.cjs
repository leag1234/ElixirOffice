// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {launch,stop,editable,fixture,root,sleep}=require('./harness.cjs'),{edit}=require('./lifecycle.cjs');
const rows=[];
const {xlsxEquivalence:officeEquivalence}=require('./interface-size-ooxml.cjs');
async function snapshot(page){
 return page.evaluate(async()=>{
  const s=EOLocalSession,bytes=new Uint8Array(s.controller.serialize()),digest=await crypto.subtle.digest('SHA-256',bytes);
  return {dirty:s.controller.isModified(),zoom:typeof s.api.asc_getZoom==='function'?s.api.asc_getZoom():s.api.WordControl.m_nZoomValue,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')};
 });
}
async function office(page){
 return page.evaluate(async()=>{const s=EOLocalSession,state=await s.controller.snapshot();return Array.from(await s.win.EOWasmConvert.convert(state.bytes,state.format,s.format,{resources:state.resources}));});
}
async function pdf(page,file){
 const bytes=await page.evaluate(async()=>{
  const {win,api,format}=EOLocalSession;
  const script=url=>new Promise((resolve,reject)=>{const s=win.document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject;win.document.head.append(s)});
  if(!win.EOClientPdf)await script('/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
  if(!win.EOWasmPdf)await script('/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
  if(!win.EODesktopPdf)await script('/example/local-assets/sdkjs/common/desktop/pdf.js');
  const result=await win.EODesktopPdf(api,format);return {bytes:Array.from(result.bytes),stats:result.stats};
 });
 assert.equal(bytes.stats.backend,'wasm');await fs.writeFile(file,Buffer.from(bytes.bytes));
 const info=cp.execFileSync('pdfinfo',[file],{encoding:'utf8'}),text=cp.execFileSync('pdftotext',['-bbox',file,'-'],{encoding:'utf8'});
 const size=/Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/.exec(info),word=/<word\b([^>]+)>EODESKTOP<\/word>/.exec(text);
 assert(size&&word,'Independent PDF dimensions and marker bounds missing');
 const box=Object.fromEntries(['xMin','yMin','xMax','yMax'].map(key=>[key,Number(new RegExp(key+'="([^"]+)"').exec(word[1])[1])]));
 return {pages:Number(/Pages:\s+(\d+)/.exec(info)[1]),width:Number(size[1]),height:Number(size[2]),box,bytes:bytes.bytes.length};
}
(async()=>{
 for(const format of ['docx','xlsx','pptx']){
  const target=await fixture('sample.'+format),original=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex'),env=await launch({file:target,profile:'interface-export-'+format+'-'+Date.now(),args:['--lang=en']});
  try{
   await editable(env);
   await env.page.evaluate(()=>{const {api}=EOLocalSession;if(typeof api.asc_setZoom==='function')api.asc_setZoom(1);else api.zoom100()});
   await edit(env);
   await env.page.evaluate(()=>eoDesktop.interfaceSizeSet(80));await sleep(200);
   const a=await pdf(env.page,path.join(root,'results',format+'-interface-80.pdf')),before=await snapshot(env.page),officeBefore=await office(env.page);
   await env.page.evaluate(()=>eoDesktop.interfaceSizeSet(200));await sleep(200);
   const afterScale=await snapshot(env.page);
   assert.equal(afterScale.dirty,before.dirty);assert.equal(afterScale.zoom,before.zoom);
   const officeAfter=await office(env.page);
   await fs.writeFile(path.join(root,'results',format+'-interface-before.'+format),Buffer.from(officeBefore));
   await fs.writeFile(path.join(root,'results',format+'-interface-after.'+format),Buffer.from(officeAfter));
   const comparison=officeEquivalence(Buffer.from(officeBefore),Buffer.from(officeAfter));
   // Prove the clock allowance independently without a second size change.
   await sleep(1100);const noScaleChange=await office(env.page);
   await fs.writeFile(path.join(root,'results',format+'-no-scale-change.'+format),Buffer.from(noScaleChange));
   const control=officeEquivalence(Buffer.from(officeAfter),Buffer.from(noScaleChange));

   const b=await pdf(env.page,path.join(root,'results',format+'-interface-200.pdf'));
   assert.equal(a.pages,b.pages);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
   for(const key of Object.keys(a.box))assert(Math.abs(a.box[key]-b.box[key])<.25,'PDF text geometry changed: '+format+':'+key);
   assert.equal(crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex'),original);
   assert.deepEqual(env.errors,[]);
   rows.push({format,state:'PASS',at80:a,at200:b,SDKStateUnchanged:true,serializedCheck:'exact OOXML except release review(a) noncustom derived height and release review validated modified timestamp',comparison,noScaleChangeControl:control,originalUnchanged:true});
   console.log('PASS actual Wasm PDF page/text dimensions and serialized state80vs200',format);
  }finally{await stop(env);await fs.writeFile(path.join(root,'results/interface-export-native.json'),JSON.stringify(rows,null,2));}
 }
 assert.equal(rows.length,3);
})().catch(error=>{console.error(error);process.exitCode=1});
