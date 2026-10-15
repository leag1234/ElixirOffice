// Validation-only server rendering of public local/server round-trip outputs.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,input=process.env.EO_LOCAL_INPUT,out=process.env.EO_LOCAL_OUT;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&input&&out,'own EO_BASE/input/out required');
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{
 for(const file of fs.readdirSync(input).filter(f=>/\.(docx|odt|xlsx|ods|pptx|odp)$/.test(f))){
  const ctx=await browser.newContext({acceptDownloads:true}),page=await ctx.newPage();
  const up=await ctx.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:file,mimeType:'application/octet-stream',buffer:fs.readFileSync(path.join(input,file))}}});
  const j=await up.json();assert.ok(j.filename);
  await page.goto(base+'/example/editor?fileName='+encodeURIComponent(j.filename)+'&lang=en');
  const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();
  await frame.waitForFunction(()=>{try{const api=(window.DE||window.SSE||window.PE).getController('Main').api;return api.isDocumentLoadComplete&&!api.isLongAction();}catch(e){return false;}},null,{timeout:90000});
  await frame.evaluate(()=>{if(AscCommon.ClientPdf)AscCommon.ClientPdf.setEnabled(false);});
  const result=page.waitForEvent('download',{timeout:120000});
  await frame.evaluate(()=>(window.DE||window.SSE||window.PE).getController('Main').api.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF)));
  const download=await result,dest=path.join(out,(process.env.EO_LOCAL_ALL==='1'?file.replace(/\./g,'-'):path.extname(file).slice(1))+'.pdf');await download.saveAs(dest);
  assert.equal(fs.readFileSync(dest).subarray(0,5).toString(),'%PDF-');console.log('PASS server reference render',file,fs.statSync(dest).size);await ctx.close();
 }
}finally{await browser.close();}
