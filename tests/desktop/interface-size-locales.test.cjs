// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),inventory=require('../fixtures/reviewed-i18n/interface-size-strings-Z.json');
const source=fs.readFileSync(path.join(root,inventory.source),'utf8'),english=JSON.parse(source),catalogs=require('../../tools/desktop/i18n-extra.json');
test('seven interface-size English strings retain the exact reviewed source',()=>{
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'5f3b13456ee682216357422a9bdf60e4e7b20041bf6e9ea7a5c687cdc522df27');
 assert.equal(inventory.source_sha256,'5f3b13456ee682216357422a9bdf60e4e7b20041bf6e9ea7a5c687cdc522df27');
 assert.deepEqual(Object.keys(english),inventory.keys);assert.equal(inventory.keys.length,7);
});
test('all44 reviewed interface-size catalogs match the independently sealed Z projection',()=>{
 assert.equal(inventory.status,'reviewed-session-Z');
 assert.equal(inventory.translation_artifact.sha256,'0561d42b0aad5ee7f14ea611c67ee0173f73cd9b6c1d8d8c413bc82b52741a37');
 assert.deepEqual(inventory.reviewed_locales,Object.keys(catalogs).filter(x=>x!=='en').sort());assert.equal(inventory.reviewed_locales.length,44);
 const values={};
 for(const locale of inventory.reviewed_locales)values[locale]=Object.fromEntries([...inventory.keys].sort().map(key=>[key,catalogs[locale][key]]));
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'),inventory.reviewed_catalog_sha256);
});
test('all45 interface-size catalogs preserve nonempty NFC text and the100% reset without controls',()=>{
 assert.equal(Object.keys(catalogs).length,45);
 for(const [locale,catalog] of Object.entries(catalogs)){
  for(const key of inventory.keys){const value=catalog[key];assert.equal(typeof value,'string',locale+':'+key);assert(value.trim());assert.equal(value,value.normalize('NFC'));assert(!/[\u0000-\u001f\u007f]/u.test(value));if(locale==='en')assert.equal(value,english[key]);}
  assert(catalog.interfaceZoomReset.includes('100'),locale);
 }
});
