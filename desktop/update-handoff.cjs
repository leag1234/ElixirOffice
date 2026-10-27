// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Pure coordination only. Platform launchers and all app close/write guards
// remain separate; this module does not import Electron or spawn anything.
const ACK_TIMEOUT_MS=15000,adapters=new WeakSet(),claimed=new WeakSet();
function failure(){const error=Error('Update handoff failed');error.code='ERR_UPDATE_HANDOFF';return error;}
function createAdapter({launch,timers={setTimeout,clearTimeout}}){
 if(typeof launch!=='function'||typeof timers.setTimeout!=='function'||typeof timers.clearTimeout!=='function')throw failure();
 let resolve,reject,state='prepared',timer=null,returned=false,initiated=false,successPending=false;
 // The independently held Promise exists before install/launch can be called.
 const acknowledgement=new Promise((yes,no)=>{resolve=yes;reject=no;});
 void acknowledgement.catch(()=>{}); // Disposing an unused adapter is safe.
 function clear(){if(timer!==null){timers.clearTimeout(timer);timer=null;}}
 function fail(){
  if(state==='failed'||state==='acknowledged')return false;
  state='failed';clear();reject(failure());return true;
 }
 function complete(){
  if(state!=='installing')return;
  successPending=true;
  if(returned&&initiated){state='acknowledged';clear();resolve();}
 }
 const callbacks=Object.freeze({success:complete,failure:fail});
 const adapter=Object.freeze({
  acknowledgement,
  get state(){return state;},
  dispose:fail,
  install(){
   if(state!=='prepared')return false;
   state='installing';
   let result;
   try{
    timer=timers.setTimeout(fail,ACK_TIMEOUT_MS);
    if(state!=='installing'){clear();return false;}
    result=launch(callbacks);
    returned=true;initiated=result===true;
    if(!initiated){fail();return false;}
    if(successPending)complete();
    return state!=='failed';
   }catch{fail();return false;}
  },
 });
 adapters.add(adapter);return adapter;
}
async function completeHandoff({adapter,barrier,revalidate,quit,restore,signal,acknowledged=async()=>{},release=async()=>{}}){
 // Check private provenance before looking at any adapter properties.
 if(!adapters.has(adapter)||claimed.has(adapter))throw Error('Invalid update adapter');
 if(![barrier,revalidate,quit,restore,acknowledged,release].every(f=>typeof f==='function'))throw failure();
 claimed.add(adapter);
 const acknowledgement=adapter.acknowledgement; // Held before install().
 const abort=()=>adapter.dispose();
 function active(){if(signal?.aborted)throw failure();}
 signal?.addEventListener('abort',abort,{once:true});
 try{
  active();
  if(adapter.state!=='prepared'||await barrier()!==true)throw failure();
  active();
  if(await revalidate()!==true)throw failure();
  active();
  if(adapter.install()!==true)throw failure();
  // A true synchronous return cannot reach quit without this separate ack.
  await acknowledgement;
  // Record an irreversible platform ACK before any later cancellation/cleanup.
  await acknowledged();
  active();
  await release();
  active();
  await quit();
  return true;
 }catch{
  adapter.dispose();
  try{await restore();}catch{}
  return false;
 }finally{signal?.removeEventListener('abort',abort);}
}
module.exports=Object.freeze({createAdapter,completeHandoff,ACK_TIMEOUT_MS});
