// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launch,editable,stop}=require('./harness.cjs');

(async()=>{
 const source=path.join(__dirname,'fixtures','missing-font-info.docx');
 const env=await launch({file:source,profile:'missing-font-info-'+Date.now()});
 try{
  const ready=await editable(env);assert.equal(ready.format,'docx');
  const pdf=await env.page.evaluate(async()=>{
   const session=EOLocalSession,w=session.win;
   const load=url=>new Promise((resolve,reject)=>{const tag=w.document.createElement('script');tag.src=url;tag.onload=resolve;tag.onerror=reject;w.document.head.append(tag)});
   if(!w.EOClientPdf)await load('/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
   if(!w.EOWasmPdf)await load('/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
   if(!w.EODesktopPdf)await load('/example/local-assets/sdkjs/common/desktop/pdf.js');
   const result=await w.EODesktopPdf(session.api,session.format);
   return{bytes:Array.from(result.bytes.slice(0,5)),backend:result.stats.backend};
  });
  assert.equal(pdf.backend,'wasm');assert.equal(Buffer.from(pdf.bytes).toString(),'%PDF-');
  assert.deepEqual(env.errors,[]);
  assert.deepEqual(env.requests.filter(request=>!['eoapp:','blob:','data:'].some(prefix=>request.url.startsWith(prefix))||request.method!=='GET'),[]);
  console.log('PASS public DOCX with missing Marlett font-info opens and exports PDF offline');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
