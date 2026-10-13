// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const {template}=require('../../desktop/menu.cjs'),{configuration}=require('../../tools/desktop/mac-config.cjs'),{clean,types,unused}=require('../../tools/desktop/mac-after-pack.cjs');
test('Mac menus preserve editor undo/redo and standard close role',()=>{
 const menu=template('darwin',()=>()=>{},()=>{});assert.deepEqual(menu.map(item=>item.label),['ElixirOffice','File','Edit','Window','Help']);
 for(const platform of ['darwin','linux','win32'])for(const item of template(platform,()=>()=>{},()=>{}).find(item=>item.label==='Edit').submenu.filter(item=>['undo','redo'].includes(item.role)))assert.equal(item.accelerator,'');
 assert(menu[0].submenu.some(item=>item.role==='services'));assert(menu[0].submenu.some(item=>item.label==='Settings…'));
 assert.equal(menu.find(item=>item.label==='Window').submenu.find(item=>item.role==='close').accelerator,'Command+W');
});
test('Mac metadata never advertises unused permissions or default ownership',()=>{
 const plist=clean({...Object.fromEntries(unused.map(key=>[key,'unused'])),CFBundleIconFile:'icon.icns'},true);
 for(const key of unused)assert(!Object.hasOwn(plist,key));assert.deepEqual(plist.CFBundleDocumentTypes.flatMap(entry=>entry.CFBundleTypeExtensions).sort(),require('../../desktop/files.cjs').formats.slice().sort());
 for(const entry of plist.CFBundleDocumentTypes){assert.equal(entry.LSHandlerRank,'Alternate');assert.deepEqual(entry.LSItemContentTypes,[types[entry.CFBundleTypeExtensions[0]]]);}
});
test('Signing preparation is unsigned by default and notarization is explicit',()=>{
 const unsigned=configuration({});assert.equal(unsigned.mac.identity,null);assert.equal(unsigned.mac.notarize,false);assert.equal(unsigned.mac.hardenedRuntime,true);
 assert.throws(()=>configuration({EO_MAC_NOTARIZE:'1'}),/identity/);
 assert.throws(()=>configuration({EO_MAC_SIGNING_IDENTITY:'-'}),/Developer ID/);
 assert.throws(()=>configuration({EO_MAC_SIGNING_IDENTITY:'Developer ID Application: Test',EO_MAC_NOTARIZE:'1'}),/credential set/);
 const signed=configuration({EO_MAC_SIGNING_IDENTITY:'Developer ID Application: Test',EO_MAC_NOTARIZE:'1',APPLE_ID:'test',APPLE_APP_SPECIFIC_PASSWORD:'test',APPLE_TEAM_ID:'test'});
 assert.equal(signed.mac.notarize,true);assert.equal(signed.mac.entitlements,'entitlements.mac.plist');
});

test('Queued OS and argument paths accept only supported document extensions',()=>{
 const {documentPath}=require('../../desktop/document-path.cjs');
 for(const invalid of [null,{},'', '--inspect','/tmp/image.png','/tmp/document.docx.exe','file://bad%host/a.docx'])assert.equal(documentPath(invalid),null);
 assert.equal(documentPath('/tmp/sample.DOCX'),'/tmp/sample.DOCX');
 assert.equal(documentPath('file:///tmp/sample%20file.xlsx'),'/tmp/sample file.xlsx');
});

test('Local ad-hoc sealing never replaces an explicit publisher identity',()=>{
 const {needsAdHoc}=require('../../tools/desktop/mac-after-pack.cjs');
 assert.equal(needsAdHoc({electronPlatformName:'darwin',packager:{platformSpecificBuildOptions:{identity:null}}}),true);
 assert.equal(needsAdHoc({electronPlatformName:'darwin',packager:{platformSpecificBuildOptions:{identity:'Developer ID Application: Test'}}}),false);
 assert.equal(needsAdHoc({electronPlatformName:'win32'}),false);
});
