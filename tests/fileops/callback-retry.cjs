// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Run inside an owned DocumentServer example environment, with its normal config.
// Tokens are generated and consumed in this process and never printed.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{createRequire}=require('node:module');
const example=process.env.EO_EXAMPLE_ROOT,fixture=process.env.EO_CALLBACK_FIXTURE;
assert(example&&fixture,'Set EO_EXAMPLE_ROOT and EO_CALLBACK_FIXTURE to owned test paths');
const requireExample=createRequire(path.join(example,'app.js')),config=requireExample('config'),jwt=requireExample('jsonwebtoken');
const app=requireExample('./app'),server=app.listen(0,'127.0.0.1');
const input=fs.readFileSync(fixture),marker='PUBLIC-CONVERTED-CALLBACK';
let started,sourceStarted=new Promise(resolve=>started=resolve),release,gate=new Promise(resolve=>release=resolve);
const source=http.createServer(async(req,res)=>{
 if(req.url==='/copy.docx'){res.end(input);return}
 if(req.url==='/delayed.rtf'){started();await gate;res.setHeader('Content-Type','application/rtf');res.end('{\\rtf1\\ansi '+marker+'}');return}
 res.writeHead(404);res.end('Missing public test source');
}).listen(0,'127.0.0.1');
(async()=>{
 await Promise.all([new Promise(resolve=>server.on('listening',resolve)),new Promise(resolve=>source.on('listening',resolve))]);
 const base='http://127.0.0.1:'+server.address().port,download='http://127.0.0.1:'+source.address().port;
 let cookie='';
 async function request(route,init={}){
  const response=await fetch(base+route,{...init,headers:{Cookie:cookie,...init.headers}});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  return response;
 }
 async function open(userid){
  const form=new FormData();form.set('uploadedFile',new Blob([input]),'Public-Callback-'+Date.now()+'.docx');
  const upload=await(await request('/upload',{method:'POST',body:form})).json();assert(upload.filename);
  const html=await(await request('/editor?fileName='+encodeURIComponent(upload.filename)+'&lang=en'+(userid?'&userid='+userid:''))).text();
  const key=html.match(/"key":\s*"([^"]+)"/)[1],callback=JSON.parse(html.match(/"callbackUrl":\s*("(?:\\.|[^"])*")/)[1]),u=new URL(callback);
  return{name:upload.filename,key,track:'/track'+u.search,html};
 }
 async function track(document,body){
  const settings=config.get('server.token'),payload={key:document.key,...body};
  const headers={'Content-Type':'application/json'};
  if(settings.enable&&settings.useforrequest)headers[settings.authorizationHeader]=settings.authorizationHeaderPrefix+jwt.sign({payload},settings.secret);
  return(await request(document.track,{method:'POST',headers,body:JSON.stringify(payload)})).json();
 }
 async function rename(document,name=document.name){
  return request('/rename',{method:'POST',headers:{'Content-Type':'application/json','X-Elixir':'1'},body:JSON.stringify({dockey:document.key,newfilename:name})});
 }
 const retry=await open();
 assert.equal((await track(retry,{status:2,filetype:'docx',url:download+'/missing'})).error,1);
 const retained=await rename(retry);assert.equal(retained.status,200,await retained.text());
 assert.equal((await track(retry,{status:2,filetype:'docx',url:download+'/copy.docx'})).error,0);
 assert.deepEqual(Buffer.from(await(await request('/download?fileName='+encodeURIComponent(retry.name))).arrayBuffer()),input);
 assert.equal((await rename(retry,'Ended')).status,403);
 console.log('PASS failed final-save download retains key; successful retry saves and closes it');
 const converted=await open();
 const saving=track(converted,{status:2,filetype:'rtf',url:download+'/delayed.rtf'});
 await Promise.race([sourceStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Converter did not fetch public source')),30000))]);
 let renamed=false;const concurrent=rename(converted,'During conversion').then(response=>{renamed=true;return response});
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(renamed,false,'Rename escaped the pending conversion lock');
 release();assert.equal((await saving).error,0);assert.equal((await concurrent).status,403);
 const output=Buffer.from(await(await request('/download?fileName='+encodeURIComponent(converted.name))).arrayBuffer());
 assert(output.subarray(0,2).equals(Buffer.from('PK')));
 const cp=require('node:child_process'),text=cp.execFileSync('python3',['-c',"import sys,io,zipfile;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(z.read('word/document.xml').decode())"],{input:output,encoding:'utf8'});
 assert(text.includes(marker));
 console.log('PASS real delayed conversion keeps callback/rename lock until stored DOCX is complete');
 const restricted=await open('uid-3');
 assert(restricted.html.includes('"canRename":false')&&restricted.html.includes('"canCopy":false'),'Legacy sample permissions were advertised incorrectly');
 assert.equal((await rename(restricted,'Denied')).status,403);
 const denied=await request('/elixir/storage/copy',{method:'POST',headers:{'Content-Type':'application/json','X-Elixir':'1'},body:JSON.stringify({key:restricted.key,name:'Denied.docx',url:download+'/copy.docx'})});
 assert.equal(denied.status,403);
 console.log('PASS restricted sample user keeps Rename/copy disabled and backend403');

})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{release();server.closeAllConnections();source.closeAllConnections();server.close();source.close()});
