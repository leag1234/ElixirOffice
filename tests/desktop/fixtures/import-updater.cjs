// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Third-party import/construction probe. All update I/O is denied, no Electron
// runtime starts, and the app adapter is a synthetic value.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const root=process.argv[2],profile=process.argv[3],load=Module.createRequire(path.join(root,'package.json'));
let calls=0;
function denied(){calls++;throw Error('Unexpected updater I/O');}
for(const name of ['node:http','node:https']){const m=require(name);m.request=denied;m.get=denied;}
const net=require('node:net');net.connect=denied;net.createConnection=denied;net.Socket.prototype.connect=denied;
require('node:tls').connect=denied;
const cp=require('node:child_process');for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=denied;
for(const name of ['writeFile','writeFileSync','appendFile','appendFileSync','createWriteStream','mkdir','mkdirSync','rename','renameSync','unlink','unlinkSync','chmod','chmodSync'])fs[name]=denied;
for(const name of ['writeFile','appendFile','mkdir','rename','unlink','chmod'])fs.promises[name]=denied;
const original=Module._load;
Module._load=function(name,...args){
 if(name==='electron')return {app:{getVersion:denied,getPath:denied,whenReady:denied},net:{request:denied},session:{fromPartition:denied},autoUpdater:{emit:denied}};
 return original.call(this,name,...args);
};
const updater=load('electron-updater');
assert.equal(typeof Object.getOwnPropertyDescriptor(updater,'autoUpdater').get,'function');
const selected=load.resolve('lazy-val',{paths:[path.dirname(load.resolve('electron-updater'))]});
const {Lazy}=load(selected);
for(const Class of [updater.NsisUpdater,updater.AppImageUpdater]){
 const app={version:'0.0.0',name:'synthetic-updater-probe',isPackaged:true,userDataPath:profile,baseCachePath:profile,
  whenReady:denied,quit:denied,relaunch:denied,onQuit:denied};
 const instance=new Class(null,app);
 // Fixed before any check/download/install call, which this probe never makes.
 instance.autoDownload=false;instance.autoInstallOnAppQuit=false;instance.autoRunAppAfterInstall=false;
 instance.allowDowngrade=false;instance.disableWebInstaller=true;instance.disableDifferentialDownload=true;instance.forceDevUpdateConfig=false;
 assert(instance.configOnDisk instanceof Lazy);assert(instance.stagingUserIdPromise instanceof Lazy);
 assert.equal(instance.configOnDisk.hasValue,false);assert.equal(instance.stagingUserIdPromise.hasValue,false);
 assert.equal(instance.quitHandlerAdded,false);
}
assert.equal(calls,0);
console.log('PASS import and construction: no network, writes, identifier, installer or quit hook');
