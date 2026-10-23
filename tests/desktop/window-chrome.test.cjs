// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {policy}=require('../../desktop/window-chrome.cjs');
for(const platform of ['linux','win32','darwin','freebsd',undefined]){
 test(String(platform)+' keeps native frame by default',()=>{
  const result=policy({platform,overlayAvailable:true});
  assert.equal(result.effectiveFrame,'native');assert.equal(result.titleHeight,0);assert.deepEqual(result.windowOptions,{});
 });
}
for(const platform of ['win32','darwin','freebsd']){
 test(platform+' automatically falls back even for a stored custom preference',()=>{
  const result=policy({platform,customTitleBar:true,overlayAvailable:true});
  assert.equal(result.available,false);assert.equal(result.effectiveFrame,'native');assert.deepEqual(result.windowOptions,{});
 });
}
for(const overlayAvailable of [false,undefined,null,'true',1]){
 test('Linux requires verified boolean overlay support: '+String(overlayAvailable),()=>{
  const result=policy({platform:'linux',customTitleBar:true,overlayAvailable});
  assert.equal(result.available,false);assert.equal(result.effectiveFrame,'native');
 });
}
test('explicit Linux opt-in retains real native controls in a compact band',()=>{
 const result=policy({platform:'linux',customTitleBar:true,overlayAvailable:true});
 assert.equal(result.available,true);assert.equal(result.effectiveFrame,'compact');assert.equal(result.titleHeight,36);
 assert.deepEqual(result.windowOptions,{titleBarStyle:'hidden',titleBarOverlay:{height:36}});
 assert.equal(Object.hasOwn(result.windowOptions,'frame'),false);
 assert(Object.isFrozen(result));assert(Object.isFrozen(result.windowOptions));assert(Object.isFrozen(result.windowOptions.titleBarOverlay));
});
for(const customTitleBar of [false,undefined,null,1,'true']){
 test('Linux requires a literal true preference: '+String(customTitleBar),()=>{
  const result=policy({platform:'linux',customTitleBar,overlayAvailable:true});
  assert.equal(result.available,true);assert.equal(result.effectiveFrame,'native');
 });
}
test('the pure frame policy cannot mutate its caller or own document/layout geometry',()=>{
 const input={platform:'linux',customTitleBar:true,overlayAvailable:true,windowState:{bounds:{x:1,y:2,width:900,height:700}},openInTabs:true};
 const before=structuredClone(input),result=policy(input);
 assert.deepEqual(input,before);
 for(const key of ['x','y','width','height','webPreferences','openInTabs','showHomeTab'])assert.equal(Object.hasOwn(result.windowOptions,key),false);
});
for(const displayBackend of ['wayland','auto','unknown'])test('unqualified Linux '+displayBackend+' retains native controls',()=>{
 const result=policy({platform:'linux',customTitleBar:true,overlayAvailable:true,displayBackend});
 assert.equal(result.available,false);assert.equal(result.effectiveFrame,'native');
});
