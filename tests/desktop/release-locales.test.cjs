// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),catalogs=require('../../tools/desktop/i18n-extra.json');
test('release notice and privacy controls have all eight fields in every45 desktop locales',()=>{
 const keys=['releaseAvailable','releaseNotes','releaseDownload','releaseLater','releaseSkip','releaseChecks','releasePrivacy','releaseUpdates'];
 assert.equal(Object.keys(catalogs).length,45);
 for(const [locale,strings] of Object.entries(catalogs)){
  for(const key of keys)assert(typeof strings[key]==='string'&&strings[key].trim(),locale+':'+key);
  assert.equal((strings.releaseAvailable.match(/\{version\}/g)||[]).length,1,locale+' version placeholder');
  assert(strings.releasePrivacy.includes('github.com'),locale+' explicit destination disclosure');
 }
});
