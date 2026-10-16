// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out,'own EO_BASE, fixtures and out required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),report=[];
const codes={docx:65,odt:67,rtf:68,txt:69,xlsx:257,ods:259,csv:260,pptx:129,odp:131,pdf:513};
const families={word:['docx','odt','rtf','txt','pdf'],cell:['xlsx','ods','csv','pdf'],slide:['pptx','odp','pdf']};
const files={word:'offline-review.docx',cell:'new.xlsx',slide:'new.pptx'};
function contents(file,format){
 if(format==='pdf')return execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});
 if(['txt','csv','rtf'].includes(format))return fs.readFileSync(file,'utf8').replace(/\\u(-?\d+)[*?]/g,(_,n)=>String.fromCharCode((Number(n)+65536)%65536));
 return execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); print(' '.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')))",file],{encoding:'utf8'});
}
async function open(page,file){
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
 assert(frame);return frame;
}
try{for(const kind of ['word','cell','slide']){
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}}),page=await context.newPage(),bad=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('websocket',w=>bad.push(w.url()));
 page.on('request',r=>{const u=new URL(r.url());if(['blob:','data:'].includes(u.protocol))return;
  if(r.method()!=='GET'||u.origin!==new URL(base).origin||!(/^\/example\/local-assets\/(?:\d+\.\d+\.\d+-[a-f0-9]+\/)?(web-apps|sdkjs|fonts|dictionaries)\//.test(u.pathname)||['/example/local.html','/example/elixir-local/local.js'].includes(u.pathname)))bad.push(r.url());
  if(/elixir-local\/Controller(?:\.js)?(?:\?|$)/.test(u.pathname))bad.push('raw Controller fallback');
 });
 const frame=await open(page,path.join(fixtures,files[kind]));
 assert(await frame.evaluate(()=>innerHeight>500),'normal launcher viewport is too small');
 await frame.evaluate(kind=>{
  const api=Asc.editor,marker=Array.from('D3COPY café',c=>c.codePointAt(0));
  if(kind==='word')api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
  if(kind==='slide'){
   const doc=api.WordControl.m_oLogicDocument,controller=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);
   if(!shape)throw Error('Fixture has no editable text shape');controller.resetSelection();shape.select(controller,0);
   controller.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
  }
  api.asc_enterText(marker);if(kind==='cell')api.asc_closeCellEditor();
 },kind);
 assert(await page.evaluate(()=>EOLocalSession.controller.isModified()),'real edit did not mark modified');
 await frame.locator('#toolbar a[data-tab=file]').click();
 await frame.locator('#fm-btn-download').click();
 const listed=await frame.locator('.eo-format-dialog input[type=radio]').evaluateAll((nodes,codes)=>nodes.map(n=>codes[n.value]),codes);
 assert.deepEqual([...listed].sort((a,b)=>a-b),families[kind].map(f=>codes[f]).sort((a,b)=>a-b),'File formats differ from supported list');
 for(const target of families[kind]){
  const pending=page.waitForEvent('download',{timeout:120000});
  // The first item exercises the actual File menu, the rest the same public API.
  if(target===families[kind][0]){
   await frame.locator('.eo-format-dialog input[value="'+target+'"]').check();
   await frame.locator('.eo-format-dialog button[type=submit]').click();
  }
  else await frame.evaluate(code=>Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(code)),codes[target]);
  const download=await pending,dest=path.join(out,kind+'-copy.'+target);await download.saveAs(dest);
  assert.equal(path.extname(download.suggestedFilename()),'.'+target);
  if(target==='pdf')assert.equal(fs.readFileSync(dest).subarray(0,5).toString(),'%PDF-');
  assert(contents(dest,target).includes('D3COPY'),'edit missing from '+kind+' '+target);
  if(['txt','csv'].includes(target))assert(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(dest)).includes('D3COPY café'),'Unicode text missing from '+target);
  assert(await page.evaluate(()=>EOLocalSession.controller.isModified()),'export marked document saved');
  assert.equal(await page.evaluate(()=>EOLocalSession.format),{word:'docx',cell:'xlsx',slide:'pptx'}[kind],'export changed editing format');
  report.push({kind,target,bytes:fs.statSync(dest).size,modified:true});
 }
 await frame.evaluate(()=>{window.EOPrintProbe=null;Asc.editor.asc_registerCallback('asc_onPrintUrl',url=>{window.EOPrintProbe=url});Asc.editor.asc_Print();});
 await frame.waitForFunction(()=>window.EOPrintProbe,null,{timeout:120000});
 const print=await frame.evaluate(async()=>{const response=await fetch(EOPrintProbe),bytes=new Uint8Array(await response.arrayBuffer());return {header:new TextDecoder().decode(bytes.slice(0,5)),length:bytes.length,frame:document.querySelector('#id-print-frame')?.src}});
 assert.equal(print.header,'%PDF-');assert(print.length>100);
 assert.equal(print.frame,await frame.evaluate(()=>EOPrintProbe),'existing Main print iframe did not receive PDF');
 assert(await page.evaluate(()=>EOLocalSession.controller.isModified()),'Print marked document saved');
 if(await frame.locator('#fm-btn-return').isVisible())await frame.locator('#fm-btn-return').click();
 if(kind==='word'){
  await frame.locator('#toolbar a[data-tab=ins]').click();
  assert.equal(await frame.locator('#id-toolbar-btn-text-from-file').isVisible(),false);
   assert.equal(await frame.locator('#slot-elx-ins-object').count(),1);
   assert.equal(await frame.locator('#slot-elx-ins-object').isVisible(),false,'visible mirrored Insert Object entry');
  await frame.evaluate(()=>DE.getController('Toolbar').onTextFromFileClick(null,{value:'file'}));
 }else if(kind==='cell'){
  await frame.locator('#toolbar a[data-tab=data]').click();
  assert.equal(await frame.locator('#slot-btn-data-external-links').isVisible(),false);
 }
 await frame.evaluate(()=>{const links=(window.DE||window.SSE||window.PE).getController('Common.Controllers.ExternalLinks');links.onExternalLinks();links.updateReferences([]);});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 await page.screenshot({path:path.join(out,kind+'.png')});report.push({kind,print,privacy:'zero document requests'});
 await context.close();console.log('PASS',kind,'File formats, content exports, PDF, Print, dirty state, hidden commands, privacy');
}
fs.writeFileSync(path.join(out,'exports-report.json'),JSON.stringify(report,null,2));}finally{await browser.close();}
