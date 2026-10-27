// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launch,stop,editable,fixture,root,sleep}=require('./harness.cjs');
const rows=[];
const presets=[80,90,100,110,125,150,175,200];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function metric(page){
 return page.evaluate(()=>{
  const {api,win,controller,format}=EOLocalSession;
  const ui=win.document.querySelector('#file[role=tab]')||win.document.querySelector('#toolbar');
  const r=ui?.getBoundingClientRect(),scale=win.AscCommon.checkDeviceScale();
  const zoom=typeof api.asc_getZoom==='function'?api.asc_getZoom():api.WordControl?.m_nZoomValue;
  return {format,zoom,dirty:controller.isModified(),dpr:win.devicePixelRatio,scale:{applicationPixelRatio:scale.applicationPixelRatio,zoom:scale.zoom,correct:scale.correct},rootCssZoom:win.document.documentElement.style.zoom,ui:ui?{id:ui.id,height:r.height,width:r.width,physicalHeight:r.height*win.devicePixelRatio}:null,viewport:{width:win.innerWidth,height:win.innerHeight},parentDpr:window.devicePixelRatio};
 });
}
async function selectOptions(page,value){
 const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor|pdfeditor)\/main\//.test(f.url()));
 assert(frame);
 if(!await frame.locator('#fm-btn-settings').isVisible())await frame.locator('#file[role=tab]').click();
 await frame.locator('#fm-btn-settings').click();
 const dialog=page.locator('dialog.desktop-options[open]');await dialog.waitFor();
 const select=dialog.locator('#interface-size');
 await select.selectOption(String(value));
 assert.equal(await select.inputValue(),String(value));
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.waitFor({state:'detached'});
}
async function check(format){
 const profile='interface-'+format+'-'+Date.now(),target=await fixture('sample.'+format),before=hash(await fs.readFile(target));
 const env=await launch({file:target,profile,args:['--lang=en']});
 try{
  await editable(env);
  await env.page.evaluate(()=>{
   const {api}=EOLocalSession;
   if(typeof api.asc_setZoom==='function')api.asc_setZoom(1);
   else if(typeof api.zoom100==='function')api.zoom100();
  });
  await sleep(300);
  const initial=await metric(env.page);
  assert.equal(typeof initial.zoom,'number','Actual SDK document zoom unavailable: '+JSON.stringify(initial));
  assert(initial.ui?.height>0);
  const out={format,profile,initial,levels:[],optionsUI:false};
  for(const value of presets){
   const accepted=await env.page.evaluate(value=>eoDesktop.interfaceSizeSet(value),value);
   assert.equal(accepted.value,value);
   await env.page.waitForFunction(({value,base})=>Math.abs(window.devicePixelRatio/base-value/100)<.02,{value,base:initial.parentDpr},{timeout:1500});
   await sleep(180);
   const row=await metric(env.page);
   if(row.scale.applicationPixelRatio!==row.dpr)console.log('DPI DIAGNOSTIC',JSON.stringify(await env.page.evaluate(()=>{
    const win=EOLocalSession.win;let bridge;
    try{bridge={own:typeof win.eoDesktop?.interfaceSize,parent:typeof win.parent.eoDesktop?.interfaceSize,top:typeof win.top.eoDesktop?.interfaceSize,parentURL:win.parent.location.href,topURL:win.top.location.href}}catch(error){bridge={error:error.message}}
    return {bridge,outerBridge:typeof eoDesktop.interfaceSize,frameURL:win.location.href,source:win.AscCommon.checkDeviceScale.toString(),scripts:[...win.document.scripts].map(s=>s.src).filter(s=>/scale|sdk|api/.test(s)).slice(0,30)};
   })));
   assert.equal(row.scale.applicationPixelRatio,row.dpr,'Fractional DPR was rounded at '+format+':'+value);
   assert.equal(row.scale.correct,false);assert.equal(row.scale.zoom,1);
   assert.equal(row.zoom,initial.zoom,'SDK document zoom changed at '+format+':'+value);
   assert.equal(row.dirty,initial.dirty,'UI setting changed document dirty state');
   assert.equal(hash(await fs.readFile(target)),before);
   assert(row.ui.height>0);
   out.levels.push({value,...row});
  }
  await env.page.evaluate(()=>eoDesktop.interfaceSizeSet(100));await sleep(200);
  const at100=await metric(env.page);
  await env.page.screenshot({path:path.join(root,'results',format+'-interface-100.png')});
  await selectOptions(env.page,125);await sleep(200);
  const at125=await metric(env.page);out.optionsUI=true;
  assert.equal((await env.page.evaluate(()=>eoDesktop.interfaceSize())).value,125);
  assert.equal(at125.zoom,initial.zoom);assert.equal(at125.dirty,initial.dirty);
  assert(Math.abs(at125.dpr/at100.dpr-1.25)<.02,'Browser UI factor not125%');
  assert(Math.abs(at125.ui.physicalHeight/at100.ui.physicalHeight-1.25)<.08,'Actual UI height did not scale125%');
  await env.page.screenshot({path:path.join(root,'results',format+'-interface-125.png')});
  assert.deepEqual(env.errors,[]);out.at100=at100;out.at125=at125;out.originalUnchanged=hash(await fs.readFile(target))===before;
  rows.push(out);console.log('PASS real interface presets/Options/unchanged SDK zoom/dirty/file',format);
 }finally{await stop(env);await fs.writeFile(path.join(root,'results/interface-size-native.json'),JSON.stringify(rows,null,2));}
 const fresh=await launch({file:target,profile,args:['--lang=en']});
 try{
  await editable(fresh);
  assert.equal((await fresh.page.evaluate(()=>eoDesktop.interfaceSize())).value,125);
  const actual=await metric(fresh.page);rows.at(-1).restarted={value:125,dpr:actual.dpr,scale:actual.scale};
  assert.equal(actual.scale.applicationPixelRatio,actual.dpr);
  assert.deepEqual(fresh.errors,[]);console.log('PASS real fresh profile restart125%',format);
 }finally{await stop(fresh);await fs.writeFile(path.join(root,'results/interface-size-native.json'),JSON.stringify(rows,null,2));}
}
(async()=>{
 assert(process.env.EO_XVFB_PID,'Owned private display required');
 for(const format of ['docx','xlsx','pptx','pdf'])await check(format);
 assert.equal(rows.length,4);assert(rows.every(row=>row.levels.length===8&&row.optionsUI&&row.originalUnchanged));
 console.log('PASS32 real interface preset states,4Options actions,4fresh restarts');
})().catch(error=>{console.error(error);process.exitCode=1});
