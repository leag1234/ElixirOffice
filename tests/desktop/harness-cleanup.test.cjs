// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const source=path.resolve(__dirname,'harness.cjs');
function harness(platform,kills){
 const context={require:createRequire(source),module:{exports:{}},__dirname:path.dirname(source),process:{platform,env:{},kill:(pid,signal)=>kills.push({pid,signal})},setTimeout:callback=>{callback();return 0}};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),context,{filename:source});return context.module.exports;
}
for(const platform of ['darwin','linux']){
 test(platform+' cleanup never signals an already exited or signal-killed child',async()=>{
  for(const state of [{exitCode:0,signalCode:null},{exitCode:null,signalCode:'SIGKILL'}]){
   const kills=[],api=harness(platform,kills);let closed=0,logClosed=0;
   await api.stop({application:{pid:12345,...state},browser:{close:async()=>closed++},log:{close:async()=>logClosed++}});
   assert.equal(kills.length,0);assert.equal(closed,1);assert.equal(logClosed,1);
  }
 });
}
test('Linux cleanup reevaluates child death after browser.close',async()=>{
 const kills=[],api=harness('linux',kills),application={pid:12345,exitCode:null,signalCode:null};
 await api.stop({application,browser:{close:async()=>{application.signalCode='SIGTERM'}},log:{close:async()=>{}}});
 assert.equal(kills.length,0);
});
test('Linux cleanup signals the main process before considering a group fallback',async()=>{
 const kills=[],api=harness('linux',kills),application={pid:12345,exitCode:null,get signalCode(){return kills.some(entry=>entry.pid===12345)?'SIGTERM':null}};
 await api.stop({application,browser:{close:async()=>{}},log:{close:async()=>{}},disposeObservers(){}});
 assert.equal(kills.length,1);
 assert.equal(kills[0].pid,12345);
 assert.equal(kills[0].signal,'SIGTERM');
});
test('Linux cleanup uses only SIGKILL for a timed-out owned group',async()=>{
 const kills=[],api=harness('linux',kills);
 await api.stop({application:{pid:12345,exitCode:null,signalCode:null},browser:{close:async()=>{}},log:{close:async()=>{}},disposeObservers(){}});
 assert.equal(kills.length,2);
 assert.deepEqual(kills.map(entry=>entry.pid),[12345,-12345]);
 assert.deepEqual(kills.map(entry=>entry.signal),['SIGTERM','SIGKILL']);
});
test('live Mac child is signalled once by its owned group before closing browser',async()=>{
 const kills=[],api=harness('darwin',kills);
 await api.stop({application:{pid:12345,exitCode:null,signalCode:null},browser:{close:async()=>{}},log:{close:async()=>{}}});
 assert.equal(kills.length,1);assert.equal(kills[0].pid,-12345);assert.equal(kills[0].signal,'SIGKILL');
});

test('Mac harness starts an absolute own executable with an isolated profile',async()=>{
 const promises=require('node:fs/promises'),root=await promises.mkdtemp(path.join(require('node:os').tmpdir(),'eo-harness-isolation-'));
 try{
  await promises.mkdir(path.join(root,'results'));let spawned;
  const load=createRequire(source),sentinel=Error('Stop before starting any real application');
  const context={require:name=>name==='node:child_process'?{spawn:(exe,args,options)=>{spawned={exe,args,options};return{pid:12345,exitCode:0,signalCode:null}}}:name==='playwright-stub'?{chromium:{}}:load(name),
   module:{exports:{}},__dirname:path.dirname(source),process:{platform:'darwin',env:{EO_DESKTOP_ROOT:root,EO_PLAYWRIGHT:'playwright-stub'},kill(){throw Error('Exited child must never be killed')}},setTimeout};
  vm.runInNewContext(fs.readFileSync(source,'utf8'),context,{filename:source});
  await assert.rejects(context.module.exports.launch({executable:path.join(root,'Own.app/Contents/MacOS/ElixirOffice'),profile:'isolated',onSpawn(){throw sentinel}}),error=>error===sentinel);
  assert(path.isAbsolute(spawned.exe));assert.equal(spawned.options.env.EO_DESKTOP_PROFILE,path.join(root,'profiles/isolated'));
  assert(spawned.args.includes('--user-data-dir='+path.join(root,'profiles/isolated')));
 }finally{await promises.rm(root,{recursive:true,force:true})}
});
