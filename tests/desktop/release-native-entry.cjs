// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Test-only entry: real main/preload/renderers, synthetic API and browser action.
const path=require('node:path'),Module=require('node:module'),electron=require('electron');
const main=path.join(process.env.EO_PRODUCT_ROOT,'desktop/main.cjs'),original=Module._load;
const fixture={calls:0,opened:[]};global.__EOReleaseFixture=fixture;
Module._load=function(name,parent,...args){
 if(parent?.filename===main&&name==='electron')return {...electron,shell:{...electron.shell,openExternal:async url=>{fixture.opened.push(url)}}};
 const value=original.call(this,name,parent,...args);
 if(parent?.filename===main&&name==='./release-notice.cjs')return {...value,create:options=>{fixture.runningVersion=options.version;const service=value.create({...options,fetch:async()=>{
  fixture.calls++;return [{tag_name:'v99.0.0-beta.1',html_url:'https://github.com/leag1234/elixiroffice/releases/tag/v99.0.0-beta.1',draft:false,prerelease:true}];
 }});return {...service,check(){fixture.checkCalls=(fixture.checkCalls||0)+1;return service.check()}}}};
 return value;
};
require(main);
