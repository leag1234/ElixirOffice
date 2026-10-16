// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute the real handlers with transport/configuration boundaries isolated.
// No remote requests or service processes are started.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {spawnSync} = require('node:child_process');
const DS = path.resolve(process.env.DS_ROOT || '../DocumentServer');
const read = p => fs.readFileSync(path.join(DS,p),'utf8');
const logger = {info(){},debug(){},warn(){},error(){}};
const constants = {NO_ERROR:0,VKEY:-1,VKEY_KEY_EXPIRE:-2,JWT_EXPIRED_CODE:'expired'};
const cfg = {'services.CoAuthoring.token.inbox.header':'Authorization','services.CoAuthoring.token.inbox.prefix':'Bearer '};
function co(f) {const g=f();return (async()=>{let v;while(true){const r=g.next(v);if(r.done)return r.value;v=await r.value;}})();}
function Context(){this.logger=logger;}
Object.assign(Context.prototype,{initFromRequest(){},async initTenantCache(){},setDocId(){},setUserId(){},getCfg(k,f){return k in cfg?cfg[k]:f;}});
const response = () => ({statusCode:200,headers:{},status(n){this.statusCode=n;return this;},send(v){this.body=v;return this;},sendStatus(n){this.statusCode=n;},json(v){this.body=v;},set(v){Object.assign(this.headers,v);},setHeader(k,v){this.headers[k]=v;},type(v){this.headers['Content-Type']=v;return this;}});
function requestParams(enabled, jwtResult) {
 const source=read('server/DocService/sources/DocsCoServer.js');
 const code=source.slice(source.indexOf('function getRequestParams('),source.indexOf('\nfunction getLicenseNowUtc'));
 return vm.runInNewContext(code+'\ngetRequestParams',{co,Buffer,constants,cfgTokenEnableRequestInbox:enabled,cfgTokenRequiredParams:false,cfgTokenInboxHeader:'Authorization',cfgTokenInboxPrefix:'Bearer ',commonDefines:{c_oAscSecretType:{Inbox:1}},checkJwt:async()=>jwtResult,checkJwtHeader:async()=>jwtResult,utils:{isEmptyObject:o=>!o||Object.keys(o).length===0}});
}
for(const tokenMode of ['body','header']) test('JWT disabled rejects invalid supplied '+tokenMode+' token',async()=>{
 const req={query:{},get:n=>tokenMode==='header'?'Bearer invalid':undefined};
 if(tokenMode==='body') req.body=Buffer.from(JSON.stringify({token:'invalid',url:'http://127.0.0.1/private'}));
 const r=await requestParams(false,{code:'invalid'})(new Context(),req);
 assert.equal(r.code,constants.VKEY);assert.equal(r.isDecoded,false);
});
test('JWT disabled keeps unsigned requests untrusted; validates supplied good token',async()=>{
 const req={query:{url:'https://example.invalid/file'},get:()=>undefined};
 const r=await requestParams(false,null)(new Context(),req);
 assert.equal(r.code,0);assert.equal(r.isDecoded,false);
 req.body=Buffer.from(JSON.stringify({token:'signed'}));
 const signed=await requestParams(false,{decoded:{url:'https://example.invalid/signed'}})(new Context(),req);
 assert.equal(signed.isDecoded,true);assert.equal(signed.params.url,'https://example.invalid/signed');
});
test('JWT enabled still requires token and preserves expiry',async()=>{
 const req={query:{},get:()=>undefined};
 assert.equal((await requestParams(true,null)(new Context(),req)).code,constants.VKEY);
 assert.equal((await requestParams(true,{code:'expired'})(new Context(),req)).code,constants.VKEY_KEY_EXPIRE);
});
async function download(params,isDecoded=false,getParams,options={}) {
 const source=read('server/DocService/sources/canvasservice.js');
 const code=source.slice(source.indexOf('exports.downloadFile ='),source.indexOf('exports.saveFromChanges ='));
 const calls=[];const exports={};let outboxIssued=0;
 const wopiSource=read('server/DocService/sources/wopiClient.js');
 const isWopiJwtToken=vm.runInNewContext(wopiSource.slice(wopiSource.indexOf('function isWopiJwtToken('),wopiSource.indexOf('function setIsShutdown('))+'\nisWopiJwtToken');
 const wopiUtilsSource=read('server/DocService/sources/wopiUtils.js');
 const getWopiFileUrl=vm.runInNewContext(wopiUtilsSource.slice(wopiUtilsSource.indexOf('async function getWopiFileUrl('),wopiUtilsSource.indexOf('\nmodule.exports ='))+'\ngetWopiFileUrl',{cfgMaxDownloadBytes:1024});
 const context={exports,co,commonDefines:{c_oAscSecretType:{Outbox:1}},tenantManager:{getTenantSecret:async()=>"fixture-secret"},operationContext:{Context},clientStatsD:null,cfgTokenEnableBrowser:false,cfgDownloadMaxBytes:1024,cfgDownloadTimeout:100,cfgDownloadFileAllowExt:['docx'],cfgNewFileTemplate:'/unused',docsCoServer:{getRequestParams:getParams||(async()=>({code:0,params,isDecoded,tokenParams:isDecoded?params:undefined}))},constants,utils:{canIncludeOutboxAuthorization:()=>!!options.outboxAllowed,fillJwtForRequest:()=>{outboxIssued++;return "fixture-outbox-signature";},checkHostFilter:function*(){return 0;},downloadUrlPromise:async(...a)=>{calls.push({url:a[1],authorization:a[4],trusted:a[5]});return {response:{headers:{}},stream:{destroy(){}}};}},urlModule:require('node:url'),wopiClient:{isWopiJwtToken,checkIpFilter:async()=>0},wopiUtils:{getWopiFileUrl},pipeline:async()=>{},pathModule:path};
 vm.runInNewContext(code,context);
 const res=response();await exports.downloadFile({params:{docid:'test'},body:Buffer.from(JSON.stringify(params)),query:{},get:()=>undefined},res);
 return {calls,res,outboxIssued};
}
for(const params of [{changesUrl:'http://127.0.0.1/file'},{document:{fileType:'docx',url:'http://127.0.0.1/file'}},{url:'http://127.0.0.1/file',fileType:'docx'},{url:'http://127.0.0.1/file'}])
 test('unsigned download retains network filter: '+Object.keys(params).join(','),async()=>{const r=await download(params);assert.equal(r.calls.length,1);assert.equal(r.calls[0].trusted,false);});
test('signed download keeps trusted policy',async()=>{assert.equal((await download({url:'https://example.invalid/file',fileType:'docx'},true)).calls[0].trusted,true);});
test('WOPI trusted download wins over attacker-controlled generic URL',async()=>{
 const r=await download({url:'http://127.0.0.1/private',fileType:'docx',fileInfo:{Size:100,FileUrl:'https://wopi.example.invalid/file'}},true);
 assert.equal(r.calls[0].url,'https://wopi.example.invalid/file');
});
test('GET download route removed while POST remains',()=>{
 const s=read('server/DocService/sources/server.js');
 assert.doesNotMatch(s,/app\.get\('\/downloadfile\/:docid'/);
 assert.match(s,/app\.post\('\/downloadfile\/:docid', rawFileParser, canvasService\.downloadFile\)/);
});
test('baseurl reflection is served as plain text',()=>{
 let handler;const app={get(route,fn){assert.equal(route,'/baseurl');handler=fn;}};
 const s=read('server/DocService/sources/server.js'),start=s.indexOf("  app.get('/baseurl'");
 vm.runInNewContext(s.slice(start,s.indexOf("\n  app.get('/robots.txt'",start)),{app,operationContext:{Context},utils:{getBaseUrlByRequest:()=>'<img src=x onerror=alert(1)>'}});
 const r=response();handler({},r);assert.match(r.headers['Content-Type']||'',/^text\/plain/);assert.match(r.body,/<img/);
});
function ai(jwt) {
 const calls=[];const exports={};let outboxIssued=0;const module={exports};
 const settings={providers:{safe:{url:'https://provider.example',key:'test-key'}}};
 const values={'aiSettings':settings,'aiSettings.allowedCorsOrigins':[],'aiSettings.proxy':'','aiSettings.timeout':100};
 const mocks={'config':{get:k=>values[k]},'./../../../Common/sources/utils':{httpRequest:async(...a)=>{calls.push(a);return {response:{headers:{}},stream:{}};}},'./../../../Common/sources/operationContext':{Context},'./../../../Common/sources/commondefines':{c_oAscSecretType:{Session:1}},'./../../../Common/sources/tenantManager':{},'./../DocsCoServer':{checkJwtHeader:async()=>jwt},'./../../../Common/sources/statsdclient':{getClient:()=>null},'stream/promises':{pipeline:async()=>{}}};
 const requireMock=n=>n in mocks?mocks[n]:require(n);
 vm.runInNewContext(read('server/DocService/sources/ai/aiProxyHandler.js'),{require:requireMock,module,exports,URL,Date,JSON});
 return {calls,run:async target=>{const r=response();await module.exports.proxyRequest({headers:{},get:()=>undefined,body:JSON.stringify({target,method:'POST',headers:{},data:'{}'})},r);return r;}};
}
test('AI rejects absent decoded JWT before transport',async()=>{for(const jwt of [null,{}, {description:'invalid'}]){const h=ai(jwt);assert.equal((await h.run('https://provider.example/v1')).statusCode,403);assert.equal(h.calls.length,0);}});
for(const target of ['https://provider.example@attacker.invalid/v1','https://provider.example.attacker.invalid/v1','https://provider.example:8443/v1','not a URL'])
 test('AI rejects mismatched origin '+target,async()=>{const h=ai({decoded:{}});assert.equal((await h.run(target)).statusCode,403);assert.equal(h.calls.length,0);});
test('AI accepts exact provider origin and sets configured credential',async()=>{const h=ai({decoded:{}});assert.equal((await h.run('https://provider.example/v1')).statusCode,200);assert.equal(h.calls.length,1);assert.equal(h.calls[0][3].Authorization,'Bearer test-key');});
test('flush-cache rejects invalid HASH before privileged file writes',()=>{
 const s=read('document-server-package/common/documentserver/bin/documentserver-flush-cache.sh.m4');
 const boundary=s.indexOf('# Save the hash');assert(boundary>0,'Validation boundary must precede privileged writes');
 const prefix=s.slice(0,boundary);
 for(const value of ['x"; bad; #','../escape','a/b','x&y','x\\y','x\ny','white space','é']) {
   const r=spawnSync('/bin/sh',['-c',prefix,'flush-test','--hash',value],{encoding:'utf8'});
   assert.notEqual(r.status,0,'accepted hostile HASH');
 }
 for(const value of ['a1B2','0123456789abcdef']) assert.equal(spawnSync('/bin/sh',['-c',prefix,'flush-test','--hash',value]).status,0);
});

test('PDF probe uses POST for server route and GET only for direct URL',()=>{
 const requests=[];
 class XHR{overrideMimeType(){} setRequestHeader(){} open(method,url){this.method=method;this.url=url;} send(body){requests.push({method:this.method,url:this.url,body});}}
 const window={addEventListener(){},location:{origin:'https://editor.invalid'}};
 const code=read('web-apps/apps/common/checkExtendedPDF.js');
 const ctx={XMLHttpRequest:XHR,window,document:{},JSON};
 vm.runInNewContext(code,ctx);
 ctx.checkExtendedPDF(null,'document-key','https://file.invalid/x','signed',()=>{});
 ctx.checkExtendedPDF('https://direct.invalid/x','document-key',null,null,()=>{});
 assert.equal(requests[0].method,'POST');assert.match(requests[0].url,/\/downloadfile\/document-key$/);
 assert.equal(JSON.parse(requests[0].body).token,'signed');
 assert.equal(requests[1].method,'GET');assert.equal(requests[1].url,'https://direct.invalid/x');
});

test('HTTP baseurl hostile forwarded prefix remains plain text',async()=>{
 const express=require(process.env.EXPRESS_MODULE||'express'),app=express();
 const utilsSource=read('server/Common/sources/utils.js');
 const functions=utilsSource.slice(utilsSource.indexOf('function getDomain('),utilsSource.indexOf('exports.getBaseUrlByConnection ='));
 const getBaseUrlByRequest=vm.runInNewContext(functions+'\ngetBaseUrlByRequest',{constants:{ALLOWED_PROTO:/^https?$/}});
 const s=read('server/DocService/sources/server.js'),start=s.indexOf("  app.get('/baseurl'");
 vm.runInNewContext(s.slice(start,s.indexOf("\n  app.get('/robots.txt'",start)),{app,operationContext:{Context},utils:{getBaseUrlByRequest}});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
 const payload='/<svg/onload=alert(1)>',url='http://127.0.0.1:'+server.address().port+'/baseurl';
 const r=await fetch(url,{headers:{'X-Forwarded-Host':'editor.example.invalid','X-Forwarded-Prefix':payload}});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/plain;/);
 assert.equal(await r.text(),'http://editor.example.invalid'+payload);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

for(const size of [0,1]) test('JWT disabled rejects unsigned WOPI shape with size '+size,async()=>{
 const params={fileInfo:{Size:size,BaseFileName:'new.docx',FileUrl:'http://127.0.0.1/private'}};
 const r=await download(params,false,requestParams(false,null));
 assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);
});
test('JWT disabled accepts verified WOPI token through actual parameter decoder',async()=>{
 const signed={fileInfo:{Size:1,FileUrl:'https://wopi.example.invalid/file'}};
 const r=await download({token:'signed'},false,requestParams(false,{decoded:signed}));
 assert.equal(r.res.statusCode,200);assert.equal(r.calls.length,1);assert.equal(r.calls[0].url,signed.fileInfo.FileUrl);assert.equal(r.calls[0].trusted,true);
});
test('JWT disabled rejects invalid supplied WOPI token before transport',async()=>{
 const r=await download({token:'invalid',fileInfo:{Size:1,FileUrl:'http://127.0.0.1/private'}},false,requestParams(false,{description:'invalid'}));
 assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);
});

test('valid unrelated JWT does not authenticate body WOPI fields',async()=>{
 const r=await download({token:'signed',fileInfo:{Size:1,FileUrl:'http://127.0.0.1/private'}},false,requestParams(false,{decoded:{user:{id:'unrelated'}}}));
 assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);
});
for(const field of ['changesUrl','document','url','fallback']) test('valid unrelated JWT does not authenticate body URL '+field,async()=>{
 const url='http://127.0.0.1/private';
 const params={token:'signed',...(field==='document'?{document:{url,fileType:'docx'}}:field==='changesUrl'?{changesUrl:url}:field==='url'?{url,fileType:'docx'}:{url})};
 const r=await download(params,false,requestParams(false,{decoded:{user:{id:'unrelated'}}}));
 assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);
});
for(const level of ['root','payload','query']) test('signed WOPI '+level+' fields override unsigned body fields',async()=>{
 const signed={fileInfo:{Size:1,FileUrl:'https://wopi.example.invalid/file'},userAuth:{wopiSrc:'https://wopi.example.invalid'}};
 const claims=level==='root'?signed:{[level]:signed};
 const r=await download({token:'signed',fileInfo:{Size:1,FileUrl:'http://127.0.0.1/private'}},false,requestParams(false,{decoded:claims}));
 assert.equal(r.res.statusCode,200);assert.equal(r.calls.length,1);assert.equal(r.calls[0].url,signed.fileInfo.FileUrl);assert.equal(r.calls[0].trusted,true);
});
for(const level of ['root','payload','query']) test('signed download '+level+' URL remains trusted',async()=>{
 const signed={url:'https://example.invalid/file',fileType:'docx'},claims=level==='root'?signed:{[level]:signed};
 const r=await download({token:'signed',url:'http://127.0.0.1/private',fileType:'docx'},false,requestParams(false,{decoded:claims}));
 assert.equal(r.calls.length,1);assert.equal(r.calls[0].url,signed.url);assert.equal(r.calls[0].trusted,true);
});

test('unsigned download never receives server-signed outbox authorization',async()=>{
 const r=await download({url:'https://allowed.example.invalid/file',fileType:'docx'},false,undefined,{outboxAllowed:true});
 assert.equal(r.res.statusCode,200);assert.equal(r.calls.length,1);assert.equal(r.calls[0].trusted,false);
 assert.equal(r.outboxIssued,0);assert.equal(r.calls[0].authorization,undefined);
});
test('verified download preserves configured outbox authorization',async()=>{
 const r=await download({url:'https://allowed.example.invalid/file',fileType:'docx'},true,undefined,{outboxAllowed:true});
 assert.equal(r.res.statusCode,200);assert.equal(r.calls.length,1);assert.equal(r.calls[0].trusted,true);
 assert.equal(r.outboxIssued,1);assert.equal(r.calls[0].authorization,'fixture-outbox-signature');
});
test('cache HASH validation runs with C locale even under inherited UTF8 locale',()=>{
 const s=read('document-server-package/common/documentserver/bin/documentserver-flush-cache.sh.m4');
 const boundary=s.indexOf('# Save the hash');assert(boundary>0);
 const r=spawnSync('/bin/sh',['-c',s.slice(0,boundary)+'\nprintf "%s" "$LC_ALL"','flush-test','--hash','Ascii123'],{encoding:'utf8',env:{...process.env,LC_ALL:'C.UTF-8'}});
 assert.equal(r.status,0);assert.equal(r.stdout,'C');
});
