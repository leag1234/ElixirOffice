// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const speech=require('../../desktop/speech.cjs');
function fakeConnect(upAfter){
 let calls=0;
 const written=[];
 const connect=()=>{const s=new EventEmitter();s.destroy=()=>{};s.write=x=>written.push(x);s.unref=()=>{};calls++;setImmediate(()=>s.emit(calls>upAfter?'connect':'error',new Error('refused')));return s;};
 connect.calls=()=>calls;connect.written=written;return connect;
}
test('socket path follows SPEECHD_ADDRESS, then the runtime directory',()=>{
 assert.equal(speech.socketPath({SPEECHD_ADDRESS:'unix_socket:/x/s.sock'}),'/x/s.sock');
 assert.equal(speech.socketPath({SPEECHD_ADDRESS:'inet_socket:localhost:6560'}),null);
 assert.equal(speech.socketPath({XDG_RUNTIME_DIR:'/run/user/9'}),'/run/user/9/speech-dispatcher/speechd.sock');
});
test('only Linux ever starts a daemon',async()=>{
 let spawned=0;
 for(const platform of ['darwin','win32'])assert.equal(await speech.ensureDaemon({platform,env:{XDG_RUNTIME_DIR:'/r'},spawn:()=>{spawned++;}}),false);
 assert.equal(spawned,0);
});
test('a running daemon is left alone',async()=>{
 let spawned=0;
 assert.equal(await speech.ensureDaemon({platform:'linux',env:{XDG_RUNTIME_DIR:'/r'},connect:fakeConnect(0),spawn:()=>{spawned++;}}),true);
 assert.equal(spawned,0);
});
test('the connection kept open names the app so the daemon stays up',async()=>{
 const connect=fakeConnect(0);
 await speech.ensureDaemon({platform:'linux',env:{XDG_RUNTIME_DIR:'/r'},connect,spawn:()=>{}});
 assert.deepEqual(connect.written,['SET SELF CLIENT_NAME "elixiroffice:keepalive:main"\r\n']);
});
test('a missing daemon is started detached and awaited',async()=>{
 const seen=[];
 const child=Object.assign(new EventEmitter(),{unref(){seen.push('unref');}});
 const ok=await speech.ensureDaemon({platform:'linux',env:{XDG_RUNTIME_DIR:'/r'},connect:fakeConnect(3),wait:async()=>{},
  spawn:(cmd,args,opts)=>{seen.push(cmd,args.join(' '),opts.detached,opts.stdio);return child;}});
 assert.equal(ok,true);
 assert.deepEqual(seen,['speech-dispatcher','--spawn',true,'ignore','unref']);
});
test('failures to start never throw',async()=>{
 const env={XDG_RUNTIME_DIR:'/r'};
 assert.equal(await speech.ensureDaemon({platform:'linux',env,connect:fakeConnect(1e9),wait:async()=>{},spawn:()=>{throw new Error('ENOENT');}}),false);
 const child=new EventEmitter();child.unref=()=>{};
 assert.equal(await speech.ensureDaemon({platform:'linux',env,connect:fakeConnect(1e9),wait:async()=>{},attempts:3,spawn:()=>child}),false);
 assert.equal(await speech.ensureDaemon({platform:'linux',env:{SPEECHD_ADDRESS:'inet_socket:h:1'},spawn:()=>{throw new Error('no');}}),false);
});
test('main enables speech dispatcher on Linux only and starts the daemon before ready when packaged',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../../desktop/main.cjs'),'utf8');
 assert.match(main,/process\.platform==='linux'&&require\('\.\/speech\.cjs'\)\.daemonAvailable\(\)\)\{[^}]*enable-speech-dispatcher[^}]*isPackaged\)void require\('\.\/speech\.cjs'\)\.ensureDaemon/);
});
test('the daemon counts as available when its socket exists or the executable is installed',()=>{
 const env={XDG_RUNTIME_DIR:'/run/user/9',PATH:'/opt/bin'},sock='/run/user/9/speech-dispatcher/speechd.sock';
 assert.equal(speech.daemonAvailable({env,exists:f=>f===sock,executable:()=>false}),true);
 assert.equal(speech.daemonAvailable({env,exists:()=>false,executable:f=>f==='/opt/bin/speech-dispatcher'}),true);
 assert.equal(speech.daemonAvailable({env,exists:()=>false,executable:f=>f==='/usr/bin/speech-dispatcher'}),true);
 assert.equal(speech.daemonAvailable({env,exists:()=>false,executable:f=>f==='/usr/local/bin/speech-dispatcher'}),true);
});
test('without a socket or an executable the daemon is not available, and failing checks do not escape',()=>{
 assert.equal(speech.daemonAvailable({env:{XDG_RUNTIME_DIR:'/r',PATH:'/opt/bin'},exists:()=>false,executable:()=>false}),false);
 assert.equal(speech.daemonAvailable({env:{SPEECHD_ADDRESS:'inet_socket:localhost:6560'},exists:()=>false,executable:()=>false}),false);
 assert.equal(typeof speech.daemonAvailable({env:{PATH:''}}),'boolean');
});
