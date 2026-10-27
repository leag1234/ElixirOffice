// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Source-owned composition. The only library load is below both closed gates.
const path=require('node:path'),{production}=require('./update-policy.cjs');
const {parseVersion,compareVersions,validReleaseURL}=require('./release-notice.cjs');
const {readCandidate}=require('./update-candidate.cjs'),{createTransport}=require('./update-transport.cjs');
const {createCache}=require('./update-cache.cjs'),{createVerifiedProvider,bindVerifiedUpdater}=require('./update-provider.cjs');
const {createLibraryBridge}=require('./update-library-bridge.cjs'),{createNSISAdapter,createAppImageAdapter}=require('./update-installers.cjs');
function refused(){throw Error('Update runtime refused');}
async function createRuntimeSession({runtime,policy=production,eligibility,app,version,cacheRoot,transport:injectedTransport,makeAdapter,signal:outerSignal,now=Date.now}={}){
 const target=Object.freeze({...runtime});
 if(!policy.capability(target).enabled)refused();
 if(!eligibility||await eligibility.check()!==true)refused();
 if(outerSignal?.aborted||parseVersion(version)?.version!==version)refused();
 const library=require('electron-updater');
 const {CancellationToken}=require('builder-util-runtime');
 const root=cacheRoot||path.join(app.getPath('userData'),'signed-updates-v1');
 const cache=createCache({root,policy,runtime:target,currentVersion:version,now});
 const transport=injectedTransport||createTransport({policy,runtime:target,now});
 const provider=createVerifiedProvider({Provider:library.Provider,policy,runtime:target,now});
 const bridge=createLibraryBridge({cache,provider,download:(candidate,sink,options)=>transport.download(candidate,sink,{...options,progress:currentProgress})});
 const Bound=bindVerifiedUpdater({Base:target.platform==='win32'?library.NsisUpdater:library.AppImageUpdater,provider,policy,runtime:target,
  configPath:path.join(__dirname,'update-cache.yml'),download:bridge.download,install:bridge.install});
 const adapter={version,name:'ElixirOffice',isPackaged:true,baseCachePath:root,whenReady:()=>app.whenReady(),
  get userDataPath(){refused();},onQuit(){refused();},quit(){refused();}};
 const updater=new Bound(adapter);updater.on('error',()=>{});bridge.attach(updater,adapter);
 const lifetime=new AbortController(),signal=outerSignal?AbortSignal.any([outerSignal,lifetime.signal]):lifetime.signal;
 let closed=false,started=false,lastReceipt=null,token=null,currentProgress;
 const abort=()=>token?.cancel();signal.addEventListener('abort',abort,{once:true});
 function live(){if(closed||signal.aborted)refused();}
 function dispose(){
  if(closed)return;closed=true;signal.removeEventListener('abort',abort);
  for(const stop of [()=>lifetime.abort(),()=>token?.cancel(),()=>bridge.dispose(),()=>transport.dispose()])try{stop();}catch{}
 }
 async function prepare(notice,{signal:jobSignal,progress}={}){
  live();if(started)refused();started=true;currentProgress=progress;
  const tag='v'+notice?.version,selectedURL='https://github.com/leag1234/elixiroffice/releases/tag/'+encodeURIComponent(tag);
  if(!notice||Object.keys(notice).some(k=>!['version','url'].includes(k))||parseVersion(notice.version)?.version!==notice.version||
   compareVersions(notice.version,version)<=0||validReleaseURL(notice.url)!==selectedURL)refused();
  const selectedSignal=jobSignal?AbortSignal.any([signal,jobSignal]):signal;
  try{
   if(selectedSignal.aborted)refused();
   const candidate=await transport.getCandidate(tag,{signal:selectedSignal});live();
   const signed=readCandidate(candidate,policy,{runtime:target,now:now()});
   if(signed.description.version!==notice.version||signed.verified.context.tag!==tag)refused();
   provider.setCandidate(candidate);token=new CancellationToken();
   const cancel=()=>token.cancel();selectedSignal.addEventListener('abort',cancel,{once:true});
   try{
    if(selectedSignal.aborted)refused();
    await updater.doDownloadUpdate({updateInfoAndProvider:{info:await provider.getLatestVersion(),provider},requestHeaders:null,cancellationToken:token});
    live();if(selectedSignal.aborted)refused();lastReceipt=bridge.ready(updater);return lastReceipt;
   }finally{selectedSignal.removeEventListener('abort',cancel);}
  }catch{dispose();refused();}
 }
 async function install(receipt,options={}){
  live();
  if(!lastReceipt||receipt!==lastReceipt||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='automatic')||
   (Object.hasOwn(options,'automatic')&&typeof options.automatic!=='boolean'))refused();
  try{
   if(await eligibility.check()!==true)refused();live();
   const details=eligibility.details();
   const result=await bridge.prepare(updater,{silent:options.automatic===true,relaunch:false,makeAdapter:context=>{
    const authorize=()=>!closed&&!signal.aborted&&context.authorize();
    const args={...context,authorize};
    if(makeAdapter)return makeAdapter(args);
    return target.platform==='win32'?createNSISAdapter(args):createAppImageAdapter({...args,startup:details.startup});
   }});
   return Object.freeze({adapter:result.adapter,revalidate:async()=>{live();const value=await result.revalidate();live();return value;},release:result.release});
  }catch{dispose();refused();}
 }
 return Object.freeze({prepare,install,dispose});
}
module.exports={createRuntimeSession};
