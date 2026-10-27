// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Test-only source launcher. No production preference/environment enables it.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),electron=require('electron');
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,main=path.join(root,'desktop/main.cjs');
const original=Module._load,{fixture}=require('./fixtures/update-test-kit.cjs'),{createAdapter}=require(path.join(root,'desktop/update-handoff.cjs'));
const f=fixture({platform:'linux'}),record={api:0,factory:0,prepare:0,abort:0,nativeLaunch:0,dispose:0,network:0,exits:[]};
let pending,progress;
function denied(){record.network++;throw Error('Unexpected network or installer call');}
for(const module of ['node:http','node:https'])for(const key of ['request','get'])require(module)[key]=denied;
for(const key of ['lookup','resolve'])require('node:dns')[key]=denied;
global.fetch=denied;
const shell=Object.create(electron.shell);Object.defineProperty(shell,'openExternal',{value:async()=>{record.browser=(record.browser||0)+1;}});
const net=Object.create(electron.net);Object.defineProperty(net,'request',{value:denied});
Object.defineProperty(net,'fetch',{value:(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.protocol!=='file:')return denied();return electron.net.fetch(input,options);}});
const api=Object.create(electron);Object.defineProperties(api,{shell:{value:shell},net:{value:net},autoUpdater:{get:denied}});
global.__EOUpdateFixture={
 snapshot:()=>({...record}),
 finish(){pending?.resolve({});},
 progress(value){progress?.(value);},
};
process.on('exit',()=>fs.writeFileSync(path.join(out,'exit-'+(process.env.EO_UI_CASE||'0')+'.json'),JSON.stringify(record,null,2)));
Module._load=function(name,parent,...args){
 if(name==='electron-updater')return denied();
 if(parent?.filename===main&&name==='electron')return api;
 const value=original.call(this,name,parent,...args);
 if(parent?.filename===main&&name==='./release-notice.cjs')return {...value,create:options=>value.create({...options,fetch:async()=>{record.api++;return [{tag_name:'v0.4.0',html_url:'https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0',draft:false}];}})};
 if(parent?.filename===main&&name==='./update-controller.cjs')return {...value,createController:options=>{
  const service=value.createController({...options,policy:f.policy,runtime:f.runtime,eligible:async()=>true,
   createSession:async()=>{record.factory++;return {
    async prepare(_notice,{signal,progress:changed}){
     record.prepare++;progress=changed;
     return new Promise((resolve,reject)=>{
      pending={resolve,reject};const abort=()=>{record.abort++;reject(Error('Synthetic preparation canceled'));};
      signal.addEventListener('abort',abort,{once:true});
      pending.resolve=value=>{signal.removeEventListener('abort',abort);resolve(value);};
     });
    },
    async install(){return {adapter:createAdapter({launch(callbacks){record.nativeLaunch++;callbacks.success();return true;}}),revalidate:async()=>true,release:async()=>{}};},
    dispose(){record.dispose++;},
   };}});
  return {...service,exit:options=>{record.exits.push(options.reason);return service.exit(options);}};
 }};
 return value;
};
require(main);
