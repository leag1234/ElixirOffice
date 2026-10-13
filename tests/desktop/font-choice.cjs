// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,stop,editable,root}=require('./harness.cjs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const executable=process.env.EO_PACKAGE_EXECUTABLE;assert(executable);
 const profile='font-choice-'+Date.now(),file=path.join(root,'fixtures/font-consent.docx');
 const first=await launch({executable,file,profile});
 try{
  await editable(first);const frame=first.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
  await frame.locator('.elx-lf-btn:not(.primary)').click({timeout:20000});
  await first.page.waitForFunction(async()=>await eoDesktop.fontChoice()==='declined',null,{timeout:20000});
  assert.equal(await frame.locator('.elx-lf-bar').count(),0);
  assert.deepEqual(await first.page.evaluate(()=>eoDesktop.fonts()),[]);
 }finally{await stop(first)}
 const second=await launch({executable,file,profile});
 try{
  await editable(second);await second.page.waitForTimeout(1500);
  const frame=second.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
  assert.equal(await second.page.evaluate(()=>eoDesktop.fontChoice()),'declined');
  assert.equal(await frame.locator('.elx-lf-bar').count(),0,'Dismissed invitation returned after restart');
  assert.equal(await frame.locator('.asc-synchronizetip:visible').count(),0,'Desktop tip returned');
  assert.deepEqual(await second.page.evaluate(()=>eoDesktop.fonts()),[]);
  assert.equal(await frame.evaluate(()=>Common.UI.FeaturesManager.isFeatureEnabled('featuresTips',true)),false);
  await frame.evaluate(()=>Common.UI.TooltipManager.showTip({step:'desktop-review-warning',target:'#toolbar',text:'Public test warning',isNewFeature:false,noHighlight:true}));
  await frame.locator('.asc-synchronizetip:visible').waitFor({timeout:20000});
  assert((await frame.locator('.asc-synchronizetip:visible').innerText()).includes('Public test warning'),'Functional warnings suppressed');
  await frame.evaluate(()=>Common.UI.TooltipManager.closeTip('desktop-review-warning'));
  console.log('PASS functional warning preserved while feature announcements disabled');
  console.log('PASS real desktop font invitation dismissal persists after fresh app restart; no enumeration/tips');
 }finally{await stop(second)}
})().catch(error=>{console.error(error);process.exitCode=1});
