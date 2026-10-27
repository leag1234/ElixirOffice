// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {prepareDeclinedProfile,assertNoFonts}=require('./font-profile.cjs'),{migrate}=require('../../desktop/font-preferences.cjs');
async function temporary(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-font-profile-'));try{await run(root)}finally{await fs.rm(root,{recursive:true,force:true})}}
const page=value=>({evaluate:fn=>vm.runInNewContext('('+fn.toString()+')()',{eoDesktop:{fonts:async()=>value}})});
test('declined font fixture is private and survives current default-on migration',()=>temporary(async root=>{
 const directory=await prepareDeclinedProfile(root,'privacy-one'),file=path.join(directory,'desktop-settings.json'),settings=JSON.parse(await fs.readFile(file,'utf8'));
 assert.equal((await fs.stat(directory)).mode&0o777,0o700);assert.equal((await fs.stat(file)).mode&0o777,0o600);
 assert.equal(settings.fontConsent,false);assert.equal(settings.fontChoice,'declined');assert.deepEqual(settings.recents,[]);assert.equal(settings.releaseNotice.enabled,false);
 assert.equal(migrate(settings).fontConsent,false);assert.equal(migrate({fontConsent:false}).fontConsent,true);
}));
test('preparation refuses an existing profile and preserves a subsequently granted choice',()=>temporary(async root=>{
 const directory=await prepareDeclinedProfile(root,'privacy-one'),file=path.join(directory,'desktop-settings.json'),granted=JSON.stringify({fontConsent:true,fontChoice:'granted'});
 await fs.writeFile(file,granted);await assert.rejects(prepareDeclinedProfile(root,'privacy-one'),{code:'EEXIST'});assert.equal(await fs.readFile(file,'utf8'),granted);
}));
test('preparation refuses profile paths escaping its owned profiles directory',()=>temporary(async root=>{
 for(const name of ['', '..', '../outside', '/absolute','nested/name','nested\\name'])await assert.rejects(prepareDeclinedProfile(root,name),/profile name/);
 assert.deepEqual(await fs.readdir(root),[]);
}));
test('bounded denied-font assertion accepts an actual empty array',async()=>{await assertNoFonts(page([]))});
test('bounded denied-font assertion rejects non-array zero-length values',async()=>{
 for(const value of ['',null,{}, {length:0}])await assert.rejects(assertNoFonts(page(value)),/Expected no computer fonts/);
});
test('bounded denied-font assertion rejects a large unexpected index without transferring or formatting it',async()=>{
 const list=Array(50000).fill(Object.defineProperty({},'details',{get(){throw Error('Font detail must not be inspected')}}));
 let result;const bounded={async evaluate(fn){result=await page(list).evaluate(fn);return result}};
 await assert.rejects(assertNoFonts(bounded),error=>error.code==='ERR_ASSERTION'&&error.message.includes('Expected no computer fonts')&&error.message.length<500);
 assert.equal(result,false);
});
