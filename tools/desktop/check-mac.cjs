// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const run=(program,args)=>cp.execFileSync(program,args,{encoding:'utf8'});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 assert.equal(process.platform,'darwin');
 const [directory,output]=process.argv.slice(2);assert(directory&&output);
 const dist=path.resolve(directory),out=path.resolve(output);assert(!fs.existsSync(out),'Choose a new acceptance folder');
 const identity=require(path.join(root,'desktop/build-info.json'));
 const config=require(path.join(root,'desktop/package.json')),dmg=path.join(dist,'ElixirOffice-'+config.version+'-mac-arm64.dmg');
 console.log(run('/usr/bin/hdiutil',['verify',dmg]));
 fs.mkdirSync(out,{recursive:true});const mount=path.join(out,'mount');fs.mkdirSync(mount);
 let mounted=false;
 try {
  run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);mounted=true;
  const app=path.join(out,'ElixirOffice.app');run('/bin/cp',['-R',path.join(mount,'ElixirOffice.app'),app]);
  for(const bundle of [path.join(dist,'mac-arm64','ElixirOffice.app'),app]) {
   const contents=path.join(bundle,'Contents');
   const plist=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(contents,'Info.plist')]));
   assert.equal(plist.CFBundleIdentifier,config.build.appId);assert.equal(plist.CFBundleShortVersionString,identity.mac_short_version);assert.equal(plist.CFBundleVersion,identity.mac_bundle_version);assert.equal(plist.CFBundleDisplayName,'ElixirOffice');
   assert.equal(plist.LSApplicationCategoryType,'public.app-category.productivity');
   const extensions=plist.CFBundleDocumentTypes.flatMap(type=>type.CFBundleTypeExtensions||[]).sort();
   assert.deepEqual(extensions,['doc','docx','odp','ods','odt','ppt','pptx','xls','xlsx','rtf','txt','csv','dotx','docm','xltx','xlsm','potx','ppsx','pdf'].sort());
   const {types,unused}=require('./mac-after-pack.cjs');
   assert.equal(plist.CFBundleDocumentTypes.length,19);
   for(const entry of plist.CFBundleDocumentTypes){assert.equal(entry.LSHandlerRank,'Alternate');assert.deepEqual(entry.LSItemContentTypes,[types[entry.CFBundleTypeExtensions[0]]]);}
   function checkPlists(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);if(entry.isDirectory())checkPlists(file);else if(entry.name==='Info.plist'){
     const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',file]));
     for(const key of unused)assert(!Object.hasOwn(info,key),file+' unused '+key);
    }
   }}
   checkPlists(bundle);
   const build=require('./mac-config.cjs').configuration({});
   assert.equal(build.mac.hardenedRuntime,true);assert.equal(build.mac.identity,null);assert.equal(build.mac.notarize,false);
   const entitlements=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(root,'desktop/entitlements.mac.plist')]));
   assert.deepEqual(entitlements,{'com.apple.security.cs.allow-jit':true,'com.apple.security.cs.allow-unsigned-executable-memory':true});

   const executable=path.join(contents,'MacOS',plist.CFBundleExecutable),bytes=fs.readFileSync(executable);
   assert.equal(bytes.readUInt32LE(0),0xfeedfacf);assert.equal(bytes.readUInt32LE(4),0x0100000c);
   run('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
   const signature=cp.spawnSync('/usr/bin/codesign',['-dv','--verbose=2',bundle],{encoding:'utf8'});
   assert.equal(signature.status,0);assert.match(signature.stderr,/Signature=adhoc/);assert.match(signature.stderr,/TeamIdentifier=not set/);
   const icon=path.join(contents,'Resources',plist.CFBundleIconFile.endsWith('.icns')?plist.CFBundleIconFile:plist.CFBundleIconFile+'.icns');
   assert.equal(fs.readFileSync(icon).subarray(0,4).toString(),'icns');
   const generated=path.join(dist,'.icon-icns','icon.icns');assert.equal(hash(icon),hash(generated));
   console.log(run('python3',[path.join(root,'tests/desktop/verify-resources.py'),path.join(contents,'Resources','assets')]));
   console.log(run('python3',[path.join(root,'tests/desktop/check-samples.py'),path.join(contents,'Resources','assets')]));
   const asar=require('node:module').createRequire(path.join(root,'desktop/node_modules/app-builder-lib/package.json'))('@electron/asar'),archive=path.join(contents,'Resources','app.asar');
   require('./check-version.cjs').verify(JSON.parse(asar.extractFile(archive,'package.json')),config.version);
   assert.deepEqual(JSON.parse(asar.extractFile(archive,'build-info.json')),identity);require(path.join(root,'desktop/build-identity.cjs')).validate(identity);
   assert(!asar.listPackage(archive).some(name=>/\.(docx|xlsx|pptx|odt|ods|odp|doc|xls|ppt|pdf)$/i.test(name)),'Document fixture unexpectedly shipped in app.asar');
   const buildOnlyHook='build-identity-before-pack.cjs';
   assert(config.build.files.includes('!'+buildOnlyHook),'Missing build-only hook exclusion');
   assert(!asar.listPackage(archive).some(name=>name.replace(/^\//,'')===buildOnlyHook),'Build-only hook leaked into application payload');
   for(const name of fs.readdirSync(path.join(root,'desktop')).filter(name=>(/\.(cjs|js|html|css)$/.test(name)||name==='icon.png')&&name!==buildOnlyHook))
    assert(fs.readFileSync(path.join(root,'desktop',name)).equals(asar.extractFile(archive,name)),name+' packaged source mismatch');
   const assets=path.join(contents,'Resources','assets'),manifest=JSON.parse(fs.readFileSync(path.join(assets,'desktop-manifest.json')));
   assert.equal(manifest.fontSet,'standard');assert.equal(manifest.pruning.staticHelpAnimations,44);
   assert(!Object.keys(manifest.files).some(name=>/visio|monaco|_ie\.js$/.test(name)));
   for(const [name,dest] of [['LICENSE','LICENSE.electron'],['LICENSES.chromium.html','LICENSES.chromium.html']])assert.equal(hash(path.join(contents,'Resources',dest)),hash(path.join(root,'desktop/mac-licenses',name)));
   console.log('PASS arm64 plist/nineteen associations/icon/ad-hoc-no-publisher/source/resources',bundle);
  }
  function walk(base,relative=''){return fs.readdirSync(path.join(base,relative),{withFileTypes:true}).flatMap(entry=>{const name=path.join(relative,entry.name);return entry.isDirectory()?walk(base,name):[name]}).sort()}
  const original=path.join(dist,'mac-arm64','ElixirOffice.app'),copied=path.join(out,'ElixirOffice.app');
  const names=walk(original);assert.deepEqual(walk(copied),names);
  for(const name of names){const a=path.join(original,name),b=path.join(copied,name);if(fs.lstatSync(a).isSymbolicLink())assert.equal(fs.readlinkSync(a),fs.readlinkSync(b));else assert.equal(hash(a),hash(b),name)}
  console.log('PASS actual DMG application matches unpacked application',names.length,'entries');
  console.log('DMG',fs.statSync(dmg).size,'bytes SHA256',hash(dmg));
  console.log('UNVERIFIED downloaded quarantine/Gatekeeper, installed associations, Intel/universal; native GUI checked separately');
 }finally{if(mounted)run('/usr/bin/hdiutil',['detach',mount])}
})().catch(error=>{console.error(error);process.exitCode=1});
