// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;
assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS required');
const lib=path.join(web,'apps/common/main/lib');
function controller({configured=false,desktop=true,available=true}={}){
 const calls={setup:0,bar:0,open:0,ask:[],tools:0,settings:0},events=[];
 const ai={toolsets:{word:{create(){calls.tools++;throw Error('No toolset before consent');}}},Settings:{isConfigured:()=>configured},
 SettingsDialog:class{open(){calls.settings++;}},CommandBar:class{constructor(){calls.bar++;}open(){calls.open++;}ask(...args){calls.ask.push(args);}}};
 const Common={ElixirAI:ai,Controllers:{},Utils:{isMac:false},NotificationCenter:{trigger:(...e)=>events.push(e)}},window={Common,eoDesktopAI:desktop?{}:undefined};
 const context={window,Common,define:(_deps,f)=>f(),Backbone:{Controller:{extend:value=>value}},fetch(){assert.fail('Network forbidden in entry routing');}};
 vm.runInNewContext(fs.readFileSync(path.join(lib,'elixir-ai/Controller.js'),'utf8'),context);
 const instance={...Common.Controllers.ElixirAI,hasTab:true,api:{},appOptions:()=>({isEdit:available}),openSetup(){calls.setup++;},getApplication:()=>({getController:()=>({})})};
 return {instance,calls,events};
}
test('unconfigured desktop and web ask routes open setup without a command, toolset or remembered request',()=>{
 for(const desktop of [true,false]){
  const e=controller({desktop});e.instance.openBar();assert.equal(e.calls.setup,1);
  e.instance.ask('Synthetic private selection must not be queued',true);assert.equal(e.calls.setup,2);
  assert.equal(e.calls.bar,0);assert.equal(e.calls.open,0);assert.deepEqual(e.calls.ask,[]);assert.equal(e.calls.tools,0);
 }
});
test('available ribbon stays visible while transport activity stays false before setup',()=>{
 const e=controller();e.instance.refreshState();
 assert.deepEqual(e.events.map(e=>e.slice(0,3)),[['tab:visible','elixir',true],['elixir:ai-state',false,e.instance]]);
});
test('configured ask retains the existing command bar route',()=>{
 const e=controller({configured:true});assert.equal(e.instance.ask('Synthetic instruction',false),true);
 assert.equal(e.calls.setup,0);assert.equal(e.calls.bar,1);assert.equal(e.calls.open,1);assert.deepEqual(e.calls.ask,[['Synthetic instruction',false]]);assert.equal(e.calls.tools,0);
});
test('unavailable editor stays unavailable without creating setup or transport',()=>{
 const e=controller({available:false});assert.equal(e.instance.ask('Synthetic instruction'),false);assert.equal(e.calls.setup,0);assert.equal(e.calls.bar,0);
});
function title(mac){
 const listeners=[],Common={Utils:{isMac:mac,String:{htmlEncode:String}},Views:{}};
 const window={Common,addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture})};
 vm.runInNewContext(fs.readFileSync(path.join(lib,'elixir-chrome/TitleBar.js'),'utf8'),{window,Common,define:(_deps,f)=>f(),Backbone:{View:{extend:value=>value}},_:{extend:Object.assign}});
 const instance={...Common.Views.ElixirTitleBar};let focused=0;instance.focusSearch=()=>focused++;instance.bindShortcut();
 return {instance,listeners,focused:()=>focused};
}
test('Mac title search uses the actual Control Option glyphs and exact Control Option Q binding',()=>{
 const e=title(true);assert.equal(e.instance.shortcut(),'⌃⌥Q');assert.deepEqual(Array.from(e.instance.shortcut()).map(c=>c.codePointAt(0)),[0x2303,0x2325,0x51]);
 assert.equal(e.listeners.length,1);assert.equal(e.listeners[0].capture,true);
 for(const [ctrlKey,altKey,metaKey,shiftKey,code,expected]of [[true,true,false,false,'KeyQ',true],[false,true,false,false,'KeyQ',false],[true,true,true,false,'KeyQ',false],[true,true,false,true,'KeyQ',false],[true,true,false,false,'KeyI',false]]){
  const before=e.focused();let prevented=false,stopped=false;e.listeners[0].fn({code,ctrlKey,altKey,metaKey,shiftKey,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(e.focused()-before,Number(expected));assert.equal(prevented,expected);assert.equal(stopped,expected);
 }
});
test('non-Mac title search retains Alt Q',()=>{
 const e=title(false);assert.equal(e.instance.shortcut(),'Alt+Q');
 e.listeners[0].fn({code:'KeyQ',ctrlKey:false,altKey:true,metaKey:false,shiftKey:false,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(e.focused(),1);
});

test('ribbon/native Options settings route unconfigured users to setup and retain configured settings',()=>{
 for(const desktop of [true,false]){
  const off=controller({desktop});off.instance.openSettings(false);assert.equal(off.calls.setup,1);assert.equal(off.calls.settings,0);
  const on=controller({desktop,configured:true});on.instance.openSettings(false);assert.equal(on.calls.setup,0);assert.equal(on.calls.settings,1);
 }
});
