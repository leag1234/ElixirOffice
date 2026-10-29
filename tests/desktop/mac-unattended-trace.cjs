// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Optional private fixture diagnostics. Never record document content or argv.
const fs=require('node:fs');
function createTrace(file=process.env.EO_MAC_UNATTENDED_TRACE){
 if(!file)return Object.freeze({phase(){},close(){}});
 if(!require('node:path').isAbsolute(file))throw Error('Trace requires an absolute private output path');
 const fd=fs.openSync(file,'wx',0o600);let closed=false;
 function write(event){
  if(closed)return;
  const memory=process.memoryUsage(),cpu=process.cpuUsage();
  fs.writeSync(fd,JSON.stringify({epochMs:Date.now(),pid:process.pid,ppid:process.ppid,
   event,rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,externalBytes:memory.external,
   arrayBufferBytes:memory.arrayBuffers,cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system})+'\n');
 }
 const tick=setInterval(()=>write('heartbeat'),1000);tick.unref();
 function close(){if(closed)return;clearInterval(tick);write('trace-close');closed=true;fs.closeSync(fd);}
 process.once('exit',close);
 write('trace-open');
 return Object.freeze({phase(name){
  if(typeof name!=='string'||!/^[a-z0-9-]{1,64}$/.test(name))throw Error('Invalid trace phase');
  write(name);
 },close});
}
module.exports={createTrace};
