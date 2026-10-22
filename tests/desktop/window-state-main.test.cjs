// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
test('actual main restores validated outer bounds without a custom frame or a new preference',async()=>{
 const state={bounds:{x:45,y:50,width:900,height:650},maximized:false},e=await boot({fontSettings:{windowState:state}});try{
  for(const [key,value] of Object.entries(state.bounds))assert.equal(e.shell.options[key],value,key);
 }finally{await e.cleanup()}
});
test('actual move persists normal bounds without overwriting author, font consent or navigation settings',async()=>{
 const e=await boot({fontSettings:{author:'Public author',fontConsent:false,fontChoice:'declined',openInTabs:false}});try{
  e.shell.getNormalBounds=()=>({x:25,y:40,width:1100,height:740});e.shell.isMaximized=()=>false;
  e.shell.emit('move');await new Promise(r=>setTimeout(r,250));
  const value=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.deepEqual(value.windowState,{bounds:{x:25,y:40,width:1100,height:740},maximized:false});
  assert.equal(value.author,'Public author');assert.equal(value.fontConsent,false);assert.equal(value.fontChoice,'declined');assert.equal(value.openInTabs,false);
 }finally{await e.cleanup()}
});
test('native close flushes latest normal geometry without waiting for a resize debounce',async()=>{
 const e=await boot();try{
  e.shell.getNormalBounds=()=>({x:30,y:50,width:920,height:720});e.shell.isMaximized=()=>true;
  e.shell.emit('resize');e.shell.close();
  for(let n=0;n<100&&!e.shell.isDestroyed();n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(e.shell.isDestroyed(),true);
  const value=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.deepEqual(value.windowState,{bounds:{x:30,y:50,width:920,height:720},maximized:true});
 }finally{await e.cleanup()}
});
test('closing a minimized window flushes the last visible geometry before process exit',async()=>{
 const e=await boot();try{
  e.shell.getNormalBounds=()=>({x:40,y:70,width:970,height:750});e.shell.isMinimized=()=>false;e.shell.isMaximized=()=>false;
  e.shell.emit('move');e.shell.isMinimized=()=>true;e.shell.close();
  for(let n=0;n<100&&!e.shell.isDestroyed();n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(e.shell.isDestroyed(),true);
  const value=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.deepEqual(value.windowState,{bounds:{x:40,y:70,width:970,height:750},maximized:false});
 }finally{await new Promise(r=>setTimeout(r,180));await e.cleanup()}
});
test('capture mode never schedules geometry persistence into its disposable profile',async()=>{
 const e=await boot({captureLocales:'en'});try{
  e.shell.getNormalBounds=()=>({x:10,y:20,width:900,height:650});e.shell.emit('move');await new Promise(r=>setTimeout(r,220));
  const file=path.join(e.app.getPath('userData'),'desktop-settings.json');
  const value=JSON.parse(await fsp.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error}));
  assert.equal(value.windowState,undefined);
 }finally{await e.cleanup()}
});

for(const route of ['native close','application quit']){
 test(route+' waits for an actual stalled settings write even with no usable document',async()=>{
  const e=await boot();let held,completion;
  try{
   // An early unavailable renderer leaves an owner with no document whose
   // usual close path could indirectly flush preferences.
   e.documents[0].close();
   e.shell.getNormalBounds=()=>({x:32,y:54,width:940,height:730});e.shell.isMaximized=()=>false;
   held=e.holdPreferenceWrites();
   if(route==='native close'){e.shell.close();completion=e.ownerCloseCompletion();}
   else completion=e.quit();
   let completed=false;completion.then(()=>{completed=true});
   for(let i=0;i<30&&!held.calls;i++)await new Promise(setImmediate);
   assert.equal(held.calls,1,'geometry flush must start the settings save');
   for(let i=0;i<10;i++)await new Promise(setImmediate);
   assert.equal(completed,false,'close/quit cannot resolve while the settings write is stalled');
   assert.equal(e.shell.isDestroyed(),false,'window cannot disappear before geometry is persisted');
   assert.equal(e.app.quitCalls||0,0,'application cannot quit before geometry is persisted');
   held.release();assert.equal(await completion,true);
   assert.equal(e.shell.isDestroyed(),true);
   if(route==='application quit')assert.equal(e.app.quitCalls,1);
   const disk=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
   assert.deepEqual(disk.windowState,{bounds:{x:32,y:54,width:940,height:730},maximized:false});
  }finally{
   held?.release();if(completion)await completion;
   await e.cleanup();
  }
 });
}
test('a rejected geometry write is caught and does not wedge empty-window quit',async()=>{
 const e=await boot();let held,completion;
 try{
  e.documents[0].close();e.shell.getNormalBounds=()=>({x:32,y:54,width:940,height:730});e.shell.isMaximized=()=>false;
  held=e.holdPreferenceWrites();completion=e.quit();
  for(let i=0;i<30&&!held.calls;i++)await new Promise(setImmediate);
  assert.equal(held.calls,1);
  held.reject(Error('Injected settings write failure'));
  assert.equal(await completion,true);assert.equal(e.shell.isDestroyed(),true);assert.equal(e.app.quitCalls,1);
  assert.equal(e.app.exitCode,undefined,'a caught preference failure is not a fatal rejection');
 }finally{held?.release();if(completion)await completion;await e.cleanup()}
});
