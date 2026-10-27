// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=Module.createRequire(helper);
const forbidden=/\b(?:autoUpdater|checkForUpdates(?:AndNotify)?|setFeedURL)\b|electron-updater|appimageupdatetool/i;
function assertNoUpdater(code){assert(!forbidden.test(code),'Application updater code is forbidden; updates are external and user initiated');}

// release review permits one explicitly gated source loader. Every other forbidden
// call/import remains rejected, including the legacy negative fixtures.
function assertGatedLoader(code){
 const line=" const library=require('electron-updater');";
 assert.deepEqual(code.split(/\r?\n/).filter(value=>forbidden.test(value)),[line],'Only the reviewed literal load may be exempted');
 const policy=code.indexOf('if(!policy.capability(target).enabled)refused();');
 const eligible=code.indexOf('if(!eligibility||await eligibility.check()!==true)refused();');
 const loaded=code.indexOf(line);
 assert(policy>=0&&eligible>policy&&loaded>eligible,'Both policy and physical-package gates must precede the load');
}
function assertNoUpdaterDependencies(pkg,lock){
 const updater=name=>/updat|squirrel/i.test(name);
 assert(!Object.keys(pkg.dependencies||{}).some(updater),'Direct production updater dependency');
 for(const [name,entry]of Object.entries(lock.packages||{}))
  if(name&&entry.dev!==true)assert(!updater(name),'Transitive production updater dependency: '+name);
}
// release review/278 approve this exact dependency closure. Production capability is
// still admitted only by the separate reviewed source qualification.
function assertDormantUpdaterDependencies(pkg,lock){
 assert.deepEqual(pkg.dependencies,{'electron-updater':'6.8.9','@elixiroffice/lazy-val-shim':'file:vendor/lazy-val-shim'});
 assert.deepEqual(pkg.overrides,{'electron-updater':{'lazy-val':'file:../../vendor/lazy-val-shim'}});
 const reviewed=require('../../docs/reviews/electron-updater-6.8.9.json').packages.filter(p=>p.name!=='lazy-val');
 const pins=new Map(reviewed.map(p=>[p.name,p])),seen=new Set();
 for(const [name,entry] of Object.entries(lock.packages)){
  if(!name||entry.dev===true)continue;
  if(['node_modules/@elixiroffice/lazy-val-shim','node_modules/electron-updater/node_modules/lazy-val'].includes(name)){
   assert.equal(entry.link,true);assert.equal(entry.resolved,'vendor/lazy-val-shim');continue;
  }
  if(name==='vendor/lazy-val-shim'){
   assert.equal(entry.name,'@elixiroffice/lazy-val-shim');assert.equal(entry.version,'1.0.0');assert.equal(entry.license,'AGPL-3.0-only');continue;
  }
  const moduleName=name.split('node_modules/').at(-1),pin=pins.get(moduleName);
  assert(pin,'Unreviewed production dependency: '+moduleName);
  assert.equal(entry.version,pin.version);assert.equal(entry.integrity,pin.integrity);
  assert.equal(entry.resolved,pin.resolved);assert.equal(entry.license,pin.license);seen.add(moduleName);
 }
 assert.equal(seen.size,pins.size);
 const production=require('../../desktop/update-policy.cjs').production;
 assert.equal(production.capability({platform:'linux',packageType:'AppImage',arch:'x64',electronVersion:'44.9.1'}).enabled,true);
 assert.equal(production.capability({platform:'win32',packageType:'nsis',arch:'x64',electronVersion:'44.9.1'}).enabled,true);
}
function ownRuntimeSources(directory){
 const skip=new Set(['assets','node_modules','dist','mac-licenses','.git']);
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  if(skip.has(entry.name))return [];
  assert(!entry.isSymbolicLink(),'Unexpected runtime source symlink: '+entry.name);
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?ownRuntimeSources(file):/\.(?:cjs|js|html)$/.test(entry.name)?[file]:[];
 });
}

// Owner release review permits anonymous release metadata. release review/284 allow the gated
// runtime loader; unsupported or physically ineligible bootstraps must never import it.
// Mock that API in the real-main fixture; every other network boundary fails.
// No Electron window or renderer process is started by this unit check.
async function guardedBoot(document=false,injected='',enabled=true){
 const calls=[],directories=[],originalLoad=Module._load,originalFetch=global.fetch;
 const fail=kind=>(...args)=>{calls.push(kind);throw Error('Forbidden update/network access: '+kind)};
 const http=require('node:http'),https=require('node:https'),saved=[];
 for(const module of [http,https])for(const key of ['request','get']){saved.push([module,key,module[key]]);module[key]=fail('http:'+key)}
 for(const [name,keys]of [['node:net',['connect','createConnection']],['node:tls',['connect']]]){const module=require(name);for(const key of keys){saved.push([module,key,module[key]]);module[key]=fail(name+':'+key)}}
 global.fetch=fail('fetch');
 let electron;
 Module._load=function(name,...args){
  if(name==='electron-updater')return fail('electron-updater')();
  if(name==='electron'&&electron)return electron;
  return originalLoad.call(this,name,...args);
 };
 const wrappedVM={...vm,runInNewContext(code,context,options){
  if(options?.filename?.endsWith('/desktop/main.cjs')){
   const require=context.require;electron=require('electron');directories.push(electron.app.getPath('userData'));
   Object.defineProperty(electron,'autoUpdater',{get:fail('autoUpdater')});
   electron.net.fetch=fail('electron.net.fetch');electron.net.request=fail('electron.net.request');
   context.fetch=fail('fetch');
   context.require=name=>name==='electron-updater'?fail('electron-updater')():require(name);
   code=injected+'\n'+code;
  }
  return vm.runInNewContext(code,context,options);
 }};
 const moduleScope={exports:{}};
 try{
  vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={boot};',{
   require:name=>name==='node:test'?()=>{}:name==='node:vm'?wrappedVM:load(name),module:moduleScope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate
  });
  const env=await moduleScope.exports.boot({document,fontSettings:{releaseNotice:{enabled}}});
  assert.equal(env.releaseRequests.length,enabled?1:0,'Only the default-on mocked metadata check is allowed');
  try{assert.equal(env.shell.url,load('../../desktop/resources.cjs').ORIGIN+'/tabs.html');assert.equal(env.documents[0].getURL(),load('../../desktop/resources.cjs').ORIGIN+'/index.html');if(document)assert(env.selected.token);assert.deepEqual(calls,[]);}
  finally{await env.cleanup()}
 }finally{
  Module._load=originalLoad;global.fetch=originalFetch;
  for(const [module,key,value]of saved)module[key]=value;
  for(const directory of directories)await fsp.rm(directory,{recursive:true,force:true});
 }
}

test('production activation retains one reviewed gated loader and exact dependency closure',()=>{
 const desktop=path.resolve(__dirname,'../../desktop'),pkg=require(path.join(desktop,'package.json'));
 const lock=JSON.parse(fs.readFileSync(path.join(desktop,'package-lock.json'),'utf8'));assertDormantUpdaterDependencies(pkg,lock);
 assert.equal(pkg.build.publish,null);
 assert.equal(pkg.build.appImage.artifactName,'ElixirOffice-${version}-x86_64.${ext}');
 assert(pkg.scripts.package.includes('--publish never'));
 for(const file of ownRuntimeSources(desktop)){
  const code=fs.readFileSync(file,'utf8');
  if(path.relative(desktop,file)==='update-runtime.cjs')assertGatedLoader(code);else assertNoUpdater(code);
 }
 assert.throws(()=>assertNoUpdaterDependencies({dependencies:{}},{packages:{'node_modules/nested/node_modules/electron-updater':{}}}),/Transitive/);
 assert.doesNotThrow(()=>assertNoUpdaterDependencies({dependencies:{}},{packages:{'node_modules/electron-updater':{dev:true}}}));
 assert.throws(()=>assertNoUpdater("require('electron-updater').autoUpdater.checkForUpdates()"),/updater/);
});
test('real main Home/document allow one mocked release check and no other network; off makes no check',async()=>{await guardedBoot();await guardedBoot(true);await guardedBoot(false,'',false)});
test('bootstrap guard rejects an injected updater and direct network request before access',async()=>{
 for(const code of ["require('electron').autoUpdater.checkForUpdates();","require('electron-updater');","require('node:https').get('https://example.invalid/update');","require('node:net').connect(443,'example.invalid');"])
  await assert.rejects(guardedBoot(false,code),/Forbidden update\/network access/);
});

for(const [label,change] of [
 ['unreviewed updater version',(p,l)=>p.dependencies['electron-updater']='6.8.10'],
 ['global override',(p,l)=>p.overrides={'lazy-val':'file:vendor/lazy-val-shim'}],
 ['foreign shim alias',(p,l)=>l.packages['node_modules/electron-updater/node_modules/lazy-val'].resolved='other-folder'],
 ['original runtime Lazy',(p,l)=>l.packages['node_modules/lazy-val'].dev=false],
 ['changed registry integrity',(p,l)=>l.packages['node_modules/electron-updater'].integrity='sha512-invalid'],
 ['unknown runtime package',(p,l)=>l.packages['node_modules/unreviewed']={version:'1.0.0'}],
])test('dormant closure refuses '+label,()=>{
 const desktop=path.resolve(__dirname,'../../desktop'),p=JSON.parse(fs.readFileSync(path.join(desktop,'package.json'),'utf8')),l=JSON.parse(fs.readFileSync(path.join(desktop,'package-lock.json'),'utf8'));
 change(p,l);assert.throws(()=>assertDormantUpdaterDependencies(p,l));
});


test('approved loader boundary refuses extra imports, stock APIs, missing gates and moved load',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../../desktop/update-runtime.cjs'),'utf8'),line=" const library=require('electron-updater');";
 assert.doesNotThrow(()=>assertGatedLoader(code));
 const changes=[
  "require('electron-updater');\n"+code,
  code+"\nupdater.checkForUpdates();",
  code+"\nupdater.setFeedURL('https://example.invalid/');",
  code.replace('if(!policy.capability(target).enabled)refused();',''),
  code.replace('if(!eligibility||await eligibility.check()!==true)refused();',''),
  line+'\n'+code.replace(line,''),
 ];
 for(const changed of changes)assert.throws(()=>assertGatedLoader(changed));
 assert.throws(()=>assertNoUpdater(line),'The same load in another own source file is still forbidden');
});
