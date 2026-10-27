// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const https=require('node:https'),dns=require('node:dns/promises'),net=require('node:net'),crypto=require('node:crypto');
const {parseVersion}=require('./release-notice.cjs'),{createCandidate,readCandidate}=require('./update-candidate.cjs'),{production}=require('./update-policy.cjs');
const HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
const LIMITS=Object.freeze({envelope:16*1024,metadata:128*1024,artifact:2**31,redirects:3,headers:16*1024,metadataDeadline:8000,metadataIdle:2000,artifactDeadline:30*60*1000,artifactIdle:30000});
const HEADERS=Object.freeze({'User-Agent':'ElixirOffice signed updates','Accept':'application/octet-stream','Accept-Encoding':'identity'});
function error(){const e=Error('Update transport refused');e.code='ERR_UPDATE_TRANSPORT';return e;}
function fail(){throw error();}
function isPublicAddress(value){
 const family=net.isIP(value);
 if(family===4){
  const b=value.split('.').map(Number),n=(((b[0]*256+b[1])*256+b[2])*256+b[3]);
  return ![[0,8],[0x0a000000,8],[0x64400000,10],[0x7f000000,8],[0xa9fe0000,16],[0xac100000,12],[0xc0000000,24],[0xc0000200,24],[0xc0586300,24],[0xc0a80000,16],[0xc6120000,15],[0xc6336400,24],[0xcb007100,24],[0xe0000000,3]].some(([base,bits])=>Math.floor(n/2**(32-bits))===Math.floor(base/2**(32-bits)));
 }
 if(family!==6||value.includes('%')||value.includes('.'))return false;
 const halves=value.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves.length===2&&halves[1]?halves[1].split(':'):[];
 const words=[...left,...Array(8-left.length-right.length).fill('0'),...right].map(x=>parseInt(x,16));
 return (words[0]&0xe000)===0x2000&&words[0]!==0x2002&&words[0]<0x3ffe&&!(words[0]===0x2001&&(words[1]<0x200||words[1]===0xdb8));
}
function tag(value){if(typeof value!=='string'||value.length>100||value[0]!=='v'||parseVersion(value.slice(1))?.version!==value.slice(1))fail();return value;}
function initialURL(selectedTag,name){return new URL('https://github.com/leag1234/elixiroffice/releases/download/'+encodeURIComponent(tag(selectedTag))+'/'+encodeURIComponent(name));}
function allowedURL(value,initial){
 let u;try{u=new URL(value,initial);}catch{fail();}
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password||u.hash||u.toString().length>4096)fail();
 if(u.hostname==='github.com'&&(u.pathname!==initial.pathname||u.search))fail();
 return u;
}
function createTransport({policy=production,runtime,request=https.request,lookup=host=>dns.lookup(host,{all:true}),now=Date.now,timers={setTimeout,clearTimeout}}={}){
 const target=Object.freeze({...runtime});if(!policy.capability(target).enabled)fail();
 const operations=new Set();let closed=false;
 function gate(){if(closed||!policy.capability(target).enabled)fail();}
 function operation(deadline,idle,signal){
  gate();let rejected=false,stopReject,totalTimer=null,idleTimer=null;
  const pending=new Promise((_,reject)=>{stopReject=reject;});void pending.catch(()=>{});
  const resources=new Set();
  function stop(){if(rejected)return;rejected=true;for(const r of resources){try{r.destroy();}catch{}}stopReject(error());}
  function live(){gate();if(rejected||signal?.aborted)fail();}
  function touch(){if(idleTimer!==null)timers.clearTimeout(idleTimer);idleTimer=timers.setTimeout(stop,idle);}
  function dispose(){if(totalTimer!==null)timers.clearTimeout(totalTimer);if(idleTimer!==null)timers.clearTimeout(idleTimer);signal?.removeEventListener('abort',stop);operations.delete(op);for(const r of resources){try{r.destroy();}catch{}}}
  const op={redirects:0,stop,live,touch,resources,race:p=>Promise.race([p,pending]),dispose};
  operations.add(op);totalTimer=timers.setTimeout(stop,deadline);signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();return op;
 }
 async function responseFor(url,op){
  op.live();op.touch();const resolved=await op.race(Promise.resolve().then(()=>lookup(url.hostname)));op.live();
  if(!Array.isArray(resolved)||!resolved.length||resolved.length>32)fail();
  const addresses=resolved.map(a=>Object.freeze({address:a?.address,family:a?.family}));
  if(addresses.some(a=>!a||!isPublicAddress(a.address)||net.isIP(a.address)!==a.family))fail();
  const pin=addresses[0];
  return await op.race(new Promise((resolve,reject)=>{
   let req;
   try{
    req=request(url,{method:'GET',agent:false,headers:{...HEADERS},rejectUnauthorized:true,servername:url.hostname,family:pin.family,autoSelectFamily:false,maxHeaderSize:LIMITS.headers,
     lookup(host,options,callback){if(host!==url.hostname){callback(error());return;}callback(null,pin.address,pin.family);}},
    response=>{op.resources.add(response);op.touch();resolve(response);});
    op.resources.add(req);req.on('error',()=>reject(error()));op.touch();req.end();
   }catch{reject(error());}
  }));
 }
 async function transfer(initial,op,{max,expectedSize,write}){
  let current=initial,response;
  for(;;){
   current=allowedURL(current,initial);response=await responseFor(current,op);op.live();
   if([301,302,303,307,308].includes(response.statusCode)){
    if(++op.redirects>LIMITS.redirects||typeof response.headers.location!=='string')fail();
    const next=allowedURL(new URL(response.headers.location,current),initial);response.destroy();current=next;continue;
   }
   if(response.statusCode!==200)fail();
   const headers=response.headers,encoding=headers['content-encoding'],length=headers['content-length'];
   if(encoding&&encoding!=='identity')fail();
   if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>max||(expectedSize!==undefined&&Number(length)!==expectedSize)))fail();
   break;
  }
  const hash=crypto.createHash('sha512'),iterator=response[Symbol.asyncIterator]();let bytes=0;
  for(;;){
   const part=await op.race(iterator.next());op.live();if(part.done)break;
   const value=part.value;
   if(!(Buffer.isBuffer(value)||value instanceof Uint8Array)||value.byteLength>1024*1024||bytes+value.byteLength>max)fail();
   const chunk=Buffer.from(value);bytes+=chunk.length;hash.update(chunk);op.touch();
   await op.race(Promise.resolve().then(()=>write(chunk,bytes)));op.live();
  }
  if(bytes<1||(expectedSize!==undefined&&bytes!==expectedSize))fail();
  return {bytes,sha512:hash.digest('base64')};
 }
 async function getCandidate(selectedTag,{signal}={}){
  const op=operation(LIMITS.metadataDeadline,LIMITS.metadataIdle,signal);
  try{
   const name=target.platform==='linux'?'latest-linux.yml':'latest.yml',envelope=[],metadata=[];
   await transfer(initialURL(selectedTag,name+'.sig.json'),op,{max:LIMITS.envelope,write:b=>envelope.push(b)});
   await transfer(initialURL(selectedTag,name),op,{max:LIMITS.metadata,write:b=>metadata.push(b)});
   op.live();return createCandidate({policy,runtime:target,selectedTag,envelope:Buffer.concat(envelope),metadata:Buffer.concat(metadata),now:now()});
  }catch{throw error();}finally{op.dispose();}
 }
 async function download(candidate,sink,{signal,progress}={}){
  // Private owner-policy provenance must be checked before sink or I/O access.
  const data=readCandidate(candidate,policy,{now:now(),runtime:target}),a=data.description.artifact;
  const op=operation(LIMITS.artifactDeadline,LIMITS.artifactIdle,signal);
  try{
   if(!sink||!['write','finish','abort'].every(k=>typeof sink[k]==='function')||a.size>LIMITS.artifact)fail();
   const result=await transfer(initialURL(data.verified.context.tag,a.name),op,{max:a.size,expectedSize:a.size,write:async(b,bytes)=>{
    await sink.write(b);try{progress?.(Object.freeze({downloaded:bytes,total:a.size}));}catch{}
   }});
   if(result.sha512!==a.sha512)fail();
   readCandidate(candidate,policy,{now:now(),runtime:target});await op.race(Promise.resolve().then(()=>sink.finish()));op.live();
   readCandidate(candidate,policy,{now:now(),runtime:target});return Object.freeze(result);
  }catch{try{await sink.abort();}catch{}throw error();}finally{op.dispose();}
 }
 function dispose(){closed=true;for(const op of [...operations])op.stop();}
 return Object.freeze({getCandidate,download,dispose});
}
module.exports={createTransport,isPublicAddress,LIMITS};
