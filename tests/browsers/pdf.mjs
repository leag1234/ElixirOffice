// Cross-engine PDF acceptance using server fonts. The unchanged full suite
// separately reports browsers which do not implement Local Font Access.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base=process.env.EO_BASE;
assert.ok(base&&!/:8080(?:\/|$)/.test(base));
const fixture=path.join(root,'corpus/provisional/admin/a03-note-de-service.docx'),out=fs.mkdtempSync(path.join(os.tmpdir(),'eo-browser-pdf-'));
let checks=0;const check=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS',name);};
const browser=await chromium.launch();
async function editor(context){
 const page=await context.newPage(),up=await context.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:path.basename(fixture),mimeType:'application/octet-stream',buffer:fs.readFileSync(fixture)}}});
 const uploaded=await up.json();assert.ok(uploaded.filename);
 await page.goto(base+'/example/editor?fileName='+encodeURIComponent(uploaded.filename)+'&lang=en');
 const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();
 await frame.waitForFunction(()=>{try{const a=DE.getController('Main').api,w=a.WordControl,d=w.m_oDrawingDocument,l=w.m_oLogicDocument;return a.isDocumentLoadComplete&&d.m_lPagesCount>0&&d.m_lCountCalculatePages>=d.m_lPagesCount&&!(l.FullRecalc&&l.FullRecalc.Id);}catch{return false;}},null,{timeout:90000});
 return {page,frame};
}
async function download(page,frame,name){
 const wait=page.waitForEvent('download',{timeout:120000});await frame.evaluate(()=>editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF)));
 const file=path.join(out,name);await(await wait).saveAs(file);return file;
}
try{
 const context=await browser.newContext({acceptDownloads:true}),{page,frame}=await editor(context),requests=[],responses=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length||0}));
 page.on('response',r=>responses.push({url:r.url(),headers:r.headers()}));page.on('pageerror',e=>errors.push(e.message));
 check('PDF libraries lazy',await frame.evaluate(()=>!window.EOPdf&&!window.fontkit&&!window.EOWasmPdf).catch(()=>false));
 const pdf=await download(page,frame,'native.pdf'),stats=await frame.evaluate(()=>AscCommon.ClientPdf.last);
 check('native wasm worker is default with no fallback',stats?.backend==='wasm'&&stats.worker&&!stats.error&&!stats.fallbacks);
 check('module and worker requested lazily',requests.some(r=>/wasm-worker\.js/.test(r.url))&&requests.some(r=>/x2t\.wasm/.test(r.url)));
 console.log('WASM headers',JSON.stringify(responses.filter(r=>/x2t\.wasm/.test(r.url))));
 check('negotiated compressed wasm has application/wasm MIME',responses.some(r=>/x2t\.wasm/.test(r.url)&&['br','gzip'].includes(r.headers['content-encoding'])&&r.headers['content-type']==='application/wasm'));
 check('no upload during native export',requests.every(r=>r.method==='GET'&&r.bytes===0));
 check('no export leaves origin',requests.every(r=>new URL(r.url).origin===new URL(base).origin));
 check('native PDF contains images and links',stats.images>=1&&stats.links>=1);
 check('searchable corpus text',/NOTE DE SERVICE/i.test(execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'})));
 const fonts=execFileSync('pdffonts',[pdf],{encoding:'utf8'}).trim().split('\n').slice(2);check('all fonts embedded with Unicode maps',fonts.length>0&&fonts.every(l=>{const fields=l.trim().split(/\s+/);return fields.at(-5)==='yes'&&fields.at(-3)==='yes';}));
 check('hyperlink annotation',/https?:|URI/.test(execFileSync('pdfinfo',['-url',pdf],{encoding:'utf8'})));
 execFileSync('pdftoppm',['-scale-to','512','-png',pdf,path.join(out,'render')]);
 check('each PDF page renders',fs.readdirSync(out).filter(f=>/^render-.*\.png$/.test(f)).length===stats.pages);
 await frame.evaluate(()=>{window.__print=null;editor.asc_registerCallback('asc_onPrintUrl',u=>window.__print=u);editor.asc_Print(new Asc.asc_CDownloadOptions(null,true));});
 await frame.waitForFunction(()=>!!window.__print,null,{timeout:90000});
 check('print is a browser PDF blob',await frame.evaluate(async()=>window.__print.startsWith('blob:')&&(await(await fetch(window.__print)).text()).startsWith('%PDF-')));
 await frame.evaluate(()=>{window.__Worker=Worker;window.Worker=function(){throw new Error('worker blocked by browser test');};});
 requests.length=0;const fallback=await download(page,frame,'js.pdf'),js=await frame.evaluate(()=>AscCommon.ClientPdf.last);
 check('worker failure falls back locally to JS',js.backend==='js'&&js.fallbacks[0].reason==='wasm-worker');
 check('JS fallback remains local',requests.every(r=>r.method==='GET'&&!r.bytes)&&fs.readFileSync(fallback).subarray(0,5).toString()==='%PDF-');
 await frame.evaluate(()=>{window.Worker=window.__Worker;window.__fetch=fetch;window.fetch=function(u){if(/\/media\//.test(String(u)))return Promise.reject(new TypeError('blocked by test'));return window.__fetch.apply(this,arguments);};});
 const server=await download(page,frame,'server-fallback.pdf'),last=await frame.evaluate(()=>AscCommon.ClientPdf.last);
 check('unreadable image falls back to server with explicit reason',last.error&&last.code==='image'&&fs.statSync(server).size>1000&&await frame.evaluate(()=>/server/i.test(document.querySelector('.elx-cp-bar')?.innerText||'')));
 await frame.evaluate(()=>{window.fetch=window.__fetch;AscCommon.ClientPdf.setEnabled(false);});requests.length=0;
 const disabled=await download(page,frame,'disabled.pdf');check('server option makes a server PDF',(execFileSync('pdfinfo',[disabled],{encoding:'utf8'}).match(/^Producer:\s*(.*)$/m)||[])[1]!=='ElixirOffice');
 check('no page errors',errors.length===0);await context.close();
 const absent=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});await absent.route('**/runtime/current.json',r=>r.fulfill({status:404,body:''}));
 const missing=await editor(absent),probes=[];missing.page.on('request',r=>probes.push(r.url()));
 for(let i=0;i<2;i++){await download(missing.page,missing.frame,'absent-'+i+'.pdf');const result=await missing.frame.evaluate(()=>AscCommon.ClientPdf.last);console.log('MISSING runtime stats',JSON.stringify(result));console.log('PRESENCE requests',JSON.stringify(probes.filter(u=>/runtime\/current/.test(u))));check('missing runtime direct JS '+i,result.backend==='js'&&!result.error&&!result.fallbacks);}
 check('one presence probe and no failed worker',probes.filter(u=>/runtime\/current.json/.test(u)).length===1&&!probes.some(u=>/wasm-worker|x2t\.(wasm|js)/.test(u)));
 await absent.close();console.log('PASS',checks,'cross-engine server-font PDF checks');
}finally{await browser.close();}
