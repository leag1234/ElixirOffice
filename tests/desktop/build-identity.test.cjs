// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const identity=require('../../desktop/build-identity.cjs');
const create=(channel='rc',n=42)=>identity.create('0.2.1',channel,n,'a'.repeat(40),'b'.repeat(40));
test('one identity maps RC/final to numeric platform versions and exact provenance',()=>{
 const rc=create(),final=create('final',43);
 assert.equal(rc.version,'0.2.1-rc.42');assert.equal(rc.deb_version,'0.2.1~rc42');assert.equal(rc.windows_version,'0.2.1.42');
 assert.equal(rc.mac_short_version,'0.2.1');assert.equal(rc.mac_bundle_version,'42');
 assert.equal(final.version,'0.2.1');assert.equal(final.deb_version,'0.2.1-43');
 assert.equal(identity.label(rc),'0.2.1-rc.42 (build 42, aaaaaaaaaaaa)');
 assert.equal(identity.aboutOptions(final).applicationVersion,'0.2.1 (build 43, aaaaaaaaaaaa)');
 for(const n of [0,-1,1.2,65536,'42',NaN])assert.throws(()=>create('rc',n));
 assert.throws(()=>identity.create('0.2.1','rc',1,'short','b'.repeat(40)));
 assert.throws(()=>identity.create('0.2.70000','final',1,'a'.repeat(40),'b'.repeat(40)));
 assert.throws(()=>identity.validate({...rc,windows_version:'0.2.1.0'}));
});
test('beforePack rejects missing/mismatched identity and verifies platform options',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-id-'));
 const before=require('../../desktop/build-identity-before-pack.cjs');
 try{
  const context={packager:{info:{appDir:root},appInfo:{version:'0.2.1-rc.42',buildVersion:'0.2.1.42'}}};
  await assert.rejects(before(context),/ENOENT/);
  const v=create(),pkg={version:v.version,build:{buildNumber:'42',buildVersion:v.windows_version,mac:{bundleShortVersion:'0.2.1',bundleVersion:'42'}}};
  fs.writeFileSync(path.join(root,'build-info.json'),JSON.stringify(v));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
  fs.copyFileSync(path.resolve(__dirname,'../../desktop/build-identity.cjs'),path.join(root,'build-identity.cjs'));
  await before(context);context.electronPlatformName='darwin';context.packager.appInfo.buildVersion='42';await before(context);
  context.packager.appInfo.buildVersion='0.2.1';await assert.rejects(before(context));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('About is accessible on all platforms and existing translated label is used',()=>{
 const {template}=require('../../desktop/menu.cjs');
 for(const platform of ['linux','win32','darwin']){
  const actions=[],walk=rows=>rows.flatMap(row=>[row,...(row.submenu?walk(row.submenu):[])]);
  const menu=walk(template(platform,name=>()=>actions.push(name),()=>{},key=>key==='about'?'Localized About':key));
  const about=menu.find(row=>row.label==='Localized About ElixirOffice');assert(about);
  if(platform==='darwin')assert.equal(about.role,'about');else{about.click();assert.deepEqual(actions,['about'])}
 }
});

test('Windows application and installer numeric fields retain semantic installer text',()=>{
 const {verify}=require('../../tools/desktop/check-windows-version.cjs'),v=create();
 const record={fixedInfo:{fileVersionMS:2,fileVersionLS:65536+42,productVersionMS:2,productVersionLS:65536+42},getAllLanguagesForStringValues:()=>[{lang:1033}],getStringValues:()=>({FileVersion:'0.2.1.42',ProductVersion:'0.2.1.42'})};
 verify([record],v);record.getStringValues=()=>({FileVersion:'0.2.1.42',ProductVersion:v.version});verify([record],v,true);
 assert.throws(()=>verify([record],v));record.fixedInfo.fileVersionLS=65536;assert.throws(()=>verify([record],v,true));
});
test('all 45 effective locale catalogs provide About on every platform',async()=>{
 const locale=require('../../desktop/locale.cjs'),root=path.resolve(__dirname,'../../desktop/assets');
 const supported=JSON.parse(fs.readFileSync(path.join(root,'desktop-home/locales.json'),'utf8'));assert.equal(supported.length,45);
 for(const language of supported){const loaded=await locale.load(root,[language]);assert.equal(typeof loaded.strings.about,'string');assert(loaded.strings.about.length);}
 assert(require('../../desktop/package.json').build.files.includes('build-info.json'));
});

test('configured beforePack resolves through the actual builder inside the desktop workspace',async(t)=>{
 const root=path.resolve(__dirname,'../../desktop'),pkg=require('../../desktop/package.json');
 const load=require('./builder-toolchain.cjs')(t,root);if(!load)return;
 const {resolveFunction}=load('app-builder-lib/out/util/resolve.js');
 const previous=process.cwd();
 try{
  process.chdir(root);
  const hook=await resolveFunction(null,pkg.build.beforePack,'beforePack',root);
  assert.equal(typeof hook,'function');
  assert(pkg.build.files.includes('!build-identity-before-pack.cjs'),'Build-only hook must stay out of the application payload');
  await assert.rejects(resolveFunction(null,'../tools/desktop/build-identity-before-pack.cjs','beforePack',root),/outside the workspace root/);
 }finally{process.chdir(previous)}
});

test('actual Linux and Windows builder contexts validate identity before packaging starts',async(t)=>{
 const root=path.resolve(__dirname,'../../desktop'),load=require('./builder-toolchain.cjs')(t,root);if(!load)return;
 const {build,Platform}=load('app-builder-lib'),before=require('../../desktop/build-identity-before-pack.cjs');
 for(const platform of [Platform.LINUX,Platform.WINDOWS]){
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'eo-builder-context-')),v=create();
  const config={appId:'org.elixiroffice.identity-preflight',productName:'Identity preflight',electronVersion:'44.7.0',buildNumber:'42',buildVersion:v.windows_version,mac:{bundleShortVersion:'0.2.1',bundleVersion:'42'},directories:{output:'out'},npmRebuild:false};
  const pkg={name:'identity-preflight',version:v.version,description:'Synthetic packaging identity check',author:'ElixirOffice contributors',license:'AGPL-3.0-only',main:'main.cjs',build:config};
  fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify(pkg));
  fs.writeFileSync(path.join(fixture,'build-info.json'),JSON.stringify(v));
  fs.copyFileSync(path.join(root,'build-identity.cjs'),path.join(fixture,'build-identity.cjs'));
  let calls=0;
  try{
   await assert.rejects(build({projectDir:fixture,targets:platform.createTarget('dir'),publish:'never',config:{...config,beforePack:async context=>{
    calls++;assert.equal(context.packager.info.appDir,fixture);
    await before(context);
    throw Error('IDENTITY_PREFLIGHT_STOP_BEFORE_PACKAGING');
   }}}),/IDENTITY_PREFLIGHT_STOP_BEFORE_PACKAGING/);
   assert.equal(calls,1,'The real builder must invoke the identity guard exactly once');
   const walk=folder=>fs.existsSync(folder)?fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(folder,item.name)):[item.name]):[];
   assert(!walk(fixture).some(name=>/\.(?:exe|deb|AppImage|dmg)$/.test(name)),'Preflight must stop before binary creation');
  }finally{fs.rmSync(fixture,{recursive:true,force:true})}
 }
});
