// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
function protocol(scenario){
 const child=new EventEmitter(),signals=[],arms=[];child.pid=12345;child.exitCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();
 function end(code=0){if(child.exitCode!==null)return;child.exitCode=code;child.stdout.end();child.emit('exit',code,null)}
 child.kill=signal=>{signals.push(signal);end(1);return true};
 child.stdin=new Writable({write(data,encoding,callback){
  const arm=JSON.parse(data);arms.push(arm);
  if(scenario==='pipe-error'){callback(Object.assign(Error('ARM pipe closed'),{code:'EPIPE'}));return}
  callback();queueMicrotask(()=>{
   child.stdout.write(JSON.stringify({kind:'confirmed',window:scenario==='wrong-window'?'0x9':arm.window,warning:arm.body,choice:arm[arm.choose],confirmed:true})+'\n');
   end(scenario==='nonzero-exit'?1:0);
  });
 }});
 let spawnOptions;
 const context={module:{exports:{}},__dirname,path,process:{env:{EO_NATIVE_A11Y:'/owned/a11y/identity.json'}},setTimeout,clearTimeout,
 require:name=>name==='node:child_process'?{spawn(exe,args,options){spawnOptions={exe,args,options};queueMicrotask(()=>child.stdout.write(scenario==='malformed-ready'?'not JSON\n':JSON.stringify({kind:'ready',pid:child.pid})+'\n'));return child}}:name==='./harness.cjs'?{root:'/owned'}:require(name)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'native-dialog.cjs'),'utf8'),context,{filename:'native-dialog.cjs'});
 const env={page:{evaluate:async()=>({body:'PDF warning',cancel:'Cancel',saveCopy:'Save a Copy'})},launchSpec:{environment:{DISPLAY:':321',EO_NATIVE_A11Y:'/owned/a11y/identity.json'}},nativeIdentity:{pid:456},application:{pid:456}};
 return{api:context.module.exports,env,child,signals,arms,end,get spawn(){return spawnOptions}};
}
test('native warning protocol binds exact ready ARM and confirmed receipt',async()=>{
 const p=protocol('success'),watch=await p.api.watchPdfWarning(p.env);const result=await watch.confirm('0x123');await watch.close();
 assert.equal(result.confirmed,true);assert.equal(p.arms.length,1);assert.equal(p.spawn.exe,'/usr/bin/python3');
 assert.equal(p.spawn.options.env.EO_NATIVE_PID,'456');assert.equal(p.spawn.options.env.DISPLAY,':321');assert.deepEqual(p.signals,[]);
});
test('malformed native ready rejects and reaps only its owned child',async()=>{
 const p=protocol('malformed-ready');await assert.rejects(p.api.watchPdfWarning(p.env),/JSON/);assert.deepEqual(p.signals,['SIGTERM']);assert.equal(p.child.exitCode,1);
});
test('native watcher pipe error after ready rejects and reaps instead of unhandled EPIPE',async()=>{
 const p=protocol('pipe-error'),watch=await p.api.watchPdfWarning(p.env);await assert.rejects(watch.confirm('0x123'),/ARM pipe closed/);assert.deepEqual(p.signals,['SIGTERM']);assert.equal(p.child.exitCode,1);
});
test('native watcher exit between ready and ARM rejects without further input',async()=>{
 const p=protocol('success'),watch=await p.api.watchPdfWarning(p.env);p.end(1);await assert.rejects(watch.confirm('0x123'),/exited before ARM/);assert.equal(p.arms.length,0);assert.deepEqual(p.signals,[]);
});
for(const scenario of ['wrong-window','nonzero-exit'])test('native watcher rejects '+scenario,async()=>{
 const p=protocol(scenario),watch=await p.api.watchPdfWarning(p.env);await assert.rejects(watch.confirm('0x123'));assert.equal(p.child.exitCode,scenario==='nonzero-exit'?1:0);
});
