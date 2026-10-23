// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Test-only transport: no internet requests or external browser.
const path=require('node:path'),Module=require('node:module'),electron=require('electron');
const language=process.env.EO_COMPACT_LOCALE||'en',theme=process.env.EO_COMPACT_THEME||'light';
if(!['en','fr'].includes(language)||!['light','dark'].includes(theme))throw Error('Unsupported compact test locale/theme');
electron.app.getPreferredSystemLanguages=()=>[language];electron.app.getLocale=()=>language;electron.nativeTheme.themeSource=theme;
const main=path.join(process.env.EO_PRODUCT_ROOT,'desktop/main.cjs'),original=Module._load;
Module._load=function(name,parent,...args){
 const value=original.call(this,name,parent,...args);
 if(parent?.filename===main&&name==='./tabs-host.cjs')return {...value,createTabHost:options=>{
  const windows=[];
  if(process.env.EO_RECOVERY_CASE){
   if(!['startup','runtime','runtime-missing'].includes(process.env.EO_RECOVERY_CASE))throw Error('Unsupported recovery test case');
   const NativeWindow=options.BrowserWindow;
   function TestWindow(settings){const window=new NativeWindow(settings),compact=settings.titleBarStyle==='hidden';windows.push({window,compact});
    if(compact&&process.env.EO_RECOVERY_CASE==='startup'){const load=window.loadURL.bind(window);window.loadURL=(url,...args)=>url.endsWith('/tabs.html')?Promise.reject(Error('Injected compact startup failure')):load(url,...args);}
    return window;
   }
   TestWindow.prototype=NativeWindow.prototype;options={...options,BrowserWindow:TestWindow};
  }
  const host=value.createTabHost(options);global.__EOCompactFixture={host,registry:options.registry,windows};return host;
 }};
 if(parent?.filename===main&&name==='./release-notice.cjs')return {...value,create:options=>value.create({...options,fetch:async()=>[]})};
 return value;
};
require(main);
