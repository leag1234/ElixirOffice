// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports,tick=()=>new Promise(setImmediate);
for(const [name,options,expected] of [
 ['argument',{extraArgs:['--lang=en-US'],fontSettings:{displayLanguage:'fr'},systemLanguages:['de-DE']},'en'],
 ['setting',{fontSettings:{displayLanguage:'fr'},systemLanguages:['de-DE']},'fr'],
 ['invalid argument',{extraArgs:['--lang=xx'],fontSettings:{displayLanguage:'fr'},systemLanguages:['de-DE']},'fr'],
 ['invalid setting',{fontSettings:{displayLanguage:{}},systemLanguages:['de-DE']},'de'],
 ['English fallback',{fontSettings:{displayLanguage:'xx'},systemLanguages:['zz'],systemLocale:'xx'},'en']
])test('real main UI selection '+name,async()=>{
 const e=await boot(options);try{assert.equal((await e.invoke('locale')).language,expected);}finally{await e.cleanup();}
});
test('Language preference persists, changes only on next startup, and preserves recovery/fonts',async()=>{
 const e=await boot({systemLanguages:['de'],fontSettings:{fontConsent:false,fontChoice:'declined',recoveryEnabled:false,recoverySeconds:30}});
 try{
  assert.equal((await e.invoke('locale')).language,'de');
  const result=await e.invoke('language-settings','en-US');assert.equal(result.value,'en');assert.equal(result.next,'en');
  assert.equal((await e.invoke('locale')).language,'de');
  const stored=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.equal(stored.displayLanguage,'en');assert.equal(stored.fontChoice,'declined');assert.equal(stored.fontConsent,false);assert.equal(stored.recoveryEnabled,false);assert.equal(stored.recoverySeconds,30);
  for(const value of [null,{},[],false,'xx','en\u0000'])await assert.rejects(e.invoke('language-settings',value),/display language/);
  assert.equal((await e.invoke('language-options')).value,'en');
  const next=await boot({fontSettings:stored,systemLanguages:['de']});
  try{assert.equal((await next.invoke('locale')).language,'en');}finally{await next.cleanup();}
 }finally{await e.cleanup();}
});
test('Failed language write rolls back the authoritative preference and cannot relaunch',async()=>{
 const e=await boot({fontSettings:{displayLanguage:'de'}});let hold;
 try{hold=e.holdPreferenceWrites();const saved=e.invoke('language-settings','fr');hold.reject(Error('Synthetic write failure'));await assert.rejects(saved,/write failure/);assert.equal((await e.invoke('language-options')).value,'de');assert.equal(e.app.relaunchCalls,undefined);}
 finally{await e.cleanup();}
});
test('Capture locale remains authoritative over stored preference; restart unavailable',async()=>{
 const e=await boot({fontSettings:{displayLanguage:'de'},systemLanguages:['de'],captureLocales:'en,fr'});
 try{
  assert.equal((await e.invoke('locale')).language,'en');
  await e.invoke('capture-locale','fr');assert.equal((await e.invoke('locale')).language,'fr');
  await assert.rejects(e.invoke('language-settings','de'),/capture mode/);assert.equal(await e.invoke('restart'),false);assert.equal(e.app.relaunchCalls,undefined);
 }finally{await e.cleanup();}
});
test('Restart respects dirty Cancel then clean durable close and removes current-run --lang',async()=>{
 const e=await boot({document:true,extraArgs:['--lang=en-US']});
 try{
  e.state.dirty=true;await e.invoke('state',e.selected.token,true);e.responses.push(process.platform==='darwin'?1:2);
  assert.equal(await e.invoke('restart'),false);assert.equal(e.app.relaunchCalls,undefined);assert.equal(e.app.quitCalls,undefined);assert.equal(e.window.destroyed,undefined);
  e.state.dirty=false;await e.invoke('state',e.selected.token,false);
  assert.equal(await e.invoke('restart'),true);assert.equal(e.app.relaunchCalls.length,1);assert.equal(e.app.quitCalls,1);
  assert(!e.app.relaunchCalls[0].args.some(x=>x.startsWith('--lang=')));
 }finally{await e.cleanup();}
});
for(const success of [false,true])test('Restart awaits dirty Save acknowledgement '+success,async()=>{
 const e=await boot({document:true});
 try{
  e.state.dirty=true;await e.invoke('state',e.selected.token,true);e.responses.push(0);
  const result=e.invoke('restart');
  for(let n=0;n<100&&!e.sent.some(v=>v[1]==='save-close');n++)await tick();
  const attempt=e.sent.findLast(v=>v[1]==='save-close')?.[2]?.attemptId;assert(attempt);
  assert.equal(e.app.relaunchCalls,undefined);
  if(success){await e.invoke('save',e.selected.token,new Uint8Array(Buffer.from('PKsaved-public-document')),false);e.state.dirty=false;}
  await e.invoke('closed-saved',attempt);
  assert.equal(await result,success);assert.equal(e.app.relaunchCalls?.length||0,success?1:0);
 }finally{await e.cleanup();}
});

test('Display override leaves system document defaults and existing document bytes separate',async()=>{
 const e=await boot({extraArgs:['--lang=en-US'],systemLanguages:['de-DE'],document:true});
 try{
  const info=await e.invoke('locale');assert.equal(info.language,'en');assert.equal(info.documentLanguage,'de');
  assert.deepEqual(Buffer.from(e.selected.bytes),await fsp.readFile(path.join(e.directory,'test.docx')));
  await e.invoke('language-settings','fr');assert.equal((await e.invoke('locale')).documentLanguage,'de');
  const home=await boot({fontSettings:{displayLanguage:'en'},systemLanguages:['de-DE']});
  try{
   const blank=await home.invoke('new','docx');
   assert.deepEqual(Buffer.from(blank.bytes),await fsp.readFile(path.join(__dirname,'../../desktop/assets/desktop-home/blanks/de.docx')));
   await home.invoke('help');assert(home.windows.at(-1).url.includes('/help/en/'));
  }finally{await home.cleanup();}
 }finally{await e.cleanup();}
});
for(const barrier of ['preferences','recovery'])test('Restart cannot bypass a failed durable '+barrier+' barrier',async()=>{
 const e=await boot();
 try{
  e.evaluate(barrier+'.barrier=()=>Promise.reject(Error("Synthetic restart barrier failure"))');
  assert.equal(await e.invoke('restart'),false);assert.equal(e.app.relaunchCalls,undefined);assert.equal(e.app.quitCalls,undefined);
  assert(e.windows.some(w=>!w.isDestroyed()),'A rejected restart must restore a usable Home');
 }finally{await e.cleanup();}
});

test('Overlapping language choices serialize and a failed older write cannot roll back the newer choice',async()=>{
 const e=await boot({fontSettings:{displayLanguage:'en'}});
 try{
  const control=e.evaluate('(()=>{const original=preferences.save.bind(preferences);let reject,calls=0;const first=new Promise((_,fail)=>{reject=fail;});preferences.save=(...args)=>++calls===1?first:original(...args);return {reject,get calls(){return calls}};})()');
  const first=e.invoke('language-settings','fr'),second=e.invoke('language-settings','de');
  const rejected=assert.rejects(first,/Older language write failed/);
  for(let n=0;n<50&&control.calls!==1;n++)await tick();
  assert.equal(control.calls,1);control.reject(Error('Older language write failed'));
  await rejected;assert.equal((await second).value,'de');
  assert.equal((await e.invoke('language-options')).value,'de');
  const disk=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));assert.equal(disk.displayLanguage,'de');
 }finally{await e.cleanup();}
});

for(const outcome of ['success','failure'])test('A concurrent author save cannot persist a tentative or stale language after '+outcome,async()=>{
 const e=await boot({fontSettings:{displayLanguage:'en'}});
 try{
  const control=e.evaluate('(()=>{const original=preferences.save.bind(preferences);let resolve,reject,calls=0;const first=new Promise((ok,fail)=>{resolve=ok;reject=fail;});preferences.save=(...args)=>++calls===1?first.then(()=>original(...args)):original(...args);return {resolve,reject,get calls(){return calls}};})()');
  const changing=e.invoke('language-settings','fr');
  const failure=outcome==='failure'?assert.rejects(changing,/Synthetic cross-channel failure/):null;
  for(let n=0;n<50&&control.calls!==1;n++)await tick();assert.equal(control.calls,1);
  assert.equal((await e.invoke('language-options')).value,'en','Pending language is never published');
  const author=e.invoke('author-save','Public concurrent author');
  await tick();assert.equal(control.calls,1,'Unrelated write must wait for language transaction');
  if(outcome==='failure')control.reject(Error('Synthetic cross-channel failure'));else control.resolve();
  if(failure)await failure;else await changing;
  await author;
  const expected=outcome==='failure'?'en':'fr',disk=JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8'));
  assert.equal(disk.displayLanguage,expected);assert.equal(disk.author,'Public concurrent author');
  assert.equal((await e.invoke('language-options')).value,expected);
 }finally{await e.cleanup();}
});
test('Restart drains an already accepted language write and rejects a late change while closing',async()=>{
 const e=await boot();
 try{
  const control=e.evaluate('(()=>{const original=preferences.save.bind(preferences);let release;const gate=new Promise(r=>{release=r;});preferences.save=(...args)=>gate.then(()=>original(...args));return {release};})()');
  const saving=e.invoke('language-settings','fr'),restarting=e.invoke('restart');
  await tick();assert.equal(e.app.relaunchCalls,undefined);
  await assert.rejects(e.invoke('language-settings','de'),/close is pending/);
  control.release();await saving;assert.equal(await restarting,true);assert.equal(e.app.relaunchCalls.length,1);
  assert.equal(JSON.parse(await fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8')).displayLanguage,'fr');
 }finally{await e.cleanup();}
});
