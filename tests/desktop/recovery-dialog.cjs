// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic public records only. Never opens an installed user profile.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Recovery}=require('../../desktop/recovery.cjs'),{launch,stop,editable,root}=require('./harness.cjs');
(async()=>{
 const out=process.env.EO_RECOVERY_OUT;if(!out)throw Error('EO_RECOVERY_OUT is required');await fs.mkdir(out,{recursive:true});
 const original=await fs.readFile(process.env.EO_RECOVERY_FIXTURE||path.join(root,'fixtures/sample.docx')),results=[],safety=[];
 for(const language of ['en','fr','ar']){
  const profile='recovery-dialog-'+language+'-'+Date.now(),store=new Recovery(path.join(root,'profiles',profile)),good=crypto.randomUUID(),second=crypto.randomUUID(),bad=crypto.randomUUID();
  for(const [id,name] of [[good,'Public recovery one.docx'],[second,'Public recovery two.docx'],[bad,'Damaged public recovery.docx']])await store.save({id,name,format:'docx'},new Uint8Array(original));
  const damagedPath=path.join(store.root,bad+'.recovery'),broken=await fs.readFile(damagedPath);broken[broken.length-1]^=1;await fs.writeFile(damagedPath,broken);
  const stored=async()=>{const list=await store.list();return list.map(e=>e.id).sort()};
  const all=[good,second,bad].sort();let env;
  async function open(){env=await launch({profile,args:['--lang='+language]});const box=env.page.locator('dialog.desktop-recovery[open]');await box.waitFor();return box;}
  try{
   let box=await open();
   for(const dark of [false,true])for(const viewport of [{width:1360,height:960},{width:800,height:600},{width:400,height:600}]){
    await env.page.setViewportSize(viewport);await env.page.emulateMedia({colorScheme:dark?'dark':'light'});
    // System appearance is applied by the packaged matchMedia change listener.
    await env.page.waitForFunction(dark=>document.documentElement.getAttribute('data-eo-theme')===(dark?'dark':'light')&&matchMedia('(prefers-color-scheme: dark)').matches===dark,dark,{timeout:5000});
    const data=await box.evaluate(box=>{
     const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}},first=box.querySelector('.desktop-recovery-restore'),cancel=box.querySelector('.desktop-recovery-footer button');
     const color=s=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
     const primaryStyle=getComputedStyle(first);
     return{background:color(getComputedStyle(box).backgroundColor),foreground:color(primaryStyle.color),fill:color(primaryStyle.backgroundColor),language:document.documentElement.lang,dir:document.documentElement.dir,rect:rect(box),activeRestore:document.activeElement===first,restoreCount:box.querySelectorAll('.desktop-recovery-restore').length,rows:box.querySelectorAll('section').length,body:box.innerText,title:box.querySelector('h2').textContent,expected:EODesktopStrings.recoveryTitle,damaged:EODesktopStrings.recoveryDamaged,unavailable:EODesktopStrings.recoveryUnavailable,footer:rect(cancel)};
    });
    const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=luminance(data.foreground),b=luminance(data.fill);data.primaryContrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert(data.primaryContrast>=4.5);assert(dark?Math.max(...data.background)<100:Math.min(...data.background)>200,'Requested appearance actually applies');
    assert.equal(data.language,language);assert.equal(data.dir,language==='ar'?'rtl':'ltr');assert.equal(data.title,data.expected);assert(data.body.includes(data.damaged)&&data.body.includes(data.unavailable));assert(!data.body.includes('.recovery'));assert.equal(data.restoreCount,2);assert.equal(data.rows,3);assert(data.activeRestore);
    assert(data.rect.x>=0&&data.rect.right<=viewport.width&&data.rect.y>=0&&data.rect.bottom<=viewport.height);assert(data.footer.bottom<=data.rect.bottom);
    await env.page.screenshot({path:path.join(out,'recovery-'+language+'-'+(dark?'dark':'light')+'-'+viewport.width+'.png')});results.push({language,dark,viewport,data});
   }
   await box.locator('.desktop-recovery-footer button').click();await box.waitFor({state:'detached'});assert.deepEqual(await stored(),all);
   assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);await stop(env);env=null;
   box=await open();await env.page.keyboard.press('Escape');await box.waitFor({state:'detached'});assert.deepEqual(await stored(),all);
   assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);await stop(env);env=null;
   box=await open();const damaged=box.locator('section:has(.desktop-recovery-damaged)');
   assert.equal(await damaged.count(),1);assert.equal(await damaged.locator('.desktop-recovery-restore').count(),0);
   await damaged.locator('button').click();await damaged.waitFor({state:'detached'});assert.deepEqual(await stored(),[good,second].sort());
   const chosen=box.locator('section').filter({hasText:'Public recovery one.docx'});await chosen.locator('.desktop-recovery-restore').click();await box.waitFor({state:'detached'});await editable(env);
   assert.equal(await env.page.evaluate(()=>EOLocalSession.file.name),'Public recovery one.docx');
   assert.equal(await env.page.evaluate(()=>EOLocalSession.file.recovered),true);
   assert.deepEqual(Buffer.from(await env.page.evaluate(()=>Array.from(EOLocalSession.file.bytes))),original);
   assert.deepEqual((await store.read(second)).data,new Uint8Array(original));
   // Tab restore deliberately consumes the selected record only after writing its
   // own durable clone. Check its identity AND exact bytes, not the obsolete ID.
   const restoredToken=await env.page.evaluate(()=>EOLocalSession.file.token);
   assert(![good,second,bad].includes(restoredToken));assert.match(restoredToken,/^[a-f0-9-]{36}$/);
   const clone=await store.read(restoredToken);
   assert.equal(clone.name,'Public recovery one.docx');assert.equal(clone.format,'docx');
   assert.deepEqual(clone.data,new Uint8Array(original));assert.deepEqual(await stored(),[restoredToken,second].sort());
   assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
   safety.push({language,cancelAndEscapePreserveAll:true,discardOnlyChosenDamaged:true,restoreExactChosenBytes:true,otherRecoveryPreserved:true,freshDurableCloneExactBytes:true,selectedOriginalConsumedAfterClone:true});
  }finally{
   // A restored document is deliberately unsaved; end only this owned process.
   if(env){if(env.application.exitCode===null&&env.application.signalCode===null)try{process.kill(-env.application.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}await stop(env)}
  }
 }
 await fs.writeFile(path.join(out,'recovery-dialog.json'),JSON.stringify({states:results.length,results,safety},null,2)+'\n');
 console.log('PASS18Recovery states;3locale Cancel/Escape preserve all, Discard removes only chosen damaged, Restore opens exact public bytes; no errors/HTTP');
})().catch(e=>{console.error(e);process.exitCode=1});
