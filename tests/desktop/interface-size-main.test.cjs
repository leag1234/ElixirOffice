// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports,tick=()=>new Promise(setImmediate);
test('real main defaults invalid/absent interface size to100 and applies it to shell/document',async()=>{
 for(const value of [undefined,'125',123,{},Infinity]){
  const e=await boot({fontSettings:{interfaceSize:value}});
  try{assert.equal((await e.invoke('interface-size')).value,100);assert.equal(e.shell.webContents.getZoomFactor(),1);assert.equal(e.documents[0].getZoomFactor(),1);}
  finally{await e.cleanup();}
 }
});
test('real main persists125 across restart without changing document bytes, dirty state or other preferences',async()=>{
 const e=await boot({document:true,fontSettings:{displayLanguage:'fr',fontChoice:'declined',recoveryEnabled:false}});
 try{
  const before=await fsp.readFile(path.join(e.directory,'test.docx'));
  assert.equal((await e.invoke('interface-size-set',125)).value,125);
  assert.equal(e.shell.webContents.getZoomFactor(),1.25);assert.equal(e.documents[0].getZoomFactor(),1.25);
  assert.deepEqual(await fsp.readFile(path.join(e.directory,'test.docx')),before);assert.equal(e.state.dirty,false);
  const saved=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.equal(saved.interfaceSize,125);assert.equal(saved.displayLanguage,'fr');assert.equal(saved.fontChoice,'declined');assert.equal(saved.recoveryEnabled,false);
  const next=await boot({fontSettings:saved});try{assert.equal((await next.invoke('interface-size')).value,125);assert.equal(next.documents[0].getZoomFactor(),1.25);}finally{await next.cleanup();}
 }finally{await e.cleanup();}
});
test('failed interface-size write never publishes tentative settings or viewport zoom',async()=>{
 const e=await boot();try{
  const gate=e.holdPreferenceWrites(),saving=e.invoke('interface-size-set',150),rejected=assert.rejects(saving,/Synthetic size failure/);
  for(let n=0;n<100&&gate.calls===0;n++)await tick();assert.equal(gate.calls,1);
  assert.equal((await e.invoke('interface-size')).value,100);assert.equal(e.documents[0].getZoomFactor(),1);
  gate.reject(Error('Synthetic size failure'));await rejected;
  assert.equal((await e.invoke('interface-size')).value,100);assert.equal(e.documents[0].getZoomFactor(),1);
 }finally{await e.cleanup();}
});
test('older rejected interface write cannot overwrite a newer accepted preference',async()=>{
 const e=await boot();try{
  const gate=e.evaluate('(()=>{const old=preferences.save.bind(preferences);let reject,calls=0;const wait=new Promise((_,fail)=>{reject=fail});preferences.save=(...args)=>++calls===1?wait:old(...args);return {reject,get calls(){return calls}}})()');
  const first=e.invoke('interface-size-set',125),second=e.invoke('interface-size-set',175),rejected=assert.rejects(first,/Older size failure/);
  for(let n=0;n<100&&gate.calls===0;n++)await tick();assert.equal(gate.calls,1);
  gate.reject(Error('Older size failure'));await rejected;await second;
  assert.equal((await e.invoke('interface-size')).value,175);assert.equal(e.documents[0].getZoomFactor(),1.75);
  assert.equal(JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8')).interfaceSize,175);
 }finally{await e.cleanup();}
});
test('interface-size IPC refuses invalid values, capture writes and changes while closing',async()=>{
 const e=await boot();try{
  for(const value of [null,{},[],true,'125',NaN,Infinity,0,123,250])await assert.rejects(e.invoke('interface-size-set',value),/interface size/i);
  e.evaluate('appClosing=true');await assert.rejects(e.invoke('interface-size-set',125),/close is pending/);e.evaluate('appClosing=false');
 }finally{await e.cleanup();}
 const capture=await boot({captureLocales:'en',fontSettings:{interfaceSize:150}});
 try{assert.equal((await capture.invoke('interface-size')).value,100);await assert.rejects(capture.invoke('interface-size-set',125),/capture mode/);}finally{await capture.cleanup();}
});
test('new windows/documents and subsequent page loads inherit the current interface factor',async()=>{
 const e=await boot();try{
  await e.invoke('interface-size-set',125);
  const owner=e.evaluate('tabHost.createWindow()');await owner.ready;
  assert.equal(e.windows.at(-1).webContents.getZoomFactor(),1.25);
  e.evaluate('createSession(registry.windows().at(-1).id)');
  assert.equal(e.documents.at(-1).getZoomFactor(),1.25);
  e.documents.at(-1).setZoomFactor(1);e.documents.at(-1).emit('did-finish-load');assert.equal(e.documents.at(-1).getZoomFactor(),1.25);
 }finally{await e.cleanup();}
});
test('native View actions step and reset interface size without any default accelerators',async()=>{
 const e=await boot();try{
  function all(items){return items.flatMap(item=>[item,...(Array.isArray(item.submenu)?all(item.submenu):[])]);}
  const items=()=>all(e.app.menu).filter(item=>/^eo-interface-zoom-/.test(item.id||''));
  assert.equal(items().length,3);
  for(const item of items())assert.equal(item.accelerator,undefined);
  await items().find(x=>x.id==='eo-interface-zoom-in').click();assert.equal((await e.invoke('interface-size')).value,110);
  await items().find(x=>x.id==='eo-interface-zoom-reset').click();assert.equal((await e.invoke('interface-size')).value,100);
  await e.invoke('interface-size-set',200);assert.equal(items().find(x=>x.id==='eo-interface-zoom-in').enabled,false);
  await e.invoke('interface-size-set',80);assert.equal(items().find(x=>x.id==='eo-interface-zoom-out').enabled,false);
 }finally{await e.cleanup();}
});
test('scaled tab and compact-title bounds reserve the actual UI strip height',async()=>{
 for(const compact of [false,true]){
  const e=await boot({document:true,overlayAvailable:true,fontSettings:{interfaceSize:125,openInTabs:true,customTitleBar:compact}});
  try{
   const top=e.evaluate('tabHost.contentTop(registry.windows()[0])');
   assert.equal(top,Math.ceil((compact?36:44)*1.25));
   assert.equal(e.evaluate('registry.document(registry.windows()[0].documents[0]).view.bounds.y'),top);
   if(compact)assert.equal(e.shell.overlay.height,top);
  }finally{await e.cleanup();}
 }
});
