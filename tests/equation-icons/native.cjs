// SPDX-License-Identifier: AGPL-3.0-only
// Source-module overlay against real bundled editor/SDK; not a rebuilt-package gate.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {_electron}=require(process.env.EO_PLAYWRIGHT),root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK;
const web=path.resolve(process.env.EO_WEBAPPS),moduleFile=path.join(web,'apps/common/main/lib/component/Button.js');
const rows=[],errors=[],origin='eoapp://desktop.elixiroffice.invalid';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const source=await fs.readFile(moduleFile,'utf8'),sha256=crypto.createHash('sha256').update(source).digest('hex');
 for(const [theme,scale] of [['theme-white',1],['theme-dark',1],['theme-white',1.5],['theme-dark',1.5]]){
  let app,page;
  console.log('START',theme,scale);
  const name=theme+'-'+String(scale).replace('.','_'),profile=path.join(out,'profile-'+name);
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'desktop-settings.json'),JSON.stringify({recents:[],fontConsent:false,fontChoice:'declined'}));
  try{
   app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(root,'desktop/main.cjs'),'--ozone-platform=x11','--force-device-scale-factor='+scale],env:{...process.env,EO_DESKTOP_PROFILE:profile},timeout:30000});
   assert(!app.process().spawnargs.includes('--no-sandbox'));
   const context=app.context(),observe=p=>p.on('pageerror',e=>errors.push({profile:name,message:e.message}));context.pages().forEach(observe);context.on('page',observe);
   for(let n=0;n<100&&!page;n++){page=context.pages().find(p=>p.url()===origin+'/index.html');if(!page)await sleep(100);}
   assert(page);await page.waitForFunction(()=>window.EODesktopReady);
   await page.evaluate(theme=>localStorage.setItem('ui-theme-id',theme),theme);
   await page.locator('[data-new=docx]').click();await page.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
   // Execute exact candidate module in the real iframe realm with its already loaded AMD dependencies.
   await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html'));w.show();w.focus();});
   await page.waitForFunction(()=>EOLocalSession.win.Common.Controllers.LaunchController.isScriptLoaded());
   console.log('READY',name);
   await page.evaluate(source=>{const w=EOLocalSession.win;w.Function('Common','define',source)(w.Common,(_dependencies,run)=>run());EOLocalSession.api.asc_enableKeyEvents(true);w.document.getElementById('area_id')?.focus();EOLocalSession.api.WordControl.m_oLogicDocument.MoveCursorToStartPos();EOLocalSession.api.asc_AddMath(0x01000000);},source);
   console.log('INSERTED',name);
   const frame=page.frames().find(f=>/documenteditor/.test(f.url()));assert(frame);
   await frame.locator('#equation-container').waitFor({state:'visible',timeout:30000});
   const observed=await frame.evaluate(()=>{
    const root=document.getElementById('equation-container');
    return {theme:window.uitheme.id,dpr:devicePixelRatio,buttons:root.querySelectorAll('button').length,icons:[...root.querySelectorAll('button svg use')].map(use=>{const svg=use.closest('svg'),id=use.getAttribute('href'),r=svg.getBoundingClientRect(),style=getComputedStyle(svg);return {id,symbol:!!document.querySelector(id),width:r.width,height:r.height,color:style.color,fill:style.fill,visible:style.visibility};}),empty:root.querySelectorAll('i.icon.svgicon').length};
   });
   assert.equal(observed.theme,theme);assert(Math.abs(observed.dpr-scale)<0.01);
   assert.equal(observed.buttons,13);assert.equal(observed.empty,0);assert.equal(observed.icons.filter(i=>i.id.startsWith('#svg-icon-')).length,12);
   for(const icon of observed.icons){assert(icon.symbol);assert(icon.width>0&&icon.height>0);assert.notEqual(icon.visible,'hidden');}
   await frame.locator('#equation-container').screenshot({path:path.join(out,name+'-popup.png')});
   await page.evaluate(()=>{const api=EOLocalSession.api,original=api.asc_AddMath;window.PublicMathCalls=[];api.asc_AddMath=function(value){PublicMathCalls.push(value);return original.apply(this,arguments)};window.PublicRestoreMath=()=>{api.asc_AddMath=original;};});
   await frame.locator('#equation-container button').nth(1).click();
   const choices=frame.locator('.dropdown-menu:visible .equation-icon');await choices.first().waitFor({state:'visible'});assert.equal(await choices.count(),9);
   await page.screenshot({path:path.join(out,name+'-fraction-menu.png')});
   await choices.first().click();await page.waitForFunction(()=>window.PublicMathCalls?.length===1);
   const selected=await page.evaluate(()=>{const value=PublicMathCalls.slice();PublicRestoreMath();return value;});assert.equal(typeof selected[0],'number');
   assert.deepEqual(errors,[]);
   rows.push({theme,scale,pass:true,...observed,fractionChoices:9,actualSdkCalls:selected.length});
   console.log('PASS '+name+' 12categorySVG + settingsSVG,9fraction choices,actual SDK insertion');
  }catch(error){
   console.error('PROFILE FAILED',name,error.message);
   if(page&&!page.isClosed()){
    await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});
    const state=await page.evaluate(()=>{const w=window.EOLocalSession?.win,holder=w?.DE?.getController('DocumentHolder');return {ready:window.EODesktopReady===true,session:!!window.EOLocalSession,failure:window.EOLocalFailure||null,popup:!!w?.document.getElementById('equation-container'),scripts:w?.Common.Controllers.LaunchController.isScriptLoaded(),mainReady:w?.DE?.getController('Main')._isDocReady,mathBounds:holder?.lastMathTrackBounds||null,trackOnLoad:holder?.showMathTrackOnLoad===true,hideTrack:w?.Common.Utils.InternalSettings.get('de-equation-toolbar-hide')===true,dirty:window.EOLocalSession?.controller.isModified()===true};}).catch(e=>({diagnosticError:e.message}));
    await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify(state,null,2));
   }
   throw error;
  }finally{
   // Own synthetic test documents are disposable; never wait on their native unsaved sheet.
   if(app){await app.evaluate(({app})=>app.exit(0)).catch(error=>{if(!/closed|Target/.test(error.message))throw error;});await app.close();}
  }
 }
 await fs.writeFile(path.join(out,'equation-results.json'),JSON.stringify({scope:'exact candidate Button.js source injected in real editor realm; pinned existing SDK/assets; not rebuilt-package/native-platform acceptance',moduleSha256:sha256,rows,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
