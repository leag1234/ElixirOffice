// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,stop,editable,root}=require('./harness.cjs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env=await launch({executable:process.env.EO_PACKAGE_EXECUTABLE,file:path.join(root,'fixtures/font-consent.docx'),profile:'info-review-'+Date.now()});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
  await frame.locator('#file[role=tab]').click({timeout:20000});
  await frame.locator('#fm-btn-info').click({timeout:20000});
  await frame.locator('.elx-info-props:visible').waitFor({timeout:20000});
  assert(await frame.locator('.elx-info-actions [data-action=protect]').isVisible());
  await frame.locator('.elx-info-actions [data-action=inspect]').click();
  await frame.locator('.elx-inspect-dlg:visible').waitFor({timeout:20000});
  assert(await frame.locator('.elx-inspect-row').count()>=2);
  await frame.locator('.elx-inspect-dlg [result=ok]').click();
  assert.deepEqual(env.errors,[]);
  console.log('PASS real File Info properties/protection entry and inspection dialog; no document mutation');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
