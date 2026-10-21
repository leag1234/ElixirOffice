// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),source=fs.readFileSync(path.join(root,'desktop/renderer.js'),'utf8'),computer=fs.readFileSync(path.join(root,'desktop/computer-fonts.js'),'utf8');
function fixture(){
 const timers=new Map(),messages=[],states=[],observers=[];
 const events=target=>{const listeners=new Map();Object.assign(target,{addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)});target.emit=name=>{for(const fn of [...(listeners.get(name)||[])])fn()};target.listenerCount=()=>[...listeners.values()].reduce((n,s)=>n+s.size,0);return target};let id=0,permission=true,indexError=false,indexCalls=0,installs=0,enables=0;
 const LF={desktopPolicy:null,setConsent(v){this.consent=v},setStatus:v=>states.push(v),engineReady:()=>!!win.AscFonts.g_fontApplication,install:()=>true,readList:async()=>[],register:()=>[],enable:async()=>{enables++}};
 const win=events({Common:{ElixirLocalFonts:LF},AscFonts:{DesktopFontPolicyVersion:1},frameElement:{isConnected:true,ownerDocument:{documentElement:{}}}});
 const context={window:events({}),MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.disconnected=true}},frame:win,opening:false,operationBusy:false,choosingSaveAs:false,closeCheck:false,fontRefreshRequested:false,fontRefreshRunning:false,fontRefreshNotify:false,
  eoDesktop:{fontPermission:async()=>permission,fontIndex:async()=>{indexCalls++;if(indexError)throw Error('Synthetic native index failure');return{bundled:[],system:[]}}},
  script:async()=>{},t:k=>k,status:v=>messages.push([v,win.EOComputerFontWarning]),setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},clearTimeout:key=>timers.delete(key)};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function installFonts('),source.indexOf('async function drainPending(')),context);
 const frameContext=vm.createContext({window:win});vm.runInContext(computer,frameContext);
 const actualInstall=win.EOComputerFonts.install;
 win.EOComputerFonts.install=function(index){installs++;if(!win.AscFonts.g_fontApplication)return actualInstall(index);LF.desktopPolicy={};};
 function session(){const s={win,api:{},file:{},controller:{}};Object.assign(context,{file:s.file,controller:s.controller});context.window.EOLocalSession=s;return s}
 return{context,win,LF,timers,messages,states,session,detach:(vanished=false)=>{if(vanished)win.frameElement=null;else win.frameElement.isConnected=false;for(const o of observers)if(!o.disconnected)o.fn()},observers,ready:()=>{win.AscFonts.g_fontApplication={}},permission:v=>{permission=v},indexError:v=>{indexError=v},counts:()=>({indexCalls,installs,enables}),expire:async()=>{const deadlines=[...timers].filter(([,v])=>v.ms>0);assert.equal(deadlines.length,1);const[key,timer]=deadlines[0];timers.delete(key);await timer.fn();}};
}
test('warm inventory before SDK font application is pending without false read warning',async()=>{
 const f=fixture();f.win.EOComputerFontWarning='fontFailed';
 assert.equal(await f.context.installFonts(f.win),false);
 assert.equal(f.win.EOComputerFontWarning,null);assert.equal(f.states.at(-1),'loading');assert.equal(f.context.fontRefreshRequested,true);
 assert.equal(f.timers.size,1);assert([...f.timers.values()][0].ms<=30000);
});
test('post-open retry enables fonts and clears the stored and displayed stale warning',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();f.ready();f.win.EOComputerFontWarning='fontFailed';
 assert.equal(await f.context.refreshFonts(),true);assert.equal(f.win.EOComputerFontWarning,null);
 assert.equal(f.counts().enables,1);assert.equal(f.timers.size,0);assert(f.messages.some(([,warning])=>warning===null));
});
test('no consent makes no native request and no warning or readiness timer',async()=>{
 const f=fixture();f.permission(false);await f.context.installFonts(f.win);
 assert.equal(f.counts().indexCalls,0);assert.equal(f.win.EOComputerFontWarning,null);assert.equal(f.timers.size,0);assert.equal(f.states.at(-1),'off');
});
test('genuine native index errors when engine is ready remain visible',async()=>{
 const f=fixture();f.ready();f.indexError(true);assert.equal(await f.context.installFonts(f.win),false);
 assert.equal(f.win.EOComputerFontWarning,'fontFailed');assert.equal(f.states.at(-1),'error');assert.equal(f.timers.size,0);
});
test('engine never ready has one post-open attempt and one deadline attempt, then visible failure',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();await f.context.refreshFonts();
 for(let i=0;i<10;i++){f.context.fontRefreshRequested=true;await f.context.refreshFonts();}
 assert.equal(f.counts().installs,2,'Repeated discovery events must not poll the unready engine');
 assert.equal(f.timers.size,1);await f.expire();
 assert.equal(f.counts().installs,3);assert.equal(f.win.EOComputerFontWarning,'fontFailed');
 assert.equal(f.states.at(-1),'error');assert.equal(f.timers.size,0);assert.equal(f.context.fontRefreshRequested,false);
 for(let i=0;i<10;i++){f.context.fontRefreshRequested=true;await f.context.refreshFonts();}
 assert.equal(f.counts().installs,3,'A terminal readiness failure must not start another retry window');
 assert.equal(f.win.EOComputerFontWarning,'fontFailed');assert.equal(f.LF.consent,false);assert.equal(f.timers.size,0);
 f.ready();f.context.fontRefreshRequested=true;assert.equal(await f.context.refreshFonts(),true);assert.equal(f.win.EOComputerFontWarning,null);
});
test('engine becoming ready before the single deadline retry succeeds without polling',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();await f.context.refreshFonts();f.ready();await f.expire();
 assert.equal(f.counts().enables,1);assert.equal(f.win.EOComputerFontWarning,null);assert.equal(f.timers.size,0);
});
test('deadline respects busy save and defers to its existing completion refresh',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();await f.context.refreshFonts();f.context.operationBusy=true;await f.expire();
 assert.equal(f.context.fontRefreshRequested,true);assert.equal(f.counts().installs,2);
 f.context.operationBusy=false;await f.context.refreshFonts();assert.equal(f.win.EOComputerFontWarning,'fontFailed');
});
test('consent revoked during pending startup cancels the deadline without native calls',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();f.permission(false);await f.context.refreshFonts();
 assert.equal(f.counts().indexCalls,1);assert.equal(f.states.at(-1),'off');assert.equal(f.timers.size,0);assert.equal(f.win.EOComputerFontWarning,null);
});
test('closed or replaced document deadline cannot warn or refresh the replacement',async()=>{
 const f=fixture();await f.context.installFonts(f.win);const replacement={};f.context.frame=replacement;f.context.window.EOLocalSession={win:replacement};await f.expire();
 assert.equal(replacement.EOComputerFontWarning,undefined);assert.equal(f.context.fontRefreshRequested,true,'Only the original initial pending request remains');assert.equal(f.counts().installs,1);
});
test('separate tab document views keep their own readiness and deadline state',async()=>{
 const a=fixture(),b=fixture();
 // Exercise two real frame objects through the same production function/WeakMap,
 // stronger than the ordinary architecture's separate renderer realms per tab.
 await a.context.installFonts(a.win);await a.context.installFonts(b.win);assert.equal(a.timers.size,2);
 a.session();a.ready();await a.context.refreshFonts();assert.equal(a.counts().enables,1);assert.equal(a.timers.size,1);
 const second={win:b.win,api:{},file:{},controller:{}};
 Object.assign(a.context,{frame:b.win,file:second.file,controller:second.controller,fontRefreshRequested:true});
 a.context.window.EOLocalSession=second;await a.context.refreshFonts();await a.expire();
 assert.equal(b.win.EOComputerFontWarning,'fontFailed');assert.equal(a.win.EOComputerFontWarning,null);
});


test('later readiness notification installs immediately after the post-open attempt, before the deadline',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();await f.context.refreshFonts();
 assert.equal(f.counts().installs,2);f.ready();f.context.fontRefreshRequested=true;
 assert.equal(await f.context.refreshFonts(),true);assert.equal(f.counts().installs,3);assert.equal(f.counts().enables,1);assert.equal(f.timers.size,0);assert.equal(f.win.listenerCount(),0);assert.equal(f.context.window.listenerCount(),0);assert(f.observers.every(o=>o.disconnected));
});
test('ready notifications have a three-attempt startup budget including the deadline',async()=>{
 const f=fixture();await f.context.installFonts(f.win);f.session();await f.context.refreshFonts();f.ready();
 // Simulate a readiness edge where the adapter still cannot attach.
 f.win.EOComputerFonts.install=()=>{throw Error('Font engine is not ready')};
 let calls=0;const install=f.win.EOComputerFonts.install;f.win.EOComputerFonts.install=(...args)=>{calls++;return install(...args)};
 for(let i=0;i<10;i++){f.context.fontRefreshRequested=true;await f.context.refreshFonts();}
 assert.equal(calls,1,'Only one attempt remains after initial and post-open');
 assert.equal(f.win.EOComputerFontWarning,null);await f.expire();
 assert.equal(calls,1,'Exhausted budget reports failure at the deadline without a fourth attempt');
 assert.equal(f.win.EOComputerFontWarning,'fontFailed');assert.equal(f.timers.size,0);
});
for(const signal of ['frame-pagehide','view-pagehide','frame-unload','view-unload','detached','detached-null'])test('pending state releases its timer and listeners on '+signal,async()=>{
 const f=fixture();await f.context.installFonts(f.win);assert.equal(f.timers.size,1);
 assert.equal(f.context.installFonts.pendingByView.has(f.win),true);
 if(signal.startsWith('detached'))f.detach(signal==='detached-null');
 else (signal.startsWith('frame-')?f.win:f.context.window).emit(signal.endsWith('pagehide')?'pagehide':'unload');
 assert.equal(f.timers.size,0);assert.equal(f.context.installFonts.pendingByView.has(f.win),false);
 assert.equal(f.win.listenerCount(),0);assert.equal(f.context.window.listenerCount(),0);
 assert(f.observers.every(o=>o.disconnected));
});
