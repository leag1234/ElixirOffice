// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE;assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({acceptDownloads:true}),bad=[];let downloads=0;
 page.on('download',()=>downloads++);page.on('request',r=>{const u=new URL(r.url());if(['blob:','data:'].includes(u.protocol))return;if(r.method()!=='GET'||u.origin!==new URL(base).origin||!(/^\/example\/local-assets\//.test(u.pathname)||['/example/local.html','/example/elixir-local/local.js'].includes(u.pathname)))bad.push(r.url());});
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>/documenteditor\/main/.test(f.url()));
 await frame.evaluate(()=>{
  window.originalConvert=EOWasmConvert.convert;
  EOWasmConvert.convert=function(input,from,to,options){
   const progress=options.onProgress;
   options.onProgress=p=>{if(progress)progress(p);parent.document.getElementById('cancel').click();};
   return originalConvert(input,from,to,options);
  };
 });
 await page.locator('#save').click();await page.waitForFunction(()=>/Conversion cancelled/.test(document.getElementById('message').textContent));
 await page.waitForFunction(()=>!document.getElementById('save').disabled);assert.equal(downloads,0);
 await frame.evaluate(()=>{EOWasmConvert.convert=originalConvert;});
 const download=page.waitForEvent('download',{timeout:90000});
 await frame.evaluate(()=>DE.getController('Main').api.asc_Save(false));
 const result=await download;assert.equal(path.extname(result.suggestedFilename()),'.docx');assert.equal(downloads,1);assert.deepEqual(bad,[]);
 console.log('PASS cancelled UI save creates no download; editor Save recovers with fresh signal and local download; static-only traffic');
}finally{await browser.close();}
