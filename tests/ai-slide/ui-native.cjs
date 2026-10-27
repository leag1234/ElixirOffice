// SPDX-License-Identifier: AGPL-3.0-only
// Sandboxed authored Linux fixture. In-memory model replies after real native
// consent qualify UI/tool wiring, not real-model quality.
'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),{launch,editable,stop,root}=require('../desktop/harness.cjs'),{modal,keys}=require('../desktop/lifecycle.cjs');
assert.equal(process.platform,'linux');
function helper(){const p='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',s=sync.lstatSync(p);assert(s.uid===0&&s.gid===0&&(s.mode&0o7777)===0o4755&&s.size===15232);assert.equal(crypto.createHash('sha256').update(sync.readFileSync(p)).digest('hex'),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');assert.equal(sync.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),p);}
(async()=>{
 let env;const rows=[];
 async function pass(name){rows.push({name,pass:true});console.log('PASS '+name);await fs.writeFile(root+'/results/slide-ui.json',JSON.stringify({rows},null,2)+'\n');}
 try{
  const profile='slide-ui';await fs.mkdir(root+'/profiles/'+profile,{recursive:true});await fs.writeFile(root+'/profiles/'+profile+'/desktop-settings.json',JSON.stringify({recents:[],fontConsent:false,fontChoice:'declined',releaseNotice:{enabled:false},ai:null}));
  env=await launch({file:root+'/fixtures/ai-public.pptx',profile,args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/presentationeditor/main/'));assert(frame);
  await frame.waitForFunction(()=>PE.getController('Common.Controllers.ElixirAI')?.toolsetId==='slide');
  const originalBytes=await fs.readFile(root+'/fixtures/ai-public.pptx');
  const off=()=>frame.evaluate(()=>!Common.ElixirAI.Settings.isConfigured());
  const setup=async()=>{await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'visible'});for(const id of ['endpoint','model','key'])assert.equal(await frame.locator('#elixir-ai-setup-'+id).inputValue(),'');assert(await off());};
  const cancel=async()=>{await frame.locator('#elixir-ai-setup-cancel').click();await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'detached'});assert(await off());};
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await setup();await cancel();await pass('compiled presentation ribbon Ask opens empty unconfigured setup');
  const search=frame.locator('.elx-search-input');await search.click();await search.fill('Summarize this authored presentation');await frame.locator('.elx-sr-ask').click();await setup();await cancel();await pass('compiled presentation title Ask opens setup without replay');
  await frame.locator('#editor_sdk').click({position:{x:500,y:300},button:'right'});
  await frame.locator('.dropdown-menu a:visible').filter({hasText:'Ask Elixir'}).first().click();await setup();await cancel();await pass('compiled presentation existing context menu Ask opens setup');
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-ai').click();await setup();await pass('compiled presentation File AI opens setup');
  assert.deepEqual(await fs.readFile(root+'/fixtures/ai-public.pptx'),originalBytes);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));
  await frame.locator('#elixir-ai-setup-endpoint').fill('https://ai.example.invalid/v1');await frame.locator('#elixir-ai-setup-model').fill('synthetic-ui-fixture');await frame.locator('#elixir-ai-setup-continue').click();await modal(env);keys(env,'allow');
  await frame.waitForFunction(()=>Common.ElixirAI.Settings.isConfigured());await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'detached'});
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();assert.match(await frame.locator('.elixir-ai-input').getAttribute('placeholder'),/slide/);assert.match(await frame.locator('.elixir-ai-footer').innerText(),/speaker notes/);await frame.locator('.elixir-ai-input').press('Escape');await pass('real native consent enables presentation UI with truthful context and no automatic request');
  await frame.evaluate(()=>{
   const AI=Common.ElixirAI;let n=0;window.__restoreConnector=AI.Connector.chat;
   AI.Connector.chat=async()=>{const calls=[
    {name:'submit_plan',arguments:JSON.stringify({goal:'Append a public lesson slide',read_only:false,steps:[{tool:'create_slides',purpose:'Append'}]})},
    {name:'create_slides',arguments:JSON.stringify({slides:[{title:'Public lesson',bullets:['Read together','Discuss in pairs'],notes:'Ask for an example.'}]})},
    {name:'verify_result',arguments:JSON.stringify({goal_met:true})}
   ];return {ms:1,usage:{},message:{role:'assistant',content:'',tool_calls:[{id:'owned-'+n,function:calls[(n++)%3]}]}};};
  });
  const count=()=>env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return Api.GetPresentation().GetSlidesCount();})()',true,resolve)));
  async function submit(){await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await frame.locator('.elixir-ai-input').fill('Append one public lesson slide');await frame.locator('#elixir-ai-bar [data-act=send]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='review');}
  const before=await count();await submit();assert.equal(await count(),before+1);await env.page.screenshot({path:root+'/results/slide-ai-review.png'});await frame.locator('#elixir-ai-bar [data-act=discard]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='idle');assert.equal(await count(),before);await pass('compiled presentation planner/tools/verification and Discard use one native Undo');
  await submit();await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0].GetContent().GetElement(0).AddText("Later user edit");return true;})()',true,resolve)));
  await frame.locator('#elixir-ai-bar [data-act=discard]').click();assert.match(await frame.locator('.elixir-ai-status').innerText(),/presentation changed/);assert.equal(await count(),before+1);
  assert.match(await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0].GetContent().GetText();})()',true,resolve))),/^Later user edit(?:\r?\n)*$/);
  await pass('compiled presentation stale Discard preserves AI output and later user text');await frame.locator('#elixir-ai-bar [data-act=accept]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').style.display==='none');
  await frame.evaluate(()=>{
   const api=Asc.editor,original=api.callMethod;let dropped=false;
   window.__restoreCallMethod=()=>{api.callMethod=original;delete window.__restoreCallMethod;};
   api.callMethod=function(name,args,cb){if(!dropped&&name==='EndAction'&&args[0]==='GroupActions'&&args[2]===''){dropped=true;return original.call(api,name,args,function(){});}return original.call(api,name,args,cb);};
  });
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();await frame.locator('.elixir-ai-input').fill('Append one more public slide');await frame.locator('#elixir-ai-bar [data-act=send]').click();
  await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='idle',null,{timeout:20000});await frame.evaluate(()=>window.__restoreCallMethod());
  assert.match(await frame.locator('.elixir-ai-status').innerText(),/Cancellation could not be verified/);assert(!/was reverted|Nothing was changed/.test(await frame.locator('.elixir-ai-status').innerText()));assert.equal(await count(),before+2);await env.page.screenshot({path:root+'/results/slide-ai-unconfirmed-cancel.png'});await pass('compiled presentation reports lost actual native commit callback honestly with changes visible');
  await frame.evaluate(()=>{Common.ElixirAI.Connector.chat=window.__restoreConnector;delete window.__restoreConnector;});
  assert.deepEqual(env.errors,[]);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));await pass('compiled presentation UI has zero renderer errors and provider HTTP requests');
 }catch(e){await fs.writeFile(root+'/results/slide-ui-failure.json',JSON.stringify({error:e.stack,rows},null,2));if(env)await env.page.screenshot({path:root+'/results/slide-ui-failure.png'}).catch(()=>{});throw e;}
 finally{if(env)await stop(env);}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
