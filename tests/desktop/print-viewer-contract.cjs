// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Real Electron/Chromium contract check. Run on a CI-owned display, never replace
// this with a mocked frame or the compatibility fallback.
const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const Printing=require('../../desktop/printing.cjs');
const out=process.env.EO_PRINT_CONTRACT_OUT;
assert(out&&path.isAbsolute(out),'Explicit private EO_PRINT_CONTRACT_OUT required');
assert.equal(process.versions.electron,require('../../desktop/package.json').build.electronVersion,'Run the actual pinned Electron');
app.setPath('userData',path.join(out,'profile'));app.on('window-all-closed',()=>{});
let helper,timer,lastState;const blocked=new Set();
(async()=>{
 await fs.mkdir(out,{recursive:true,mode:0o700});await app.whenReady();
 const file=path.join(out,'public.pdf');await fs.writeFile(file,require('./public-print-fixture.cjs')(1),{mode:0o600,flag:'wx'});
 const url=pathToFileURL(file).href,ses=session.fromPartition('eo-print-contract-'+Date.now(),{cache:false});
 ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 ses.webRequest.onBeforeRequest((details,callback)=>{
  const allowed=details.url===url||Printing.internalUrl(details.url);
  if(!allowed){try{const target=new URL(details.url);blocked.add(target.protocol+'//'+target.host)}catch{blocked.add('unknown')}}
  callback({cancel:!allowed});
 });
 helper=new BrowserWindow({show:false,width:900,height:800,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,plugins:true,backgroundThrottling:false}});
 helper.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 const check=(async()=>{
  await helper.loadURL(url);
  for(;;){
   for(const frame of helper.webContents.mainFrame.framesInSubtree){
    if(!frame.url.startsWith(Printing.PDF_VIEWER_ORIGIN))continue;
    let state;try{state=await frame.executeJavaScript(Printing.readinessScript)}catch{continue}
    if(!state?.viewer||!state.frameLoaded)continue;
    lastState=state;
    if(state.recognized!==true)continue;
    if(Printing.ready(state))return state;
   }
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 })();
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(lastState?.viewer&&lastState.recognized!==true?'Chromium PDF private readiness fields changed: update the contract; compatibility fallback is forbidden in CI':'Real PDF viewer readiness contract deadline')),30000)});
 const state=await Promise.race([check,deadline]);clearTimeout(timer);
 assert.equal(state.recognized,true,'Real viewer readiness fields must exist');assert.equal(state.defined,true,'PDF custom element must be initialized');
 assert.equal(helper.isVisible(),false);assert.equal(state.pages,1);
 const result={pass:true,electron:process.versions.electron,chrome:process.versions.chrome,fields:state,blockedOrigins:[...blocked],realElectronViewer:true};
 await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 helper.destroy();await fs.rm(file);app.exit(0);
})().catch(async error=>{
 clearTimeout(timer);
 await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({pass:false,error:error.message,blockedOrigins:[...blocked],lastState},null,2)+'\n').catch(()=>{});
 console.error(error);if(helper&&!helper.isDestroyed())helper.destroy();app.exit(1);
});
