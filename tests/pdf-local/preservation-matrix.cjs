// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright'),root=process.env.EO_PDF_WORK;
const upstream=process.env.EO_UPSTREAM;if(!root||!upstream)throw Error('EO_PDF_WORK and EO_UPSTREAM are required');
function snapshot(){
 const api=PDFE.getController('Main').api,doc=api.getPDFDoc(),native=api.DocumentRenderer.file.nativeFile;
 return {pages:doc.Viewer.file.pages.length,value:doc.GetField('public_name').GetValue(),
  annots:doc.annots.map(a=>({contents:a.GetContents(),author:a.GetAuthor(),type:a.GetType(),rect:a.GetRect().map(v=>Math.round(v*1000)/1000)})),
  links:[native.getLinks(0),native.getLinks(1)],outline:native.getStructure()};
}
(async()=>{const browser=await firefox.launch({headless:true});try{
 const results={},source=await require('./load-writer.cjs')(upstream);
 for(const name of ['public-forms.pdf','public-compressed.pdf','public-annotations-link.pdf','public-compressed-annotations-link.pdf']){
  const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[];
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.EO_PDF_URL||'http://127.0.0.1:32792/example/local.html');const input=path.join(root,'policy-fixtures',name);await page.locator('#file').setInputFiles(input);
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
  const frame=page.frames().find(f=>f.url().includes('pdfeditor')),before=await frame.evaluate(snapshot);
  await frame.evaluate(source=>{(0,eval)(source)},source);
  await frame.evaluate(()=>new Promise((resolve,reject)=>require(['PdfWriterProof'],module=>{window.PdfWriterProof=module;resolve()},reject)));
  const original=Array.from(await fs.readFile(input));
  const policy=await frame.evaluate(original=>PdfWriterProof.inspect(new Uint8Array(original)),original);assert.equal(policy.writable,true,name);
  const box=await (await frame.frameElement()).boundingBox();
  const point=await frame.evaluate(()=>{const api=PDFE.getController('Main').api,v=api.DocumentRenderer,doc=api.getPDFDoc(),rect=doc.GetField('public_name').GetRect(),tr=doc.pagesTransform[0].invert;return {x:v.x+tr.TransformPointX((rect[0]+rect[2])/2,(rect[1]+rect[3])/2),y:v.y+tr.TransformPointY((rect[0]+rect[2])/2,(rect[1]+rect[3])/2)}});
  await page.mouse.click(box.x+point.x,box.y+point.y);
  await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().activeForm?.GetFullName()==='public_name',null,{timeout:10000});
  await page.keyboard.press('Control+A');await page.keyboard.type('Matrix public value');await page.keyboard.press('Tab');
  await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().GetField('public_name').GetValue()==='Matrix public value',null,{timeout:10000});
  const data=await frame.evaluate(async original=>{
   const api=PDFE.getController('Main').api,doc=api.getPDFDoc(),field=doc.GetField('public_name');
   const comment=new Asc.asc_CCommentDataWord(null);comment.asc_putText('Matrix public annotation');comment.asc_putUserName('Matrix public author');comment.asc_putUserId('local');comment.asc_putTime(String(Date.now()));comment.asc_putOnlyOfficeTime(String(Date.now()));api.asc_addComment(comment);api.CheckChangedDocument();
   return Array.from(await PdfWriterProof.write(new Uint8Array(original),api.DocumentRenderer.Save()));
  },original);
  const output=path.join(root,'matrix-'+name),bytes=Buffer.from(data);assert.deepEqual(bytes.subarray(0,original.length),Buffer.from(original));await fs.writeFile(output,bytes);await context.close();
  const fresh=await browser.newContext(),reopened=await fresh.newPage();await reopened.goto(process.env.EO_PDF_URL||'http://127.0.0.1:32792/example/local.html');await reopened.locator('#file').setInputFiles(output);
  await reopened.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await reopened.evaluate(()=>window.EOLocalFailure||null),null);
  const after=await reopened.frames().find(f=>f.url().includes('pdfeditor')).evaluate(snapshot);
  assert.equal(after.pages,before.pages);assert.equal(after.value,'Matrix public value');assert.deepEqual(after.links,before.links);assert.deepEqual(after.outline,before.outline);
  for(const annot of before.annots)assert(after.annots.some(a=>JSON.stringify(a)===JSON.stringify(annot)),name+': lost '+annot.contents);
  assert(after.annots.some(a=>a.contents==='Matrix public annotation'&&a.author==='Matrix public author'));
  assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===new URL(page.url()).origin&&(new URL(r.url).pathname.startsWith('/example/local-assets/')||['/example/local.html','/example/elixir-local/local.js'].includes(new URL(r.url).pathname))));
  results[name]={before,after,bytes:bytes.length,requests:requests.length};await fresh.close();console.log('PASS '+name);
 }
 await fs.writeFile(path.join(root,'broader-browser-proof.json'),JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
