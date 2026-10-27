// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const expected={keyId:'eo-2026-1',spki:'MCowBQYDK2VwAyEAtc5YPgC0XcAMSifWKmwQ6LHkrwslk2Zq226kkNoANK4=',fingerprint:'68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd'};
function runtime(platform='win32',packageType='nsis',electronVersion='44.9.1'){return {platform,packageType,electronVersion,arch:'x64',checksEnabled:true};}
function qualification(nsis){
 const file=path.resolve(__dirname,'../../desktop/update-production-qualification.cjs'),source=fs.readFileSync(file,'utf8'),module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{},{filename:file})(name=>{
  if(name==='./update-production-nsis-qualification.cjs')return nsis;
  throw Error('Unexpected qualification import');
 },module,module.exports);
 return module.exports;
}
test('production public trust is the exact owner-approved Ed25519 SPKI, fingerprint and key ID',()=>{
 const pins=require('../../desktop/update-production-trust.cjs');
 assert(Object.isFrozen(pins));assert.equal(pins.length,1);
 const pin=pins[0];assert(Object.isFrozen(pin));assert.deepEqual(Object.keys(pin).sort(),['fingerprint','keyId','pem']);
 assert.equal(pin.keyId,expected.keyId);assert.equal(pin.fingerprint,expected.fingerprint);
 const key=crypto.createPublicKey(pin.pem),der=key.export({format:'der',type:'spki'});
 assert.equal(key.type,'public');assert.equal(key.asymmetricKeyType,'ed25519');
 assert.equal(der.toString('base64'),expected.spki);assert.equal(der.length,44);
 assert.equal(crypto.createHash('sha256').update(der).digest('hex'),expected.fingerprint);
 assert.equal(pin.pem,'-----BEGIN PUBLIC KEY-----\n'+expected.spki+'\n-----END PUBLIC KEY-----\n');
});
test('production qualification enables AppImage and NSIS after the reviewed native Windows PASS',()=>{
 const q=require('../../desktop/update-production-qualification.cjs'),{production}=require('../../desktop/update-policy.cjs');
 assert(Object.isFrozen(q)&&Object.isFrozen(q.platforms));
 assert.deepEqual(q,{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:true,AppImage:true}});
 assert.equal(production.capability(runtime('linux','AppImage')).enabled,true);
 assert.equal(production.capability(runtime()).enabled,true);
 for(const [platform,format] of [['darwin','dmg'],['linux','deb'],['linux','flatpak'],['linux','snap']])
  assert.equal(production.capability(runtime(platform,format)).enabled,false);
 for(const version of ['44.7.0','44.10.0'])assert.equal(production.capability(runtime('linux','AppImage',version)).enabled,false);
 const appImageOnly=qualification(false);assert.deepEqual(JSON.parse(JSON.stringify(appImageOnly)),{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:false,AppImage:true}});
 const windows=qualification(true);assert.deepEqual(JSON.parse(JSON.stringify(windows)),q);
 const {createPolicy}=require('../../desktop/update-policy.cjs'),pins=require('../../desktop/update-production-trust.cjs');
 assert.equal(createPolicy({trustedKeys:pins,qualifiedElectronVersion:windows.electronVersion,qualification:windows}).capability(runtime()).enabled,true);
 const before=process.env.EO_UPDATE_ACTIVATION;process.env.EO_UPDATE_ACTIVATION='true';
 try{assert.equal(production.capability(runtime()).enabled,true);assert.equal(production.capability(runtime('linux','AppImage')).enabled,true);}finally{if(before===undefined)delete process.env.EO_UPDATE_ACTIVATION;else process.env.EO_UPDATE_ACTIVATION=before;}
 assert.throws(()=>production.verify({runtime:runtime()}));
});
test('runtime, reviewed switch and each native platform are independent qualification gates',()=>{
 const {createPolicy}=require('../../desktop/update-policy.cjs'),pins=require('../../desktop/update-production-trust.cjs');
 for(const [q,win,linux] of [
  [{reviewed:false,electronVersion:'44.9.1',platforms:{nsis:true,AppImage:true}},false,false],
  [{reviewed:true,electronVersion:null,platforms:{nsis:true,AppImage:true}},false,false],
  [{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:false,AppImage:false}},false,false],
  [{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:true,AppImage:false}},true,false],
  [{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:false,AppImage:true}},false,true],
  [{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:true,AppImage:true}},true,true],
 ]){
  const p=createPolicy({trustedKeys:pins,qualifiedElectronVersion:q.electronVersion,qualification:q});
  assert.equal(p.capability(runtime()).enabled,win);assert.equal(p.capability(runtime('linux','AppImage')).enabled,linux);
  assert.equal(p.capability(runtime('win32','nsis','44.10.0')).enabled,false);
 }
});
test('qualification input is strict and copied, never mutable or coerced approval',()=>{
 const {createPolicy}=require('../../desktop/update-policy.cjs'),pins=require('../../desktop/update-production-trust.cjs');
 const base=()=>({reviewed:true,electronVersion:'44.9.1',platforms:{nsis:true,AppImage:false}});
 for(const change of [q=>q.reviewed='true',q=>q.platforms.nsis=1,q=>q.extra=true,q=>q.platforms.extra=true,q=>delete q.platforms.AppImage,q=>q.electronVersion='44.10.0']){
  const q=base();change(q);assert.throws(()=>createPolicy({trustedKeys:pins,qualifiedElectronVersion:'44.9.1',qualification:q}));
 }
 assert.throws(()=>createPolicy({trustedKeys:pins,qualifiedElectronVersion:null,qualification:base()}));
 const q=base(),p=createPolicy({trustedKeys:pins,qualifiedElectronVersion:'44.9.1',qualification:q});
 q.reviewed=false;q.platforms.nsis=false;q.platforms.AppImage=true;
 assert.equal(p.capability(runtime()).enabled,true);assert.equal(p.capability(runtime('linux','AppImage')).enabled,false);
});
test('production construction uses the pinned public trust and independently reviewed source switch',()=>{
 const file=path.resolve(__dirname,'../../desktop/update-policy.cjs'),source=fs.readFileSync(file,'utf8');
 function construct(qualification,pins){
  const loaded=[],module={exports:{}};
  const requirePolicy=name=>{
   loaded.push(name);
   if(name==='./update-production-qualification.cjs')return qualification;
   if(name==='./update-production-trust.cjs')return pins;
   if(name==='./update-metadata.cjs')return require('../../desktop/update-metadata.cjs');
   if(name==='node:crypto')return crypto;
   throw Error('Unexpected policy import');
  };
  vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{},{filename:file})(requirePolicy,module,module.exports);
  assert.equal(loaded.filter(x=>x==='./update-production-trust.cjs').length,1);
  assert.equal(loaded.filter(x=>x==='./update-production-qualification.cjs').length,1);
  return module.exports.production;
 }
 const pins=require('../../desktop/update-production-trust.cjs'),qualified=require('../../desktop/update-production-qualification.cjs');
 assert.equal(construct(qualified,pins).capability(runtime()).enabled,true);
 assert.equal(construct(qualified,pins).capability(runtime('linux','AppImage')).enabled,true);
 assert.equal(construct(qualified,[]).capability(runtime()).enabled,false);
 assert.throws(()=>construct(qualified,[{...pins[0],fingerprint:'0'.repeat(64)}]));
});
