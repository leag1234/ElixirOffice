// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const DAY=24*60*60*1000,TIMEOUT_MS=8000,MAX_BYTES=512*1024;
const API_URL='https://api.github.com/repos/leag1234/elixiroffice/releases?per_page=20';
const PAGE='https://github.com/leag1234/elixiroffice/releases/tag/';
function parseVersion(value){
 if(typeof value!=='string'||value.length>128)return null;
 const m=/^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
 if(!m||m[0]!==value)return null;
 const pre=m[4]?m[4].split('.'):[];
 if(pre.some(part=>/^[0-9]+$/.test(part)&&part.length>1&&part[0]==='0'))return null;
 return {version:value.replace(/^v/,''),core:m.slice(1,4).map(BigInt),pre};
}
function compareVersions(a,b){
 const left=parseVersion(a),right=parseVersion(b);if(!left||!right)return null;
 for(let i=0;i<3;i++)if(left.core[i]!==right.core[i])return left.core[i]<right.core[i]?-1:1;
 if(!left.pre.length||!right.pre.length)return left.pre.length===right.pre.length?0:left.pre.length?-1:1;
 for(let i=0;i<Math.min(left.pre.length,right.pre.length);i++){
  const a=left.pre[i],b=right.pre[i];if(a===b)continue;
  const an=/^[0-9]+$/.test(a),bn=/^[0-9]+$/.test(b);
  if(an&&bn)return BigInt(a)<BigInt(b)?-1:1;
  if(an!==bn)return an?-1:1;
  return a<b?-1:1;
 }
 return left.pre.length===right.pre.length?0:left.pre.length<right.pre.length?-1:1;
}
function validReleaseURL(value){
 if(typeof value!=='string'||value.length>512||/[\u0000-\u0020\u007f]/.test(value))return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.host!=='github.com'||url.username||url.password||url.search||url.hash)return null;
  const prefix='/leag1234/elixiroffice/releases/tag/';
  if(!url.pathname.startsWith(prefix))return null;
  const tag=decodeURIComponent(url.pathname.slice(prefix.length));
  return parseVersion(tag)?PAGE+encodeURIComponent(tag):null;
 }catch{return null}
}
function selectRelease(releases,current){
 if(!parseVersion(current)||!Array.isArray(releases)||releases.length>100)return null;
 let selected=null;
 for(const release of releases){
  if(!release||release.draft!==false)continue;
  const version=parseVersion(release.tag_name),url=validReleaseURL(release.html_url);
  if(!version||!url||url!==PAGE+encodeURIComponent(release.tag_name)||compareVersions(version.version,current)<=0)continue;
  if(!selected||compareVersions(version.version,selected.version)>0)selected={version:version.version,url};
 }
 return selected;
}
// No caller-supplied endpoint, authentication, document fields, redirect or asset fetch.
function fetchReleases({request=require('node:https').request,signal,timeout=TIMEOUT_MS}={}){
 return new Promise((resolve,reject)=>{
  let req,response,timer,settled=false;
  const abort=()=>finish(Error('Release request aborted'));
  function finish(error,value){
   if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(error){response?.destroy();req?.destroy();reject(error)}else resolve(value);
  }
  if(signal?.aborted){finish(Error('Release request aborted'));return;}
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(Error('Release request timeout')),Math.min(TIMEOUT_MS,Math.max(1,Number(timeout)||TIMEOUT_MS)));
  try{
   req=request(API_URL,{method:'GET',agent:false,headers:{
    Accept:'application/vnd.github+json','Accept-Encoding':'identity',
    'User-Agent':'ElixirOffice release check','X-GitHub-Api-Version':'2026-03-10'
   }},res=>{
    response=res;
    if(settled){res.destroy();return;}
    if(res.statusCode!==200||!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(res.headers['content-type']||'')||
       (res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')||
       (res.headers['content-length']!==undefined&&(!/^[0-9]+$/.test(res.headers['content-length'])||Number(res.headers['content-length'])>MAX_BYTES))){
     finish(Error('Invalid release response'));return;
    }
    let bytes=0;const chunks=[];
    res.on('data',chunk=>{
     if(settled)return;
     const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=data.length;
     if(bytes>MAX_BYTES){finish(Error('Release response exceeds byte limit'));return;}chunks.push(data);
    });
    res.on('error',error=>finish(error));
    res.on('aborted',()=>finish(Error('Release response aborted')));
    res.on('close',()=>{if(!res.complete)finish(Error('Incomplete release response'));});
    res.on('end',()=>{
     if(settled)return;
     try{const value=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));if(!Array.isArray(value)||value.length>100)throw Error('Invalid release list');finish(null,value);}
     catch(error){finish(error)}
    });
   });
   req.on('error',error=>finish(error));
   if(settled)req.destroy();else req.end();
  }catch(error){finish(error)}
 });
}
function normalize(input){
 const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const timestamp=value=>Number.isSafeInteger(value)&&value>=0;
 const candidate=value.candidate,parsed=parseVersion(candidate?.version),url=validReleaseURL(candidate?.url);
 let validCandidate=null;
 if(parsed&&url){
  const tag=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
  if(parseVersion(tag)?.version===parsed.version)validCandidate={version:parsed.version,url};
 }
 return {enabled:value.enabled===undefined||value.enabled===true,lastAttempt:timestamp(value.lastAttempt)?value.lastAttempt:null,
  remindUntil:timestamp(value.remindUntil)?value.remindUntil:0,remindVersion:parseVersion(value.remindVersion)?.version||null,skipped:parseVersion(value.skipped)?.version||null,candidate:validCandidate};
}
function create({version,state:initial,save,fetch=fetchReleases,now=Date.now,changed=()=>{},open=async()=>{}}){
 let state=normalize(initial),flight=null,controller=null,generation=0,disposed=false;
 const options=()=>({enabled:state.enabled});
 function notice(){
  const candidate=state.candidate;
  if(disposed||!state.enabled||!candidate||compareVersions(candidate.version,version)<=0||compareVersions(candidate.version,state.skipped)===0||(now()<state.remindUntil&&compareVersions(candidate.version,state.remindVersion)===0))return null;
  return {...candidate};
 }
 const persist=()=>save({...state,candidate:state.candidate?{...state.candidate}:null});
 const notify=()=>{try{Promise.resolve(changed(notice())).catch(()=>{});}catch{}};
 function check(){
  if(flight)return flight;
  if(disposed||!state.enabled||!parseVersion(version)||(state.lastAttempt!==null&&now()-state.lastAttempt<DAY))return Promise.resolve(notice());
  const epoch=generation,current=new AbortController();controller=current;
  state={...state,lastAttempt:now()};
  flight=(async()=>{
   await Promise.resolve();
   try{
    // Persist even failed attempts before contacting GitHub, across restarts.
    await persist();
    if(disposed||!state.enabled||epoch!==generation)return null;
    const releases=await fetch({signal:current.signal});
    if(disposed||!state.enabled||epoch!==generation)return null;
    const candidate=selectRelease(releases,version);
    if(candidate?.version===state.candidate?.version&&candidate?.url===state.candidate?.url)return notice();
    state={...state,candidate};
    await persist();notify();
   }catch{/* Offline, rate limits, malformed responses and storage errors are silent. */}
   finally{flight=null;if(controller===current)controller=null;}
   return notice();
  })();
  return flight;
 }
 async function configure(enabled){
  if(typeof enabled!=='boolean')throw Error('Invalid release-check setting');
  if(enabled===state.enabled)return options();
  generation++;controller?.abort();state={...state,enabled};await persist();notify();return options();
 }
 async function action(name,expectedVersion){
  const candidate=notice();
  if(!candidate||candidate.version!==expectedVersion||!['download','notes','later','skip'].includes(name))return false;
  try{
   if(name==='download'||name==='notes'){
    const url=validReleaseURL(candidate.url);if(!url)return false;await open(url);return true;
   }
   if(name==='later')state={...state,remindUntil:now()+DAY,remindVersion:candidate.version};
   else state={...state,skipped:candidate.version};
   await persist();notify();return true;
  }catch{return false}
 }
 return {options,notice,check,configure,action,dispose(){disposed=true;generation++;controller?.abort();}};
}
module.exports={DAY,TIMEOUT_MS,MAX_BYTES,API_URL,parseVersion,compareVersions,validReleaseURL,selectRelease,fetchReleases,create};
