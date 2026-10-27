// SPDX-License-Identifier: AGPL-3.0-only
// Compiled candidate assets on the explicitly owned mock instance; no module injection/model.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from '../../tools/eval/lib.mjs';
const base=process.env.EO_BASE,out=process.env.EO_CELL_RESULTS,file=process.env.EO_PUBLIC_XLSX;
assert.equal(base,'http://127.0.0.1:18368');assert(out&&file);
assert.equal(execFileSync('docker',['inspect','eo-ai-cell-A','--format','{{index .Config.Labels "org.elixiroffice.qa.owner"}}'],{encoding:'utf8'}).trim(),'A-ai-discover');
const uid='uid-A-smoke-'+crypto.randomBytes(10).toString('hex'),fd=new FormData();
fd.append('uploadedFile',new Blob([fs.readFileSync(file)]),'A-cell-smoke-'+crypto.randomBytes(8).toString('hex')+'.xlsx');
const upload=await fetch(base+'/example/upload',{method:'POST',body:fd,headers:{Cookie:'uid='+uid}}).then(r=>r.json());assert(upload.filename);
const browser=await chromium.launch(),context=await browser.newContext(),page=await context.newPage(),errors=[],modelRequests=[];
page.on('pageerror',()=>errors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')errors.push('console error')});
page.on('request',r=>{if(/chat\/completions/.test(r.url()))modelRequests.push(true)});
const checks=[];
try{
 await context.addCookies([{name:'uid',value:uid,url:base}]);
 await page.goto(base+'/example/editor?fileName='+encodeURIComponent(upload.filename),{waitUntil:'load'});
 let frame;for(let i=0;i<300;i++){frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));if(frame)break;await page.waitForTimeout(100)}assert(frame);
 await frame.waitForFunction(()=>{try{return SSE.getController('Main')._isDocReady===true&&!!window.g_asc_plugins}catch{return false}},null,{timeout:90000});
 assert.equal(await frame.evaluate(()=>SSE.getController('Common.Controllers.ElixirAI').toolsetId),'cell');checks.push('compiled spreadsheet controller/toolset registered');
 await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'visible'});
 assert.equal(await frame.evaluate(()=>Common.ElixirAI.Settings.isConfigured()),false);await frame.locator('#elixir-ai-setup-cancel').click();checks.push('unconfigured compiled ribbon opens setup without model request');
 const result=await frame.evaluate(async()=>{
  const api=Asc.editor,ts=Common.ElixirAI.toolsets.cell.create(api);
  await new Promise(resolve=>api.callCommand('(function(){Api.GetActiveSheet().GetRange("A1:C4").Select();return true;})()',false,resolve));
  const c=await ts.init();
  try{
   await ts.execute('submit_plan',{goal:'Authored compiled hosted smoke',read_only:false,steps:[{tool:'write_formula',purpose:'Line costs'}]},c);
   const r=await ts.execute('write_formula',{range:'D2:D4',formula:'=B2*C2'},c);
   if(!r.ok)throw Error('Public compiled write failed');await ts.end(c,true);
   const read=()=>new Promise(resolve=>api.callCommand('(function(){return JSON.stringify(Api.GetActiveSheet().GetRange("D2:D4").GetValue2());})()',true,r=>resolve(JSON.parse(r))));
   const after=await read();await ts.undo();return {after,undo:await read()};
  }catch(e){await ts.end(c,false);throw e;}
 });
 assert.deepEqual(result.after,[['8'],['30'],['15']]);assert.deepEqual(result.undo,[[''],[''],['']]);checks.push('actual compiled public formula write and one native Undo');
 assert.deepEqual(errors,[]);assert.equal(modelRequests.length,0);checks.push('zero renderer errors or provider requests');
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(out+'/hosted-smoke.json',JSON.stringify({checks,pass:true,errors,modelRequests:modelRequests.length,result},null,2)+'\n');
 console.log(JSON.stringify({pass:true,checks}));
}finally{await browser.close()}
