// SPDX-License-Identifier: AGPL-3.0-only
// Production AMD modules, real browser form handlers; only a local synthetic provider.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const upstream=process.env.EO_UPSTREAM,out=process.env.EO_AI_POLICY_OUT;if(!upstream||!out)throw Error('EO_UPSTREAM and EO_AI_POLICY_OUT are required');
 const {chromium}=require(process.env.EO_PLAYWRIGHT),modules=['Core','Strings','Icons','View'],calls=[],unexpected=[],errors=[];
 const server=http.createServer(async(req,res)=>{
  const name=/^\/(Core|Strings|Icons|View)\.js$/.exec(req.url);
  if(name){res.setHeader('Content-Type','application/javascript');res.end(await fs.readFile(path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai',name[1]+'.js')));return;}
  if(req.method==='POST'&&req.url.endsWith('/chat/completions')){
   let body='';for await(const chunk of req)body+=chunk;
   const message=JSON.parse(body);assert.equal(message.model,'public-model');calls.push({path:req.url,model:message.model});
   if(req.url.startsWith('/redirect/')){res.writeHead(307,{Location:'http://blocked.invalid/chat/completions'});res.end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'public response'},finish_reason:'stop'}]}));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><div id="form"></div><script>window.define=(_deps,f)=>f();</script>'+modules.map(n=>'<script src="/'+n+'.js"></script>').join(''));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/opt/google/chrome/chrome'});
  const page=await browser.newPage();await page.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();unexpected.push(route.request().url());return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const languages=Object.keys(JSON.parse(await fs.readFile(path.join(__dirname,'../../tools/desktop/i18n-extra.json'),'utf8'))),results=[];
  for(const language of languages){
   await page.evaluate(l=>{localStorage.clear();Common.ElixirAI.setLang(l);Common.ElixirAI.ConfigForm.render(document.querySelector('#form'));},language);
   await page.locator('#elixir-ai-endpoint').fill('http://100.64.1.2:11434/v1');await page.locator('#elixir-ai-model').fill('public-model');
   for(const action of ['save','test']){
    await page.locator('#form [data-act='+action+']').click();
    const result=await page.evaluate(l=>({message:document.querySelector('#form .msg').textContent,expected:Common.ElixirAI.endpointPolicyMessage(l),stored:localStorage.getItem('elixir-ai-settings'),configured:Common.ElixirAI.Settings.isConfigured()}),language);
    assert.equal(result.message,result.expected,language+'/'+action);assert.equal(result.stored,null);assert.equal(result.configured,false);
   }
   results.push({language,saveRejected:true,testRejected:true});
   if(['en','fr'].includes(language))await page.screenshot({path:path.join(out,'endpoint-'+language+'.png')});
  }
  assert.equal(calls.length,0);assert.deepEqual(unexpected,[]);
  await page.evaluate(()=>{Common.ElixirAI.setLang('en');Common.ElixirAI.ConfigForm.render(document.querySelector('#form'));});
  await page.locator('#elixir-ai-endpoint').fill(origin+'/api');await page.locator('#elixir-ai-model').fill('public-model');
  await page.locator('#form [data-act=save]').click();await page.waitForFunction(()=>Common.ElixirAI.Settings.isConfigured());
  await page.locator('#form [data-act=test]').click();await page.waitForFunction(()=>document.querySelector('#form .msg').textContent.startsWith('Connection OK'));
  assert.equal(calls.length,1);
  const redirected=await page.evaluate(async endpoint=>{try{await Common.ElixirAI.Connector.chat({settings:{endpoint,model:'public-model'},messages:[{role:'user',content:'public probe'}]});return false;}catch{return true}},origin+'/redirect');
  assert(redirected);assert.equal(calls.length,2);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  const report={languages:results,loopbackRequest:calls[0],redirectRejected:redirected,unexpected,errors,browser:browser.version()};
  await fs.writeFile(path.join(out,'endpoint-form.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS45locales Save/Test reject remote HTTP; literal-loopback mock succeeds; redirect blocked; zero external requests/errors');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
