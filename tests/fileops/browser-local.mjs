// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT;assert(base&&fixtures&&out);
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch();
try{for(const [format,filename,code] of [['docx','offline-review.docx',65],['xlsx','new.xlsx',257],['pptx','new.pptx',129]]){
 const source=path.join(fixtures,filename),before=fs.readFileSync(source),ctx=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true}),page=await ctx.newPage(),bad=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('websocket',w=>bad.push(w.url()));
 page.on('request',r=>{const u=new URL(r.url());if(r.method()!=='GET'||!(['blob:','data:'].includes(u.protocol)||u.origin===new URL(base).origin))bad.push(r.method()+' '+u.pathname)});
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(source);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
 await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();
 const selectedName=await frame.evaluate(()=>Asc.editor.asc_getDocumentName());
 for(const badName of ['CON','nul.'+format,'Bad\u202e.'+format,'界'.repeat(86)]){
  page.once('dialog',d=>d.accept(badName));await frame.locator('[data-local-rename]').click();
  assert.equal(await frame.evaluate(()=>Asc.editor.asc_getDocumentName()),selectedName);
 }
 page.once('dialog',d=>d.accept('Cafe\u0301 Downloaded Copy.'+format));
 await frame.locator('[data-local-rename]').click();
 assert.equal(await frame.evaluate(()=>Asc.editor.asc_getDocumentName()),'Café Downloaded Copy.'+format);
 const downloadEvent=page.waitForEvent('download',{timeout:120000});await frame.locator('#panel-saveas .elx-format[format="'+code+'"]').click();
 const download=await downloadEvent;assert.equal(download.suggestedFilename(),'Café Downloaded Copy.'+format);
 const target=path.join(out,'copy.'+format);await download.saveAs(target);assert(fs.readFileSync(target).subarray(0,2).equals(Buffer.from('PK')));
 assert.deepEqual(fs.readFileSync(source),before);
 assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);
 console.log('PASS browser local',format,'named downloaded copy, real Save As conversion, source preserved, no upload/socket');await ctx.close();
}}finally{await browser.close()}
