// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop,editable,root}=require('./harness.cjs'),{modal,keys,edit}=require('./lifecycle.cjs'),action=require('./file-action.cjs');
(async()=>{
 const results=[],legacy=process.env.EO_SAVE_AS_LEGACY_FIXTURE;
 assert(legacy&&path.isAbsolute(legacy),'Explicit public EO_SAVE_AS_LEGACY_FIXTURE required');
 for(const kind of ['untitled','converted']){
  const source=kind==='converted'?legacy:undefined,original=source?await fs.readFile(source):null;
  const target=path.join(root,'results','saveas-'+kind+'-'+Date.now()+'.docx');let env;
  try{
   env=await launch({file:source,profile:'saveas-start-'+kind+'-'+Date.now()});
   if(kind==='untitled')await env.page.locator('#home [data-new=docx]').click();
   await editable(env);assert.equal(await env.page.evaluate(()=>EOLocalSession.file.format),'docx');
   if(kind==='converted')assert.equal(await env.page.evaluate(()=>EOLocalSession.file.sourceFormat),'doc');
   const first=await env.page.evaluate(()=>eoDesktop.saveAsInfo(EOLocalSession.file.token));assert.equal(first.defaultFormat,'docx');
   await edit(env);
   await action(env.page,'save-as','docx');await modal(env);keys(env,'escape');
   await env.page.waitForFunction(()=>!EODesktopState(false).opening);
   assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));assert.equal(await env.page.evaluate(()=>window.EOLastSave||null),null);
   if(source)assert.deepEqual(await fs.readFile(source),original);
   await action(env.page,'save-as','docx');await modal(env);keys(env,'save-path',target);
   await env.page.waitForFunction(name=>window.EOLastSave?.name===name&&!EODesktopState(false).opening,path.basename(target),{timeout:120000});
   assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
   const after=await env.page.evaluate(()=>eoDesktop.saveAsInfo(EOLocalSession.file.token));assert.equal(after.defaultFormat,'docx');
   if(source)assert.deepEqual(await fs.readFile(source),original);
   assert((await fs.readFile(target)).subarray(0,2).equals(Buffer.from('PK')));assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>/^(eoapp:|blob:|data:)/.test(r.url)));
   await stop(env);env=null;
   env=await launch({file:target,profile:'saveas-start-reopen-'+kind+'-'+Date.now()});await editable(env);
   assert(await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetAllParagraphs().some(p=>p.GetText().includes('EODESKTOP'))));
   assert.deepEqual(env.errors,[]);results.push({kind,defaultFormat:'docx',cancelKeepsDirty:true,sourceUnchanged:true,saved:true,reopened:true});console.log('PASS native',kind,'default, Cancel, real Save As and fresh reopen');
  }finally{if(env)await stop(env)}
 }
 await fs.writeFile(path.join(root,'results/saveas-starts.json'),JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
