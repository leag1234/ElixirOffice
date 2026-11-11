// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const resolver=require('../../desktop/font-resolver.js');
const styles=['Regular','Bold','Italic','Bold Italic'];
const face=(family,source,styleCode,fullName)=>({family,source,styleCode,style:styles[styleCode],fullName,coverage:[[32,126]]});
test('full style names resolve to matching faces over aliases',()=>{
 const bundled=[face('Open Sans','bundled',0,'Open Sans'),face('Open Sans','bundled',1,'Open Sans Bold'),face('Open Sans','bundled',2,'Open Sans Italic'),face('Open Sans','bundled',3,'Open Sans Bold Italic')];
 const installed=[face('Noto Serif','system',1,'Noto Serif Bold'),face('Noto Serif','system',2,'Noto Serif Italic'),face('Noto Serif','system',3,'Noto Serif Bold Italic')];
 const both=resolver.create([...bundled,...installed]),bundledOnly=resolver.create(bundled),installedOnly=resolver.create(installed);
 for(const policy of [both,bundledOnly]){
  assert.equal(policy.resolve({name:'Open Sans Bold',style:1,aliases:['Open Sans']}).styleCode,1);
  assert.equal(policy.resolve({name:'Open Sans Italic',style:2,aliases:['Open Sans']}).styleCode,2);
  assert.equal(policy.resolve({name:'Open Sans Bold Italic',style:3,aliases:['Open Sans']}).styleCode,3);
 }
 for(const policy of [both,installedOnly]){
  assert.equal(policy.resolve({name:'Noto Serif Bold',style:1,aliases:['Noto Serif']}).styleCode,1);
  assert.equal(policy.resolve({name:'Noto Serif Italic',style:2,aliases:['Noto Serif']}).styleCode,2);
  assert.equal(policy.resolve({name:'Noto Serif Bold Italic',style:3,aliases:['Noto Serif']}).styleCode,3);
 }
 assert.equal(both.resolve({name:'Open Sans',style:0,aliases:['Open Sans Bold']}).styleCode,0);
 assert.equal(both.resolve({name:'Open Sans',style:1}).styleCode,1);
 // Full name requested with style 0 (no <w:b/>): still the named face.
 assert.equal(both.resolve({name:'Open Sans Bold',style:0,aliases:['Open Sans']}).styleCode,1);
 assert.equal(both.resolve({name:'Open Sans Italic',style:0,aliases:['Open Sans']}).styleCode,2);
 assert.equal(both.resolve({name:'Open Sans Bold Italic',style:0,aliases:['Open Sans']}).styleCode,3);
 // Style bits on top of the full name combine with the named face.
 assert.equal(both.resolve({name:'Open Sans Bold',style:1,aliases:['Open Sans']}).styleCode,1);
 assert.equal(both.resolve({name:'Open Sans Bold',style:2,aliases:['Open Sans']}).styleCode,3);
 assert.equal(both.resolve({name:'Open Sans Bold',style:3,aliases:['Open Sans']}).styleCode,3);
 // Without the altName alias the full name still resolves to its face.
 assert.equal(both.resolve({name:'Open Sans Bold',style:0}).styleCode,1);
});
test('full style names do not absorb separate weight families',()=>{
 const policy=resolver.create([face('Arial Black','system',0,'Arial Black'),face('Arial','system',0,'Arial'),face('Open Sans SemiBold','bundled',0,'Open Sans SemiBold')]);
 assert.equal(policy.resolve({name:'Arial Black',style:0}).family,'Arial Black');
 assert.equal(policy.resolve({name:'Open Sans SemiBold',style:0}).family,'Open Sans SemiBold');
});
