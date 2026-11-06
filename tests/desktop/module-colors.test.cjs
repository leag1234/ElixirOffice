// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const homeCSS=read('desktop/home.css'),tabsCSS=read('desktop/tabs.css'),homeJS=read('desktop/home.js'),tabsJS=read('desktop/tabs.js');
const variables=['--eo-module-word','--eo-module-cell','--eo-module-slide','--eo-module-pdf'];
test('module colours are defined for light and dark themes',()=>{
 for(const css of [homeCSS,tabsCSS]){
  for(const name of variables)assert(css.includes(name+':#'),name+' is missing');
  assert(css.includes(':root{'), 'light theme is missing');
  assert(css.includes(':root[data-eo-theme=dark]{'), 'explicit dark theme is missing');
 }
 assert(tabsCSS.includes('@media(prefers-color-scheme:dark)'), 'tabs system dark theme is missing');
});
test('Home tiles and recent icons use module colours',()=>{
 assert(homeJS.includes("thumb-'+type"), 'Home does not create typed blank tiles');
 assert(homeJS.includes("symbol.classList.add('t-'+type)"), 'Home does not create typed recent icons');
 for(const name of variables)assert(homeCSS.includes('var('+name+')'),name+' is not used');
 assert(homeCSS.includes('.tile-blank .thumb{border-inline-start:3px solid'), 'blank tile accent is missing');
 assert(homeCSS.includes('.file-link .ic.t-word'), 'recent icon tint is missing');
});
test('document tabs use typed icons and module accents',()=>{
 assert(tabsJS.includes("icon.setAttribute('class','document-icon t-'+type)"), 'tabs do not create typed icons');
 assert(tabsJS.includes("icon.setAttribute('class','document-icon t-'+type);icon.setAttribute('aria-hidden','true')"), 'tab list does not create typed icons');
 for(const name of variables)assert(tabsCSS.includes('var('+name+')'),name+' is not used');
 assert(tabsCSS.includes('.document-tab{border-inline-start:3px solid'), 'tab accent is missing');
});
