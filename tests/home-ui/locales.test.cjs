// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const upstream=path.resolve(process.env.UPSTREAM),nodeRoot=path.join(upstream,'document-server-integration/web/documentserver-example/nodejs');
process.chdir(nodeRoot);
const home=require(path.join(nodeRoot,'helpers/elixirHome')),catalogDir=path.join(nodeRoot,'public/elixir/i18n'),english=JSON.parse(fs.readFileSync(path.join(catalogDir,'en.json')));
const placeholders=text=>[...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();
for(const language of ['ar','he','ur'])test(language+' Home catalog is complete and keeps interpolation contracts',()=>{
 const strings=JSON.parse(fs.readFileSync(path.join(catalogDir,language+'.json')));
 assert.deepEqual(Object.keys(strings).sort(),Object.keys(english).sort());
 for(const [key,value]of Object.entries(strings)){
  assert.equal(typeof value,'string');assert(value.trim(),key);assert.deepEqual(placeholders(value),placeholders(english[key]),key);
  assert(!/<\/?[a-z]/i.test(value),key+' must remain plain text');
  assert(!/[\u202a-\u202e]/.test(value),key+' must not contain embedding/override controls');
  let depth=0;for(const char of value){if(char==='\u2066')depth++;if(char==='\u2069')assert(depth-->0,key+' unmatched PDI');}assert.equal(depth,0,key+' unclosed LRI');
 }
 for(const key of ['nav.home','profile.title','nc.dialog.title','nc.error.network','error.unsupported'])assert.notEqual(strings[key],english[key],key);
});
test('real Home language resolver chooses supported RTL regional tags and preserves editor policy',()=>{
 for(const [requested,ui,editor]of [['ar-SA','ar','ar'],['he-IL','he','he-IL'],['ur-PK','ur','ur'],['fr-CA','fr','fr'],['en-GB','en','en-GB'],['fa-IR','en','en']])
  assert.deepEqual(home.resolveLanguage({query:{lang:requested},headers:{}}),{ui,editor});
 assert.deepEqual(home.resolveLanguage({query:{},headers:{'accept-language':'ar-SA,fr;q=0.8,en;q=0.4'}}),{ui:'ar',editor:'ar'});
 assert.deepEqual(home.resolveLanguage({query:{lang:'fr'},headers:{'accept-language':'ar'}}),{ui:'fr',editor:'fr'});
});
test('plain-text substitutions retain untrusted dynamic text without becoming markup',()=>{
 const name='Public <img> تقرير.docx';
 for(const language of ['en','fr','ar','he','ur']){
  const text=home.translator(language)('error.unsupported',{name});
  assert(text.includes(name));assert(!text.includes('{name}'));
 }
});
