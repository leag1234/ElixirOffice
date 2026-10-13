// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&file&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}}),page=await context.newPage(),bad=[];
page.on('websocket',w=>bad.push(w.url()));page.on('request',r=>{if(r.method()!=='GET'||/\/(upload|doc\/|ConvertService|coauthoring)/i.test(r.url()))bad.push(r.url());});
try{
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 let frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));
 await frame.locator('#toolbar a[data-tab=review]').click();
 await frame.locator('#slot-btn-protect-range button').click();
 await frame.locator('#protect-edit-ranges-btn-new').click();
 await frame.locator('#id-protected-range-name-txt input').fill('LocalProtectedRange');
 await frame.locator('#id-protected-range-txt input').fill('A1:B2');
 await frame.locator('.asc-window:visible .dlg-btn[result=ok]').last().click();
 await frame.waitForFunction(()=>Asc.editor.asc_getUserProtectedRanges().some(r=>r.asc_getName()==='LocalProtectedRange'));
 const read=()=>frame.evaluate(()=>Asc.editor.asc_getUserProtectedRanges().map(r=>({name:r.asc_getName(),ref:r.asc_getRef(),type:r.asc_getType(),users:r.asc_getUsers()?.map(u=>({id:u.asc_getId(),type:u.asc_getType()}))})));
 const created=await read();assert.equal(created.length,1);assert(created[0].ref.includes('$A$1:$B$2'));assert(created[0].users.some(u=>u.id==='local'));
 await page.screenshot({path:path.join(out,'range-created.png')});
 await frame.locator('.asc-window:visible .dlg-btn[result=close]').last().click();
 const downloadPending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();
 const dest=path.join(out,'protected.xlsx');await (await downloadPending).saveAs(dest);
 await page.locator('#file').setInputFiles(dest);await page.waitForFunction(()=>EOLocalSession?.format==='xlsx'&&!document.querySelector('#save').disabled,null,{timeout:120000});
 frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));
 await frame.waitForFunction(()=>Asc.editor?.isDocumentLoadComplete,null,{timeout:120000});const reopened=await read();assert.deepEqual(reopened,created,'Protection metadata changed on local save/reopen');
 assert.deepEqual(bad,[]);fs.writeFileSync(path.join(out,'protect-report.json'),JSON.stringify({created,reopened,privacy:'zero document requests'},null,2));console.log('PASS actual Protect Range dialog, local user permissions, XLSX save/reopen, zero document requests');
}finally{await context.close();await browser.close();}
