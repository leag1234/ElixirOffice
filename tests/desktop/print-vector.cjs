// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Native UI is driven separately on an explicitly owned test display. This
// observes the packaged app; it never replaces webContents.print or its callback.
const {launch,stop,editable,sleep}=require('./harness.cjs');
const cp=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{fileURLToPath}=require('node:url');
function visibleWindows(pid){
 assert.equal(process.platform,'linux','This native window-map assertion requires Linux');
 assert(process.env.EO_XVFB_PID&&process.env.EO_DESKTOP_DISPLAY,'Explicit private display required');
 const env={...process.env,DISPLAY:process.env.EO_DESKTOP_DISPLAY};
 const tree=cp.execFileSync('xwininfo',['-root','-tree'],{env,encoding:'utf8'});
 const windows=[];
 for(const id of new Set(tree.match(/0x[0-9a-f]+/g)||[])){
  if(parseInt(id,16)<=1)continue;
  try{
   const props=cp.execFileSync('xprop',['-id',id,'_NET_WM_PID','_NET_WM_WINDOW_TYPE'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   if(!new RegExp('_NET_WM_PID[^\\n]*= '+pid+'(?:\\n|$)').test(props))continue;
   const info=cp.execFileSync('xwininfo',['-id',id],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   if(/Map State: IsViewable/.test(info))windows.push({id,dialog:props.includes('_NET_WM_WINDOW_TYPE_DIALOG')});
  }catch(error){if(!String(error.stderr||error.message).includes('BadWindow'))throw error;}
 }
 return windows;
}
(async()=>{
 const out=path.resolve(process.env.EO_PRINT_OUTPUT||'');
 assert(process.env.EO_PRINT_OUTPUT&&process.env.EO_PRINT_FIXTURE&&process.env.EO_PACKAGE_EXECUTABLE,'Explicit package, public fixture and output required');
 await fs.mkdir(out,{recursive:true});
 const env=await launch({file:process.env.EO_PRINT_FIXTURE,profile:process.env.EO_PRINT_PROFILE||'vector-'+Date.now()});
 try{
  await editable(env);
  const before=visibleWindows(env.application.pid);assert(before.length>0,'Main native window must be mapped');
  await require('./file-action.cjs')(env.page,'print');
  let helper,file;
  for(let attempt=0;attempt<1800;attempt++){
   helper=env.browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().startsWith('file:')&&page.url().includes('/print-jobs/job-'));
   if(helper){file=fileURLToPath(helper.url());break;}
   assert.equal(env.application.exitCode,null,'Main app exited before print helper');
   assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
   await sleep(100);
  }
  assert(file,'Private PDF print helper not found');
  // Chromium document.visibilityState can be visible with backgroundThrottling
  // disabled even when the BrowserWindow is hidden. Verify actual native maps.
  const visible=visibleWindows(env.application.pid);
  assert.deepEqual(visible.filter(window=>!window.dialog&&!before.some(old=>old.id===window.id)),[],'No auxiliary PDF window may be displayed');
  assert(path.resolve(file).startsWith(path.join(env.directory,'print-jobs')+path.sep),'Unexpected print job path');
  await fs.copyFile(file,path.join(out,'source.pdf'));
  await fs.writeFile(path.join(out,'native-call-ready.json'),JSON.stringify({pid:env.application.pid})+'\n');
  await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:180000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
  const result=await env.page.evaluate(()=>window.EOLastPdf);
  const canceled=process.env.EO_PRINT_CANCEL==='1';
  assert.equal(result.printed,!canceled);
  if(canceled)assert.equal(result.reason,'cancelled');
  assert.equal(result.stats.backend,path.extname(process.env.EO_PRINT_FIXTURE).toLowerCase()==='.pdf'?'original-append':'wasm');
  assert.equal(env.application.exitCode,null,'Application exited after native printing');
  assert(!env.page.isClosed(),'Main window closed after native printing');
  assert.deepEqual(await fs.readdir(path.join(env.directory,'print-jobs')),[]);
  assert.deepEqual(env.errors,[]);
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({printed:result.printed,reason:result.reason,helperVisible:false,mainAliveBeforeCleanup:true,jobsAfterCleanup:[],actualPackagedApp:true,stats:result.stats},null,2)+'\n');
  console.log('PASS packaged native vector print',JSON.stringify(result));
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
