// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
function fixture(){
 let installed=0,enabled=0,permission=true,live=true,action;
 const synced=[],scheduled=[],states=[],messages=[];
 const LF={desktopPolicy:null,hasConsent(){return !!this.consent},setConsent(v){this.consent=v},setStatus(v){states.push(v)},readList:async()=>[],register:()=>['Public Font'],guiFonts:n=>n.map(name=>({name})),enable:async()=>{enabled++}};
 const win={Common:{ElixirLocalFonts:LF},EOComputerFonts:{install(){installed++;LF.desktopPolicy={}}}};
 const api={sync_InitEditorFonts:fonts=>synced.push(fonts)},session={win,api,file:{token:'public-token'},controller:{}};
 const context={window:{EOLocalSession:session},frame:win,file:session.file,controller:session.controller,opening:false,operationBusy:false,choosingSaveAs:false,closeCheck:false,pendingRequested:false,fontRefreshRequested:false,fontRefreshRunning:false,fontRefreshNotify:false,
  eoDesktop:{fontPermission:async()=>permission,fontIndex:async()=>({system:[]}),onAction:fn=>{action=fn}},
  script:async()=>{},status:value=>messages.push(value),t:k=>k,setTimeout:fn=>scheduled.push(fn),buttons:busy=>{context.operationBusy=busy},refreshHome:async()=>{},$:()=>({hidden:true}),drainPending(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function installFonts('),source.indexOf('async function drainPending(')),context);
 vm.runInContext(source.slice(source.indexOf('eoDesktop.onAction(async '),source.indexOf("\ndocument.addEventListener('dragover'",source.indexOf('eoDesktop.onAction(async '))),context);
 return {context,session,LF,win,api,synced,scheduled,states,messages,setPermission:v=>{permission=v},setLive:v=>{live=v},isCurrent:()=>live,action:(...v)=>action(...v),counts:()=>({installed,enabled})};
}
test('ready event applies cold inventory to the active editor and its picker',async()=>{
 const f=fixture();await f.action('font-index-ready');
 assert.deepEqual(f.counts(),{installed:1,enabled:1});assert.equal(f.synced[0][0].name,'Public Font');assert.equal(f.context.operationBusy,false);
});
test('ready event is retained during opening, Save As and close checks',async()=>{
 for(const flag of ['opening','operationBusy','choosingSaveAs','closeCheck']){
  const f=fixture();f.context[flag]=true;await f.action('font-index-ready');assert.equal(f.context.fontRefreshRequested,true,flag);assert.equal(f.counts().installed,0,flag);
  f.context[flag]=false;await f.context.refreshFonts();assert.equal(f.counts().enabled,1,flag);
 }
});
test('late discovery does not enable fonts after an explicit decline',async()=>{
 const f=fixture();f.setPermission(false);await f.action('font-index-ready');assert.deepEqual(f.counts(),{installed:0,enabled:0});assert.equal(f.LF.consent,false);assert.equal(f.synced.length,0);
});
test('stale document or revoked consent during index await prevents registration',async()=>{
 for(const reason of ['closed','revoked']){
  const f=fixture();let resolve;f.context.eoDesktop.fontIndex=()=>new Promise(r=>{resolve=r});
  const pending=f.context.installFonts(f.win,true,f.isCurrent,f.api);
  while(!resolve)await new Promise(r=>setImmediate(r));
  if(reason==='closed')f.setLive(false);else f.setPermission(false);
  resolve({system:[]});assert.equal(await pending,false);assert.equal(f.counts().installed,0,reason);assert.equal(f.synced.length,0,reason);
 }
});
test('revocation while listing never publishes the late families to the picker',async()=>{
 const f=fixture();let resolve;f.LF.readList=()=>new Promise(r=>{resolve=r});
 const pending=f.context.installFonts(f.win,true,f.isCurrent,f.api);
 while(!resolve)await new Promise(r=>setImmediate(r));
 f.setPermission(false);resolve([]);
 assert.equal(await pending,false);assert.equal(f.LF.consent,false);assert.equal(f.synced.length,0);
});
test('Save and save-close both run while a slow font enable is pending',async()=>{
 const f=fixture();let release,saves=0,closes=0;
 f.LF.enable=()=>new Promise(resolve=>{release=resolve});
 Object.assign(f.context.controller,{save:async()=>{saves++},isModified:()=>false});
 Object.assign(f.context,{updateDirty:async()=>{},savingAs:false});
 Object.assign(f.context.eoDesktop,{recoveryClear:async()=>{},closeSaved:async attempt=>{assert.equal(attempt,'public-attempt');closes++;f.context.window.EOLocalSession=null},closeCancelled:async attempt=>{assert.equal(attempt,'public-attempt')}});
 vm.runInContext(source.slice(source.indexOf('async function save(as=false)'),source.indexOf('function setDocumentName(')),f.context);
 const refresh=f.action('font-index-ready');while(!release)await new Promise(resolve=>setImmediate(resolve));
 try{
  assert.equal(f.context.operationBusy,false,'A font update must not suppress user saves or AutoRecover');
  assert.equal(await f.context.save(),true);assert.equal(saves,1);
  f.context.closeCheck=true;await f.action('save-close',{attemptId:'public-attempt'});assert.equal(saves,2);assert.equal(closes,1);assert.equal(f.context.closeCheck,false);
 }finally{release();await refresh}
});
test('revocation during enable restores off and never announces available fonts',async()=>{
 const f=fixture();let release;
 f.context.fontRefreshNotify=true;f.LF.enable=()=>new Promise(resolve=>{f.LF.setConsent(true);release=resolve});
 const refresh=f.action('font-index-ready');while(!release)await new Promise(resolve=>setImmediate(resolve));
 f.setPermission(false);release();await refresh;
 assert.equal(f.LF.consent,false);assert.equal(f.states.at(-1),'off');assert(!f.messages.includes('fontUse'));
});
test('explicit consent announces availability after a queued refresh, not before',async()=>{
 const f=fixture();f.context.eoDesktop.fontConsent=async()=>true;f.context.operationBusy=true;
 vm.runInContext(source.slice(source.indexOf('async function fontConsent()'),source.indexOf('async function addFontOptions(')),f.context);
 assert.equal(await f.context.fontConsent(),true);assert(!f.messages.includes('fontUse'));
 f.context.operationBusy=false;await f.context.refreshFonts();assert.equal(f.messages.at(-1),'fontUse');
});
