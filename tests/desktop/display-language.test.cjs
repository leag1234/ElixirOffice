// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),locale=require('../../desktop/locale.cjs'),display=require('../../desktop/display-language.cjs');
const supported=['en','de','fr','pt','pt-pt','zh','zh-tw','sr','sr-cyrl','no'];
const select=value=>locale.choose(display.preferred({...value,supported}),supported);
test('Display language precedence is supported CLI, preference, system, English',()=>{
 assert.equal(select({argv:['--lang=en-US'],setting:'fr',system:['de-DE']}),'en');
 assert.equal(select({argv:['--lang=xx-ZZ'],setting:'fr',system:['de-DE']}),'fr');
 assert.equal(select({setting:'xx',system:['de-DE']}),'de');
 assert.equal(select({system:['xx-ZZ']}),'en');
 assert.equal(select({setting:'',system:['fr-FR']}),'fr');
});
test('Unsupported or malformed overrides never fabricate an English preference',()=>{
 for(const value of [null,{},[],true,1252,'','/en','en\u0000','en;quit','x'.repeat(200),'xx-ZZ']){
  assert.equal(display.supportedLocale(value,supported),null);
  assert.equal(select({argv:['--lang='+String(value)],setting:'de',system:['fr']}),'de');
 }
 assert.equal(display.argument(['--','--lang=en'],supported),null);
 assert.equal(display.argument(['--lang=fr','--lang=de','--lang=xx'],supported),'de');
});
test('Display locale aliases retain supported regional/script distinctions',()=>{
 for(const [value,expected] of [['EN_us','en'],['pt-PT','pt-pt'],['zh-Hant-TW','zh-tw'],['sr-Cyrl-RS','sr-cyrl'],['nb-NO','no']])
  assert.equal(display.validate(value,supported),expected);
 assert.equal(display.validate('',supported),'');
 for(const value of [undefined,null,{},[],12,'bad'])assert.throws(()=>display.validate(value,supported),/display language/);
});
test('Locale list names each language in its own language',()=>{
 const choices=display.choices(['en','de','fr']);
 assert.deepEqual(choices.map(c=>c.language),['en','de','fr']);
 assert.equal(choices[0].name,'English');assert.equal(choices[1].name,'Deutsch');assert.equal(choices[2].name,'français');
});
test('Relaunch removes this-run language overrides while preserving other startup arguments',()=>{
 assert.deepEqual(display.restartArguments(['desktop','--lang=en-US','--user-data-dir=/owned','/owned/public.docx']),['desktop','--user-data-dir=/owned','/owned/public.docx']);
});

test('Unsupported prefix-collision language bases cannot override the stored display language',()=>{
 for(const value of ['zha','zhx-CN','ptx','ptx-PT','srm','srm-RS'])
  assert.equal(select({argv:['--lang='+value],setting:'de',system:['fr']}),'de',value);
 assert.equal(display.validate('zh-hantx',supported),'zh');
 assert.equal(display.validate('pt-ptx',supported),'pt');
 assert.equal(display.validate('sr-cyrlx',supported),'sr');
});
test('All45 UI catalogs contain the five reviewed display-language strings',()=>{
 const catalogs=require('../../tools/desktop/i18n-extra.json'),english=require('../../desktop/display-language-strings.cjs');
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings] of Object.entries(catalogs))for(const key of Object.keys(english)){
  assert.equal(typeof strings[key],'string',language+':'+key);assert(strings[key].trim());
 }
 assert.equal(catalogs.en.displayLanguage,english.displayLanguage);assert.equal(catalogs.de.displayLanguage,'Anzeigesprache');
});
