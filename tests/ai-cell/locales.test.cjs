// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const web=process.env.EO_WEB_APPS,inventory=require('../fixtures/reviewed-i18n/ai-cell-strings-Z.json');
test('all45 spreadsheet locales retain the sealed English source and nonempty Cell fields',()=>{
 let strings;const src=fs.readFileSync(path.join(web,inventory.source),'utf8');vm.runInNewContext(src,{define:(_d,f)=>strings=f()});
 assert.equal(crypto.createHash('sha256').update(src).digest('hex'),inventory.source_sha256);assert.equal(Object.keys(strings).length,19);assert.equal(inventory.locales.length,45);
 assert.deepEqual(Object.keys(strings),inventory.keys);assert.equal(Object.isFrozen(strings),true);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(strings,null,2)+'\n').digest('hex'),inventory.translation_source.sha256);
 for(const locale of inventory.locales){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/locale',locale+'.json')));
  for(const [key,value]of Object.entries(strings)){const actual=catalog['Common.ElixirAI.CellStrings.'+key];assert.equal(typeof actual,'string',locale+':'+key);assert(actual.trim());if(locale==='en')assert.equal(actual,value);}
 }
});
test('reviewed spreadsheet catalogs match the independently sealed Z v2 artifact projection',()=>{
 assert.equal(inventory.status,'reviewed-session-Z');
 assert.equal(inventory.translation_artifact.sha256,'6586e65cc0873317fa8f140fed9b707b1d86533d63f4294b8fa9f2eee2f2c3f8');
 assert.equal(inventory.translation_source.sha256,'f4b7f060996616fba34ba0350d31722caa7ee9c1b10b568e97b91a1afb4d24ad');
 assert.equal(inventory.reviewed_locales.length,44);assert.equal(inventory.reviewed_locales.includes('en'),false);
 assert.deepEqual(inventory.reviewed_locales,[...inventory.locales].filter(l=>l!=='en').sort());
 const values={};
 for(const locale of inventory.reviewed_locales){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/locale',locale+'.json')));
  values[locale]=Object.fromEntries([...inventory.keys].sort().map(key=>[key,catalog['Common.ElixirAI.CellStrings.'+key]]));
 }
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'),inventory.reviewed_catalog_sha256);
});
test('spreadsheet translations preserve exact interpolation placeholders in every locale',()=>{
 const english=JSON.parse(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/locale/en.json')));
 for(const locale of inventory.locales){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/locale',locale+'.json')));
  for(const key of inventory.keys){const name='Common.ElixirAI.CellStrings.'+key;assert.deepEqual((catalog[name].match(/\{[^{}]+\}/g)||[]).sort(),(english[name].match(/\{[^{}]+\}/g)||[]).sort(),locale+':'+key);}
 }
});
test('authored evaluation contains30 independent cases with15 English and15 French prompts and explicit final-state criteria',()=>{
 const tasks=require('./tasks.json');assert.equal(tasks.length,30);assert.equal(new Set(tasks.map(t=>t.id)).size,30);
 assert.equal(tasks.filter(t=>t.lang==='en').length,15);assert.equal(tasks.filter(t=>t.lang==='fr').length,15);
 for(const task of tasks){assert(task.instruction&&task.data.length&&task.selection&&Object.keys(task.criteria).length);}
 for(const category of ['formula','explain','clean','sort','filter','chart','pivot','summary'])assert(tasks.some(t=>t.category===category));
});
