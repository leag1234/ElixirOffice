// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../desktop/renderer.js'),'utf8');
const functions=source.slice(source.indexOf('async function fontConsent()'),source.indexOf('async function drop('));
function setup(initial,answers){
 let choice=initial,permission=choice==='granted',dialogs=0,reads=0,disable=0,reloads=0;const elements=[];
 const createElement=tag=>{const e={tag,children:[],append(...nodes){this.children.push(...nodes)},addEventListener(name,fn){this[name]=fn}};elements.push(e);return e};
 const LF={fonts:['cached'],setConsent(value){this.consent=value},setStatus(value){this.status=value},async readList(){reads++},async enable(){this.enabled=true}};
 const eoDesktop={async fontPermission(){return permission},async fontChoice(){return choice},async fontConsent(){if(permission)return true;dialogs++;permission=answers.shift()===true;choice=permission?'granted':'declined';return permission},async fontDisable(){disable++;permission=false;choice='declined';return true}};
 const errors=[],context={document:{createElement,createTextNode:text=>({text})},eoDesktop,frame:{Common:{ElixirLocalFonts:LF},location:{reload(){reloads++}}},main:{api:{}},t:key=>key,installFonts:async()=>{LF.setConsent(permission)},status(){},fail:error=>errors.push(error)};
 vm.createContext(context);vm.runInContext(functions,context);
 return {context,elements,LF,errors,eoDesktop,stats:()=>({choice,permission,dialogs,reads,disable,reloads})};
}
for(const initial of ['unset','declined','granted'])test('Options reports '+initial+' and changes fonts through native consent without reload',async()=>{
 const env=setup(initial,[false,true]),box={append(){}};
 await env.context.addFontOptions(box);
 const checkbox=env.elements.find(e=>e.id==='computer-fonts-enabled'),state=env.elements.find(e=>e.id==='computer-fonts-status'),hint=env.elements.find(e=>e.id==='computer-fonts-hint');
 assert.equal(checkbox.checked,initial==='granted');assert.equal(state.textContent,initial==='granted'?'fontEnabled':initial==='declined'?'fontDisabled':'fontUnset');assert.equal(hint.textContent,'fontReopen');
 if(initial==='granted'){checkbox.checked=false;await checkbox.change();assert.equal(env.stats().disable,1);assert.equal(env.LF.fonts,null);assert.equal(env.LF.consent,false);assert.equal(env.LF.status,'off');}
 checkbox.checked=true;await checkbox.change();assert.equal(checkbox.checked,false);assert.equal(state.textContent,'fontDisabled');assert.equal(env.stats().reads,0);
 checkbox.checked=true;await checkbox.change();assert.equal(checkbox.checked,true);assert.equal(state.textContent,'fontEnabled');assert.equal(env.stats().reads,1);assert.equal(env.stats().dialogs,2);
 checkbox.checked=false;await checkbox.change();assert.equal(checkbox.checked,false);assert.equal(env.LF.fonts,null);assert.equal(env.LF.consent,false);
 assert.equal(env.stats().reloads,0);assert.equal(checkbox.disabled,false);assert.equal(env.errors.length,0);
});
test('font Options reports a bridge failure and restores the authoritative state',async()=>{
 const env=setup('granted',[]);env.eoDesktop.fontDisable=async()=>{throw Error('synthetic bridge failure')};
 await env.context.addFontOptions({append(){}});
 const checkbox=env.elements.find(e=>e.id==='computer-fonts-enabled');checkbox.checked=false;await checkbox.change();
 assert.equal(checkbox.checked,true);assert.equal(checkbox.disabled,false);assert.equal(env.errors.length,1);
});
test('font Options keys exist in all 45 locale catalogs',()=>{
 const catalogs=JSON.parse(fs.readFileSync(require.resolve('../../tools/desktop/i18n-extra.json'),'utf8'));
 assert.equal(Object.keys(catalogs).length,45);
 for(const strings of Object.values(catalogs))for(const key of ['fontComputer','fontEnabled','fontDisabled','fontUnset','fontReopen'])assert.equal(typeof strings[key],'string');
 assert.match(catalogs.fr.fontReopen,/Enregistrez/);
});

