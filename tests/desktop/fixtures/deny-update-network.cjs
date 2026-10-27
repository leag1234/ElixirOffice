// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
module.exports=function(){
 let calls=0,lockCalls=0;const deny=()=>{calls++;throw Error('Real update network/process denied');};
 for(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny;}
 const net=require('node:net');net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;
 require('node:tls').connect=deny;global.fetch=deny;
 const dns=require('node:dns');
 for(const key of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','reverse'])dns[key]=deny;
 for(const key of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','reverse'])dns.promises[key]=deny;
 const cp=require('node:child_process'),spawn=cp.spawn;
 cp.spawn=function(binary,args,options){
  const fs=require('node:fs'),fd=options?.stdio?.[3];let stat;
  try{if(Number.isSafeInteger(fd)&&fd>=0)stat=fs.fstatSync(fd);}catch{}
  if(binary!=='/usr/bin/flock'||JSON.stringify(args)!=='["--exclusive","--nonblock","3"]'||
    !options||Object.keys(options).sort().join(',')!=='env,shell,stdio'||options.shell!==false||
    JSON.stringify(options.env)!=='{"LANG":"C"}'||!Array.isArray(options.stdio)||options.stdio.length!==4||
    options.stdio.slice(0,3).some(v=>v!=='ignore')||!stat?.isFile()||stat.nlink!==1||
    stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size!==0)return deny();
  lockCalls++;return spawn.call(this,binary,args,options);
 };
 for(const key of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[key]=deny;
 const Module=require('node:module'),load=Module._load;
 Module._load=function(name,...args){if(name==='electron')return {app:{getPath:deny,getVersion:deny,whenReady:deny},net:{request:deny,fetch:deny},session:{fromPartition:deny},autoUpdater:{emit:deny},Notification:class{constructor(){deny();}}};return load.call(this,name,...args);};
 return Object.freeze({get calls(){return calls;},get lockCalls(){return lockCalls;}});
};
