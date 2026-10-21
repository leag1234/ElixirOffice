// SPDX-License-Identifier: AGPL-3.0-only
// Public Nimbus Sans fixture on an isolated Linux desktop profile. No native dialog.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop,editable}=require('./harness.cjs'),action=require('./file-action.cjs');
(async()=>{
 const source=process.env.EO_FONT_FIXTURE;if(!source)throw Error('EO_FONT_FIXTURE must name a disposable public DOCX using Nimbus Sans');
 const root=process.env.EO_DESKTOP_ROOT,filename=path.join(root,'fixtures','font-ready-'+Date.now()+'.docx');
 await fs.copyFile(source,filename);const before=await fs.readFile(filename);
 let env=await launch({file:filename,profile:'font-ready-'+Date.now()});
 try{
  await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
  const inventory=await env.page.evaluate(async()=>{const x=await eoDesktop.fontIndex(false);return{id:x.id,systemFaces:x.system.length,nimbus:x.system.filter(f=>f.family==='Nimbus Sans').map(f=>({family:f.family,style:f.style}))}});
  assert(inventory.nimbus.length,'This test requires the public URW Nimbus Sans system font');
  await frame.waitForFunction(()=>{
   const LF=Common.ElixirLocalFonts,combo=DE.getController('Toolbar').toolbar.cmbFontName;
   return LF.hasConsent()&&LF.desktopPolicy&&AscFonts.g_map_font_index['Nimbus Sans']!==undefined&&!!combo.store.findWhere({name:'Nimbus Sans'});
  },null,{timeout:30000});
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false,'Late registration must not dirty an untouched document');
  // Open the actual picker and select the system family from its visible list.
  const input=frame.locator('#slot-field-fontname input[role=combobox]');
  await input.fill('Nimbus Sans');await input.press('Enter');
  await frame.waitForFunction(()=>Asc.editor.get_TextProps().get_TextPr().get_FontFamily().get_Name()==='Nimbus Sans');
  assert.equal(await frame.locator('.asc-window:visible').count(),0,'A known system font must not show an unknown-font warning');
  const controls={selected:await frame.evaluate(()=>Asc.editor.get_TextProps().get_TextPr().get_FontFamily().get_Name())};
  await env.page.evaluate(()=>EOLocalSession.api.asc_enterText(Array.from(' PUBLIC FONT READY EDIT',c=>c.codePointAt(0))));
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),true);
  await action(env.page,'save');await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  assert.notDeepEqual(await fs.readFile(filename),before,'Actual original Save must commit changed bytes');
  assert.deepEqual(env.errors,[]);
  const result={platform:process.platform,filename,inventory,controls,saved:await env.page.evaluate(()=>({name:EOLastSave.name,dirty:EOLocalSession.controller.isModified()})),errors:env.errors,externalRequests:env.requests.filter(r=>/^https?:/.test(r.url))};
  assert.deepEqual(result.externalRequests,[]);
  await fs.writeFile(path.join(root,'results','font-readiness.json'),JSON.stringify(result,null,2)+'\n');
  await env.page.screenshot({path:path.join(root,'results','font-readiness.png')});
  await stop(env);env=null;
  env=await launch({file:filename,profile:'font-reopen-'+Date.now()});await editable(env);
  const reopened=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await reopened.waitForFunction(()=>Common.ElixirLocalFonts.hasConsent()&&Common.ElixirLocalFonts.desktopPolicy&&Common.ElixirLocalFonts.isLocal('Nimbus Sans'),null,{timeout:30000});
  const text=await reopened.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.map(p=>p.GetText?.()||'').join('\n'));
  assert(text.includes('PUBLIC FONT READY EDIT'),'Actual save/reopen must preserve the edit');
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  result.reopened={textPreserved:true,dirty:false,errors:env.errors};
  await fs.writeFile(path.join(root,'results','font-readiness.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{if(env)await stop(env)}
})().catch(e=>{console.error(e);process.exitCode=1});
