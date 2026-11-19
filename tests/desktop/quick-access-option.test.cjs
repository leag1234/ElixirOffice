// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=scope.exports;
const root=path.resolve(__dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const disk=e=>fsp.readFile(path.join(e.directory,'desktop-settings.json'),'utf8').then(JSON.parse);

test('Show Quick Access Toolbar is on by default and exposed as a boolean window option',async()=>{
 const e=await boot();try{assert.equal((await e.invoke('window-options')).showQuickAccess,true);}finally{await e.cleanup()}
});

test('turning it off is persisted, leaves other preferences alone and survives a restart',async()=>{
 const e=await boot({fontSettings:{author:'Public author',rememberWindowPlacement:false}});let saved;
 try{
  assert.equal(await e.invoke('window-settings',{showQuickAccess:false}),true);
  assert.equal((await e.invoke('window-options')).showQuickAccess,false);
  saved=await disk(e);assert.equal(saved.showQuickAccess,false);assert.equal(saved.author,'Public author');assert.equal(saved.rememberWindowPlacement,false);
 }finally{await e.cleanup()}
 const reopened=await boot({fontSettings:saved});try{
  assert.equal((await reopened.invoke('window-options')).showQuickAccess,false);
  assert.equal(await reopened.invoke('window-settings',{showQuickAccess:true}),true);
  assert.equal((await reopened.invoke('window-options')).showQuickAccess,true);assert.equal((await disk(reopened)).showQuickAccess,true);
 }finally{await reopened.cleanup()}
});

test('the Options dialog saves it together with the other window options without changing them',async()=>{
 const e=await boot({fontSettings:{openInTabs:true}});try{
  await e.invoke('window-settings',{showQuickAccess:false,openInTabs:true,showHomeTab:false,rememberWindowPlacement:true,hardwareAcceleration:true,customTitleBar:false});
  const options=await e.invoke('window-options');
  assert.equal(options.showQuickAccess,false);assert.equal(options.openInTabs,true);assert.equal(options.rememberWindowPlacement,true);
 }finally{await e.cleanup()}
});

test('window preference IPC rejects a non-boolean value without changing the state',async()=>{
 const e=await boot();try{
  for(const value of [0,1,'false',null,{},[]])await assert.rejects(e.invoke('window-settings',{showQuickAccess:value}),/Invalid window settings/);
  assert.equal((await e.invoke('window-options')).showQuickAccess,true);
 }finally{await e.cleanup()}
});

test('a change is pushed live to every open document, and only a change of this option is',async()=>{
 const e=await boot({document:true});try{
  const received=[];for(const contents of e.documents){const send=contents.send;contents.send=(...args)=>{if(args[0]==='eo:quick-access')received.push(args.slice(1));return send.apply(contents,args)};}
  await e.invoke('window-settings',{openInTabs:false});assert.deepEqual(received,[]);
  await e.invoke('window-settings',{showQuickAccess:false});await e.invoke('window-settings',{showQuickAccess:true});
  assert(received.length>=2,'both changes reach the open document');assert.deepEqual(received.slice(-2),[[false],[true]]);
 }finally{await e.cleanup()}
});

test('the Options dialog, the live listener and the compact title bar are wired to the setting',()=>{
 const renderer=read('desktop/renderer.js'),preload=read('desktop/preload.cjs'),compact=read('desktop/compact-editor.js');
 assert.match(renderer,/quick\.id='show-quick-access'/);assert.match(renderer,/t\('showQuickAccess'\)/);
 assert.match(renderer,/windowSettings\(\{showQuickAccess:quick\.checked,/);
 assert.match(renderer,/eoDesktop\.onQuickAccess\(/);assert.match(renderer,/ElixirQuickAccess\?\.set\(showQuickAccess,\{host:true\}\)/);
 assert.match(renderer,/addEventListener\('elixir:quickaccess'/);
 assert.match(preload,/onQuickAccess:.*'eo:quick-access'/);
 assert.match(compact,/setQuickAccess/);assert.match(compact,/const visible=quickAccess&&/);
});

test('every desktop locale defines the label and the translated ones are not English',()=>{
 const translations=JSON.parse(read('tools/desktop/i18n-extra.json'));
 assert.equal(Object.keys(translations).length,45);
 for(const [language,strings] of Object.entries(translations)){assert.equal(typeof strings.showQuickAccess,'string',language);assert(strings.showQuickAccess.trim(),language);}
 assert.equal(translations.en.showQuickAccess,'Show Quick Access Toolbar');
 for(const language of ['fr','de','es','it','pt','pt-pt','nl','pl','ru','ja','zh'])assert.notEqual(translations[language].showQuickAccess,translations.en.showQuickAccess,language);
});
