// SPDX-License-Identifier: AGPL-3.0-only
// Real package keyboard/validation checks on disposable public file copies.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launch,stop,editable,fixture}=require('./harness.cjs');
(async()=>{
 const out=process.env.EO_RENAME_OUT;if(!out)throw Error('EO_RENAME_OUT is required');await fs.mkdir(out,{recursive:true});const states=[],safety=[];
 for(const language of ['en','fr','ar']){
  const selected=await fixture(process.env.EO_RENAME_FIXTURE||'sample.docx'),original=await fs.readFile(selected),dir=path.dirname(selected);
  const env=await launch({file:selected,profile:'rename-dialog-'+language+'-'+Date.now(),args:['--lang='+language]});
  try{
   await editable(env);assert.equal(await env.page.evaluate(()=>document.documentElement.lang),language);
   const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
   async function open(){const menu=frame.locator('#fm-btn-rename');if(!await menu.isVisible())await frame.locator('#file[role=tab]').click();await menu.click();const box=env.page.locator('dialog.desktop-rename[open]');await box.waitFor();return box;}
   for(const dark of [false,true])for(const viewport of [{width:1360,height:960},{width:800,height:600},{width:400,height:600}]){
    await env.page.setViewportSize(viewport);await env.page.emulateMedia({colorScheme:dark?'dark':'light'});
    await env.page.waitForFunction(dark=>document.documentElement.getAttribute('data-eo-theme')===(dark?'dark':'light')&&matchMedia('(prefers-color-scheme: dark)').matches===dark,dark,{timeout:5000});const box=await open();
    const data=await box.evaluate(box=>{
     const input=box.querySelector('input'),primary=box.querySelector('[type=submit]'),label=box.querySelector('label'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}},css=getComputedStyle(primary);
     const color=s=>{const c=document.createElement('canvas'),x=c.getContext('2d');c.width=c.height=1;x.fillStyle=s;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)};
     return{rect:rect(box),input:rect(input),label:rect(label),primary:rect(primary),active:document.activeElement.id,selected:input.selectionStart===0&&input.selectionEnd===input.value.length,labelFor:label.htmlFor,dir:document.documentElement.dir,foreground:color(css.color),fill:color(css.backgroundColor),background:color(getComputedStyle(box).backgroundColor),viewport:{width:innerWidth,height:innerHeight}};
    });
    const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=luminance(data.foreground),b=luminance(data.fill);data.primaryContrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.equal(data.active,'desktop-rename-name');assert(data.selected);assert.equal(data.labelFor,data.active);assert.equal(data.dir,language==='ar'?'rtl':'ltr');
    assert(data.input.y>=data.label.bottom+4);assert(data.rect.x>=0&&data.rect.right<=viewport.width&&data.rect.y>=0&&data.rect.bottom<=viewport.height);
    assert(data.primary.bottom<=data.rect.bottom);assert(data.primaryContrast>=4.5);assert(dark?Math.max(...data.background)<100:Math.min(...data.background)>200);
    await env.page.screenshot({path:path.join(out,'rename-'+language+'-'+(dark?'dark':'light')+'-'+viewport.width+'.png')});states.push({language,dark,viewport,data});
    await env.page.keyboard.press('Escape');await box.waitFor({state:'detached'});assert.deepEqual(await fs.readFile(selected),original);
   }
   await env.page.setViewportSize({width:1360,height:960});let box=await open();
   await box.locator('input').fill('Cancelled');await box.locator('.desktop-dialog-actions button').last().click();await box.waitFor({state:'detached'});assert.deepEqual(await fs.readFile(selected),original);
   const collision=path.join(dir,'Collision.docx');await fs.writeFile(collision,original);
   box=await open();
   for(const bad of ['','../Invalid','Collision']){
    await box.locator('input').fill(bad);await env.page.evaluate(()=>window.EOLocalFailure=null);await box.locator('input').press('Enter');
    await env.page.waitForFunction(()=>window.EOLocalFailure);assert(await box.isVisible());assert((await box.locator('[role=status]').innerText()).length>0);assert(!await box.locator('[type=submit]').isDisabled());
    assert.deepEqual(await fs.readFile(selected),original);assert.deepEqual(await fs.readFile(collision),original);
   }
   const newName='Renamed-'+language;await box.locator('input').fill(newName);await box.locator('input').press('Enter');await box.waitFor({state:'detached'});
   const renamed=path.join(dir,newName+'.docx');assert.deepEqual(await fs.readFile(renamed),original);await assert.rejects(fs.stat(selected),{code:'ENOENT'});
   assert.equal(await env.page.evaluate(()=>window.EOLastRename.name),newName+'.docx');
   safety.push({language,escapeNoRename:true,cancelNoRename:true,invalidAndCollisionPreserveBytes:true,enterRenames:true,sha256:crypto.createHash('sha256').update(original).digest('hex')});
   assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  }finally{await stop(env)}
 }
 await fs.writeFile(path.join(out,'rename-dialog.json'),JSON.stringify({states:states.length,results:states,safety},null,2)+'\n');console.log('PASS18actual Rename states;3locales real Enter/Cancel/Escape/invalid/collision/byte preservation; zero errors/HTTP');
})().catch(e=>{console.error(e);process.exitCode=1});
