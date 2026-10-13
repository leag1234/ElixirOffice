// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const types={
 docx:'org.openxmlformats.wordprocessingml.document',xlsx:'org.openxmlformats.spreadsheetml.sheet',pptx:'org.openxmlformats.presentationml.presentation',
 odt:'org.oasis-open.opendocument.text',ods:'org.oasis-open.opendocument.spreadsheet',odp:'org.oasis-open.opendocument.presentation',
 doc:'com.microsoft.word.doc',xls:'com.microsoft.excel.xls',ppt:'com.microsoft.powerpoint.ppt',
 rtf:'public.rtf',txt:'public.plain-text',csv:'public.comma-separated-values-text',dotx:'org.openxmlformats.wordprocessingml.template',docm:'com.microsoft.word.docm',xltx:'org.openxmlformats.spreadsheetml.template',xlsm:'com.microsoft.excel.xlsm',potx:'org.openxmlformats.presentationml.template',ppsx:'org.openxmlformats.presentationml.slideshow'
};
const unused=['NSCameraUsageDescription','NSMicrophoneUsageDescription','NSBluetoothAlwaysUsageDescription','NSBluetoothPeripheralUsageDescription','NSAppTransportSecurity'];
function clean(plist,main=false) {
 for(const key of unused)delete plist[key];
 if(main)plist.CFBundleDocumentTypes=Object.entries(types).map(([ext,uti])=>({
  CFBundleTypeExtensions:[ext],CFBundleTypeName:ext.toUpperCase()+' document',CFBundleTypeRole:'Editor',
  CFBundleTypeIconFile:plist.CFBundleIconFile,LSItemContentTypes:[uti],LSHandlerRank:'Alternate'
 }));
 return plist;
}
function needsAdHoc(context) {
 return context.electronPlatformName==='darwin' && context.packager.platformSpecificBuildOptions.identity===null;
}
async function sealAdHoc(bundle) {
 // Sign native code and nested bundles first; never discover a certificate.
 const magic=new Set([0xfeedface,0xcefaedfe,0xfeedfacf,0xcffaedfe,0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca]),targets=[];
 async function collect(folder) {for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
  const file=path.join(folder,entry.name);
  if(entry.isDirectory()) {await collect(file);if(/\.(app|framework|xpc)$/.test(entry.name))targets.push(file);}
  else if(entry.isFile()) {
   const handle=await fs.open(file,'r');const buffer=Buffer.alloc(4);
   try {const {bytesRead}=await handle.read(buffer,0,4,0);if(bytesRead===4&&magic.has(buffer.readUInt32BE(0)))targets.push(file);}
   finally {await handle.close();}
  }
 }}
 await collect(path.join(bundle,'Contents/Frameworks'));targets.push(bundle);
 for(const target of targets)cp.execFileSync('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',target]);
 cp.execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
}
async function afterPack(context) {
 if(context.electronPlatformName!=='darwin')return;
 const bundle=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
 async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);
  else if(entry.name==='Info.plist'){
   const plist=JSON.parse(cp.execFileSync('/usr/bin/plutil',['-convert','json','-o','-',file],{encoding:'utf8'}));
   await fs.writeFile(file,JSON.stringify(clean(plist,file===path.join(bundle,'Contents/Info.plist'))));
   cp.execFileSync('/usr/bin/plutil',['-convert','xml1',file]);
  }
 }}
 await walk(bundle);
 if(needsAdHoc(context))await sealAdHoc(bundle);
}
module.exports=afterPack;
module.exports.types=types;module.exports.unused=unused;module.exports.clean=clean;

module.exports.needsAdHoc=needsAdHoc;
