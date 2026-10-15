// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const ai=require('../../desktop/ai.cjs');
test('AI endpoints allow HTTPS and literal loopback HTTP only',()=>{
 for(const value of ['https://example.org/v1','http://localhost:11434/v1','http://127.0.0.1:8123/v1','http://[::1]:8123/v1'])assert(ai.endpoint(value));
 for(const value of ['http://example.org/v1','http://192.0.2.10','file:///tmp','https://u:p@example.org','https://example.org?a=b','https://example.org/#hash',' https://example.org','http://localhost.example.org'])assert.throws(()=>ai.endpoint(value),value);
 assert.throws(()=>ai.configuration({endpoint:'http://localhost',model:''}),/model/);
});
test('native AI sends only approved model requests and never follows redirects',async()=>{
 const requests=[],server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{requests.push({url:req.url,body});res.writeHead(302,{Location:'http://unapproved.invalid/'});res.end('redirect');})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const config=ai.configuration({endpoint:'http://localhost:'+server.address().port+'/v1',model:'local-model'}),body=JSON.stringify({model:'local-model',messages:[{role:'user',content:'public probe'}]});
  assert.throws(()=>ai.request({...config,consented:false},body,''),/consent/);assert.equal(requests.length,0);
  assert.throws(()=>ai.request(config,JSON.stringify({model:'other',messages:[]} ),''),/settings changed/);
  const response=await ai.request(config,body,'');assert.equal(response.status,302);assert.equal(requests.length,1);assert.equal(requests[0].url,'/v1/chat/completions');
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('extra parameters cannot replace the approved model or conversation',()=>{
 const config=ai.configuration({endpoint:'http://localhost',model:'approved',extraParams:JSON.stringify({model:'other',messages:[],top_p:0.5})});
 assert.deepEqual(JSON.parse(config.extraParams),{top_p:0.5});
});
test('shared connector drops reserved extra parameters before desktop dispatch',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const path=require('node:path');
 const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
 const file=path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/Core.js');
 let core,body;
 const window={eoDesktopAI:{configured:()=>true,fetch:async(_url,options)=>{body=JSON.parse(options.body);return {ok:false,status:418,text:async()=> 'unit response'}}}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,define:(_deps,factory)=>{core=factory()},performance,console,AbortController,TextDecoder,setTimeout,clearTimeout});
 const messages=[{role:'user',content:'original conversation'}];
 await assert.rejects(core.Connector.chat({settings:{endpoint:'http://localhost',model:'approved',hasKey:true,extraParams:JSON.stringify({model:'other',messages:[],top_p:0.5})},messages}));
 assert.equal(body.model,'approved');assert.deepEqual(body.messages,messages);assert.equal(body.top_p,0.5);
});
