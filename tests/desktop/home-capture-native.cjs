// SPDX-License-Identifier: AGPL-3.0-only
// Strict opt-in capture runs without debugger flags, on the private Xvfb.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK;
(async()=>{
 const folder=path.join(out,'captures'),args=[path.join(root,'desktop/main.cjs'),'--capture-screens',folder,'--locales','en,fr'];
 const env={...process.env,ELECTRON_OZONE_PLATFORM_HINT:'x11'};delete env.ELECTRON_RUN_AS_NODE;
 assert(!args.includes('--no-sandbox'));
 const child=spawn(process.env.EO_ELECTRON,args,{env,stdio:['ignore','pipe','pipe']}),log=[];
 child.stdout.on('data',data=>log.push(data));child.stderr.on('data',data=>log.push(data));
 try{
  const result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Source capture exceeded240seconds')),240000);
   child.once('error',error=>{clearTimeout(timer);reject(error)});
   child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal})});
  });
  assert.deepEqual(result,{code:0,signal:null},'capture must exit on its own');
  const receipt=JSON.parse(await fs.readFile(path.join(folder,'captures.json'),'utf8'));
  assert.equal(receipt.screens.length,6);
  assert.deepEqual(receipt.screens.map(row=>row.language+'/'+row.view),['en/start','en/home','en/file','fr/start','fr/home','fr/file']);
  for(const row of receipt.screens){
   const bytes=await fs.readFile(path.join(folder,row.file));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(row.capture.shellLanguage,row.language);
  }
  await fs.writeFile(path.join(out,'capture-results.json'),JSON.stringify({screens:6,languages:['en','fr'],exitCode:0,args,pageErrors:'not instrumented: strict capture accepts no debugger arguments',scope:'source Linux opt-in captures, not installed/native-platform qualification'},null,2));
  console.log('PASS six actual EN/FR source start/editor/File captures, locale consistency, PNG bytes and clean capture exit');
 }finally{
  await fs.writeFile(path.join(out,'capture-electron.log'),Buffer.concat(log));
  // Only this exact owned child. The runner also records session cleanup.
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
 }
})().catch(error=>{console.error(error);process.exitCode=1});
