// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const http=require('node:http'),https=require('node:https');
function endpoint(value){
 if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f]/.test(value))throw Error('Invalid AI endpoint');
 let url;try{url=new URL(value)}catch{throw Error('Invalid AI endpoint')}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(local&&url.protocol==='http:')))throw Error('Use HTTPS or a loopback AI endpoint');
 url.pathname=url.pathname.replace(/\/+$/,'');return {url:url.href.replace(/\/+$/,''),local};
}
function configuration(value){
 if(!value||typeof value!=='object')throw Error('Invalid AI settings');
 if(!value.endpoint)return null;
 const selected=endpoint(value.endpoint);
 if(typeof value.model!=='string'||!value.model.trim()||value.model.length>200)throw Error('Invalid AI model');
 if(value.apiKey!==undefined&&(typeof value.apiKey!=='string'||value.apiKey.length>8192||/[\r\n]/.test(value.apiKey)))throw Error('Invalid AI key');
 const config={endpoint:selected.url,model:value.model.trim(),consented:true};
 for(const key of ['extraParams','mode','sampling','verify','earlyStop','maxRounds'])if(value[key]!==undefined)config[key]=value[key];
 if(config.extraParams){if(typeof config.extraParams!=='string'||config.extraParams.length>65536)throw Error('Invalid AI parameters');const parsed=JSON.parse(config.extraParams);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid AI parameters');delete parsed.model;delete parsed.messages;config.extraParams=JSON.stringify(parsed);}
 return config;
}
function request(config,body,key,signal){
 if(!config?.consented)throw Error('AI consent required');
 const selected=endpoint(config.endpoint),url=new URL(selected.url+'/chat/completions');
 if(!body||typeof body!=='string'||Buffer.byteLength(body)>8*1024*1024)throw Error('Invalid AI request size');
 const parsed=JSON.parse(body);if(parsed.model!==config.model||!Array.isArray(parsed.messages))throw Error('AI settings changed');
 // Prevent a loopback hostname from resolving to a remote host.
 if(url.hostname==='localhost')url.hostname='127.0.0.1';
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='http:'?http:https).request(url,{method:'POST',signal,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...(key?{Authorization:'Bearer '+key}:{})}},res=>{
   const chunks=[];let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>16*1024*1024){res.destroy();req.destroy(Error('AI response too large'));return}chunks.push(chunk)});
   res.on('error',()=>reject(Error('AI response interrupted')));
   res.on('end',()=>resolve({status:res.statusCode,type:String(res.headers['content-type']||'application/json'),text:Buffer.concat(chunks).toString('utf8')}));
  });
  req.setTimeout(120000,()=>req.destroy(Error('AI request timed out')));
  req.on('error',()=>reject(Error(signal?.aborted?'AI request cancelled':'AI endpoint unavailable')));req.end(body);
 });
}
module.exports={endpoint,configuration,request};
