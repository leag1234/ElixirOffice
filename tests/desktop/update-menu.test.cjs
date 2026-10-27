// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{template}=require('../../desktop/menu.cjs');
function all(items){return items.flatMap(item=>[item,...(Array.isArray(item.submenu)?all(item.submenu):[])]);}
for(const platform of ['linux','win32'])test('native '+platform+' Quit uses the explicit app command without stealing editor Ctrl+Q',()=>{
 const called=[],items=all(template(platform,name=>()=>called.push(name),()=>{},key=>key==='quit'?'Quitter':key)),commands=items.filter(item=>item.id==='eo-menu-quit');
 assert.equal(commands.length,1);const item=commands[0];
 assert.equal(item.role,undefined,'A built-in role ignores click and loses trusted user provenance');
 assert.equal(item.accelerator,undefined);assert(item.label.startsWith('Quitter'));
 item.click();assert.deepEqual(called,['quit']);
 assert(!items.some(item=>item.role==='quit'));
});

test('macOS retains the built-in Quit role and native behavior',()=>{
 const items=all(template('darwin',()=>()=>{},()=>{}));
 assert.deepEqual(items.filter(item=>item.role==='quit'),[{role:'quit'}]);
 assert(!items.some(item=>item.id==='eo-menu-quit'));
});
