// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const network=require('./fixtures/deny-update-network.cjs')();
const {runtimeTarget,createEligibility}=require('../../desktop/update-package.cjs');
const roots=[];
async function directory(){const p=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-update-package-')));roots.push(p);return p;}
function image(){const b=Buffer.alloc(128);b.set([127,69,76,70,2,1,1]);b.set([65,73,2],8);b.writeUInt16LE(62,18);return b;}
test.after(async()=>{assert.equal(network.calls,0);for(const p of roots)await fs.rm(p,{recursive:true,force:true});});
test('platform identity cannot qualify macOS, development, Store, DEB, Flatpak, Snap or unknown',()=>{
 const base={arch:'x64',electronVersion:'44.9.1',packaged:true};
 for(const options of [{platform:'darwin'},{platform:'win32',windowsStore:true},{platform:'linux'},{platform:'linux',appImage:'/tmp/app',flatpak:'org.synthetic'},{platform:'linux',appImage:'/tmp/app',snap:'/snap/synthetic'},{platform:'win32',packaged:false}])
  assert.equal(runtimeTarget({...base,...options}).packageType,'unknown');
 assert.equal(runtimeTarget({...base,platform:'win32'}).packageType,'nsis');
 assert.equal(runtimeTarget({...base,platform:'linux',appImage:'/tmp/app.AppImage'}).packageType,'AppImage');
});
test('AppImage eligibility captures only a writable real startup image with its mounted executable',async()=>{
 const dir=await directory(),file=path.join(dir,'app.AppImage'),appDir=path.join(dir,'mount'),execPath=path.join(appDir,'elixiroffice');
 await fs.mkdir(appDir);await fs.writeFile(execPath,'synthetic executable');await fs.writeFile(file,image(),{mode:0o755});
 const source=createEligibility({platform:'linux',arch:'x64',packaged:true,appImage:file,appDir,execPath});
 assert.equal(await source.check(),true);assert.equal(source.details().startup.path,file);
 await fs.chmod(file,0o444);assert.equal(await source.check(),false);
});
test('AppImage symlinks, nonmounted/foreign executables and nonexecutables remain manual-only',async()=>{
 for(const kind of ['symlink','foreign','not-executable']){
  const dir=await directory(),file=path.join(dir,'app.AppImage'),appDir=path.join(dir,'mount'),execPath=path.join(kind==='foreign'?dir:appDir,'elixiroffice');
  await fs.mkdir(appDir);await fs.writeFile(execPath,'synthetic');await fs.writeFile(file,image(),{mode:kind==='not-executable'?0o600:0o755});
  if(kind==='symlink'){await fs.rename(file,file+'.real');await fs.symlink(file+'.real',file);}
  const source=createEligibility({platform:'linux',arch:'x64',packaged:true,appImage:file,appDir,execPath});
  assert.equal(await source.check(),false);assert.throws(()=>source.details());
 }
});
test('NSIS needs a registered install location, private owned folder and actual regular uninstaller',async()=>{
 for(const kind of ['valid','unregistered','acl','missing','symlink']){
  const dir=await directory(),exe=path.join(dir,'ElixirOffice.exe'),uninstaller=path.join(dir,'Uninstall ElixirOffice.exe');
  await fs.writeFile(exe,'MZ synthetic');if(kind!=='missing')await fs.writeFile(uninstaller,'MZ synthetic');
  if(kind==='symlink'){await fs.rename(uninstaller,uninstaller+'.real');await fs.symlink(uninstaller+'.real',uninstaller);}
  const checks=[];
  const source=createEligibility({platform:'win32',arch:'x64',packaged:true,execPath:exe,security:{async installed(folder){checks.push(folder);return kind!=='unregistered';},async verify(){return kind!=='acl';}}});
  assert.equal(await source.check(),kind==='valid');if(kind==='valid'){assert.equal(source.details().packageType,'nsis');assert.deepEqual(checks,[dir]);}
 }
});
test('unsupported source never probes filesystem or native security',async()=>{
 let calls=0;const source=createEligibility({platform:'darwin',arch:'arm64',packaged:true,security:{verify(){calls++;},installed(){calls++;}}});
 assert.equal(await source.check(),false);assert.equal(calls,0);assert.throws(()=>source.details());
});
test('failed or changed startup eligibility cannot return a stale capability',async()=>{
 const dir=await directory(),file=path.join(dir,'app.AppImage'),appDir=path.join(dir,'mount'),execPath=path.join(appDir,'elixiroffice');
 await fs.mkdir(appDir);await fs.writeFile(execPath,'synthetic');await fs.writeFile(file,image(),{mode:0o755});
 const source=createEligibility({platform:'linux',arch:'x64',packaged:true,appImage:file,appDir,execPath});
 assert.equal(await source.check(),true);await fs.chmod(file,0o600);assert.equal(await source.check(),false);assert.throws(()=>source.details());
 await fs.chmod(file,0o755);assert.equal(await source.check(),false,'A changed startup identity needs a new application launch');
});
