// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function preload(){
 let api;const calls=[],listeners=new Map();
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../desktop/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return {webUtils:{},contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'eoDesktop');api=value}},ipcRenderer:{invoke(...args){calls.push(args);return Promise.resolve()},on(name,callback){listeners.set(name,callback)},removeListener(name,callback){assert.equal(listeners.get(name),callback);listeners.delete(name)}}}}});
 return {api,calls,listeners};
}
test('release preload exposes only named state/settings/actions, never a network or browser URL primitive',async()=>{
 const e=preload();await e.api.releaseState();await e.api.releaseOptions();await e.api.releaseSettings({enabled:false});await e.api.releaseAction('download','0.4.0','https://evil.invalid/');
 assert.deepEqual(e.calls.map(call=>Array.from(call)),[['eo:release-state'],['eo:release-options'],['eo:release-settings',{enabled:false}],['eo:release-action','download','0.4.0']]);
 assert.equal(e.api.openExternal,undefined);assert.equal(e.api.fetch,undefined);
});
test('release notifications strip Electron events and have a working unsubscribe',()=>{
 const e=preload(),values=[];const off=e.api.onReleaseNotice(value=>values.push(value)),notice={version:'0.4.0'};
 e.listeners.get('eo:release-notice')({sender:'not exposed'},notice);assert.deepEqual(values,[notice]);off();assert.equal(e.listeners.size,0);
});
test('compact preload exposes named state only and strips Electron mode events',async()=>{
 const e=preload(),values=[];
 await e.api.chromeMode();await e.api.chromeState({save:{visible:true,enabled:true,label:'Save'}});
 assert.equal(e.calls[0][0],'eo:chrome-mode');assert.equal(e.calls[1][0],'eo:chrome-state');
 const off=e.api.onChromeMode(value=>values.push(value));e.listeners.get('eo:chrome-mode')({sender:'not exposed'},{compact:true});
 assert.deepEqual(values,[{compact:true}]);off();assert.equal(e.listeners.size,0);
});

test('update install reuses fixed release IPC and never forwards renderer install paths or extra arguments',async()=>{
 const e=preload();
 await e.api.releaseSettings({enabled:true,automatic:false});
 await e.api.releaseAction('install','0.4.0',{path:'/tmp/untrusted',url:'https://evil.invalid/'});
 assert.deepEqual(e.calls.map(call=>Array.from(call)),[['eo:release-settings',{enabled:true,automatic:false}],['eo:release-action','install','0.4.0']]);
 for(const name of ['installUpdate','downloadUpdate','quitAndInstall','setFeedURL'])assert.equal(e.api[name],undefined);
});
