// SPDX-License-Identifier: AGPL-3.0-only
// Linux-only, sandboxed, authored fixture. The provider is a deterministic in-memory
// fixture after real native consent; this is UI/tool wiring, not model-quality evidence.
'use strict';
const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),{launch,editable,stop,root}=require('../desktop/harness.cjs'),{modal,keys}=require('../desktop/lifecycle.cjs');
assert.equal(process.platform,'linux');
function helper(){
 const file='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',s=fss.lstatSync(file);
 assert(s.uid===0&&s.gid===0&&(s.mode&0o7777)===0o4755&&s.size===15232);
 assert.equal(crypto.createHash('sha256').update(fss.readFileSync(file)).digest('hex'),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');
 assert.equal(fss.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),file);
}
(async()=>{
 let env;const rows=[];async function pass(name){rows.push({name,pass:true});console.log('PASS '+name);await fs.writeFile(root+'/results/cell-ui.json',JSON.stringify({rows},null,2));}
 try{
  const profile='cell-ui';await fs.mkdir(root+'/profiles/'+profile,{recursive:true});await fs.writeFile(root+'/profiles/'+profile+'/desktop-settings.json',JSON.stringify({recents:[],fontConsent:false,fontChoice:'declined',releaseNotice:{enabled:false},ai:null}));
  helper();env=await launch({file:root+'/fixtures/ai-public.xlsx',profile,args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));assert(frame);
  const sourceBefore=await fs.readFile(root+'/fixtures/ai-public.xlsx');
  await frame.waitForFunction(()=>SSE.getController('Common.Controllers.ElixirAI')?.toolsetId==='cell');
  const off=()=>frame.evaluate(()=>!Common.ElixirAI.Settings.isConfigured());
  const setup=async()=>{await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'visible'});for(const id of ['endpoint','model','key'])assert.equal(await frame.locator('#elixir-ai-setup-'+id).inputValue(),'');assert(await off());};
  const cancel=async()=>{await frame.locator('#elixir-ai-setup-cancel').click();await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'detached'});assert(await off());};
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await setup();await cancel();await pass('compiled spreadsheet Elixir ribbon opens unconfigured setup');
  const search=frame.locator('.elx-search-input');await search.click();await search.fill('Explain this authored table');await frame.locator('.elx-sr-ask').click();await setup();await cancel();await pass('compiled title search Ask opens setup without replay');
  await frame.locator('#editor_sdk').click({position:{x:180,y:120},button:'right'});
  await frame.locator('#mini-elixir-ask button').waitFor({state:'visible',timeout:7000});await frame.locator('#mini-elixir-ask button').click();await setup();await cancel();await pass('compiled spreadsheet mini-toolbar Ask opens setup');
  await frame.locator('#editor_sdk').click({position:{x:180,y:120},button:'right'});
  await frame.locator('.dropdown-menu a:visible').filter({hasText:'Ask Elixir'}).first().click();await setup();await cancel();await pass('compiled spreadsheet context Ask opens setup');
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-ai').click();await setup();await pass('compiled File AI opens setup');
  assert.deepEqual(await fs.readFile(root+'/fixtures/ai-public.xlsx'),sourceBefore);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));
  await frame.locator('#elixir-ai-setup-endpoint').fill('https://ai.example.invalid/v1');await frame.locator('#elixir-ai-setup-model').fill('synthetic-ui-fixture');await frame.locator('#elixir-ai-setup-continue').click();await modal(env);keys(env,'allow');
  await frame.waitForFunction(()=>Common.ElixirAI.Settings.isConfigured());await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'detached'});
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();
  assert.match(await frame.locator('.elixir-ai-input').getAttribute('placeholder'),/formula/);assert.match(await frame.locator('.elixir-ai-footer').innerText(),/selected range/);await frame.locator('.elixir-ai-input').press('Escape');await pass('native consent enables truthful spreadsheet-specific command UI with no automatic request');
  await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){var s=Api.GetActiveSheet();s.GetRange("A1:C3").SetValue([["Item","Amount","Region"],["A",20,"North"],["B",10,"South"]]);s.GetRange("A1:C3").Select();return true;})()',true,resolve)));
  await frame.evaluate(()=>{
   const AI=Common.ElixirAI;let n=0;
   window.__restoreConnector=AI.Connector.chat;
   AI.Connector.chat=async()=>{const calls=[
    {name:'submit_plan',arguments:JSON.stringify({goal:'Double authored amounts',read_only:false,steps:[{tool:'write_formula',purpose:'Fill totals'}]})},
    {name:'write_formula',arguments:JSON.stringify({range:'D2:D3',formula:'=B2*2'})},
    {name:'verify_result',arguments:JSON.stringify({goal_met:true})}
   ];const c=calls[(n++)%3];return {ms:1,usage:{},message:{role:'assistant',content:'',tool_calls:[{id:'owned-'+n,function:c}]}};};
  });
  async function submit(text="Double the amounts in D2:D3"){
   await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await frame.locator('.elixir-ai-input').fill(text);await frame.locator('#elixir-ai-bar [data-act=send]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='review');
  }
  const values=()=>env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return JSON.stringify(Api.GetActiveSheet().GetRange("D2:D3").GetValue2());})()',true,r=>resolve(JSON.parse(r)))));
  await submit();assert.deepEqual(await values(),[['40'],['20']]);await env.page.screenshot({path:root+'/results/cell-ai-review.png'});
  await frame.locator('#elixir-ai-bar [data-act=discard]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='idle');assert.deepEqual(await values(),[[''],['']]);await pass('compiled command bar/planner/tools/verification and same-history Discard use one native Undo (fixture model)');
  await submit();await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){Api.GetActiveSheet().GetRange("E1").SetValue("later user edit");return true;})()',true,resolve)));
  await frame.locator('#elixir-ai-bar [data-act=discard]').click();assert.match(await frame.locator('.elixir-ai-status').innerText(),/changed after this action/);assert.deepEqual(await values(),[['40'],['20']]);assert.equal(await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return Api.GetActiveSheet().GetRange("E1").GetValue2();})()',false,resolve))),'later user edit');await pass('compiled stale Discard preserves AI output and later user edit');
  await frame.locator('#elixir-ai-bar [data-act=accept]').click();
  await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').style.display==='none');
  await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){Api.GetActiveSheet().GetRange("A1:E3").Select();return true;})()',false,resolve)));
  await frame.evaluate(()=>{
   const api=Asc.editor,original=api.callMethod;let dropped=false,n=0;
   window.__restoreCallMethod=()=>{api.callMethod=original;delete window.__restoreCallMethod;};
   // Deliver the real native commit, but deliberately lose its callback.
   api.callMethod=function(name,args,callback){
    if(!dropped&&name==='EndAction'&&args[0]==='GroupActions'&&args[2]===''){dropped=true;return original.call(api,name,args,function(){});}
    return original.call(api,name,args,callback);
   };
   Common.ElixirAI.Connector.chat=async()=>{
    const calls=[
     {name:'submit_plan',arguments:JSON.stringify({goal:'Triple authored amounts',read_only:false,steps:[{tool:'write_formula',purpose:'Triple'}]})},
     {name:'write_formula',arguments:JSON.stringify({range:'D2:D3',formula:'=B2*3'})},
     {name:'verify_result',arguments:JSON.stringify({goal_met:true})}
    ];return {ms:1,usage:{},message:{role:'assistant',content:'',tool_calls:[{id:'owned-fault-'+n,function:calls[n++]}]}};
   };
  });
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();
  await frame.locator('.elixir-ai-input').fill('Triple the amounts in D2:D3');await frame.locator('#elixir-ai-bar [data-act=send]').click();
  await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='idle',null,{timeout:20000});
  await frame.evaluate(()=>window.__restoreCallMethod());
  assert.match(await frame.locator('.elixir-ai-status').innerText(),/Cancellation could not be verified/);
  assert(!/was reverted|Nothing was changed/.test(await frame.locator('.elixir-ai-status').innerText()));
  assert.deepEqual(await values(),[['60'],['30']]);await env.page.screenshot({path:root+'/results/cell-ai-unconfirmed-cancel.png'});
  await pass('compiled UI reports lost native commit acknowledgement honestly; actual changes remain visible (fault injection)');
  await frame.evaluate(()=>{Common.ElixirAI.Connector.chat=window.__restoreConnector;delete window.__restoreConnector;});

  assert.deepEqual(env.errors,[]);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));await pass('compiled UI qualification has zero renderer errors and provider HTTP requests');
 }catch(e){await fs.writeFile(root+'/results/cell-ui-failure.json',JSON.stringify({error:e.stack,rows},null,2));if(env)await env.page.screenshot({path:root+'/results/cell-ui-failure.png'}).catch(()=>{});throw e;}
 finally{if(env)await stop(env);}
})().catch(e=>{console.error(e);process.exitCode=1});
