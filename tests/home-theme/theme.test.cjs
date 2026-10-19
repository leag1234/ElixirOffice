// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const filename=process.env.UPSTREAM?path.join(path.resolve(process.env.UPSTREAM),'document-server-integration/web/documentserver-example/nodejs/public/elixir/home-theme.js'):path.resolve(__dirname,'../../desktop/assets/desktop-home/home-theme.js');
assert(fs.existsSync(filename),'Set UPSTREAM to an owned DocumentServer source tree, or assemble desktop/assets before running the standalone theme test');
const resolve=options=>require(filename).resolve(options);
test('Home follows OS appearance when there is no explicit UI selection',()=>{
 assert.equal(resolve({systemDark:false}),'light');assert.equal(resolve({systemDark:true}),'dark');
});
test('built-in app UI preferences override opposite OS appearance',()=>{
 for(const id of ['theme-dark','theme-night','theme-contrast-dark'])assert.equal(resolve({id,systemDark:false}),'dark');
 for(const id of ['theme-white','theme-gray','theme-classic-light','theme-light'])assert.equal(resolve({id,systemDark:true}),'light');
});
test('system UI mode follows OS rather than stale cached or live type',()=>{
 for(const systemDark of [false,true])assert.equal(resolve({id:'theme-system',cache:{id:'theme-system',type:'dark'},liveId:'theme-system',liveType:'light',systemDark}),systemDark?'dark':'light');
});
test('custom UI type is used only for the matching selected theme',()=>{
 assert.equal(resolve({id:'custom-public',cache:{id:'custom-public',type:'dark'},systemDark:false}),'dark');
 assert.equal(resolve({id:'custom-public',cache:{id:'other',type:'dark'},systemDark:false}),'light');
 assert.equal(resolve({id:'custom-public',cache:{id:'custom-public',type:'light'},systemDark:true}),'light');
 assert.equal(resolve({id:'custom-public',cache:{id:'custom-public',type:'invalid'},systemDark:true}),'dark');
});
test('the actual embedded host UI state has priority over a different saved selection',()=>{
 assert.equal(resolve({id:'theme-white',liveId:'theme-night',liveType:'dark',systemDark:false}),'dark');
 assert.equal(resolve({id:'theme-night',liveId:'theme-white',liveType:'light',systemDark:true}),'light');
 assert.equal(resolve({id:'theme-white',liveId:'public-custom',liveType:'dark',systemDark:false}),'dark');
});
test('invalid data and content-only dark mode do not select the UI appearance',()=>{
 for(const id of [undefined,null,0,{},[],false])assert.equal(resolve({id,cache:{},systemDark:true}),'dark');
 assert.equal(resolve({id:'theme-white',contentTheme:'dark',systemDark:true}),'light');
 assert.equal(resolve({id:'unknown',cache:'not an object',systemDark:false}),'light');
});
