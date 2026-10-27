// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web));const inventory=require('../fixtures/reviewed-i18n/ai-slide-strings-Z.json');
test('presentation English UI source is sealed for the fifteen-key translation reviewer review',()=>{
 let strings;const source=fs.readFileSync(path.join(web,inventory.source),'utf8');vm.runInNewContext(source,{define:(_d,f)=>strings=f()});
 assert.equal(Object.isFrozen(strings),true);assert.equal(Object.keys(strings).length,15);assert.deepEqual(Object.keys(strings),inventory.keys);
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),inventory.source_sha256);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(strings,null,2)+'\n').digest('hex'),inventory.translation_source.sha256);
});
test('reviewed presentation catalogs match the independently sealed Z artifact projection',()=>{
 assert.equal(inventory.status,'reviewed-session-Z');
 assert.equal(inventory.translation_artifact.sha256,'2991d563d662ae498153c1fc7ff1de6b74f9e4e8486f3ad3961ce11fdac42284');
 assert.equal(inventory.reviewed_locales.length,44);assert.equal(inventory.reviewed_locales.includes('en'),false);
 assert.deepEqual(inventory.reviewed_locales,[...inventory.locales].filter(l=>l!=='en').sort());
 const values={};
 for(const locale of inventory.reviewed_locales){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps/presentationeditor/main/locale',locale+'.json')));
  values[locale]=Object.fromEntries([...inventory.keys].sort().map(key=>[key,catalog['Common.ElixirAI.SlideStrings.'+key]]));
 }
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'),inventory.reviewed_catalog_sha256);
});
test('all forty-five presentation catalogs preserve English source, nonempty reviewed fields and exact interpolation',()=>{
 let strings;vm.runInNewContext(fs.readFileSync(path.join(web,inventory.source),'utf8'),{define:(_d,f)=>strings=f()});
 assert.equal(inventory.locales.length,45);
 for(const locale of inventory.locales){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps/presentationeditor/main/locale',locale+'.json')));
  for(const key of inventory.keys){
   const actual=catalog['Common.ElixirAI.SlideStrings.'+key];assert.equal(typeof actual,'string',locale+':'+key);assert(actual.trim(),locale+':'+key);
   if(locale==='en')assert.equal(actual,strings[key],key);
   assert.deepEqual((actual.match(/\{[^{}]+\}/g)||[]).sort(),(strings[key].match(/\{[^{}]+\}/g)||[]).sort(),locale+':'+key);
  }
 }
});
