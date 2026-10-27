// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const keys=['releaseInstall','releaseAutomatic','releaseAutomaticDescription','releaseInstallUnavailable','releasePreparing','releaseDownloading','releaseReady','releaseClosing','releaseInstallFailed','releaseProgress'];
test('install UI has English source,45 locale fields and an explicit non-English Z review queue',()=>{
 const source=require('../../desktop/update-strings.cjs'),catalogs=require('../../tools/desktop/i18n-extra.json');
 for(const key of keys)assert.equal(typeof source[key],'string','English fallback '+key);
 const review=require('../fixtures/reviewed-i18n/update-installation-strings-Z.json');
 assert.equal(Object.keys(catalogs).length,45);assert.deepEqual(review.keys,keys);
 for(const [locale,strings]of Object.entries(catalogs)){
  for(const key of keys)assert(typeof strings[key]==='string'&&strings[key].trim(),locale+':'+key);
  assert.equal((strings.releaseDownloading.match(/\{percent\}/g)||[]).length,1);
  if(locale==='en'){for(const key of keys)assert.equal(strings[key],source[key]);}
  else{assert(review.locales[locale],locale+' Z review flag');assert(['needs-Z-review','reviewed'].includes(review.locales[locale].status));}
 }
 assert.equal(Object.keys(review.locales).length,44);assert.equal(source.releaseAutomatic,'Install updates automatically');
});
