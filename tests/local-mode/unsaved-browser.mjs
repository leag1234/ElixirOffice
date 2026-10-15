import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&fixtures);
const browser=await chromium.launch();
try {
 for(const ext of ['docx','odt','xlsx','ods','pptx','odp']){
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
  const file=path.join(fixtures,fs.readdirSync(fixtures).find(f=>f.endsWith('.'+ext)));
  const unexpected=d=>{throw new Error(ext+' unexpected prompt at '+page.url()+': '+d.message());};page.on('dialog',unexpected);
  await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
  console.log('STAGE ready',ext);
  // An unchanged document can be replaced without a prompt.
  await page.evaluate(()=>{window.__oldSession=EOLocalSession;});
  await page.evaluate(async({name,bytes})=>EOLocalOpen(new File([new Uint8Array(bytes)],name)),{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
  assert.equal(await page.evaluate(()=>EOLocalSession!==window.__oldSession),true);console.log('STAGE replaced',ext);
  const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
  await frame.evaluate(ext=>{
   const api=(window.DE||window.SSE||window.PE).getController('Main').api;
   if(ext==='docx'||ext==='odt')api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
   if(ext==='pptx'||ext==='odp'){
    const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);
    control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
   }
   api.asc_enterText(Array.from('W3UNSAVED',c=>c.codePointAt(0)));
   if(ext==='xlsx'||ext==='ods')api.asc_closeCellEditor();
  },ext);
  await page.evaluate(()=>{window.__oldSession=EOLocalSession;window.__before=Array.from(EOLocalSession.controller.serialize());});
  page.off('dialog',unexpected);
  const dismissed=new Promise(resolve=>page.once('dialog',async d=>{assert.equal(d.type(),'confirm');assert.match(d.message(),/unsaved changes/);await d.dismiss();resolve();}));
  await page.locator('#file').setInputFiles(file);
  await dismissed;assert.equal(await page.locator('#file').inputValue(),'');
  assert.equal(await page.evaluate(()=>EOLocalSession===window.__oldSession),true);
  assert.deepEqual(await page.evaluate(()=>Array.from(EOLocalSession.controller.serialize())),await page.evaluate(()=>window.__before));
  // Completed save updates the snapshot; the replacement needs no warning.
  page.on('dialog',unexpected);
  const download=page.waitForEvent('download');await page.locator('#save').click();await download;
  await page.waitForFunction(()=>!document.getElementById('file').disabled);
  await page.evaluate(async({name,bytes})=>EOLocalOpen(new File([new Uint8Array(bytes)],name)),{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
  assert.equal(await page.evaluate(()=>EOLocalSession!==window.__oldSession),true);console.log('STAGE replaced',ext);
  // New edits still require explicit discard, whose acceptance opens the next file.
  const next=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
  await next.evaluate(ext=>{const api=(window.DE||window.SSE||window.PE).getController('Main').api;if(ext==='pptx'||ext==='odp'){const doc=api.WordControl.m_oLogicDocument,c=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);c.resetSelection();shape.select(c,0);c.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();}api.asc_enterText([88]);if(window.SSE)api.asc_closeCellEditor();},ext);
  page.off('dialog',unexpected);let accepted=false;
  page.once('dialog',async d=>{assert.match(d.message(),/unsaved changes/);accepted=true;await d.accept();});
  await page.evaluate(async({name,bytes})=>EOLocalOpen(new File([new Uint8Array(bytes)],name)),{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
  assert.equal(accepted,true);
  console.log('PASS unsaved replacement/cancel/save/discard',ext);await context.close();
 }
}finally{await browser.close();}
