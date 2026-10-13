// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual native Help windows, visible File controls; no runtime patch or bridge shortcut.
const {launch,stop,editable,root,fixture}=require('./harness.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const rows=[];
 for(const [format,editor]of [['docx','documenteditor'],['xlsx','spreadsheeteditor'],['pptx','presentationeditor']]){
  const env=await launch({file:await fixture('sample.'+format),profile:'help-'+format+'-'+Date.now()});
  try{
   await editable(env);const locale=await env.page.evaluate(()=>eoDesktop.locale());
   const frame=env.page.frames().find(frame=>frame.url().includes('/'+editor+'/main/'));
   assert.equal(await frame.evaluate(()=> (window.DE||window.SSE||window.PE).getController('Main').editorConfig.lang),locale.language);
   // Opening a file may already leave the shared backstage visible.
   if(!await frame.locator('#fm-btn-help').isVisible())await frame.locator('#file[role=tab]').click();
   await frame.locator('#fm-btn-help').click();
   let help;for(let n=0;n<150;n++){
    help=env.browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().includes('/'+editor+'/main/resources/help/'));
    if(help)break;await env.page.waitForTimeout(200);
   }
   assert(help,'Native Help window missing for '+format);await help.waitForLoadState('domcontentloaded');
   const language=/\/help\/([^/]+)\/index\.htm$/.exec(help.url())?.[1];assert(language);
   assert(language===locale.language||language==='en','Help must use current UI language or documented English fallback');
   const length=(await help.locator('body').innerText()).trim().length;assert(length>100);
   assert.equal(await help.evaluate(()=>typeof require),'undefined');assert.deepEqual(env.errors,[]);
   await help.screenshot({path:path.join(root,'results','help-'+process.platform+'-'+format+'.png')});
   rows.push({format,editor,uiLanguage:locale.language,helpLanguage:language,url:help.url(),contentChars:length});
   await fs.writeFile(path.join(root,'results','help-'+process.platform+'.json'),JSON.stringify(rows,null,2));
   await help.close();console.log('PASS actual packaged File Help, UI-language/local content/no Node/errors',format,locale.language,language);
  }finally{await stop(env)}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
