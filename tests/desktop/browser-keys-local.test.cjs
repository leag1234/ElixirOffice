// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const upstream=process.env.EO_WEBAPPS||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer/web-apps');
function boot(mode){
 let appended=0,shown=0,bindings=0;
 const main={appOptions:{},api:{}};
 if(mode==='local')main.api.eoLocalMode=true;
 const Common={Controllers:{},UI:{Window:function(){this.on=()=>{};this.show=()=>shown++;}},NotificationCenter:{on:()=>bindings++}};
 const window={Common,parent:mode==='desktop'?{eoDesktop:{onAction(){}}}:{},DE:{getController:()=>main},addEventListener:()=>bindings++,localStorage:{getItem:()=>null,setItem(){}},postMessage(){}};
 const element=()=>({setAttribute(){},querySelector:()=>({addEventListener(){}})});
 const document={createElement:element,getElementById:()=>null,body:{appendChild:()=>appended++},head:{appendChild:()=>appended++},addEventListener:()=>bindings++};
 const Backbone={Controller:{extend:value=>value}};
 const context={window,Common,navigator:{platform:'Linux'},document,Backbone,_:{extend:Object.assign},define:(_deps,f)=>f(),setTimeout:()=>0,Date,KeyboardEvent:function(){}};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'apps/common/main/lib/elixir-browserkeys/Controller.js'),'utf8'),context);
 const controller=Common.Controllers.ElixirBrowserKeys;
 controller.initialize();return {controller,BK:Common.ElixirBrowserKeys,main,counts:()=>({appended,shown,bindings})};
}
test('desktop and browser-local modes never show browser-reserved notice or dialog',()=>{
 for(const mode of ['desktop','local']){
  const env=boot(mode);
  env.controller.showHint(true);env.controller.showDialog();env.controller.onAppReady();
  assert.equal(env.counts().appended,0);assert.equal(env.counts().shown,0);

 }
});
test('hosted mode retains the browser notice, help dialog and listeners',()=>{
 const env=boot('hosted');env.controller.showHint(true);env.controller.showDialog();
 assert.equal(env.counts().appended,1);assert.equal(env.counts().shown,1);assert(env.counts().bindings>0);
});
test('late local-mode initialization also suppresses an already registered hint callback',()=>{
 const env=boot('hosted');env.main.appOptions.isElixirLocal=true;
 env.controller.showHint(true);env.controller.showDialog();assert.equal(env.counts().appended,0);assert.equal(env.counts().shown,0);
});

test('browser-local mode keeps the existing alternative editing shortcuts',()=>{
 const env=boot('local');let played=null;
 env.controller.play=value=>played=value;
 env.controller.onKeyDown({isTrusted:true,ctrlKey:true,metaKey:false,shiftKey:true,altKey:true,code:'KeyW',preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(played.code,'KeyW');assert.equal(played.shift,true);
});
