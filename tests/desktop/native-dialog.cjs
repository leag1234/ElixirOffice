// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),readline=require('node:readline');
const {root}=require('./harness.cjs');
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms)})])}finally{clearTimeout(timer)}}
async function watchPdfWarning(env){
 assert(process.env.EO_NATIVE_A11Y,'Set up an explicitly owned private accessibility bus for native PDF warnings');
 assert(env.nativeIdentity,'Captured native process identity required');
 const labels=await env.page.evaluate(async()=>{const {strings}=await eoDesktop.locale();return{body:strings.saveLossPdf,cancel:strings.cancel,saveCopy:strings.saveCopy}});
 assert(Object.values(labels).every(value=>typeof value==='string'&&value.length>0));
 const child=cp.spawn('/usr/bin/python3',[path.join(__dirname,'native-dialog.py'),'--watch'],{cwd:root,env:{...env.launchSpec.environment,EO_NATIVE_PID:String(env.application.pid),EO_NATIVE_IDENTITY:JSON.stringify(env.nativeIdentity)},stdio:['pipe','pipe','pipe']});
 let stderr='',ended=false,spawnError,protocolError,signalFault;
 const fault=new Promise(resolve=>{signalFault=resolve});
 function fail(error){protocolError||=error;signalFault(protocolError)}
 child.stdin.on('error',fail);
 async function operation(promise){if(protocolError)throw protocolError;return Promise.race([promise,fault.then(error=>{throw error})])}
 child.stderr.on('data',data=>{stderr+=data.toString();if(stderr.length>32768){stderr=stderr.slice(-32768);child.kill('SIGTERM')}});
 const exited=new Promise(resolve=>{child.once('error',error=>{spawnError=error;ended=true;fail(error);resolve()});child.once('exit',()=>{ended=true;resolve()})});
 const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity}),iterator=lines[Symbol.asyncIterator]();
 async function receive(kind,ms){
  const item=await bounded(operation(iterator.next()),ms,'Native warning helper '+kind+' deadline');
  assert(!item.done,'Native warning helper exited before '+kind+': '+stderr);
  assert(item.value.length<=8192,'Native warning response too large');
  const message=JSON.parse(item.value);assert.equal(message.kind,kind,'Unexpected native warning response');return message;
 }
 async function close(){
  child.stdin.destroy();
  if(!ended)child.kill('SIGTERM');
  try{await bounded(exited,3000,'Native warning helper stop deadline')}catch(error){if(!ended)child.kill('SIGKILL');await bounded(exited,3000,'Native warning helper reap deadline')}
  lines.close();
 }
 try{
  const ready=await receive('ready',5000);assert.equal(ready.pid,child.pid);
  return {async confirm(window,choose='saveCopy'){
   assert(['cancel','saveCopy'].includes(choose));assert(/^0x[0-9a-f]+$/.test(window));
   try{
   assert(!ended,'Native warning helper exited before ARM');
   await bounded(operation(new Promise((resolve,reject)=>{child.stdin.end(JSON.stringify({window,choose,...labels})+'\n',error=>error?reject(error):resolve())})),3000,'Native warning ARM deadline');
   const result=await receive('confirmed',15000);await bounded(exited,3000,'Native warning helper exit deadline');
   if(spawnError)throw spawnError;
   assert.equal(child.exitCode,0,stderr);assert.equal(result.window,window);assert.equal(result.warning,labels.body);assert.equal(result.choice,labels[choose]);assert.equal(result.confirmed,true);return result;
   }catch(error){await close();throw error}
  },close};
 }catch(error){await close();throw error}
}
module.exports={watchPdfWarning};
