// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../desktop');
const pkg=()=>JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=()=>JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
test('updater dependency is exact and the original shim override is updater-scoped only',()=>{
 const p=pkg();assert.equal(p.dependencies['electron-updater'],'6.8.9');
 assert.equal(p.dependencies['@elixiroffice/lazy-val-shim'],'file:vendor/lazy-val-shim');
 assert.deepEqual(p.overrides,{'electron-updater':{'lazy-val':'file:../../vendor/lazy-val-shim'}});
 assert.equal(p.devDependencies['electron-builder'],'26.15.3');assert.equal(p.devDependencies.electron,p.build.electronVersion);
 assert.equal(p.build.publish,null);assert(p.scripts.package.includes('--publish never'));
});
test('committed lock binds updater and both aliases to the owned vendor package',()=>{
 const p=pkg(),l=lock(),v=l.packages;
 assert.equal(l.name,p.name);assert.equal(l.version,p.version);assert.deepEqual(v[''].dependencies,p.dependencies);
 assert.equal(v['node_modules/electron-updater'].version,'6.8.9');
 for(const n of ['node_modules/@elixiroffice/lazy-val-shim','node_modules/electron-updater/node_modules/lazy-val']){
  assert.equal(v[n].link,true);assert.equal(v[n].resolved,'vendor/lazy-val-shim');
 }
 assert.equal(v['vendor/lazy-val-shim'].name,'@elixiroffice/lazy-val-shim');assert.equal(v['vendor/lazy-val-shim'].license,'AGPL-3.0-only');
 assert.equal(v['node_modules/lazy-val'].version,'1.0.5');assert.equal(v['node_modules/lazy-val'].dev,true);
 for(const [n,x] of Object.entries(v))if(n.endsWith('/lazy-val')&&!x.link)assert.equal(x.dev,true,'Registry lazy-val must never be runtime');
});
test('installed updater resolves only owned Lazy without changing build-only original',()=>{
 const load=createRequire(path.join(root,'package.json')),entry=load.resolve('electron-updater');
 const resolved=load.resolve('lazy-val',{paths:[path.dirname(entry)]});
 assert.equal(fs.realpathSync(resolved),path.join(root,'vendor/lazy-val-shim/index.cjs'));
 const old=load('lazy-val/package.json');assert.equal(old.name,'lazy-val');assert.equal(old.version,'1.0.5');
 assert.equal(load('electron-builder/package.json').version,'26.15.3');
});
test('actual updater import and synthetic construction have no update I/O',()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'eo-updater-import-'));
 try{
  const result=spawnSync(process.execPath,[path.join(__dirname,'fixtures/import-updater.cjs'),root,profile],{
   encoding:'utf8',timeout:10000,env:{HOME:profile,PATH:path.dirname(process.execPath)+':/usr/bin:/bin',LANG:'C.UTF-8'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS import and construction/);
  assert.deepEqual(fs.readdirSync(profile),[]);
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});
test('the library enables only reviewed native package policies and does not rewrite app startup',()=>{
 assert.equal(require('../../desktop/update-policy.cjs').production.capability({platform:'win32',arch:'x64',packageType:'nsis',electronVersion:'44.9.1'}).enabled,true);
 assert.equal(require('../../desktop/update-policy.cjs').production.capability({platform:'linux',arch:'x64',packageType:'AppImage',electronVersion:'44.9.1'}).enabled,true);
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 assert.doesNotMatch(main,/require\(['"]electron-updater['"]\)/);
});
