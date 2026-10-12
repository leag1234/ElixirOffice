// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const types={
 docx:'org.openxmlformats.wordprocessingml.document',xlsx:'org.openxmlformats.spreadsheetml.sheet',pptx:'org.openxmlformats.presentationml.presentation',
 odt:'org.oasis-open.opendocument.text',ods:'org.oasis-open.opendocument.spreadsheet',odp:'org.oasis-open.opendocument.presentation',
 doc:'com.microsoft.word.doc',xls:'com.microsoft.excel.xls',ppt:'com.microsoft.powerpoint.ppt'
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
}
module.exports=afterPack;
module.exports.types=types;module.exports.unused=unused;module.exports.clean=clean;
