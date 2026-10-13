/* SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{createRequire}from'node:module';
const{chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_PICTURE_FIXTURES,out=process.env.EO_PICTURE_OUT;assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out);fs.mkdirSync(out,{recursive:true});
const image=fs.readFileSync(path.join(fixtures,'image.png')),browser=await chromium.launch(),report=[];
async function count(frame,kind){return frame.evaluate(kind=>{const api=Asc.editor;return kind==='documenteditor'?api.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length:kind==='spreadsheeteditor'?api.wbModel.aWorksheets[0].Drawings.length:api.WordControl.m_oLogicDocument.Slides[0].cSld.spTree.length},kind)}
try{
 for(const[name,kind]of[['offline-review.docx','documenteditor'],['new.xlsx','spreadsheeteditor'],['new.pptx','presentationeditor']]){
  const context=await browser.newContext({acceptDownloads:true,permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),bad=[],errors=[];
  page.on('request',request=>{const url=new URL(request.url());if(!['blob:','data:'].includes(url.protocol)&&(request.method()!=='GET'||url.origin!==new URL(base).origin))bad.push(request.url())});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(path.join(fixtures,name));await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
  const frame=page.frames().find(f=>f.url().includes('/'+kind+'/main/'));assert(frame);const initial=await count(frame,kind);
  for(const tip of await frame.getByText('Got it',{exact:true}).all())if(await tip.isVisible())await tip.click();
  await frame.evaluate(()=>{window.EOPaste=[];document.addEventListener('paste',event=>EOPaste.push({trusted:event.isTrusted,types:Array.from(event.clipboardData.types),files:Array.from(event.clipboardData.files).map(file=>({name:file.name,type:file.type,size:file.size}))}),true)});
  await page.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([bytes],{type:'image/png'})})]);},image.toString('base64'));
  await frame.locator('#editor_sdk').click({position:{x:200,y:150}});await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);const area=document.getElementById('area_id');if(area)area.focus();});await page.keyboard.press('Control+v');

  await frame.waitForFunction(({kind,n})=>{const api=Asc.editor;return(kind==='documenteditor'?api.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length:kind==='spreadsheeteditor'?api.wbModel.aWorksheets[0].Drawings.length:api.WordControl.m_oLogicDocument.Slides[0].cSld.spTree.length)===n},{kind,n:initial+1},{timeout:30000});
  assert((await frame.evaluate(()=>EOPaste)).some(event=>event.trusted&&event.files.some(file=>file.type==='image/png')),'A real browser PNG clipboard paste is required');
  await frame.waitForFunction(()=>!Asc.editor.isLongAction(),null,{timeout:30000});
  await page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});
  const target=await frame.locator(await frame.evaluate(()=> '#'+Asc.editor.HtmlElement.id)).boundingBox();assert(target);
  const session=await context.newCDPSession(page),data={items:[],files:[path.join(fixtures,'image.png')],dragOperationsMask:1};
  try{for(const type of['dragEnter','dragOver','drop'])await session.send('Input.dispatchDragEvent',{type,x:target.x+250,y:target.y+150,data});}finally{await session.detach()}
  await frame.waitForFunction(({kind,n})=>{const api=Asc.editor;return(kind==='documenteditor'?api.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length:kind==='spreadsheeteditor'?api.wbModel.aWorksheets[0].Drawings.length:api.WordControl.m_oLogicDocument.Slides[0].cSld.spTree.length)===n},{kind,n:initial+2},{timeout:30000});
  await page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});assert.equal(await frame.evaluate(()=>Asc.editor.isLongAction()),false);
  const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();const saved=path.join(out,name);await(await download).saveAs(saved);assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);await context.close();
  const fresh=await browser.newContext(),again=await fresh.newPage();await again.goto(base+'/example/local.html?lang=en');await again.locator('#file').setInputFiles(saved);await again.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await again.evaluate(()=>EOLocalFailure),null);
  const f=again.frames().find(f=>f.url().includes('/'+kind+'/main/'));assert.equal(await count(f,kind),initial+2);await fresh.close();report.push({kind,initial,after:initial+2,saved});console.log('PASS actual clipboard CtrlV + real file drag + save/fresh reopen',kind);
 }
 fs.writeFileSync(path.join(out,'gestures.json'),JSON.stringify(report,null,2));
}finally{await browser.close()}
