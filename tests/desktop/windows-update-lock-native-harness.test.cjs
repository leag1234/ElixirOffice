// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {qualification}=require('../../tests/desktop-updates/windows-update-lock-native.cjs');

class FakeChild extends EventEmitter{
 constructor(kind,events){super();this.kind=kind;this.events=events;this.stdout=kind==='holder'?new EventEmitter():null;this.exitCode=null;this.signalCode=null;
  queueMicrotask(()=>{if(kind==='probe-refused')this.finish(3,null);else if(kind==='probe-open')this.finish(0,null);else this.stdout.emit('data',Buffer.from('LOCKED\n'));});
 }
 finish(code,signal){this.exitCode=code;this.signalCode=signal;this.events.push('exit:'+this.kind);this.emit('exit',code,signal);}
 kill(signal){this.events.push('kill:'+this.kind+':'+signal);queueMicrotask(()=>this.finish(null,signal));return true;}
}

test('native qualification failure releases parent locks, stops and reaps its holder, then removes the cache',async()=>{
 const events=[],children=[];let locks=0,holderAlive=false;
 const spawnProcess=()=>{const kind=children.length===0?'probe-refused':children.length===1?'probe-open':'holder',child=new FakeChild(kind,events);children.push(child);if(kind==='holder'){holderAlive=true;child.once('exit',()=>{holderAlive=false;});}return child;};
 const createStoreFn=()=>({lock:async()=>{const id=++locks;events.push('lock:'+id);return async()=>events.push('release:'+id);}});
 const fsApi={readdir:async value=>value==='C:\\owned'?[]:['guard-v2'],rm:async()=>{events.push('rm:alive='+holderAlive);}};
 await assert.rejects(()=>qualification({platform:'win32',versions:{node:'24.22.0',uv:'1.52.1'},base:'C:\\owned',spawnProcess,createStoreFn,fsApi,pathApi:require('node:path').win32,execPath:'C:\\ElixirOffice.exe',self:'C:\\native.cjs',pid:42,stepTimeoutMs:1000,wholeTimeoutMs:5000}),/Windows lock qualification failed/);
 assert.equal(locks,2,'unexpected competing success must still be tracked');
 assert(events.includes('release:1'));assert(events.includes('release:2'));
 assert(events.includes('kill:holder:SIGKILL'));assert(events.includes('exit:holder'));
 assert(events.indexOf('release:1')<events.indexOf('kill:holder:SIGKILL'));assert(events.indexOf('release:2')<events.indexOf('kill:holder:SIGKILL'));
 assert(events.indexOf('kill:holder:SIGKILL')<events.indexOf('exit:holder'));
 assert.equal(events.at(-1),'rm:alive=false','cache removal must follow exact-child reap');
});

test('holder readiness rejects invalid data, early exit and timeout',async()=>{
 const {locked}=require('../../tests/desktop-updates/windows-update-lock-native.cjs');
 let child=new EventEmitter();child.stdout=new EventEmitter();child.exitCode=null;child.signalCode=null;
 let pending=locked(child,100);child.stdout.emit('data',Buffer.from('LOCK'));child.stdout.emit('data',Buffer.from('ED!\n'));await assert.rejects(pending,/Invalid holder readiness/);
 child=new EventEmitter();child.stdout=new EventEmitter();child.exitCode=null;child.signalCode=null;pending=locked(child,100);child.exitCode=2;child.emit('exit',2,null);await assert.rejects(pending,/before readiness/);
 child=new EventEmitter();child.stdout=new EventEmitter();child.exitCode=null;child.signalCode=null;await assert.rejects(locked(child,10),/readiness timed out/);
});

test('whole body and shared cleanup deadlines bound total wall-clock time',async()=>{
 const never=()=>new Promise(()=>{}),started=Date.now();
 await assert.rejects(()=>qualification({platform:'win32',versions:{node:'24.22.0',uv:'1.52.1'},base:'C:\\owned',fsApi:{readdir:never,rm:never},pathApi:require('node:path').win32,pid:43,stepTimeoutMs:1000,wholeTimeoutMs:20,cleanupTimeoutMs:30}),/Windows lock qualification failed/);
 const elapsed=Date.now()-started;
 assert(elapsed>=35,'both bounded phases must run');assert(elapsed<250,'total time must be body plus one shared cleanup budget');
});
