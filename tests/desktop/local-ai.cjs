// SPDX-License-Identifier: AGPL-3.0-only
// Real native consent dialogs, synthetic loopback provider; no actual key/provider.
'use strict';
const {launch,editable,stop,fixture}=require('./harness.cjs'),{modal,keys}=require('./lifecycle.cjs'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 let calls=0;const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const data=JSON.parse(body);assert.equal(req.url,'/v1/chat/completions');assert.equal(data.model,'public-local-model');assert.equal(req.headers.authorization,undefined);calls++;res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n')})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
 const env=await launch({file:await fixture('sample.docx'),profile:'native-ai-'+Date.now()});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  assert.equal(await frame.evaluate(()=>Common.ElixirAI.Settings.isConfigured()),false);assert.equal(calls,0);
  // The generic setup UI requires HTTPS. This existing keyless loopback bridge
  // fixture exercises the preserved native transport/consent contract directly.
  // Actual new setup entry clicks are qualified separately.
  const configure=()=>frame.evaluate(endpoint=>Common.ElixirAI.Settings.save({endpoint,model:'public-local-model',apiKey:''}),endpoint);
  let permission=configure();await modal(env);keys(env,'escape');assert.equal(await permission,false);
  assert.equal(await frame.evaluate(()=>Common.ElixirAI.Settings.isConfigured()),false);assert.equal(calls,0);
  assert.equal((await env.page.evaluate(()=>eoDesktop.aiSettings())).endpoint,undefined);
  console.log('PASS native desktop AI consent dialog / Cancel keeps configuration off / zero network');
  permission=configure();await modal(env);keys(env,'allow');assert.equal(await permission,true);
  await frame.waitForFunction(()=>Common.ElixirAI.Settings.isConfigured());await frame.locator('#elixir[role=tab]').waitFor({state:'visible'});
  assert.equal(calls,0,'Saving consent must not send document data');
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-ai').click();
  await frame.locator('.elixir-ai-actions button[data-act=test]:visible').click();
  await frame.waitForFunction(()=>[...document.querySelectorAll('.elixir-ai-cfg .msg')].some(el=>el.textContent.includes('Connection OK')));
  assert.equal(calls,1);assert.equal(env.requests.filter(req=>/^https?:/.test(req.url)).length,0,'Renderer network policy was widened');
  assert.equal(await frame.evaluate(()=>localStorage.getItem('elixir-ai-settings')),null);
  console.log('PASS explicit Allow enables AI / real Connector SSE via native loopback bridge / renderer HTTP blocked');
  await frame.locator('.elixir-ai-actions button[data-act=clear]:visible').click();
  await frame.waitForFunction(()=>!Common.ElixirAI.Settings.isConfigured());
  assert.equal((await env.page.evaluate(()=>eoDesktop.aiSettings())).endpoint,undefined);
  assert.equal(await frame.locator('#elixir[role=tab]').isVisible(),true);assert.equal(calls,1);
  console.log('PASS clear revokes native AI settings and retains discoverable entrypoints');
 }finally{await stop(env);await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
