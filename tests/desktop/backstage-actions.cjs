// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core');
(async()=>{
 const root=process.env.EO_DESKTOP_ROOT,assets=process.env.EO_PACKAGE_ASSETS,executable=process.env.EO_PACKAGE_EXECUTABLE;assert(root&&assets&&executable);
 for(const format of ['docx','xlsx','pptx']){
  const temp=await fs.mkdtemp(path.join(root,'tmp','actions-')),file=path.join(temp,'public-blank.'+format);await fs.copyFile(path.join(assets,'templates','new.'+format),file);
  const profile=path.join(root,'profiles','actions-'+format+'-'+Date.now());
  const app=await _electron.launch({executablePath:executable,args:[file],env:{...process.env,DISPLAY:':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:profile},timeout:120000}),processHandle=app.process();
  try{
   const page=await app.firstWindow();await page.waitForFunction(()=>window.EODesktopReady&&window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
   const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));assert(frame);
   await new Promise(resolve=>setTimeout(resolve,1500));
   for(let i=0;i<12;i++){const tips=frame.locator('.asc-synchronizetip .close,.asc-synchronizetip .btn-div,.asc-synchronizetip .show-link');let closed=false;for(const tip of await tips.all())if(await tip.isVisible()){await tip.click({timeout:20000});closed=true;}await new Promise(resolve=>setTimeout(resolve,300));if(!closed&&i>2)break;}
   await frame.locator('#file[role=tab]').click({timeout:20000});
   const details=await page.evaluate(()=>{
    const win=EOLocalSession.win,app=win.DE||win.SSE||win.PE,chrome=app.getController('ElixirChrome');
    return {noOuterToolbar:document.querySelector('body>header')===null,hasCapture:!!window.EODesktopCapture};
   });
   assert.equal(details.noOuterToolbar,true);assert.equal(details.hasCapture,false,'Capture must be unavailable without flag');
   await frame.locator('#fm-btn-save').waitFor({state:'visible',timeout:20000});
   assert(await frame.locator('#fm-btn-info').isVisible(),'Info hidden');
   assert(await frame.locator('#fm-btn-download').isVisible(),'Native Save As hidden');
   assert(await frame.locator('#fm-btn-elx-open').isVisible(),'Native Open hidden');
   assert(await frame.locator('#fm-btn-create').isVisible(),'Native New hidden');
   const print=frame.locator('#fm-btn-print:visible,#fm-btn-print-with-preview:visible');assert.equal(await print.count(),1,'Exactly one native Print entry required');
   assert(await frame.locator('#fm-btn-elx-export').isVisible(),'Native PDF export hidden');
   await frame.locator('#fm-btn-save').click();await page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
   const state=await page.evaluate(()=>({saved:EOLastSave.name,dirty:EOLocalSession.controller.isModified(),node:typeof require}));
   assert.equal(state.saved,path.basename(file));assert.equal(state.dirty,false);assert.equal(state.node,'undefined');
   console.log('PASS packaged native File actions/save/no toolbar/capture opt-in',process.platform,format);
  }finally{if(processHandle.exitCode===null)processHandle.kill('SIGTERM');await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);}
 }
})().catch(error=>{console.error(error);process.exitCode=1});

