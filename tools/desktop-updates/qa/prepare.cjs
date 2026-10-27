// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {APP_ID,PRODUCT,NSIS_GUID,hash,read,fail}=require('./manifest.cjs');
const {regular,packageHash,sourcePackageHash,verifyPrepared}=require('./guard.cjs');
const identity=require('../../../desktop/build-identity.cjs');
const QA_UNINSTALLER='Uninstall elixiroffice.exe';
function inventory(source){
 const out={};
 function walk(folder,nested=false){
  for(const entry of fs.readdirSync(path.join(source,folder),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   if(!nested&&['assets','node_modules','dist','mac-licenses','build-info.json'].includes(entry.name))continue;
   const name=folder+'/'+entry.name;
   // Select public source formats before any open/stat through a candidate.
   // Never consume environment files, npm credentials, keys or build caches.
   const sourceFile=entry.name==='.gitignore'||['LICENSE','NOTICE'].includes(entry.name)||/\.(?:cjs|js|html|css|json|png|yml|plist|md|txt)$/.test(entry.name);
   if(!entry.isDirectory()&&!sourceFile)continue;
   if(entry.isSymbolicLink())fail();
   if(entry.isDirectory()){if(!nested&&entry.name!=='vendor')fail();walk(name,true);}
   else if(entry.isFile())out[name]=hash(regular(source,name));else fail();
  }
 }
 walk('desktop');
 for(const file of fs.readdirSync(path.join(source,'tools/desktop-updates/qa')).sort()){
  if(file.endsWith('.cjs')){const name='tools/desktop-updates/qa/'+file;out[name]=hash(regular(source,name));}
 }
 return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b,'en')));
}
function replaceExact(text,from,to,count=1){if(text.split(from).length-1!==count)fail();return text.split(from).join(to);}
function prepare({source,output,manifest,seal}={}){
 if(typeof source!=='string'||typeof output!=='string')fail();
 source=path.resolve(source);output=path.resolve(output);
 if(output===source||output.startsWith(source+path.sep)||source.startsWith(output+path.sep))fail();
 const parent=path.dirname(output),ps=fs.lstatSync(parent);
 if(!ps.isDirectory()||ps.isSymbolicLink()||fs.realpathSync(parent)!==parent||ps.uid!==process.getuid()||(ps.mode&0o022)||fs.existsSync(output))fail();
 const m=read(manifest,seal),observed=inventory(source);
 if(JSON.stringify(Object.keys(m.inputs).sort())!==JSON.stringify(Object.keys(observed).sort())||Object.entries(observed).some(([n,d])=>m.inputs[n]!==d))fail();
 const files=new Map();
 for(const name of Object.keys(observed)){const b=regular(source,name);if(hash(b)!==observed[name])fail();if(name.startsWith('desktop/'))files.set(name.slice(8),b);}
 const pkg=JSON.parse(files.get('package.json'));
 if(pkg.build.appId!=='org.elixiroffice.desktop'||pkg.build.productName!=='ElixirOffice'||pkg.main!=='main.cjs'||pkg.build.electronVersion!=='44.9.1')fail();
 let main=files.get('main.cjs').toString();
 main=replaceExact(main,"const defaultProfile=app.getPath('userData');","const qa=require('./qa/composition.cjs').load(__dirname,require('./package.json').qaManifestSha256);\nconst defaultProfile=app.getPath('userData');");
 main=replaceExact(main,"if (process.env.EO_DESKTOP_PROFILE) app.setPath('userData',path.resolve(process.env.EO_DESKTOP_PROFILE));",'// QA profile is compile-time isolated; no environment profile override.');
 main=replaceExact(main,"releaseNotice=require('./release-notice.cjs').create({",'releaseNotice=qa.createNotice({');
 main=replaceExact(main,"const policy=require('./update-policy.cjs').production;",'const policy=qa.policy;');
 main=replaceExact(main,"createRuntimeSession({...context,app,version:app.getVersion(),eligibility,cacheRoot:","createRuntimeSession({...context,policy,transport:qa.createTransport(eligibility.target),app,version:app.getVersion(),eligibility,cacheRoot:");
 main=replaceExact(main,"'signed-updates-v1'","'signed-updates-qa-v1'");
 files.set('main.cjs',Buffer.from(main.replaceAll('ElixirOffice',PRODUCT)));
 let security=files.get('update-windows-security.cjs').toString();
 security=replaceExact(security,'5fa5daf2-a61b-5cb4-8b40-2391c8734adc',NSIS_GUID,2);
 security=replaceExact(security,'Uninstall ElixirOffice.exe',QA_UNINSTALLER);
 security=replaceExact(security,"-ceq 'ElixirOffice'","-ceq '"+PRODUCT+"'");
 files.set('update-windows-security.cjs',Buffer.from(security));
 files.set('update-package.cjs',Buffer.from(replaceExact(files.get('update-package.cjs').toString(),'Uninstall ElixirOffice.exe',QA_UNINSTALLER)));
 const id=identity.create('0.0.0','rc',m.currentBuild,m.productRevision,m.documentserverRevision);
 pkg.qaIdentity={appId:APP_ID,productName:PRODUCT,nsisGuid:NSIS_GUID};
 pkg.name='elixiroffice-update-qa';pkg.version=id.version;pkg.description=PRODUCT+' — NEVER PUBLISH';pkg.main='qa/entry.cjs';
 pkg.scripts={start:'electron .','qa:package:linux':'electron-builder --linux AppImage --x64 --publish never','qa:package:windows':'electron-builder --win nsis --x64 --publish never'};
 Object.assign(pkg.build,{appId:APP_ID,productName:PRODUCT,buildNumber:String(m.currentBuild),buildVersion:id.windows_version,beforePack:'./qa/before-pack.cjs',publish:null});
 Object.assign(pkg.build.mac,{bundleShortVersion:id.mac_short_version,bundleVersion:id.mac_bundle_version});
 pkg.build.win.executableName='elixiroffice';pkg.build.nsis.guid=NSIS_GUID;pkg.build.nsis.shortcutName=PRODUCT;pkg.build.nsis.uninstallDisplayName=PRODUCT;
 pkg.build.artifactName='ElixirOffice-${version}-win-x64.${ext}';pkg.build.appImage.artifactName='ElixirOffice-${version}-x86_64.${ext}';
 pkg.build.fileAssociations=[];pkg.desktopName=APP_ID+'.desktop';pkg.build.linux.desktop.entry.MimeType='';
 files.set('build-info.json',Buffer.from(JSON.stringify(id)+'\n'));
 files.set('QA-DO-NOT-PUBLISH.json',Buffer.from(JSON.stringify({schema:1,flavor:m.flavor,neverPublish:true,role:m.role,appId:APP_ID,version:id.version,inputManifestSha256:seal})+'\n'));
 for(const name of ['manifest.cjs','guard.cjs','composition.cjs','transport.cjs']){
  const p='tools/desktop-updates/qa/'+name,b=regular(source,p);if(hash(b)!==m.inputs[p])fail();files.set('qa/'+name,b);
 }
 files.set('qa/entry.cjs',Buffer.from("// SPDX-License-Identifier: AGPL-3.0-only\n'use strict';\nconst path=require('node:path'),root=path.resolve(__dirname,'..');\nrequire('./guard.cjs').verifyPrepared(root,require('../package.json').qaManifestSha256);\nrequire('../main.cjs');\n"));
 files.set('qa/before-pack.cjs',Buffer.from("// SPDX-License-Identifier: AGPL-3.0-only\n'use strict';\nmodule.exports=async context=>{\n if(!['linux','win32'].includes(context.electronPlatformName))throw Error('QA target refused');\n const root=context.packager.info.appDir,pkg=require(require('node:path').join(root,'package.json'));\n if(!pkg.build)throw Error('QA build metadata missing');\n require('./guard.cjs').verifyPrepared(root,pkg.qaManifestSha256);\n const assert=require('node:assert/strict'),id=require('../build-identity.cjs').verifyPackage(pkg,require('../build-info.json'));\n assert.equal(context.packager.appInfo.version,id.version);\n assert.equal(context.packager.appInfo.buildVersion,id.windows_version);\n};\n"));
 if(files.has('package-lock.json')){
  const lock=JSON.parse(files.get('package-lock.json'));lock.name=pkg.name;lock.version=pkg.version;
  if(lock.packages?.['']){lock.packages[''].name=pkg.name;lock.packages[''].version=pkg.version;}
  files.set('package-lock.json',Buffer.from(JSON.stringify(lock,null,2)+'\n'));
 }
 const buildOnly=new Set(['.gitignore','package-lock.json']);
 pkg.build.files=[...new Set([...files.keys(),'package.json','qa/manifest.json'])].filter(n=>!buildOnly.has(n)).sort();
 files.set('package.json',Buffer.from(JSON.stringify(pkg)+'\n'));
 const digests={},buildFiles={};for(const [name,b] of [...files].sort(([a],[b])=>a.localeCompare(b,'en'))){if(buildOnly.has(name))buildFiles[name]=hash(b);else digests[name]=name==='package.json'?packageHash(b):hash(b);}
 const compiled=Buffer.from(JSON.stringify({schema:1,input:m,inputSeal:seal,files:digests,buildFiles,buildPackageSha256:sourcePackageHash(files.get('package.json'))})+'\n'),compiledSeal=hash(compiled);
 pkg.qaManifestSha256=compiledSeal;files.set('package.json',Buffer.from(JSON.stringify(pkg)+'\n'));files.set('qa/manifest.json',compiled);
 let owned;
 try{
  fs.mkdirSync(output,{mode:0o700});owned=fs.lstatSync(output);
  for(const [name,b] of files){
   const dest=path.join(output,name);fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
   const fd=fs.openSync(dest,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  verifyPrepared(output,compiledSeal);
  return Object.freeze({schema:1,neverPublish:true,role:m.role,appId:APP_ID,version:pkg.version,manifestSha256:compiledSeal,entrySha256:digests['qa/entry.cjs']});
 }catch{
  if(owned){const stat=fs.lstatSync(output);if(stat.ino===owned.ino&&stat.dev===owned.dev)fs.rmSync(output,{recursive:true});}fail();
 }
}
if(require.main===module){
 try{
  const args=process.argv.slice(2),o={};if(args.length!==8)fail();
  for(let i=0;i<args.length;i+=2){if(!['--source','--output','--manifest','--seal'].includes(args[i])||Object.hasOwn(o,args[i]))fail();o[args[i]]=args[i+1];}
  const mf=path.resolve(o['--manifest']),bytes=regular(path.dirname(mf),path.basename(mf));
  console.log(JSON.stringify(prepare({source:o['--source'],output:o['--output'],manifest:bytes,seal:o['--seal']})));
 }catch{console.error('QA flavor preparation refused');process.exitCode=1;}
}
module.exports={inventory,prepare,APP_ID,PRODUCT,NSIS_GUID};
