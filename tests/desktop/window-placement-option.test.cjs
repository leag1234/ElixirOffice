// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
const disk=e=>fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8').then(JSON.parse);
const pause=()=>new Promise(resolve=>setTimeout(resolve,230));

test('window placement remains enabled by default and is exposed as a boolean preference',async()=>{
 const e=await boot();try{
  assert.equal((await e.invoke('window-options')).rememberWindowPlacement,true);
 }finally{await e.cleanup()}
});

test('disabled placement ignores an old saved rectangle and maximized state on startup',async()=>{
 const e=await boot({fontSettings:{rememberWindowPlacement:false,windowState:{bounds:{x:44,y:55,width:900,height:650},maximized:true}}});
 try{
  assert.equal((await e.invoke('window-options')).rememberWindowPlacement,false);
  for(const [key,value] of Object.entries({x:0,y:0,width:1360,height:960}))assert.equal(e.shell.options[key],value,key);
 }finally{await e.cleanup()}
});

test('disabled placement never records a moved window or overwrites unrelated preferences',async()=>{
 const e=await boot({fontSettings:{rememberWindowPlacement:false,author:'Public author',fontChoice:'declined'}});
 try{
  e.shell.getNormalBounds=()=>({x:50,y:60,width:980,height:740});e.shell.isMaximized=()=>false;
  e.shell.emit('move');await pause();
  const value=await disk(e);
  assert.equal(value.windowState,undefined);
  assert.equal(value.rememberWindowPlacement,false);assert.equal(value.author,'Public author');assert.equal(value.fontChoice,'declined');
 }finally{await e.cleanup()}
});

test('turning placement off cancels a pending geometry save and removes the saved rectangle',async()=>{
 const e=await boot({fontSettings:{author:'Public author'}});
 try{
  e.shell.getNormalBounds=()=>({x:50,y:60,width:980,height:740});e.shell.isMaximized=()=>false;
  e.shell.emit('move');
  assert.equal(await e.invoke('window-settings',{rememberWindowPlacement:false}),true);
  await pause();
  const value=await disk(e);assert.equal(value.rememberWindowPlacement,false);assert.equal(value.windowState,undefined);assert.equal(value.author,'Public author');
 }finally{await e.cleanup()}
});

test('turning placement back on persists current normal bounds for the next app process',async()=>{
 const e=await boot({fontSettings:{rememberWindowPlacement:false,author:'Public author'}});let saved;
 try{
  e.shell.getNormalBounds=()=>({x:75,y:65,width:1060,height:760});e.shell.isMaximized=()=>true;
  assert.equal(await e.invoke('window-settings',{rememberWindowPlacement:true}),true);
  saved=await disk(e);assert.deepEqual(saved.windowState,{bounds:{x:75,y:65,width:1060,height:760},maximized:true});
  assert.equal(saved.author,'Public author');
 }finally{await e.cleanup()}
 const reopened=await boot({fontSettings:saved});try{
  for(const [key,value] of Object.entries(saved.windowState.bounds))assert.equal(reopened.shell.options[key],value,key);
  assert.equal((await reopened.invoke('window-options')).rememberWindowPlacement,true);
 }finally{await reopened.cleanup()}
});

test('window preference IPC rejects non-boolean placement values without changing existing state',async()=>{
 const e=await boot({fontSettings:{rememberWindowPlacement:true,author:'Public author'}});try{
  for(const value of [0,1,'false',null,{},[]])await assert.rejects(e.invoke('window-settings',{rememberWindowPlacement:value}),/Invalid window settings/);
  assert.equal((await e.invoke('window-options')).rememberWindowPlacement,true);
  assert.equal(e.evaluate('settings.author'),'Public author');
 }finally{await e.cleanup()}
});

test('every supported desktop locale has an actual translated placement option label',()=>{
 const translations=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../tools/desktop/i18n-extra.json'),'utf8'));
 assert.equal(Object.keys(translations).length,45);
 for(const [language,strings] of Object.entries(translations)){
  assert.equal(typeof strings.rememberWindowPlacement,'string',language);
  assert(strings.rememberWindowPlacement.trim(),language);
  if(language!=='en')assert.notEqual(strings.rememberWindowPlacement,translations.en.rememberWindowPlacement,language+' must not silently use English');
 }
});
