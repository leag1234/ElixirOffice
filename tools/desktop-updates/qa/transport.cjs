// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// QA-only source. This module is never part of an ordinary desktop package.
const http=require('node:http'),crypto=require('node:crypto');
function refused(){return Error('QA update transport refused');}
function validateEndpoint(value){
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='host,port,prefix'||
  value.host!=='127.0.0.1'||!Number.isInteger(value.port)||value.port<1024||value.port>65535||
  typeof value.prefix!=='string'||!/^\/eo-update-qa\/[a-f0-9]{32}\/$/.test(value.prefix))throw refused();
 return Object.freeze({host:value.host,port:value.port,prefix:value.prefix});
}
function createQATransport({endpoint,tag,policy,runtime,wire,now=Date.now,timers={setTimeout,clearTimeout}}={}){
 const server=validateEndpoint(endpoint),target=Object.freeze({...runtime});
 if(typeof tag!=='string'||!/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(tag)||
  typeof now!=='function'||!wire||typeof wire.createCandidate!=='function'||typeof wire.readCandidate!=='function'||!policy?.capability(target).enabled)throw refused();
 const active=new Set();let closed=false;
 function gate(signal){if(closed||signal?.aborted||!policy.capability(target).enabled)throw refused();}
 async function read(name,{signal,max,expected,write,artifact=false,deadline,done}={}){
  gate(signal);
  // Names come only from fixed metadata names or a verified strict candidate.
  if(typeof name!=='string'||!/^[A-Za-z0-9._-]+$/.test(name))throw refused();
  let req,res,totalTimer,idleTimer,stopped=false,rejectStop;
  const stopPromise=new Promise((_,reject)=>{rejectStop=reject;});void stopPromise.catch(()=>{});
  const race=p=>Promise.race([p,stopPromise]);
  const stop=()=>{if(stopped)return;stopped=true;rejectStop(refused());res?.destroy();req?.destroy();};
  const touch=()=>{timers.clearTimeout(idleTimer);idleTimer=timers.setTimeout(stop,artifact?30000:2000);};
  active.add(stop);totalTimer=timers.setTimeout(stop,deadline===undefined?(artifact?1800000:8000):Math.max(1,deadline-Date.now()));
  signal?.addEventListener('abort',stop,{once:true});
  const live=()=>{gate(signal);if(stopped)throw refused();};
  try{
   live();touch();
   res=await race(new Promise((resolve,reject)=>{
    req=http.request({
     protocol:'http:',hostname:'127.0.0.1',family:4,port:server.port,path:server.prefix+name,
     method:'GET',agent:false,maxHeaderSize:16384,autoSelectFamily:false,
     headers:{'Accept-Encoding':'identity','User-Agent':'ElixirOffice Update QA','Connection':'close'},
     lookup(_host,_options,callback){callback(refused());}
    },response=>resolve(response));
    req.once('error',()=>reject(refused()));req.end();
   }));
   live();touch();
   if(res.socket?.remoteAddress!=='127.0.0.1'||res.socket.remotePort!==server.port||res.statusCode!==200||
     (res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'))throw refused();
   const length=res.headers['content-length'];
   if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||
     Number(length)>max||(expected!==undefined&&Number(length)!==expected)))throw refused();
   const iterator=res[Symbol.asyncIterator](),hash=crypto.createHash('sha512');let size=0;
   for(;;){
    const next=await race(iterator.next());live();if(next.done)break;
    const b=next.value;if(!Buffer.isBuffer(b)||b.length>1024*1024||size+b.length>max)throw refused();
    size+=b.length;hash.update(b);touch();await race(Promise.resolve().then(()=>write(Buffer.from(b),size)));live();
   }
   if(!size||(expected!==undefined&&size!==expected))throw refused();
   const result=Object.freeze({bytes:size,sha512:hash.digest('base64')});
   if(done){await race(Promise.resolve().then(()=>done(result)));live();}
   return result;
  }catch{throw refused();}
  finally{timers.clearTimeout(totalTimer);timers.clearTimeout(idleTimer);signal?.removeEventListener('abort',stop);active.delete(stop);res?.destroy();req?.destroy();}
 }
 async function getCandidate(selectedTag,{signal}={}){
  gate(signal);if(selectedTag!==tag)throw refused();
  const deadline=Date.now()+8000;
  const name=target.platform==='linux'?'latest-linux.yml':'latest.yml',envelope=[],metadata=[];
  await read(name+'.sig.json',{signal,deadline,max:16384,write:b=>envelope.push(b)});
  const encoded=Buffer.concat(envelope);
  try{JSON.parse(encoded.toString('utf8'));}catch{throw refused();}
  await read(name,{signal,deadline,max:131072,write:b=>metadata.push(b)});
  gate(signal);return wire.createCandidate({policy,runtime:target,selectedTag:tag,envelope:encoded,metadata:Buffer.concat(metadata),now:now()});
 }
 async function download(candidate,sink,{signal,progress}={}){
  // Provenance before sink access, exactly as in the production composition.
  const selected=wire.readCandidate(candidate,policy,{runtime:target,now:now()});
  if(selected.verified.context.tag!==tag)throw refused();
  const a=selected.description.artifact;
  try{
   gate(signal);if(!sink||!['write','finish','abort'].every(k=>typeof sink[k]==='function')||a.size>2**31)throw refused();
   const result=await read(a.name,{signal,max:a.size,expected:a.size,artifact:true,write:async(b,size)=>{
    await sink.write(b);try{progress?.(Object.freeze({downloaded:size,total:a.size}));}catch{}
   },done:async result=>{
    if(result.sha512!==a.sha512)throw refused();
    wire.readCandidate(candidate,policy,{runtime:target,now:now()});gate(signal);
    await sink.finish();wire.readCandidate(candidate,policy,{runtime:target,now:now()});gate(signal);
   }});
   return result;
  }catch{try{await sink?.abort();}catch{}throw refused();}
 }
 return Object.freeze({getCandidate,download,dispose(){closed=true;for(const stop of [...active])stop();}});
}
module.exports={createQATransport,validateEndpoint};
