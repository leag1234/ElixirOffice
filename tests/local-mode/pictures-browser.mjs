/* SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_PICTURE_FIXTURES,out=process.env.EO_PICTURE_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out);fs.mkdirSync(out,{recursive:true});
const image=fs.readFileSync(path.join(fixtures,'image.png')),requests=[];
const server=http.createServer((req,res)=>{
 requests.push({path:req.url,cookie:req.headers.cookie,authorization:req.headers.authorization,referer:req.headers.referer});
 res.setHeader('Access-Control-Allow-Origin','*');
 if(req.url==='/redirect'){res.writeHead(302,{Location:remote+'/picture.png'});res.end();return}
 if(req.url==='/oversized'){res.setHeader('Content-Length',21*1024*1024);res.end();return}
 if(req.url==='/stream'){res.setHeader('Content-Type','image/png');res.setHeader('Transfer-Encoding','chunked');res.write(Buffer.alloc(21*1024*1024));res.end();return}
 if(req.url==='/slow'){res.setHeader('Content-Type','image/png');res.flushHeaders();return}
 res.setHeader('Content-Type','image/png');res.end(image);
});
await new Promise(resolve=>server.listen(Number(process.env.EO_IMAGE_HTTP_PORT)||0,process.env.EO_IMAGE_HTTP_BIND||'127.0.0.1',resolve));
const remote=process.env.EO_IMAGE_HTTP_PREFIX?base+process.env.EO_IMAGE_HTTP_PREFIX:'http://127.0.0.1:'+server.address().port,browser=await chromium.launch(),report=[];
const watchdog=setTimeout(()=>browser.close(),180000);
async function open(file,kind){
 const context=await browser.newContext({acceptDownloads:true});await context.addCookies([{name:'EO_PUBLIC_TEST_COOKIE',value:'must-not-leak',url:base}]);const page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')network.push({method:r.method(),url:r.url()})});
 await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>f.url().includes('/'+kind+'/main/'));assert(frame);assert((await frame.evaluate(()=>innerHeight))>350);
 return{context,page,frame,errors,network};
}
async function drawingCount(env,kind){return env.frame.evaluate(kind=>{const api=Asc.editor;return kind==='documenteditor'?api.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length:kind==='spreadsheeteditor'?api.wbModel.aWorksheets[0].Drawings.length:api.WordControl.m_oLogicDocument.Slides[0].cSld.spTree.length},kind)}
async function settled(env){
 await env.page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});
 assert.equal(await env.frame.evaluate(()=>Asc.editor.isLongAction()),false,'Image action remains blocked');
}
async function dismiss(frame){const buttons=frame.locator('.asc-window.modal:visible button[result=ok]');while(await buttons.count())await buttons.last().click();}
try{
 for(const [name,kind] of [['offline-review.docx','documenteditor'],['new.xlsx','spreadsheeteditor'],['new.pptx','presentationeditor']]){
  console.log('opening',kind);const env=await open(path.join(fixtures,name),kind);console.log('ready',kind);console.log('image hooks',await env.frame.evaluate(()=>({add:Asc.editor.AddImageUrl.toString().slice(0,250),send:AscCommon.sendImgUrls.toString().slice(0,250),upload:AscCommon.UploadImageFiles.toString().slice(0,200)})));
  try{
   const originalDrawings=await drawingCount(env,kind);
   assert.equal(await env.frame.evaluate(()=>{
    const url=AscCommon.g_oDocumentUrls.addImageUrl,save=Asc.editor.asc_Save,add=Asc.editor.AddImageUrl;
    let rejected=false;try{Common.ElixirLocal.install(Asc.editor,{format:'docx'});}catch(error){rejected=/Only one local picture session/.test(error.message);}
    return rejected&&url===AscCommon.g_oDocumentUrls.addImageUrl&&save===Asc.editor.asc_Save&&add===Asc.editor.AddImageUrl;
   }),true,'Duplicate session changed live handlers');
   // Same actual SDK contract used by clipboard images; no conversion or model stub.
   const uploaded=await env.frame.evaluate(async encoded=>{
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),api=Asc.editor;
    api.sync_StartAction(Asc.c_oAscAsyncActionType.BlockInteraction,Asc.c_oAscAsyncAction.UploadImage);
    return new Promise(resolve=>AscCommon.UploadImageFiles([new File([bytes],'clipboard.png',{type:'image/png'})],api.documentId,api.documentUserId,null,null,null,null,(error,urls)=>{
     if(error===Asc.c_oAscError.ID.No)api._addImageUrl(urls);
     api.sync_EndAction(Asc.c_oAscAsyncActionType.BlockInteraction,Asc.c_oAscAsyncAction.UploadImage);resolve({error,count:urls.length});
    }));
   },image.toString('base64'));
   console.log('uploaded',uploaded);assert.deepEqual(uploaded,{error:0,count:1});await settled(env);
   const pasted=await env.frame.evaluate(encoded=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('sendImgUrls callback timed out')),20000);AscCommon.sendImgUrls(Asc.editor,['data:image/png;base64,'+encoded],data=>{clearTimeout(timer);Asc.editor._addImageUrl(data.map(item=>item.url));resolve(data)})}),image.toString('base64'));
   console.log('pasted',pasted);assert.equal(pasted.length,1);assert(pasted[0].path.startsWith('media/local-'));await settled(env);
   // General paste cannot fetch a remote image; the explicit UI command can.
   console.log('testing URLs');const before=requests.length;
   const denied=await env.frame.evaluate(url=>new Promise(resolve=>AscCommon.sendImgUrls(Asc.editor,[url],resolve,true)),remote+'/picture.png');
   assert.equal(denied[0].url,'error');assert.equal(requests.length,before);await settled(env);
   await env.frame.evaluate(url=>Asc.editor.AddImageUrl([url]),process.env.EO_IMAGE_HTTP_PREFIX?remote+'/picture.png':base+'/example/local-assets/web-apps/test-fixtures/image.png');await settled(env);
   console.log('URL success',requests,'warnings',await env.frame.locator('.asc-window.modal:visible').allTextContents());for(const endpoint of ['/redirect','/oversized','/stream','/slow']){
    await env.frame.evaluate(url=>Asc.editor.AddImageUrl([url]),remote+endpoint);await settled(env);await dismiss(env.frame);
   }
   if(process.env.EO_IMAGE_HTTP_PREFIX){
    assert.equal(requests.filter(r=>r.path==='/picture.png').length,report.length+1,'Redirect or implicit paste fetched the picture');
    for(const endpoint of ['/redirect','/oversized','/stream','/slow'])assert.equal(requests.filter(r=>r.path===endpoint).length,report.length+1);
   }else assert.equal(requests.length,0,'Local CSP permitted an external request');
   const externalBefore=requests.length;await env.frame.evaluate(()=>Asc.editor.AddImageUrl(['https://example.invalid/offline-picture.png']));await settled(env);
   assert((await env.frame.locator('.asc-window.modal:visible').allTextContents()).some(text=>text.includes('unavailable in local mode')));
   await dismiss(env.frame);assert.equal(requests.length,externalBefore);
   await env.frame.evaluate(()=>Asc.editor.AddImageUrl(['javascript:alert(1)']));await settled(env);await dismiss(env.frame);
   const failed=await env.frame.evaluate(()=>new Promise(resolve=>{
    const api=Asc.editor;api.sync_StartAction(Asc.c_oAscAsyncActionType.BlockInteraction,Asc.c_oAscAsyncAction.UploadImage);
    AscCommon.UploadImageFiles([new File(['broken'],'invalid.png',{type:'image/png'})],api.documentId,api.documentUserId,null,null,null,null,(error,urls)=>{
     api.sync_EndAction(Asc.c_oAscAsyncActionType.BlockInteraction,Asc.c_oAscAsyncAction.UploadImage);resolve({error,count:urls.length});
    });
   }));
   assert.notEqual(failed.error,0);assert.equal(failed.count,0);await settled(env);await dismiss(env.frame);
   assert.equal(await drawingCount(env,kind),originalDrawings+3);
   console.log('saving',kind);const download=env.page.waitForEvent('download',{timeout:90000});await env.page.locator('#save').click();const saved=path.join(out,name);await(await download).saveAs(saved);
   execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);media=[z.read(n) for n in z.namelist() if '/media/' in n];wanted=open(sys.argv[2],'rb').read();assert media.count(wanted)>=3,(len(media),media.count(wanted))",saved,path.join(fixtures,'image.png')]);
   assert.deepEqual(env.errors,[]);assert.deepEqual(env.network,[]);
   await env.context.close();const reopened=await open(saved,kind);
   try{
    assert.equal(await drawingCount(reopened,kind),originalDrawings+3,'Reopened drawing objects were dropped');
    await reopened.frame.waitForFunction(()=>{
     const urls=Array.from(new Set(Object.values(AscCommon.g_oDocumentUrls.urls||{}).filter(url=>url.startsWith('blob:'))));
     return urls.length>=3&&urls.every(url=>{const image=Asc.editor.ImageLoader.map_image_index[url]?.Image;return image&&image.complete&&image.naturalWidth>0;});
    },null,{timeout:30000});
    await reopened.page.screenshot({path:path.join(out,kind+'-reopened.png')});assert.deepEqual(reopened.errors,[]);assert.deepEqual(reopened.network,[]);}finally{await reopened.context.close()}
   report.push({kind,uploaded,denied,failed,saved,exactImages:3});
  }finally{await env.context.close()}
 }
 assert(requests.every(r=>!r.cookie&&!r.authorization&&!r.referer),'URL fetch leaked credentials or referrer');
 fs.writeFileSync(path.join(out,'pictures.json'),JSON.stringify({report,requests},null,2));
 console.log('PASS three editors: real SDK image contracts, exact saved PNG bytes, fresh reopen, explicit permitted local URL only, CSP/invalid failures settle without network uploads');
}finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
