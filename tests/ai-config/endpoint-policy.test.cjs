// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const upstream=process.env.EO_UPSTREAM;if(!upstream)throw Error('EO_UPSTREAM is required');
const script=path.join(upstream,'build/scripts/standalone/elixir-ai-conf.sh');
function core(){
 const store=new Map(),requests=[];let ai;
 const fetch=async(url,options)=>{requests.push({url,options});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({choices:[{message:{content:'public reply'},finish_reason:'stop'}]})}};
 const window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/Core.js'),'utf8'),{window,define:(_deps,f)=>{ai=f()},URL,fetch,performance,AbortController,TextDecoder,setTimeout,clearTimeout,console});
 return{ai,store,requests};
}
const allowed=['http://LOCALHOST:11434/v1','http://localhost:00080/v1','http://[::1]/v1','https://[2001:db8::1]:8443/v1','https://api.example.org/v1','https://192.0.2.10:8443/v1','http://localhost:11434/v1','http://127.0.0.1:11434/v1','http://[::1]:11434/v1'];
const denied=['https://@example.org/v1','https://example.org:/v1','http://localhost.localdomain/v1','http://127.0.0.2/v1','https://[:::]/v1','https://example.org:0/v1','http://localhost:0/v1','http://api.example.org/v1','http://192.0.2.10:11434/v1','http://100.64.1.2:11434/v1','http://localhost.example.org/v1','http://127.0.0.1.example.org/v1','http://127.1/v1','http://2130706433/v1','http://0177.0.0.1/v1','http://%6cocalhost/v1','http://[0:0:0:0:0:0:0:1]/v1','https://user:pass@example.org/v1','http://localhost@remote.example/v1','//remote.example/v1','http://localhost:65536/v1','http://localhost:notaport/v1','https://example.org/v1?query=value','https://example.org/v1#fragment','https://example.org\\@remote.example/v1'];
for(const endpoint of allowed)test('web settings accept '+endpoint,()=>{const {ai}=core();assert.equal(ai.Settings.isConfigured({endpoint,model:'public-model'}),true)});
for(const endpoint of denied)test('web rejects '+endpoint+' before persistence and transport',async()=>{
 const {ai,store,requests}=core(),settings={endpoint,model:'public-model'};
 assert.equal(ai.Settings.isConfigured(settings),false);
 assert.equal(await ai.Settings.save(settings),false);assert.equal(store.size,0);
 await assert.rejects(ai.Connector.chat({settings,messages:[{role:'user',content:'public probe'}]}));
 assert.equal(requests.length,0);
});
test('only the exact managed same-origin proxy is accepted',()=>{
 const {ai}=core();assert.equal(ai.Settings.isConfigured({managed:true,endpoint:'/elixir-ai/v1',model:'public-model'}),true);
 for(const endpoint of ['//remote.example/v1','/other-proxy','/elixir-ai/v1?next=http://example.org','/elixir-ai/v1/../other'])assert.equal(ai.Settings.isConfigured({managed:true,endpoint,model:'public-model'}),false,endpoint);
 assert.equal(ai.Settings.isConfigured({endpoint:'/elixir-ai/v1',model:'public-model'}),false);
});
test('old insecure browser settings stay off without contacting their endpoint',()=>{
 const {ai,store,requests}=core();store.set('elixir-ai-settings',JSON.stringify({endpoint:'http://remote.example/v1',model:'public-model'}));
 assert.equal(ai.Settings.isConfigured(),false);assert.equal(requests.length,0);
});
test('allowed connector requests refuse redirects and preserve existing streaming options',async()=>{
 const {ai,requests}=core();await ai.Connector.chat({settings:{endpoint:'https://api.example.org/v1',model:'public-model'},messages:[{role:'user',content:'public probe'}]});
 assert.equal(requests.length,1);assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.credentials,'omit');
});
for(const endpoint of [...allowed,...denied])test('standalone generator policy '+endpoint,()=>{
 const result=cp.spawnSync('/bin/sh',[script],{encoding:'utf8',env:{PATH:process.env.PATH,ELIXIR_AI_BASE_URL:endpoint,ELIXIR_AI_MODEL:'public-model'}});
 assert.equal(result.status,0);
 const enabled=allowed.includes(endpoint);
 assert.equal(result.stdout.includes('"enabled":true'),enabled);
 assert.equal(result.stdout.includes('"enabled":false'),!enabled);
 if(!enabled){assert(!result.stdout.includes('proxy_pass'));assert(result.stderr.trim());assert(!result.stderr.includes(endpoint));}
 if(endpoint==='http://[::1]:11434/v1')assert(result.stdout.includes('"host":"::1"'));
});
test('endpoint guidance covers exactly the45 interface locales without changing general language fallback',()=>{
 const {ai}=core(),window={Common:{ElixirAI:ai}};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/Strings.js'),'utf8'),{window,define:(_deps,f)=>f()});
 const locales=Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname,'../../tools/desktop/i18n-extra.json'),'utf8')));
 assert.deepEqual(Object.keys(ai.endpointPolicyMessages).sort(),locales.sort());
 for(const language of locales){const text=ai.endpointPolicyMessage(language);assert.equal(text,ai.endpointPolicyMessages[language]);for(const name of ['HTTPS','HTTP','localhost','127.0.0.1','[::1]'])assert(text.includes(name),language);}
 assert.match(ai.endpointPolicyMessage('fr-FR'),/services distants/);assert.equal(ai.endpointPolicyMessage('unknown'),ai.endpointPolicyMessages.en);
});
test('administrator connectivity check rejects remote HTTP before invoking curl',()=>{
 const os=require('node:os'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ai-policy-check-'));
 try{
  const marker=path.join(directory,'called');
  fs.writeFileSync(path.join(directory,'curl'),'#!/bin/sh\n: > "$EO_POLICY_CURL_MARKER"\nprintf 200\n',{mode:0o700});
  for(const endpoint of ['http://192.0.2.10:11434/v1','http://100.64.1.2:11434/v1','http://localhost.example.org/v1']){
   fs.rmSync(marker,{force:true});
   const result=cp.spawnSync('/bin/bash',[path.join(__dirname,'../../tools/ai-proxy/check.sh'),'http://127.0.0.1:1'],{encoding:'utf8',env:{PATH:directory+':'+process.env.PATH,ELIXIR_AI_ENV:'/dev/null',ELIXIR_AI_BASE_URL:endpoint,ELIXIR_AI_MODEL:'public-model',EO_POLICY_CURL_MARKER:marker}});
   assert.equal(result.status,1);assert.equal(fs.existsSync(marker),false,endpoint);assert.match(result.stdout+result.stderr,/HTTPS/);
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('historical configuration harness exposes a working private HTTPS mock',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'config.mjs'),'utf8'),start=source.indexOf('// ---- mock OpenAI-compatible server'),end=source.indexOf('\nconst install =',start);
 assert(start>=0&&end>start);
 const context={http:require('node:http'),https:require('node:https'),fs,os:require('node:os'),path,execFileSync:cp.execFileSync,net:require('node:net'),MOCK_HOST:'127.0.0.1',PORT:0,TLS_PORT:0};
 const state=await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'\nreturn {mock,tlsMock,tlsDirectory,calls};})()',context);
 try{
  const native=require('../../desktop/ai.cjs'),count=state.calls.length;
  await assert.rejects(native.request({endpoint:'https://127.0.0.1:'+state.tlsMock.address().port+'/v1',model:'public-model',consented:true},JSON.stringify({model:'public-model',messages:[{role:'user',content:'public TLS probe'}]}),''),/AI endpoint unavailable/);
  assert.equal(state.calls.length,count,'A rejected certificate must stop before document data reaches the provider');
  for(const [server,transport,tls] of [[state.mock,context.http,false],[state.tlsMock,context.https,true]]){
   const body=JSON.stringify({model:'public-model',messages:[{role:'user',content:'public probe'}]});
   const result=await new Promise((resolve,reject)=>{
    const request=transport.request({hostname:'127.0.0.1',port:server.address().port,path:'/v1/chat/completions',method:'POST',...(tls?{rejectUnauthorized:false}:{}),headers:{'Content-Type':'application/json'}},response=>{let text='';response.on('data',b=>text+=b);response.on('end',()=>resolve(JSON.parse(text)));});
    request.on('error',reject);request.end(body);
   });
   assert.equal(result.choices[0].message.content,'ok');assert.equal(state.calls.at(-1).tls,tls);
  }
  assert.equal(fs.statSync(state.tlsDirectory).mode&0o777,0o700);
 }finally{
  await Promise.all([state.mock,state.tlsMock].map(server=>new Promise(resolve=>server.close(resolve))));
  fs.rmSync(state.tlsDirectory,{recursive:true,force:true});
 }
});
test('stored remote HTTP is refused by Connector with zero provider requests',async()=>{
 const {ai,store,requests}=core();store.set('elixir-ai-settings',JSON.stringify({endpoint:'http://remote.example/v1',model:'public-model'}));
 await assert.rejects(ai.Connector.chat({settings:ai.Settings.get(),messages:[{role:'user',content:'public probe'}]}));assert.equal(requests.length,0);
});
test('HTTPS generator enables certificate authentication with default or validated private CA',()=>{
 const os=require('node:os'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ai-ca-'));
 try{
  const candidates=['/etc/ssl/certs/ca-certificates.crt','/etc/pki/tls/certs/ca-bundle.crt','/etc/ssl/ca-bundle.pem','/etc/ssl/cert.pem'],system=candidates.find(p=>fs.existsSync(p));assert(system,'Test host needs a public system CA bundle');
  const run=extra=>cp.spawnSync('/bin/sh',[script],{encoding:'utf8',env:{PATH:process.env.PATH,ELIXIR_AI_BASE_URL:'https://provider.example/v1',ELIXIR_AI_MODEL:'public-model',...extra}});
  const defaults=run({});assert.match(defaults.stdout,/proxy_ssl_verify on;/);assert(defaults.stdout.includes('proxy_ssl_trusted_certificate '+system+';'));assert.match(defaults.stdout,/proxy_ssl_verify_depth 3;/);assert.match(defaults.stdout,/proxy_ssl_server_name on;/);
  const privateCA=path.join(directory,'private-ca.pem');fs.copyFileSync(system,privateCA);
  const selected=run({EO_AI_CA_FILE:privateCA});assert(selected.stdout.includes('proxy_ssl_trusted_certificate '+privateCA+';'));assert(!selected.stdout.match(/return 200[^\n]*private-ca/));
  const bad=path.join(directory,'invalid.pem');fs.writeFileSync(bad,'PUBLIC INVALID CERTIFICATE FIXTURE');
  for(const value of [path.join(directory,'missing.pem'),bad,directory,path.join(directory,'bad;config.pem'),privateCA+'\ninvalid']){
   const result=run({EO_AI_CA_FILE:value});assert(result.stdout.includes('"enabled":false'));assert(!result.stdout.includes('proxy_pass'));assert.match(result.stderr,/CA/);assert(!result.stderr.includes(value));
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('native HTTPS explicitly keeps certificate verification on',async()=>{
 const filename=path.join(__dirname,'../../desktop/ai.cjs'),probe=Error('Probe stopped before network');let implementation;
 const module={exports:{}},context={module,exports:module.exports,URL,Buffer,require:name=>name==='node:https'?{request:(_url,options)=>{assert.equal(options.rejectUnauthorized,true);throw probe}}:require(name)};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),context);implementation=module.exports;
 await assert.rejects(implementation.request({endpoint:'https://provider.example/v1',model:'public-model',consented:true},JSON.stringify({model:'public-model',messages:[]}),''),error=>error===probe);
 for(const source of [filename,path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/Core.js')])assert.doesNotMatch(fs.readFileSync(source,'utf8'),/rejectUnauthorized\s*:\s*false/);
});
test('installer forwards the container CA path through a private temporary file and removes it',()=>{
 const os=require('node:os'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ai-install-'));
 try{
  const marker=path.join(directory,'receipt.json'),stub=path.join(directory,'docker');
  fs.writeFileSync(stub,'#!'+process.execPath+'\nconst fs=require("node:fs");const args=process.argv.slice(2),index=args.indexOf("--env-file");if(index>=0){const file=args[index+1],ca=fs.readFileSync(file,"utf8").split("\\n").find(l=>l.startsWith("EO_AI_CA_FILE="));fs.writeFileSync(process.env.EO_INSTALL_RECEIPT,JSON.stringify({file,mode:fs.statSync(file).mode&511,ca}));}\n',{mode:0o700});
  const result=cp.spawnSync('/bin/bash',[path.join(__dirname,'../../tools/ai-proxy/install.sh'),'eo-owned-unit'],{encoding:'utf8',env:{PATH:directory+':'+process.env.PATH,TMPDIR:directory,ELIXIR_AI_ENV:'/dev/null',ELIXIR_AI_BASE_URL:'https://provider.example/v1',ELIXIR_AI_MODEL:'public-model',EO_AI_CA_FILE:'/inside/public-ca.pem',EO_INSTALL_RECEIPT:marker}});
  assert.equal(result.status,0);const receipt=JSON.parse(fs.readFileSync(marker,'utf8'));assert.equal(receipt.mode,0o600);assert.equal(receipt.ca,'EO_AI_CA_FILE=/inside/public-ca.pem');assert.equal(fs.existsSync(receipt.file),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('administrator probe avoids the Bash4-only lowercase expansion',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../tools/ai-proxy/check.sh'),'utf8');assert.doesNotMatch(source,/\$\{[^}]*,,\}/);assert.match(source,/tr '\[:upper:\]' '\[:lower:\]'/);
});
