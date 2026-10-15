// SPDX-License-Identifier: AGPL-3.0-only
// Owned Mac package tests: idle gate, file-backed stdio, explicit PID/descendant cleanup.
'use strict';
const fs=require('node:fs/promises'),cp=require('node:child_process'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function idle(){
 const state=JSON.parse(cp.execFileSync("/usr/bin/python3",[process.env.EO_MAC_LOCK_GUARD||path.join(__dirname,"mac-session.py")],{encoding:"utf8"}));assert(state.valid&&state.locked===false,"Mac session must be verified unlocked");
 const text=cp.execFileSync('/usr/sbin/ioreg',['-c','IOHIDSystem'],{encoding:'utf8'});
 const match=/"HIDIdleTime"\s*=\s*(\d+)/.exec(text);assert(match,'Idle state unavailable');
 const seconds=Number(match[1])/1e9;if(seconds<=120)throw Error('Owner is active; abort GUI test');return seconds;
}
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
async function inspector(portNumber){
 let url;for(let i=0;i<120;i++){try{const result=await fetch('http://127.0.0.1:'+portNumber+'/json/list');const values=await result.json();url=values[0]?.webSocketDebuggerUrl;if(url)break;}catch{}await sleep(100);}
 assert(url,'Own main inspector unavailable');const socket=new WebSocket(url),pending=new Map();let sequence=0;
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const job=pending.get(value.id);pending.delete(value.id);clearTimeout(job.timer);if(value.error)job.reject(Error(value.error.message));else job.resolve(value.result);}});
 socket.addEventListener('close',()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Own inspector closed'));}pending.clear();});
 return {close:()=>socket.close(),async evaluate(expression){const id=++sequence;const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Own main inspection timed out'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}};
}
function rememberChildren(env){
 const rows=cp.execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,command='],{encoding:'utf8'}).split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean).map(m=>({pid:Number(m[1]),parent:Number(m[2]),group:Number(m[3]),command:m[4]}));
 for(let pass=0;pass<10;pass++)for(const row of rows)if((row.group===env.child.pid||env.known.has(row.parent))&&row.command.startsWith(env.appRoot+'/'))env.known.set(row.pid,row.command);
}
async function stop(env){
 if(!env)return;if(env.cleanup)return env.cleanup;env.cleanup=(async()=>{clearInterval(env.monitor);clearInterval(env.activity);rememberChildren(env);
 // Snapshot only numeric parent relationships, then verify every candidate's own executable.
 const rows=cp.execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean).map(m=>({pid:Number(m[1]),parent:Number(m[2]),command:m[3]}));
 const selected=rows.find(r=>r.pid===env.child.pid);
 if(selected){assert(selected.command.startsWith(env.exe+' '));assert(selected.command.includes(env.profile));}
 const owned=new Set(selected?[env.child.pid]:[]);for(const [pid,command] of env.known){const current=rows.find(row=>row.pid===pid);if(current&&current.command===command)owned.add(pid);}
 for(let pass=0;pass<10;pass++)for(const row of rows)if(owned.has(row.parent)&&row.command.startsWith(path.dirname(path.dirname(env.exe))+'/'))owned.add(row.pid);
 for(const pid of owned){const current=rows.find(r=>r.pid===pid);assert(current&&current.command.startsWith(env.appRoot+'/'));try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
 for(let i=0;i<50;i++){let live=false;for(const pid of owned){try{process.kill(pid,0);live=true;}catch(error){if(error.code!=='ESRCH')throw error;}}if(!live)break;await sleep(100);if(i===49)throw Error('Own test PIDs did not exit');}
 await env.browser?.close().catch(()=>{});env.inspector?.close();await env.out.close();await env.err.close();
 return [...owned];})();return env.cleanup;
}
async function launch(root,exe,file){
 assert(process.platform==='darwin','This runner is for owned Mac tests');root=await fs.realpath(root);exe=await fs.realpath(exe);assert(exe.startsWith(root+path.sep)&&exe.endsWith('.app/Contents/MacOS/ElixirOffice'));
 idle();const profile=path.join(root,'profiles','owned-'+Date.now());await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(root,'results'),{recursive:true});
 const nodePort=await port(),browserPort=await port(),out=await fs.open(path.join(root,'results',path.basename(profile)+'.stdout.log'),'w'),err=await fs.open(path.join(root,'results',path.basename(profile)+'.stderr.log'),'w');
 const child=cp.spawn(exe,['--inspect=127.0.0.1:'+nodePort,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+browserPort,'--user-data-dir='+profile,...(file?[file]:[])],{cwd:root,detached:true,env:{...process.env,EO_DESKTOP_PROFILE:profile},stdio:['ignore',out.fd,err.fd]});
 const env={root,exe,appRoot:exe.slice(0,exe.indexOf('.app/')+4),profile,child,out,err,known:new Map()};env.monitor=setInterval(()=>{try{rememberChildren(env);}catch{}},500);env.monitor.unref();
 try{
  env.inspector=await inspector(nodePort);
  const identity=await env.inspector.evaluate('({pid:process.pid,exe:process.execPath,profile:process.getBuiltinModule("module").createRequire('+JSON.stringify(env.appRoot+'/Contents/Resources/app.asar/main.cjs')+')("electron").app.getPath("userData"),stdoutFile:process.getBuiltinModule("fs").fstatSync(1).isFile(),stderrFile:process.getBuiltinModule("fs").fstatSync(2).isFile()})');
  assert.equal(identity.pid,child.pid);assert.equal(identity.exe,exe);assert.equal(identity.profile,profile);assert(identity.stdoutFile&&identity.stderrFile,'File-backed stdio required');
  const {chromium}=require(process.env.EO_PLAYWRIGHT);
  for(let i=0;i<120;i++){try{env.browser=await chromium.connectOverCDP('http://127.0.0.1:'+browserPort);break;}catch{}await sleep(100);}assert(env.browser,'Own window CDP unavailable');
  for(let i=0;i<120;i++){env.page=env.browser.contexts()[0]?.pages()[0];if(env.page)break;await sleep(100);}assert(env.page,'Own test window missing');idle();env.activity=setInterval(()=>{try{idle();}catch(error){env.activityFailure=error.message;stop(env).catch(()=>{});}},1000);env.activity.unref();
  return env;
 }catch(error){await stop(env);throw error;}
}
module.exports={launch,stop,idle};
