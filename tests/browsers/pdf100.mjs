import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,out=process.env.EO_LOCAL_OUT;assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file&&out);
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch();
try{
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),opened=Date.now();
 const upload=await context.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:path.basename(file),mimeType:'application/octet-stream',buffer:fs.readFileSync(file)}}});
 const entry=await upload.json();assert.ok(entry.filename);
 await page.goto(base+'/example/editor?fileName='+encodeURIComponent(entry.filename)+'&lang=en');
 const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();
 await frame.waitForFunction(()=>{try{const a=DE.getController('Main').api,d=a.WordControl.m_oDrawingDocument,l=a.WordControl.m_oLogicDocument;return a.isDocumentLoadComplete&&l.Pages.length===100&&d.m_lPagesCount===100&&d.m_lCountCalculatePages>=100&&!(l.FullRecalc&&l.FullRecalc.Id);}catch{return false;}},null,{timeout:120000});
 const openMs=Date.now()-opened,requests=[];page.on('request',r=>requests.push({method:r.method(),bytes:r.postDataBuffer()?.length||0,url:r.url()}));
 const started=Date.now(),download=page.waitForEvent('download',{timeout:180000});await frame.evaluate(()=>editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF)));
 const saved=path.join(out,'100-pages.pdf');await(await download).saveAs(saved);
 const stats=await frame.evaluate(()=>AscCommon.ClientPdf.last);
 assert.equal(stats.backend,'wasm');assert.ok(stats.worker&&!stats.error&&!stats.fallbacks);assert.equal(stats.pages,100);
 assert.ok(requests.every(r=>r.method==='GET'&&!r.bytes&&new URL(r.url).origin===new URL(base).origin));
 const pages=Number(execFileSync('pdfinfo',[saved],{encoding:'utf8'}).match(/^Pages:\s+(\d+)/m)[1]);assert.equal(pages,100);
 const result={engine:process.env.EO_ENGINE,browserVersion:browser.version(),pages,openMs,exportMs:Date.now()-started,stats,bytes:fs.statSync(saved).size,noUpload:true};
 fs.writeFileSync(path.join(out,'pdf-report.json'),JSON.stringify(result,null,2));console.log('PASS PDF100',JSON.stringify(result));
}finally{await browser.close();}
