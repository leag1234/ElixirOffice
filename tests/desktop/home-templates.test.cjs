// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {resolve}=require('../../desktop/templates.cjs');
const brand=path.resolve(__dirname,'../../branding/example/nodejs/public/elixir/brand/templates');
test('four Home templates resolve every UI language and matching existing thumbnails',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(brand,'templates.json'))),words=JSON.parse(fs.readFileSync(path.join(brand,'localized-content.json')));
 assert.equal(catalog.templates.length,4);
 for(const item of catalog.templates){
  assert(item.languages.length>0&&item.languages.length<=45);assert(item.languages.includes('en'));
  assert(!fs.existsSync(path.join(brand,item.file)),'Flat default must not ship');
  for(const language of Object.keys(words)){
   const chosen=item.languages.includes(language)?language:'en';const selected=resolve(item,language);assert.equal(selected.file,chosen+'/'+item.file);assert.equal(selected.thumb,chosen+'/'+item.thumb);assert.equal(selected.title,item.title[chosen]);
   assert.equal(typeof selected.title,'string');assert(selected.title.length>0);
   for(const key of ['file','thumb']){const file=path.resolve(brand,selected[key]);assert(file.startsWith(brand+path.sep));assert(fs.statSync(file).size<100000);}
   const png=fs.readFileSync(path.join(brand,selected.thumb));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),264);assert.equal(png.readUInt32BE(20),374);
  }
  assert.equal(resolve(item,'unknown').file,'en/'+item.file);assert.equal(resolve(item,'unknown').thumb,'en/'+item.thumb);assert.equal(resolve(item,'unknown').title,item.title.en);
 }
 execFileSync('python3',[path.join(__dirname,'home-templates.test.py')],{stdio:'pipe'});
});
test('native Home and opening use the current UI language and localized title',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../../desktop/main.cjs'),'utf8'),home=fs.readFileSync(path.join(__dirname,'../../desktop/home.js'),'utf8');
 assert(main.includes("templates.map(item=>require('./templates.cjs').resolve(item,languageInfo.language,fontOptions))"));
 assert(main.includes("require('./templates.cjs').resolve(selected,languageInfo.language,fontOptions)"));
 assert(home.includes('template.title||t(template.titleKey)'));
});
