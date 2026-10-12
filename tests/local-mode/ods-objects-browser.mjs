/* SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import chartSnapshot from './ods-chart-snapshot.cjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,out=process.env.EO_LOCAL_OUT;
assert(base && !/:8080(?:\/|$)/.test(base) && file && out,'Own base, public ODS fixture and output required');
assert(!fs.realpathSync(file).split(path.sep).includes('corpus-private'),'Public fixture only');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
 'e2ff465c4559f42e979859c68351b5972f328abfac3a09e0df0adb4dc228ec18','Unexpected public fixture');
fs.mkdirSync(out,{recursive:true});
const checker=new URL('./ods-objects.py',import.meta.url).pathname;
const expected=JSON.parse(execFileSync('python3',[checker,'--expected',file],{encoding:'utf8'}));
const marker='EOODSOBJECTS',report=[],browser=await chromium.launch({headless:true});
try {
 let context,page;const bad=[],missing=[],errors=[],failed=[];
 const newPage=async()=>{
 context=await browser.newContext({acceptDownloads:true});page=await context.newPage();
 page.on('request',request=>{
  const url=new URL(request.url());
  if(/^(blob:|data:)$/.test(url.protocol))return;
  if(request.method()!=='GET'||url.origin!==new URL(base).origin||
    !(/^\/example\/local-assets\/(?:\d+\.\d+\.\d+-[a-f0-9]+\/)?(sdkjs|web-apps|fonts|dictionaries)\//.test(url.pathname)||
      ['/example/local.html','/example/elixir-local/local.js'].includes(url.pathname)))bad.push(request.url());
 });
 page.on('websocket',socket=>bad.push(socket.url()));
 page.on('response',response=>{if(response.status()>=400)missing.push({url:response.url(),status:response.status()})});
 page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));
 page.on('pageerror',error=>errors.push(error.message));
 };
 await newPage();
 const snapshot=async()=>{
  const frame=page.frames().find(frame=>/spreadsheeteditor\/main/.test(frame.url()));
  assert(frame,'Spreadsheet editor frame absent');
  return frame.evaluate(chartSnapshot);
 };
 const open=async source=>{
  await page.goto(base+'/example/local.html');
  await page.locator('#file').setInputFiles(source);
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
  const drawings=await snapshot();
  assert.equal(drawings.length,2,JSON.stringify({drawings,missing}));
  assert(drawings.every(drawing=>drawing.chart&&!drawing.image),JSON.stringify(drawings));
  assert.deepEqual(drawings.map(d=>d.title).sort(),['Gold&Silver Medals Count','Total Medal Count']);
  for(const drawing of drawings){
   assert.deepEqual(drawing.values,expected[drawing.title].numbers,'Numeric chart caches changed: '+drawing.title);
   assert.deepEqual(drawing.orderedValues,expected[drawing.title].orderedValues,'Series data order changed');
   assert.equal(drawing.series.reduce((a,b)=>a+b,0),expected[drawing.title].series);
   assert.deepEqual(drawing.types,[expected[drawing.title].kind==='chart:area'?'CAreaChart':'CLineChart']);
  }
  report.push({source,drawings});
 };
 await open(file);
 await page.frames().find(frame=>/spreadsheeteditor\/main/.test(frame.url())).evaluate(()=>SSE.getController('Main').api.asc_setZoom(0.4));
 await page.waitForTimeout(500);
 await page.screenshot({path:path.join(out,'opened.png')});
 const before=report[0].drawings;
 await page.frames().find(frame=>/spreadsheeteditor\/main/.test(frame.url())).evaluate(marker=>{
  const api=SSE.getController('Main').api;api.asc_enterText(Array.from(marker,c=>c.codePointAt(0)));api.asc_closeCellEditor();
 },marker);
 const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();
 const saved=path.join(out,'edited.ods');await (await download).saveAs(saved);
 execFileSync('python3',[new URL('./ods-objects.py',import.meta.url).pathname,file,saved],{stdio:'inherit'});
 execFileSync('python3',['-c',"import sys,zipfile; assert sys.argv[2].encode() in zipfile.ZipFile(sys.argv[1]).read('content.xml'), 'Saved edit missing'",saved,marker]);
 // Fresh browser context avoids retaining the first editor's model/cache.
 assert.deepEqual(bad,[]);assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 page.removeAllListeners('requestfailed');await context.close();await newPage();
 await open(saved);assert.deepEqual(report[1].drawings,before,'Chart types/series changed on reopen');
 await page.frames().find(frame=>/spreadsheeteditor\/main/.test(frame.url())).evaluate(()=>SSE.getController('Main').api.asc_setZoom(0.4));
 await page.waitForTimeout(500);
 await page.screenshot({path:path.join(out,'reopened.png')});
 assert.deepEqual(bad,[]);assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 fs.writeFileSync(path.join(out,'ods-objects.json'),JSON.stringify({report,bad,missing,errors,failed},null,2));
 console.log('PASS web ODS open/edit/save/reopen: two real charts, no phantom image, no missing resources or document upload');
 await context.close();
}finally{await browser.close()}
