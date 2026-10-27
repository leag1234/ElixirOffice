// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {assertOrdinary}=require('../../desktop/release-flavor-guard.cjs');
test('ordinary packages reject QA identities, entry, reserved versions and markers before packing',()=>{
 const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../desktop/package.json'))),root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ordinary-'));
 try{
  fs.copyFileSync(path.resolve(__dirname,'../../desktop/update-production-trust.cjs'),path.join(root,'update-production-trust.cjs'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(source));assert.doesNotThrow(()=>assertOrdinary(root));
  for(const change of [p=>p.name='elixiroffice-update-qa',p=>p.main='qa/entry.cjs',p=>p.build.appId='org.elixiroffice.desktop.updateqa',
   p=>p.build.productName='ElixirOffice Update QA',p=>p.version='0.0.0-rc.2',p=>p.qaManifestSha256='a'.repeat(64)]){
   const p=structuredClone(source);change(p);fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(p));assert.throws(()=>assertOrdinary(root));
  }
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(source));
  fs.mkdirSync(path.join(root,'qa'));assert.throws(()=>assertOrdinary(root));fs.rmdirSync(path.join(root,'qa'));
  fs.writeFileSync(path.join(root,'QA-DO-NOT-PUBLISH.json'),'{}');assert.throws(()=>assertOrdinary(root));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('ordinary config explicitly excludes QA closure and mandatory beforePack guard runs before identity',()=>{
 const root=path.resolve(__dirname,'../../desktop'),pkg=require(path.join(root,'package.json')),hook=fs.readFileSync(path.join(root,'build-identity-before-pack.cjs'),'utf8');
 assert(pkg.build.files.includes('!qa/**'));assert(pkg.build.files.includes('!QA-DO-NOT-PUBLISH.json'));
 assert(hook.indexOf('assertOrdinary')>=0);assert(hook.indexOf('assertOrdinary')<hook.indexOf('verifyPackage'));
 assert.equal(pkg.main,'main.cjs');
});
test('production composition, reviewed qualification, network policy and installer bytes stay identical to the activation baseline',()=>{
 const crypto=require('node:crypto'),pins=require('./fixtures/qa-production-baseline.json');
 for(const [name,expected] of Object.entries(pins)){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../desktop',name))).digest('hex');
  assert.equal(actual,expected,name+' must stay byte-unchanged in the QA-only slice');
 }
});
test('actual pinned builder filter excludes every QA entry and marker from ordinary packages',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ordinary-filter-'));
 try{
  const pkg=require('../../desktop/package.json'),{getMainFileMatchers}=require('../../desktop/node_modules/app-builder-lib/out/fileMatcher.js');
  const config=structuredClone(pkg.build),info={isPrepackedAppAsar:false,projectDir:root,buildResourcesDir:'build',config,debugLogger:{isEnabled:false}};
  const filter=getMainFileMatchers(root,path.join(root,'out'),x=>x,config.linux,{info},path.join(root,'dist'),false)[0].createFilter();
  fs.mkdirSync(path.join(root,'qa'));
  for(const name of ['main.cjs','qa/entry.cjs','qa/transport.cjs','qa/manifest.json','QA-DO-NOT-PUBLISH.json']){
   fs.writeFileSync(path.join(root,name),'synthetic');
   assert.equal(filter(path.join(root,name),fs.statSync(path.join(root,name))),name==='main.cjs',name);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('ordinary packages refuse nested QA key IDs and any substituted production trust source without executing it',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-ordinary-trust-')),source=require('../../desktop/package.json');
 const trust=fs.readFileSync(path.resolve(__dirname,'../../desktop/update-production-trust.cjs')),target=path.join(root,'update-production-trust.cjs');
 try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(source));fs.writeFileSync(target,trust);assert.equal(assertOrdinary(root),true);
  const bad={...source,trust:{nested:[{keyId:'eo-qa-'+'a'.repeat(32),pem:'synthetic public data'}]}};
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(bad));assert.throws(()=>assertOrdinary(root));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(source));
  for(const bytes of [Buffer.from('module.exports=[{keyId:"eo-qa-synthetic"}];'),Buffer.concat([trust,Buffer.from('\n// changed trust\n')])]){
   fs.writeFileSync(target,bytes);assert.throws(()=>assertOrdinary(root));
  }
  const marker=path.join(root,'must-not-execute');fs.writeFileSync(target,'require("node:fs").writeFileSync('+JSON.stringify(marker)+',"bad");');
  assert.throws(()=>assertOrdinary(root));assert.equal(fs.existsSync(marker),false);
  fs.unlinkSync(target);assert.throws(()=>assertOrdinary(root));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
