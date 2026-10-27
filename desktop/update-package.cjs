// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {captureAppImage}=require('./update-installers.cjs'),{same,stamp}=require('./update-store.cjs');
function runtimeTarget({platform=process.platform,arch=process.arch,electronVersion=process.versions.electron,packaged=false,windowsStore=false,appImage,snap,flatpak}={}){
 let packageType='unknown';
 if(packaged&&platform==='win32'&&!windowsStore)packageType='nsis';
 if(packaged&&platform==='linux'&&typeof appImage==='string'&&path.isAbsolute(appImage)&&!snap&&!flatpak)packageType='AppImage';
 return Object.freeze({platform,arch,electronVersion,packageType,checksEnabled:true});
}
function createEligibility(options={}){
 const target=runtimeTarget(options);let selected=null,valid=false,windows=options.security;
 async function check(){
  valid=false;try{
   if(target.arch!=='x64')return false;
   if(target.packageType==='AppImage'){
    if(typeof options.appDir!=='string'||typeof options.execPath!=='string')return false;
    const mount=await fs.realpath(options.appDir),exe=await fs.realpath(options.execPath),relative=path.relative(mount,exe);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.basename(exe)!=='elixiroffice')return false;
    const startup=await captureAppImage({file:options.appImage,platform:'linux'});
    const observed=await fs.lstat(options.appImage);
    if(selected&&(selected.startup.path!==startup.path||!same(selected.stamp,observed)))return false;
    if(!selected)selected={packageType:'AppImage',startup,stamp:stamp(observed)};
    valid=true;return true;
   }
   if(target.packageType!=='nsis'||typeof options.execPath!=='string'||!path.isAbsolute(options.execPath)||path.basename(options.execPath).toLowerCase()!=='elixiroffice.exe')return false;
   const folder=path.dirname(options.execPath);
   if(await fs.realpath(folder)!==folder)return false;
   const uninstall=path.join(folder,'Uninstall ElixirOffice.exe'),stat=await fs.lstat(uninstall);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<2)return false;
   if(!windows)windows=require('./update-windows-security.cjs').createWindowsSecurity();
   if(await windows.installed(folder)!==true||await windows.verify(folder,true)!==true||await windows.verify(uninstall,false)!==true)return false;
   selected={packageType:'nsis'};valid=true;return true;
  }catch{return false;}
 }
 return Object.freeze({target,check,details(){if(!selected||!valid)throw Error('Update package unavailable');return Object.freeze({packageType:selected.packageType,...(selected.startup?{startup:selected.startup}:{})});}});
}
module.exports={runtimeTarget,createEligibility};
