// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const english=require('../../desktop/tab-strings.json'),catalog=require('../../tools/desktop/i18n-extra.json');
test('every tab English reference matches the shared canonical English catalog',()=>{
 for(const [key,value] of Object.entries(english))assert.equal(catalog.en[key],value,key);
});
test('all 45 locale catalogs define the complete 24-key tab and navigation contract',()=>{
 const keys=Object.keys(english);
 assert.equal(keys.length,24);
 assert.equal(Object.keys(catalog).length,45);
 const placeholders=value=>[...value.matchAll(/\{[^{}]+\}/g)].map(match=>match[0]).sort();
 for(const [locale,strings] of Object.entries(catalog)){
  for(const key of keys){
   assert.equal(typeof strings[key],'string',locale+'.'+key);
   assert.ok(strings[key].trim(),locale+'.'+key);
   assert.deepEqual(placeholders(strings[key]),placeholders(english[key]),locale+'.'+key);
  }
 }
});
test('main tab strings fall back per key without changing selected RTL locale or direction',()=>{
 const source=fs.readFileSync(require.resolve('../../desktop/main.cjs'),'utf8'),start=source.indexOf('function localizedStrings()'),end=source.indexOf('// Invalid capture requests',start);
 for(const invalid of [undefined,'','   ',17,false,null]){
  const strings=Object.fromEntries(Object.keys(english).map(key=>[key,invalid]));
  const context={languageInfo:{strings,language:'ar',direction:'rtl'},tabEnglish:english,fatalFallback:{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.translate=t;',context);
  for(const [key,value] of Object.entries(english)){assert.equal(context.localizedStrings()[key],value);assert.equal(context.translate(key),value);}
  assert.equal(context.languageInfo.language,'ar');assert.equal(context.languageInfo.direction,'rtl');
 }
 const context={languageInfo:{strings:{tabNew:'ترجمة'},language:'ar',direction:'rtl'},tabEnglish:english,fatalFallback:{}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);assert.equal(context.localizedStrings().tabNew,'ترجمة');
});
