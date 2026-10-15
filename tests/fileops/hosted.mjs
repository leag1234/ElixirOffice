// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'))('playwright');
const base=process.env.EO_BASE;if(!base)throw Error('Set EO_BASE to an owned instance');
const format=process.env.EO_FILEOPS_FORMAT||'docx',code={docx:65,xlsx:257,pptx:129}[format];
assert(code,'Choose docx/xlsx/pptx');
const fixture=fs.readFileSync(process.env.EO_FILEOPS_FIXTURE||new URL('../fixtures/docx/selection-fills.docx',import.meta.url)),browser=await chromium.launch();
const editor={docx:'documenteditor',xlsx:'spreadsheeteditor',pptx:'presentationeditor'}[format];
const app={docx:'DE',xlsx:'SSE',pptx:'PE'}[format],marker='PUBLIC-STORED-RENAMED';
function text(bytes){return execFileSync('python3',['-c',"import io,sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(' '.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')))"],{input:bytes,encoding:'utf8'});}

try{
 const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),page=await ctx.newPage(),tag='Public-fileops-'+Date.now();
 const uploaded=await (await ctx.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:tag+'.'+format,mimeType:'application/octet-stream',buffer:fixture}}})).json();assert(uploaded.filename);
 async function open(name,folder='/'){
  await page.goto(base+'/example/editor?fileName='+encodeURIComponent(name)+'&folder='+encodeURIComponent(folder)+'&lang=en');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('editor/main/')));
  const frame=page.frames().find(f=>f.url().includes('/'+editor+'/main/'));
  await frame.waitForFunction(app=>window[app]?.getController('Main')?._isDocReady,app,{timeout:120000});return frame;
 }
 let frame=await open(uploaded.filename);
 const originalKey=await frame.evaluate(app=>(window[app].getController('Main').document||window[app].getController('Main').appOptions.spreadsheet).key,app);
 async function rename(stem){
  await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();await frame.locator('#panel-saveas [data-action=rename]').click();
  const before=await frame.evaluate(()=>Asc.editor.asc_getDocumentName().replace(/\.[^.]+$/,''));
  await frame.waitForFunction(name=>document.querySelector('#id-dlg-newname input')?.value===name,before);
  await frame.locator('#id-dlg-newname input').fill(stem);
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/rename'));
  await frame.locator('.asc-window:visible .dlg-btn[result=ok]').click();return response;
 }
 const target=tag+'-renamed.'+format,renamed=await rename(tag+'-renamed');assert.equal(renamed.status(),200,await renamed.text());
 await frame.waitForFunction(name=>Asc.editor.asc_getDocumentName()===name,target);
 const files=await (await ctx.request.get(base+'/example/files')).json();
 assert(!files.some(f=>f.title===uploaded.filename));assert(files.some(f=>f.title===target));
 assert.equal((await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(uploaded.filename))).status(),404);
 assert.deepEqual(await (await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(target))).body(),fixture);
 // A second editor of the renamed file joins the current key; future callbacks must address the new file.
 const other=await ctx.newPage();await other.goto(base+'/example/editor?fileName='+encodeURIComponent(target)+'&lang=en');
 await other.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('editor/main/')));
 const reopened=other.frames().find(f=>f.url().includes('/'+editor+'/main/'));await reopened.waitForFunction(app=>window[app]?.getController('Main')?._isDocReady,app,{timeout:120000});
 assert.equal(await reopened.evaluate(app=>(window[app].getController('Main').document||window[app].getController('Main').appOptions.spreadsheet).key,app),originalKey);await other.close();
 const collision=await (await ctx.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:tag+'-exists.'+format,mimeType:'application/octet-stream',buffer:fixture}}})).json();assert(collision.filename);
 page.once('dialog',d=>d.accept());assert.equal((await rename(collision.filename.replace(/\.[^.]+$/,''))).status(),409);
 assert.deepEqual(await (await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(target))).body(),fixture);
 // A genuine SDK edit remains pending while Save As converts current content.
 await frame.locator('#toolbar a[data-tab=home]').click();
 await frame.evaluate(({format,marker})=>{
  const api=Asc.editor;
  if(format==='docx')api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
  if(format==='pptx'){
   const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(shape=>shape.txBody);
   if(!shape)throw Error('No editable public slide text');
   control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
  }
  api.asc_enterText(Array.from(marker,c=>c.codePointAt(0)));
  if(format==='xlsx')api.asc_closeCellEditor();
 },{format,marker});
 await frame.waitForTimeout(1000);
 const folder='/'+tag+'-copies',mk=await ctx.request.post(base+'/example/elixir/storage/folder',{headers:{'X-Elixir':'1'},data:{folder:'/',name:folder.slice(1)}});assert.equal(mk.status(),200,await mk.text());
 await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();await frame.locator('#panel-saveas .elx-copy-formats .elx-format[format="'+code+'"]').click();
 // Older Word documents ask to leave compatibility mode before conversion.
 await frame.waitForTimeout(300);
 const compatibility=frame.locator('.dlg-btn[result=ok]:visible');
 if(await compatibility.count()){
  const message=await frame.locator('.modal-dlg:visible,.asc-window:visible').allTextContents();
  assert(message.some(text=>/compatibility/i.test(text)),'Unexpected conversion dialog');
  await compatibility.first().click();
 }
 const picker=page.locator('dialog[data-storage-folder-picker=local]');await picker.waitFor({timeout:120000});
 await picker.locator('button[data-folder="'+folder+'"]').click();await picker.locator('p').first().filter({hasText:folder}).waitFor();
 await picker.locator('input').fill('Independent.'+format);const copyResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/storage/copy'));
 await picker.getByRole('button',{name:'Save',exact:true}).click();const copied=await copyResponse;assert.equal(copied.status(),200,await copied.text());const copy=await copied.json();assert.equal(copy.folder,folder);
 const copiedBytes=await ctx.request.get(base+'/example/download?fileName=Independent.'+format+'&folder='+encodeURIComponent(folder));assert.equal(copiedBytes.status(),200);assert((await copiedBytes.body()).subarray(0,2).equals(Buffer.from('PK')));assert(text(await copiedBytes.body()).includes(marker),'Copy lost pending edits');
 assert.deepEqual(await (await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(target))).body(),fixture);
 await page.goto(base+new URL(copy.url).pathname+new URL(copy.url).search);await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('editor/main/')));
 const copyFrame=page.frames().find(f=>f.url().includes('/'+editor+'/main/'));await copyFrame.waitForFunction(app=>window[app]?.getController('Main')?._isDocReady,app,{timeout:120000});
 assert.equal(await copyFrame.evaluate(()=>Asc.editor.asc_getDocumentName()),'Independent.'+format);
 // Closing the original session writes to its renamed file, using the retargeted callback.
 let final;
 for(let i=0;i<180;i++){final=await(await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(target))).body();if(text(final).includes(marker))break;await page.waitForTimeout(500)}
 assert(text(final).includes(marker),'Final callback lost the edit or used the old name');
 assert.equal((await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(uploaded.filename))).status(),404);

 const invalid=await ctx.request.delete(base+'/example/file?fileName=..');assert.equal(invalid.status(),400);
 assert.equal((await ctx.request.get(base+'/example/download?fileName=Independent.'+format+'&folder='+encodeURIComponent('/../'))).status(),404);
 console.log('PASS '+format+' stored rename, key/reopen, conflict, pending edits in selected-folder copy, final save at renamed path, copy reopen, originals, delete/traversal');
 await ctx.close();
}finally{await browser.close()}
