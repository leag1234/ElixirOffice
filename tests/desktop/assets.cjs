// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,fixture}=require('./harness.cjs');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 for(const format of ['docx','xlsx','pptx']){
  const env=await launch({file:await fixture('sample.'+format),profile:'asset-macros-'+format+'-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
  try{
   await editable(env);
   const result=await env.page.evaluate(()=>{
    const {win,api,format}=EOLocalSession,app=format==='docx'?win.DE:format==='xlsx'?win.SSE:win.PE;
    return {customization:app.getController('Main').editorConfig.customization.macros,engine:api.DocInfo.asc_getIsEnabledMacroses(),visibleMacroActions:Array.from(win.document.querySelectorAll('button,a,[role="button"]')).filter(el=>/^(macros|edit macros|run macros)$/i.test(el.textContent.trim())&&el.getClientRects().length).map(el=>el.textContent.trim())};
   });
   assert.equal(result.customization,false);assert.equal(result.engine,false);assert.deepEqual(result.visibleMacroActions,[]);
   assert.equal(env.requests.filter(r=>/\/monaco\//.test(r.url)).length,0);assert.deepEqual(env.errors,[]);
   console.log('PASS macros inaccessible/Monaco unused',format,JSON.stringify(result));
  }finally{await stop(env)}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
