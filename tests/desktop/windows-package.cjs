// SPDX-License-Identifier: AGPL-3.0-only
// Artifact acceptance on Linux; this does not execute Windows application behavior.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const R=require(path.join(root,'desktop/node_modules/resedit'));
const asar=require(path.join(root,'desktop/node_modules/@electron/asar'));
const config=require(path.join(root,'desktop/package.json'));
const dist=path.resolve(process.argv[2]||path.join(root,'desktop/dist')),payload=path.resolve(process.argv[3]||'');
assert(process.argv[3],'Pass the extracted installer payload directory');
const installer=path.join(dist,'ElixirOffice-'+config.version+'-win-x64.exe');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const identity=require(path.join(root,'desktop/build-info.json'));
const versionCheck=require(path.join(root,'tools/desktop/check-windows-version.cjs'));
function executable(filename,machine,installer=false) {
 const bytes=fs.readFileSync(filename),pe=bytes.readUInt32LE(0x3c);
 assert.equal(bytes.toString('ascii',0,2),'MZ');assert.equal(bytes.readUInt32LE(pe),0x4550);
 assert.equal(bytes.readUInt16LE(pe+4),machine);
 const optional=pe+24,magic=bytes.readUInt16LE(optional);
 assert([0x10b,0x20b].includes(magic));
 const security=optional+(magic===0x20b?112:96)+4*8;
 assert.equal(bytes.readUInt32LE(security),0,'Unexpected Authenticode certificate');
 assert.equal(bytes.readUInt32LE(security+4),0,'Unexpected certificate length');
 const entries=R.NtExecutableResource.from(R.NtExecutable.from(bytes)).entries;
 const versions=R.Resource.VersionInfo.fromEntries(entries);
 assert(versions.length,'Missing product version resource');
 const strings=versions.flatMap(v=>v.getAllLanguagesForStringValues().map(lang=>v.getStringValues(lang)));
 assert(strings.some(v=>v.ProductName==='ElixirOffice'),'Wrong product name');
 versionCheck.verify(versions,identity,installer);
 assert(R.Resource.IconGroupEntry.fromEntries(entries).length,'Missing icon resource');
 console.log('PASS unsigned PE/product/version/icon',path.basename(filename),machine.toString(16));
 return entries;
}
const unpacked=path.join(dist,'win-unpacked');
const entries=executable(path.join(unpacked,'ElixirOffice.exe'),0x8664);
executable(path.join(path.dirname(payload),'installer','$R0','Uninstall ElixirOffice.exe'),0x14c,true);
executable(installer,0x14c,true); // NSIS uses an x86 bootstrapper to install the x64 application.
const iconFile=path.join(dist,'.icon-ico/icon.ico');
assert(fs.existsSync(iconFile),'Missing converted application icon');
const expectedIcons=R.Data.IconFile.from(fs.readFileSync(iconFile)).icons.map(i=>sha(Buffer.from(i.data.isRaw()?i.data.bin:i.data.generate()))).sort();
const actualIcons=R.Resource.IconGroupEntry.fromEntries(entries)[0].getIconItemsFromEntries(entries).map(i=>sha(Buffer.from(i.isRaw()?i.bin:i.generate()))).sort();
assert.deepEqual(actualIcons,expectedIcons,'Executable icon differs from converted application icon');
console.log('PASS application icon bytes');
for(const base of [unpacked,payload]) {
 assert(fs.statSync(path.join(base,'LICENSES.chromium.html')).size>1000);
 const assets=path.join(base,'resources/assets'),manifest=JSON.parse(fs.readFileSync(path.join(assets,'desktop-manifest.json')));
 assert.equal(manifest.fontSet,'standard');assert.equal(manifest.pruning.staticHelpAnimations,44);
 for(const relative of ['sdkjs/visio','web-apps/apps/visioeditor','web-apps/vendor/monaco'])assert(!fs.existsSync(path.join(assets,relative)));
 const names=Object.keys(manifest.files);assert(!names.some(n=>n.endsWith('_ie.js')));
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor']) {
  assert(names.some(n=>n.startsWith('web-apps/apps/'+editor+'/')&&n.includes('/help/')));
  assert(names.some(n=>n.startsWith('web-apps/apps/'+editor+'/')&&n.includes('/locale/')));
 }
 console.log('PASS standard fonts/static help/locales/licences/pruning',base,names.length);
}
function files(directory,prefix='') {
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const name=prefix+entry.name,full=path.join(directory,entry.name);
  assert(!entry.isSymbolicLink(),'Unexpected installer payload symlink');
  return entry.isDirectory()?files(full,name+'/'):[name];
 }).sort();
}
const originalFiles=files(unpacked),payloadFiles=files(payload);
assert.deepEqual(payloadFiles,originalFiles,'Installed payload file set differs');
for(const name of originalFiles)assert.equal(sha(fs.readFileSync(path.join(payload,name))),sha(fs.readFileSync(path.join(unpacked,name))),name);
console.log('PASS installer payload matches unpacked application',originalFiles.length,'files');
const buildOnlyHook='build-identity-before-pack.cjs';
assert(config.build.files.includes('!'+buildOnlyHook),'Missing build-only hook exclusion');
for(const base of [unpacked,payload]) {
 const packagedArchive=path.join(base,'resources/app.asar');
 assert(!asar.listPackage(packagedArchive).some(n=>n.replace(/^\//,'')===buildOnlyHook),'Build-only hook leaked into application payload');
 assert.deepEqual(JSON.parse(asar.extractFile(packagedArchive,'build-info.json')),identity);
 assert.equal(JSON.parse(asar.extractFile(packagedArchive,'package.json')).version,identity.version);
}
for(const name of fs.readdirSync(path.join(root,'desktop')).filter(n=>(/\.(cjs|js|html|css)$/.test(n)||n==='icon.png')&&n!==buildOnlyHook)) {
 assert.deepEqual(asar.extractFile(path.join(payload,'resources/app.asar'),name),fs.readFileSync(path.join(root,'desktop',name)),name);
}
console.log('PASS packaged application sources');
const extensions=config.build.fileAssociations.flatMap(a=>a.ext).sort();
assert.deepEqual(extensions,['doc','docx','odp','ods','odt','ppt','pptx','xls','xlsx','rtf','txt','csv','dotx','docm','xltx','xlsm','potx','ppsx','pdf'].sort());
assert.equal(config.build.nsis.oneClick,false);assert.equal(config.build.nsis.allowToChangeInstallationDirectory,true);
assert.equal(config.build.win.signExecutable,false);assert.equal(config.build.win.icon,'icon.png');
console.log('PASS configured nineteen associations/interactive install/unsigned metadata');
console.log('UNVERIFIED native Windows install/uninstall, double-click, dialogs, open/edit/save/reopen/PDF/Print, fonts, offline/no-Node, SmartScreen');
console.log('INSTALLER',fs.statSync(installer).size,'bytes','SHA256',sha(fs.readFileSync(installer)));
