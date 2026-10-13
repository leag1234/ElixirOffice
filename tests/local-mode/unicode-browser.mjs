// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&out);fs.mkdirSync(out,{recursive:true});
const text='Unicode café Ελληνικά العربية 中文 👋',browser=await chromium.launch(),report=[];
try{for(const format of ['txt','csv']){
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),bad=[];
 page.on('request',r=>{if(r.method()!=='GET'||/\/(upload|doc\/|ConvertService|coauthoring)/i.test(r.url()))bad.push(r.url());});page.on('websocket',w=>bad.push(w.url()));
 const source=path.join(out,'unicode.'+format);fs.writeFileSync(source,format==='csv'?'"'+text+'"\n':text+'\n');
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(source);await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor)\/main\//.test(f.url()));
 const actual=await frame.evaluate(format=>format==='txt'?Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.Content.flatMap(r=>(r.Content||[]).map(c=>c.IsText&&c.IsText()?String.fromCodePoint(c.Value):c.IsSpace&&c.IsSpace()?' ':'')).join('')).join('\n'):Asc.editor.wbModel.getWorksheet(0).getCell3(0,0).getValue(),format);
 assert(actual.includes(text),'Unicode import changed text: '+actual);
 const downloadPending=page.waitForEvent('download',{timeout:120000});await frame.evaluate(format=>Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(format==='txt'?69:260)),format);
 const dest=path.join(out,'roundtrip.'+format);await (await downloadPending).saveAs(dest);
 const decoded=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(dest));assert(decoded.includes(text),'Unicode export changed text');assert(!decoded.includes('\0'));assert.deepEqual(bad,[]);
 if(format==='txt'){
 const rtfPending=page.waitForEvent('download',{timeout:120000});await frame.evaluate(()=>Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(68)));
 const rtf=path.join(out,'roundtrip.rtf');await (await rtfPending).saveAs(rtf);
 await page.locator('#file').setInputFiles(rtf);await page.waitForFunction(()=>EOLocalFailure||(EOLocalSession&&EOLocalSession.sourceFormat==='rtf'),null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const fresh=page.frames().find(f=>f.url().includes('/documenteditor/main/'));
 const txtPending=page.waitForEvent('download',{timeout:120000});await fresh.evaluate(()=>Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(69)));
 const reexport=path.join(out,'rtf-roundtrip.txt');await (await txtPending).saveAs(reexport);
 assert(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(reexport)).includes(text),'RTF Unicode roundtrip changed text');assert.deepEqual(bad,[]);
 report.push({format:'rtf',text,bytes:fs.statSync(rtf).size,reopened:true,privacy:true});console.log('PASS rtf full Unicode export/open/re-export');
 }
 report.push({format,text,bytes:fs.statSync(dest).size,utf8:true,privacy:true});console.log('PASS',format,'Latin/Greek/Arabic/CJK/supplementary Unicode import/export');await context.close();
}fs.writeFileSync(path.join(out,'unicode-report.json'),JSON.stringify(report,null,2));}finally{await browser.close();}
