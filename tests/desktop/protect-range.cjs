// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{launch,stop,editable,fixture,root}=require('./harness.cjs');
const source=process.env.EO_DESKTOP_RANGE_FILE,executable=process.env.EO_PACKAGE_EXECUTABLE;
const args=process.env.EO_DESKTOP_DISPLAY?['--disable-gpu']:[];
function read(frame){return frame.evaluate(()=>Asc.editor.asc_getUserProtectedRanges().map(r=>({name:r.asc_getName(),ref:r.asc_getRef(),type:r.asc_getType(),users:r.asc_getUsers().map(u=>({id:u.asc_getId(),type:u.asc_getType()}))})));}
(async()=>{
 assert(source,'EO_DESKTOP_RANGE_FILE must name a public XLSX fixture');
 const original=await fs.readFile(source),file=await fixture(source),profile='protect-range-'+Date.now();
 const env=await launch({executable,file,args,profile});let created;
 try{await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));
  assert.equal(await frame.evaluate(()=>SSE.getController('Main').appOptions.isElixirLocal),true);
  await frame.locator('#toolbar a[data-tab=review]').click();await frame.locator('#slot-btn-protect-range button').click();
  await frame.locator('#protect-edit-ranges-btn-new').click();await frame.locator('#id-protected-range-name-txt input').fill('NativeProtectedRange');
  await frame.locator('#id-protected-range-txt input').fill('A1:B2');await frame.locator('.asc-window:visible .dlg-btn[result=ok]').click();
  await frame.waitForFunction(()=>Asc.editor.asc_getUserProtectedRanges().some(r=>r.asc_getName()==='NativeProtectedRange'));
  created=await read(frame);await env.page.screenshot({path:path.join(root,'results',profile+'.png')});
  await frame.locator('.asc-window:visible .dlg-btn[result=close]').click();await env.page.evaluate(()=>EOLocalSession.controller.save());
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  await frame.locator('#toolbar a[data-tab=data]').click();assert.equal(await frame.locator('#slot-btn-data-external-links').isVisible(),false);
  assert(!env.requests.some(r=>/^https?:/.test(r.url)),'Desktop attempted remote network');
 }finally{await stop(env)}
 const fresh=await launch({executable,file,args,profile:profile+'-reopen'});
 try{await editable(fresh);const frame=fresh.page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));const reopened=await read(frame);
  assert.deepEqual(reopened,created);assert(!fresh.requests.some(r=>/^https?:/.test(r.url)));
  await fs.writeFile(path.join(root,'results',profile+'.json'),JSON.stringify({created,reopened,sourceUnchanged:true},null,2));
 }finally{await stop(fresh)}
 if(process.env.EO_DESKTOP_WORD_FILE){
  const word=await launch({executable,file:await fixture(process.env.EO_DESKTOP_WORD_FILE),args,profile:profile+'-word'});
  try{await editable(word);const frame=word.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
   await frame.locator('#toolbar a[data-tab=ins]').click();assert.equal(await frame.locator('#id-toolbar-btn-text-from-file').isVisible(),false);
   assert.equal(await frame.locator('#slot-elx-ins-object').count(),1);
   assert.equal(await frame.locator('#slot-elx-ins-object').isVisible(),false,'visible mirrored Insert Object entry');
   await frame.evaluate(()=>DE.getController('Toolbar').onTextFromFileClick(null,{value:'file'}));assert(!word.requests.some(r=>/^https?:/.test(r.url)));
  }finally{await stop(word)}
 }
 assert.deepEqual(await fs.readFile(source),original,'Test modified the input fixture');
 console.log('PASS desktop Protect Range dialog/permissions/atomic save/reopen, hidden Edit Links/Insert text, original preserved and zero remote requests');
})().catch(error=>{console.error(error);process.exitCode=1});
