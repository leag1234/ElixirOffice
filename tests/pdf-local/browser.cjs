// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright');
const root=process.env.EO_PDF_WORK||'/srv/elixiroffice/wt/pdf-local-A-G1a-work';
(async()=>{const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint());
 try{
 const page=await browser.newPage({viewport:{width:1360,height:960}}),requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.EO_PDF_URL||'http://127.0.0.1:32790/example/local.html');
 async function open(filename){
  const start=Date.now();await page.locator('#file').setInputFiles(filename);
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
  return {ms:Date.now()-start,stats:await page.evaluate(()=>EOLocalSession.stats)};
 }
 const first=await open(path.join(root,'fixtures/public-forms.pdf'));assert.equal(first.stats.pages,2);
 const frame=page.frames().find(f=>f.url().includes('pdfeditor'));
 await frame.waitForFunction(()=>PDFE.getController('Main').api.DocumentRenderer.isFullText,null,{timeout:30000});
 assert.equal(await frame.evaluate(()=>typeof process),'undefined');
 await frame.evaluate(()=>PDFE.getController('Main').api.DocumentRenderer.navigateToPage(1));
 await frame.waitForFunction(()=>PDFE.getController('Main').api.DocumentRenderer.currentPage===1,null,{timeout:10000});
 await frame.evaluate(()=>PDFE.getController('Main').api.DocumentRenderer.navigateToPage(0));
 await frame.waitForFunction(()=>PDFE.getController('Main').api.DocumentRenderer.currentPage===0,null,{timeout:10000});
 const frameBox=await (await frame.frameElement()).boundingBox();
 const textPoint=await frame.evaluate(()=>{const v=PDFE.getController('Main').api.DocumentRenderer,tr=v.getPDFDoc().pagesTransform[0].invert;return {x:v.x+tr.TransformPointX(140,72),y:v.y+tr.TransformPointY(140,72)}});
 await page.mouse.click(frameBox.x+textPoint.x,frameBox.y+textPoint.y);
 const before=await frame.evaluate(()=>{
  const api=PDFE.getController('Main').api,v=api.DocumentRenderer,d=api.getPDFDoc(),field=d.GetField('public_name'),rect=field.GetRect(),tr=d.pagesTransform[0].invert;
  const props=new AscCommon.CSearchSettings();props.SetText('Public PDF page');const found=api.asc_findText(props,true);
  v.file.selectAll();const text=[];api.asc_CheckCopy({pushData:(_format,value)=>text.push(value)},AscCommon.c_oAscClipboardDataFormat.Text);
  v.navigateToPage(0);
  return {annots:d.annots.length,widgets:d.widgets.length,value:field.GetValue(),found,text:text.join(''),rect,point:{x:v.x+tr.TransformPointX((rect[0]+rect[2])/2,(rect[1]+rect[3])/2),y:v.y+tr.TransformPointY((rect[0]+rect[2])/2,(rect[1]+rect[3])/2)}};
 });assert.equal(before.widgets,1);assert.equal(before.annots,1);assert.equal(before.value,'Initial public value');assert.equal(before.found,2);assert.match(before.text,/Public PDF page 1/);assert.match(before.text,/Public PDF page 2/);
 console.log('BEFORE '+JSON.stringify(before));
 await page.mouse.click(frameBox.x+before.point.x,frameBox.y+before.point.y);
 await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().activeForm?.GetFullName()==='public_name',null,{timeout:10000});
 const active=await frame.evaluate(()=>PDFE.getController('Main').api.getPDFDoc().activeForm?.GetFullName());assert.equal(active,'public_name');
 await page.keyboard.press('Control+A');await page.keyboard.type('Filled public value');await page.keyboard.press('Tab');
 await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().GetField('public_name').GetValue()==='Filled public value',null,{timeout:10000});
 const result=await frame.evaluate(()=>{
  const api=PDFE.getController('Main').api,d=api.getPDFDoc(),comment=new Asc.asc_CCommentDataWord(null);
  comment.asc_putText('Public browser annotation');comment.asc_putUserName('Public browser author');comment.asc_putUserId('local');comment.asc_putTime(String(Date.now()));comment.asc_putOnlyOfficeTime(String(Date.now()));const id=api.asc_addComment(comment);api.CheckChangedDocument();
  const action=new AscPDF.CActionRunScript('globalThis.__eoForbiddenPdfScript=true; fetch("https://example.invalid/never")');action.RunScript();
  return {id,dirty:parent.EOLocalSession.controller.isModified(),scriptRan:!!globalThis.__eoForbiddenPdfScript,bytes:Array.from(parent.EOLocalSession.controller.serialize())};
 });assert(result.id);assert.equal(result.dirty,true);assert.equal(result.scriptRan,false);
 delete result.bytes;
 page.once('dialog',dialog=>dialog.accept());
 const downloadEvent=page.waitForEvent('download');
 await frame.evaluate(()=>PDFE.getController('Main').api.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF)));
 const download=await downloadEvent,output=path.join(root,'web-filled-annotated.pdf');await download.saveAs(output);
 assert.equal((await fs.readFile(output)).subarray(0,5).toString(),'%PDF-');
 assert.equal(await page.locator('#save').isDisabled(),true,'original Save remains disabled after a PDF copy export');
 await page.screenshot({path:path.join(root,'web-filled.png')});
 page.once('dialog',dialog=>dialog.accept());const reopened=await open(output);
 const reopenedFrame=page.frames().find(f=>f.url().includes('pdfeditor'));
 const retained=await reopenedFrame.evaluate(()=>{const d=PDFE.getController('Main').api.getPDFDoc();return {value:d.GetField('public_name').GetValue(),comments:d.annots.map(a=>({contents:a.GetContents(),author:a.GetAuthor()})),pages:d.Viewer.file.pages.length};});
 assert.equal(retained.value,'Filled public value');assert.equal(retained.pages,2);assert(retained.comments.some(c=>c.contents==='Public browser annotation'&&c.author==='Public browser author'));assert(retained.comments.some(c=>c.contents==='Existing public annotation'));
 const large=await open(path.join(root,'fixtures/public-large.pdf'));assert.equal(large.stats.pages,250);
 assert(!requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==new URL(page.url()).origin||(!new URL(r.url).pathname.startsWith('/example/local-assets/')&&!['/example/local.html','/example/elixir-local/local.js'].includes(new URL(r.url).pathname))),JSON.stringify(requests));assert.equal(errors.length,0,JSON.stringify(errors));
 const report={first,before,result,reopened,retained,large,requests:requests.length,errors,process:server.process().pid};
 await fs.writeFile(path.join(root,'web-acceptance.json'),JSON.stringify(report,null,2));console.log('PASS public PDF view/search/select/copy/form UI/annotation/export/fresh reopen/250pages/no external requests '+JSON.stringify(report));
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

