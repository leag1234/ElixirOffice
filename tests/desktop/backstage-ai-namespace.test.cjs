// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const [name,ai,enabled]of [['absent',undefined,false],['empty',{},false],['locale-only',{ConfigForm:{desktopKeyLabel:'localized'}},false],['unconfigured',{Settings:{isConfigured:()=>false}},false],['configured',{Settings:{isConfigured:()=>true}},true]]){
 test('native backstage accepts '+name+' AI namespace and preserves Help',async()=>{
  let shown=0,disabled,aiVisible,hidden=0,handler,command;
  const element={find(){return this},off(){return this},on(_name,fn){handler=fn;return this},insertAfter(){return this}};
  const fm={$el:element,miHelp:{show(){shown++},setDisabled(value){disabled=value}},hide(){hidden++},fireEvent(){throw Error('Server event must not receive native Help')}};
  const bs={rendered:true,fm,items:{'elx-ai':{show(){aiVisible=true},hide(){aiVisible=false}}},afterApplyMode(){}};
  const win={SSE:{getController:()=>({backstage:bs})},Common:{ElixirAI:ai},$:()=>element,document:{createElement:()=>({}),head:{append(){}}}};
  const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../desktop/backstage.js'),'utf8'),{window});
  await window.EODesktopBackstage(win,{api:{}},{strings:{},language:'en'},value=>{command=value});
  assert.equal(shown,1);assert.equal(disabled,false);assert.equal(aiVisible,enabled);
  let prevented=false,stopped=false;handler({preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});
  assert(prevented&&stopped);assert.equal(hidden,1);assert.equal(command,'help');
 });
}
