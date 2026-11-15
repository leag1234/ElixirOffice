// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const graphics=require('../../desktop/graphics.cjs'),catalogs=require('../../tools/desktop/i18n-extra.json'),english=require('../../desktop/tab-strings.json');
function profile(content){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo-gpu-'));if(content!==undefined)fs.writeFileSync(path.join(dir,'desktop-settings.json'),content);return dir;}
test('missing, corrupt or unrelated settings leave hardware acceleration on',()=>{
 for(const content of [undefined,'{not json','null','[]','{"hardwareAcceleration":"no"}','{"hardwareAcceleration":true}','{}']){
  const dir=profile(content);try{assert.equal(graphics.readSetting(dir),true,String(content));}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 assert.equal(graphics.readSetting('/nonexistent-eo-profile'),true);
});
test('a saved false turns acceleration off',()=>{
 const dir=profile(JSON.stringify({recents:[],hardwareAcceleration:false}));
 try{assert.deepEqual(graphics.decide({userData:dir}),{disabled:true,source:'setting'});}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('startup decision: command line wins, then environment, then setting',()=>{
 const off=profile('{"hardwareAcceleration":false}'),on=profile('{}');
 try{
  assert.deepEqual(graphics.decide({argv:['app','--disable-gpu'],env:{},userData:on}),{disabled:true,source:'command-line'});
  assert.equal(graphics.decide({argv:['--disable-gpu'],env:{ELIXIROFFICE_DISABLE_GPU:'1'},userData:off}).source,'command-line');
  assert.deepEqual(graphics.decide({argv:[],env:{ELIXIROFFICE_DISABLE_GPU:'1'},userData:on}),{disabled:true,source:'environment'});
  assert.equal(graphics.decide({argv:[],env:{ELIXIROFFICE_DISABLE_GPU:'true'},userData:on}).disabled,true);
  assert.deepEqual(graphics.decide({argv:[],env:{ELIXIROFFICE_DISABLE_GPU:'0'},userData:on}),{disabled:false,source:null});
  assert.deepEqual(graphics.decide({argv:[],env:{ELIXIROFFICE_DISABLE_GPU:''},userData:on}),{disabled:false,source:null});
  assert.equal(graphics.decide({argv:[],env:{},userData:off}).source,'setting');
  assert.deepEqual(graphics.decide({}),{disabled:false,source:null});
 }finally{for(const d of [off,on])fs.rmSync(d,{recursive:true,force:true});}
});
test('the About summary reports state and display backend',()=>{
 const t=key=>english[key];
 assert.equal(graphics.summary({disabled:true},t,'wayland'),'Use hardware graphics acceleration: Off\nDisplay: wayland');
 assert.match(graphics.summary({disabled:false},t,'x11'),/: On\nDisplay: x11$/);
});
test('main applies the decision at startup and the setting is a window key',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/main.cjs'),'utf8');
 const call=source.indexOf('app.disableHardwareAcceleration()');
 assert(call>0);assert(call<source.indexOf('async function start()'));
 assert.equal((source.match(/'hardwareAcceleration'\]/g)||[]).length,3);
});
test('the option is translated for the main desktop languages',()=>{
 const keys=['hardwareAcceleration','hardwareAccelerationNote','hardwareAccelerationRestart','graphicsOn','graphicsOff'];
 for(const language of ['en','fr','de','es','it','ru','nl','pt','pt-pt'])for(const key of keys)assert(catalogs[language][key]?.trim(),language+':'+key);
 for(const key of keys)assert(english[key]);
 assert.notEqual(catalogs.fr.hardwareAcceleration,catalogs.en.hardwareAcceleration);
});
