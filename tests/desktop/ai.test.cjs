// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const ai=require('../../desktop/ai.cjs');
test('AI endpoints allow HTTPS, loopback HTTP and plain HTTP on private networks only',()=>{
 for(const value of ['https://example.org/v1','http://localhost:11434/v1','http://127.0.0.1:8123/v1','http://[::1]:8123/v1'])assert(ai.endpoint(value));
 for(const value of ['http://example.org/v1','file:///tmp','https://u:p@example.org','https://example.org?a=b','https://example.org/#hash',' https://example.org','http://localhost.example.org','http://localhost:0/v1','https://example.org:0/v1','http://127.1/v1','http://2130706433/v1','http://0177.0.0.1/v1','http://%6cocalhost/v1','http://[0:0:0:0:0:0:0:1]/v1'])assert.throws(()=>ai.endpoint(value),value);
 assert.throws(()=>ai.configuration({endpoint:'http://localhost',model:''}),/model/);
});
const privateEndpoints=['http://10.0.0.5:11434/v1','http://10.255.255.255/v1','http://172.16.0.1/v1','http://172.31.255.254:1234/v1','http://10.168.0.22:11434/v1','http://169.254.10.20/v1','http://gemma.lan/v1','http://gemma.lan:11434/v1','http://GEMMA.LAN/v1','http://my-box.local:1234/v1','http://nas.home.arpa/v1','http://a.b.lan/v1','http://[fd12:3456::1]:11434/v1','http://[FD00::1]/v1','http://[fe80::1]/v1'];
const publicEndpoints=['http://172.15.0.1/v1','http://172.32.0.1/v1','http://192.169.0.1/v1','http://11.0.0.1/v1','http://8.8.8.8/v1','http://100.64.1.2:11434/v1','http://example.org/v1','http://lan/v1','http://gemma/v1','http://lan.example.org/v1','http://gemma.lan.example.org/v1','http://localhost.lan.example.org/v1','http://gemma.lan./v1','http://010.0.0.1/v1','http://10.168.00.1/v1','http://10.168.0.256/v1','http://0xc0.168.0.1/v1','http://3232235521/v1','http://192.168.1/v1','http://[2001:db8::1]/v1','http://[::ffff:10.168.0.1]/v1','http://[fe00::1]/v1','http://gemma.lan@evil.example/v1','http://10.168.0.22@evil.example/v1','http://user:pw@10.168.0.22/v1','http://10.168.0.22:0/v1','http://10.168.0.22/v1?x=1','http://10.168.0.22/v1#x','http://%67emma.lan/v1','http://gemma.lan:notaport/v1'];
for(const value of privateEndpoints)test('plain HTTP is allowed and flagged insecure for '+value,()=>{
 const selected=ai.endpoint(value);assert.equal(selected.insecure,true);assert.equal(selected.local,false);assert(selected.url.startsWith('http://'));
 assert(ai.configuration({endpoint:value,model:'m'}));
});
for(const value of publicEndpoints)test('plain HTTP is refused for '+value,()=>assert.throws(()=>ai.endpoint(value),/HTTPS|Invalid AI endpoint/));
test('HTTPS keeps working for private and public hosts and is never flagged insecure',()=>{
 for(const value of ['https://gemma.lan/v1','https://10.168.0.22:8443/v1','https://api.example.org/v1','https://100.64.1.2/v1'])assert.equal(ai.endpoint(value).insecure,false,value);
 assert.equal(ai.endpoint('http://localhost:11434/v1').insecure,false);assert.equal(ai.endpoint('http://localhost:11434/v1').local,true);
});
test('private-address check for resolved names covers loopback, RFC 1918, link-local, ULA and mapped addresses',()=>{
 for(const value of ['127.0.0.1','127.5.5.5','::1','10.1.2.3','172.20.1.1','10.168.4.4','169.254.1.1','fd00::5','fe80::1','::ffff:10.168.0.9'])assert.equal(ai.privateAddress(value),true,value);
 for(const value of ['8.8.8.8','100.64.0.1','172.32.0.1','2001:db8::1','::ffff:8.8.8.8','1.1.1.1'])assert.equal(ai.privateAddress(value),false,value);
});
test('a private-looking name that resolves to a public address is refused before connecting',async()=>{
 const resolve=(host,address)=>new Promise(done=>ai.guardedLookup(host,{},(error,found)=>done({error,found}),(h,o,cb)=>cb(null,address,4)));
 assert.match((await resolve('gemma.lan','8.8.8.8')).error.message,/private/);
 assert.equal((await resolve('gemma.lan','10.168.0.22')).found,'10.168.0.22');
 const all=await new Promise(done=>ai.guardedLookup('gemma.lan',{all:true},(error,found)=>done({error,found}),(h,o,cb)=>cb(null,[{address:'10.168.0.22',family:4},{address:'1.2.3.4',family:4}])));
 assert(all.error);
 const failure=await new Promise(done=>ai.guardedLookup('gemma.lan',{},error=>done(error),(h,o,cb)=>cb(Error('ENOTFOUND'))));assert.match(failure.message,/ENOTFOUND/);
});
test('HTTPS requests trust bundled, operating system and extra authorities with verification enabled',async()=>{
 const seen=[],tlsMock={getCACertificates:type=>({bundled:['BUNDLED-A','SHARED'],system:['SYSTEM-CA','SHARED'],extra:['EXTRA-CA']})[type]};
 const events=require('node:events');
 const transport={request(url,options,callback){
  seen.push({url:url.href,options});
  const req=new events.EventEmitter();req.setTimeout=()=>{};
  req.end=()=>{const res=new events.EventEmitter();res.statusCode=200;res.headers={};callback(res);res.emit('data',Buffer.from('{}'));res.emit('end')};
  return req;
 }};
 const config=ai.configuration({endpoint:'https://gemma.lan/v1',model:'m'}),body=JSON.stringify({model:'m',messages:[]});
 const result=await ai.request(config,body,'',undefined,{transport,tls:tlsMock});
 assert.equal(result.status,200);assert.equal(seen[0].url,'https://gemma.lan/v1/chat/completions');
 assert.equal(seen[0].options.rejectUnauthorized,true);assert.deepEqual(seen[0].options.ca,['BUNDLED-A','SHARED','SYSTEM-CA','EXTRA-CA']);
 assert.equal(seen[0].options.checkServerIdentity,undefined);
 // Without getCACertificates (older runtime) the bundled roots still apply.
 const legacy=ai.authorities({rootCertificates:['ROOT-1']},Date.now()+1e7);assert.deepEqual(legacy,['ROOT-1']);
 // A failing system store does not break the other sources.
 const broken=ai.authorities({getCACertificates:type=>{if(type==='system')throw Error('no store');return type==='bundled'?['B']:[]}},Date.now()+2e7);assert.deepEqual(broken,['B']);
});
test('real operating system store is readable and includes the bundled roots',()=>{
 const list=ai.authorities(require('node:tls'),Date.now()+3e7);assert(list.length>=require('node:tls').rootCertificates.length);
});
test('plain HTTP to a private IP uses no TLS options and names get the lookup guard',async()=>{
 const seen=[],events=require('node:events');
 const transport={request(url,options,callback){seen.push(options);const req=new events.EventEmitter();req.setTimeout=()=>{};req.end=()=>{const res=new events.EventEmitter();res.statusCode=200;res.headers={};callback(res);res.emit('end')};return req}};
 const body=JSON.stringify({model:'m',messages:[]});
 await ai.request(ai.configuration({endpoint:'http://10.168.0.22:11434/v1',model:'m'}),body,'',undefined,{transport});
 await ai.request(ai.configuration({endpoint:'http://gemma.lan/v1',model:'m'}),body,'',undefined,{transport});
 await ai.request(ai.configuration({endpoint:'http://localhost:11434/v1',model:'m'}),body,'',undefined,{transport});
 assert.equal(seen[0].ca,undefined);assert.equal(seen[0].lookup,undefined);assert.equal(typeof seen[1].lookup,'function');assert.equal(seen[2].lookup,undefined);
});
test('certificate failures are reported as an untrusted certificate, other failures as unavailable',async()=>{
 const events=require('node:events'),failing=code=>({request(){const req=new events.EventEmitter();req.setTimeout=()=>{};req.end=()=>setImmediate(()=>req.emit('error',Object.assign(Error('x'),{code})));return req}});
 const config=ai.configuration({endpoint:'https://gemma.lan/v1',model:'m'}),body=JSON.stringify({model:'m',messages:[]});
 for(const code of ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'])await assert.rejects(ai.request(config,body,'',undefined,{transport:failing(code),tls:{}}),/certificate not trusted/);
 await assert.rejects(ai.request(config,body,'',undefined,{transport:failing('ECONNREFUSED'),tls:{}}),/endpoint unavailable/);
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
