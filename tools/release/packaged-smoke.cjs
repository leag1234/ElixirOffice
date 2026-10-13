// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Extend the existing packaged tests with all-six-format PDF conversion.
// Use the real sandboxed app, existing edit/save helpers and pinned Wasm backend.
// Native PDF save-sheet acceptance is covered by package.cjs on Linux; the
// Mac matrix follows mac-unattended.cjs and does not claim native-sheet coverage.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(process.env.EO_DESKTOP_ROOT);
const {launch,stop,editable,fixture}=require(path.join(root,'tests/desktop/harness.cjs'));
const {edit,text}=require(path.join(root,'tests/desktop/lifecycle.cjs'));
const action=require(path.join(root,'tests/desktop/file-action.cjs'));
const formats=['docx','xlsx','pptx','odt','ods','odp'],rows=[];
async function report(){await fs.writeFile(path.join(root,'results/six-format-smoke.json'),JSON.stringify({platform:process.platform,rows,nativePdfSheet:process.platform==='linux'?'existing Word packaged check':'unverified'},null,2));}
async function derive(){
 const env=await launch({file:await fixture('sample.docx'),profile:'derive-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
 try{
  await editable(env);
  for(const[from,to]of[['docx','odt'],['xlsx','ods'],['pptx','odp']]){
   const input=await fs.readFile(path.join(root,'fixtures/sample.'+from));
   const bytes=await env.page.evaluate(async({input,from,to})=>Array.from(await EOLocalSession.win.EOWasmConvert.convert(new EOLocalSession.win.Uint8Array(input),from,to)),{input:Array.from(input),from,to});
   await fs.writeFile(path.join(root,'fixtures/sample-from-x2t.'+to),Buffer.from(bytes));
  }
  assert.deepEqual(env.errors,[]);
 }finally{await stop(env)}
}
async function check(format){
 const source=['odt','ods','odp'].includes(format)?'sample-from-x2t.'+format:'sample.'+format;
 const target=await fixture(source);let env;
 try{
  env=await launch({file:target,profile:'release-'+format+'-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
  await editable(env);await edit(env);await action(env.page,'save');
  await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified()||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  assert(text(target).includes('EODESKTOP'),'Saved edit missing');
  const result=await env.page.evaluate(async()=>{
   const{win,api,format}=EOLocalSession;
   const script=url=>new Promise((resolve,reject)=>{const tag=win.document.createElement('script');tag.src=url;tag.onload=resolve;tag.onerror=reject;win.document.head.append(tag)});
   if(!win.EOClientPdf)await script('/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
   if(!win.EOWasmPdf)await script('/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
   if(!win.EODesktopPdf)await script('/example/local-assets/sdkjs/common/desktop/pdf.js');
   const pdf=await win.EODesktopPdf(api,format);return{bytes:Array.from(pdf.bytes),stats:pdf.stats};
  });
  assert.equal(result.stats.backend,'wasm');
  const pdf=path.join(root,'results',format+'.pdf');await fs.writeFile(pdf,Buffer.from(result.bytes));
  assert(cp.execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'}).replace(/\s/g,'').includes('EODESKTOP'),'PDF lost saved edit');
  const info=cp.execFileSync('pdfinfo',[pdf],{encoding:'utf8'});assert.equal(Number(/Pages:\s+(\d+)/.exec(info)[1]),result.stats.pages);
  assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&(/^(eoapp:|blob:|data:)/.test(r.url))));
  const row={format,status:'pass',pdfBackend:result.stats.backend,bytes:(await fs.stat(target)).size,pdfBytes:result.bytes.length,pages:result.stats.pages,savedSha256:crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex')};
  await stop(env);env=null;
  const fresh=await launch({file:target,profile:'release-reopen-'+format+'-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
  try{
   await editable(fresh);assert(await fresh.page.evaluate(()=>{const bytes=new Uint8Array(EOLocalSession.controller.serialize()),needle=Array.from('EODESKTOP').flatMap(c=>[c.charCodeAt(0),0]);return bytes.some((_v,i)=>needle.every((v,j)=>bytes[i+j]===v))}),'Fresh reopen lost edit');
   assert.deepEqual(fresh.errors,[]);
  }finally{await stop(fresh)}
  rows.push(row);console.log('PASS packaged open/edit/save/reopen/Wasm-PDF',format);
 }finally{if(env)await stop(env)}
}
(async()=>{
 assert(process.env.EO_PACKAGE_EXECUTABLE,'Explicit packaged executable required');
 const immutable={};for(const format of ['docx','xlsx','pptx'])immutable[format]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'fixtures/sample.'+format))).digest('hex');
 await derive();
 for(const format of formats){try{await check(format)}catch(error){rows.push({format,status:'fail',error:error.message});console.error('FAIL',format,error);}await report()}
 for(const format of ['docx','xlsx','pptx'])assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root,'fixtures/sample.'+format))).digest('hex'),immutable[format]);
 assert.equal(rows.length,6);assert(rows.every(row=>row.status==='pass'),'Packaged matrix has failures');
})().catch(error=>{console.error(error);process.exitCode=1});
