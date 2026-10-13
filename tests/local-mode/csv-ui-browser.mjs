// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&file&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
try{
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));
 await frame.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("Api.GetActiveSheet().GetRange('A1').SetValue('café');Api.GetActiveSheet().GetRange('B1').SetValue('second');",true,resolve)));
 await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();
 await frame.locator('.btn-doc-format[format="260"]').click();
 // The existing single-sheet warning precedes the real CSV settings dialog.
 if(await frame.locator('.asc-window:visible .dlg-btn[result=ok]').count())await frame.locator('.asc-window:visible .dlg-btn[result=ok]').last().click();
 await frame.locator('#id-delimiters-combo').waitFor();
 await frame.locator('#id-delimiters-combo button.dropdown-toggle').click();
 await frame.locator('#id-delimiters-combo li[data-value="2"] a').click();
 const settings=await frame.evaluate(()=>{const dlg=SSE.getController('Main')._state.openDlg;return {encoding:dlg.cmbEncoding.getValue(),delimiter:dlg.cmbDelimiter.getValue()}});
 assert.equal(settings.encoding,46);assert.equal(settings.delimiter,2);
 const pending=page.waitForEvent('download',{timeout:120000});await frame.locator('.asc-window:visible .dlg-btn[result=ok]').last().click();
 const output=path.join(out,'semicolon.csv');await (await pending).saveAs(output);
 assert(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(output)).includes('café;second'));
 await frame.waitForFunction(()=>!Asc.editor.isLongAction(),null,{timeout:120000});
 await frame.locator('#toolbar a[data-tab=home]').click();assert(await page.evaluate(()=>EOLocalSession.controller.isModified()));
 fs.writeFileSync(path.join(out,'csv-ui-report.json'),JSON.stringify({settings,semicolon:true,maskEnded:true,dirty:true},null,2));console.log('PASS actual File CSV warning/settings, UTF8/semicolon, ended conversion mask and retained dirty state');
}finally{await context.close();await browser.close();}
