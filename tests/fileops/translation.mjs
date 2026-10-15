// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'))('playwright');
const base=process.env.EO_BASE;assert(base,'Use an owned EO_BASE');const browser=await chromium.launch();
try{
 for(const [lang,lead,save,title,fileName,newFolder,open,close] of [
  ['fr','Choisissez un format, puis un dossier dans votre espace de stockage.','Enregistrer','Enregistrer une copie','Nom du fichier','Nouveau dossier','Ouvrir la copie','Fermer'],
  ['de','Choose a format, then choose a folder in your storage.','Save','Save a Copy','File name','New folder','Open copy','Close']
 ]){
  const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const fixture=fs.readFileSync(new URL('../fixtures/docx/selection-fills.docx',import.meta.url));
  const uploaded=await(await ctx.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:'Public-i18n-'+lang+'-'+Date.now()+'.docx',mimeType:'application/octet-stream',buffer:fixture}}})).json();assert(uploaded.filename);
  await page.goto(base+'/example/editor?fileName='+encodeURIComponent(uploaded.filename)+'&lang='+lang);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('/documenteditor/main/')));
  const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await frame.waitForFunction(()=>window.DE?.getController('Main')?._isDocReady,null,{timeout:120000});
  await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();
  assert.equal(await frame.locator('#panel-saveas .elx-lead').textContent(),lead);
  await frame.locator('#panel-saveas .elx-copy-formats .elx-format[format="65"]').click();
  await frame.waitForTimeout(300);
  const warning=frame.locator('.dlg-btn[result=ok]:visible');
  if(await warning.count()){assert((await frame.locator('.modal-dlg:visible,.asc-window:visible').allTextContents()).some(text=>/compatib|kompatib/i.test(text)));await warning.first().click()}
  const picker=page.locator('dialog[data-storage-folder-picker=local]');await picker.waitFor({timeout:120000});
  assert.equal(await picker.locator('h2').textContent(),title);assert.equal(await picker.locator('input').getAttribute('aria-label'),fileName);
  assert.equal(await picker.locator('[data-new-folder]').textContent(),newFolder);
  await picker.locator('input').fill('CON.docx');
  const invalid=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/storage/copy'));
  await picker.getByRole('button',{name:save,exact:true}).click();assert.equal((await invalid).status(),400);
  const errorText=lang==='fr'?'Choisissez un nom de fichier valide sans chemin de dossier':'Choose a valid file name without a folder path';
  await picker.locator('[role=status]').filter({hasText:errorText}).waitFor();
  await picker.locator('input').fill('Cafe\u0301-'+lang+'-'+Date.now()+'.docx');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/storage/copy'));
  await picker.getByRole('button',{name:save,exact:true}).click();const copied=await response;assert.equal(copied.status(),200,await copied.text());
  const result=await copied.json();assert(result.name.startsWith('Café-'));assert.equal(result.name,result.name.normalize('NFC'));
  assert.equal(await picker.locator('a').textContent(),open);assert.equal(await picker.getByRole('button',{name:close,exact:true}).count(),1);
  const request=copied.request().postDataJSON();
  const denied=await ctx.request.post(base+'/example/elixir/storage/copy',{headers:{'X-Elixir':'1'},data:{...request,name:'con.docx'}});assert.equal(denied.status(),400);
  assert.deepEqual(await(await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(uploaded.filename))).body(),fixture);
  assert((await(await ctx.request.get(base+'/example/download?fileName='+encodeURIComponent(result.name))).body()).subarray(0,2).equals(Buffer.from('PK')));
  assert.deepEqual(errors,[]);console.log('PASS storage translations',lang,'Backstage/picker, catalog fallback, NFC copy, device denial and original bytes');await ctx.close();
 }
}finally{await browser.close()}
