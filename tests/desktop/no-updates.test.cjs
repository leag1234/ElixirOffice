// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=Module.createRequire(helper);
const forbidden=/\b(?:autoUpdater|checkForUpdates(?:AndNotify)?|setFeedURL)\b|electron-updater|appimageupdatetool/i;
function assertNoUpdater(code){assert(!forbidden.test(code),'Application updater code is forbidden; updates are external and user initiated');}

function assertNoUpdaterDependencies(pkg,lock){
 const updater=name=>/updat|squirrel/i.test(name);
 assert(!Object.keys(pkg.dependencies||{}).some(updater),'Direct production updater dependency');
 for(const [name,entry]of Object.entries(lock.packages||{}))
  if(name&&entry.dev!==true)assert(!updater(name),'Transitive production updater dependency: '+name);
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

// Owner release review permits only anonymous release metadata, never an updater.
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

test('own runtime sources and production dependency lock contain no application updater',()=>{
 const desktop=path.resolve(__dirname,'../../desktop'),pkg=require(path.join(desktop,'package.json'));
 const lock=JSON.parse(fs.readFileSync(path.join(desktop,'package-lock.json'),'utf8'));assertNoUpdaterDependencies(pkg,lock);
 assert.equal(pkg.build.publish,null);
 assert.equal(pkg.build.appImage.artifactName,'ElixirOffice-${version}-x86_64.${ext}');
 assert(pkg.scripts.package.includes('--publish never'));
 for(const file of ownRuntimeSources(desktop))assertNoUpdater(fs.readFileSync(file,'utf8'));
 assert.throws(()=>assertNoUpdaterDependencies({dependencies:{}},{packages:{'node_modules/nested/node_modules/electron-updater':{}}}),/Transitive/);
 assert.doesNotThrow(()=>assertNoUpdaterDependencies({dependencies:{}},{packages:{'node_modules/electron-updater':{dev:true}}}));
 assert.throws(()=>assertNoUpdater("require('electron-updater').autoUpdater.checkForUpdates()"),/updater/);
});
test('real main Home/document allow one mocked release check and no other network; off makes no check',async()=>{await guardedBoot();await guardedBoot(true);await guardedBoot(false,'',false)});
test('bootstrap guard rejects an injected updater and direct network request before access',async()=>{
 for(const code of ["require('electron').autoUpdater.checkForUpdates();","require('electron-updater');","require('node:https').get('https://example.invalid/update');","require('node:net').connect(443,'example.invalid');"])
  await assert.rejects(guardedBoot(false,code),/Forbidden update\/network access/);
});
