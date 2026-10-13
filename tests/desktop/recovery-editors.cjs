// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,stop,editable,root}=require('./harness.cjs'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const marker='LOCAL RECOVERY EDITOR CHECK';
 for(const format of ['xlsx','pptx']){
  const source=path.join(root,'fixtures/sample.'+format),original=await fs.readFile(source),profile='recovery-'+format+'-'+Date.now(),executable=process.env.EO_PACKAGE_EXECUTABLE;
  const first=await launch({executable,file:source,profile});
  try{
   await editable(first);const activeTarget=JSON.parse(await fs.readFile(path.join(first.directory,'desktop-settings.json'),'utf8')).recents[0].target,activeOriginal=await fs.readFile(activeTarget);
   assert.equal(await first.page.evaluate(()=>EOLocalSession.api.asc_Save(true)),false);
   await first.page.evaluate(()=>eoDesktop.recoverySettings({enabled:true,seconds:15}));
   await first.page.evaluate(marker=>{
    const {api,format}=EOLocalSession;
    if(format==='pptx'){const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);if(!shape)throw Error('No slide text');control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos()}
    api.asc_enterText(Array.from(marker,c=>c.codePointAt(0)));if(format==='xlsx')api.asc_closeCellEditor();
   },marker);
   const until=Date.now()+120000;let copies=[];
   while(Date.now()<until){copies=await first.page.evaluate(()=>eoDesktop.recoveryList());if(copies.length===1)break;await first.page.waitForTimeout(500)}
   assert.equal(copies.length,1);assert.equal(await first.page.evaluate(()=>EOLocalSession.controller.isModified()),true);
   assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(await fs.readFile(activeTarget),activeOriginal,'Recovery overwrote active file');
   process.kill(-first.application.pid,'SIGKILL');await new Promise(resolve=>first.application.once('exit',resolve));
  }finally{await stop(first)}
  const second=await launch({executable,profile});
  try{
   await second.page.locator('.desktop-options').waitFor();const label=await second.page.evaluate(()=>EODesktopStrings.restore);
   await second.page.locator('.desktop-options button').filter({hasText:label}).click();await editable(second);
   assert.equal(await second.page.evaluate(()=>EOLocalSession.format),format);
   const serialized=await second.page.evaluate(()=>Array.from(new Uint8Array(EOLocalSession.controller.serialize())));
   const needle=Array.from(marker).flatMap(c=>[c.charCodeAt(0),0]);
   assert(serialized.some((_v,i)=>needle.every((v,j)=>serialized[i+j]===v)),'Restored marker missing '+format);
   assert.equal(await second.page.evaluate(()=>EOLocalSession.controller.isModified()),true);
   assert.deepEqual(await fs.readFile(source),original);
   console.log('PASS actual periodic '+format+' snapshot/SIGKILL/startup prompt/restore, marker, unsaved state and original intact');
  }finally{await stop(second)}
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
