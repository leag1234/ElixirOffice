// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out,'own EO_BASE/fixtures/out required');
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
const report=[];
const server=process.env.EO_LOCAL_SERVER==='1';
try{
 const cases=process.env.EO_LOCAL_ALL==='1'?fs.readdirSync(fixtures).filter(f=>/\.(docx|odt|xlsx|ods|pptx|odp)$/.test(f)):['docx','odt','xlsx','ods','pptx','odp'].map(ext=>fs.readdirSync(fixtures).find(f=>f.endsWith('.'+ext)));
 for(const file of cases){
  const ext=path.extname(file).slice(1);
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage(),bad=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.protocol==='blob:'||u.protocol==='data:')return;if(r.method()!=='GET'||u.origin!==new URL(base).origin||!(/^\/example\/local-assets\/(?:\d+\.\d+\.\d+-[a-f0-9]+\/)?(web-apps|sdkjs|fonts|dictionaries)\//.test(u.pathname)||u.pathname==='/example/local.html'||u.pathname==='/example/elixir-local/local.js'))bad.push(r.url());});
  page.on('websocket',w=>bad.push(w.url()));
  if(process.env.EO_LOCAL_PACKAGED==='1')page.on('request',r=>{if(/elixir-local\/Controller(?:\.js)?(?:\?|$)/.test(r.url()))bad.push('raw Controller fallback: '+r.url());});
  assert.ok(file);
  const started=Date.now();
  if(server){
   const up=await context.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:file,mimeType:'application/octet-stream',buffer:fs.readFileSync(path.join(fixtures,file))}}});
   const j=await up.json();assert.ok(j.filename,'server baseline upload');
   await page.goto(base+'/example/editor?fileName='+encodeURIComponent(j.filename)+'&lang=en');
   const f=await (await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();
   await f.waitForFunction(()=>{try{const api=(window.DE||window.SSE||window.PE).getController('Main').api;return api.isDocumentLoadComplete&&!api.isLongAction();}catch(e){return false;}},null,{timeout:90000});
  }else{
   await page.goto(base+'/example/local.html');
   await page.locator('#file').setInputFiles(path.join(fixtures,file));
   await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
   assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
  }
  const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));assert.ok(frame);
  if(process.env.EO_LOCAL_MIN_PAGES&&ext==='docx')await frame.waitForFunction(min=>{
   const api=DE.getController('Main').api;return api.WordControl.m_oLogicDocument.Pages.length>=min;
  },Number(process.env.EO_LOCAL_MIN_PAGES),{timeout:90000});
  const openedMs=Date.now()-started;
  const edit=await frame.evaluate(ext=>{
   const api=(window.DE||window.SSE||window.PE).getController('Main').api,marker='W3LOCAL',codes=Array.from(marker,c=>c.codePointAt(0));
   if(ext==='docx'||ext==='odt')api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
   if(ext==='pptx'||ext==='odp'){
    const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);
    if(!shape)throw new Error('No editable text shape');
    control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
   }
   const inserted=api.asc_enterText(codes);
   if(ext==='xlsx'||ext==='ods')api.asc_closeCellEditor();
   return {inserted,ready:api.isDocumentLoadComplete,offline:api.DocInfo.get_OfflineApp(),pages:api.WordControl&&api.WordControl.m_oDrawingDocument&&api.WordControl.m_oDrawingDocument.m_lPagesCount};
  },ext);
  if(process.env.EO_LOCAL_MIN_PAGES&&ext==='docx')assert.equal(edit.pages,Number(process.env.EO_LOCAL_MIN_PAGES));
  assert.equal(edit.ready,true);assert.equal(edit.offline,!server);// EnterText returns a bubbling flag in spreadsheets; saved XML below proves the edit.
  if(process.env.EO_LOCAL_IMAGE&&!server){
   const picker=page.waitForEvent('filechooser');
   await frame.evaluate(()=>(window.DE||window.SSE||window.PE).getController('Main').api.asc_addImage());
   await (await picker).setFiles(process.env.EO_LOCAL_IMAGE);
  }
  const saveStarted=Date.now();
  const downloadPromise=page.waitForEvent('download',{timeout:90000});if(server)await frame.evaluate(ext=>{
   const api=(window.DE||window.SSE||window.PE).getController('Main').api,codes={docx:65,odt:67,xlsx:257,ods:259,pptx:129,odp:131};
   api.asc_DownloadAs(new Asc.asc_CDownloadOptions(codes[ext]));
  },ext);else await page.locator('#save').click();
  const download=await downloadPromise,dest=path.join(out,process.env.EO_LOCAL_ALL==='1'?file:'edited.'+ext);await download.saveAs(dest);
  assert.equal(path.extname(download.suggestedFilename()),'.'+ext);
  execFileSync('python3',['-c',
   "import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); texts=[''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')]; assert any('W3LOCAL' in t for t in texts),'edit missing from saved document'",dest]);
  if(process.env.EO_LOCAL_IMAGE&&!server)execFileSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); b=open(sys.argv[2],'rb').read(); assert b in [z.read(n) for n in z.namelist() if '/media/' in n or n.startswith('Pictures/')], 'inserted image missing'",dest,process.env.EO_LOCAL_IMAGE]);
  if(process.env.EO_LOCAL_IMAGE&&!server){
   if(process.env.EO_LOCAL_REPLACEMENT){
    const picker=page.waitForEvent('filechooser');
    await frame.evaluate(()=>(window.DE||window.SSE||window.PE).getController('Main').api.asc_addImage({isImageChangeUrl:true}));
    await (await picker).setFiles(process.env.EO_LOCAL_REPLACEMENT);
   }
   const again=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();
   const second=await again,secondDest=path.join(out,'second.'+ext);await second.saveAs(secondDest);
   execFileSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); b=open(sys.argv[2],'rb').read(); assert b in [z.read(n) for n in z.namelist() if '/media/' in n or n.startswith('Pictures/')], 'repeated save image missing'",secondDest,process.env.EO_LOCAL_REPLACEMENT||process.env.EO_LOCAL_IMAGE]);
   if(process.env.EO_LOCAL_REPLACEMENT)execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E; count=lambda p:sum(1 for n in zipfile.ZipFile(p).namelist() if n.endswith('.xml') for e in E.fromstring(zipfile.ZipFile(p).read(n)).iter() if e.tag.split('}')[-1] in ['blip','image']); assert count(sys.argv[1])==count(sys.argv[2]), 'replacement added an extra image'",dest,secondDest]);
  }
  if(!server)assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);
  const item={file,format:ext,openedMs,saveMs:Date.now()-saveStarted,totalMs:Date.now()-started,bytes:fs.statSync(dest).size,edit,stats:server?null:await page.evaluate(()=>EOLocalSession.stats)};
  report.push(item);console.log('PASS',JSON.stringify(item));await context.close();
 }
 fs.writeFileSync(path.join(out,'editor-report.json'),JSON.stringify(report,null,2));
 console.log(server?'PASS six-format server editor reference saves':'PASS six-format real editor content edits and same-format local saves, zero dynamic document-server requests');
}finally{await browser.close();}
