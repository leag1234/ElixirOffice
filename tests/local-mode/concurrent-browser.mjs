// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,image=process.env.EO_LOCAL_IMAGE;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file&&image);
const browser=await chromium.launch();
try{
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>/documenteditor\/main/.test(f.url()));
 await frame.evaluate(()=>{const d=DE.getController('Main').api.WordControl.m_oLogicDocument;d.MoveCursorToStartPos();DE.getController('Main').api.asc_enterText(Array.from('BEFORESAVE',c=>c.codePointAt(0)));});
 let release,requested;const gate=new Promise(r=>release=r),seen=new Promise(r=>requested=r);
 await context.route('**/x2t.wasm',async route=>{requested();await gate;await route.continue();});
 const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();await seen;
 await frame.evaluate(()=>DE.getController('Main').api.asc_enterText(Array.from('AFTERSAVE',c=>c.codePointAt(0))));
 release();await download;await context.unroute('**/x2t.wasm');
 await page.waitForFunction(()=>!document.getElementById('file').disabled);
 let rejected=false;page.once('dialog',async d=>{assert.match(d.message(),/unsaved changes/);rejected=true;await d.dismiss();});
 await page.evaluate(async({name,bytes})=>EOLocalOpen(new File([new Uint8Array(bytes)],name)),{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
 assert.equal(rejected,true);console.log('PASS edits during conversion remain unsaved after completed download');
 console.log('STAGE clean save');const cleanDownload=page.waitForEvent('download');await page.locator('#save').click();await cleanDownload;
 await page.waitForFunction(()=>!document.getElementById('file').disabled);
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),false);console.log('STAGE clean');
 await page.evaluate(()=>{window.__oldFrame=document.querySelector('iframe').contentWindow;});
 // Delay a real File read in the editor frame; even an unfinished image warns.
 await frame.evaluate(()=>{const original=File.prototype.arrayBuffer;window.__releaseImage=null;File.prototype.arrayBuffer=function(){const file=this;return original.call(file).then(bytes=>new Promise(resolve=>{window.parent.__releaseHeldImage=()=>resolve(bytes);}));};});
 console.log('STAGE pending picker');const picker=page.waitForEvent('filechooser');await frame.evaluate(()=>DE.getController('Main').api.asc_addImage());await (await picker).setFiles(image);
 await page.waitForFunction(()=>typeof window.__releaseHeldImage==='function');
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.hasPendingImages()),true);
 console.log('STAGE pending ready');let prompted=false;page.once('dialog',async d=>{assert.match(d.message(),/unsaved changes/);prompted=true;await d.accept();});
 await page.evaluate(async({name,bytes})=>{window.__old=EOLocalSession;await EOLocalOpen(new File([new Uint8Array(bytes)],name));},{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
 assert.equal(prompted,true);assert.equal(await page.evaluate(()=>EOLocalSession!==window.__old),true);
 await page.evaluate(()=>{window.__releaseHeldImage();});await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.hasPendingImages()),false);
 console.log('PASS pending image requires explicit discard before replacement');
 await context.close();
}finally{await browser.close();}
