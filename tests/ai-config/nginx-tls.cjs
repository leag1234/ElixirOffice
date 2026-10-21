// SPDX-License-Identifier: AGPL-3.0-only
// Uses only an already-installed image, isolated nginx, random loopback ports and public fixtures.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),https=require('node:https'),net=require('node:net'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const upstream=process.env.EO_UPSTREAM,out=process.env.EO_AI_POLICY_OUT,image=process.env.EO_TLS_IMAGE;
 if(!upstream||!out||!/^sha256:[a-f0-9]{64}$/.test(image||''))throw Error('EO_UPSTREAM, EO_AI_POLICY_OUT and an existing EO_TLS_IMAGE digest are required');
 const own=path.resolve(out,'nginx-tls');fs.mkdirSync(own,{recursive:true,mode:0o700});
 const source=fs.readFileSync(path.join(__dirname,'config.mjs'),'utf8'),start=source.indexOf('// ---- mock OpenAI-compatible server'),end=source.indexOf('\nconst install =',start);
 const state=await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'\nreturn {mock,tlsMock,tlsDirectory,tlsCert,calls};})()',{http,https,net,fs,os,path,execFileSync:cp.execFileSync,PORT:0,TLS_PORT:0,MOCK_HOST:'provider.eo.test'});
 const records=[],containers=[];
 try{
  fs.copyFileSync(state.tlsCert,path.join(own,'ca.pem'));fs.chmodSync(path.join(own,'ca.pem'),0o644);
  fs.writeFileSync(path.join(own,'nginx.conf'),'worker_processes 1;\npid /tmp/eo-nginx.pid;\nerror_log /dev/stderr warn;\nevents { worker_connections 64; }\nhttp { access_log off; server { listen 18080; include /tmp/eo-ai.conf; } }\n');
  for(const [name,host,ca,status,delivered] of [['system-reject','provider.eo.test','',502,0],['private-accept','provider.eo.test','/work/ca.pem',200,1],['name-reject','wrong.eo.test','/work/ca.pem',502,0]]){
   const before=state.calls.length,containerName='eo-ai-tls-A-'+Date.now()+'-'+name;
   const id=cp.execFileSync('docker',['run','--detach','--rm','--pull=never','--name',containerName,'--add-host','provider.eo.test:host-gateway','--add-host','wrong.eo.test:host-gateway','-p','127.0.0.1::18080','--env','ELIXIR_AI_BASE_URL=https://'+host+':'+state.tlsMock.address().port+'/v1','--env','ELIXIR_AI_MODEL=public-model','--env','ELIXIR_AI_API_KEY=','--env','OPENAI_API_KEY=','--env','EO_AI_CA_FILE='+ca,'-v',own+':/work:ro','-v',path.join(upstream,'build/scripts/standalone/elixir-ai-conf.sh')+':/eo-generator.sh:ro','--entrypoint','/bin/sh',image,'-c','sh /eo-generator.sh > /tmp/eo-ai.conf && exec nginx -c /work/nginx.conf -g "daemon off;"'],{encoding:'utf8'}).trim();
   assert(/^[a-f0-9]{64}$/.test(id));containers.push(id);
   const address=cp.execFileSync('docker',['port',id,'18080/tcp'],{encoding:'utf8'}).trim();assert(/^127\.0\.0\.1:\d+$/.test(address));
   const base='http://'+address;let ready=false;
   for(let n=0;n<100;n++){try{const response=await fetch(base+'/elixir-ai/config.json');const config=await response.json();assert.equal(config.enabled,true);ready=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}
   assert(ready,'Owned nginx did not become ready: '+name);
   const response=await fetch(base+'/elixir-ai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'public-model',messages:[{role:'user',content:'PUBLIC TLS ACCEPTANCE PROBE'}]})});
   await response.arrayBuffer();assert.equal(response.status,status,name);assert.equal(state.calls.length-before,delivered,name);
   const logs=cp.spawnSync('docker',['logs',id],{encoding:'utf8'});assert.equal(logs.status,0);
   const log=logs.stdout+logs.stderr;
   if(name==='system-reject')assert.match(log,/certificate verify error|self.signed certificate/i);
   if(name==='name-reject')assert.match(log,/certificate does not match|hostname mismatch/i);
   records.push({name,status:response.status,requestsDelivered:state.calls.length-before,certificateOutcome:delivered===1?'trusted-and-matched':name==='system-reject'?'untrusted-certificate-rejected':'hostname-mismatch-rejected'});
   fs.writeFileSync(path.join(own,name+'.log'),log);
   cp.execFileSync('docker',['rm','--force',id],{stdio:'ignore'});containers.splice(containers.indexOf(id),1);
  }
  fs.writeFileSync(path.join(own,'results.json'),JSON.stringify({image,cases:records},null,2)+'\n');console.log(JSON.stringify({image,cases:records},null,2));
 }finally{
  for(const id of containers)try{cp.execFileSync('docker',['rm','--force',id],{stdio:'ignore'})}catch{}
  await Promise.all([state.mock,state.tlsMock].map(server=>new Promise(r=>server.close(r))));
  fs.rmSync(state.tlsDirectory,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
