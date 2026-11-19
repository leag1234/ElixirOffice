// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const http=require('node:http'),https=require('node:https'),tls=require('node:tls'),dns=require('node:dns');
const LOOPBACK=/^(?:localhost|127\.0\.0\.1|\[::1\])$/i;
// Hosts on the user's own network. Plain HTTP is accepted for them (and the user is warned); public hosts need HTTPS.
function privateHost(host){
 host=String(host).toLowerCase();
 const quad=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
 if(quad){
  const parts=quad.slice(1);if(parts.some(part=>part.length>1&&part[0]==='0'||Number(part)>255))return false;
  const [a,b]=parts.map(Number);
  return a===10||a===172&&b>=16&&b<=31||a===192&&b===168||a===169&&b===254;
 }
 if(host[0]==='[')return /^\[(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]*\]$/.test(host);
 return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:local|lan|home\.arpa)$/.test(host)&&!/^[0-9.]+$/.test(host);
}
function endpoint(value){
 if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f]/.test(value))throw Error('Invalid AI endpoint');
 let url;try{url=new URL(value)}catch{throw Error('Invalid AI endpoint')}
 // Require a literal authority before URL() can normalize numeric or encoded aliases.
 const authority=/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(value);
 const parts=authority&&/^(\[[0-9a-fA-F:.]+\]|[^:\[\]]+)(?::([0-9]+))?$/.exec(authority[1]);
 const local=!!parts&&LOOPBACK.test(parts[1]),lan=!!parts&&!local&&privateHost(parts[1]);
 if(url.username||url.password||url.search||url.hash||url.port==='0'||!(url.protocol==='https:'||((local||lan)&&url.protocol==='http:')))throw Error('Use HTTPS, or plain HTTP only for this computer or a private network');
 url.pathname=url.pathname.replace(/\/+$/,'');
 // insecure: unencrypted traffic to another machine on the local network (the user is warned about it).
 return {url:url.href.replace(/\/+$/,''),local,lan,insecure:url.protocol==='http:'&&lan};
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
// Certificates the AI client trusts: the bundled roots plus the operating system store (and NODE_EXTRA_CA_CERTS),
// so a private certificate authority installed on this computer works. Verification stays on.
let authorityCache=null;
function authorities(tlsModule=tls,now=Date.now()){
 if(authorityCache&&authorityCache.tls===tlsModule&&now-authorityCache.at<60000)return authorityCache.list;
 const list=[];
 for(const type of ['bundled','system','extra']){
  try{if(typeof tlsModule.getCACertificates==='function')list.push(...tlsModule.getCACertificates(type));else if(type==='bundled')list.push(...(tlsModule.rootCertificates||[]))}catch{}
 }
 const unique=[...new Set(list)];
 authorityCache={tls:tlsModule,list:unique,at:now};return unique;
}
function privateAddress(address){
 address=String(address).toLowerCase();
 const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);if(mapped)address=mapped[1];
 if(/^127\./.test(address)||address==='::1')return true;
 if(address.includes(':'))return /^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(address);
 return privateHost(address);
}
// A *.lan or *.local name must really resolve to this computer or a private network before plain HTTP is used.
function guardedLookup(hostname,options,callback,resolver=dns.lookup){
 resolver(hostname,options,(error,address,family)=>{
  if(error)return callback(error);
  const list=Array.isArray(address)?address:[{address,family}];
  if(!list.length||!list.every(item=>privateAddress(item.address)))return callback(Error('AI endpoint name does not resolve to a private address'));
  callback(null,address,family);
 });
}
const certificateErrors=new Set(['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','ERR_TLS_CERT_ALTNAME_INVALID','CERT_UNTRUSTED','HOSTNAME_MISMATCH']);
function request(config,body,key,signal,deps={}){
 if(!config?.consented)throw Error('AI consent required');
 const selected=endpoint(config.endpoint),url=new URL(selected.url+'/chat/completions');
 if(!body||typeof body!=='string'||Buffer.byteLength(body)>8*1024*1024)throw Error('Invalid AI request size');
 const parsed=JSON.parse(body);if(parsed.model!==config.model||!Array.isArray(parsed.messages))throw Error('AI settings changed');
 // Prevent a loopback hostname from resolving to a remote host.
 if(url.hostname==='localhost')url.hostname='127.0.0.1';
 const secure=url.protocol==='https:',transport=deps.transport||(secure?https:http);
 const options={method:'POST',signal,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...(key?{Authorization:'Bearer '+key}:{})}};
 if(secure){options.rejectUnauthorized=true;options.ca=authorities(deps.tls||tls);}
 else if(selected.lan&&!/^(?:\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(url.hostname))options.lookup=(hostname,lookupOptions,callback)=>guardedLookup(hostname,lookupOptions,callback,deps.resolver);
 return new Promise((resolve,reject)=>{
  const req=transport.request(url,options,res=>{
   const chunks=[];let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>16*1024*1024){res.destroy();req.destroy(Error('AI response too large'));return}chunks.push(chunk)});
   res.on('error',()=>reject(Error('AI response interrupted')));
   res.on('end',()=>resolve({status:res.statusCode,type:String(res.headers['content-type']||'application/json'),text:Buffer.concat(chunks).toString('utf8')}));
  });
  req.setTimeout(120000,()=>req.destroy(Error('AI request timed out')));
  req.on('error',error=>reject(Error(signal?.aborted?'AI request cancelled':certificateErrors.has(error?.code)?'AI certificate not trusted':'AI endpoint unavailable')));req.end(body);
 });
}
module.exports={endpoint,configuration,request,privateHost,privateAddress,authorities,guardedLookup};
