// SPDX-License-Identifier: AGPL-3.0-only
// Actual compiled candidate on a labeled isolated instance; no source/model injection.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from '../../tools/eval/lib.mjs';
const base=process.env.EO_BASE,out=process.env.EO_SLIDE_RESULTS,file=process.env.EO_PUBLIC_PPTX;
assert.equal(base,'http://127.0.0.1:18368');assert(out&&file);
assert.equal(execFileSync('docker',['inspect','eo-ai-cell-A','--format','{{index .Config.Labels "org.elixiroffice.qa.owner"}}'],{encoding:'utf8'}).trim(),'A-ai-discover');
const uid='uid-A-slide-smoke-'+crypto.randomBytes(10).toString('hex'),fd=new FormData();
fd.append('uploadedFile',new Blob([fs.readFileSync(file)]),'A-slide-smoke-'+crypto.randomBytes(8).toString('hex')+'.pptx');
const upload=await fetch(base+'/example/upload',{method:'POST',body:fd,headers:{Cookie:'uid='+uid}}).then(r=>r.json());assert(upload.filename);
const browser=await chromium.launch(),context=await browser.newContext(),page=await context.newPage(),errors=[],modelRequests=[],checks=[];
page.on('pageerror',()=>errors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')errors.push('console error')});page.on('request',r=>{if(/chat\/completions/.test(r.url()))modelRequests.push(true)});
try{
 await context.addCookies([{name:'uid',value:uid,url:base}]);await page.goto(base+'/example/editor?fileName='+encodeURIComponent(upload.filename),{waitUntil:'load'});
 let frame;for(let i=0;i<300;i++){frame=page.frames().find(f=>f.url().includes('/presentationeditor/main/'));if(frame)break;await page.waitForTimeout(100)}assert(frame);
 await frame.waitForFunction(()=>{try{return PE.getController('Main')._isDocReady===true&&!!window.g_asc_plugins}catch{return false}},null,{timeout:90000});
 assert.equal(await frame.evaluate(()=>PE.getController('Common.Controllers.ElixirAI').toolsetId),'slide');checks.push('compiled presentation controller/toolset registered');
 await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'visible'});
 assert.equal(await frame.evaluate(()=>Common.ElixirAI.Settings.isConfigured()),false);await frame.locator('#elixir-ai-setup-cancel').click();checks.push('unconfigured compiled presentation ribbon opens setup without provider request');
 const result=await frame.evaluate(async()=>{
  const api=Asc.editor,ts=Common.ElixirAI.toolsets.slide.create(api);
  const count=()=>new Promise(resolve=>api.callCommand('(function(){return Api.GetPresentation().GetSlidesCount();})()',true,resolve));
  const before=await count(),c=await ts.init();
  try{
   const plan=await ts.execute('submit_plan',{goal:'Authored compiled hosted slide smoke',read_only:false,steps:[{tool:'create_slides',purpose:'Append'}]},c);if(!plan.ok)throw Error('Public compiled plan failed');
   const r=await ts.execute('create_slides',{slides:[{title:'Public hosted lesson',bullets:['One public point'],notes:'Public hosted notes.'}]},c);
   if(!r.ok)throw Error('Public compiled creation failed');await ts.end(c,true);
   const after=await count();await ts.undo();return {before,after,undo:await count(),created:r.state.slides[0]};
  }catch(e){await ts.end(c,false);throw e;}
 });
 assert.equal(result.after,result.before+1);assert.equal(result.undo,result.before);assert.equal(result.created.notes,'Public hosted notes.');assert(result.created.shapes.some(s=>s.paragraphs.some(p=>p.text==='Public hosted lesson')));checks.push('actual compiled append/notes readback and one native Undo');
 assert.deepEqual(errors,[]);assert.equal(modelRequests.length,0);checks.push('zero renderer errors or provider requests');
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(out+'/hosted-smoke.json',JSON.stringify({checks,pass:true,errors,modelRequests:modelRequests.length,result},null,2)+'\n');console.log(JSON.stringify({pass:true,checks}));
}finally{await browser.close()}
