// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright'),root=process.env.EO_PDF_WORK;
const upstream=process.env.EO_UPSTREAM;if(!root||!upstream)throw Error('EO_PDF_WORK and EO_UPSTREAM are required');
(async()=>{const browser=await firefox.launch({headless:true});try{
 const page=await browser.newPage(),requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.EO_PDF_URL||'http://127.0.0.1:32792/example/local.html');
 await page.locator('#file').setInputFiles(path.join(root,'fixtures/public-forms.pdf'));
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 const frame=page.frames().find(f=>f.url().includes('pdfeditor'));
 const source=await require('./load-writer.cjs')(upstream);
 await frame.evaluate(source=>{(0,eval)(source)},source);
 await frame.evaluate(()=>new Promise((resolve,reject)=>require(['PdfWriterProof'],module=>{window.PdfWriterProof=module;resolve()},reject)));
 const original=Array.from(await fs.readFile(path.join(root,'fixtures/public-forms.pdf'))),results={};
 results.policy=await frame.evaluate(original=>PdfWriterProof.inspect(new Uint8Array(original)),original);assert.equal(results.policy.writable,true);
 for(const [name,input] of [['first','changes.bin'],['saved-again','changes-saved-again.bin'],['second','changes-second.bin'],['undo','changes-undo.bin']]){
  const changes=Array.from(await fs.readFile(path.join(root,input)));
  const start=Date.now();
  const bytes=Buffer.from(await frame.evaluate(async data=>Array.from(await PdfWriterProof.write(new Uint8Array(data.original),new Uint8Array(data.changes))),{original,changes}));
  assert.deepEqual(bytes.subarray(0,original.length),Buffer.from(original));
  await fs.writeFile(path.join(root,'preserved-'+name+'.pdf'),bytes);results[name]={bytes:bytes.length,ms:Date.now()-start};
 }
 const cancellation=await frame.evaluate(async original=>{const abort=new AbortController();abort.abort();try{await PdfWriterProof.write(new Uint8Array(original),null,{signal:abort.signal});return null}catch(error){return error.message}},original);
 assert.match(cancellation,/cancelled/);results.cancellation=cancellation;
 assert.equal(await page.locator('#save').isDisabled(),false,'review candidate enables Save only after a writable policy');
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===new URL(page.url()).origin&&(new URL(r.url).pathname.startsWith('/example/local-assets/')||['/example/local.html','/example/elixir-local/local.js'].includes(new URL(r.url).pathname))),JSON.stringify(requests));
 results.requests=requests.length;results.errors=errors;await fs.writeFile(path.join(root,'browser-writer-proof.json'),JSON.stringify(results,null,2));console.log('PASS isolated preservation worker proof (no native IPC writes) '+JSON.stringify(results));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
