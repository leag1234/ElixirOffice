// SPDX-License-Identifier: AGPL-3.0-only
// Actual packaged Options UI on disposable public files; no native dialogs.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop,editable,fixture}=require('./harness.cjs');
(async()=>{
 const out=process.env.EO_OPTIONS_OUT;if(!out)throw Error('EO_OPTIONS_OUT is required');await fs.mkdir(out,{recursive:true});const results=[],preferences=[];
 for(const language of ['en','fr','ar']){
  const env=await launch({file:await fixture(process.env.EO_OPTIONS_FIXTURE||'sample.docx'),profile:'options-layout-'+language+'-'+Date.now(),args:['--lang='+language]});
  try{
   await editable(env);await env.page.evaluate(()=>eoDesktop.authorSave('Public reviewer'));const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
   assert.equal(await env.page.evaluate(()=>document.documentElement.lang),language);
   for(const dark of [false,true])for(const viewport of [{width:1360,height:960},{width:800,height:600},{width:400,height:600}]){
    await env.page.setViewportSize(viewport);await env.page.emulateMedia({colorScheme:dark?'dark':'light'});
    await env.page.waitForFunction(dark=>document.documentElement.getAttribute('data-eo-theme')===(dark?'dark':'light')&&matchMedia('(prefers-color-scheme: dark)').matches===dark,dark,{timeout:5000});
    await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();
    const box=env.page.locator('dialog.desktop-preferences[open]');await box.waitFor({state:'visible',timeout:5000});
    await box.locator('#computer-fonts-enabled').waitFor();await box.locator('.desktop-dialog-actions').waitFor();
    const data=await env.page.evaluate(()=>{
     const box=document.querySelector('dialog[open]'),footer=box.querySelector('.desktop-dialog-actions'),primary=footer.querySelector('.btn-primary'),author=box.querySelector('#author-name'),label=author.parentElement;
     const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
     const text=document.createRange();text.selectNodeContents(label.firstChild);
     const color=css=>{const c=document.createElement('canvas'),x=c.getContext('2d');c.width=c.height=1;x.fillStyle=css;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)};
     const css=getComputedStyle(box),button=getComputedStyle(primary);
     return{rect:rect(box),footer:rect(footer),primary:rect(primary),input:rect(author),labelBottom:text.getBoundingClientRect().bottom,active:document.activeElement.id,sections:box.querySelectorAll('.desktop-setting-section').length,buttons:[...footer.querySelectorAll('button')].map(e=>e.textContent),background:color(css.backgroundColor),foreground:color(button.color),fill:color(button.backgroundColor),body:box.innerText,privacy:EODesktopStrings.privacy,misleading:EODesktopStrings.saveCopy+'.',viewport:{width:innerWidth,height:innerHeight}};
    });
    const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=luminance(data.foreground),b=luminance(data.fill);data.primaryContrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.equal(data.sections,4);assert.equal(await box.locator('#custom-title-bar').count(),1);assert.equal(await box.locator('#custom-title-bar-description').count(),1);assert.equal(data.active,'recovery-enabled');
    assert(data.input.y>=data.labelBottom+4,'The author label and field must not touch');
    assert(data.rect.x>=0&&data.rect.right<=data.viewport.width&&data.rect.y>=0&&data.rect.bottom<=data.viewport.height,'Dialog must fit the viewport');
    assert(data.primaryContrast>=4.5,'Primary button text contrast');
    assert(data.primary.y>=data.rect.y&&data.primary.bottom<=data.rect.bottom,'Save must remain visible inside the scroll-bounded dialog');
    assert(dark?Math.max(...data.background)<100:Math.min(...data.background)>200,'Requested theme must actually apply');
    assert(data.body.includes(data.privacy));assert(!data.body.includes(data.misleading));
    await box.locator('.desktop-dialog-actions button').last().scrollIntoViewIfNeeded();
    await env.page.screenshot({path:path.join(out,'options-'+language+'-'+(dark?'dark':'light')+'-'+viewport.width+'.png')});
    results.push({language,dark,viewport,data});
    await env.page.keyboard.press('Escape');await box.waitFor({state:'detached'});
   }
   // Exercise the actual relocated footer handlers: Save persists; Cancel does not.
   async function options(){await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();const box=env.page.locator('dialog.desktop-preferences[open]');await box.locator('.desktop-dialog-actions').waitFor();return box;}
   const savedName='Public reviewer '+language;let dialog=await options();
   await dialog.locator('#author-name').fill(savedName);await dialog.locator('#recovery-interval').selectOption('120');await dialog.locator('#recovery-enabled').check();
   await dialog.locator('.desktop-dialog-actions .btn-primary').click();await dialog.waitFor({state:'detached'});
   dialog=await options();assert.equal(await dialog.locator('#author-name').inputValue(),savedName);assert.equal(await dialog.locator('#recovery-interval').inputValue(),'120');
   await dialog.locator('#author-name').fill('Cancelled public name');await dialog.locator('#recovery-interval').selectOption('15');await dialog.locator('#recovery-enabled').uncheck();
   await dialog.locator('.desktop-dialog-actions button').last().click();await dialog.waitFor({state:'detached'});
   dialog=await options();assert.equal(await dialog.locator('#author-name').inputValue(),savedName);assert.equal(await dialog.locator('#recovery-interval').inputValue(),'120');assert(await dialog.locator('#recovery-enabled').isChecked());
   await env.page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   preferences.push({language,savePersisted:true,cancelPreservedRecoveryAndAuthor:true});
   assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  }finally{await stop(env)}
 }
 await fs.writeFile(path.join(out,'options-layout.json'),JSON.stringify({states:results.length,results,preferences},null,2)+'\n');console.log('PASS18actual Options states: locale/theme/RTL, grouped controls, label gap, focus, viewport, contrast, privacy, Escape and zero network/errors');
})().catch(e=>{console.error(e);process.exitCode=1});
