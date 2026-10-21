// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {command}=require('../../desktop/shortcuts.cjs'),{template}=require('../../desktop/menu.cjs');
test('platform Close document chords route to a tab without consuming formatting variants',()=>{
 for(const platform of ['linux','win32','darwin']){
  const base={type:'keyDown',key:'w',control:platform!=='darwin',meta:platform==='darwin'};
  assert.equal(command(base,platform,'docx'),'close-tab');
  for(const extra of [{shift:true},{alt:true},{isComposing:true},{type:'keyUp'},{modifiers:['AltGraph']}])assert.equal(command({...base,...extra},platform,'docx'),null);
  assert.equal(command({type:'keyDown',key:'F4',control:true},platform,'docx'),platform==='darwin'?null:'close-tab');
  for(const extra of [{shift:true},{alt:true},{meta:true}])assert.equal(command({type:'keyDown',key:'F4',control:true,...extra},platform,'docx'),null);
  for(const key of ['Tab','F6'])assert.equal(command({...base,key},platform,'docx'),null,'Preserve editor navigation');
 }
});
test('native Close document accelerator appears once and Mac window Close cannot steal it',()=>{
 const flatten=items=>items.flatMap(item=>[item,...(item.submenu?flatten(item.submenu):[])]);
 for(const platform of ['linux','win32','darwin']){
  const dispatched=[],menu=flatten(template(platform,name=>()=>dispatched.push(name),()=>{}));
  const close=menu.find(item=>item.accelerator==='CommandOrControl+W');assert(close);close.click();assert.deepEqual(dispatched,['close-tab']);
  assert.equal(menu.filter(item=>item.accelerator==='CommandOrControl+W'||item.accelerator==='Command+W').length,1);
  if(platform==='darwin')assert.equal(menu.find(item=>item.role==='close').accelerator,'');
 }
});
