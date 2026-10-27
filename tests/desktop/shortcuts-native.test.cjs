// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {command,install}=require('../../desktop/shortcuts.cjs'),{template}=require('../../desktop/menu.cjs');
test('native file commands use the platform modifier and preserve unrelated editor chords',()=>{
 for(const platform of ['linux','win32','darwin']){
  const base={type:'keyDown',control:platform!=='darwin',meta:platform==='darwin',alt:false,shift:false};
  for(const [key,shift,expected] of [['o',false,'open'],['s',false,'save'],['s',true,platform==='darwin'?'save-as':null],['e',true,null],['p',false,'print'],['q',false,platform==='darwin'?'quit':null]]){
   assert.equal(command({...base,key,shift},platform,'docx'),expected);
   assert.equal(command({...base,key,shift,alt:true},platform,'docx'),null);
   assert.equal(command({...base,key,shift,control:!base.control,meta:!base.meta},platform,'docx'),null);
   assert.equal(command({...base,key,shift,isComposing:true},platform,'docx'),null);
   assert.equal(command({...base,key,shift,type:'keyUp'},platform,'docx'),null);
  }
  for(const [format,expected] of [['docx','new-docx'],['odt','new-docx'],['xlsx','new-xlsx'],['ods','new-xlsx'],['pptx','new-pptx'],['odp','new-pptx'],['pdf','new-docx'],[undefined,'new-docx']])assert.equal(command({...base,key:'n'},platform,format),expected);
  for(const [key,shift] of [['z',false],['z',true],['y',false],['a',false],['c',false],['v',false],['n',true],['p',true],['q',true],['e',false],['ArrowLeft',false]])assert.equal(command({...base,key,shift},platform,'docx'),null);
 }
});
test('Ctrl+Q remains editor-owned on Windows/Linux while Cmd+Q quits on macOS',()=>{
 for(const platform of ['linux','win32']){
  assert.equal(command({type:'keyDown',key:'q',control:true},platform,'docx'),null);
  const menu=template(platform,()=>()=>{},()=>{}),items=menu.flatMap(item=>[item,...(item.submenu||[])]);
  assert.equal(items.find(item=>item.id==='eo-menu-quit').accelerator,undefined);
 }
 assert.equal(command({type:'keyDown',key:'q',meta:true},'darwin','docx'),'quit');
 assert(template('darwin',()=>()=>{},()=>{}).flatMap(item=>[item,...(item.submenu||[])]).some(item=>item.role==='quit'));
});
test('one native keydown prevents renderer/menu double handling; repeats and capture stay blocked',()=>{
 let listener;const events=[],contents={on:(type,fn)=>{assert.equal(type,'before-input-event');listener=fn}};
 let enabled=true;
 install(contents,'linux',()=>'xlsx',value=>events.push(value),()=>enabled);
 let prevented=0;const event={preventDefault:()=>prevented++},input={type:'keyDown',key:'n',control:true};
 listener(event,input);assert.deepEqual(events,['new-xlsx']);assert.equal(prevented,1);
 listener(event,{...input,isAutoRepeat:true});assert.equal(events.length,1);assert.equal(prevented,2);
 enabled=false;listener(event,input);assert.equal(events.length,1);assert.equal(prevented,3);
 listener(event,{...input,key:'z'});assert.equal(prevented,3);
});

test('Office Save As and editor chords match native menu declarations on every platform',()=>{
 const {template}=require('../../desktop/menu.cjs');
 for(const platform of ['linux','win32','darwin']){
  const flatten=items=>items.flatMap(item=>[item,...(item.submenu?flatten(item.submenu):[])]);
  const menu=flatten(template(platform,()=>()=>{},()=>{})),mac=platform==='darwin';
  assert.equal(menu.find(item=>item.label==='Save As').accelerator,mac?'Command+Shift+S':'F12');
  assert.equal(menu.find(item=>item.label==='Export PDF').accelerator,undefined);
  if(!mac){
   const quit=menu.find(item=>item.id==='eo-menu-quit');
   assert.equal(quit.accelerator,undefined);assert.equal(quit.role,undefined);
  }else assert(menu.some(item=>item.role==='quit'),'Preserve the native macOS Quit role');
  assert.equal(command({type:'keyDown',key:'F12',code:'F12'},platform,'docx'),mac?null:'save-as');
  for(const extra of [{control:true},{shift:true},{alt:true},{meta:true}])assert.equal(command({type:'keyDown',key:'F12',...extra},platform,'docx'),null);
  for(const [key,code] of [['ж','KeyS'],['σ','KeyS'],['س','KeyS']]){
   const base={type:'keyDown',key,code,control:!mac,meta:mac};
   assert.equal(command(base,platform,'docx'),'save');
   for(const extra of [{alt:true},{isComposing:true},{modifiers:['AltGraph']}])assert.equal(command({...base,...extra},platform,'docx'),null);
  }
  assert.equal(command({type:'keyDown',key:'a',code:'KeyQ',control:!mac,meta:mac},platform,'docx'),null,'Latin layout key labels remain authoritative');
  assert.equal(command({type:'keyDown',key:'Process',code:'KeyS',control:!mac,meta:mac},platform,'docx'),null);
 }
});

test("F1 reaches native Help without consuming modified or composing keys",()=>{for(const platform of ["linux","win32","darwin"]){assert.equal(command({type:"keyDown",key:"F1"},platform,"docx"),"help");for(const extra of [{control:true},{meta:true},{shift:true},{alt:true},{isComposing:true},{type:"keyUp"}])assert.equal(command({type:"keyDown",key:"F1",...extra},platform,"docx"),null);}});
